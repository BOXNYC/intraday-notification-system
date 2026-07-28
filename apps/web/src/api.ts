import type { DraftRule, Notification, Rule, User } from '@assembled/types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

export async function fetchUsers(): Promise<User[]> {
  const data = await request<{ users: User[] }>('/api/users')
  return data.users
}

export async function fetchNotifications(userUuid: string): Promise<Notification[]> {
  const data = await request<{ notifications: Notification[] }>('/api/notifications', {
    method: 'POST',
    body: JSON.stringify({ user_uuid: userUuid }),
  })
  return data.notifications
}

export async function fetchRules(userUuid: string): Promise<Rule[]> {
  const data = await request<{ rules: Rule[] }>(`/api/rules?user_uuid=${encodeURIComponent(userUuid)}`)
  return data.rules
}

export async function createRule(draft: DraftRule): Promise<Rule> {
  const data = await request<{ rule: Rule }>('/api/rules', {
    method: 'POST',
    body: JSON.stringify(draft),
  })
  return data.rule
}

export async function setRuleEnabled(ruleId: string, enabled: boolean): Promise<Rule> {
  const data = await request<{ rule: Rule }>(`/api/rules/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
  return data.rule
}

export async function deleteRule(ruleId: string): Promise<void> {
  const res = await fetch(`/api/rules/${ruleId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}
