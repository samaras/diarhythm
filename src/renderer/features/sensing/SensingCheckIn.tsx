import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SensingSession,
  BreathingRate,
  BreathingWaveform,
  ValidationNotice,
  SessionEvent,
} from './session'

const CARD_STYLE: React.CSSProperties = {
  border: '1px solid #d8dee5',
  borderRadius: 12,
  padding: 24,
  background: '#ffffff',
}

const BUTTON_PRIMARY: React.CSSProperties = {
  background: '#101E2B',
  color: '#ffffff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const BUTTON_DANGER: React.CSSProperties = {
  ...BUTTON_PRIMARY,
  background: '#b3261e',
}

const BUTTON_OUTLINE: React.CSSProperties = {
  ...BUTTON_PRIMARY,
  background: 'transparent',
  color: '#101E2B',
  border: '1px solid #101E2B',
}

const CHIP: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  borderRadius: 20,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 600,
}

export default function SensingCheckIn() {
  const sessionRef = useRef<SensingSession | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [configLoaded, setConfigLoaded] = useState(false)
  const [bridgeReady, setBridgeReady] = useState(false)
  const [apiKey, setApiKey] = useState<string | undefined>(undefined)
  const [phase, setPhase] = useState<'consent' | 'measuring' | 'stopped' | 'error'>('consent')
  const [status, setStatus] = useState<string>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [breathingRate, setBreathingRate] = useState<BreathingRate | null>(null)
  const [waveform, setWaveform] = useState<BreathingWaveform | null>(null)
  const [validation, setValidation] = useState<ValidationNotice | null>(null)
  const [sdkError, setSdkError] = useState<{ message: string; retryable: boolean } | null>(null)

  const handleEvent = useCallback((event: SessionEvent) => {
    switch (event.type) {
      case 'config':
        setApiKey(event.apiKey)
        setBridgeReady(event.bridgeReady)
        setConfigLoaded(true)
        break
      case 'status':
        setStatus(event.status)
        if (event.status === 'running') setPhase('measuring')
        else if (event.status === 'error') setPhase('error')
        else setPhase('stopped')
        break
      case 'stream':
        setStream(event.stream)
        if (videoRef.current) videoRef.current.srcObject = event.stream ?? null
        break
      case 'breathing':
        setBreathingRate(event.rate)
        setWaveform(event.waveform)
        break
      case 'validation':
        setValidation(event.notice)
        break
      case 'sdkError':
        setSdkError({ message: event.error.message, retryable: event.error.retryable })
        setPhase('error')
        break
    }
  }, [])

  useEffect(() => {
    const s = new SensingSession()
    sessionRef.current = s
    s.subscribe(handleEvent)
    void s.loadConfig().catch((err) => {
      setSdkError({
        message: err instanceof Error ? err.message : 'Failed to initialize sensing',
        retryable: true,
      })
      setPhase('error')
    })
    return () => {
      s.subscribe(() => {})
      void s.stop().catch(() => {})
    }
  }, [handleEvent])

  const startMeasurement = async () => {
    if (!apiKey) return
    setSdkError(null)
    setPhase('measuring')
    try {
      await sessionRef.current!.start(apiKey)
    } catch (err) {
      setSdkError({
        message: err instanceof Error ? err.message : 'Failed to start the measurement',
        retryable: true,
      })
      setPhase('error')
    }
  }

  const stopMeasurement = async () => {
    await sessionRef.current?.stop()
    setPhase('stopped')
    setBreathingRate(null)
    setWaveform(null)
    setValidation(null)
    setSdkError(null)
  }

  const retry = async () => {
    setSdkError(null)
    try { await sessionRef.current?.stop() } catch { /* reset state so a fresh session can be attempted */ }
    setPhase('consent')
  }

  // ---------- config not ready ----------
  if (!configLoaded) {
    return (
      <div style={{ padding: 24, color: '#101E2B', fontFamily: 'system-ui, sans-serif' }}>
        Initializing SmartSpectra sensing…
      </div>
    )
  }

  // ---------- SDK bridge unavailable ----------
  if (!bridgeReady) {
    return (
      <div style={{ padding: 24, color: '#101E2B', fontFamily: 'system-ui, sans-serif' }}>
        <div style={CARD_STYLE}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: 18 }}>Sensing unavailable</h2>
          <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#55606a' }}>
            The SmartSpectra main-process bridge could not be started. The native SDK runtime
            (@smartspectra/node-sdk with its platform native package) is not installed on this
            machine, so camera sensing cannot run.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: '#8a94a0' }}>
            The rest of DiaRhythm remains usable. Install the SDK runtime and restart to enable
            the physiological check-in.
          </p>
        </div>
      </div>
    )
  }

  // ---------- API key not configured ----------
  if (!apiKey) {
    return (
      <div style={{ padding: 24, color: '#101E2B', fontFamily: 'system-ui, sans-serif' }}>
        <div style={CARD_STYLE}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: 18 }}>API key not configured</h2>
          <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#55606a' }}>
            `SMARTSPECTRA_API_KEY` is not set. Create a `.env` (from `.env.example`) with your
            Presage SmartSpectra API key and restart DiaRhythm. The key is never stored in source
            control.
          </p>
          <button style={BUTTON_OUTLINE} onClick={retry}>
            Retry after configuring
          </button>
        </div>
      </div>
    )
  }

  // ---------- consent ----------
  if (phase === 'consent') {
  return (
    <div style={{ padding: 24, color: '#101E2B', fontFamily: 'system-ui, sans-serif' }}>
      <div style={CARD_STYLE}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: 20 }}>Physiological check-in</h2>
        <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#55606a', lineHeight: 1.5 }}>
          DiaRhythm can measure your <b>breathing rate</b> from the camera using Presage SmartSpectra
          — no wearables, no contact.
        </p>
        <ul style={{ margin: '0 0 16px 0', paddingLeft: 18, fontSize: 13, color: '#55606a', lineHeight: 1.6 }}>
          <li>Camera access is requested only after you consent below.</li>
          <li>DiaRhythm never records or saves camera footage.</li>
          <li>
            Measurements are general wellness information only — not a diagnosis or treatment
            advice.
          </li>
          <li>
            SDK telemetry is disabled ({'<b>enableTelemetry: false</b>'}); the SDK still
            authenticates with Presage's service over an authenticated TLS channel, which is
            disclosed in the privacy notice.
          </li>
          <li>Readings are used for this check-in only and are not saved in this release.</li>
        </ul>
        <p style={{ margin: '0 0 20px 0', fontSize: 12.5, color: '#8a94a0' }}>
          Breathing analysis needs about 30 seconds of steady camera view before a confident reading
          appears. Early readings show zero confidence and are not treated as valid measurements.
        </p>
        <button style={BUTTON_PRIMARY} onClick={startMeasurement}>
          I consent — start camera and measure breathing
        </button>
      </div>
    </div>
  )
}

// ---------- error ----------
if (phase === 'error') {
  const hint =
    sdkError?.retryable
      ? 'You can retry — camera access will be requested again.'
      : 'This session cannot be retried. Restart DiaRhythm to try again.'

  return (
    <div style={{ padding: 24, color: '#101E2B', fontFamily: 'system-ui, sans-serif' }}>
      <div style={CARD_STYLE}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: 18 }}>Measurement error</h2>
        <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#b3261e' }}>{sdkError?.message}</p>
        <p style={{ margin: '0 0 20px 0', fontSize: 13, color: '#55606a' }}>{hint}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {sdkError?.retryable && (
            <button style={BUTTON_OUTLINE} onClick={retry}>Try again</button>
          )}
          <button style={BUTTON_DANGER} onClick={retry}>
            Back to consent
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- measuring / stopped ----------
  const validBreathing = breathingRate && breathingRate.stable && breathingRate.confidence > 0

  return (
    <div style={{ padding: 24, color: '#101E2B', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <div style={CARD_STYLE}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span
                style={{
                  ...CHIP,
                  background:
                    status === 'running'
                      ? '#e3f7ee'
                      : status === 'starting'
                        ? '#fff4e0'
                        : '#f2f5f7',
                  color:
                    status === 'running' ? '#174a43' : status === 'starting' ? '#8a5a00' : '#55606a',
                }}
              >
                {status === 'running' ? 'Live' : status === 'starting' ? 'Starting…' : 'Idle'}
              </span>
              {validation && (
                <span
                  style={{
                    ...CHIP,
                    background: validation.code === 0 ? '#e3f7ee' : '#fdecec',
                    color: validation.code === 0 ? '#174a43' : '#9b2226',
                  }}
                >
                  {validation.hint}
                </span>
              )}
            </div>

            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{
                width: '100%',
                height: 'auto',
                aspectRatio: '16 / 9',
                background: '#0b1016',
                borderRadius: 8,
                objectFit: 'cover',
              }}
            />

            <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {phase === 'measuring' && !stream && (
                <span style={{ fontSize: 13, color: '#8a94a0' }}>Waiting for camera stream…</span>
              )}
              {stream && !validBreathing && phase === 'measuring' && (
                <span style={{ fontSize: 13, color: '#8a94a0' }}>
                  Analyzing… breathing needs about 30 seconds of a steady view.
                </span>
              )}
              {validBreathing && (
                <>
                  <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-1px' }}>
                    {Math.round(breathingRate.value)} <span style={{ fontSize: 18, color: '#55606a' }}>breaths/min</span>
                  </span>
                  <span
                    style={{
                      ...CHIP,
                      background: '#eef4fb',
                      color: '#1d4e89',
                      border: '1px solid #b9cfe6',
                    }}
                  >
                    confidence {Math.round(breathingRate.confidence)}%
                  </span>
                  <span style={{ fontSize: 12.5, color: '#8a94a0' }}>live breathing rate</span>
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 18, flexWrap: 'wrap' }}>
              <div aria-label={validBreathing ? `Breathing at ${Math.round(breathingRate.value)} breaths per minute` : 'Breathing measurement unavailable'} role="img" style={{ width: 86, height: 86, flex: '0 0 86px', borderRadius: '50%', background: validBreathing ? 'radial-gradient(circle at 35% 30%, #a5eadb, #55C8B5 65%, #174A43)' : '#d8dee5', opacity: validBreathing ? 1 : 0.55, animation: validBreathing ? `breathingPulse ${Math.max(3, 60 / breathingRate.value)}s ease-in-out infinite` : 'none', boxShadow: validBreathing ? '0 0 28px #55c8b566' : 'none' }} />
              <div style={{ fontSize: 11, color: '#8a94a0', marginBottom: 4 }}>Waveform sample: {waveform ? waveform.value.toFixed(1) : '—'}</div>
              <div><div style={{ fontSize: 12, color: '#667477' }}>BREATHING SPACE</div>{validBreathing ? <strong style={{ fontSize: 24 }}>{Math.round(breathingRate.value)} <small style={{ fontSize: 14 }}>breaths/min</small></strong> : <span style={{ color: '#667477' }}>Waiting for a stable breathing signal</span>}<div style={{ fontSize: 12, color: '#667477' }}>{validBreathing ? 'The glow gently follows the measured rhythm.' : 'The visual stays still until a stable signal is available.'}</div><div style={{ fontSize: 12, color: '#667477', marginTop: 5 }}>Follow your own comfortable pace; this is a visual guide, not a breathing target.</div></div>
            </div>

            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
              <button style={BUTTON_DANGER} onClick={stopMeasurement}>
                Stop measurement
              </button>
              {phase === 'stopped' && (
                <button style={BUTTON_OUTLINE} onClick={() => setPhase('consent')}>
                  New session
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={CARD_STYLE}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: 15 }}>What you're seeing</h3>
            <p style={{ margin: 0, fontSize: 13, color: '#55606a', lineHeight: 1.5 }}>
              The preview is the browser-owned camera stream. The breathing rate above comes from the
              decoded SmartSpectra measurement payload — not a placeholder or animation.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13, color: '#55606a', lineHeight: 1.5 }}>For a clearer signal, keep your face and upper chest in frame, face the camera, hold still, and use steady light. The quality message above will tell you what to adjust.</p>
          </div>
          <div style={CARD_STYLE}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: 15 }}>Quality &amp; privacy</h3>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: '#55606a', lineHeight: 1.6 }}>
              <li>Zero-confidence warm-up readings are ignored.</li>
              <li>{stream ? 'Camera is active (OS indicator on).' : 'Camera is not active.'}</li>
              <li>Stopping releases the camera and shuts down the SDK session.</li>
              <li>No raw video is stored by DiaRhythm.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
