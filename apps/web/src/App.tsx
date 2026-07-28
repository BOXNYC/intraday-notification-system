import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import type { User } from '@assembled/types'
import { fetchUsers } from './api'
import { NotificationsPage } from './pages/NotificationsPage'
import { RulesPage } from './pages/RulesPage'

const ROLE_LABEL: Record<User['role'], string> = {
  agent: 'Agent',
  team_lead: 'Team lead',
  head_of_support: 'Head of support',
}

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
  }`
}

function App() {
  const [users, setUsers] = useState<User[]>([])
  const [selected, setSelected] = useState<string>('')

  useEffect(() => {
    fetchUsers()
      .then((list) => {
        setUsers(list)
        setSelected((current) => current || list[0]?.user_uuid || '')
      })
      .catch(() => setUsers([]))
  }, [])

  const user = users.find((u) => u.user_uuid === selected)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-6 py-4">
          <h1 className="text-lg font-bold text-slate-900">Intraday Notification System</h1>

          <nav className="flex gap-1">
            <NavLink to="/notifications" className={navClass}>Notifications</NavLink>
            <NavLink to="/rules" className={navClass}>Rules</NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* Authentication is out of scope — this picker stands in for it,
                and shows how one feed produces different notifications per audience. */}
            <label className="text-xs text-slate-500" htmlFor="user-picker">Viewing as</label>
            <select
              id="user-picker"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {users.map((u) => (
                <option key={u.user_uuid} value={u.user_uuid}>
                  {u.name} — {ROLE_LABEL[u.role]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {!user ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to="/notifications" replace />} />
            <Route path="/notifications" element={<NotificationsPage user={user} />} />
            <Route path="/rules" element={<RulesPage user={user} />} />
          </Routes>
        )}
      </main>
    </div>
  )
}

export default App
