import type { User } from '@assembled/types'

/**
 * Demo users, one per audience. Authentication is out of scope: the web app's
 * user picker selects one of these and the API trusts the `user_uuid` it is
 * given. These are fixed rather than authored, so they are not persisted.
 *
 * Agent ids match the feed so an agent's rules resolve to real events.
 */
export const USERS: User[] = [
  {
    user_uuid: 'u_agent_a19',
    name: 'Ash Rivera',
    role: 'agent',
    agent_id: 'a_19',
    queue_ids: ['billing'],
    team_agent_ids: [],
  },
  {
    user_uuid: 'u_lead_billing',
    name: 'Dana Okafor',
    role: 'team_lead',
    agent_id: null,
    queue_ids: ['billing', 'tier_2'],
    team_agent_ids: ['a_19', 'a_07', 'a_42', 'a_31', 'a_11', 'a_23', 'a_88', 'a_05'],
  },
  {
    user_uuid: 'u_head_support',
    name: 'Sam Whitfield',
    role: 'head_of_support',
    agent_id: null,
    queue_ids: ['billing', 'tier_2', 'vip'],
    team_agent_ids: [],
  },
]

export function listUsers(): User[] {
  return USERS
}

export function getUser(userUuid: string): User | undefined {
  return USERS.find((u) => u.user_uuid === userUuid)
}
