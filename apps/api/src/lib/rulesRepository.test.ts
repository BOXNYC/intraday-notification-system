import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Rule } from '@assembled/types'
import { createRulesRepository } from './rulesRepository.js'

function seedRule(overrides: Partial<Rule> = {}): Rule {
  return {
    rule_id: 'r_seeded', name: 'Seeded rule', owner_user_uuid: 'u_lead', enabled: true,
    event_type: 'queue_snapshot', conditions: [{ field: 'tickets_waiting', op: 'gt', value: 20 }],
    sustained_for_sec: null, scope: { queue_ids: null, agent_ids: null },
    severity: 'warning', cooldown_sec: 0,
    ...overrides,
  }
}

// Never write into the committed data/ directory.
let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-repo-'))
  fs.writeFileSync(path.join(dir, 'rules.seed.json'), JSON.stringify([seedRule()]))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

it('falls back to the seed when rules.json is absent', () => {
  // The first-run state of a fresh clone: gitignored live file does not exist.
  expect(fs.existsSync(path.join(dir, 'rules.json'))).toBe(false)
  const repo = createRulesRepository(dir)
  expect(repo.list()).toHaveLength(1)
  expect(repo.list()[0].rule_id).toBe('r_seeded')
})

it('persists a created rule across a reload', () => {
  const repo = createRulesRepository(dir)
  repo.create(seedRule({ rule_id: 'r_new', name: 'Added later' }))

  const reloaded = createRulesRepository(dir)
  expect(reloaded.list().map((r) => r.rule_id)).toEqual(['r_seeded', 'r_new'])
})

it('persists updates and deletions', () => {
  const repo = createRulesRepository(dir)
  repo.update('r_seeded', { enabled: false })
  expect(createRulesRepository(dir).get('r_seeded')?.enabled).toBe(false)

  expect(repo.remove('r_seeded')).toBe(true)
  expect(createRulesRepository(dir).list()).toHaveLength(0)
})

it('returns false when removing a rule that does not exist', () => {
  expect(createRulesRepository(dir).remove('r_missing')).toBe(false)
})

it('skips malformed rules instead of failing the whole file', () => {
  fs.writeFileSync(
    path.join(dir, 'rules.json'),
    JSON.stringify([seedRule(), { rule_id: 'r_broken', name: 'missing everything else' }]),
  )
  const original = console.error
  console.error = () => {}
  try {
    const repo = createRulesRepository(dir)
    expect(repo.list()).toHaveLength(1)
  } finally {
    console.error = original
  }
})

it('scopes listByUser to the owner', () => {
  const repo = createRulesRepository(dir)
  repo.create(seedRule({ rule_id: 'r_other', owner_user_uuid: 'u_someone_else' }))
  expect(repo.listByUser('u_lead').map((r) => r.rule_id)).toEqual(['r_seeded'])
})
