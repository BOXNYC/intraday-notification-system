import { z } from 'zod'
import type {
  AdherenceCheck,
  AgentStateChange,
  AnyQueueEvent,
  DraftRule,
  Notification,
  QueueSnapshot,
  Rule,
  RuleCondition,
  RuleScope,
  User,
} from './index.js'

// ISO 8601 with a `Z` or numeric offset, e.g. 2026-05-26T14:03:12Z.
const timestamp = z.iso.datetime({ offset: true })

// `satisfies z.ZodType<...>` makes tsc fail if a schema drifts from its interface.
export const snapshotSchema = z.object({
  event_id: z.string(),
  ts: timestamp,
  type: z.literal('queue_snapshot'),
  queue_id: z.enum(['billing', 'tier_2', 'vip']),
  tickets_waiting: z.number(),
  longest_wait_sec: z.number(),
  sla_target_sec: z.number(),
  agents_available: z.number(),
  agents_on_call: z.number(),
  volume_last_15m: z.number(),
  volume_forecast_next_15m: z.number().nullable(),
}) satisfies z.ZodType<QueueSnapshot>

export const agentStateChangeSchema = z.object({
  event_id: z.string(),
  ts: timestamp,
  type: z.literal('agent_state_change'),
  agent_id: z.string(),
  queue_ids: z.array(z.enum(['billing', 'tier_2', 'vip'])).nullable(),
  previous_state: z.string().nullable(),
  previous_state_duration_sec: z.number().nullable(),
  new_state: z.string(),
}) satisfies z.ZodType<AgentStateChange>

export const adherenceCheckSchema = z.object({
  event_id: z.string(),
  ts: timestamp,
  type: z.literal('adherence_check'),
  agent_id: z.string(),
  queue_ids: z.array(z.enum(['billing', 'tier_2', 'vip'])).nullable(),
  scheduled_state: z.string(),
  actual_state: z.string(),
  in_violation: z.boolean(),
  violation_started_at: timestamp.nullish(),
}) satisfies z.ZodType<AdherenceCheck>

export const queueEventSchema = z.discriminatedUnion('type', [
  snapshotSchema,
  agentStateChangeSchema,
  adherenceCheckSchema,
])

export interface RejectedLine {
  line: string
  error: string
}

export interface ParseQueueEventsResult {
  events: AnyQueueEvent[]
  rejected: RejectedLine[]
}

/**
 * Parse JSONL lines into validated queue events. Invalid lines are skipped
 * and reported in `rejected` rather than failing the whole batch.
 */
export function parseQueueEvents(lines: string[]): ParseQueueEventsResult {
  const events: AnyQueueEvent[] = []
  const rejected: RejectedLine[] = []

  for (const line of lines) {
    let json: unknown
    try {
      json = JSON.parse(line)
    } catch (err) {
      rejected.push({ line, error: err instanceof Error ? err.message : String(err) })
      continue
    }

    const result = queueEventSchema.safeParse(json)
    if (result.success) {
      events.push(result.data)
    } else {
      rejected.push({ line, error: z.prettifyError(result.error) })
    }
  }

  return { events, rejected }
}

// ---------------------------------------------------------------------------
// Rule schemas
// ---------------------------------------------------------------------------

const queueId = z.enum(['billing', 'tier_2', 'vip'])
const severity = z.enum(['info', 'warning', 'critical'])
const eventType = z.enum(['queue_snapshot', 'agent_state_change', 'adherence_check'])

export const ruleConditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']),
  value: z.union([z.string(), z.number(), z.boolean()]),
}) satisfies z.ZodType<RuleCondition>

export const ruleScopeSchema = z.object({
  queue_ids: z.array(queueId).nullable(),
  agent_ids: z.array(z.string()).nullable(),
}) satisfies z.ZodType<RuleScope>

/** Everything but the server-assigned id — this is what clients POST. */
export const draftRuleSchema = z.object({
  name: z.string().min(1),
  owner_user_uuid: z.string().min(1),
  enabled: z.boolean(),
  event_type: eventType,
  conditions: z.array(ruleConditionSchema).min(1),
  sustained_for_sec: z.number().int().nonnegative().nullable(),
  scope: ruleScopeSchema,
  severity,
  cooldown_sec: z.number().int().nonnegative(),
}) satisfies z.ZodType<DraftRule>

export const ruleSchema = draftRuleSchema.extend({
  rule_id: z.string().min(1),
}) satisfies z.ZodType<Rule>

export const userSchema = z.object({
  user_uuid: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(['agent', 'team_lead', 'head_of_support']),
  agent_id: z.string().nullable(),
  queue_ids: z.array(queueId),
  team_agent_ids: z.array(z.string()),
}) satisfies z.ZodType<User>

export const notificationSchema = z.object({
  notification_id: z.string(),
  rule_id: z.string(),
  rule_name: z.string(),
  user_uuid: z.string(),
  severity,
  title: z.string(),
  body: z.string(),
  subject: z.object({
    queue_id: queueId.optional(),
    agent_id: z.string().optional(),
  }),
  triggering_event_id: z.string(),
  dedupe_key: z.string(),
  episode_started_at: timestamp,
  held_for_sec: z.number(),
  created_at: timestamp,
}) satisfies z.ZodType<Notification>

/**
 * Fields a rule may test, per event type. The rule builder drives its field
 * list from this so the UI cannot offer a field the engine will not read.
 */
export const RULE_FIELDS: Record<string, { field: string; kind: 'number' | 'string' | 'boolean' }[]> = {
  queue_snapshot: [
    { field: 'tickets_waiting', kind: 'number' },
    { field: 'longest_wait_sec', kind: 'number' },
    { field: 'sla_target_sec', kind: 'number' },
    { field: 'agents_available', kind: 'number' },
    { field: 'agents_on_call', kind: 'number' },
    { field: 'volume_last_15m', kind: 'number' },
    { field: 'volume_forecast_next_15m', kind: 'number' },
    { field: 'queue_id', kind: 'string' },
  ],
  agent_state_change: [
    { field: 'new_state', kind: 'string' },
    { field: 'previous_state', kind: 'string' },
    { field: 'previous_state_duration_sec', kind: 'number' },
    { field: 'agent_id', kind: 'string' },
  ],
  adherence_check: [
    { field: 'in_violation', kind: 'boolean' },
    { field: 'scheduled_state', kind: 'string' },
    { field: 'actual_state', kind: 'string' },
    { field: 'agent_id', kind: 'string' },
  ],
}
