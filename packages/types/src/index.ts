export * from './schemas.js'

/**
 * Fields common to every event. This is the shared base, not a carrier type —
 * to hold a parsed event, use `AnyQueueEvent` so `switch (event.type)` narrows
 * to the concrete subtype.
 */
export interface QueueEvent {
  event_id: string
  ts: string
  type: 'queue_snapshot' | 'agent_state_change' | 'adherence_check'
}

export type QueueId = 'billing' | 'tier_2' | 'vip'

// Queue snapshot — emitted ~every 30 seconds, per queue
export interface QueueSnapshot extends QueueEvent {
  type: 'queue_snapshot'
  queue_id: QueueId
  tickets_waiting: number
  longest_wait_sec: number
  sla_target_sec: number
  agents_available: number
  agents_on_call: number
  volume_last_15m: number
  /** null when no forecast is available for the window. */
  volume_forecast_next_15m: number | null
}

// Agent state change — emitted on transition
export interface AgentStateChange extends QueueEvent {
  type: 'agent_state_change'
  agent_id: string
  /** null when the agent is not assigned to any queue. */
  queue_ids: QueueId[] | null
  /** Both are null on the agent's first observed transition of the day. */
  previous_state: string | null
  previous_state_duration_sec: number | null
  new_state: string
}

// Adherence check — emitted ~every 60 seconds, per agent
export interface AdherenceCheck extends QueueEvent {
  type: 'adherence_check'
  agent_id: string
  queue_ids: QueueId[] | null
  scheduled_state: string
  actual_state: string
  in_violation: boolean
  /**
   * null when there is no active violation. Note the feed also contains
   * in_violation: true with a null start time, so this cannot be relied on
   * as a proxy for in_violation.
   */
  violation_started_at?: string | null
}

/** A parsed event of any kind. Discriminates on `type`. */
export type AnyQueueEvent = QueueSnapshot | AgentStateChange | AdherenceCheck

export type QueueEventType = QueueEvent['type']

// ---------------------------------------------------------------------------
// Rules — the user-configurable half of the system
// ---------------------------------------------------------------------------

export type Severity = 'info' | 'warning' | 'critical'
export type UserRole = 'agent' | 'team_lead' | 'head_of_support'
export type ComparisonOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'

/** A single field test against an event. */
export interface RuleCondition {
  field: string
  op: ComparisonOp
  value: string | number | boolean
}

/** Which subjects a rule watches. null means "any". */
export interface RuleScope {
  queue_ids: QueueId[] | null
  agent_ids: string[] | null
}

export interface Rule {
  rule_id: string
  name: string
  owner_user_uuid: string
  enabled: boolean
  /** Which event type this rule evaluates. */
  event_type: QueueEventType
  /** ALL conditions must hold (AND). A rule needing OR is two rules. */
  conditions: RuleCondition[]
  /**
   * The conditions must hold continuously for this many seconds before the
   * rule fires. null fires immediately on the first matching event.
   */
  sustained_for_sec: number | null
  scope: RuleScope
  severity: Severity
  /** Minimum gap between repeat notifications within one episode. */
  cooldown_sec: number
}

/** A rule before the server assigns it an id — the shape clients POST. */
export type DraftRule = Omit<Rule, 'rule_id'>

export interface User {
  user_uuid: string
  name: string
  role: UserRole
  /** For role 'agent': links the user to their agent_id in the feed. */
  agent_id: string | null
  /** Queues this user is responsible for. */
  queue_ids: QueueId[]
  /** For role 'team_lead': the agents they manage. */
  team_agent_ids: string[]
}

/** What a notification is about. Drives grouping in the UI. */
export interface NotificationSubject {
  queue_id?: QueueId
  agent_id?: string
}

export interface Notification {
  notification_id: string
  rule_id: string
  rule_name: string
  user_uuid: string
  severity: Severity
  title: string
  /** Human-readable explanation of why this fired, including actual values. */
  body: string
  subject: NotificationSubject
  triggering_event_id: string
  /** Stable across repeats of the same ongoing episode. */
  dedupe_key: string
  /** When the underlying condition first became true. */
  episode_started_at: string
  /** How long the condition had held when this fired. */
  held_for_sec: number
  /** Event time, not wall-clock time, so replays are deterministic. */
  created_at: string
}
