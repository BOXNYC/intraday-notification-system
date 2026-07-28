import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

const USER = {
  user_uuid: 'u_lead_billing',
  name: 'Dana Okafor',
  role: 'team_lead',
  agent_id: null,
  queue_ids: ['billing'],
  team_agent_ids: ['a_19'],
}

const NOTIFICATION = {
  notification_id: 'n_1',
  rule_id: 'r_billing_backlog',
  rule_name: 'Billing queue has more than 20 tickets waiting',
  user_uuid: 'u_lead_billing',
  severity: 'warning',
  title: 'Billing queue has more than 20 tickets waiting',
  body: 'billing queue — tickets_waiting is 22 (rule: tickets_waiting > 20).',
  subject: { queue_id: 'billing' },
  triggering_event_id: 'evt_01HXYZ049',
  dedupe_key: 'r_billing_backlog:billing:2026-05-26T09:36:00Z',
  episode_started_at: '2026-05-26T09:36:00Z',
  held_for_sec: 0,
  created_at: '2026-05-26T09:36:00Z',
}

beforeEach(() => {
  globalThis.fetch = jest.fn().mockImplementation((url: string) => {
    const body = String(url).includes('/api/users')
      ? { users: [USER] }
      : { notifications: [NOTIFICATION] }
    return Promise.resolve({ ok: true, json: async () => body })
  }) as unknown as typeof fetch
})

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/notifications']}>
      <App />
    </MemoryRouter>,
  )
}

test('renders the heading', async () => {
  renderApp()
  expect(
    screen.getByRole('heading', { name: 'Intraday Notification System' }),
  ).toBeInTheDocument()
  // Let the user/notification fetches settle so React state updates stay inside the test.
  await screen.findByText(/tickets_waiting is 22/)
})

test('shows a notification with the reason it fired', async () => {
  renderApp()
  // The body explains *why* it fired, not just that it did.
  expect(await screen.findByText(/tickets_waiting is 22/)).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: /Billing queue has more than 20 tickets waiting/ }),
  ).toBeInTheDocument()
  // Subject and episode start are surfaced alongside it.
  expect(screen.getByText('billing')).toBeInTheDocument()
})
