import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import { createContext, type AppContext } from './lib/context.js'
import { createNotificationsRouter } from './routes/notifications.js'
import { createRulesRouter } from './routes/rules.js'
import usersRouter from './routes/users.js'

export function createApp(ctx: AppContext = createContext()) {
  const app = express()

  app.use(cors())
  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'intraday-notification-system' })
  })

  app.use('/api/users', usersRouter)
  app.use('/api/rules', createRulesRouter(ctx))
  app.use('/api/notifications', createNotificationsRouter(ctx))

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
