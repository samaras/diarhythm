import { useEffect, useState } from 'react'
import type { DataSnapshot } from '../../../preload'

const CARD_STYLE: React.CSSProperties = {
  border: '1px solid #d8dee5',
  borderRadius: 12,
  padding: 20,
  background: '#ffffff',
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #c3cbd2',
  borderRadius: 6,
  fontSize: 14,
}

const BUTTON_PRIMARY: React.CSSProperties = {
  background: '#101E2B',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const BUTTON_DANGER: React.CSSProperties = {
  ...BUTTON_PRIMARY,
  background: '#b3261e',
}

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 0',
  borderBottom: '1px solid #edf0f0',
  fontSize: 13,
}

export default function Medication() {
  const api = (window as unknown as {
    api?: {
      getData: () => Promise<DataSnapshot>
      saveRecord: (kind: string, record: Record<string, unknown>) => Promise<boolean>
      deleteRecord: (kind: string, id: number) => Promise<boolean>
    }
  }).api

  const [data, setData] = useState<DataSnapshot | null>(null)
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState('')
  const [reminderTime, setReminderTime] = useState('')
  const [active, setActive] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api?.getData().then(setData).catch(() => setData(null))
  }, [api])

  const save = async () => {
    if (!api) return
    setError('')
    if (!name.trim()) {
      setError('Medication name is required')
      return
    }
    try {
      await api.saveRecord('medication', {
        name,
        prescribed_schedule: schedule,
        reminder_time: reminderTime,
        active: active ? 1 : 0,
      })
      setSaved(true)
      setName('')
      setSchedule('')
      setReminderTime('')
      setActive(true)
      const refreshed = await api.getData()
      setData(refreshed)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  const remove = async (id: number) => {
    if (!api) return
    try {
      await api.deleteRecord('medication', id)
      const refreshed = await api.getData()
      setData(refreshed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const rows = data?.medications ?? []

  return (
    <div style={{ padding: 24, color: '#101E2B', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: '0 0 16px 0', fontSize: 20 }}>Medications</h2>
      <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#55606a' }}>
        Manual entries only — SmartSpectra measurements never contribute to medication records.
      </p>

      <div style={CARD_STYLE}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: 15 }}>Add a medication</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Medication name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ ...INPUT_STYLE, width: 200 }}
          />
          <input
            type="text"
            placeholder="Schedule (e.g. twice daily)"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            style={{ ...INPUT_STYLE, width: 180 }}
          />
          <input
            type="time"
            value={reminderTime}
            onChange={(e) => setReminderTime(e.target.value)}
            style={{ ...INPUT_STYLE, width: 140 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#55606a' }}>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Active
          </label>
          <button style={BUTTON_PRIMARY} onClick={save}>
            Save
          </button>
        </div>
        {error && <p style={{ color: '#b3261e', fontSize: 12, margin: '8px 0 0 0' }}>{error}</p>}
        {saved && <p style={{ color: '#174a43', fontSize: 12, margin: '8px 0 0 0' }}>Saved.</p>}
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: 15 }}>Medications ({rows.length})</h3>
        {rows.length === 0 ? (
          <p style={{ color: '#8a94a0', fontSize: 13 }}>No medications yet. Add one above.</p>
        ) : (
          rows.map((row) => (
            <div key={String(row.id)} style={ROW_STYLE}>
              <span style={{ flex: 1 }}>
                <strong>{row.name}</strong>{' '}
                {row.prescribed_schedule && (
                  <span style={{ color: '#55606a', marginLeft: 6 }}>({row.prescribed_schedule})</span>
                )}
                {row.reminder_time && (
                  <span style={{ color: '#8a94a0', marginLeft: 6 }}>{row.reminder_time}</span>
                )}
                <span
                  style={{
                    color: row.active ? '#174a43' : '#b3261e',
                    fontSize: 11,
                    marginLeft: 8,
                  }}
                >
                  {row.active ? 'Active' : 'Inactive'}
                </span>
              </span>
              <button style={BUTTON_DANGER} onClick={() => remove(Number(row.id))}>
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}