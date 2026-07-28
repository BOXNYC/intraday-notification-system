import type { AnyQueueEvent, Notification, Rule, User } from '@assembled/types'
import { createRuleEngine } from '../rules/index.js'
import { deliveryKeyOf, type DeliveryStore } from './deliveryStore.js'
import { dispatch, type DeliveryChannel } from './channels.js'

/**
 * The api's entry point into the rules domain.
 *
 * Replays events through the engine in order and returns every notification
 * produced. Events must already be sorted by `ts` — see `loadQueueEventsSorted`.
 */
export function runRules(events: AnyQueueEvent[], rules: Rule[], users: User[]): Notification[] {
  const engine = createRuleEngine(rules, users)
  const produced: Notification[] = []
  for (const event of events) {
    produced.push(...engine.process(event))
  }
  return produced
}

/**
 * Run the rules and push the results through the delivery channels, skipping
 * anything already delivered so re-running the same feed is idempotent (the
 * console does not re-print on every page load).
 */
export function runAndDeliver(
  events: AnyQueueEvent[],
  rules: Rule[],
  users: User[],
  store: DeliveryStore,
  channels: DeliveryChannel[],
): Notification[] {
  const userByUuid = new Map(users.map((u) => [u.user_uuid, u]))
  const produced = runRules(events, rules, users)

  for (const notification of produced) {
    if (store.wasDelivered(deliveryKeyOf(notification))) continue
    const user = userByUuid.get(notification.user_uuid)
    if (!user) continue
    dispatch(notification, user, channels)
  }

  return produced
}

/** Notifications for one user, newest first. */
export function notificationsForUser(
  userUuid: string,
  all: Notification[],
): Notification[] {
  return all
    .filter((n) => n.user_uuid === userUuid)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}
