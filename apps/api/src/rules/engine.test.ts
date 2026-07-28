import type { AnyQueueEvent, Rule, User } from '@assembled/types'
import { createRuleEngine } from './engine.js'

// --- fixtures ---------------------------------------------------------------

const AGENT: User = {
  user_uuid: 'u_agent', name: 'Agent', role: 'agent',
  agent_id: 'a_19', queue_ids: ['billing'], team_agent_ids: [],
}
const LEAD: User = {
  user_uuid: 'u_lead', name: 'Lead', role: 'team_lead',
  agent_id: null, queue_ids: ['billing'], team_agent_ids: ['a_19', 'a_07'],
}
const HEAD: User = {
  user_uuid: 'u_head', name: 'Head', role: 'head_of_support',
  agent_id: null, queue_ids: ['billing'], team_agent_ids: [],
}
const USERS = [AGENT, LEAD, HEAD]

function rule(overrides: Partial<Rule>): Rule {
  return {
    rule_id: 'r_test', name: 'Test rule', owner_user_uuid: 'u_lead', enabled: true,
    event_type: 'queue_snapshot', conditions: [{ field: 'tickets_waiting', op: 'gt', value: 20 }],
    sustained_for_sec: null, scope: { queue_ids: null, agent_ids: null },
    severity: 'warning', cooldown_sec: 0,
    ...overrides,
  }
}

function snapshot(ts: string, ticketsWaiting: number, longestWaitSec = 0): AnyQueueEvent {
  return {
    event_id: `evt_${ts}`, ts, type: 'queue_snapshot', queue_id: 'billing',
    tickets_waiting: ticketsWaiting, longest_wait_sec: longestWaitSec, sla_target_sec: 120,
    agents_available: 1, agents_on_call: 1, volume_last_15m: 10, volume_forecast_next_15m: 10,
  }
}

function adherence(ts: string, inViolation: boolean, violationStartedAt: string | null = null, agentId = 'a_19'): AnyQueueEvent {
  return {
    event_id: `evt_${ts}_${agentId}`, ts, type: 'adherence_check', agent_id: agentId,
    queue_ids: ['billing'], scheduled_state: 'available', actual_state: inViolation ? 'on_break' : 'available',
    in_violation: inViolation, violation_started_at: violationStartedAt,
  }
}

function stateChange(ts: string, newState: string, agentId = 'a_19'): AnyQueueEvent {
  return {
    event_id: `evt_${ts}_${agentId}`, ts, type: 'agent_state_change', agent_id: agentId,
    queue_ids: ['billing'], previous_state: 'available', previous_state_duration_sec: 60,
    new_state: newState,
  }
}

function replay(rules: Rule[], events: AnyQueueEvent[]) {
  const engine = createRuleEngine(rules, USERS)
  return events.flatMap((e) => engine.process(e))
}

// --- the three acceptance rules --------------------------------------------

describe('acceptance rule: queue threshold', () => {
  const r = rule({ scope: { queue_ids: ['billing'], agent_ids: null } })

  it('fires as soon as the threshold is crossed', () => {
    const out = replay([r], [snapshot('2026-05-26T09:00:00Z', 21)])
    expect(out).toHaveLength(1)
    expect(out[0].subject.queue_id).toBe('billing')
    expect(out[0].body).toContain('tickets_waiting is 21')
  })

  it('does not fire below the threshold', () => {
    expect(replay([r], [snapshot('2026-05-26T09:00:00Z', 20)])).toHaveLength(0)
  })
})

describe('acceptance rule: out of adherence for more than 10 minutes', () => {
  const r = rule({
    rule_id: 'r_adherence', owner_user_uuid: 'u_agent', event_type: 'adherence_check',
    conditions: [{ field: 'in_violation', op: 'eq', value: true }],
    sustained_for_sec: 600, scope: { queue_ids: null, agent_ids: ['a_19'] },
  })

  it('does not fire before the sustained window elapses', () => {
    const out = replay([r], [
      adherence('2026-05-26T09:00:00Z', true, '2026-05-26T09:00:00Z'),
      adherence('2026-05-26T09:05:00Z', true, '2026-05-26T09:00:00Z'),
    ])
    expect(out).toHaveLength(0)
  })

  it('fires once the violation has held for ten minutes', () => {
    const out = replay([r], [
      adherence('2026-05-26T09:00:00Z', true, '2026-05-26T09:00:00Z'),
      adherence('2026-05-26T09:10:00Z', true, '2026-05-26T09:00:00Z'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].held_for_sec).toBe(600)
  })

  it('dates the episode from violation_started_at, not from first observation', () => {
    // Joining mid-violation: the feed says it started at 09:00, we first see it at 09:08.
    const out = replay([r], [adherence('2026-05-26T09:08:00Z', true, '2026-05-26T09:00:00Z')])
    expect(out).toHaveLength(0) // 8 minutes in, not yet 10

    const later = replay([r], [
      adherence('2026-05-26T09:08:00Z', true, '2026-05-26T09:00:00Z'),
      adherence('2026-05-26T09:11:00Z', true, '2026-05-26T09:00:00Z'),
    ])
    expect(later).toHaveLength(1)
    expect(later[0].episode_started_at).toBe('2026-05-26T09:00:00Z')
  })

  it('falls back to observation time when violation_started_at is null', () => {
    // The feed contains in_violation: true with a null start time.
    const out = replay([r], [
      adherence('2026-05-26T09:00:00Z', true, null),
      adherence('2026-05-26T09:10:00Z', true, null),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].episode_started_at).toBe('2026-05-26T09:00:00Z')
  })
})

describe('acceptance rule: on a single call for over 45 minutes', () => {
  const r = rule({
    rule_id: 'r_long_call', event_type: 'agent_state_change',
    conditions: [{ field: 'new_state', op: 'eq', value: 'on_call' }],
    sustained_for_sec: 2700, scope: { queue_ids: null, agent_ids: ['a_19'] },
  })

  it('matures on an unrelated event, since the agent emits none while stuck', () => {
    const out = replay([r], [
      stateChange('2026-05-26T09:00:00Z', 'on_call'),
      // No further events about a_19 — the clock only advances via other events.
      snapshot('2026-05-26T09:30:00Z', 0),
      snapshot('2026-05-26T09:46:00Z', 0),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].subject.agent_id).toBe('a_19')
    expect(out[0].held_for_sec).toBe(2760)
  })

  it('does not fire if the agent leaves the call first', () => {
    const out = replay([r], [
      stateChange('2026-05-26T09:00:00Z', 'on_call'),
      stateChange('2026-05-26T09:30:00Z', 'available'),
      snapshot('2026-05-26T09:46:00Z', 0),
    ])
    expect(out).toHaveLength(0)
  })
})

// --- noise control ----------------------------------------------------------

describe('noise control', () => {
  it('collapses a burst within one episode into a single notification', () => {
    const r = rule({ cooldown_sec: 3600 })
    const out = replay([r], [
      snapshot('2026-05-26T09:00:00Z', 25),
      snapshot('2026-05-26T09:01:00Z', 26),
      snapshot('2026-05-26T09:02:00Z', 27),
    ])
    expect(out).toHaveLength(1)
  })

  it('re-notifies after the cooldown elapses, keeping one dedupe key', () => {
    const r = rule({ cooldown_sec: 600 })
    const out = replay([r], [
      snapshot('2026-05-26T09:00:00Z', 25),
      snapshot('2026-05-26T09:05:00Z', 26),
      snapshot('2026-05-26T09:11:00Z', 27),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].dedupe_key).toBe(out[1].dedupe_key)
  })

  it('starts a new episode after the condition clears', () => {
    const r = rule({ cooldown_sec: 3600 })
    const out = replay([r], [
      snapshot('2026-05-26T09:00:00Z', 25),
      snapshot('2026-05-26T09:05:00Z', 3), // recovered
      snapshot('2026-05-26T09:10:00Z', 25), // breached again
    ])
    expect(out).toHaveLength(2)
    expect(out[0].dedupe_key).not.toBe(out[1].dedupe_key)
  })
})

// --- audience scoping -------------------------------------------------------

describe('audience scoping', () => {
  it('does not send one agent a notification about another agent', () => {
    const r = rule({
      owner_user_uuid: 'u_agent', event_type: 'adherence_check',
      conditions: [{ field: 'in_violation', op: 'eq', value: true }],
      scope: { queue_ids: null, agent_ids: null }, // deliberately unscoped
    })
    const out = replay([r], [adherence('2026-05-26T09:00:00Z', true, null, 'a_07')])
    expect(out).toHaveLength(0)
  })

  it('withholds sub-critical notifications from a head of support', () => {
    const warning = rule({ rule_id: 'r_warn', owner_user_uuid: 'u_head', severity: 'warning' })
    expect(replay([warning], [snapshot('2026-05-26T09:00:00Z', 25)])).toHaveLength(0)

    const critical = rule({ rule_id: 'r_crit', owner_user_uuid: 'u_head', severity: 'critical' })
    expect(replay([critical], [snapshot('2026-05-26T09:00:00Z', 25)])).toHaveLength(1)
  })

  it('ignores disabled rules', () => {
    expect(replay([rule({ enabled: false })], [snapshot('2026-05-26T09:00:00Z', 25)])).toHaveLength(0)
  })
})

// --- clock discipline -------------------------------------------------------

describe('clock discipline', () => {
  it('uses event time, so the same feed always produces the same output', () => {
    const r = rule({ sustained_for_sec: 600, cooldown_sec: 0 })
    const events = [
      snapshot('2026-05-26T09:00:00Z', 25),
      snapshot('2026-05-26T09:10:00Z', 25),
    ]
    const first = replay([r], events)
    const second = replay([r], events)
    expect(first).toEqual(second)
    expect(first[0].created_at).toBe('2026-05-26T09:10:00Z')
  })
})
