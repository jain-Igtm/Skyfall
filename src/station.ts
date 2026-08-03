import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type Collider = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export type InteractionKind =
  | 'mask'
  | 'suit'
  | 'carbine'
  | 'scattergun'
  | 'multi-tool'
  | 'relay-fuse'
  | 'coolant-coupler'
  | 'life-support'
  | 'coolant'
  | 'relay'
  | 'elevator-down'
  | 'elevator-up'
  | 'lore'

export type StationInteraction = {
  id: string
  kind: InteractionKind
  label: string
  position: THREE.Vector3
  group: THREE.Group
  used: boolean
  title?: string
  body?: string
  screen?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
}

type AlarmFixture = {
  pivot: THREE.Group
  beam: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>
  phase: number
}

type SparkEmitter = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  origin: THREE.Vector3
  velocities: Float32Array
  phase: number
}

type HeatVent = {
  flame: THREE.Sprite
  phase: number
}

export type StationWorld = {
  colliders: Collider[]
  interactions: StationInteraction[]
  ghostSpawns: THREE.Vector3[]
  districtAt: (x: number, y: number, z: number) => string
  update: (dt: number, elapsed: number) => void
  markUsed: (interaction: StationInteraction) => void
  setSystemRepaired: (interaction: StationInteraction) => void
  setLiftY: (floorY: number) => void
  setMineActive: (active: boolean) => void
  reset: () => void
}

const stationFloorY = 0
const stationCeilingY = 5.6
export const mineFloorY = -28
export const stationEyeY = stationFloorY + 1.72
export const mineEyeY = mineFloorY + 1.72
export const liftX = 0
export const liftZ = -47

function seeded(index: number): number {
  const value = Math.sin(index * 938.217 + 17.13) * 43758.5453
  return value - Math.floor(value)
}

export function buildStation(scene: THREE.Scene): StationWorld {
  const colliders: Collider[] = []
  const interactions: StationInteraction[] = []
  const alarms: AlarmFixture[] = []
  const sparks: SparkEmitter[] = []
  const heatVents: HeatVent[] = []
  const mineLights: THREE.PointLight[] = []
  let mineActive = false
  const flickerMaterials: Array<{ material: THREE.MeshBasicMaterial; baseColor: number; phase: number }> = []
  const staticGeometry = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const station = new THREE.Group()
  station.name = 'Orison-9 mine and station'
  scene.add(station)
  const mineFill = new THREE.AmbientLight(0xaa4633, 2)
  mineFill.visible = false
  station.add(mineFill)

  const loader = new THREE.TextureLoader()
  function loadSurfaceTexture(path: string, repeatX: number, repeatY: number): THREE.Texture {
    const texture = loader.load(path)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeatX, repeatY)
    texture.anisotropy = 2
    return texture
  }

  const wallTexture = loadSurfaceTexture('./assets/textures/station-wall.webp', 2.4, 2.4)
  const floorTexture = loadSurfaceTexture('./assets/textures/station-floor.webp', 7, 11)
  const rustTexture = loadSurfaceTexture('./assets/textures/rusted-trim.webp', 2, 2)
  const ceilingTexture = loadSurfaceTexture('./assets/textures/station-ceiling.webp', 7, 11)
  const grateTexture = loadSurfaceTexture('./assets/textures/catwalk-grate.webp', 5, 8)
  const moltenTexture = loadSurfaceTexture('./assets/textures/molten-ore.webp', 4, 4)
  const planetTexture = loadSurfaceTexture('./assets/textures/dead-planet.webp', 1, 1)
  const weaponBlackTexture = loadSurfaceTexture('./assets/textures/weapon-black.webp', 1, 1)
  const weaponRedTexture = loadSurfaceTexture('./assets/textures/weapon-red.webp', 1, 1)
  const weaponSteelTexture = loadSurfaceTexture('./assets/textures/weapon-steel.webp', 1, 1)
  const weaponBarrelTexture = loadSurfaceTexture('./assets/textures/weapon-barrel.webp', 1, 1)

  const materials = {
    floor: new THREE.MeshLambertMaterial({ map: floorTexture, color: 0xbfc3c0 }),
    floorInset: new THREE.MeshLambertMaterial({ map: floorTexture, color: 0x7f8787 }),
    wall: new THREE.MeshLambertMaterial({ map: wallTexture, color: 0xc9cecb }),
    wallDark: new THREE.MeshLambertMaterial({ map: wallTexture, color: 0x8e9795 }),
    ceiling: new THREE.MeshLambertMaterial({ map: ceilingTexture, color: 0x838b8b }),
    trim: new THREE.MeshLambertMaterial({ map: rustTexture, color: 0x865d50 }),
    rust: new THREE.MeshLambertMaterial({ map: rustTexture, color: 0x704a40 }),
    pipe: new THREE.MeshLambertMaterial({ map: weaponSteelTexture, color: 0xaeb4b2 }),
    machine: new THREE.MeshLambertMaterial({ map: weaponBlackTexture, color: 0xa9aaa5 }),
    machineRed: new THREE.MeshLambertMaterial({ map: weaponRedTexture, color: 0xa88d87 }),
    barrel: new THREE.MeshLambertMaterial({ map: weaponBarrelTexture, color: 0xb9b2aa }),
    black: new THREE.MeshLambertMaterial({ map: weaponBlackTexture, color: 0x737978 }),
    grate: new THREE.MeshLambertMaterial({ map: grateTexture, color: 0xb2aaa4 }),
    rock: new THREE.MeshLambertMaterial({ map: moltenTexture, color: 0x393735 }),
    lava: new THREE.MeshLambertMaterial({
      map: moltenTexture,
      emissiveMap: moltenTexture,
      emissive: 0xff3b14,
      emissiveIntensity: 1.82,
      color: 0x4f312b,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x65828a,
      transparent: true,
      opacity: 0.12,
      roughness: 0.22,
      metalness: 0.08,
      transmission: 0.42,
      depthWrite: false,
    }),
    emergency: new THREE.MeshBasicMaterial({ color: 0xe63724, toneMapped: false }),
    cold: new THREE.MeshBasicMaterial({ color: 0xaed3d4, toneMapped: false }),
  }

  const flameCanvas = document.createElement('canvas')
  flameCanvas.width = 64
  flameCanvas.height = 128
  const flameContext = flameCanvas.getContext('2d')!
  const flameGradient = flameContext.createLinearGradient(0, 128, 0, 0)
  flameGradient.addColorStop(0, 'rgba(255,34,5,0)')
  flameGradient.addColorStop(0.12, 'rgba(255,48,8,0.92)')
  flameGradient.addColorStop(0.46, 'rgba(255,116,30,0.74)')
  flameGradient.addColorStop(0.74, 'rgba(255,61,12,0.34)')
  flameGradient.addColorStop(1, 'rgba(120,8,0,0)')
  flameContext.fillStyle = flameGradient
  flameContext.beginPath()
  flameContext.moveTo(32, 2)
  flameContext.bezierCurveTo(52, 34, 62, 88, 49, 124)
  flameContext.bezierCurveTo(40, 116, 24, 116, 15, 124)
  flameContext.bezierCurveTo(2, 88, 12, 34, 32, 2)
  flameContext.fill()
  const flameTexture = new THREE.CanvasTexture(flameCanvas)
  flameTexture.colorSpace = THREE.SRGBColorSpace

  function addCollider(x: number, y: number, z: number, width: number, height: number, depth: number): void {
    colliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minY: y - height / 2,
      maxY: y + height / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
    })
  }

  function addBox(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    solid = false,
    parent: THREE.Object3D = station,
    immediate = false,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
    mesh.position.set(x, y, z)
    if (parent === station && !immediate) {
      mesh.updateMatrix()
      mesh.geometry.applyMatrix4(mesh.matrix)
      const queued = staticGeometry.get(material) ?? []
      queued.push(mesh.geometry)
      staticGeometry.set(material, queued)
    } else {
      parent.add(mesh)
    }
    if (solid && parent === station) addCollider(x, y, z, width, height, depth)
    return mesh
  }

  function addCylinder(
    radius: number,
    length: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    rotationZ = Math.PI / 2,
    parent: THREE.Object3D = station,
    segments = 10,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material)
    mesh.position.set(x, y, z)
    mesh.rotation.z = rotationZ
    if (parent === station) {
      mesh.updateMatrix()
      mesh.geometry.applyMatrix4(mesh.matrix)
      const queued = staticGeometry.get(material) ?? []
      queued.push(mesh.geometry)
      staticGeometry.set(material, queued)
    } else {
      parent.add(mesh)
    }
    return mesh
  }

  function flushStaticGeometry(): void {
    for (const [material, geometries] of staticGeometry) {
      const merged = mergeGeometries(geometries, false)
      if (!merged) throw new Error('Static station geometry could not be merged.')
      merged.computeBoundingBox()
      merged.computeBoundingSphere()
      station.add(new THREE.Mesh(merged, material))
      for (const geometry of geometries) geometry.dispose()
    }
    staticGeometry.clear()
  }

  function addWallSegment(
    x: number,
    z: number,
    width: number,
    depth: number,
    floorY = stationFloorY,
    height = stationCeilingY,
  ): void {
    addBox(width, height, depth, x, floorY + height / 2, z, materials.wall, true)
    if (width > depth) {
      addBox(width, 0.13, depth + 0.08, x, floorY + 0.22, z, materials.trim)
      addBox(width, 0.11, depth + 0.08, x, floorY + height - 0.5, z, materials.rust)
    } else {
      addBox(width + 0.08, 0.13, depth, x, floorY + 0.22, z, materials.trim)
      addBox(width + 0.08, 0.11, depth, x, floorY + height - 0.5, z, materials.rust)
    }
  }

  function addFloorPlate(width: number, depth: number, x: number, z: number): void {
    addBox(width, 0.28, depth, x, -0.14, z, materials.floor)
    addBox(width * 0.94, 0.025, 0.055, x, 0.02, z - depth * 0.23, materials.floorInset)
    addBox(width * 0.94, 0.025, 0.055, x, 0.02, z + depth * 0.23, materials.floorInset)
  }

  function addCeilingPlate(width: number, depth: number, x: number, z: number): void {
    addBox(width, 0.14, depth, x, stationCeilingY + 0.07, z, materials.ceiling)
  }

  // The station is assembled as interlocking modules instead of one long, empty box.
  addFloorPlate(68, 114, 0, 2)
  addCeilingPlate(68, 114, 0, 2)
  addWallSegment(-34, 2, 0.65, 114)
  addWallSegment(34, 2, 0.65, 114)
  addWallSegment(0, -55, 68, 0.65)

  const observationGlass = addBox(67.2, 5.05, 0.18, 0, 2.67, 59, materials.glass, false, station, true)
  observationGlass.renderOrder = 2
  addCollider(0, 2.67, 59, 67.2, 5.05, 0.18)
  for (const x of [-34, -25.5, -17, -8.5, 0, 8.5, 17, 25.5, 34]) {
    addBox(0.42, 5.45, 0.62, x, 2.72, 58.85, materials.wallDark)
  }
  addBox(68, 0.42, 0.72, 0, 0.22, 58.85, materials.trim)
  addBox(68, 0.38, 0.72, 0, 5.35, 58.85, materials.black)

  const spineWallSections: Array<[number, number]> = [
    [-53.5, -49.5],
    [-44, -36.5],
    [-31, -23.5],
    [-18, -10.5],
    [-5, 2.5],
    [8, 15.5],
    [21, 28.5],
    [34, 41.5],
    [47, 55.5],
  ]
  for (const x of [-6.25, 6.25]) {
    for (const [start, end] of spineWallSections) {
      addWallSegment(x, (start + end) / 2, 0.5, end - start)
    }
  }

  function addSidePartition(z: number, side: -1 | 1): void {
    const center = side * 20
    const min = side < 0 ? -33.7 : 6.5
    const max = side < 0 ? -6.5 : 33.7
    const gap = 4.8
    addWallSegment((min + center - gap / 2) / 2, z, center - gap / 2 - min, 0.48)
    addWallSegment((center + gap / 2 + max) / 2, z, max - center - gap / 2, 0.48)
    addBox(5.4, 0.34, 0.74, center, 5.15, z, materials.black)
    addBox(0.36, 5, 0.72, center - gap / 2, 2.5, z, materials.trim)
    addBox(0.36, 5, 0.72, center + gap / 2, 2.5, z, materials.trim)
  }
  for (const z of [42.5, 18, -7.5, -34]) {
    addSidePartition(z, -1)
    addSidePartition(z, 1)
  }

  // Structural ribs and cable trays give the transit spine weight and scale.
  for (const z of [-47, -38, -27, -16, -5, 6, 17, 28, 39, 50]) {
    addBox(0.36, 5.35, 0.52, -5.85, 2.68, z, materials.rust)
    addBox(0.36, 5.35, 0.52, 5.85, 2.68, z, materials.rust)
    addBox(11.6, 0.34, 0.52, 0, 5.15, z, materials.machine)
    addBox(7.8, 0.13, 0.24, 0, 4.75, z, materials.pipe)
  }

  function addPracticalLight(x: number, z: number, width: number, intensity: number, phase: number): void {
    const material = materials.cold.clone()
    const baseColor = intensity >= 34 ? 0xc5dddd : 0xaac4c5
    material.color.setHex(baseColor)
    flickerMaterials.push({ material, baseColor, phase })
    addBox(width, 0.085, 0.28, x, 5.36, z, material)
  }
  for (const [x, z, width, intensity, phase] of [
    [-18, 50, 5.8, 42, 0.2], [18, 50, 5.8, 42, 1.1],
    [-20, 30, 5.2, 34, 2.2], [20, 30, 5.2, 34, 3.1],
    [-20, 5, 5.2, 31, 4.2], [20, 5, 5.2, 31, 5.1],
    [-20, -21, 5.2, 29, 6.2], [20, -21, 5.2, 29, 7.1],
    [0, 36, 3.3, 30, 8.2], [0, 13, 3.3, 27, 9.1], [0, -12, 3.3, 25, 10.3],
  ] as const) addPracticalLight(x, z, width, intensity, phase)

  function addAlarm(x: number, y: number, z: number, phase: number, rotationY = 0): void {
    const pivot = new THREE.Group()
    pivot.position.set(x, y, z)
    pivot.rotation.y = rotationY
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.42, 10), materials.black)
    housing.rotation.z = Math.PI / 2
    pivot.add(housing)
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.17, 9, 6), materials.emergency)
    lens.position.x = 0.26
    pivot.add(lens)
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xff301f,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.3, 6.2, 10, 1, true), beamMaterial)
    beam.rotation.z = -Math.PI / 2
    beam.position.x = 3.05
    pivot.add(beam)
    station.add(pivot)
    alarms.push({ pivot, beam, phase })
  }
  addAlarm(-5.7, 4.55, 35, 0.2)
  addAlarm(5.7, 4.55, 12, 1.8, Math.PI)
  addAlarm(-5.7, 4.55, -13, 3.4)
  addAlarm(5.7, 4.55, -39, 5.1, Math.PI)

  function addSparkEmitter(x: number, y: number, z: number, phase: number): void {
    const count = 18
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = x
      positions[index * 3 + 1] = y
      positions[index * 3 + 2] = z
      velocities[index * 3] = (seeded(index + phase * 10) - 0.5) * 2.1
      velocities[index * 3 + 1] = -0.75 - seeded(index + 71 + phase * 7) * 2.3
      velocities[index * 3 + 2] = (seeded(index + 142 + phase * 5) - 0.5) * 2.1
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: 0xff8b42,
      size: 0.085,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geometry, material)
    station.add(points)
    sparks.push({ points, origin: new THREE.Vector3(x, y, z), velocities, phase })
  }
  addSparkEmitter(-5.85, 4.1, 23.7, 0.4)
  addSparkEmitter(18.5, 3.15, -7.2, 2.1)
  addSparkEmitter(-33.4, 3.6, -14.5, 4.6)
  addSparkEmitter(5.9, 3.4, -36.6, 6.2)

  function addCrate(x: number, z: number, rotation = 0, scale = 1): void {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.rotation.y = rotation
    addBox(2.05 * scale, 1.35 * scale, 1.55 * scale, 0, 0.69 * scale, 0, materials.machineRed, false, group)
    addBox(2.16 * scale, 0.11, 1.64 * scale, 0, 0.24 * scale, 0, materials.trim, false, group)
    addBox(0.11, 1.42 * scale, 1.63 * scale, -0.75 * scale, 0.72 * scale, 0, materials.pipe, false, group)
    addBox(0.11, 1.42 * scale, 1.63 * scale, 0.75 * scale, 0.72 * scale, 0, materials.pipe, false, group)
    station.add(group)
    addCollider(x, 0.72 * scale, z, 2.3 * scale, 1.5 * scale, 1.85 * scale)
  }
  addCrate(-29, 48, 0.12, 0.9)
  addCrate(-27, 38, -0.18)
  addCrate(-24.4, 36.2, 0.22, 0.78)
  addCrate(28, 22.5, 0.14)
  addCrate(25.5, -28.5, -0.28, 0.92)
  addCrate(-29, -29, 0.31, 1.08)
  addCrate(-10, -42.5, -0.15, 0.78)

  function addBench(x: number, z: number, rotation = 0): void {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.rotation.y = rotation
    addBox(4.4, 0.28, 1.25, 0, 0.78, 0, materials.machine, false, group)
    for (const legX of [-1.7, 1.7]) addBox(0.22, 0.76, 0.9, legX, 0.39, 0, materials.pipe, false, group)
    addBox(4.5, 0.1, 0.16, 0, 1.25, 0.47, materials.trim, false, group)
    station.add(group)
    addCollider(x, 0.78, z, rotation === 0 ? 4.6 : 1.6, 1.55, rotation === 0 ? 1.6 : 4.6)
  }
  addBench(-20, 53, 0)
  addBench(20, 53, 0)
  addBench(-19, -19, Math.PI / 2)

  function addConsole(
    x: number,
    y: number,
    z: number,
    rotation: number,
    color: number,
    width = 3.2,
  ): { group: THREE.Group; screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> } {
    const group = new THREE.Group()
    group.position.set(x, y, z)
    group.rotation.y = rotation
    addBox(width, 1.35, 0.9, 0, 0.69, 0, materials.machine, false, group)
    addBox(width * 0.92, 0.2, 0.96, 0, 1.35, -0.12, materials.pipe, false, group)
    const screenMaterial = new THREE.MeshBasicMaterial({ color, toneMapped: false })
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.62, 0.45), screenMaterial)
    screen.position.set(0, 1.43, -0.49)
    screen.rotation.x = -0.14
    group.add(screen)
    station.add(group)
    return { group, screen }
  }

  // Observation controls are built into furniture; no floating world-space signs remain.
  addConsole(-11, 0, 55.4, Math.PI, 0x345052, 4.8)
  addConsole(0, 0, 55.4, Math.PI, 0x2d4143, 4.8)
  addConsole(11, 0, 55.4, Math.PI, 0x4e271f, 4.8)

  // Equipment racks and suit storage.
  for (const x of [-30, -26, -22, -18, -14, -10]) {
    addBox(2.55, 4.35, 0.72, x, 2.2, 41.8, materials.wallDark)
    addBox(2.25, 0.16, 0.82, x, 1.1, 41.25, materials.pipe)
    addBox(2.25, 0.16, 0.82, x, 2.25, 41.25, materials.pipe)
    addBox(2.25, 0.16, 0.82, x, 3.4, 41.25, materials.pipe)
  }
  for (const x of [11, 15, 19, 23, 27, 31]) {
    addBox(3.2, 4.4, 0.9, x, 2.2, 41.7, materials.machine)
    addBox(2.45, 0.12, 1.02, x, 1.05, 41.15, materials.trim)
    addBox(2.45, 0.12, 1.02, x, 2.25, 41.15, materials.trim)
    addBox(2.45, 0.12, 1.02, x, 3.45, 41.15, materials.trim)
  }

  // Relay stacks and life-support pressure vessels fill the mid-station modules.
  for (const [x, z] of [[-30, 13], [-26, 13], [-14, 13], [-10, 13], [-30, -2], [-10, -2]] as const) {
    addBox(2.7, 4.3, 1.5, x, 2.18, z, materials.machine, true)
    for (let y = 0.85; y < 4; y += 0.65) addBox(1.9, 0.09, 1.56, x, y, z - 0.04, materials.pipe)
    const status = new THREE.MeshBasicMaterial({ color: seeded(x + z) > 0.5 ? 0x7a2b20 : 0x2d5b58, toneMapped: false })
    addBox(0.16, 0.12, 0.05, x + 0.75, 2.95, z - 0.79, status)
  }
  for (const [x, z] of [[11, 13], [16, 13], [21, 13], [26, 13], [31, 13], [13, -1], [27, -1]] as const) {
    addCylinder(1.25, 4.25, x, 2.18, z, materials.pipe, 0, station, 14)
    addCylinder(1.34, 0.22, x, 0.55, z, materials.trim, 0, station, 14)
    addCylinder(1.34, 0.22, x, 3.83, z, materials.trim, 0, station, 14)
    addCollider(x, 2.18, z, 2.55, 4.4, 2.55)
  }

  // Machine shop: benches, suspended cable, spare pump housings, and ruined equipment.
  for (const x of [-31, -26, -14, -9]) {
    addBox(3.4, 1.25, 1.45, x, 0.64, -31.8, materials.machineRed, true)
    addBox(3.55, 0.16, 1.55, x, 1.28, -31.8, materials.pipe)
  }
  for (const [x, z, radius] of [[-27, -13, 0.72], [-21, -13, 0.95], [-14, -13, 0.62]] as const) {
    addCylinder(radius, 3.2, x, 1.2, z, materials.barrel, Math.PI / 2, station, 14)
    addCollider(x, 1.2, z, radius * 2.2, radius * 2.2, 3.4)
  }
  const brokenCable = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.1, 7, 24, Math.PI * 1.55), materials.black)
  brokenCable.position.set(-18, 3.9, -24)
  brokenCable.rotation.x = Math.PI / 2
  station.add(brokenCable)

  // Southern pump preparation module and service piping.
  for (const x of [10.5, 15.5, 20.5, 25.5, 30.5]) {
    addCylinder(0.42, 17.5, x, 4.22, -20.5, materials.pipe, 0)
    addCylinder(0.52, 0.22, x, 4.22, -29, materials.trim, Math.PI / 2)
    addCylinder(0.52, 0.22, x, 4.22, -12, materials.trim, Math.PI / 2)
  }
  for (const [x, z] of [[13, -29], [20, -29], [27, -29]] as const) {
    addCylinder(1.45, 2.7, x, 1.48, z, materials.machine, 0, station, 14)
    addCylinder(0.62, 3.2, x, 2.88, z, materials.barrel, 0, station, 12)
    addCollider(x, 1.5, z, 3.1, 3, 3.1)
  }

  function pickupBase(accent = 0x79b5be): THREE.Group {
    const group = new THREE.Group()
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.035, 6, 24),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.6, toneMapped: false }),
    )
    ring.rotation.x = Math.PI / 2
    group.add(ring)
    return group
  }

  function addPickup(
    id: string,
    kind: InteractionKind,
    label: string,
    x: number,
    y: number,
    z: number,
    visual: THREE.Group,
  ): StationInteraction {
    visual.position.set(x, y, z)
    station.add(visual)
    const interaction: StationInteraction = {
      id,
      kind,
      label,
      position: new THREE.Vector3(x, y, z),
      group: visual,
      used: false,
    }
    interactions.push(interaction)
    return interaction
  }

  const mask = pickupBase(0x91c5cc)
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    new THREE.MeshPhysicalMaterial({
      color: 0xa9d8dd,
      transparent: true,
      opacity: 0.19,
      roughness: 0.08,
      transmission: 0.72,
      depthWrite: false,
    }),
  )
  shield.rotation.x = -0.3
  mask.add(shield)
  const maskBand = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 22), materials.black)
  maskBand.rotation.x = Math.PI / 2
  mask.add(maskBand)
  addPickup('mask', 'mask', 'TAKE CLEAR BREATHING SHIELD', -17, 1.25, 34, mask)

  const suit = pickupBase(0xa86e50)
  addBox(0.95, 1.6, 0.46, 0, 0, 0, materials.machine, false, suit)
  addBox(1.35, 0.42, 0.48, 0, 0.42, 0, materials.machineRed, false, suit)
  addCylinder(0.18, 1.25, -0.68, 0.2, 0, materials.barrel, 0, suit)
  addCylinder(0.18, 1.25, 0.68, 0.2, 0, materials.barrel, 0, suit)
  addPickup('suit', 'suit', 'SUIT UP · LIGHT MINING SHELL', -28, 1.35, 28, suit)

  function weaponVisual(long = false): THREE.Group {
    const group = pickupBase(long ? 0xa87356 : 0x98503e)
    addBox(0.32, 0.3, long ? 2.7 : 2.2, 0, 0.16, 0, materials.black, false, group)
    addBox(0.54, 0.48, 0.88, 0, 0.1, 0.27, materials.machineRed, false, group)
    addBox(0.2, 0.72, 0.34, 0, -0.34, 0.34, materials.machine, false, group)
    addCylinder(0.075, long ? 1.5 : 1.1, 0, 0.17, -1.45, materials.barrel, Math.PI / 2, group, 10)
    group.rotation.y = Math.PI / 2
    return group
  }
  addPickup('carbine', 'carbine', 'TAKE RUSTLINE CARBINE', 20, 1.18, 29, weaponVisual())
  addPickup('scattergun', 'scattergun', 'TAKE BREACH SCATTERGUN', -20, 1.18, -20, weaponVisual(true))

  const tool = pickupBase(0xc79651)
  addBox(0.26, 0.28, 1.45, 0, 0.06, 0, materials.barrel, false, tool)
  addBox(0.62, 0.18, 0.35, 0, 0.06, -0.62, materials.machineRed, false, tool)
  addPickup('multi-tool', 'multi-tool', 'TAKE IMPERIAL MULTI-TOOL', -28, 1.08, -25, tool)

  const fuse = pickupBase(0xa96648)
  addCylinder(0.22, 1.1, 0, 0, 0, materials.machineRed, Math.PI / 2, fuse)
  addCylinder(0.29, 0.18, -0.52, 0, 0, materials.barrel, Math.PI / 2, fuse)
  addCylinder(0.29, 0.18, 0.52, 0, 0, materials.barrel, Math.PI / 2, fuse)
  addPickup('relay-fuse', 'relay-fuse', 'TAKE RELAY FUSE', 28, 1.08, 24, fuse)

  const coupler = pickupBase(0x6fa6a8)
  coupler.add(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.17, 8, 16), materials.pipe))
  addPickup('coolant-coupler', 'coolant-coupler', 'TAKE COOLANT COUPLER', -16, 1.08, -1, coupler)

  const relayConsole = addConsole(-21, 0, 4.5, 0, 0x7b291f, 4.1)
  const lifeConsole = addConsole(21, 0, 4.5, 0, 0x7b291f, 4.1)

  function addSystem(
    id: string,
    kind: InteractionKind,
    label: string,
    consoleData: ReturnType<typeof addConsole>,
  ): void {
    interactions.push({
      id,
      kind,
      label,
      position: consoleData.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
      group: consoleData.group,
      used: false,
      screen: consoleData.screen,
    })
  }
  addSystem('relay', 'relay', 'REPAIR CROWN RELAY', relayConsole)
  addSystem('life-support', 'life-support', 'RESTORE LIFE SUPPORT', lifeConsole)

  function addLore(id: string, x: number, y: number, z: number, title: string, body: string, rotationY = 0): void {
    const group = new THREE.Group()
    group.position.set(x, y, z)
    group.rotation.y = rotationY
    const casing = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.72, 0.22), materials.machine)
    group.add(casing)
    const material = new THREE.MeshBasicMaterial({ color: 0x314e50, toneMapped: false })
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.3), material)
    screen.position.z = 0.125
    group.add(screen)
    station.add(group)
    interactions.push({
      id,
      kind: 'lore',
      label: 'READ EMBEDDED TERMINAL',
      position: group.position.clone(),
      group,
      used: false,
      title,
      body,
    })
  }
  addLore(
    'charter', -10, 1.34, 56.9,
    'CHARTER OF EXTRACTION · AMENDMENT 882',
    'Orison-9 remains property of the Central Empire in perpetuity.\n\nLocal levy, safety and burial ordinances are administered by the Principality of Vesta until direct Imperial authority resumes.\n\nExpected resumption date: pending.',
    Math.PI,
  )
  addLore(
    'payroll', -32.9, 1.34, 26,
    'PAYROLL DENOMINATION NOTICE',
    'Central crowns will no longer be accepted at station commissaries. Vesta scrip, Khepri freight notes and refinery ration chits remain valid.\n\nImperial payroll arrears now stand at eleven rotations.',
    Math.PI / 2,
  )
  addLore(
    'relay-notice', -8, 1.34, 4,
    'CROWN RELAY SERVICE BULLETIN',
    'The Imperial relay acknowledges all lawful petitions in the order received. Current round-trip latency is forty-one standard days.\n\nDo not retransmit. Duplicate petitions incur a filing levy.',
    Math.PI / 2,
  )

  // The lift cage is real geometry and moves through a visible, thirty-metre service shaft.
  const lift = new THREE.Group()
  lift.position.set(liftX, 0, liftZ)
  addBox(5.5, 0.28, 5.2, 0, -0.14, 0, materials.grate, false, lift)
  addBox(5.5, 0.24, 5.2, 0, 3.02, 0, materials.machine, false, lift)
  for (const x of [-2.55, 2.55]) {
    for (const z of [-2.35, 0, 2.35]) addBox(0.18, 3.1, 0.18, x, 1.48, z, materials.pipe, false, lift)
  }
  addBox(0.16, 1.1, 5.0, -2.62, 0.55, 0, materials.pipe, false, lift)
  addBox(0.16, 1.1, 5.0, 2.62, 0.55, 0, materials.pipe, false, lift)
  const liftLightPanel = new THREE.MeshBasicMaterial({ color: 0xa12e20, toneMapped: false })
  addBox(1.8, 0.06, 0.22, 0, 2.86, -0.4, liftLightPanel, false, lift)
  station.add(lift)

  addBox(0.5, 34, 6.6, -3.25, -13.5, liftZ, materials.wallDark, true)
  addBox(0.5, 34, 6.6, 3.25, -13.5, liftZ, materials.wallDark, true)
  addBox(7, 34, 0.5, 0, -13.5, liftZ - 3.25, materials.wallDark, true)
  for (let y = -25; y <= -2; y += 4.6) {
    addBox(6.8, 0.22, 0.25, 0, y, liftZ + 3.1, materials.trim)
  }
  for (const x of [-2.9, 2.9]) addCylinder(0.13, 30, x, -13, liftZ - 2.65, materials.barrel, 0)

  function addLiftPanel(id: string, kind: 'elevator-down' | 'elevator-up', label: string, y: number): void {
    const group = new THREE.Group()
    group.position.set(3.45, y, liftZ + 3.4)
    addBox(0.7, 1.25, 0.28, 0, 0, 0, materials.machine, false, group)
    addBox(0.34, 0.34, 0.04, 0, 0.18, 0.17, materials.emergency, false, group)
    station.add(group)
    interactions.push({ id, kind, label, position: group.position.clone(), group, used: false })
  }
  addLiftPanel('lift-down', 'elevator-down', 'DESCEND TO SHAFT FOUR', 1.15)
  addLiftPanel('lift-up', 'elevator-up', 'ASCEND TO ORISON-9', mineFloorY + 1.15)

  // SHAFT FOUR: a catwalk ring around the excavation and its core-pumping drill.
  const cavernShell = new THREE.Mesh(
    new THREE.SphereGeometry(52, 20, 12),
    new THREE.MeshLambertMaterial({
      map: moltenTexture,
      color: 0x3c302c,
      side: THREE.BackSide,
    }),
  )
  cavernShell.position.set(0, mineFloorY - 10, -19)
  cavernShell.scale.set(1, 0.52, 0.72)
  station.add(cavernShell)

  const catwalkY = mineFloorY - 0.14
  function addCatwalk(width: number, depth: number, x: number, z: number): void {
    addBox(width, 0.28, depth, x, catwalkY, z, materials.grate)
  }
  addCatwalk(49, 4.5, 0, -40.5)
  addCatwalk(49, 4.5, 0, 1.5)
  addCatwalk(4.5, 42, -22.25, -19.5)
  addCatwalk(4.5, 42, 22.25, -19.5)
  addCatwalk(5.5, 8.5, 0, -44.8)
  addCatwalk(10, 7.5, 28.5, -30)
  addCatwalk(8.5, 4.2, 26, -30)

  // Rock shelves and a rough pressure shell make the lower operation feel excavated rather than constructed.
  addBox(73, 1.2, 8, 0, mineFloorY - 0.72, -48, materials.rock)
  addBox(73, 1.2, 9, 0, mineFloorY - 0.72, 6.5, materials.rock)
  addBox(10, 1.2, 48, -31, mineFloorY - 0.72, -18, materials.rock)
  addBox(10, 1.2, 48, 31, mineFloorY - 0.72, -18, materials.rock)
  for (let index = 0; index < 34; index += 1) {
    const side = index % 2 === 0 ? -1 : 1
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(2.2 + seeded(index + 20) * 2.5, 0),
      materials.rock,
    )
    rock.position.set(
      side * (31 + seeded(index + 40) * 5),
      mineFloorY + 0.5 + seeded(index + 60) * 5,
      -46 + seeded(index + 80) * 54,
    )
    rock.scale.set(1, 1.4 + seeded(index + 100), 1.25)
    rock.rotation.set(seeded(index) * 2, seeded(index + 8) * 3, seeded(index + 16))
    station.add(rock)
  }
  addCollider(-36, mineFloorY + 1.8, -19, 2.5, 7, 58)
  addCollider(36, mineFloorY + 1.8, -19, 2.5, 7, 58)
  addCollider(0, mineFloorY + 1.8, 11, 73, 7, 2.5)

  function addRail(width: number, depth: number, x: number, z: number): void {
    addBox(width, 0.12, depth, x, mineFloorY + 1.06, z, materials.pipe, true)
    const longX = width > depth
    const span = longX ? width : depth
    const count = Math.max(2, Math.floor(span / 3.4))
    for (let index = 0; index <= count; index += 1) {
      const offset = -span / 2 + (span * index) / count
      addBox(
        0.12,
        1.14,
        0.12,
        x + (longX ? offset : 0),
        mineFloorY + 0.52,
        z + (longX ? 0 : offset),
        materials.pipe,
      )
    }
    addBox(width, 0.08, depth, x, mineFloorY + 0.52, z, materials.trim)
  }
  addRail(44.5, 0.13, 0, -38.2)
  // Split the outer rail so the service-lift bridge opens directly onto the ring.
  addRail(18.5, 0.13, -13, -42.8)
  addRail(18.5, 0.13, 13, -42.8)
  addRail(44.5, 0.13, 0, -0.8)
  addRail(44.5, 0.13, 0, 3.8)
  addRail(0.13, 37.5, -20, -19.5)
  addRail(0.13, 37.5, -24.5, -19.5)
  addRail(0.13, 37.5, 20, -19.5)
  // Leave a gated opening from the east ring to the thermal-exchange platform.
  addRail(0.13, 5.25, 24.5, -35.625)
  addRail(0.13, 26.25, 24.5, -13.875)

  for (const x of [-22, -11, 0, 11, 22]) {
    addBox(0.34, 18, 0.34, x, mineFloorY - 9, -40.5, materials.rust)
    addBox(0.34, 18, 0.34, x, mineFloorY - 9, 1.5, materials.rust)
  }
  for (const z of [-35, -25, -15, -5]) {
    addBox(0.34, 18, 0.34, -22.25, mineFloorY - 9, z, materials.rust)
    addBox(0.34, 18, 0.34, 22.25, mineFloorY - 9, z, materials.rust)
  }

  const lava = new THREE.Mesh(new THREE.PlaneGeometry(41, 34), materials.lava)
  lava.rotation.x = -Math.PI / 2
  lava.position.set(0, mineFloorY - 19.2, -19.5)
  station.add(lava)
  for (const [x, y, z, color, intensity, distance] of [
    [0, mineFloorY + 5.5, -20, 0xc54125, 118, 38],
    [-11, mineFloorY - 8, -27, 0xff3c16, 96, 32],
    [11, mineFloorY - 8, -13, 0xff4a1e, 96, 32],
  ] as const) {
    const light = new THREE.PointLight(color, intensity, distance, 1.55)
    light.position.set(x, y, z)
    light.visible = false
    station.add(light)
    mineLights.push(light)
  }

  const drill = new THREE.Group()
  drill.position.set(0, 0, -19.5)
  const drillHammer = new THREE.Group()
  addCylinder(2.35, 17, 0, mineFloorY - 9, 0, materials.barrel, 0, drillHammer, 18)
  const drillBit = new THREE.Mesh(new THREE.ConeGeometry(3.15, 8.2, 16, 3), materials.machineRed)
  drillBit.position.y = mineFloorY - 20.8
  drillHammer.add(drillBit)
  const drillRotor = new THREE.Group()
  addCylinder(5.5, 1.3, 0, mineFloorY - 2.7, 0, materials.machine, 0, drillRotor, 18)
  addCylinder(4.25, 1.5, 0, mineFloorY - 4.1, 0, materials.machineRed, 0, drillRotor, 18)
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2
    addBox(1.15, 1.1, 4.7, Math.sin(angle) * 4.1, mineFloorY - 3.35, Math.cos(angle) * 4.1, materials.rust, false, drillRotor)
    drillRotor.children[drillRotor.children.length - 1].rotation.y = angle
  }
  drill.add(drillHammer, drillRotor)
  for (const x of [-8.5, 8.5]) {
    addBox(1.6, 9.5, 1.6, x, mineFloorY + 3.4, 0, materials.machine, false, drill)
    addCylinder(0.48, 9.5, x, mineFloorY - 4.8, 0, materials.barrel, 0, drill, 12)
    addBox(8.2, 1.1, 1.35, x / 2, mineFloorY + 7.7, 0, materials.rust, false, drill)
  }
  addBox(20, 1.1, 2.1, 0, mineFloorY + 8.2, 0, materials.machine, false, drill)
  station.add(drill)

  for (const [x, z, phase] of [[-9, -29, 0.2], [9, -9, 2.3], [13, -31, 4.4]] as const) {
    const material = new THREE.SpriteMaterial({
      map: flameTexture,
      color: 0xff6b2b,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const flame = new THREE.Sprite(material)
    flame.position.set(x, mineFloorY - 1.3, z)
    flame.scale.set(2.2, 4.5, 1)
    station.add(flame)
    heatVents.push({ flame, phase })
  }

  const mineLightMaterial = new THREE.MeshBasicMaterial({ color: 0xf04a2c, toneMapped: false })
  for (const [x, z] of [[-22, -40], [22, -40], [-22, 1], [22, 1], [29, -30]] as const) {
    addBox(1.8, 0.18, 0.4, x, mineFloorY + 2.8, z, mineLightMaterial)
  }
  addAlarm(19.8, mineFloorY + 2.25, -22, 2.6, Math.PI / 2)

  // Coolant exchange lives below, forcing the lift and mine to be part of the repair route.
  const coolantConsole = addConsole(28.5, mineFloorY, -30, -Math.PI / 2, 0x7b291f, 4.4)
  addSystem('coolant', 'coolant', 'REPAIR DEEP THERMAL EXCHANGE', coolantConsole)
  addLore(
    'memorial', 24.8, mineFloorY + 1.35, -5,
    'SHIFT MEMORIAL · UNAUTHORIZED',
    'For the thirty-two miners lost below Shaft Four.\n\nThe governor called them contractors. The prince called them Imperial subjects. The Empire did not answer.',
    -Math.PI / 2,
  )
  addLore(
    'core-order', -24.8, mineFloorY + 1.35, -31,
    'CORE PUMP CONTINUANCE ORDER',
    'Extraction must continue during evacuation, insurrection, atmospheric loss, or loss of local government.\n\nThe machine is Crown property. Personnel are locally replaceable.',
    Math.PI / 2,
  )

  // Planet, moon surface, and a faint additive halo beyond the observation glass.
  const exterior = new THREE.Group()
  const starCount = 560
  const starPositions = new Float32Array(starCount * 3)
  for (let index = 0; index < starCount; index += 1) {
    const radius = 180 + seeded(index + 30) * 280
    const theta = seeded(index + 300) * Math.PI * 2
    const phi = Math.acos(2 * seeded(index + 900) - 1)
    starPositions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius
    starPositions[index * 3 + 1] = Math.cos(phi) * radius
    starPositions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius
  }
  const starGeometry = new THREE.BufferGeometry()
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  exterior.add(new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ color: 0xc9d2d0, size: 0.58, sizeAttenuation: true, fog: false }),
  ))

  const planetMaterial = new THREE.MeshBasicMaterial({
    map: planetTexture,
    color: 0x9b918a,
    fog: false,
  })
  const planet = new THREE.Mesh(new THREE.SphereGeometry(42, 40, 24), planetMaterial)
  planet.position.set(30, 24, 174)
  planet.scale.y = 0.975
  exterior.add(planet)
  const planetHalo = new THREE.Mesh(
    new THREE.SphereGeometry(43.8, 30, 18),
    new THREE.MeshBasicMaterial({
      color: 0x7a3021,
      transparent: true,
      opacity: 0.055,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  )
  planetHalo.position.copy(planet.position)
  planetHalo.scale.y = 0.975
  exterior.add(planetHalo)
  const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 240),
    new THREE.MeshBasicMaterial({ map: planetTexture, color: 0x454542, fog: false }),
  )
  moon.rotation.x = -Math.PI / 2
  moon.position.set(0, -4.8, 130)
  exterior.add(moon)
  scene.add(exterior)

  const ghostSpawns = [
    new THREE.Vector3(-26, 1.95, 49),
    new THREE.Vector3(26, 1.95, 49),
    new THREE.Vector3(-28, 1.95, 28),
    new THREE.Vector3(28, 1.95, 28),
    new THREE.Vector3(-28, 1.95, 4),
    new THREE.Vector3(28, 1.95, 4),
    new THREE.Vector3(-27, 1.95, -22),
    new THREE.Vector3(27, 1.95, -22),
    new THREE.Vector3(0, 1.95, -38),
    new THREE.Vector3(-22, mineFloorY + 1.95, -37),
    new THREE.Vector3(22, mineFloorY + 1.95, -37),
    new THREE.Vector3(-22, mineFloorY + 1.95, -4),
    new THREE.Vector3(22, mineFloorY + 1.95, -4),
    new THREE.Vector3(29, mineFloorY + 1.95, -30),
  ]

  function districtAt(x: number, y: number, z: number): string {
    if (y < -13) {
      if (z < -42) return 'SHAFT FOUR DESCENT'
      if (x > 24) return 'DEEP THERMAL EXCHANGE'
      if (Math.abs(x) < 9 && z > -31 && z < -8) return 'CORE PUMP · EXCAVATION WELL'
      if (x < -12) return 'WEST PIT CATWALK'
      if (x > 12) return 'EAST PIT CATWALK'
      return 'SHAFT FOUR RING'
    }
    if (z > 42.5) return 'OBSERVATION GALLERY'
    if (Math.abs(x) < 6.5) return z < -35 ? 'SERVICE LIFT VESTIBULE' : 'CENTRAL TRANSIT SPINE'
    if (z > 18) return x < 0 ? 'EQUIPMENT BAY 03' : 'SECURITY STORES'
    if (z > -7.5) return x < 0 ? 'CROWN RELAY' : 'LIFE SUPPORT'
    if (z > -34) return x < 0 ? 'MACHINE SHOP' : 'PUMP PREPARATION'
    return 'SERVICE LIFT VESTIBULE'
  }

  function markUsed(interaction: StationInteraction): void {
    interaction.used = true
    if (!['life-support', 'coolant', 'relay', 'lore', 'elevator-down', 'elevator-up'].includes(interaction.kind)) {
      interaction.group.visible = false
    }
  }

  function setSystemRepaired(interaction: StationInteraction): void {
    interaction.used = true
    if (interaction.screen) interaction.screen.material.color.setHex(0x477b76)
  }

  function setLiftY(floorY: number): void {
    lift.position.y = floorY
  }

  function setMineActive(active: boolean): void {
    if (mineActive === active) return
    mineActive = active
    mineFill.visible = active
    for (const light of mineLights) light.visible = active
  }

  function reset(): void {
    for (const interaction of interactions) {
      interaction.used = false
      interaction.group.visible = true
      if (interaction.screen) interaction.screen.material.color.setHex(0x7b291f)
    }
    setLiftY(stationFloorY)
    setMineActive(false)
  }

  function update(dt: number, elapsed: number): void {
    for (const alarm of alarms) {
      alarm.pivot.rotation.y += dt * 2.15
      const pulse = 0.5 + Math.max(0, Math.sin(elapsed * 5.2 + alarm.phase)) * 0.72
      alarm.beam.material.opacity = 0.025 + pulse * 0.038
    }
    for (let index = 0; index < flickerMaterials.length; index += 1) {
      const { material, baseColor, phase } = flickerMaterials[index]
      const drop = seeded(Math.floor(elapsed * 9.5 + phase * 11) + index * 19) > 0.94 ? 0.54 : 1
      material.color.setHex(baseColor).multiplyScalar(drop)
    }
    for (const emitter of sparks) {
      const attribute = emitter.points.geometry.getAttribute('position') as THREE.BufferAttribute
      const active = Math.sin(elapsed * 2.5 + emitter.phase) > 0.62 || Math.sin(elapsed * 8.3 + emitter.phase) > 0.9
      emitter.points.visible = active
      for (let index = 0; index < attribute.count; index += 1) {
        let x = attribute.getX(index) + emitter.velocities[index * 3] * dt
        let y = attribute.getY(index) + emitter.velocities[index * 3 + 1] * dt
        let z = attribute.getZ(index) + emitter.velocities[index * 3 + 2] * dt
        if (y < emitter.origin.y - 2.25) {
          x = emitter.origin.x
          y = emitter.origin.y
          z = emitter.origin.z
        }
        attribute.setXYZ(index, x, y, z)
      }
      attribute.needsUpdate = true
    }
    for (let index = 0; index < interactions.length; index += 1) {
      const interaction = interactions[index]
      if (interaction.used || ['life-support', 'coolant', 'relay', 'lore', 'elevator-down', 'elevator-up'].includes(interaction.kind)) continue
      interaction.group.rotation.y += dt * 0.58
      interaction.group.position.y = interaction.position.y + Math.sin(elapsed * 1.65 + index) * 0.07
    }
    for (const vent of heatVents) {
      const pulse = 0.68 + Math.sin(elapsed * 7.2 + vent.phase) * 0.18 + Math.sin(elapsed * 12.6 + vent.phase) * 0.1
      vent.flame.scale.set(1.8 + pulse * 0.45, 3.4 + pulse * 1.25, 1)
      vent.flame.material.opacity = 0.2 + pulse * 0.22
    }
    drillRotor.rotation.y += dt * 0.68
    drillHammer.position.y = Math.sin(elapsed * 1.14) * 0.42
    lava.material.emissiveIntensity = 1.72 + Math.sin(elapsed * 0.82) * 0.2
    planet.rotation.y += dt * 0.0022
  }

  flushStaticGeometry()

  return {
    colliders,
    interactions,
    ghostSpawns,
    districtAt,
    update,
    markUsed,
    setSystemRepaired,
    setLiftY,
    setMineActive,
    reset,
  }
}
