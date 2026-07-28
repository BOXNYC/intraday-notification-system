import type { Notification, User } from '@assembled/types'
import type { DeliveryStore } from './deliveryStore.js'

/**
 * Where a notification is delivered. Real Slack/email/push transports are out
 * of scope; this is the seam one would attach to, and the inbox stub below is
 * what makes notifications visible on the /notifications page.
 */
export interface DeliveryChannel {
  readonly name: string
  send(notification: Notification, user: User): void
}

export function createInboxChannel(store: DeliveryStore): DeliveryChannel {
  return {
    name: 'inbox',
    send(notification) {
      store.record(notification)
    },
  }
}

export function dispatch(
  notification: Notification,
  user: User,
  channels: DeliveryChannel[],
): void {
  for (const channel of channels) {
    channel.send(notification, user)
  }
}
