import { useEffect, useState } from 'react'

const CARD_STYLE: React.CSSProperties = {
  border: '1px solid #d8dee5',
  borderRadius: 12,
  padding: 20,
  background: '#ffffff',
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

export default function Settings() {
  const api = (window as unknown as {
    api?: {
      saveConsent: (granted: boolean) => Promise<boolean>
      saveSetting: (key: string, value: string) => Promise<boolean>
      clearData: () => Promise<boolean>
    }
  }).api

  const [biometricConsent, setBiometricConsent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Consent state is managed locally; persist on change
  }, [])

  const toggleBiometricConsent = async () => {
    if (!api) return
    const next = !biometricConsent
    setSaving(true)
    setMessage('')
    try {
      await api.saveConsent(next)
      setBiometricConsent(next)
      setMessage(next ? 'Biometric summary storage enabled.' : 'Biometric summary storage disabled.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update consent')
    } finally {
      setSaving(false)
    }
  }

  const clearAll = async () => {
    if (!api) return
    if (!window.confirm('This will delete all local data. Continue?')) return
    setSaving(true)
    setMessage('')
    try {
      await api.clearData()
      setMessage('All local data cleared.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to clear data')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: 24, color: '#101E2B', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: '0 0 16px 0', fontSize: 20 }}>Settings</h2>

      <div style={CARD_STYLE}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: 15 }}>Biometric data</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#55606a', lineHeight: 1.5 }}>
          Pulse and breathing readings are held in memory during a check-in and are not saved in
          this release. This preference records your choice for a future storage feature only.
          SmartSpectra measurements are general wellness information only — they never estimate
          glucose, diagnose conditions, or recommend treatment changes.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={biometricConsent}
            onChange={toggleBiometricConsent}
            disabled={saving}
          />
          <span>Opt in to future biometric summary storage</span>
        </label>
        {saving && <span style={{ fontSize: 12, color: '#55606a' }}>Saving…</span>}
        {message && <p style={{ fontSize: 12, color: '#174a43', marginTop: 8 }}>{message}</p>}
      </div>

      <div style={{ marginTop: 16, ...CARD_STYLE }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: 15 }}>Danger zone</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#55606a' }}>
          This deletes all locally stored data (glucose, medications, logs, consent records).
        </p>
        <button style={{ ...BUTTON_PRIMARY, background: '#b3261e' }} onClick={clearAll} disabled={saving}>
          Clear all data
        </button>
      </div>

      <div style={{ marginTop: 16, ...CARD_STYLE }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: 15 }}>Privacy notices</h3>
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: '#55606a', lineHeight: 1.6 }}>
          <li>Camera access is requested only after explicit consent.</li>
          <li>DiaRhythm never records or saves camera footage.</li>
          <li>SDK telemetry is disabled ({'<code>enableTelemetry: false</code>'}).</li>
          <li>
            The SDK authenticates with Presage&rsquo;s service over an authenticated TLS channel
            for measurement processing. This network communication is disclosed here.
          </li>
          <li>
            SmartSpectra is for general wellness information only. It does not estimate glucose,
            diagnose diabetes or complications, or recommend medication or treatment changes.
          </li>
        </ul>
      </div>
    </div>
  )
}