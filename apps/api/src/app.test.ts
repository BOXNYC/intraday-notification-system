import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import request from 'supertest'
import { parseQueueEvents } from '@assembled/types'
import { createApp } from './app.js'
import { createContext } from './lib/context.js'
import { loadQueueEvents, loadQueueEventsSorted } from './lib/eventSource.js'

// Run against a copy of the seeded rules in a temp directory, so mutating
// tests never touch the committed data folder.
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'api-test-'))
fs.copyFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'rules.seed.json'),
  path.join(DATA_DIR, 'rules.seed.json'),
)

const app = createApp(createContext(DATA_DIR))

afterAll(() => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true })
})

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      status: 'ok',
      service: 'intraday-notification-system',
    })
  })
})

describe('GET /api/users', () => {
  it('returns one user per audience', async () => {
    const res = await request(app).get('/api/users')
    expect(res.status).toBe(200)
    expect(res.body.users.map((u: { role: string }) => u.role).sort()).toEqual([
      'agent',
      'head_of_support',
      'team_lead',
    ])
  })
})

describe('POST /api/notifications', () => {
  it('returns 400 when user_uuid is missing', async () => {
    const res = await request(app).post('/api/notifications').send({})
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'user_uuid is required' })
  })

  it('returns notifications addressed to the requesting user', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .send({ user_uuid: 'u_lead_billing' })
    expect(res.status).toBe(200)
    expect(res.body.notifications.length).toBeGreaterThan(0)
    for (const n of res.body.notifications) {
      expect(n.user_uuid).toBe('u_lead_billing')
      expect(n.body).toBeTruthy()
    }
  })

  it('gives an agent only their own notifications', async () => {
    const res = await request(app).post('/api/notifications').send({ user_uuid: 'u_agent_a19' })
    expect(res.status).toBe(200)
    for (const n of res.body.notifications) {
      expect(n.subject.agent_id).toBe('a_19')
    }
  })

  it('gives a head of support only critical notifications', async () => {
    const res = await request(app).post('/api/notifications').send({ user_uuid: 'u_head_support' })
    expect(res.status).toBe(200)
    expect(res.body.notifications.length).toBeGreaterThan(0)
    for (const n of res.body.notifications) {
      expect(n.severity).toBe('critical')
    }
  })
})

describe('GET /api/rules', () => {
  it('returns 400 without a user_uuid', async () => {
    expect((await request(app).get('/api/rules')).status).toBe(400)
  })

  it('returns only the requested user rules', async () => {
    const res = await request(app).get('/api/rules').query({ user_uuid: 'u_lead_billing' })
    expect(res.status).toBe(200)
    expect(res.body.rules.length).toBeGreaterThan(0)
    for (const rule of res.body.rules) {
      expect(rule.owner_user_uuid).toBe('u_lead_billing')
    }
  })
})

describe('rules CRUD', () => {
  it('creates, toggles, and deletes a rule', async () => {
    const created = await request(app).post('/api/rules').send({
      name: 'Temporary test rule',
      owner_user_uuid: 'u_lead_billing',
      enabled: true,
      event_type: 'queue_snapshot',
      conditions: [{ field: 'tickets_waiting', op: 'gt', value: 999 }],
      sustained_for_sec: null,
      scope: { queue_ids: null, agent_ids: null },
      severity: 'info',
      cooldown_sec: 0,
    })
    expect(created.status).toBe(201)
    const ruleId = created.body.rule.rule_id

    const patched = await request(app).patch(`/api/rules/${ruleId}`).send({ enabled: false })
    expect(patched.status).toBe(200)
    expect(patched.body.rule.enabled).toBe(false)

    expect((await request(app).delete(`/api/rules/${ruleId}`)).status).toBe(204)
    expect((await request(app).delete(`/api/rules/${ruleId}`)).status).toBe(404)
  })

  it('rejects an invalid rule with 400', async () => {
    const res = await request(app).post('/api/rules').send({ name: 'no other fields' })
    expect(res.status).toBe(400)
    expect(res.body.issues.length).toBeGreaterThan(0)
  })
})

describe('loadQueueEvents', () => {
  it('loads the feed regardless of the process working directory', () => {
    const original = process.cwd()
    try {
      process.chdir('/')
      const { events, rejected } = loadQueueEvents()
      expect(events.length).toBeGreaterThan(0)
      expect(rejected).toHaveLength(0)
    } finally {
      process.chdir(original)
    }
  })

  it('sorts the feed by event time, which the fixture is not', () => {
    const unsorted = loadQueueEvents().events.map((e) => e.ts)
    const sorted = loadQueueEventsSorted().events.map((e) => e.ts)
    expect(unsorted).not.toEqual(sorted)
    expect(sorted).toEqual([...sorted].sort())
  })
})

describe('parseQueueEvents', () => {
  const validLine = JSON.stringify({
    event_id: 'evt_test_1',
    ts: '2026-05-26T14:03:14Z',
    type: 'agent_state_change',
    agent_id: 'a_42',
    queue_ids: ['billing'],
    previous_state: 'on_call',
    previous_state_duration_sec: 2700,
    new_state: 'on_break',
  })

  it('parses valid lines into typed events', () => {
    const { events, rejected } = parseQueueEvents([validLine])
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('agent_state_change')
    expect(rejected).toHaveLength(0)
  })

  it('narrows to the concrete subtype when switching on type', () => {
    const snapshotLine = JSON.stringify({
      event_id: 'evt_test_3',
      ts: '2026-05-26T14:03:12Z',
      type: 'queue_snapshot',
      queue_id: 'billing',
      tickets_waiting: 23,
      longest_wait_sec: 480,
      sla_target_sec: 120,
      agents_available: 4,
      agents_on_call: 12,
      volume_last_15m: 78,
      volume_forecast_next_15m: 50,
    })
    const { events } = parseQueueEvents([snapshotLine])
    const event = events[0]
    // Reading a subtype-only field after narrowing must compile, not just pass.
    if (event.type !== 'queue_snapshot') throw new Error('expected a snapshot')
    expect(event.queue_id).toBe('billing')
    expect(event.tickets_waiting).toBe(23)
  })

  it('rejects timestamps that are not ISO 8601', () => {
    const badTs = JSON.stringify({
      event_id: 'evt_test_4',
      ts: '26/05/2026 14:03',
      type: 'agent_state_change',
      agent_id: 'a_42',
      queue_ids: ['billing'],
      previous_state: 'on_call',
      previous_state_duration_sec: 2700,
      new_state: 'on_break',
    })
    const { events, rejected } = parseQueueEvents([badTs])
    expect(events).toHaveLength(0)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].error).toContain('ts')
  })

  it('skips and reports invalid lines without dropping valid ones', () => {
    const notJson = 'not json at all'
    const wrongShape = JSON.stringify({
      event_id: 'evt_test_2',
      ts: '2026-05-26T14:03:12Z',
      type: 'queue_snapshot',
      queue_id: 'billing',
      // missing the numeric snapshot fields
    })
    const { events, rejected } = parseQueueEvents([notJson, validLine, wrongShape])
    expect(events).toHaveLength(1)
    expect(events[0].event_id).toBe('evt_test_1')
    expect(rejected).toHaveLength(2)
    expect(rejected[0].line).toBe(notJson)
    expect(rejected[1].error).toContain('tickets_waiting')
  })
})
