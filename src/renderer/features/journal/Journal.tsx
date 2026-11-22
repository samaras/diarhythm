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

export default function Journal() {
  const api = (window as unknown as {
    api?: {
      getData: () => Promise<DataSnapshot>
      saveRecord: (kind: string, record: Record<string, unknown>) => Promise<boolean>
      deleteRecord: (kind: string, id: number) => Promise<boolean>
    }
  }).api

  const [data, setData] = useState<DataSnapshot | null>(null)
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState<'mmol/L' | 'mg/dL'>('mmol/L')
  const [context, setContext] = useState('')
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api?.getData().then(setData).catch(() => setData(null))
  }, [api])

  const save = async () => {
    if (!api) return
    setError('')
    const v = Number(value)
    if (!Number.isFinite(v) || v <= 0) {
      setError('Enter a positive glucose value')
      return
    }
    try {
      await api.saveRecord('glucose', {
        value: v,
        unit,
        context: context || 'other',
        recorded_at: new Date().toISOString(),
        notes,
      })
      setSaved(true)
      setValue('')
      setContext('')
      setNotes('')
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
      await api.deleteRecord('glucose', id)
      const refreshed = await api.getData()
      setData(refreshed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const rows = data?.glucose ?? []

  return (
    <div style={{ padding: 24, color: '#101E2B', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: '0 0 16px 0', fontSize: 20 }}>Glucose Journal</h2>
      <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#55606a' }}>
        Manual entries only — SmartSpectra measurements never contribute to glucose values.
      </p>

      <div style={CARD_STYLE}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: 15 }}>Add a reading</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            type="number"
            step="0.1"
            placeholder="Value (mmol/L)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ ...INPUT_STYLE, width: 150 }}
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'mmol/L' | 'mg/dL')}
            style={INPUT_STYLE}
          >
            <option value="mmol/L">mmol/L</option>
            <option value="mg/dL">mg/dL</option>
          </select>
          <input
            type="text"
            placeholder="Context (e.g. before breakfast)"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            style={{ ...INPUT_STYLE, width: 200 }}
          />
          <button style={BUTTON_PRIMARY} onClick={save}>
            Save
          </button>
        </div>
        <textarea
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...INPUT_STYLE, height: 60, resize: 'vertical', width: '100%' }}
        />
        {error && <p style={{ color: '#b3261e', fontSize: 12, margin: '8px 0 0 0' }}>{error}</p>}
        {saved && <p style={{ color: '#174a43', fontSize: 12, margin: '8px 0 0 0' }}>Saved.</p>}
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: 15 }}>History ({rows.length})</h3>
        {rows.length === 0 ? (
          <p style={{ color: '#8a94a0', fontSize: 13 }}>No entries yet. Add a reading above.</p>
        ) : (
          rows.map((row) => (
            <div key={String(row.id)} style={ROW_STYLE}>
              <span style={{ flex: 1 }}>
                <strong>{row.value} {row.unit}</strong>{' '}
                <span style={{ color: '#55606a' }}>{row.context}</span>{' '}
                <span style={{ color: '#8a94a0', marginLeft: 6 }}>
                  {new Date(String(row.recorded_at)).toLocaleString()}
                </span>
              </span>
              {row.notes && <span style={{ color: '#55606a', fontSize: 12 }}>{row.notes}</span>}
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