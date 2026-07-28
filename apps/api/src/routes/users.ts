import { Router } from 'express'
import { listUsers } from '../lib/users.js'

const router = Router()

/**
 * GET /users
 * The demo users behind the web app's user picker. Authentication is out of
 * scope — this stands in for it so the audience differences are visible.
 */
router.get('/', (_req, res) => {
  res.json({ users: listUsers() })
})

export default router
