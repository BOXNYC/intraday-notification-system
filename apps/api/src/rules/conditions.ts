import type { AnyQueueEvent, ComparisonOp, RuleCondition, RuleScope } from '@assembled/types'

/**
 * Read a field off an event by name. Rules address fields as strings, so this
 * is the one place the model is indexed dynamically; `RULE_FIELDS` in
 * @assembled/types is the allow-list the UI builds from.
 */
export function readField(event: AnyQueueEvent, field: string): unknown {
  return (event as unknown as Record<string, unknown>)[field]
}

export function compare(actual: unknown, op: ComparisonOp, expected: RuleCondition['value']): boolean {
  switch (op) {
    case 'eq':
      return actual === expected
    case 'neq':
      return actual !== expected
    default: {
      // Ordered comparisons are only meaningful between numbers. A null field
      // (an absent forecast, an agent's first transition) is not a breach.
      if (typeof actual !== 'number' || typeof expected !== 'number') return false
      if (op === 'gt') return actual > expected
      if (op === 'gte') return actual >= expected
      if (op === 'lt') return actual < expected
      return actual <= expected
    }
  }
}

/** Every condition must hold (AND). An empty list never matches. */
export function conditionsHold(event: AnyQueueEvent, conditions: RuleCondition[]): boolean {
  if (conditions.length === 0) return false
  return conditions.every((c) => compare(readField(event, c.field), c.op, c.value))
}

const OP_LABEL: Record<ComparisonOp, string> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  eq: 'is',
  neq: 'is not',
}

/**
 * Explain a match in terms a human can check: the actual value alongside what
 * the rule asked for. This is what makes the /notifications page answer
 * "why did this fire?" rather than just "something fired".
 */
export function describeConditions(event: AnyQueueEvent, conditions: RuleCondition[]): string {
  return conditions
    .map((c) => `${c.field} is ${JSON.stringify(readField(event, c.field))} (rule: ${c.field} ${OP_LABEL[c.op]} ${JSON.stringify(c.value)})`)
    .join(' and ')
}

/** Queues an event relates to — one for a snapshot, zero or more for agent events. */
export function eventQueues(event: AnyQueueEvent) {
  return event.type === 'queue_snapshot' ? [event.queue_id] : (event.queue_ids ?? [])
}

export function inScope(event: AnyQueueEvent, scope: RuleScope): boolean {
  if (scope.queue_ids !== null) {
    if (!eventQueues(event).some((q) => scope.queue_ids!.includes(q))) return false
  }
  if (scope.agent_ids !== null) {
    if (event.type === 'queue_snapshot') return false
    if (!scope.agent_ids.includes(event.agent_id)) return false
  }
  return true
}
