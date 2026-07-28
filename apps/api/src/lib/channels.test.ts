import type { Notification, User } from '@assembled/types'
import { createInboxChannel, dispatch } from './channels.js'
import { createDeliveryStore } from './deliveryStore.js'

const USER: User = {
  user_uuid: 'u_lead', name: 'Lead', role: 'team_lead',
  agent_id: null, queue_ids: ['billing'], team_agent_ids: [],
}

const NOTIFICATION: Notification = {
  notification_id: 'n_1', rule_id: 'r_1', rule_name: 'Rule', user_uuid: 'u_lead',
  severity: 'warning', title: 'Rule', body: 'because reasons', subject: { queue_id: 'billing' },
  triggering_event_id: 'evt_1', dedupe_key: 'r_1:billing:2026-05-26T09:00:00Z',
  episode_started_at: '2026-05-26T09:00:00Z', held_for_sec: 0, created_at: '2026-05-26T09:00:00Z',
}

it('delivers a notification to the recipient inbox', () => {
  const store = createDeliveryStore()
  dispatch(NOTIFICATION, USER, [createInboxChannel(store)])

  expect(store.getDelivered('u_lead')).toEqual([NOTIFICATION])
  expect(store.getDelivered('u_someone_else')).toEqual([])
})
