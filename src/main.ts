import * as THREE from 'three'
import { App } from '@capacitor/app'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { StatusBar } from '@capacitor/status-bar'
import { StationAudio } from './audio'
import {
  LOOK_SENSITIVITIES,
  damageAfterSuit,
  ghostCountForWave,
  ghostHealthForWave,
  nextSensitivityIndex,
  repairProgress,
} from './game-rules'
import { createGhost, disposeGhost, updateGhostVisual, type Ghost } from './ghosts'
import { buildStation, type StationInteraction } from './station'
import './styles.css'
import './ashfall-expansion.css'
import './ashfall-polish.css'
import './skyfall.css'

type WeaponId = 'carbine' | 'scattergun'

type WeaponDefinition = {
  id: WeaponId
  name: string
  magazineSize: number
  startingReserve: number
  fireDelay: number
  reloadTime: number
  damage: number
  headshotMultiplier: number
  pellets: number
  spread: number
  automatic: boolean
  viewPosition: [number, number, number]
  scope?: 'reflex'
  scopeFov?: number
}

const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  carbine: {
    id: 'carbine',
    name: 'RUSTLINE CARBINE',
    magazineSize: 30,
    startingReserve: 180,
    fireDelay: 0.105,
    reloadTime: 1.65,
    damage: 35,
    headshotMultiplier: 1.72,
    pellets: 1,
    spread: 0.0032,
    automatic: true,
    viewPosition: [0.34, -0.29, -0.61],
    scope: 'reflex',
    scopeFov: 52,
  },
  scattergun: {
    id: 'scattergun',
    name: 'BREACH SCATTERGUN',
    magazineSize: 7,
    startingReserve: 49,
    fireDelay: 0.72,
    reloadTime: 2.08,
    damage: 18,
    headshotMultiplier: 1.4,
    pellets: 8,
    spread: 0.055,
    automatic: false,
    viewPosition: [0.33, -0.31, -0.74],
  },
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}`)
  return element as T
}

const ui = {
  canvas: requireElement<HTMLCanvasElement>('world'),
  startScreen: requireElement<HTMLElement>('start-screen'),
  startButton: requireElement<HTMLButtonElement>('start-button'),
  gameOverScreen: requireElement<HTMLElement>('game-over-screen'),
  restartButton: requireElement<HTMLButtonElement>('restart-button'),
  finalScore: requireElement<HTMLElement>('final-score'),
  hud: requireElement<HTMLElement>('hud'),
  district: requireElement<HTMLElement>('district-name'),
  wave: requireElement<HTMLElement>('wave-number'),
  waveBanner: requireElement<HTMLElement>('wave-banner'),
  waveBannerKicker: requireElement<HTMLElement>('wave-banner-kicker'),
  waveBannerCopy: requireElement<HTMLElement>('wave-banner-copy'),
  healthFill: requireElement<HTMLElement>('health-fill'),
  healthValue: requireElement<HTMLElement>('health-value'),
  killCount: requireElement<HTMLElement>('kill-count'),
  scoreCount: requireElement<HTMLElement>('score-count'),
  ammoCount: requireElement<HTMLElement>('ammo-count'),
  reserveCount: requireElement<HTMLElement>('reserve-count'),
  ammoPanel: document.querySelector<HTMLElement>('.ammo-panel')!,
  hitMarker: requireElement<HTMLElement>('hit-marker'),
  damageVignette: requireElement<HTMLElement>('damage-vignette'),
  toast: requireElement<HTMLElement>('toast'),
  joystick: requireElement<HTMLElement>('joystick'),
  joystickKnob: requireElement<HTMLElement>('joystick-knob'),
  lookPad: requireElement<HTMLElement>('look-pad'),
  sprintButton: requireElement<HTMLButtonElement>('sprint-button'),
  reloadButton: requireElement<HTMLButtonElement>('reload-button'),
  fireButton: requireElement<HTMLButtonElement>('fire-button'),
}

const weaponLabel = ui.ammoPanel.querySelector<HTMLElement>('span')!
const useButton = ui.sprintButton
useButton.textContent = 'USE'
useButton.setAttribute('aria-label', 'Use or enter nearby object')
useButton.classList.remove('round-action--sprint')
useButton.classList.add('round-action--use')

function createHudButton(id: string, label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.id = id
  button.className = 'round-action ' + className
  button.textContent = label
  button.setAttribute('aria-label', label)
  ui.hud.append(button)
  return button
}

const switchButton = createHudButton('switch-button', 'SWP', 'round-action--switch')
const scopeButton = createHudButton('scope-button', 'ADS', 'round-action--scope')
const jumpButton = createHudButton('jump-button', 'JMP', 'round-action--jump')
const pauseButton = createHudButton('pause-button', 'Ⅱ', 'round-action--pause')
pauseButton.setAttribute('aria-label', 'Pause')

const pauseMenu = document.createElement('section')
pauseMenu.id = 'pause-menu'
pauseMenu.setAttribute('aria-hidden', 'true')
pauseMenu.innerHTML =
  '<div class="pause-card">' +
  '<span class="eyebrow">SKYFALL SYSTEMS</span>' +
  '<h2>PAUSED</h2>' +
  '<button id="pause-resume" class="primary-button">RESUME</button>' +
  '<button id="pause-sensitivity" class="pause-setting">LOOK: FAST</button>' +
  '<button id="pause-brightness" class="pause-setting">BRIGHTNESS: STANDARD</button>' +
  '</div>'
document.getElementById('app')!.append(pauseMenu)
const resumeButton = pauseMenu.querySelector<HTMLButtonElement>('#pause-resume')!
const pauseSensitivityButton = pauseMenu.querySelector<HTMLButtonElement>('#pause-sensitivity')!
const pauseBrightnessButton = pauseMenu.querySelector<HTMLButtonElement>('#pause-brightness')!

const scopeOverlay = document.createElement('div')
scopeOverlay.id = 'scope-overlay'
ui.hud.append(scopeOverlay)
const interactionPrompt = document.createElement('div')
interactionPrompt.id = 'interaction-prompt'
ui.hud.append(interactionPrompt)
const objectiveStrip = document.createElement('div')
objectiveStrip.id = 'objective-strip'
ui.hud.append(objectiveStrip)
const visorOverlay = document.createElement('div')
visorOverlay.id = 'visor-overlay'
ui.hud.append(visorOverlay)
const voiceCaption = document.createElement('div')
voiceCaption.id = 'voice-caption'
ui.hud.append(voiceCaption)

const documentPanel = document.createElement('section')
documentPanel.id = 'document-panel'
documentPanel.setAttribute('aria-hidden', 'true')
documentPanel.innerHTML =
  '<article class="document-card">' +
  '<span>ORISON-9 LOCAL ARCHIVE</span>' +
  '<h3 id="document-title"></h3>' +
  '<p id="document-body"></p>' +
  '<button id="document-close" class="primary-button">CLOSE TERMINAL</button>' +
  '</article>'
document.getElementById('app')!.append(documentPanel)
const documentTitle = requireElement<HTMLElement>('document-title')
const documentBody = requireElement<HTMLElement>('document-body')
const documentClose = requireElement<HTMLButtonElement>('document-close')

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x081116)
scene.fog = new THREE.FogExp2(0x0c171d, 0.0042)
scene.add(new THREE.AmbientLight(0xc3d3d8, 1.18))
const coldFill = new THREE.HemisphereLight(0xd5edf1, 0x34434a, 1.42)
scene.add(coldFill)

const camera = new THREE.PerspectiveCamera(69, innerWidth / innerHeight, 0.06, 500)
camera.rotation.order = 'YXZ'
scene.add(camera)
const emergencyTorch = new THREE.SpotLight(0xe1f3f5, 58, 42, Math.PI * 0.23, 0.58, 1.25)
emergencyTorch.position.set(0, 0.08, 0.05)
emergencyTorch.target.position.set(0, -0.15, -4)
camera.add(emergencyTorch, emergencyTorch.target)

const renderer = new THREE.WebGLRenderer({
  canvas: ui.canvas,
  antialias: !isTouch,
  powerPreference: 'high-performance',
})
let renderPixelRatio = Math.min(devicePixelRatio || 1, isTouch ? 0.92 : 1.55)
renderer.setPixelRatio(renderPixelRatio)
renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 2.4

const world = buildStation(scene)
const clock = new THREE.Clock()
const raycaster = new THREE.Raycaster()
raycaster.far = 130
const shotAim = new THREE.Vector2()
const cameraDirection = new THREE.Vector3()
const keys = new Set<string>()
const ghosts: Ghost[] = []
const ghostTargets: THREE.Mesh[] = []

const player = {
  position: new THREE.Vector3(-18, 1.72, 43),
  yaw: -Math.PI / 2,
  pitch: -0.03,
  radius: 0.48,
  walkSpeed: 7.45,
  sprintSpeed: 7.45,
  bob: 0,
  moving: false,
}

const state = {
  started: false,
  paused: false,
  documentOpen: false,
  gameOver: false,
  wave: 1,
  waveActive: false,
  intermission: 0,
  pendingSpawns: 0,
  spawnTimer: 0,
  health: 100,
  ammo: 0,
  reserve: 0,
  reloading: false,
  reloadTimer: 0,
  fireHeld: false,
  fireCooldown: 0,
  recoil: 0,
  muzzleTimer: 0,
  kills: 0,
  score: 0,
  weaponId: 'carbine' as WeaponId,
  weaponSlots: [] as WeaponId[],
  weaponIndex: 0,
  weaponAmmo: {} as Partial<Record<WeaponId, { ammo: number; reserve: number }>>,
  lookSensitivityIndex: 1,
  brightnessIndex: 2,
  scoped: false,
  mask: false,
  suited: false,
  inventory: new Set<string>(),
  repairedSystems: new Set<string>(),
  airborne: false,
  verticalVelocity: 0,
  bannerTimer: 0,
  hitTimer: 0,
  damageTimer: 0,
  toastTimer: 0,
  secondsSinceDamage: 99,
  interactionCooldown: 0,
  whisperTimer: 3,
}

const audio = new StationAudio((active, text) => {
  voiceCaption.textContent = active ? `STATION CONTROL · ${text}` : ''
  voiceCaption.classList.toggle('visible', active)
})

const gun = new THREE.Group()
camera.add(gun)
const gunDark = new THREE.MeshStandardMaterial({ color: 0x15191a, roughness: 0.5, metalness: 0.82 })
const gunRust = new THREE.MeshStandardMaterial({ color: 0x693422, roughness: 0.64, metalness: 0.7 })
const gunSteel = new THREE.MeshStandardMaterial({ color: 0x4b5354, roughness: 0.42, metalness: 0.88 })

function gunBox(width: number, height: number, depth: number, x: number, y: number, z: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.position.set(x, y, z)
  gun.add(mesh)
  return mesh
}

gunBox(0.25, 0.22, 1.16, 0, 0, -0.3, gunDark)
gunBox(0.42, 0.34, 0.6, 0, -0.02, 0.13, gunRust)
gunBox(0.17, 0.56, 0.26, 0, -0.35, 0.17, gunDark).rotation.x = -0.13
gunBox(0.11, 0.11, 0.96, 0, 0.03, -1.25, gunSteel)
const sight = gunBox(0.23, 0.22, 0.3, 0, 0.27, -0.32, gunDark)
const sightGlass = new THREE.Mesh(
  new THREE.PlaneGeometry(0.16, 0.12),
  new THREE.MeshBasicMaterial({ color: 0x77b7bd, transparent: true, opacity: 0.52, toneMapped: false }),
)
sightGlass.position.set(0, 0.1, -0.17)
sight.add(sightGlass)
const muzzle = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 7, 5),
  new THREE.MeshBasicMaterial({ color: 0xffb15d, transparent: true, opacity: 0.86, toneMapped: false }),
)
muzzle.position.set(0, 0.03, -1.78)
muzzle.visible = false
gun.add(muzzle)
const muzzleLight = new THREE.PointLight(0xff893d, 0, 6.5, 1.6)
muzzleLight.position.copy(muzzle.position)
gun.add(muzzleLight)
gun.visible = false

function currentWeapon(): WeaponDefinition | null {
  return state.weaponSlots.length > 0 ? WEAPONS[state.weaponId] : null
}

function syncCurrentWeaponAmmo(): void {
  if (!currentWeapon()) return
  state.weaponAmmo[state.weaponId] = { ammo: state.ammo, reserve: state.reserve }
}

function equipWeapon(id: WeaponId, newlyCollected = false): void {
  syncCurrentWeaponAmmo()
  if (!state.weaponSlots.includes(id)) state.weaponSlots.push(id)
  state.weaponId = id
  state.weaponIndex = state.weaponSlots.indexOf(id)
  const weapon = WEAPONS[id]
  let record = state.weaponAmmo[id]
  if (!record) {
    record = { ammo: weapon.magazineSize, reserve: weapon.startingReserve }
    state.weaponAmmo[id] = record
  } else if (newlyCollected) {
    record.reserve = Math.max(record.reserve, weapon.startingReserve)
  }
  state.ammo = record.ammo
  state.reserve = record.reserve
  state.reloading = false
  state.reloadTimer = 0
  setScoped(false)
  applyWeaponVisual()
  updateHud()
}

function applyWeaponVisual(): void {
  const weapon = currentWeapon()
  gun.visible = Boolean(weapon)
  if (!weapon) return
  const scatter = weapon.id === 'scattergun'
  gun.scale.set(scatter ? 1.06 : 1, scatter ? 0.96 : 1, scatter ? 1.2 : 1)
  sight.visible = !scatter
  gunRust.color.setHex(scatter ? 0x4b2a21 : 0x693422)
}

function setScoped(enabled: boolean): void {
  const weapon = currentWeapon()
  state.scoped = Boolean(enabled && weapon)
  camera.fov = state.scoped ? weapon?.scopeFov ?? 54 : 69
  camera.updateProjectionMatrix()
  const hasScope = Boolean(state.scoped && weapon?.scope)
  scopeOverlay.classList.toggle('visible', hasScope)
  scopeOverlay.dataset.optic = hasScope ? weapon!.scope : ''
  ui.hud.classList.toggle('aiming', state.scoped)
  ui.hud.classList.toggle('scoped', hasScope)
  scopeButton.textContent = state.scoped ? 'HIP' : 'ADS'
  gun.visible = Boolean(weapon) && !hasScope
}

function toggleScope(): void {
  setScoped(!state.scoped)
}

function switchWeapon(): void {
  if (state.weaponSlots.length < 2) return
  syncCurrentWeaponAmmo()
  state.weaponIndex = (state.weaponIndex + 1) % state.weaponSlots.length
  equipWeapon(state.weaponSlots[state.weaponIndex])
  showToast(WEAPONS[state.weaponId].name, 1.15)
}

function showBanner(kicker: string, copy: string, duration = 2.8): void {
  ui.waveBannerKicker.textContent = kicker
  ui.waveBannerCopy.textContent = copy
  ui.waveBanner.classList.add('visible')
  state.bannerTimer = duration
}

function showToast(message: string, duration = 1.2): void {
  ui.toast.textContent = message
  ui.toast.classList.add('visible')
  state.toastTimer = duration
}

function showHit(killed: boolean): void {
  ui.hitMarker.classList.toggle('kill', killed)
  ui.hitMarker.classList.add('visible')
  state.hitTimer = killed ? 0.14 : 0.08
}

function updateHud(): void {
  ui.wave.textContent = String(state.wave)
  ui.healthValue.textContent = String(Math.max(0, Math.ceil(state.health)))
  ui.healthFill.style.width = `${THREE.MathUtils.clamp(state.health, 0, 100)}%`
  ui.killCount.textContent = String(state.kills)
  ui.scoreCount.textContent = String(state.score)
  ui.ammoCount.textContent = String(state.ammo)
  ui.reserveCount.textContent = String(state.reserve)
  ui.ammoPanel.classList.toggle('reloading', state.reloading)
  const weapon = currentWeapon()
  weaponLabel.textContent = weapon?.name ?? 'UNARMED'
}

function updateObjectiveStrip(): void {
  const repaired = repairProgress(state.repairedSystems)
  let objective = ''
  if (!state.mask) objective = 'FIND THE CLEAR BREATHING SHIELD · EQUIPMENT BAY 03'
  else if (!state.suited) objective = 'SUIT UP · EQUIPMENT BAY 03'
  else if (state.weaponSlots.length === 0) objective = 'ARM YOURSELF · SECURITY STORES'
  else if (!state.inventory.has('multi-tool')) objective = 'FIND THE IMPERIAL MULTI-TOOL · MACHINE SHOP'
  else if (repaired < 3) objective = 'REPAIR LIFE SUPPORT · THERMAL EXCHANGE · CROWN RELAY'
  else objective = 'HOLD ORISON-9 · RESCUE ESTIMATE UNAVAILABLE'
  const seal = state.mask ? '<b>SEAL ACTIVE</b>' : '<b>SEAL ABSENT</b>'
  objectiveStrip.innerHTML = `<strong>OBJECTIVE</strong><br>${objective}<br>${seal} · CRITICAL SYSTEMS ${repaired}/3`
}

function interactionAvailable(interaction: StationInteraction): boolean {
  if (interaction.kind === 'lore') return true
  return !interaction.used
}

function nearestInteraction(maxDistance = 2.75): StationInteraction | null {
  let nearest: StationInteraction | null = null
  let nearestDistance = maxDistance * maxDistance
  camera.getWorldDirection(cameraDirection)
  for (const interaction of world.interactions) {
    if (!interactionAvailable(interaction)) continue
    const dx = interaction.position.x - player.position.x
    const dz = interaction.position.z - player.position.z
    const distance = dx * dx + dz * dz
    if (distance > nearestDistance) continue
    const length = Math.max(0.001, Math.hypot(dx, dz))
    const facing = (dx / length) * cameraDirection.x + (dz / length) * cameraDirection.z
    if (facing < -0.24 && distance > 1.25) continue
    nearestDistance = distance
    nearest = interaction
  }
  return nearest
}

function updateInteractionPrompt(): void {
  const interaction = nearestInteraction()
  const text = interaction ? `USE · ${interaction.label}` : ''
  interactionPrompt.textContent = text
  interactionPrompt.classList.toggle('visible', text.length > 0)
}

function missingRequirement(kind: StationInteraction['kind']): st