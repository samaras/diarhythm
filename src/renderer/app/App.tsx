import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import type { DataRow, DataSnapshot } from '../../preload'
import SensingCheckIn from '../features/sensing/SensingCheckIn'

const empty: DataSnapshot = { glucose: [], medications: [], events: [], logs: [], settings: {} }
const localInputTime = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16) }
const localDate = () => localInputTime().slice(0, 10)
const localDateOffset = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days); const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return adjusted.toISOString().slice(0, 10) }
const css: Record<string, CSSProperties> = {
  app: { minHeight: '100vh', background: '#F4F7F7', color: '#101E2B', fontFamily: 'Inter, system-ui, sans-serif' },
  header: { display: 'flex', alignItems: 'center', gap: 18, padding: '15px 26px', background: '#101E2B', color: 'white', flexWrap: 'wrap' },
  nav: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  content: { maxWidth: 1180, margin: '0 auto', padding: 26 },
  card: { border: '1px solid #e0e8e8', borderRadius: 14, padding: 20, background: 'white', marginBottom: 15, boxShadow: '0 3px 14px #101e2b08' },
  button: { border: '1px solid #d6e0e0', borderRadius: 8, padding: '9px 13px', background: 'white', color: '#101E2B', cursor: 'pointer' },
  primary: { border: 0, borderRadius: 8, padding: '10px 15px', background: '#174A43', color: 'white', cursor: 'pointer' },
  input: { border: '1px solid #cbd7d7', borderRadius: 7, padding: 9, font: 'inherit', color: '#101E2B', minWidth: 0 },
  field: { display: 'grid', gap: 5, color: '#55606a', fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 11, alignItems: 'end' },
}
const dateText = (v: unknown) => v ? new Date(String(v)).toLocaleString() : '—'
const fieldStyle = (name: string, label: string, value: string | number | null | undefined, type = 'text', required = false) => <label key={name} style={css.field}>{label}<input style={css.input} name={name} type={type} defaultValue={value ?? ''} required={required} min={type === 'number' ? '0.01' : undefined} step={type === 'number' ? 'any' : undefined} /></label>

export default function App() {
  const api = window.api
  const [page, setPage] = useState(location.hash.slice(1) || 'dashboard')
  const [data, setData] = useState<DataSnapshot>(empty)
  const [error, setError] = useState('')
  const [unit, setUnit] = useState('mmol/L')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [compactLayout, setCompactLayout] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [trendDays, setTrendDays] = useState(7)
  const [editing, setEditing] = useState<{ kind: string; row: DataRow } | null>(null)
  const [dashboardCards, setDashboardCards] = useState<string[]>(['glucose', 'medication', 'logs', 'trend'])
  const [glucoseDraft, setGlucoseDraft] = useState({ value: '', context: 'other', notes: '' })

  const refresh = useCallback(async () => {
    try {
      const result = await api.getData()
      setData(result)
      setUnit(result.settings.unit || 'mmol/L')
      setTheme(result.settings.theme === 'dark' ? 'dark' : 'light')
      setCompactLayout(result.settings.compact_layout === 'true')
      const savedCards = result.settings.dashboard_cards
      if (savedCards) setDashboardCards(JSON.parse(savedCards) as string[])
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your local records') }
  }, [api])
  useEffect(() => { void refresh() }, [refresh])
  const go = (target: string) => { setPage(target); location.hash = target }
  const saveForm = async (event: FormEvent<HTMLFormElement>, kind: string) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries())
    try { await api.saveRecord(kind, values); form.reset(); if (kind === 'glucose') setGlucoseDraft({ value: '', context: 'other', notes: '' }); setError(''); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save this entry') }
  }
  const removeRecord = async (kind: string, id: number) => {
    if (!confirm('Delete this record?')) return
    try { await api.deleteRecord(kind, id); await refresh() } catch (e) { setError(String(e)) }
  }
  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries())
    if (editing.kind === 'medication') values.active = form.elements.namedItem('active') instanceof HTMLInputElement && (form.elements.namedItem('active') as HTMLInputElement).checked ? '1' : '0'
    const saveKind = editing.kind === 'log' ? String(editing.row.kind) : editing.kind
    try { await api.saveRecord(saveKind, { ...editing.row, ...values }); setEditing(null); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update this entry') }
  }
  const saveSetting = async (key: string, value: string) => { await api.saveSetting(key, value); await refresh() }
  const repeat = async (kind: string, source: DataRow) => {
    const copy = { ...source, recorded_at: localInputTime() }
    delete (copy as { id?: unknown }).id
    try { await api.saveRecord(kind, copy); setError('Repeated the last entry with the current time.'); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not repeat the entry') }
  }
  const exportCsv = () => {
    const groups: [string, DataRow[]][] = [['Glucose', data.glucose], ['Medications', data.medications], ['Medication events', data.events], ['Meals, activities and notes', data.logs]]
    const quote = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
    const text = groups.map(([title, rows]) => `${title}\n${rows.length ? `${Object.keys(rows[0]).map(quote).join(',')}\n${rows.map(r => Object.values(r).map(quote).join(',')).join('\n')}` : 'No records'}`).join('\n\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); link.download = `diarhythm-${localDate()}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  const today = localDate()
  const todayEvents = data.events.filter(x => String(x.scheduled_at ?? '').slice(0, 10) === today)
  const todayLogs = data.logs.filter(x => String(x.recorded_at ?? '').slice(0, 10) === today)
  const todayGlucose = data.glucose.filter(x => String(x.recorded_at ?? '').slice(0, 10) === today)
  const todayTimeline = [
    ...todayGlucose.map(row => ({ id: `glucose-${row.id}`, at: String(row.recorded_at), title: `Glucose · ${row.value} ${row.unit}`, detail: String(row.context || 'Reading'), kind: 'glucose' })),
    ...todayLogs.map(row => ({ id: `log-${row.id}`, at: String(row.recorded_at), title: `${String(row.kind).charAt(0).toUpperCase()}${String(row.kind).slice(1)} · ${row.description}`, detail: row.duration_minutes ? `${row.duration_minutes} min` : String(row.notes || ''), kind: String(row.kind) })),
    ...todayEvents.map(row => ({ id: `event-${row.id}`, at: String(row.scheduled_at), title: `${data.medications.find(m => Number(m.id) === Number(row.medication_id))?.name ?? 'Medication'} · ${row.status}`, detail: 'Medication check-in', kind: 'medication' })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const recentGlucose = data.glucose.filter(x => String(x.recorded_at ?? '').slice(0, 10) >= localDateOffset(29) && String(x.recorded_at ?? '').slice(0, 10) <= today)
  const contextCounts = recentGlucose.reduce<Record<string, number>>((counts, row) => {
    const context = String(row.context || 'other')
    counts[context] = (counts[context] || 0) + 1
    return counts
  }, {})
  const commonContext = Object.entries(contextCounts).sort((a, b) => b[1] - a[1])[0]
  const weekStart = localDateOffset(6)
  const weekGlucose = data.glucose.filter(x => String(x.recorded_at ?? '').slice(0, 10) >= weekStart && String(x.recorded_at ?? '').slice(0, 10) <= today)
  const weekEvents = data.events.filter(x => String(x.scheduled_at ?? '').slice(0, 10) >= weekStart && String(x.scheduled_at ?? '').slice(0, 10) <= today)
  const weekLogs = data.logs.filter(x => String(x.recorded_at ?? '').slice(0, 10) >= weekStart && String(x.recorded_at ?? '').slice(0, 10) <= today)
  const exportWeeklyCsv = () => {
    const groups: [string, DataRow[]][] = [['Glucose readings', weekGlucose], ['Medication check-ins', weekEvents], ['Routine entries', weekLogs]]
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const csv = groups.map(([title, rows]) => `${title}\n${rows.length ? `${Object.keys(rows[0]).map(quote).join(',')}\n${rows.map(row => Object.values(row).map(quote).join(',')).join('\n')}` : 'No records'}`).join('\n\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = `diarhythm-week-${weekStart}-to-${today}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }
  const filteredGlucose = data.glucose.filter(x => {
    const day = String(x.recorded_at ?? '').slice(0, 10)
    return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo)
  })
  const trendReadings = useMemo(() => {
    const after = Date.now() - trendDays * 86_400_000
    return data.glucose.filter(x => new Date(String(x.recorded_at)).getTime() >= after && x.unit === unit).slice().reverse()
  }, [data.glucose, trendDays, unit])
  const lastMeal = data.logs.find(x => x.kind === 'meal')
  const lastActivity = data.logs.find(x => x.kind === 'activity')

  const card = (title: string, body: ReactNode) => <section style={panelStyle}><h2 style={{ margin: '0 0 14px', fontSize: 18 }}>{title}</h2>{body}</section>
  const recordList = (rows: DataRow[], label: (row: DataRow) => string, options: { kind?: string; dateKey?: string; editable?: boolean } = {}) => rows.length ? <div>{rows.map(row => <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: '1px solid #edf0f0', flexWrap: 'wrap' }}><b style={{ flex: 1 }}>{label(row)}</b><span style={{ color: '#667477', fontSize: 13 }}>{dateText(row[options.dateKey || 'recorded_at'])}</span>{row.notes && <span style={{ color: '#667477' }}>{String(row.notes)}</span>}{options.editable && <button style={css.button} onClick={() => setEditing({ kind: options.kind || '', row })}>Edit</button>}{options.kind && <button style={{ ...css.button, color: '#9b2226' }} onClick={() => void removeRecord(options.kind!, Number(row.id))}>Delete</button>}</div>)}</div> : <p style={{ color: '#667477' }}>No entries in this view yet.</p>

  const nav: [string, string][] = [['dashboard', 'Overview'], ['glucose', 'Glucose journal'], ['routine', 'Medication & logs'], ['reports', 'Reports'], ['sensing', 'Check-in'], ['settings', 'Settings']]
  const statuses = (med: DataRow) => todayEvents.find(e => Number(e.medication_id) === Number(med.id))?.status ?? 'Not logged'
  const logMedication = async (medicationId: number, status: 'taken' | 'skipped') => {
    try { await api.saveRecord('event', { medication_id: medicationId, scheduled_at: localInputTime(), status }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save medication check-in') }
  }
  const dashboardMetric = (key: string, title: string, value: ReactNode, action?: () => void) => dashboardCards.includes(key) && <button key={key} onClick={action} style={{ ...panelStyle, textAlign: 'left', cursor: action ? 'pointer' : 'default' }}><div style={{ color: muted, fontSize: 13 }}>{title}</div><strong style={{ display: 'block', fontSize: 32, marginTop: 6 }}>{value}</strong></button>

  const dark = theme === 'dark'
  const surface = dark ? '#18252c' : '#ffffff'
  const ink = dark ? '#edf4f3' : '#101E2B'
  const muted = dark ? '#b3c1c2' : '#667477'
  const panelStyle: CSSProperties = { ...css.card, background: surface, color: ink, borderColor: dark ? '#34464d' : '#e0e8e8', padding: compactLayout ? 14 : 20, marginBottom: compactLayout ? 10 : 15 }
  return <div style={{ ...css.app, background: dark ? '#10191e' : '#F4F7F7', color: ink }}>
    <header style={css.header}><b style={{ fontSize: 20 }}>DiaRhythm</b><nav style={css.nav}>{nav.map(([key, label]) => <button key={key} onClick={() => go(key)} style={{ ...css.button, background: page === key ? '#55C8B5' : 'transparent', borderColor: page === key ? '#55C8B5' : '#40515e', color: page === key ? '#101E2B' : 'white' }}>{label}</button>)}</nav><span style={{ marginLeft: 'auto', fontSize: 12 }}>Private local journal</span></header>
    <main style={css.content}>
      {error && <div role="status" style={{ ...css.card, color: '#174A43' }}>{error}<button style={{ ...css.button, float: 'right' }} onClick={() => setError('')}>Dismiss</button></div>}

      {page === 'dashboard' && <>
        <h1 style={{ marginBottom: 4 }}>Your day, at a glance</h1><p style={{ color: '#667477', marginTop: 0 }}>A record of your routines, without clinical scores or interpretations.</p>
        <section style={{ ...panelStyle, background: dark ? '#20333a' : 'linear-gradient(120deg, #ffffff 0%, #eff9f6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div><div style={{ color: '#667477', fontSize: 13 }}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div><strong style={{ display: 'block', fontSize: 20, marginTop: 4 }}>Keep your day in one place</strong><span style={{ color: '#667477', fontSize: 13 }}>Add a reading, routine or note whenever it suits you.</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button style={css.primary} onClick={() => go('glucose')}>Add a reading</button><button style={css.button} onClick={() => go('routine')}>Log a meal, activity or note</button></div>
        </section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
          {dashboardMetric('glucose', 'Glucose entries today', todayGlucose.length, () => go('glucose'))}
          {dashboardMetric('medication', 'Medication events today', todayEvents.length, () => go('routine'))}
          {dashboardMetric('logs', 'Meals & activities today', todayLogs.filter(x => x.kind !== 'note').length, () => go('routine'))}
          {dashboardMetric('active', 'Active medications', data.medications.filter(x => Number(x.active) === 1).length, () => go('routine'))}
        </div>
        {card('Today timeline', <>
          {data.medications.some(m => Number(m.active) === 1) && <div style={{ marginBottom: 12, padding: 14, borderRadius: 10, background: '#f4f7f7' }}><strong style={{ display: 'block', marginBottom: 8 }}>Medication check-ins</strong>{data.medications.filter(m => Number(m.active) === 1).map(m => <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '7px 0' }}><span style={{ flex: 1 }}>{m.name}{m.reminder_time ? ` · ${m.reminder_time}` : ''}</span>{statuses(m) === 'Not logged' ? <><button style={css.button} onClick={() => void logMedication(Number(m.id), 'taken')}>Taken</button><button style={css.button} onClick={() => void logMedication(Number(m.id), 'skipped')}>Skipped</button></> : <span style={{ color: '#174A43', fontSize: 13, fontWeight: 600 }}>{statuses(m)} · logged</span>}</div>)}</div>}
          {todayTimeline.length ? <div>{todayTimeline.map(item => <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '70px 14px 1fr', gap: 12, alignItems: 'stretch', padding: '11px 0', borderBottom: '1px solid #edf0f0' }}><time style={{ color: '#667477', fontSize: 13, paddingTop: 2 }}>{new Date(item.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time><span aria-hidden="true" style={{ width: 10, height: 10, marginTop: 5, borderRadius: '50%', background: item.kind === 'glucose' ? '#174A43' : item.kind === 'medication' ? '#d6a446' : '#55C8B5' }} /><div><strong>{item.title}</strong>{item.detail && <div style={{ color: '#667477', fontSize: 13, marginTop: 3 }}>{item.detail}</div>}</div></div>)}</div> : !data.medications.some(m => Number(m.active) === 1) ? <p style={{ margin: 0, color: '#667477' }}>Nothing logged yet today. Add a reading or log a meal, activity or note to get started.</p> : <p style={{ margin: 0, color: '#667477' }}>Your timeline will fill in as you log today’s entries.</p>}
        </>)}
        {dashboardCards.includes('medication') && card('Today’s medication plan', data.medications.filter(x => Number(x.active) === 1).length ? <div>{data.medications.filter(x => Number(x.active) === 1).map(m => <div key={m.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #edf0f0', alignItems: 'center', flexWrap: 'wrap' }}><b style={{ flex: 1 }}>{m.name}</b><span>{m.reminder_time ? `Reminder ${m.reminder_time}` : 'No reminder set'}</span><span style={{ color: statuses(m) === 'taken' ? '#174A43' : '#667477' }}>{statuses(m)}</span><button style={css.button} onClick={() => void api.saveRecord('event', { medication_id: m.id, scheduled_at: localInputTime(), status: 'taken' }).then(refresh)}>Taken</button><button style={css.button} onClick={() => void api.saveRecord('event', { medication_id: m.id, scheduled_at: localInputTime(), status: 'skipped' }).then(refresh)}>Skipped</button></div>)}</div> : <p>Add medications in Medication &amp; logs to see your day plan.</p>)}
        {card('Patterns in your records', recentGlucose.length ? <><p style={{ color: muted, marginTop: 0 }}>A plain summary of entries from the last 30 days. It describes what was logged and does not explain causes or recommend changes.</p>{commonContext && <div style={{ padding: 14, borderRadius: 10, background: dark ? '#22343b' : '#f4f7f7' }}><strong>You logged the most readings with “{commonContext[0]}” as the context.</strong><div style={{ color: muted, fontSize: 13, marginTop: 5 }}>{commonContext[1]} of {recentGlucose.length} readings · supporting entries:</div><ul style={{ marginBottom: 0, paddingLeft: 20 }}>{recentGlucose.filter(x => String(x.context || 'other') === commonContext[0]).slice(0, 3).map(x => <li key={x.id}>{String(x.recorded_at).slice(0, 10)} · {x.value} {x.unit}</li>)}</ul></div>}{recentGlucose.length < 3 && <p style={{ color: muted }}>Log a few more readings to see a useful summary of your recording habits.</p>}</> : <p style={{ color: muted }}>Patterns will appear here as you add readings. Your entries stay on this device.</p>)}
        {dashboardCards.includes('trend') && card('Glucose trend', <><div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}><label style={css.field}>Period<select style={css.input} value={trendDays} onChange={e => setTrendDays(Number(e.target.value))}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label><span style={{ color: '#667477', fontSize: 13 }}>Recorded values in {unit}; this is a history view, not a target range.</span></div>{trendReadings.length ? <><div style={{ height: 130, display: 'flex', alignItems: 'end', gap: 5, borderBottom: '1px solid #cbd7d7', padding: '8px 0' }}>{trendReadings.map(x => <div key={x.id} title={`${x.value} ${x.unit} · ${dateText(x.recorded_at)}`} style={{ flex: 1, minWidth: 5, height: `${Math.max(5, Math.min(100, Number(x.value) / (x.unit === 'mmol/L' ? 30 : 540) * 100))}%`, background: '#55C8B5', borderRadius: '4px 4px 0 0' }} />)}</div><div style={{ display: 'flex', justifyContent: 'space-between', color: '#667477', fontSize: 12, marginTop: 6 }}><span>{dateText(trendReadings[0].recorded_at)}</span><span>{dateText(trendReadings[trendReadings.length - 1].recorded_at)}</span></div></> : <p>No readings in {unit} during this period.</p>}{trendReadings.length > 0 && <p style={{ color: '#667477', fontSize: 13 }}>Latest: {trendReadings.at(-1)?.value} {unit} · {trendReadings.length} recorded values</p>}</>)}
        {dashboardCards.includes('logs') && card('Recent routine entries', <>{[...data.glucose.slice(0, 3).map(x => ({ ...x, summary: `Glucose · ${x.value} ${x.unit} · ${x.context}` } as DataRow)), ...data.logs.slice(0, 4).map(x => ({ ...x, summary: `${x.kind} · ${x.description}` } as DataRow))].sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at))).slice(0, 5).map(x => <div key={`${x.id}-${x.summary}`} style={{ padding: '10px 0', borderBottom: '1px solid #edf0f0' }}><b>{String(x.summary)}</b><div style={{ color: '#667477', fontSize: 13 }}>{dateText(x.recorded_at)}</div></div>)}{!data.glucose.length && !data.logs.length && <p>No entries yet. Add a record to start your journal.</p>}</>)}
      </>}

      {page === 'glucose' && <><h1>Glucose journal</h1><p style={{ color: '#667477' }}>Enter values from your own meter. DiaRhythm does not assess readings or suggest treatment.</p>
        {card('Add a reading', <form onSubmit={e => void saveForm(e, 'glucose')} style={css.grid}>{fieldStyle('value', 'Reading', glucoseDraft.value, 'number', true)}<label style={css.field}>Unit<select style={css.input} name="unit" value={unit} onChange={e => { setUnit(e.target.value); void saveSetting('unit', e.target.value) }}><option>mmol/L</option><option>mg/dL</option></select></label><label style={css.field}>Context<select style={css.input} name="context" value={glucoseDraft.context} onChange={e => setGlucoseDraft({ ...glucoseDraft, context: e.target.value })}><option value="fasting">Fasting</option><option value="before meal">Before meal</option><option value="after meal">After meal</option><option value="other">Other</option></select></label>{fieldStyle('recorded_at', 'Recorded at', localInputTime(), 'datetime-local', true)}<label style={css.field}>Notes<input style={css.input} name="notes" value={glucoseDraft.notes} onChange={e => setGlucoseDraft({ ...glucoseDraft, notes: e.target.value })} maxLength={1000} /></label><button style={css.primary}>Save reading</button></form>)}
        {card('History', <><div style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 12, flexWrap: 'wrap' }}><label style={css.field}>From<input style={css.input} type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></label><label style={css.field}>To<input style={css.input} type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></label><button style={css.button} onClick={() => { setDateFrom(''); setDateTo('') }}>Clear dates</button>{data.glucose[0] && <button style={css.button} onClick={() => void repeat('glucose', data.glucose[0])}>Repeat latest reading</button>}</div>{recordList(filteredGlucose, x => `${x.value} ${x.unit} · ${x.context}`, { kind: 'glucose', editable: true })}</>)}
      </>}

      {page === 'routine' && <><h1>Medication, meals &amp; activity</h1><p style={{ color: '#667477' }}>Use the regimen prescribed by your healthcare professional. DiaRhythm does not recommend or adjust treatment.</p>
        {card('Medication list', <><form onSubmit={e => void saveForm(e, 'medication')} style={css.grid}>{fieldStyle('name', 'Medication name', '', 'text', true)}{fieldStyle('prescribed_schedule', 'Prescribed schedule', '', 'text')}{fieldStyle('reminder_time', 'Optional reminder', '', 'time')}<button style={css.primary}>Add medication</button></form>{data.medications.map(m => <div key={m.id} style={{ display: 'flex', gap: 9, alignItems: 'center', borderTop: '1px solid #edf0f0', padding: '12px 0', flexWrap: 'wrap' }}><b style={{ minWidth: 150 }}>{m.name}</b><span style={{ flex: 1 }}>{m.prescribed_schedule}</span><span>{m.reminder_time || 'No reminder'}</span><button style={css.button} onClick={() => setEditing({ kind: 'medication', row: m })}>Edit</button><button style={css.button} onClick={() => void removeRecord('medication', Number(m.id))}>Delete</button></div>)}</>)}
        {card('Medication reminders & today', <><label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={data.settings.reminders_enabled === 'true'} onChange={e => void saveSetting('reminders_enabled', String(e.target.checked))} />Enable desktop reminders for scheduled medications</label><p style={{ color: '#667477', fontSize: 13 }}>Reminders appear while DiaRhythm is running. A medication is marked “not logged” until you record taken or skipped. Logging is for tracking only.</p>{data.medications.filter(x => Number(x.active) === 1).map(m => <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #edf0f0' }}><b style={{ flex: 1 }}>{m.name}</b><span>{m.reminder_time || 'No scheduled time'}</span><span>{statuses(m)}</span>{statuses(m) === 'Not logged' && <><button style={css.button} onClick={() => void api.saveRecord('event', { medication_id: m.id, scheduled_at: localInputTime(), status: 'taken' }).then(refresh)}>Taken</button><button style={css.button} onClick={() => void api.saveRecord('event', { medication_id: m.id, scheduled_at: localInputTime(), status: 'skipped' }).then(refresh)}>Skipped</button></>}</div>)}</>)}
        {card('Meal, activity or note', <form onSubmit={e => { const kind = String(new FormData(e.currentTarget).get('kind')); void saveForm(e, kind) }} style={css.grid}><label style={css.field}>Type<select name="kind" style={css.input}><option value="meal">Meal</option><option value="activity">Activity</option><option value="note">Personal note</option></select></label>{fieldStyle('description', 'Description', '', 'text', true)}{fieldStyle('recorded_at', 'Recorded at', localInputTime(), 'datetime-local', true)}{fieldStyle('duration_minutes', 'Duration (activity, minutes)', '', 'number')}<label style={css.field}>Notes<input style={css.input} name="notes" maxLength={1000} /></label><button style={css.primary}>Save entry</button></form>)}
        {card('Recent meals & activities', <>{lastMeal && <button style={css.button} onClick={() => void repeat('meal', lastMeal)}>Repeat last meal</button>} {lastActivity && <button style={css.button} onClick={() => void repeat('activity', lastActivity)}>Repeat last activity</button>}{recordList(data.logs, x => `${x.kind} · ${x.description}${x.duration_minutes ? ` · ${x.duration_minutes} min` : ''}`, { kind: 'log', editable: true })}</>)}
        {card('Medication history', recordList(data.events, x => `${data.medications.find(m => Number(m.id) === Number(x.medication_id))?.name ?? 'Medication'} · ${x.status}`, { dateKey: 'scheduled_at' }))}
      </>}

      {page === 'reports' && <><h1>Personal report</h1>{card('This week · ' + weekStart + ' to ' + today, <><p style={{ color: muted, marginTop: 0 }}>A local preview of records from the last seven calendar days. Nothing is uploaded.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10 }}><div style={{ padding: 14, borderRadius: 10, background: dark ? '#22343b' : '#f4f7f7' }}><strong style={{ fontSize: 24 }}>{weekGlucose.length}</strong><div style={{ color: muted, fontSize: 13 }}>glucose readings</div></div><div style={{ padding: 14, borderRadius: 10, background: dark ? '#22343b' : '#f4f7f7' }}><strong style={{ fontSize: 24 }}>{weekEvents.length}</strong><div style={{ color: muted, fontSize: 13 }}>medication check-ins</div></div><div style={{ padding: 14, borderRadius: 10, background: dark ? '#22343b' : '#f4f7f7' }}><strong style={{ fontSize: 24 }}>{weekLogs.length}</strong><div style={{ color: muted, fontSize: 13 }}>routine entries</div></div></div><h3>Reading history by day</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8, alignItems: 'end', minHeight: 110 }}>{Array.from({ length: 7 }, (_, i) => { const day = localDateOffset(6 - i); const count = weekGlucose.filter(x => String(x.recorded_at).slice(0, 10) === day).length; return <div key={day} title={`${day}: ${count} readings`} style={{ textAlign: 'center', color: muted, fontSize: 11 }}><div style={{ height: 70, display: 'flex', alignItems: 'end', justifyContent: 'center' }}><div style={{ width: '65%', height: `${Math.max(4, Math.min(100, count * 18))}%`, borderRadius: '5px 5px 0 0', background: '#55C8B5' }} /></div>{new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })}<br />{count}</div>})}</div><p style={{ color: muted, fontSize: 13 }}>Preview includes {weekGlucose.length + weekEvents.length + weekLogs.length} records. Use Print to review or save a shareable PDF, or download CSV for the full journal.</p><button style={css.primary} onClick={() => window.print()}>Print / Save weekly summary</button><button style={{ ...css.button, marginLeft: 8 }} onClick={exportWeeklyCsv}>Download this week as CSV</button></>)}<p style={{ color: '#667477' }}>Records can support healthcare conversations; they do not replace clinical interpretation.</p>{card('Export', <><button style={css.primary} onClick={exportCsv}>Download CSV report</button><span style={{ marginLeft: 12 }}>{data.glucose.length} glucose readings · {data.events.length} medication events · {data.logs.length} routine logs</span></>)}{card('Glucose history', recordList(data.glucose.slice(0, 30), x => `${x.value} ${x.unit} · ${x.context}`, { dateKey: 'recorded_at' }))}</>}
      {page === 'sensing' && <SensingCheckIn />}
      {page === 'settings' && <><h1>Settings &amp; privacy</h1>{card('Glucose unit', <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>Default unit<select style={css.input} value={unit} onChange={e => { setUnit(e.target.value); void saveSetting('unit', e.target.value) }}><option>mmol/L</option><option>mg/dL</option></select><span style={{ color: '#667477' }}>South African default: mmol/L</span></label>)}{card('Appearance', <div style={{ display: 'grid', gap: 12 }}><label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>Color theme<select style={css.input} value={theme} onChange={e => { const next = e.target.value as 'light' | 'dark'; setTheme(next); void saveSetting('theme', next) }}><option value="light">Light</option><option value="dark">Dark</option></select></label><label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={compactLayout} onChange={e => { setCompactLayout(e.target.checked); void saveSetting('compact_layout', String(e.target.checked)) }} />Use compact spacing</label></div>)}{card('Choose dashboard cards', <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>{[['glucose', 'Glucose count'], ['medication', 'Medication plan'], ['logs', 'Recent entries'], ['trend', 'Glucose trend'], ['active', 'Active medication count']].map(([key, label]) => <label key={key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={dashboardCards.includes(key)} onChange={e => { const next = e.target.checked ? [...dashboardCards, key] : dashboardCards.filter(x => x !== key); setDashboardCards(next); void saveSetting('dashboard_cards', JSON.stringify(next)) }} />{label}</label>)}</div>)}{card('Privacy and data', <><p>Journal data is stored locally. Camera access is requested only when you start a check-in. The app does not record camera footage. SmartSpectra telemetry is disabled; authenticated service communication is used for measurement processing.</p><p>Biometric session summaries are not currently stored.</p><button style={css.button} onClick={() => void api.saveConsent(true)}>Opt in to future session summaries</button> <button style={css.button} onClick={() => void api.saveConsent(false)}>Withdraw summary consent</button><hr /><button style={{ ...css.primary, background: '#9b2226' }} onClick={async () => { if (confirm('Permanently delete all DiaRhythm data on this device?')) { await api.clearData(); await refresh() } }}>Delete all local data</button></>)}{card('Medical notice', <p>DiaRhythm is a personal diabetes-management and general wellness companion. It is not a medical device and does not diagnose, monitor, prevent or treat diabetes or its complications. Follow your healthcare professional’s instructions and prescribed treatment.</p>)}</>}
    </main>
    {editing && <div role="presentation" style={{ position: 'fixed', inset: 0, background: '#101e2b88', display: 'grid', placeItems: 'center', padding: 18, zIndex: 10 }} onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null) }}><section role="dialog" aria-modal="true" aria-labelledby="edit-title" style={{ ...css.card, width: 'min(640px,100%)', maxHeight: '90vh', overflow: 'auto' }}><h2 id="edit-title">Edit {editing.kind === 'glucose' ? 'glucose reading' : editing.kind === 'medication' ? 'medication' : 'routine entry'}</h2><form onSubmit={e => void saveEdit(e)} style={css.grid}>
      {editing.kind === 'glucose' ? <>{fieldStyle('value', 'Reading', editing.row.value, 'number', true)}<label style={css.field}>Unit<select name="unit" style={css.input} defaultValue={editing.row.unit as string}><option>mmol/L</option><option>mg/dL</option></select></label><label style={css.field}>Context<select name="context" style={css.input} defaultValue={String(editing.row.context || 'other')}><option value="fasting">Fasting</option><option value="before meal">Before meal</option><option value="after meal">After meal</option><option value="other">Other</option></select></label>{fieldStyle('recorded_at', 'Recorded at', String(editing.row.recorded_at || '').slice(0, 16), 'datetime-local', true)}<label style={css.field}>Notes<textarea name="notes" style={css.input} defaultValue={String(editing.row.notes || '')} /></label></> : editing.kind === 'medication' ? <>{fieldStyle('name', 'Medication name', editing.row.name, 'text', true)}{fieldStyle('prescribed_schedule', 'Prescribed schedule', editing.row.prescribed_schedule)}{fieldStyle('reminder_time', 'Reminder time', editing.row.reminder_time, 'time')}<label style={css.field}><span>Active medication</span><input name="active" type="checkbox" defaultChecked={Number(editing.row.active) === 1} /></label></> : <>{fieldStyle('description', 'Description', editing.row.description, 'text', true)}{fieldStyle('recorded_at', 'Recorded at', String(editing.row.recorded_at || '').slice(0, 16), 'datetime-local', true)}{fieldStyle('duration_minutes', 'Duration (minutes)', editing.row.duration_minutes, 'number')}<label style={css.field}>Notes<textarea name="notes" style={css.input} defaultValue={String(editing.row.notes || '')} /></label></>}
      <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'end', gap: 8 }}><button type="button" style={css.button} onClick={() => setEditing(null)}>Cancel</button><button style={css.primary}>Save changes</button></div></form></section></div>}
  </div>
}
