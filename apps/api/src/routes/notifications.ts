import { Router } from 'express'
import type { AppContext } from '../lib/context.js'
import { loadQueueEventsSorted } from '../lib/eventSource.js'
import { notificationsForUser, runAndDeliver } from '../lib/notifications.js'
import { listUsers } from '../lib/users.js'

export function createNotificationsRouter(ctx: AppContext) {
  const router = Router()

  /**
   * POST /notifications
   * Requires a user_uuid in the JSON body; replays the event feed through
   * that user's enabled rules and returns the notifications they should see.
   */
  router.post('/', (req, res) => {
    const userUuid = req.body?.user_uuid
    if (typeof userUuid !== 'string' || userUuid.length === 0) {
      res.status(400).json({ error: 'user_uuid is required' })
      return
    }

    const { events, rejected } = loadQueueEventsSorted()
    if (rejected.length > 0) {
      console.error(`Skipped ${rejected.length} invalid queue event line(s):`, rejected)
    }

    const produced = runAndDeliver(events, ctx.rules.list(), listUsers(), ctx.store, ctx.channels)

    res.json({ notifications: notificationsForUser(userUuid, produced) })
  })

  return router
}
