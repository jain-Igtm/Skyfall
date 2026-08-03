import { describe, expect, it } from 'vitest'
import {
  LOOK_SENSITIVITIES,
  damageAfterSuit,
  ghostCountForWave,
  ghostHealthForWave,
  nextSensitivityIndex,
  repairProgress,
} from './game-rules'

describe('Skyfall rules', () => {
  it('preserves ASHFALL sensitivity cycling', () => {
    expect(LOOK_SENSITIVITIES).toEqual([1.15, 1.6, 2.05])
    expect(nextSensitivityIndex(0)).toBe(1)
    expect(nextSensitivityIndex(2)).toBe(0)
  })

  it('caps a mobile-safe ghost wave', () => {
    expect(ghostCountForWave(1)).toBe(3)
    expect(ghostCountForWave(20)).toBe(18)
    expect(ghostHealthForWave(3)).toBe(106)
  })

  it('tracks only critical repair systems', () => {
    expect(repairProgress(new Set(['life-support', 'relay', 'mask']))).toBe(2)
  })

  it('lets the mining suit absorb part of a strike', () => {
    expect(damageAfterSuit(25, false)).toBe(25)
    expect(damageAfterSuit(25, true)).toBe(18)
  })
})
