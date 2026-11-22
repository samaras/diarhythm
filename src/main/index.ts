import { app, BrowserWindow, ipcMain, Notification, session } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { config } from 'dotenv'
import { openDatabase } from './database/connection'

// Load .env in development so SMARTSPECTRA_API_KEY is available without
// exporting it in the shell. .env is gitignored and never committed.
config()

let mainWindow: BrowserWindow | null = null
let dbPath = ''
let sensingBridgeReady = false
let sensingBridgePromise: Promise<void> | null = null
let db: ReturnType<typeof openDatabase> | null = null
let reminderTimer: NodeJS.Timeout | null = null

function isTrustedRendererUrl(url: string): boolean {
  try {
    const u = new URL(url || '')
    // electron-vite exposes ELECTRON_RENDERER_URL (not VITE_DEV_SERVER_URL)
    // to the main process during dev. Accept either so the renderer's
    // http://localhost:5173 URL is trusted in development.
    const devUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL
    if (devUrl) {
      const dev = new URL(devUrl)
      return u.origin === dev.origin && u.pathname === dev.pathname
    }
    const rendererUrl = pathToFileURL(path.join(__dirname, '../renderer/index.html'))
    return u.protocol === 'file:' && u.href === rendererUrl.href
  } catch {
    return false
  }
}

function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents ||
      event.senderFrame !== event.sender.mainFrame || !isTrustedRendererUrl(event.senderFrame.url)) {
    throw new Error('Request from an untrusted renderer was rejected')
  }
}

function requiredText(value: unknown, label: string, maxLength = 1000): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${label} is required and must be at most ${maxLength} characters`)
  }
  return value.trim()
}

function validDateTime(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid date and time`)
  }
  return value
}

function optionalText(value: unknown, label: string, maxLength = 1000): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string' || value.length > maxLength) throw new Error(`${label} must be at most ${maxLength} characters`)
  return value.trim()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Wire the official SmartSpectra preload bridge for this window.
  sensingBridgePromise = bindSmartSpectraIpcFor(mainWindow)

  return mainWindow
}

/**
 * Attach `@smartspectra/node-sdk/main`'s `bindSmartSpectraIpc(window)` to a
 * BrowserWindow. The bridge owns one SmartSpectraSDK per renderer connection
 * and releases it when the window closes.
 *
 * The import is dynamic and guarded: the module loads the native runtime
 * (koffi + the platform shared library), which may be absent on a machine.
 * The window still opens in that case and sensing reports a clear error
 * instead of crashing Electron startup.
 */
async function bindSmartSpectraIpcFor(window: BrowserWindow): Promise<void> {
  try {
    const { bindSmartSpectraIpc } = await import('@smartspectra/node-sdk/main')
    bindSmartSpectraIpc(window, {
      logger: (level, msg) => {
        const log = level === 'error' ? console.error : console.warn
        log(`[smartspectra/main] ${msg}`)
      },
    })
    sensingBridgeReady = true
  } catch (err) {
    sensingBridgeReady = false
    console.error(
      'SmartSpectra: IPC bridge unavailable — camera sensing disabled until the native runtime is installed. ',
      err instanceof Error ? err.message : String(err),
    )
  }
}

app.whenReady().then(() => {
  if (app.isPackaged && process.platform === 'linux' && !process.env.SMARTSPECTRA_CAPI_PATH) {
    process.env.SMARTSPECTRA_CAPI_PATH = path.join(
      process.resourcesPath,
      'smartspectra',
      'node-sdk-linux-x64',
      'libsmartspectra_capi.so',
    )
  }

  // Local-only SQLite data directory, overridable via APP_DATA_DIR.
  // No cloud sync, no backend, no external AI service.
  const dataDir = process.env.APP_DATA_DIR || app.getPath('userData')
  dbPath = path.join(dataDir, 'diarhythm.sqlite')
  db = openDatabase(dbPath)
  startMedicationReminders()

  // Camera permission flows through Electron's native permission handler.
  // Grant media only for DiaRhythm's own app pages (file:// in production,
  // localhost during dev) and deny everything else, so a renderer that
  // later loads remote content can never auto-grant the camera.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const url = (details && details.requestingUrl) || ''
    callback(permission === 'media' && webContents === mainWindow?.webContents && isTrustedRendererUrl(url))
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function startMedicationReminders(): void {
  if (reminderTimer) clearInterval(reminderTimer)
  const checkReminders = () => {
    if (!db || !Notification.isSupported()) return
    const current = new Date()
    const date = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
    const minute = `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`
    if ((db.prepare("SELECT value FROM app_settings WHERE key='reminders_enabled'").get() as { value?: string })?.value !== 'true') return
    const meds = db.prepare('SELECT id,name,reminder_time FROM medications WHERE active=1 AND reminder_time=?').all(minute) as { id: number; name: string; reminder_time: string }[]
    for (const medication of meds) {
      const slot = `${date}:${medication.id}`
      if (db.prepare('SELECT 1 FROM medication_events WHERE medication_id=? AND substr(scheduled_at,1,10)=? LIMIT 1').get(medication.id, date)) continue
      const key = `reminder-fired:${slot}`
      if (db.prepare('SELECT 1 FROM app_settings WHERE key=?').get(key)) continue
      db.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key, 'true', new Date().toISOString())
      const notification = new Notification({ title: `Medication reminder · ${medication.name}`, body: 'Open DiaRhythm to record this scheduled medication.' })
      notification.on('click', () => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus() } })
      notification.show()
    }
  }
  checkReminders()
  reminderTimer = setInterval(checkReminders, 30_000)
}

// Narrow, validated operations exposed to the renderer through the preload bridge.
ipcMain.handle('db:ping', async (event) => { assertTrustedSender(event); return 'ok' })
ipcMain.handle('db:path', async (event) => { assertTrustedSender(event); return dbPath })

// SDK configuration for the renderer. The API key comes from the environment
// (SMARTSPECTRA_API_KEY) — never from source control.
ipcMain.handle('sensing:config', async (event) => {
  assertTrustedSender(event)
  await sensingBridgePromise
  return { apiKey: process.env.SMARTSPECTRA_API_KEY ?? undefined, bridgeReady: sensingBridgeReady }
})

const database = () => {
  if (!db) throw new Error('Local database is not available')
  return db
}
ipcMain.handle('data:all', (event) => { assertTrustedSender(event); return ({
  glucose: database().prepare('SELECT * FROM glucose_entries ORDER BY recorded_at DESC').all(),
  medications: database().prepare('SELECT * FROM medications ORDER BY active DESC, name').all(),
  events: database().prepare('SELECT * FROM medication_events ORDER BY scheduled_at DESC').all(),
  logs: database().prepare('SELECT * FROM daily_logs ORDER BY recorded_at DESC').all(),
  settings: Object.fromEntries((database().prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[]).map((r) => [r.key, r.value])),
}) })
ipcMain.handle('data:save', (event, kind: string, record: Record<string, unknown>) => {
  assertTrustedSender(event)
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid record')
  const d = database()
  const rawId = record.id === undefined ? undefined : Number(record.id)
  if (rawId !== undefined && (!Number.isSafeInteger(rawId) || rawId <= 0)) throw new Error('Invalid record id')
  const id = rawId
  if (kind === 'glucose') {
    const value = Number(record.value)
    if (!Number.isFinite(value) || value <= 0 || value > 1000 || !['mmol/L', 'mg/dL'].includes(String(record.unit))) throw new Error('Enter a positive glucose value and valid unit')
    const context = optionalText(record.context ?? 'other', 'Context', 100)
    const recordedAt = validDateTime(record.recorded_at, 'Recorded time')
    const notes = optionalText(record.notes, 'Notes')
    if (id) d.prepare('UPDATE glucose_entries SET value=?, unit=?, context=?, recorded_at=?, notes=? WHERE id=?').run(value, record.unit, context, recordedAt, notes, id)
    else d.prepare('INSERT INTO glucose_entries(value,unit,context,recorded_at,notes) VALUES(?,?,?,?,?)').run(value, record.unit, context, recordedAt, notes)
  } else if (kind === 'medication') {
    const name = requiredText(record.name, 'Medication name', 200)
    const schedule = optionalText(record.prescribed_schedule, 'Prescribed schedule', 200)
    const reminder = optionalText(record.reminder_time, 'Reminder time', 5)
    if (reminder && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder)) throw new Error('Reminder time must use HH:MM')
    if (id) d.prepare('UPDATE medications SET name=?, prescribed_schedule=?, reminder_time=?, active=? WHERE id=?').run(name, schedule, reminder, record.active === true || Number(record.active) === 1 ? 1 : 0, id)
    else d.prepare('INSERT INTO medications(name,prescribed_schedule,reminder_time) VALUES(?,?,?)').run(name, schedule, reminder)
  } else if (kind === 'event') {
    if (!['taken', 'skipped'].includes(String(record.status))) throw new Error('Choose taken or skipped')
    const medicationId = Number(record.medication_id)
    if (!Number.isSafeInteger(medicationId) || medicationId <= 0) throw new Error('Choose a valid medication')
    const scheduledAt = validDateTime(record.scheduled_at, 'Scheduled time')
    d.prepare('INSERT INTO medication_events(medication_id,scheduled_at,status,recorded_at) VALUES(?,?,?,?)').run(medicationId, scheduledAt, record.status, new Date().toISOString())
  } else if (['meal', 'activity', 'note'].includes(kind)) {
    const description = requiredText(record.description, 'Description')
    const recordedAt = validDateTime(record.recorded_at, 'Recorded time')
    const notes = optionalText(record.notes, 'Notes')
    const duration = record.duration_minutes === undefined || record.duration_minutes === null || record.duration_minutes === '' ? null : Number(record.duration_minutes)
    if (duration !== null && (!Number.isSafeInteger(duration) || duration < 0 || duration > 1440)) throw new Error('Duration must be between 0 and 1440 minutes')
    if (id) d.prepare('UPDATE daily_logs SET description=?, recorded_at=?, duration_minutes=?, notes=? WHERE id=?').run(description, recordedAt, duration, notes, id)
    else d.prepare('INSERT INTO daily_logs(kind,description,recorded_at,duration_minutes,notes) VALUES(?,?,?,?,?)').run(kind, description, recordedAt, duration, notes)
  } else throw new Error('Unsupported record type')
  return true
})
ipcMain.handle('data:delete', (event, kind: string, id: number) => {
  assertTrustedSender(event)
  const tables: Record<string, string> = { glucose: 'glucose_entries', medication: 'medications', log: 'daily_logs' }
  if (!tables[kind]) throw new Error('Unsupported record type')
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('Invalid record id')
  database().prepare(`DELETE FROM ${tables[kind]} WHERE id=?`).run(Number(id))
  return true
})
ipcMain.handle('data:settings', (event, key: string, value: string) => {
  assertTrustedSender(event)
  const allowed = new Set(['reminders_enabled', 'unit', 'dashboard_cards', 'theme', 'compact_layout'])
  if (!allowed.has(key) || typeof value !== 'string' || value.length > 500) throw new Error('Unsupported setting')
  if (key === 'reminders_enabled' && !['true', 'false'].includes(value)) throw new Error('Invalid reminder setting')
  if (key === 'unit' && !['mmol/L', 'mg/dL'].includes(value)) throw new Error('Invalid glucose unit')
  if (key === 'theme' && !['light', 'dark'].includes(value)) throw new Error('Invalid theme')
  if (key === 'compact_layout' && !['true', 'false'].includes(value)) throw new Error('Invalid layout preference')
  if (key === 'dashboard_cards') {
    let cards: unknown
    try { cards = JSON.parse(value) } catch { throw new Error('Invalid dashboard setting') }
    if (!Array.isArray(cards) || cards.some(card => !['glucose', 'medication', 'logs', 'trend', 'active'].includes(card))) throw new Error('Invalid dashboard setting')
  }
  database().prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run(key, value, new Date().toISOString())
  return true
})
ipcMain.handle('data:consent', (event, granted: boolean) => {
  assertTrustedSender(event)
  if (typeof granted !== 'boolean') throw new Error('Invalid consent value')
  database().prepare('INSERT INTO consent_records(consent_type,policy_version,granted_at,withdrawn_at) VALUES(?,?,?,?)').run('biometric-summary-storage', '1', new Date().toISOString(), granted ? null : new Date().toISOString())
  return true
})
ipcMain.handle('data:clear', (event) => {
  assertTrustedSender(event)
  const d = database()
  d.exec('DELETE FROM medication_events; DELETE FROM medications; DELETE FROM daily_logs; DELETE FROM glucose_entries; DELETE FROM consent_records; DELETE FROM app_settings; VACUUM;')
  return true
})
