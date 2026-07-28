import type { Notification } from '@assembled/types'

/**
 * Where delivered notifications land.
 *
 * Deliberately in-memory: notifications are *derived* data. Replaying a fixed
 * feed through a fixed rule set is deterministic, so recomputing after a
 * restart loses nothing. Rules, which a user authored and nothing can
 * recompute, are file-backed instead — see rulesRepository.ts.
 *
 * A real datastore attaches here without touching any caller.
 */
export interface DeliveryStore {
  record(notification: Notification): void
  getDelivered(userUuid: string): Notification[]
  wasDelivered(deliveryKey: string): boolean
  clear(): void
}

/** Stable per firing, so re-running the same feed does not re-deliver. */
export function deliveryKeyOf(notification: Notification): string {
  return `${notification.dedupe_key}@${notification.created_at}`
}

export function createDeliveryStore(): DeliveryStore {
  const byUser = new Map<string, Notification[]>()
  const seen = new Set<string>()

  return {
    record(notification) {
      seen.add(deliveryKeyOf(notification))
      const list = byUser.get(notification.user_uuid) ?? []
      list.push(notification)
      byUser.set(notification.user_uuid, list)
    },
    getDelivered(userUuid) {
      return byUser.get(userUuid) ?? []
    },
    wasDelivered(deliveryKey) {
      return seen.has(deliveryKey)
    },
    clear() {
      byUser.clear()
      seen.clear()
    },
  }
}
