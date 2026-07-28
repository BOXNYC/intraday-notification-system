import type { AnyQueueEvent, Notification, Rule, User } from '@assembled/types'
import { conditionsHold, describeConditions, inScope } from './conditions.js'
import { EpisodeStore, subjectKey, subjectLabel, subjectOf, type Episode } from './episodes.js'

export interface RuleEngine {
  /** Feed events in ascending `ts` order. Returns notifications from this event. */
  process(event: AnyQueueEvent): Notification[]
}

/**
 * Whether a notification should reach the rule's owner at all.
 *
 * This is where the audience decision is enforced rather than assumed:
 * agents only ever hear about themselves, and heads of support only hear
 * about things that are genuinely on fire.
 */
export function deliverableTo(rule: Rule, owner: User, subjectAgentId?: string): boolean {
  if (owner.role === 'head_of_support' && rule.severity !== 'critical') return false
  if (owner.role === 'agent' && subjectAgentId !== owner.agent_id) return false
  return true
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`
  const minutes = Math.floor(sec / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function createRuleEngine(rules: Rule[], users: User[]): RuleEngine {
  const active = rules.filter((r) => r.enabled)
  const ruleById = new Map(active.map((r) => [r.rule_id, r]))
  const userByUuid = new Map(users.map((u) => [u.user_uuid, u]))
  const episodes = new EpisodeStore()
  let sequence = 0

  function build(rule: Rule, episode: Episode, event: AnyQueueEvent, nowMs: number): Notification | null {
    const owner = userByUuid.get(rule.owner_user_uuid)
    if (!owner) return null
    if (!deliverableTo(rule, owner, episode.subject.agent_id)) return null

    const heldForSec = Math.max(0, (nowMs - episode.started_at_ms) / 1000)
    const dedupeKey = `${rule.rule_id}:${episode.subject_key}:${episode.started_at}`
    const reason = describeConditions(episode.last_event, rule.conditions)
    const heldClause =
      rule.sustained_for_sec === null ? '' : ` Held for ${formatDuration(heldForSec)}.`

    return {
      notification_id: `${dedupeKey}:${event.ts}:${sequence++}`,
      rule_id: rule.rule_id,
      rule_name: rule.name,
      user_uuid: owner.user_uuid,
      severity: rule.severity,
      title: rule.name,
      body: `${subjectLabel(episode.subject)} — ${reason}.${heldClause}`,
      subject: episode.subject,
      triggering_event_id: event.event_id,
      dedupe_key: dedupeKey,
      episode_started_at: episode.started_at,
      held_for_sec: Math.round(heldForSec),
      created_at: event.ts,
    }
  }

  return {
    process(event: AnyQueueEvent): Notification[] {
      // Event time is the only clock. Wall-clock time would make replays,
      // tests, and a live stream behave differently.
      const nowMs = Date.parse(event.ts)
      const produced: Notification[] = []
      const sKey = subjectKey(subjectOf(event))

      // 1. Open, refresh, or close episodes for rules this event speaks to.
      for (const rule of active) {
        if (rule.event_type !== event.type) continue
        if (!inScope(event, rule.scope)) continue
        if (conditionsHold(event, rule.conditions)) {
          episodes.touch(rule.rule_id, event)
        } else {
          episodes.close(rule.rule_id, sKey)
        }
      }

      // 2. Maturity sweep over every open episode, not just this event's
      //    subject. An agent stuck on one call emits no further events, so
      //    the 45-minute threshold can only be noticed on someone else's.
      for (const episode of episodes.all()) {
        const rule = ruleById.get(episode.rule_id)
        if (!rule) continue

        const requiredMs = (rule.sustained_for_sec ?? 0) * 1000
        if (nowMs - episode.started_at_ms < requiredMs) continue

        if (
          episode.last_notified_ms !== null &&
          nowMs - episode.last_notified_ms < rule.cooldown_sec * 1000
        ) {
          continue
        }

        const notification = build(rule, episode, event, nowMs)
        if (notification) {
          produced.push(notification)
          episode.last_notified_ms = nowMs
        }
      }

      return produced
    },
  }
}
