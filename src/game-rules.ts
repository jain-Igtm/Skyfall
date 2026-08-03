export const LOOK_SENSITIVITIES = [1.15, 1.6, 2.05] as const

export function nextSensitivityIndex(current: number): number {
  return (Math.max(0, Math.floor(current)) + 1) % LOOK_SENSITIVITIES.length
}

export function damageAfterSuit(rawDamage: number, suited: boolean): number {
  const safeDamage = Math.max(0, rawDamage)
  return suited ? safeDamage * 0.72 : safeDamage
}

export function ghostCountForWave(wave: number): number {
  return Math.min(18, 3 + Math.max(0, Math.floor(wave) - 1) * 2)
}

export function ghostHealthForWave(wave: number): number {
  return 74 + Math.max(0, Math.floor(wave) - 1) * 16
}

export function repairProgress(repairedSystems: ReadonlySet<string>): number {
  return ['life-support', 'coolant', 'relay'].filter((id) => repairedSystems.has(id)).length
}
