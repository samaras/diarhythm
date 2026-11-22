import { describe, expect, it } from 'vitest'
import {
  isValidReading,
  latestBreathingRate,
  latestBreathingWaveform,
  latestPulseReading,
} from '../../src/renderer/features/sensing/signal-quality'

describe('signal quality gating', () => {
  it('returns null for an empty pulse-rate array', () => {
    expect(latestPulseReading([])).toBeNull()
    expect(latestPulseReading(null as unknown as never[])).toBeNull()
    expect(latestPulseReading(undefined)).toBeNull()
  })

  it('rejects zero-confidence warm-up readings', () => {
    const entries = [
      { value: 70, confidence: 0, stable: true, timestamp: 1000 },
      { value: 72, confidence: 0, stable: true, timestamp: 2000 },
    ]
    expect(latestPulseReading(entries)).toBeNull()
    for (const entry of entries) expect(isValidReading(entry)).toBe(false)
  })

  it('rejects unstable readings even with high confidence', () => {
    const entries = [{ value: 80, confidence: 95, stable: false, timestamp: 3000 }]
    expect(latestPulseReading(entries)).toBeNull()
    expect(isValidReading(entries[0])).toBe(false)
  })

  it('accepts the newest stable, non-zero-confidence reading', () => {
    const entries = [
      { value: 68, confidence: 12, stable: true, timestamp: 1000 }, // warm-up, low confidence
      { value: 72, confidence: 0, stable: true, timestamp: 2000 }, // still warming up
      { value: 75, confidence: 87, stable: true, timestamp: 3000 }, // valid
      { value: 74, confidence: 91, stable: true, timestamp: 4000 }, // newest valid wins
    ]
    const reading = latestPulseReading(entries)
    expect(reading).toEqual({ value: 74, confidence: 91, timestamp: 4000, stable: true })
  })

  it('converts Long-like timestamps', () => {
    const entries = [{ value: 71, confidence: 60, stable: true, timestamp: { toNumber: () => 5000 } }]
    const reading = latestPulseReading(entries)
    expect(reading?.timestamp).toBe(5000)
  })

  it('treats missing confidence/stable as invalid', () => {
    expect(isValidReading({ value: 70 })).toBe(false)
    expect(isValidReading({ value: 70, confidence: 50 })).toBe(false)
    expect(isValidReading({ value: 70, stable: true })).toBe(false)
  })
})
describe('breathing signal quality gating', () => {
  it('returns null for empty chest/abdomen waveform traces', () => {
    expect(latestBreathingWaveform([])).toBeNull()
    expect(latestBreathingWaveform(null as unknown as never[])).toBeNull()
  })

  it('accepts the newest stable chest waveform sample (no confidence on waveforms)', () => {
    const chest = [
      { value: 0.1, stable: false, timestamp: 1000 },
      { value: 0.4, stable: true, timestamp: 2000 },
      { value: 0.7, stable: true, timestamp: 3000 },
    ]
    const w = latestBreathingWaveform(chest)
    expect(w).toEqual({ value: 0.7, stable: true, timestamp: 3000 })
  })

  it('falls back to abdomen when chest trace is absent', () => {
    const abdomen = [{ value: 0.3, stable: true, timestamp: 5000 }]
    const w = latestBreathingWaveform(abdomen)
    expect(w?.value).toBe(0.3)
    expect(w?.stable).toBe(true)
  })

  it('rejects unstable waveform samples', () => {
    const chest = [{ value: 0.5, stable: false, timestamp: 1000 }]
    expect(latestBreathingWaveform(chest)).toBeNull()
  })

  it('rejects zero-confidence warm-up breathing-rate readings', () => {
    const rate = [{ value: 14, confidence: 0, stable: true, timestamp: 1000 }]
    expect(latestBreathingRate(rate)).toBeNull()
    expect(isValidReading(rate[0])).toBe(false)
  })

  it('accepts stable breathing-rate readings (stable => confidence >= 45)', () => {
    const rate = [
      { value: 12, confidence: 30, stable: false, timestamp: 1000 },
      { value: 15, confidence: 60, stable: true, timestamp: 2000 },
      { value: 16, confidence: 80, stable: true, timestamp: 3000 },
    ]
    const r = latestBreathingRate(rate)
    expect(r).toEqual({ value: 16, confidence: 80, stable: true, timestamp: 3000 })
  })

  it('converts Long-like timestamps', () => {
    const rate = [{ value: 15, confidence: 70, stable: true, timestamp: { toNumber: () => 9000 } }]
    expect(latestBreathingRate(rate)?.timestamp).toBe(9000)
  })
})
