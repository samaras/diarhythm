import {
  latestBreathingRate,
  latestBreathingWaveform,
  type BreathingRate,
  type BreathingWaveform,
} from './signal-quality'
import {
  SmartSpectraSDK,
  breathingMetrics,
  ProcessingStatus,
  ValidationCode,
} from '@smartspectra/node-sdk/renderer'
import { decodeMetrics } from '@smartspectra/node-sdk/messages'

export type { BreathingRate, BreathingWaveform }

export type ProcessingStatusName =
  | 'uninitialized'
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

export interface ValidationNotice {
  code: number
  hint: string
}

export interface SdkError {
  message: string
  code: number
  retryable: boolean
}

export type SessionEvent =
  | { type: 'config'; apiKey: string | undefined; bridgeReady: boolean }
  | { type: 'status'; status: ProcessingStatusName }
  | { type: 'stream'; stream: MediaStream | null }
  | { type: 'breathing'; rate: BreathingRate | null; waveform: BreathingWaveform | null }
  | { type: 'validation'; notice: ValidationNotice | null }
  | { type: 'sdkError'; error: SdkError }

const STATUS_NAMES: Record<number, ProcessingStatusName> = {
  [ProcessingStatus.kUninitialized]: 'uninitialized',
  [ProcessingStatus.kIdle]: 'idle',
  [ProcessingStatus.kStarting]: 'starting',
  [ProcessingStatus.kRunning]: 'running',
  [ProcessingStatus.kStopping]: 'stopping',
  [ProcessingStatus.kError]: 'error',
}

const VALIDATION_HINTS: Record<number, string> = {
  [ValidationCode.kOk]: 'Signal quality is good',
  [ValidationCode.kNoFaceFound]: 'No face detected — face the camera',
  [ValidationCode.kMultipleFacesFound]: 'Multiple faces detected — one person in frame',
  [ValidationCode.kFaceNotCentered]: 'Center your face in the frame',
  [ValidationCode.kFaceTooClose]: 'Move slightly farther from the camera',
  [ValidationCode.kFaceTooFar]: 'Move slightly closer to the camera',
  [ValidationCode.kFaceTooHigh]: 'Move your face lower in the frame',
  [ValidationCode.kFaceTooLow]: 'Move your face higher in the frame',
  [ValidationCode.kFaceNotForward]: 'Face the camera directly',
  [ValidationCode.kTooDark]: 'Lighting is too dim — add light',
  [ValidationCode.kTooBright]: 'Lighting is too bright — reduce glare',
  [ValidationCode.kChestNotVisible]: 'Keep your chest visible in the frame',
  [ValidationCode.kCameraTuning]: 'Camera is adjusting — hold still',
  [ValidationCode.kFrameRateTooLow]: 'Frame rate is too low for a reliable measurement',
  [ValidationCode.kExcessiveMotion]: 'Too much motion — hold still',
}

/**
 * Thin wrapper around the renderer-side SmartSpectraSDK.
 *
 * Quality rules:
 * - Breathing-rate is reported only when `stable` is true and confidence is
 *   non-zero (stable corresponds to breathing-rate confidence >= 45). Early
 *   warm-up packets carry confidence 0 and are never shown as valid.
 * - The chest/abdomen waveform samples carry `value` and `stable` but no
 *   independent confidence — `stable` is inherited from the breathing-rate
 *   verdict. Never invent a waveform confidence percentage.
 * - Telemetry is explicitly disabled (`enableTelemetry: false`).
 */
export class SensingSession {
  private sdk: SmartSpectraSDK | null = null
  private emit?: (event: SessionEvent) => void

  subscribe(emit: (event: SessionEvent) => void) {
    this.emit = emit
  }

  private emitEvent(event: SessionEvent) {
    this.emit?.(event)
  }

  /** Load SDK configuration (API key + bridge readiness) from the main process. */
  async loadConfig(): Promise<{ apiKey?: string; bridgeReady: boolean }> {
    const api = (window as unknown as {
      api?: { sensingConfig: () => Promise<{ apiKey?: string; bridgeReady: boolean }> }
    }).api
    if (!api) throw new Error('Preload bridge is unavailable — context isolation misconfigured')

    const config = await api.sensingConfig()
    this.emitEvent({ type: 'config', apiKey: config.apiKey, bridgeReady: config.bridgeReady })
    return config
  }

  /** Create the SDK, subscribe to its events, and start the measurement. */
  async start(apiKey: string): Promise<void> {
    if (this.sdk) return

    this.sdk = new SmartSpectraSDK({
      apiKey,
      // Default breathingMetrics bundle (chest breathing, abdomen breathing,
      // breathing rate). Omitting requestedMetrics is equivalent to this.
      requestedMetrics: [...breathingMetrics],
      // Telemetry is off for the MVP; the SDK's authenticated service
      // communication (auth / measurement) is disclosed to the user.
      enableTelemetry: false,
    })

    this.sdk.on('processingStatus', (status) => {
      this.emitEvent({ type: 'status', status: STATUS_NAMES[status] ?? 'idle' })
    })

    this.sdk.on('streamAvailable', (stream) => {
      this.emitEvent({ type: 'stream', stream })
    })

    this.sdk.on('metrics', (buf) => {
      const metrics = decodeMetrics(buf)
      // Prefer the chest waveform sample, fall back to abdomen. Neither has an
      // independent confidence score — stability is inherited from the
      // breathing-rate verdict.
      const upperTrace = metrics?.breathing?.upperTrace
      const lowerTrace = metrics?.breathing?.lowerTrace
      this.emitEvent({
        type: 'breathing',
        rate: latestBreathingRate(metrics?.breathing?.rate),
        waveform: latestBreathingWaveform(upperTrace ?? lowerTrace),
      })
    })

    this.sdk.on('validationStatus', (code, _timestampUs, hint) => {
      this.emitEvent({
        type: 'validation',
        notice: { code, hint: VALIDATION_HINTS[code] ?? hint ?? `Validation code ${code}` },
      })
    })

    this.sdk.on('error', (code, message, retryable) => {
      this.emitEvent({ type: 'status', status: 'error' })
      this.emitEvent({ type: 'sdkError', error: { message, code, retryable } })
    })

    const sdk = this.sdk
    try {
      await sdk.start()
    } catch (error) {
      try { await sdk.stop() } catch { /* startup may have failed before a session existed */ }
      sdk.destroy()
      if (this.sdk === sdk) this.sdk = null
      this.emitEvent({ type: 'stream', stream: null })
      this.emitEvent({ type: 'breathing', rate: null, waveform: null })
      this.emitEvent({ type: 'validation', notice: null })
      throw error
    }
  }

  /** Stop processing, release the SDK-acquired camera and tear down the SDK. */
  async stop(): Promise<void> {
    if (!this.sdk) return
    const sdk = this.sdk
    try {
      await sdk.stop()
    } finally {
      sdk.destroy()
      if (this.sdk === sdk) this.sdk = null
      this.emitEvent({ type: 'stream', stream: null })
      this.emitEvent({ type: 'breathing', rate: null, waveform: null })
      this.emitEvent({ type: 'validation', notice: null })
      this.emitEvent({ type: 'status', status: 'idle' })
    }
  }
}

