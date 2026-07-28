import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  RULE_FIELDS,
  type ComparisonOp,
  type DraftRule,
  type QueueId,
  type QueueEventType,
  type Rule,
  type Severity,
  type User,
} from '@assembled/types'
import { createRule, deleteRule, fetchRules, setRuleEnabled } from '../api'

const EVENT_TYPES: { value: QueueEventType; label: string }[] = [
  { value: 'queue_snapshot', label: 'Queue snapshot' },
  { value: 'agent_state_change', label: 'Agent state change' },
  { value: 'adherence_check', label: 'Adherence check' },
]

const OPS: { value: ComparisonOp; label: string }[] = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
]

const SEVERITIES: Severity[] = ['info', 'warning', 'critical']
type ScopeMode = 'any' | 'queues' | 'agents'

const input = 'rounded-md border border-slate-300 px-2 py-1 text-sm'
const label = 'block text-xs font-medium text-slate-600'

export function RulesPage({ user }: { user: User }) {
  const [rules, setRules] = useState<Rule[]>([])
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [eventType, setEventType] = useState<QueueEventType>('queue_snapshot')
  const [field, setField] = useState('tickets_waiting')
  const [op, setOp] = useState<ComparisonOp>('gt')
  const [value, setValue] = useState('20')
  const [sustainedMin, setSustainedMin] = useState('0')
  const [severity, setSeverity] = useState<Severity>('warning')
  const [cooldownMin, setCooldownMin] = useState('10')
  const [scopeMode, setScopeMode] = useState<ScopeMode>('any')
  const [scopeQueues, setScopeQueues] = useState<QueueId[]>([])

  const fields = RULE_FIELDS[eventType] ?? []
  const fieldKind = fields.find((f) => f.field === field)?.kind ?? 'string'
  const scopeAgents = user.role === 'agent' && user.agent_id ? [user.agent_id] : user.team_agent_ids

  const reload = useCallback(() => {
    fetchRules(user.user_uuid).then(setRules).catch(() => setRules([]))
  }, [user.user_uuid])

  useEffect(reload, [reload])

  // Keep the selected field valid when the event type changes.
  useEffect(() => {
    const available = RULE_FIELDS[eventType] ?? []
    if (!available.some((f) => f.field === field)) setField(available[0]?.field ?? '')
  }, [eventType, field])

  const draft: DraftRule = useMemo(() => {
    const typed: string | number | boolean =
      fieldKind === 'number' ? Number(value) : fieldKind === 'boolean' ? value === 'true' : value
    return {
      name: name.trim() || 'Untitled rule',
      owner_user_uuid: user.user_uuid,
      enabled: true,
      event_type: eventType,
      conditions: [{ field, op, value: typed }],
      sustained_for_sec: Number(sustainedMin) > 0 ? Number(sustainedMin) * 60 : null,
      scope: {
        queue_ids: scopeMode === 'queues' && scopeQueues.length > 0 ? scopeQueues : null,
        agent_ids: scopeMode === 'agents' && scopeAgents.length > 0 ? scopeAgents : null,
      },
      severity,
      cooldown_sec: Number(cooldownMin) * 60,
    }
  }, [
    name, user.user_uuid, eventType, field, op, value, fieldKind,
    sustainedMin, scopeMode, scopeQueues, scopeAgents, severity, cooldownMin,
  ])

  async function save() {
    setSaving(true)
    try {
      await createRule(draft)
      setName('')
      reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-xl font-semibold text-slate-900">New rule</h2>
        <p className="mt-1 text-sm text-slate-500">Notify {user.name} when…</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className={label} htmlFor="rule-name">Name</label>
            <input
              id="rule-name" className={`${input} w-full`} value={name}
              placeholder="Billing backlog is building"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className={label} htmlFor="rule-event">Event</label>
            <select
              id="rule-event" className={`${input} w-full`} value={eventType}
              onChange={(e) => setEventType(e.target.value as QueueEventType)}
            >
              {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className={label} htmlFor="rule-field">Field</label>
              <select id="rule-field" className={`${input} w-full`} value={field} onChange={(e) => setField(e.target.value)}>
                {fields.map((f) => <option key={f.field} value={f.field}>{f.field}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="rule-op">Test</label>
              <select id="rule-op" className={input} value={op} onChange={(e) => setOp(e.target.value as ComparisonOp)}>
                {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="rule-value">Value</label>
              {fieldKind === 'boolean' ? (
                <select id="rule-value" className={input} value={value} onChange={(e) => setValue(e.target.value)}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  id="rule-value" className={`${input} w-24`} value={value}
                  inputMode={fieldKind === 'number' ? 'numeric' : 'text'}
                  onChange={(e) => setValue(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className={label} htmlFor="rule-sustained">Sustained for (min)</label>
              <input
                id="rule-sustained" className={`${input} w-full`} value={sustainedMin} inputMode="numeric"
                onChange={(e) => setSustainedMin(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className={label} htmlFor="rule-cooldown">Cooldown (min)</label>
              <input
                id="rule-cooldown" className={`${input} w-full`} value={cooldownMin} inputMode="numeric"
                onChange={(e) => setCooldownMin(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className={label} htmlFor="rule-severity">Severity</label>
              <select
                id="rule-severity" className={`${input} w-full`} value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
              >
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <span className={label}>Scope</span>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              {(['any', 'queues', 'agents'] as ScopeMode[]).map((mode) => (
                <label key={mode} className="flex items-center gap-1 text-slate-700">
                  <input
                    type="radio" name="scope" checked={scopeMode === mode}
                    onChange={() => setScopeMode(mode)}
                  />
                  {mode === 'any' ? 'Anything' : mode === 'queues' ? 'Specific queues' : user.role === 'agent' ? 'Just me' : 'My agents'}
                </label>
              ))}
            </div>
            {scopeMode === 'queues' && (
              <div className="mt-2 flex gap-3 text-sm">
                {user.queue_ids.map((q) => (
                  <label key={q} className="flex items-center gap-1 text-slate-700">
                    <input
                      type="checkbox" checked={scopeQueues.includes(q)}
                      onChange={(e) =>
                        setScopeQueues(e.target.checked ? [...scopeQueues, q] : scopeQueues.filter((x) => x !== q))
                      }
                    />
                    {q}
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            type="button" onClick={save} disabled={saving}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save rule'}
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900">Your rules</h2>
        <p className="mt-1 text-sm text-slate-500">{rules.length} configured</p>
        <ul className="mt-4 space-y-2">
          {rules.map((r) => (
            <li key={r.rule_id} className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{r.name}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{r.severity}</span>
                <div className="ml-auto flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    <input
                      type="checkbox" checked={r.enabled}
                      onChange={(e) => setRuleEnabled(r.rule_id, e.target.checked).then(reload)}
                    />
                    enabled
                  </label>
                  <button
                    type="button" className="text-xs text-red-600"
                    onClick={() => deleteRule(r.rule_id).then(reload)}
                  >
                    delete
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {r.event_type} · {r.conditions.map((c) => `${c.field} ${c.op} ${String(c.value)}`).join(' and ')}
                {r.sustained_for_sec ? ` · sustained ${r.sustained_for_sec / 60}m` : ''}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
