import { useEffect, useState } from 'react'
import type { Notification, Severity, User } from '@assembled/types'
import { fetchNotifications } from '../api'

const SEVERITY_STYLES: Record<Severity, string> = {
  info: 'bg-slate-100 text-slate-700 ring-slate-200',
  warning: 'bg-amber-100 text-amber-800 ring-amber-200',
  critical: 'bg-red-100 text-red-800 ring-red-200',
}

const FILTERS: (Severity | 'all')[] = ['all', 'critical', 'warning', 'info']

function formatHeld(sec: number): string {
  if (sec < 60) return `${sec}s`
  const minutes = Math.round(sec / 60)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatTime(iso: string): string {
  return iso.slice(11, 16)
}

export function NotificationsPage({ user }: { user: User }) {
  const [notifications, setNotifications] = useState<Notification[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Severity | 'all'>('all')

  useEffect(() => {
    let cancelled = false
    setNotifications(null)
    setError(null)
    fetchNotifications(user.user_uuid)
      .then((n) => !cancelled && setNotifications(n))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [user.user_uuid])

  if (error) {
    return <p className="text-sm text-red-600">Could not load notifications: {error}</p>
  }
  if (notifications === null) {
    return <p className="text-sm text-slate-500">Loading notifications…</p>
  }

  const visible = filter === 'all' ? notifications : notifications.filter((n) => n.severity === filter)

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Notifications</h2>
          <p className="text-sm text-slate-500">
            What fired today for {user.name}, and why.
          </p>
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium text-slate-700">Nothing has fired.</p>
          <p className="mt-1 text-sm text-slate-500">
            {notifications.length === 0
              ? "None of this user's enabled rules matched today's events. Try the Rules page to add or adjust one."
              : `No ${filter} notifications — ${notifications.length} at other severities.`}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((n) => (
            <li key={n.notification_id} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ring-1 ${SEVERITY_STYLES[n.severity]}`}
                >
                  {n.severity}
                </span>
                <h3 className="font-medium text-slate-900">{n.title}</h3>
                <span className="ml-auto text-xs tabular-nums text-slate-400">{formatTime(n.created_at)}</span>
              </div>

              <p className="mt-2 text-sm text-slate-700">{n.body}</p>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
                <div>
                  <dt className="font-medium text-slate-600">Subject</dt>
                  <dd>{n.subject.queue_id ?? n.subject.agent_id}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-600">Since</dt>
                  <dd>{formatTime(n.episode_started_at)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-600">Held for</dt>
                  <dd>{formatHeld(n.held_for_sec)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-600">Event</dt>
                  <dd className="truncate" title={n.triggering_event_id}>
                    {n.triggering_event_id}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
