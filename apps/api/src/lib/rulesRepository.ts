import fs from 'node:fs'
import path from 'node:path'
import { ruleSchema, type Rule } from '@assembled/types'
import { APP_ROOT } from './eventSource.js'

export interface RulesRepository {
  list(): Rule[]
  listByUser(userUuid: string): Rule[]
  get(ruleId: string): Rule | undefined
  create(rule: Rule): Rule
  update(ruleId: string, patch: Partial<Rule>): Rule | undefined
  remove(ruleId: string): boolean
}

const SEED_FILE = 'rules.seed.json'
const LIVE_FILE = 'rules.json'

/**
 * Rules are *authored* data — a user typed them and nothing can recompute
 * them — so unlike notifications they are persisted. A JSON file is enough:
 * it survives the restarts `tsx watch` triggers on every save, needs no
 * install or permissions setup, and sits behind this interface so a real
 * datastore is a one-module swap.
 *
 * `rules.seed.json` is committed so a fresh clone is demonstrable.
 * `rules.json` is gitignored and written on the first mutation, so a
 * reviewer's edits never dirty the working tree.
 */
export function createRulesRepository(dataDir = path.join(APP_ROOT, 'data')): RulesRepository {
  const livePath = path.join(dataDir, LIVE_FILE)
  const seedPath = path.join(dataDir, SEED_FILE)

  function readFile(file: string): Rule[] | null {
    try {
      // Read at runtime rather than importing: an imported JSON file joins the
      // module graph tsx watches, so writing rules would restart the server.
      const raw = fs.readFileSync(file, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return null
      // Skip-and-report, consistent with the event feed: one malformed rule
      // must not take down rule evaluation for everyone.
      const rules: Rule[] = []
      for (const entry of parsed) {
        const result = ruleSchema.safeParse(entry)
        if (result.success) rules.push(result.data)
        else console.error(`Skipping invalid rule in ${path.basename(file)}:`, result.error.issues)
      }
      return rules
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  // A missing live file is the normal first-run state, not an error.
  let rules: Rule[] = readFile(livePath) ?? readFile(seedPath) ?? []

  function persist() {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(livePath, `${JSON.stringify(rules, null, 2)}\n`, 'utf-8')
  }

  return {
    list: () => rules,
    listByUser: (userUuid) => rules.filter((r) => r.owner_user_uuid === userUuid),
    get: (ruleId) => rules.find((r) => r.rule_id === ruleId),
    create(rule) {
      rules = [...rules, rule]
      persist()
      return rule
    },
    update(ruleId, patch) {
      const index = rules.findIndex((r) => r.rule_id === ruleId)
      if (index === -1) return undefined
      const updated: Rule = { ...rules[index], ...patch, rule_id: ruleId }
      rules = rules.map((r, i) => (i === index ? updated : r))
      persist()
      return updated
    },
    remove(ruleId) {
      const before = rules.length
      rules = rules.filter((r) => r.rule_id !== ruleId)
      if (rules.length === before) return false
      persist()
      return true
    },
  }
}
