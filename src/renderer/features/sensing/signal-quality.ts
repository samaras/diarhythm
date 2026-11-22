/**
 * Pure quality helpers for SmartSpectra measurements.
 *
 * Kept free of SDK imports so they can be unit-tested without the native
 * runtime or the Electron preload bridge (see docs/Plan.md §12).
 */

/** A measurement entry as delivered in a decoded `Metrics` packet. */
export interface MeasurementEntry {
  value?: number | null
  confidence?: number | null
  stable?: boolean | null
  timestamp?: number | { toNumber?: () => number } | null
}

/** A quality-accepted pulse reading. */
export interface PulseReading {
  value: number // beats per minute
  confidence: number // 0..100
  timestamp: number // microseconds
  stable: boolean
}

/**
 * A reading counts only when the SDK marks it `stable` and confidence is
 * non-zero. Early warm-up packets carry confidence 0 and are never valid
 * measurements — they must not be displayed as live vitals.
 */
export function isValidReading(entry: MeasurementEntry): boolean {
  return entry.stable === true && Number(entry.confidence ?? 0) > 0
}

function toNumber(value: number | { toNumber?: () => number } | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  return typeof value.toNumber === 'function' ? value.toNumber() : 0
}

/**
 * Return the newest quality-accepted pulse reading from a decoded
 * `cardio.pulseRate` array, or null while the session is still warming up.
 * Reads from the end of the array (newest entry first).
 */
export function latestPulseReading(entries: readonly MeasurementEntry[] | null | undefined): PulseReading | null {
  if (!entries || entries.length === 0) return null

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (isValidReading(entry)) {
      return {
        value: Number(entry.value ?? 0),
        confidence: Number(entry.confidence ?? 0),
        timestamp: toNumber(entry.timestamp),
        stable: true,
      }
    }
  }
  return null
}

/**
 * A single breathing waveform sample (chest or abdomen). These carry `value`
 * and `stable` but NO independent confidence score — stability is inherited
 * from the breathing-rate verdict (stable corresponds to breathing-rate
 * confidence >= 45). Never invent a confidence percentage for a waveform.
 */
export interface BreathingWaveform {
  value: number // waveform sample amplitude
  stable: boolean // inherited from the breathing-rate verdict
  timestamp: number // microseconds
}

/** A breathing-rate reading (breaths per minute, with confidence). */
export interface BreathingRate {
  value: number // breaths per minute
  confidence: number // 0..100
  stable: boolean
  timestamp: number
}

/**
 * Return the newest stable breathing waveform sample, or null while warming up.
 * Waveform samples have no confidence of their own, so only `stable` gates them.
 * Reads from the end of the array (newest entry first).
 */
export function latestBreathingWaveform(
  entries: readonly MeasurementEntry[] | null | undefined,
): BreathingWaveform | null {
  if (!entries || entries.length === 0) return null

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (entry.stable === true) {
      return {
        value: Number(entry.value ?? 0),
        stable: true,
        timestamp: toNumber(entry.timestamp),
      }
    }
  }
  return null
}

/**
 * Return the newest stable breathing-rate reading, or null while warming up.
 */
export function latestBreathingRate(entries: readonly MeasurementEntry[] | null | undefined): BreathingRate | null {
  if (!entries || entries.length === 0) return null

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (isValidReading(entry)) {
      return {
        value: Number(entry.value ?? 0),
        confidence: Number(entry.confidence ?? 0),
        stable: true,
        timestamp: toNumber(entry.timestamp),
      }
    }
  }
  return null
}