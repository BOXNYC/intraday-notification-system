import { Router } from 'express'
import { draftRuleSchema, ruleSchema, type Rule } from '@assembled/types'
import type { AppContext } from '../lib/context.js'

function newRuleId(): string {
  return `r_${Math.random().toString(36).slice(2, 10)}`
}

export function createRulesRouter(ctx: AppContext) {
  const router = Router()

  // GET /rules?user_uuid=…
  router.get('/', (req, res) => {
    const userUuid = req.query.user_uuid
    if (typeof userUuid !== 'string' || userUuid.length === 0) {
      res.status(400).json({ error: 'user_uuid is required' })
      return
    }
    res.json({ rules: ctx.rules.listByUser(userUuid) })
  })

  // POST /rules — create
  router.post('/', (req, res) => {
    const parsed = draftRuleSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid rule', issues: parsed.error.issues })
      return
    }
    const rule: Rule = { ...parsed.data, rule_id: newRuleId() }
    res.status(201).json({ rule: ctx.rules.create(rule) })
  })

  // PATCH /rules/:rule_id
  router.patch('/:rule_id', (req, res) => {
    const patch = ruleSchema.partial().safeParse(req.body)
    if (!patch.success) {
      res.status(400).json({ error: 'Invalid rule patch', issues: patch.error.issues })
      return
    }
    const updated = ctx.rules.update(req.params.rule_id, patch.data)
    if (!updated) {
      res.status(404).json({ error: 'Rule not found' })
      return
    }
    res.json({ rule: updated })
  })

  // DELETE /rules/:rule_id
  router.delete('/:rule_id', (req, res) => {
    if (!ctx.rules.remove(req.params.rule_id)) {
      res.status(404).json({ error: 'Rule not found' })
      return
    }
    res.status(204).end()
  })

  return router
}
