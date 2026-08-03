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
import {
  buildStation,
  liftX,
  liftZ,
  mineEyeY,
  stationEyeY,
  type StationInteraction,
} from './station'
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

type LiftTransit = {
  toMine: boolean
  elapsed: number
  duration: number
  fromFloorY: number
  toFloorY: number
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
    viewPosition: [0.4, -0.34, -1.08],
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
    viewPosition: [0.4, -0.36, -1.12],
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
scene.background = new THREE.Color(0x05080b)
scene.fog = new THREE.FogExp2(0x080c0f, 0.0032)
scene.add(new THREE.AmbientLight(0xa8b3b3, 1.2))
const coldFill = new THREE.HemisphereLight(0xc8d8d8, 0x202627, 1.06)
scene.add(coldFill)

const camera = new THREE.PerspectiveCamera(69, innerWidth / innerHeight, 0.06, 500)
camera.rotation.order = 'YXZ'
scene.add(camera)
const emergencyTorch = new THREE.SpotLight(0xd7e4e4, 48, 38, Math.PI * 0.23, 0.64, 1.35)
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
renderer.toneMappingExposure = 2

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
  position: new THREE.Vector3(-18, stationEyeY, 50),
  yaw: Math.PI,
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
  brightnessIndex: 1,
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
  lift: null as LiftTransit | null,
}

const audio = new StationAudio((active, text) => {
  voiceCaption.textContent = active ? `STATION CONTROL · ${text}` : ''
  voiceCaption.classList.toggle('visible', active)
})

const gun = new THREE.Group()
camera.add(gun)
const gunTextureLoader = new THREE.TextureLoader()
function loadGunTexture(path: string): THREE.Texture {
  const texture = gunTextureLoader.load(path)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 4
  return texture
}
const gunDark = new THREE.MeshStandardMaterial({
  map: loadGunTexture('./assets/textures/weapon-black.webp'),
  color: 0x5f6463,
  roughness: 0.62,
  metalness: 0.75,
})
const gunRust = new THREE.MeshStandardMaterial({
  map: loadGunTexture('./assets/textures/weapon-red.webp'),
  color: 0x754942,
  roughness: 0.72,
  metalness: 0.64,
})
const gunSteel = new THREE.MeshStandardMaterial({
  map: loadGunTexture('./assets/textures/weapon-steel.webp'),
  color: 0x7c817f,
  roughness: 0.5,
  metalness: 0.84,
})
const gunBarrel = new THREE.MeshStandardMaterial({
  map: loadGunTexture('./assets/textures/weapon-barrel.webp'),
  color: 0x555653,
  roughness: 0.5,
  metalness: 0.87,
})

function gunBox(width: number, height: number, depth: number, x: number, y: number, z: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.position.set(x, y, z)
  gun.add(mesh)
  return mesh
}

function gunCylinder(radius: number, length: number, x: number, y: number, z: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material)
  mesh.position.set(x, y, z)
  mesh.rotation.x = Math.PI / 2
  gun.add(mesh)
  return mesh
}

gunBox(0.38, 0.27, 0.72, 0, 0, -0.16, gunRust)
gunBox(0.27, 0.18, 0.84, 0, 0.08, -0.87, gunDark)
gunBox(0.28, 0.22, 0.5, 0, 0, 0.48, gunDark)
gunBox(0.33, 0.28, 0.1, 0, 0, 0.76, gunSteel)
gunBox(0.14, 0.42, 0.2, 0.02, -0.29, 0.2, gunDark).rotation.x = -0.22
gunBox(0.17, 0.36, 0.24, 0, -0.27, -0.14, gunSteel).rotation.x = 0.08
gunBox(0.19, 0.045, 0.98, 0, 0.19, -0.4, gunSteel)
gunCylinder(0.047, 0.9, 0, 0.04, -1.5, gunBarrel)
const scatterBarrel = gunCylinder(0.043, 0.9, 0.095, 0.04, -1.5, gunBarrel)
gunCylinder(0.068, 0.16, 0, 0.04, -2.03, gunSteel)
const sight = gunBox(0.18, 0.17, 0.24, 0, 0.28, -0.34, gunDark)
const sightGlass = new THREE.Mesh(
  new THREE.PlaneGeometry(0.12, 0.085),
  new THREE.MeshBasicMaterial({ color: 0x77b7bd, transparent: true, opacity: 0.52, toneMapped: false }),
)
sightGlass.position.set(0, 0.075, -0.135)
sight.add(sightGlass)
const muzzle = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 7, 5),
  new THREE.MeshBasicMaterial({ color: 0xffb15d, transparent: true, opacity: 0.86, toneMapped: false }),
)
muzzle.position.set(0, 0.03, -2.06)
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
  gun.scale.set(scatter ? 0.76 : 0.72, scatter ? 0.72 : 0.72, scatter ? 0.84 : 0.72)
  sight.visible = !scatter
  scatterBarrel.visible = scatter
  gunRust.color.setHex(scatter ? 0x664b48 : 0x754942)
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
  else if (!state.repairedSystems.has('life-support')) objective = 'RESTORE LIFE SUPPORT · EAST MID-STATION'
  else if (!state.repairedSystems.has('relay')) objective = 'REPAIR CROWN RELAY · WEST MID-STATION'
  else if (!state.repairedSystems.has('coolant')) objective = 'DESCEND SERVICE LIFT · REPAIR SHAFT FOUR THERMAL EXCHANGE'
  else objective = 'HOLD ORISON-9 · RESCUE ESTIMATE UNAVAILABLE'
  const seal = state.mask ? '<b>SEAL ACTIVE</b>' : '<b>SEAL ABSENT</b>'
  objectiveStrip.innerHTML = `<strong>OBJECTIVE</strong><br>${objective}<br>${seal} · CRITICAL SYSTEMS ${repaired}/3`
}

function interactionAvailable(interaction: StationInteraction): boolean {
  if (interaction.kind === 'lore' || interaction.kind === 'elevator-down' || interaction.kind === 'elevator-up') return true
  return !interaction.used
}

function nearestInteraction(maxDistance = 3): StationInteraction | null {
  let nearest: StationInteraction | null = null
  let nearestDistance = maxDistance * maxDistance
  camera.getWorldDirection(cameraDirection)
  for (const interaction of world.interactions) {
    if (!interactionAvailable(interaction)) continue
    const dx = interaction.position.x - player.position.x
    const dy = interaction.position.y - player.position.y
    const dz = interaction.position.z - player.position.z
    const distance = dx * dx + dy * dy + dz * dz
    if (distance > nearestDistance) continue
    const length = Math.max(0.001, Math.hypot(dx, dz))
    const facing = (dx / length) * cameraDirection.x + (dz / length) * cameraDirection.z
    if (facing < -0.24 && distance > 1.25) continue
    nearestDistance = distance
    nearest = interaction
  }
  return nearest
}

function beginLift(toMine: boolean): void {
  if (state.lift || state.airborne) return
  const below = player.position.y < -13
  if (toMine === below) {
    showToast(toMine ? 'LIFT ALREADY AT SHAFT FOUR' : 'LIFT ALREADY AT STATION LEVEL', 1.4)
    return
  }
  const fromFloorY = below ? mineEyeY - 1.72 : stationEyeY - 1.72
  const toFloorY = toMine ? mineEyeY - 1.72 : stationEyeY - 1.72
  state.lift = { toMine, elapsed: 0, duration: 4.6, fromFloorY, toFloorY }
  state.fireHeld = false
  state.reloading = false
  state.airborne = false
  state.verticalVelocity = 0
  setScoped(false)
  const livingGhosts = ghosts.filter((ghost) => !ghost.dead).length
  clearGhosts()
  if (state.waveActive) state.pendingSpawns += livingGhosts
  player.position.set(liftX, fromFloorY + 1.72, liftZ)
  world.setLiftY(fromFloorY)
  audio.lift(toMine)
  showBanner(toMine ? 'SERVICE LIFT DESCENDING' : 'SERVICE LIFT ASCENDING', toMine ? 'SHAFT FOUR · 28 METRES' : 'ORISON-9 OPERATIONS', 4.5)
}

function updateInteractionPrompt(): void {
  const interaction = nearestInteraction()
  const text = interaction ? `USE · ${interaction.label}` : ''
  interactionPrompt.textContent = text
  interactionPrompt.classList.toggle('visible', text.length > 0)
}

function missingRequirement(kind: StationInteraction['kind']): string | null {
  if (!state.inventory.has('multi-tool')) return 'MULTI-TOOL REQUIRED · MACHINE SHOP'
  if (kind === 'relay' && !state.inventory.has('relay-fuse')) return 'RELAY FUSE REQUIRED · SECURITY STORES'
  if (kind === 'coolant' && !state.inventory.has('coolant-coupler')) return 'COOLANT COUPLER REQUIRED · MACHINE SHOP'
  return null
}

function openDocument(interaction: StationInteraction): void {
  state.documentOpen = true
  state.fireHeld = false
  documentTitle.textContent = interaction.title ?? 'STATION NOTICE'
  documentBody.textContent = interaction.body ?? ''
  documentPanel.classList.add('visible')
  documentPanel.setAttribute('aria-hidden', 'false')
}

function closeDocument(): void {
  state.documentOpen = false
  documentPanel.classList.remove('visible')
  documentPanel.setAttribute('aria-hidden', 'true')
}

function performInteraction(): void {
  if (state.interactionCooldown > 0 || state.gameOver || state.documentOpen || state.lift) return
  const interaction = nearestInteraction()
  if (!interaction) return
  state.interactionCooldown = 0.25

  if (interaction.kind === 'lore') {
    openDocument(interaction)
    return
  }
  if (interaction.kind === 'elevator-down' || interaction.kind === 'elevator-up') {
    beginLift(interaction.kind === 'elevator-down')
    return
  }
  if (interaction.kind === 'mask') {
    state.mask = true
    world.markUsed(interaction)
    visorOverlay.classList.add('visible')
    audio.pickup()
    audio.speak('Breathing seal accepted. Clear shield integrity: eighty-seven percent. Proceed to a pressure shell.')
    showBanner('RESPIRATOR ONLINE', 'THE GLASS IS THINNER THAN IT LOOKS', 3.2)
  } else if (interaction.kind === 'suit') {
    state.suited = true
    world.markUsed(interaction)
    audio.pickup()
    audio.speak('Mining shell sealed. Puncture resistance is within local statutory minimums.')
    showToast('LIGHT MINING SHELL EQUIPPED', 1.8)
  } else if (interaction.kind === 'carbine' || interaction.kind === 'scattergun') {
    const wasUnarmed = state.weaponSlots.length === 0
    equipWeapon(interaction.kind, true)
    world.markUsed(interaction)
    audio.pickup()
    if (wasUnarmed) {
      state.intermission = 1.6
      audio.speak('Emergency armory authorization granted. Central authorization expired one hundred and twelve years ago. Local statute applies.')
      showBanner('MOTION IN THE WALLS', 'THE INCURSION HAS FOUND YOU', 3.4)
    } else {
      showToast(WEAPONS[interaction.kind].name + ' ACQUIRED', 1.7)
    }
  } else if (interaction.kind === 'multi-tool' || interaction.kind === 'relay-fuse' || interaction.kind === 'coolant-coupler') {
    state.inventory.add(interaction.kind)
    world.markUsed(interaction)
    audio.pickup()
    showToast(interaction.label.replace('TAKE ', '') + ' ACQUIRED', 1.6)
  } else {
    const missing = missingRequirement(interaction.kind)
    if (missing) {
      showToast(missing, 1.8)
      return
    }
    state.repairedSystems.add(interaction.id)
    world.setSystemRepaired(interaction)
    state.score += 750
    state.pendingSpawns += state.waveActive ? 2 : 0
    audio.repair()
    if (interaction.kind === 'life-support') {
      audio.speak('Life support is answering. Atmosphere loss has slowed. Evacuation remains mandatory.')
      showBanner('LIFE SUPPORT RESTORED', 'PRESSURE LOSS SLOWING', 2.9)
    } else if (interaction.kind === 'coolant') {
      audio.speak('Deep thermal exchange restored. Core pump temperature is falling. Shaft Four remains occupied by non-material motion.')
      showBanner('DEEP COOLANT LOOP RESTORED', 'THE CORE PUMP IS STILL MOVING', 3.1)
    } else {
      audio.speak('Crown relay aligned. Imperial rescue estimate: unavailable. Principality receivers are not responding.')
      showBanner('CROWN RELAY RESTORED', 'NO AUTHORITY ANSWERS', 3.2)
    }
    if (repairProgress(state.repairedSystems) === 3) {
      audio.lowerAlarm(true)
      window.setTimeout(() => {
        audio.speak('All critical systems are answering. Maintain station integrity until relief arrives. No relief schedule is available.')
      }, 3200)
    }
  }
  updateObjectiveStrip()
  updateHud()
}

function circleHitsCollider(x: number, z: number, radius: number): boolean {
  const playerBottom = player.position.y - 1.62
  const playerTop = player.position.y + 0.12
  for (const collider of world.colliders) {
    if (playerTop < collider.minY || playerBottom > collider.maxY) continue
    const nearestX = Math.max(collider.minX, Math.min(x, collider.maxX))
    const nearestZ = Math.max(collider.minZ, Math.min(z, collider.maxZ))
    const dx = x - nearestX
    const dz = z - nearestZ
    if (dx * dx + dz * dz < radius * radius) return true
  }
  return false
}

function movePlayer(dx: number, dz: number): void {
  const nextX = player.position.x + dx
  if (!circleHitsCollider(nextX, player.position.z, player.radius)) player.position.x = nextX
  const nextZ = player.position.z + dz
  if (!circleHitsCollider(player.position.x, nextZ, player.radius)) player.position.z = nextZ
}

function jumpPlayer(): void {
  if (!state.started || state.paused || state.documentOpen || state.gameOver || state.airborne || state.lift) return
  state.verticalVelocity = 5.2
  state.airborne = true
}

function updateVerticalMotion(dt: number): void {
  if (!state.airborne) return
  state.verticalVelocity -= 13.8 * dt
  player.position.y += state.verticalVelocity * dt
  const groundY = player.position.y < -13 ? mineEyeY : stationEyeY
  if (player.position.y > groundY) return
  player.position.y = groundY
  state.airborne = false
  state.verticalVelocity = 0
}

function updateLift(dt: number): void {
  const lift = state.lift
  if (!lift) return
  lift.elapsed = Math.min(lift.duration, lift.elapsed + dt)
  const linear = lift.elapsed / lift.duration
  const eased = linear * linear * (3 - 2 * linear)
  const floorY = THREE.MathUtils.lerp(lift.fromFloorY, lift.toFloorY, eased)
  world.setLiftY(floorY)
  player.position.set(liftX, floorY + 1.72, liftZ)
  audio.setMineActive(lift.toMine ? linear > 0.42 : linear < 0.58)
  if (linear < 1) return
  player.position.y = lift.toMine ? mineEyeY : stationEyeY
  world.setLiftY(lift.toFloorY)
  state.lift = null
  state.interactionCooldown = 0.9
  audio.setMineActive(lift.toMine)
  audio.liftArrived()
  showBanner(lift.toMine ? 'SHAFT FOUR' : 'ORISON-9 OPERATIONS', lift.toMine ? 'CORE PUMP ACCESS · HEAT WARNING' : 'STATION LEVEL · EVACUATION ACTIVE', 3.2)
}

function beginReload(): void {
  const weapon = currentWeapon()
  if (!weapon || state.reloading || state.ammo >= weapon.magazineSize || state.reserve <= 0 || state.gameOver || state.lift) return
  state.reloading = true
  state.reloadTimer = weapon.reloadTime
  audio.reload()
  showToast('RELOADING', 1.2)
  updateHud()
}

function finishReload(): void {
  const weapon = currentWeapon()
  if (!weapon) return
  const needed = weapon.magazineSize - state.ammo
  const amount = Math.min(needed, state.reserve)
  state.ammo += amount
  state.reserve -= amount
  state.reloading = false
  syncCurrentWeaponAmmo()
  updateHud()
}

function fireWeapon(): void {
  if (!state.started || state.paused || state.documentOpen || state.gameOver || state.reloading || state.fireCooldown > 0 || state.lift) return
  const weapon = currentWeapon()
  if (!weapon) {
    audio.empty()
    showToast('UNARMED · SECURITY STORES', 1.2)
    state.fireCooldown = 0.5
    return
  }
  state.fireCooldown = weapon.fireDelay
  if (state.ammo <= 0) {
    audio.empty()
    beginReload()
    return
  }
  state.ammo -= 1
  state.recoil = Math.min(1, state.recoil + (weapon.id === 'scattergun' ? 0.92 : 0.62))
  state.muzzleTimer = weapon.id === 'scattergun' ? 0.07 : 0.045
  muzzle.visible = true
  muzzleLight.intensity = weapon.id === 'scattergun' ? 6.5 : 4.2
  audio.gunshot(weapon.id === 'scattergun')
  if (!weapon.automatic) state.fireHeld = false
  if (state.ammo % 4 === 0) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined)

  let hitSomething = false
  let killedSomething = false
  const struck = new Set<Ghost>()
  for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
    shotAim.set((Math.random() - 0.5) * weapon.spread, (Math.random() - 0.5) * weapon.spread)
    raycaster.setFromCamera(shotAim, camera)
    const hit = raycaster.intersectObjects(ghostTargets, false)[0]
    if (!hit) continue
    const ghost = hit.object.userData.ghost as Ghost | undefined
    if (!ghost || ghost.dead || (weapon.pellets === 1 && struck.has(ghost))) continue
    struck.add(ghost)
    hitSomething = true
    const headshot = hit.object === ghost.hitMeshes[1]
    ghost.health -= weapon.damage * (headshot ? weapon.headshotMultiplier : 1)
    ghost.flashTimer = 0.09
    state.score += headshot ? 35 : 20
    if (ghost.health <= 0) {
      ghost.dead = true
      ghost.deathTimer = 0
      killedSomething = true
      state.kills += 1
      state.score += 120
    }
  }
  if (hitSomething) showHit(killedSomething)
  syncCurrentWeaponAmmo()
  updateHud()
}

function damagePlayer(rawAmount: number): void {
  if (state.gameOver) return
  const amount = damageAfterSuit(rawAmount, state.suited)
  state.health -= amount
  state.secondsSinceDamage = 0
  state.damageTimer = 0.28
  ui.damageVignette.classList.add('visible')
  audio.bite()
  void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined)
  updateHud()
  if (state.health <= 0) endRun()
}

function spawnGhost(): void {
  const sameLevel = world.ghostSpawns.filter((point) => Math.abs(point.y - player.position.y) < 6)
  const distant = sameLevel.filter((point) => {
    const dx = point.x - player.position.x
    const dz = point.z - player.position.z
    return dx * dx + dz * dz > 13 * 13
  })
  const pool = distant.length > 0 ? distant : sameLevel
  if (pool.length === 0) return
  const base = pool[Math.floor(Math.random() * pool.length)]
  const position = base.clone()
  position.x += (Math.random() - 0.5) * 3.5
  position.z += (Math.random() - 0.5) * 3.5
  const ghost = createGhost(scene, position, ghostHealthForWave(state.wave), state.wave)
  ghosts.push(ghost)
  ghostTargets.push(...ghost.hitMeshes)
}

function removeGhost(ghost: Ghost): void {
  const index = ghosts.indexOf(ghost)
  if (index >= 0) ghosts.splice(index, 1)
  for (const mesh of ghost.hitMeshes) {
    const targetIndex = ghostTargets.indexOf(mesh)
    if (targetIndex >= 0) ghostTargets.splice(targetIndex, 1)
  }
  disposeGhost(scene, ghost)
}

function clearGhosts(): void {
  for (const ghost of [...ghosts]) removeGhost(ghost)
}

function startWave(): void {
  if (!currentWeapon() || state.gameOver) return
  state.waveActive = true
  state.pendingSpawns = ghostCountForWave(state.wave)
  state.spawnTimer = 0.45
  showBanner(`WAVE ${state.wave}`, state.wave === 1 ? 'THE DEAD AIR IS MOVING' : 'THE WALLS HAVE GONE COLD', 3)
  audio.ghostWhisper(12)
  updateHud()
}

function finishWave(): void {
  state.waveActive = false
  state.wave += 1
  state.intermission = 7
  state.health = Math.min(100, state.health + 20)
  const weapon = currentWeapon()
  if (weapon) {
    state.reserve = Math.min(weapon.startingReserve * 2, state.reserve + Math.ceil(weapon.magazineSize * 1.5))
    syncCurrentWeaponAmmo()
  }
  showBanner('INCURSION QUIET', `WAVE ${state.wave} IN 7 SECONDS`, 6.8)
  showToast('AMMO AND HEALTH RECOVERED', 2.2)
  updateHud()
}

function updateWave(dt: number): void {
  if (!currentWeapon()) return
  if (!state.waveActive) {
    if (state.intermission > 0) {
      state.intermission -= dt
      if (state.intermission <= 0) startWave()
    }
    return
  }
  if (state.pendingSpawns > 0) {
    state.spawnTimer -= dt
    if (state.spawnTimer <= 0) {
      spawnGhost()
      state.pendingSpawns -= 1
      state.spawnTimer = Math.max(0.72, 2.05 - state.wave * 0.08)
    }
  } else if (ghosts.length === 0) {
    finishWave()
  }
}

function updateGhosts(dt: number, elapsed: number): void {
  let closest = Infinity
  for (const ghost of [...ghosts]) {
    ghost.flashTimer = Math.max(0, ghost.flashTimer - dt)
    if (ghost.dead) {
      ghost.deathTimer += dt
      updateGhostVisual(ghost, elapsed)
      if (ghost.deathTimer >= 0.84) removeGhost(ghost)
      continue
    }
    const dx = player.position.x - ghost.group.position.x
    const dz = player.position.z - ghost.group.position.z
    const distance = Math.max(0.001, Math.hypot(dx, dz))
    if (Math.abs(player.position.y - ghost.baseY) > 7) {
      updateGhostVisual(ghost, elapsed)
      continue
    }
    closest = Math.min(closest, distance)
    ghost.attackTimer -= dt
    const phaseStrength = 0.72 + Math.sin(elapsed * 2.1 + ghost.phase) * 0.22
    if (distance > 1.2) {
      ghost.group.position.x += (dx / distance) * ghost.speed * phaseStrength * dt
      ghost.group.position.z += (dz / distance) * ghost.speed * phaseStrength * dt
    }
    ghost.group.position.y = ghost.baseY + 0.07 + Math.sin(elapsed * 2.45 + ghost.phase) * 0.24
    ghost.group.rotation.y = Math.atan2(dx, dz)
    if (distance < 1.55 && ghost.attackTimer <= 0) {
      ghost.attackTimer = 1.18 + Math.random() * 0.35
      damagePlayer(ghost.damage)
      ghost.group.position.x -= (dx / distance) * 0.45
      ghost.group.position.z -= (dz / distance) * 0.45
    }
    updateGhostVisual(ghost, elapsed)
  }
  state.whisperTimer -= dt
  if (closest < 22 && state.whisperTimer <= 0) {
    audio.ghostWhisper(closest)
    state.whisperTimer = 3.4 + Math.random() * 4.2
  }
}

function updatePlayer(dt: number): void {
  if (state.lift) {
    player.moving = false
    camera.position.copy(player.position)
    camera.rotation.set(player.pitch, player.yaw, 0)
    ui.district.textContent = world.districtAt(player.position.x, player.position.y, player.position.z)
    interactionPrompt.textContent = ''
    interactionPrompt.classList.remove('visible')
    return
  }
  let forward = 0
  let strafe = 0
  if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1
  if (keys.has('KeyD')) strafe += 1
  if (keys.has('KeyA')) strafe -= 1
  forward += -touchMove.y
  strafe += touchMove.x
  const inputLength = Math.hypot(forward, strafe)
  if (inputLength > 1) {
    forward /= inputLength
    strafe /= inputLength
  }

  const moving = Math.abs(forward) + Math.abs(strafe) > 0.025
  player.moving = moving
  if (moving) {
    const sin = Math.sin(player.yaw)
    const cos = Math.cos(player.yaw)
    const dx = (-sin * forward + cos * strafe) * player.walkSpeed * dt
    const dz = (-cos * forward - sin * strafe) * player.walkSpeed * dt
    movePlayer(dx, dz)
    player.bob += dt * 11.2
  }
  updateVerticalMotion(dt)

  const bobY = moving && !state.scoped ? Math.sin(player.bob) * 0.04 : 0
  const bobX = moving && !state.scoped ? Math.cos(player.bob * 0.5) * 0.02 : 0
  camera.position.set(player.position.x + bobX, player.position.y + bobY, player.position.z)
  camera.rotation.set(player.pitch, player.yaw, 0)

  const weapon = currentWeapon()
  if (weapon) {
    const gunBobX = moving ? Math.cos(player.bob * 0.5) * 0.018 : 0
    const gunBobY = moving ? Math.abs(Math.sin(player.bob)) * 0.018 : 0
    state.recoil = Math.max(0, state.recoil - dt * 7.8)
    const hasScope = Boolean(state.scoped && weapon.scope)
    const ironSights = state.scoped && !hasScope
    gun.position.set(
      ironSights ? 0.012 : weapon.viewPosition[0] + gunBobX,
      ironSights ? -0.185 - state.recoil * 0.025 : weapon.viewPosition[1] - gunBobY - state.recoil * 0.04,
      ironSights ? weapon.viewPosition[2] - 0.08 + state.recoil * 0.045 : weapon.viewPosition[2] + state.recoil * 0.08,
    )
    gun.rotation.x = -state.recoil * (ironSights ? 0.07 : 0.12)
    gun.rotation.y = ironSights ? 0 : 0.12
    gun.visible = !hasScope
  }
  ui.district.textContent = world.districtAt(player.position.x, player.position.y, player.position.z)
  audio.setMineActive(player.position.y < -13)
  updateInteractionPrompt()
}

function updateHealthRecovery(dt: number): void {
  state.secondsSinceDamage += dt
  if (state.secondsSinceDamage < 5.5 || state.health >= 100) return
  const previous = Math.ceil(state.health)
  state.health = Math.min(100, state.health + dt * 6.5)
  if (Math.ceil(state.health) !== previous) updateHud()
}

function updateInterfaceTimers(dt: number): void {
  if (state.bannerTimer > 0) {
    state.bannerTimer -= dt
    if (state.bannerTimer <= 0) ui.waveBanner.classList.remove('visible')
  }
  if (state.hitTimer > 0) {
    state.hitTimer -= dt
    if (state.hitTimer <= 0) ui.hitMarker.classList.remove('visible', 'kill')
  }
  if (state.damageTimer > 0) {
    state.damageTimer -= dt
    if (state.damageTimer <= 0) ui.damageVignette.classList.remove('visible')
  }
  if (state.toastTimer > 0) {
    state.toastTimer -= dt
    if (state.toastTimer <= 0) ui.toast.classList.remove('visible')
  }
  if (state.muzzleTimer > 0) {
    state.muzzleTimer -= dt
    muzzle.visible = true
    muzzleLight.intensity = 78 * Math.max(0, state.muzzleTimer / 0.045)
  } else {
    muzzle.visible = false
    muzzleLight.intensity = 0
  }
}

function setPaused(paused: boolean): void {
  if (!state.started || state.gameOver) return
  state.paused = paused
  state.fireHeld = false
  pauseMenu.classList.toggle('visible', paused)
  pauseMenu.setAttribute('aria-hidden', paused ? 'false' : 'true')
  audio.setMuted(paused)
  if (paused) document.exitPointerLock?.()
}

function cycleSensitivity(): void {
  state.lookSensitivityIndex = nextSensitivityIndex(state.lookSensitivityIndex)
  refreshPauseSettings()
}

function cycleBrightness(): void {
  state.brightnessIndex = (state.brightnessIndex + 1) % 3
  renderer.toneMappingExposure = [1.65, 2, 2.3][state.brightnessIndex]
  refreshPauseSettings()
}

function refreshPauseSettings(): void {
  pauseSensitivityButton.textContent = `LOOK: ${['STANDARD', 'FAST', 'VERY FAST'][state.lookSensitivityIndex]}`
  pauseBrightnessButton.textContent = `BRIGHTNESS: ${['LOW', 'STANDARD', 'HIGH'][state.brightnessIndex]}`
}

function endRun(): void {
  state.gameOver = true
  state.paused = false
  state.fireHeld = false
  state.health = 0
  audio.lowerAlarm(true)
  document.exitPointerLock?.()
  ui.finalScore.textContent = `Wave ${state.wave} · ${state.kills} kills · ${repairProgress(state.repairedSystems)} systems`
  ui.gameOverScreen.classList.add('screen--visible')
  ui.gameOverScreen.setAttribute('aria-hidden', 'false')
  showBanner('PERSONNEL SIGNAL LOST', 'NO LIVING MOTION DETECTED', 2)
  audio.speak('Personnel signal lost. Recording incident under local jurisdiction.')
  updateHud()
}

function resetRun(): void {
  clearGhosts()
  world.reset()
  player.position.set(-18, stationEyeY, 50)
  player.yaw = Math.PI
  player.pitch = -0.03
  player.bob = 0
  state.gameOver = false
  state.paused = false
  state.documentOpen = false
  state.wave = 1
  state.waveActive = false
  state.intermission = 0
  state.pendingSpawns = 0
  state.spawnTimer = 0
  state.health = 100
  state.secondsSinceDamage = 99
  state.airborne = false
  state.verticalVelocity = 0
  state.weaponId = 'carbine'
  state.weaponSlots = []
  state.weaponIndex = 0
  state.weaponAmmo = {}
  state.ammo = 0
  state.reserve = 0
  state.reloading = false
  state.reloadTimer = 0
  state.fireHeld = false
  state.fireCooldown = 0
  state.kills = 0
  state.score = 0
  state.scoped = false
  state.mask = false
  state.suited = false
  state.inventory.clear()
  state.repairedSystems.clear()
  state.interactionCooldown = 0
  state.whisperTimer = 3
  state.lift = null
  visorOverlay.classList.remove('visible')
  closeDocument()
  setScoped(false)
  applyWeaponVisual()
  ui.gameOverScreen.classList.remove('screen--visible')
  ui.gameOverScreen.setAttribute('aria-hidden', 'true')
  audio.lowerAlarm(false)
  audio.setMineActive(false)
  updateObjectiveStrip()
  updateHud()
  showBanner('EVACUATION ORDER', 'PROCEED TO EQUIPMENT BAY 03', 4.5)
}

function startGame(): void {
  state.started = true
  ui.startScreen.classList.remove('screen--visible')
  ui.hud.setAttribute('aria-hidden', 'false')
  audio.start()
  void StatusBar.hide().catch(() => undefined)
  resetRun()
  window.setTimeout(() => {
    audio.speak('Emergency instruction. Remain calm. Retrieve a clear breathing shield and mining shell from Equipment Bay Three. Evacuation route gamma remains open.')
  }, 650)
  if (!isTouch) void ui.canvas.requestPointerLock?.()
}

const touchMove = { x: 0, y: 0 }
let joystickPointer: number | null = null
function updateJoystick(event: PointerEvent): void {
  const rect = ui.joystick.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  let dx = event.clientX - centerX
  let dy = event.clientY - centerY
  const maximum = rect.width * 0.32
  const length = Math.hypot(dx, dy)
  if (length > maximum) {
    dx = (dx / length) * maximum
    dy = (dy / length) * maximum
  }
  touchMove.x = dx / maximum
  touchMove.y = dy / maximum
  ui.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`
}

ui.joystick.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  if (joystickPointer !== null) return
  joystickPointer = event.pointerId
  updateJoystick(event)
})

function endJoystick(event: PointerEvent): void {
  if (event.pointerId !== joystickPointer) return
  joystickPointer = null
  touchMove.x = 0
  touchMove.y = 0
  ui.joystickKnob.style.transform = 'translate(0, 0)'
}

let lookPointer: number | null = null
let lookX = 0
let lookY = 0
ui.lookPad.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  if (lookPointer !== null) return
  lookPointer = event.pointerId
  lookX = event.clientX
  lookY = event.clientY
})

function updateLook(event: PointerEvent): void {
  if (event.pointerId !== lookPointer) return
  const dx = event.clientX - lookX
  const dy = event.clientY - lookY
  lookX = event.clientX
  lookY = event.clientY
  const lookScale = LOOK_SENSITIVITIES[state.lookSensitivityIndex]
  player.yaw -= dx * 0.0048 * lookScale
  player.pitch -= dy * 0.0042 * lookScale
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.18, 1.04)
}

function endLook(event: PointerEvent): void {
  if (event.pointerId === lookPointer) lookPointer = null
}

ui.sprintButton.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  performInteraction()
})

let firePointer: number | null = null
ui.fireButton.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  if (firePointer !== null) return
  firePointer = event.pointerId
  state.fireHeld = true
  fireWeapon()
})

function endFire(event: PointerEvent): void {
  if (event.pointerId !== firePointer) return
  firePointer = null
  state.fireHeld = false
}

document.addEventListener('pointermove', (event) => {
  if (event.pointerId !== joystickPointer && event.pointerId !== lookPointer) return
  event.preventDefault()
  if (event.pointerId === joystickPointer) updateJoystick(event)
  if (event.pointerId === lookPointer) updateLook(event)
}, { passive: false })

function endTouchPointer(event: PointerEvent): void {
  endJoystick(event)
  endLook(event)
  endFire(event)
}
document.addEventListener('pointerup', endTouchPointer)
document.addEventListener('pointercancel', endTouchPointer)

ui.reloadButton.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  beginReload()
})
switchButton.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  switchWeapon()
})
scopeButton.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  toggleScope()
})
jumpButton.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  jumpPlayer()
})
pauseButton.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  setPaused(true)
})
resumeButton.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  setPaused(false)
})
pauseSensitivityButton.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  cycleSensitivity()
})
pauseBrightnessButton.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  cycleBrightness()
})
documentClose.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  closeDocument()
})

ui.startButton.addEventListener('click', startGame)
ui.restartButton.addEventListener('click', () => {
  audio.start()
  resetRun()
})
ui.canvas.addEventListener('click', () => {
  if (state.started && !state.gameOver && !isTouch && document.pointerLockElement !== ui.canvas) {
    void ui.canvas.requestPointerLock?.()
  }
})

addEventListener('keydown', (event) => {
  keys.add(event.code)
  if (event.code === 'KeyR') beginReload()
  if (event.code === 'KeyQ') switchWeapon()
  if (event.code === 'KeyE') performInteraction()
  if (event.code === 'KeyC') toggleScope()
  if (event.code === 'Space') {
    event.preventDefault()
    jumpPlayer()
  }
  if (event.code === 'Escape') {
    if (state.documentOpen) closeDocument()
    else setPaused(!state.paused)
  }
})
addEventListener('keyup', (event) => keys.delete(event.code))
addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== ui.canvas) return
  const lookScale = LOOK_SENSITIVITIES[state.lookSensitivityIndex]
  player.yaw -= event.movementX * 0.0021 * lookScale
  player.pitch -= event.movementY * 0.0019 * lookScale
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.18, 1.04)
})
addEventListener('mousedown', (event) => {
  if (event.button === 0 && document.pointerLockElement === ui.canvas) {
    state.fireHeld = true
    fireWeapon()
  }
})
addEventListener('mouseup', (event) => {
  if (event.button === 0) state.fireHeld = false
})
addEventListener('contextmenu', (event) => event.preventDefault())
addEventListener('blur', () => {
  state.fireHeld = false
  firePointer = null
  lookPointer = null
  joystickPointer = null
  touchMove.x = 0
  touchMove.y = 0
  ui.joystickKnob.style.transform = 'translate(0, 0)'
  keys.clear()
})
document.addEventListener('visibilitychange', () => {
  state.paused = document.hidden
  if (state.paused) state.fireHeld = false
})

void App.addListener('backButton', () => {
  if (state.gameOver || !state.started) return
  if (state.documentOpen) closeDocument()
  else setPaused(!state.paused)
})

function onResize(): void {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(renderPixelRatio)
  renderer.setSize(innerWidth, innerHeight)
}
addEventListener('resize', onResize)

let elapsed = 0
let adaptiveSeconds = 0
let adaptiveFrames = 0

function updateAdaptiveResolution(rawDelta: number): void {
  if (!isTouch || !state.started || state.paused || state.gameOver || rawDelta > 0.2) return
  adaptiveSeconds += rawDelta
  adaptiveFrames += 1
  if (adaptiveSeconds < 2.4) return
  const averageFps = adaptiveFrames / adaptiveSeconds
  const previous = renderPixelRatio
  if (averageFps < 43) renderPixelRatio = Math.max(0.68, renderPixelRatio - 0.075)
  else if (averageFps < 51) renderPixelRatio = Math.max(0.68, renderPixelRatio - 0.045)
  else if (averageFps > 58) renderPixelRatio = Math.min(0.92, renderPixelRatio + 0.025)
  adaptiveSeconds = 0
  adaptiveFrames = 0
  if (Math.abs(previous - renderPixelRatio) < 0.001) return
  renderer.setPixelRatio(renderPixelRatio)
  renderer.setSize(innerWidth, innerHeight, false)
}

function animate(): void {
  requestAnimationFrame(animate)
  const rawDelta = clock.getDelta()
  const dt = Math.min(rawDelta, 0.04)
  elapsed += dt
  updateAdaptiveResolution(rawDelta)
  world.update(dt, elapsed)
  if (state.started && !state.paused && !state.documentOpen && !state.gameOver) {
    state.fireCooldown = Math.max(0, state.fireCooldown - dt)
    state.interactionCooldown = Math.max(0, state.interactionCooldown - dt)
    updateLift(dt)
    if (state.fireHeld) fireWeapon()
    if (state.reloading) {
      state.reloadTimer -= dt
      if (state.reloadTimer <= 0) finishReload()
    }
    updatePlayer(dt)
    if (!state.lift) {
      updateGhosts(dt, elapsed)
      updateWave(dt)
      updateHealthRecovery(dt)
    }
  }
  updateInterfaceTimers(dt)
  renderer.render(scene, camera)
}

refreshPauseSettings()
updateObjectiveStrip()
updateHud()
camera.position.copy(player.position)
camera.rotation.set(player.pitch, player.yaw, 0)
animate()
