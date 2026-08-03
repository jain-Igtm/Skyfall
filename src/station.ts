import * as THREE from 'three'

export type Collider = {
  minX: number
  maxX: number
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
  lamp: THREE.PointLight
  beam: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>
  phase: number
}

type SparkEmitter = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  origin: THREE.Vector3
  velocities: Float32Array
  phase: number
}

export type StationWorld = {
  colliders: Collider[]
  interactions: StationInteraction[]
  ghostSpawns: THREE.Vector3[]
  districtAt: (x: number, z: number) => string
  update: (dt: number, elapsed: number) => void
  markUsed: (interaction: StationInteraction) => void
  setSystemRepaired: (interaction: StationInteraction) => void
  reset: () => void
}

const ceilingHeight = 5.25

function canvasTexture(
  heading: string,
  lines: string[],
  accent = '#b46a47',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 256
  const context = canvas.getContext('2d')!
  context.fillStyle = '#101619'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#243036'
  for (let y = 0; y < canvas.height; y += 16) context.fillRect(0, y, canvas.width, 1)
  context.strokeStyle = accent
  context.lineWidth = 5
  context.strokeRect(9, 9, canvas.width - 18, canvas.height - 18)
  context.fillStyle = accent
  context.font = '700 34px monospace'
  context.fillText(heading, 34, 58)
  context.fillStyle = '#aab6b5'
  context.font = '600 23px monospace'
  lines.slice(0, 5).forEach((line, index) => context.fillText(line, 34, 102 + index * 31))
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  return texture
}

function seeded(index: number): number {
  const value = Math.sin(index * 938.217 + 17.13) * 43758.5453
  return value - Math.floor(value)
}

export function buildStation(scene: THREE.Scene): StationWorld {
  const colliders: Collider[] = []
  const interactions: StationInteraction[] = []
  const alarms: AlarmFixture[] = []
  const sparks: SparkEmitter[] = []
  const flickerMaterials: THREE.MeshBasicMaterial[] = []
  const station = new THREE.Group()
  station.name = 'Orison-9 mining station'
  scene.add(station)

  function loadSurfaceTexture(path: string, repeatX: number, repeatY: number): THREE.Texture {
    const texture = new THREE.TextureLoader().load(path)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeatX, repeatY)
    texture.anisotropy = 4
    return texture
  }

  const wallTexture = loadSurfaceTexture('./assets/textures/station-wall.webp', 2, 2)
  const floorTexture = loadSurfaceTexture('./assets/textures/station-floor.webp', 10, 16)
  const rustTexture = loadSurfaceTexture('./assets/textures/rusted-trim.webp', 2, 2)
  const ceilingTexture = loadSurfaceTexture('./assets/textures/station-ceiling.webp', 9, 15)

  const materials = {
    floor: new THREE.MeshStandardMaterial({ map: floorTexture, color: 0x74787a, roughness: 0.91, metalness: 0.38 }),
    floorInset: new THREE.MeshStandardMaterial({ map: floorTexture, color: 0x34383a, roughness: 0.88, metalness: 0.55 }),
    wall: new THREE.MeshStandardMaterial({ map: wallTexture, color: 0x8a8f91, roughness: 0.79, metalness: 0.48 }),
    wallDark: new THREE.MeshStandardMaterial({ map: wallTexture, color: 0x414648, roughness: 0.84, metalness: 0.62 }),
    trim: new THREE.MeshStandardMaterial({ map: rustTexture, color: 0x8a5c47, roughness: 0.76, metalness: 0.65 }),
    rust: new THREE.MeshStandardMaterial({ map: rustTexture, color: 0x6f4a3d, roughness: 0.92, metalness: 0.42 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x4e5554, roughness: 0.53, metalness: 0.76 }),
    black: new THREE.MeshStandardMaterial({ color: 0x080b0d, roughness: 0.72, metalness: 0.68 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x6f929c,
      transparent: true,
      opacity: 0.16,
      roughness: 0.19,
      metalness: 0.08,
      transmission: 0.3,
      depthWrite: false,
    }),
    emergency: new THREE.MeshBasicMaterial({ color: 0xbd291c, toneMapped: false }),
    cold: new THREE.MeshBasicMaterial({ color: 0x93c4ca, toneMapped: false }),
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
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
    mesh.position.set(x, y, z)
    parent.add(mesh)
    if (solid) {
      colliders.push({
        minX: x - width / 2,
        maxX: x + width / 2,
        minZ: z - depth / 2,
        maxZ: z + depth / 2,
      })
    }
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
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material)
    mesh.position.set(x, y, z)
    mesh.rotation.z = rotationZ
    parent.add(mesh)
    return mesh
  }

  function addWallSegment(x: number, z: number, width: number, depth: number): void {
    addBox(width, ceilingHeight, depth, x, ceilingHeight / 2, z, materials.wall, true)
    if (width > depth) {
      addBox(width, 0.1, depth + 0.07, x, 0.18, z, materials.trim)
      addBox(width, 0.08, depth + 0.07, x, 4.65, z, materials.rust)
    } else {
      addBox(width + 0.07, 0.1, depth, x, 0.18, z, materials.trim)
      addBox(width + 0.07, 0.08, depth, x, 4.65, z, materials.rust)
    }
  }

  addBox(64, 0.28, 108, 0, -0.14, 2, materials.floor)
  addBox(
    63.5,
    0.12,
    107.5,
    0,
    5.26,
    2,
    new THREE.MeshStandardMaterial({ map: ceilingTexture, color: 0x8b8d88, roughness: 0.96, metalness: 0.08 }),
  )
  for (let z = -48; z <= 52; z += 8) {
    addBox(9.5, 0.025, 0.06, 0, 0.025, z, materials.floorInset)
  }
  for (let x = -28; x <= 28; x += 8) {
    addBox(0.035, 0.03, 107, x, 0.035, 2, materials.floorInset)
  }

  addWallSegment(-32, 2, 0.55, 108)
  addWallSegment(32, 2, 0.55, 108)
  addWallSegment(0, -52, 64, 0.55)

  const glass = addBox(63.4, 4.7, 0.16, 0, 2.55, 56, materials.glass, false)
  glass.renderOrder = 2
  colliders.push({ minX: -32, maxX: 32, minZ: 55.78, maxZ: 56.22 })
  for (const x of [-32, -24, -16, -8, 0, 8, 16, 24, 32]) {
    addBox(0.36, 5.1, 0.46, x, 2.6, 56, materials.wallDark)
  }
  addBox(64, 0.35, 0.5, 0, 0.2, 56, materials.trim)
  addBox(64, 0.35, 0.5, 0, 5.02, 56, materials.wallDark)

  const doorCenters = [-34, -4, 21, 43]
  const wallSegments: Array<[number, number]> = [
    [-47.5, -38],
    [-30, -8],
    [0, 17],
    [25, 39],
    [47, 53.5],
  ]
  for (const x of [-5, 5]) {
    for (const [start, end] of wallSegments) {
      addWallSegment(x, (start + end) / 2, 0.45, end - start)
    }
    for (const z of doorCenters) {
      addBox(0.66, 0.35, 8.2, x, 4.92, z, materials.wallDark)
      addBox(0.72, 4.7, 0.28, x, 2.4, z - 4.05, materials.trim)
      addBox(0.72, 4.7, 0.28, x, 2.4, z + 4.05, materials.trim)
    }
  }

  for (const z of [-16, 10, 34]) {
    addWallSegment(-18.5, z, 27, 0.45)
    addWallSegment(18.5, z, 27, 0.45)
  }

  const roomCenters = [
    [-18, -34], [18, -34], [-18, -4], [18, -4],
    [-18, 21], [18, 21], [-18, 43], [18, 43], [0, 50],
  ] as const
  for (let index = 0; index < roomCenters.length; index += 1) {
    const [x, z] = roomCenters[index]
    const cold = index === 8 || index === 3
    const lightMaterial = (cold ? materials.cold : materials.emergency).clone()
    flickerMaterials.push(lightMaterial)
    addBox(index === 8 ? 8 : 6.5, 0.08, 0.28, x, 5.05, z, lightMaterial)
    if (index % 2 === 0 || index === 3) {
      const light = new THREE.PointLight(cold ? 0x8fcbd2 : 0xff3d25, cold ? 2.2 : 2.7, 19, 2)
      light.position.set(x, 4.72, z)
      station.add(light)
    }
  }

  function addAlarm(x: number, z: number, phase: number): void {
    const pivot = new THREE.Group()
    pivot.position.set(x, 4.55, z)
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.42, 10), materials.black)
    housing.rotation.z = Math.PI / 2
    pivot.add(housing)
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.18, 9, 6), materials.emergency)
    lens.position.x = 0.27
    pivot.add(lens)
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xff2d1b,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.55, 7.5, 12, 1, true), beamMaterial)
    beam.rotation.z = -Math.PI / 2
    beam.position.x = 3.7
    pivot.add(beam)
    const lamp = new THREE.PointLight(0xff2e1e, 3.8, 14, 2)
    lamp.position.x = 0.35
    pivot.add(lamp)
    station.add(pivot)
    alarms.push({ pivot, lamp, beam, phase })
  }

  addAlarm(-4.5, 31, 0)
  addAlarm(4.5, 8, 1.9)
  addAlarm(-4.5, -19, 3.7)
  addAlarm(4.5, -44, 5.2)

  function addDoorDamage(x: number, z: number, side: -1 | 1): void {
    const panel = addBox(0.28, 4.25, 3.05, x + side * 0.2, 2.25, z + 2.25, materials.wallDark)
    panel.rotation.x = side * 0.035
    addBox(0.36, 1.25, 1.3, x - side * 0.08, 1.05, z - 2.95, materials.rust)
  }
  addDoorDamage(-5, 21, -1)
  addDoorDamage(5, -34, 1)

  function addSparkEmitter(x: number, y: number, z: number, phase: number): void {
    const count = 20
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = x
      positions[index * 3 + 1] = y
      positions[index * 3 + 2] = z
      velocities[index * 3] = (seeded(index + phase * 10) - 0.5) * 2.2
      velocities[index * 3 + 1] = -0.8 - seeded(index + 71 + phase * 7) * 2.4
      velocities[index * 3 + 2] = (seeded(index + 142 + phase * 5) - 0.5) * 2.2
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: 0xff9b48,
      size: 0.09,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geometry, material)
    station.add(points)
    sparks.push({ points, origin: new THREE.Vector3(x, y, z), velocities, phase })
  }

  addSparkEmitter(-4.7, 4.05, 21.8, 0.4)
  addSparkEmitter(17.5, 2.25, -15.65, 2.1)
  addSparkEmitter(-31.5, 3.6, -1.5, 4.6)
  addSparkEmitter(5.2, 3.3, -34.8, 6.2)

  function addCrate(x: number, z: number, rotation = 0, scale = 1): void {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.rotation.y = rotation
    addBox(2.1 * scale, 1.45 * scale, 1.55 * scale, 0, 0.74 * scale, 0, materials.rust, false, group)
    addBox(2.18 * scale, 0.1, 1.62 * scale, 0, 0.32 * scale, 0, materials.trim, false, group)
    addBox(0.12, 1.5 * scale, 1.62 * scale, -0.72 * scale, 0.76 * scale, 0, materials.trim, false, group)
    station.add(group)
    const world = new THREE.Vector3(x, 0, z)
    colliders.push({
      minX: world.x - 1.2 * scale,
      maxX: world.x + 1.2 * scale,
      minZ: world.z - 1.05 * scale,
      maxZ: world.z + 1.05 * scale,
    })
  }

  addCrate(-27, 16, 0.2)
  addCrate(-24.5, 18.4, -0.14, 0.86)
  addCrate(26, 25.5, 0.05)
  addCrate(24, -46, 0.4, 1.1)
  addCrate(-27, -43, -0.25)
  addCrate(-13, 47, 0.15, 0.8)

  for (const x of [-30.6, 30.6]) {
    const pipe = addCylinder(0.18, 102, x, 4.15, 2, materials.pipe, 0)
    pipe.rotation.x = Math.PI / 2
    for (const z of [-43, -19, 6, 31, 49]) {
      addCylinder(0.31, 0.18, x, 4.15, z, materials.trim, Math.PI / 2)
    }
  }

  function addBunk(x: number, z: number): void {
    addBox(4.8, 0.32, 2.2, x, 0.58, z, materials.wallDark, true)
    addBox(4.55, 0.32, 1.92, x, 0.82, z, new THREE.MeshStandardMaterial({ color: 0x4c5555, roughness: 1 }))
    addBox(0.7, 0.18, 1.76, x - 1.7, 1.07, z, new THREE.MeshStandardMaterial({ color: 0x727a72, roughness: 1 }))
  }
  addBunk(-22, 39)
  addBunk(-22, 46)
  addBunk(-13, 39)

  function addConsole(
    x: number,
    z: number,
    rotation: number,
    color: number,
    width = 3.2,
  ): { group: THREE.Group; screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> } {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.rotation.y = rotation
    addBox(width, 1.35, 0.9, 0, 0.69, 0, materials.wallDark, false, group)
    addBox(width * 0.92, 0.2, 0.94, 0, 1.35, -0.12, materials.pipe, false, group)
    const screenMaterial = new THREE.MeshBasicMaterial({ color, toneMapped: false })
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.62, 0.45), screenMaterial)
    screen.position.set(0, 1.42, -0.49)
    screen.rotation.x = -0.14
    group.add(screen)
    station.add(group)
    colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - 0.7, maxZ: z + 0.7 })
    return { group, screen }
  }

  const relayConsole = addConsole(-24, -9, 0, 0x8c2b20, 4)
  const lifeConsole = addConsole(24, -9, 0, 0x8c2b20, 4)
  const coolantConsole = addConsole(24, -43, 0, 0x8c2b20, 4.4)
  addConsole(22, 48, Math.PI, 0x344d50, 5)
  addConsole(-18, 48, Math.PI, 0x4e241c, 3.4)

  for (const x of [13, 18, 23, 28]) {
    addCylinder(0.48, 10, x, 2.1, -4, materials.pipe, 0)
    addCylinder(0.55, 0.24, x, 1.05, -4, materials.trim, 0)
  }
  const reactorCore = new THREE.Group()
  reactorCore.position.set(18, 0, -33)
  addCylinder(2.25, 4.2, 0, 2.15, 0, materials.black, 0, reactorCore)
  addCylinder(1.72, 3.7, 0, 2.15, 0, new THREE.MeshBasicMaterial({ color: 0x7f251a, toneMapped: false }), 0, reactorCore)
  station.add(reactorCore)
  colliders.push({ minX: 15.4, maxX: 20.6, minZ: -35.6, maxZ: -30.4 })

  function addSign(
    x: number,
    y: number,
    z: number,
    rotationY: number,
    heading: string,
    lines: string[],
    width = 5.6,
  ): void {
    const texture = canvasTexture(heading, lines)
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 3), material)
    sign.position.set(x, y, z)
    sign.rotation.y = rotationY
    station.add(sign)
  }

  addSign(-4.76, 3.25, 31, Math.PI / 2, 'EQUIPMENT BAY 03', ['RESPIRATORS · PRESSURE SUITS', 'IMPERIAL PROPERTY / LOCAL CHARTER 8'])
  addSign(4.76, 3.25, 21, -Math.PI / 2, 'SECURITY STORES', ['EMERGENCY STATUTE 12-B', 'CENTRAL AUTHORIZATION: EXPIRED'])
  addSign(-4.76, 3.25, -4, Math.PI / 2, 'CROWN RELAY', ['ACKNOWLEDGEMENT: 41 DAYS LATE', 'LOCAL ROUTING IN EFFECT'])
  addSign(4.76, 3.25, -4, -Math.PI / 2, 'LIFE SUPPORT', ['LEVY PRIORITY SYSTEM', 'MAINTENANCE DEFERRAL: 19 YEARS'])
  addSign(4.76, 3.25, -34, -Math.PI / 2, 'THERMAL EXCHANGE', ['ORISON MINERAL AUTHORITY', 'PRINCIPALITY SEAL REQUIRED'])
  addSign(0, 3.3, 55.86, Math.PI, 'THE THRONE REMAINS PRESENT', ['IMPERIAL EXTRACTION MINISTRY', 'CHARTER YEAR 441 · ORISON-9'], 8.4)

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

  function pickupBase(accent = 0x79b5be): THREE.Group {
    const group = new THREE.Group()
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.035, 6, 24),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.72, toneMapped: false }),
    )
    ring.rotation.x = Math.PI / 2
    group.add(ring)
    const glow = new THREE.PointLight(accent, 1.1, 4, 2)
    group.add(glow)
    return group
  }

  const mask = pickupBase(0x9ed7df)
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    new THREE.MeshPhysicalMaterial({
      color: 0xb9e6eb,
      transparent: true,
      opacity: 0.2,
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
  addPickup('mask', 'mask', 'TAKE CLEAR BREATHING SHIELD', -17, 1.2, 24, mask)

  const suit = pickupBase(0xb57b59)
  addBox(0.95, 1.6, 0.46, 0, 0, 0, materials.wallDark, false, suit)
  addBox(1.35, 0.42, 0.48, 0, 0.42, 0, materials.rust, false, suit)
  addCylinder(0.18, 1.25, -0.68, 0.2, 0, materials.wallDark, 0, suit)
  addCylinder(0.18, 1.25, 0.68, 0.2, 0, materials.wallDark, 0, suit)
  addPickup('suit', 'suit', 'SUIT UP · LIGHT MINING SHELL', -25, 1.35, 24, suit)

  function weaponVisual(long = false): THREE.Group {
    const group = pickupBase(long ? 0xbe8660 : 0xa7694d)
    addBox(0.28, 0.28, long ? 2.7 : 2.1, 0, 0.15, 0, materials.black, false, group)
    addBox(0.48, 0.52, 0.82, 0, 0.1, 0.22, materials.rust, false, group)
    addBox(0.2, 0.7, 0.34, 0, -0.33, 0.3, materials.wallDark, false, group)
    group.rotation.y = Math.PI / 2
    return group
  }
  addPickup('carbine', 'carbine', 'TAKE RUSTLINE CARBINE', 19, 1.15, 23, weaponVisual())
  addPickup('scattergun', 'scattergun', 'TAKE BREACH SCATTERGUN', -23, 1.15, -27, weaponVisual(true))

  const tool = pickupBase(0xd8ab5f)
  addBox(0.26, 0.28, 1.45, 0, 0.06, 0, materials.pipe, false, tool)
  addBox(0.62, 0.18, 0.35, 0, 0.06, -0.62, materials.trim, false, tool)
  addPickup('multi-tool', 'multi-tool', 'TAKE IMPERIAL MULTI-TOOL', -20, 1.05, -38, tool)

  const fuse = pickupBase(0xc17d55)
  addCylinder(0.22, 1.1, 0, 0, 0, materials.trim, Math.PI / 2, fuse)
  addCylinder(0.29, 0.18, -0.52, 0, 0, materials.pipe, Math.PI / 2, fuse)
  addCylinder(0.29, 0.18, 0.52, 0, 0, materials.pipe, Math.PI / 2, fuse)
  addPickup('relay-fuse', 'relay-fuse', 'TAKE RELAY FUSE', 26, 1.05, 17, fuse)

  const coupler = pickupBase(0x7ebfc7)
  const couplerMesh = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.17, 8, 16), materials.pipe)
  coupler.add(couplerMesh)
  addPickup('coolant-coupler', 'coolant-coupler', 'TAKE COOLANT COUPLER', -27, 1.05, -20, coupler)

  function addSystem(
    id: string,
    kind: InteractionKind,
    label: string,
    consoleData: ReturnType<typeof addConsole>,
  ): void {
    const interaction: StationInteraction = {
      id,
      kind,
      label,
      position: consoleData.group.position.clone().setY(1.2),
      group: consoleData.group,
      used: false,
      screen: consoleData.screen,
    }
    interactions.push(interaction)
  }
  addSystem('relay', 'relay', 'REPAIR CROWN RELAY', relayConsole)
  addSystem('life-support', 'life-support', 'RESTORE LIFE SUPPORT', lifeConsole)
  addSystem('coolant', 'coolant', 'REPAIR THERMAL EXCHANGE', coolantConsole)

  function addLore(
    id: string,
    x: number,
    z: number,
    title: string,
    body: string,
  ): void {
    const group = new THREE.Group()
    group.position.set(x, 1.3, z)
    const casing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 0.18), materials.black)
    group.add(casing)
    const material = new THREE.MeshBasicMaterial({ color: 0x41656a, toneMapped: false })
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.3), material)
    screen.position.z = 0.1
    group.add(screen)
    station.add(group)
    interactions.push({
      id,
      kind: 'lore',
      label: 'READ STATION NOTICE',
      position: group.position.clone(),
      group,
      used: false,
      title,
      body,
    })
  }

  addLore(
    'charter',
    -11,
    51,
    'CHARTER OF EXTRACTION · AMENDMENT 882',
    'Orison-9 remains property of the Central Empire in perpetuity.\n\nLocal levy, safety and burial ordinances are administered by the Principality of Vesta until direct Imperial authority resumes.\n\nExpected resumption date: pending.',
  )
  addLore(
    'payroll',
    -28,
    29,
    'PAYROLL DENOMINATION NOTICE',
    'Central crowns will no longer be accepted at station commissaries. Vesta scrip, Khepri freight notes and refinery ration chits remain valid.\n\nImperial payroll arrears now stand at eleven rotations.',
  )
  addLore(
    'relay-notice',
    -11,
    -9,
    'CROWN RELAY SERVICE BULLETIN',
    'The Imperial relay acknowledges all lawful petitions in the order received. Current round-trip latency is forty-one standard days.\n\nDo not retransmit. Duplicate petitions incur a filing levy.',
  )
  addLore(
    'memorial',
    28,
    -17,
    'SHIFT MEMORIAL · UNAUTHORIZED',
    'For the thirty-two miners lost below Shaft Four.\n\nThe governor called them contractors. The prince called them Imperial subjects. The Empire did not answer.',
  )

  const ghostSpawns = [
    new THREE.Vector3(-24, 1.8, 43),
    new THREE.Vector3(24, 1.8, 43),
    new THREE.Vector3(-24, 1.8, 20),
    new THREE.Vector3(24, 1.8, 20),
    new THREE.Vector3(-24, 1.8, -4),
    new THREE.Vector3(24, 1.8, -4),
    new THREE.Vector3(-24, 1.8, -35),
    new THREE.Vector3(24, 1.8, -35),
    new THREE.Vector3(0, 1.8, -47),
    new THREE.Vector3(0, 1.8, 51),
  ]

  const exterior = new THREE.Group()
  const starCount = 520
  const starPositions = new Float32Array(starCount * 3)
  for (let index = 0; index < starCount; index += 1) {
    const radius = 180 + seeded(index + 30) * 260
    const theta = seeded(index + 300) * Math.PI * 2
    const phi = Math.acos(2 * seeded(index + 900) - 1)
    starPositions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius
    starPositions[index * 3 + 1] = Math.cos(phi) * radius
    starPositions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius
  }
  const starGeometry = new THREE.BufferGeometry()
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  const starMaterial = new THREE.PointsMaterial({ color: 0xd8e2e1, size: 0.62, sizeAttenuation: true, fog: false })
  exterior.add(new THREE.Points(starGeometry, starMaterial))
  const planetMaterial = new THREE.MeshStandardMaterial({ color: 0x252a2e, roughness: 1, metalness: 0.06, fog: false })
  const planet = new THREE.Mesh(new THREE.SphereGeometry(38, 36, 20), planetMaterial)
  planet.position.set(32, 21, 172)
  planet.scale.y = 0.97
  exterior.add(planet)
  const deadLight = new THREE.DirectionalLight(0xb7c2c8, 2.1)
  deadLight.position.set(-80, 45, 95)
  deadLight.target.position.copy(planet.position)
  exterior.add(deadLight, deadLight.target)
  const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 220, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x26292a, roughness: 1, fog: false }),
  )
  moon.rotation.x = -Math.PI / 2
  moon.position.set(0, -4.2, 115)
  exterior.add(moon)
  scene.add(exterior)

  function districtAt(x: number, z: number): string {
    if (z > 47) return 'OBSERVATION GALLERY'
    if (Math.abs(x) < 6) return 'CENTRAL TRANSIT SPINE'
    if (z > 34) return x < 0 ? 'HABITATION RING' : 'RECORDS ANNEX'
    if (z > 10) return x < 0 ? 'EQUIPMENT BAY 03' : 'SECURITY STORES'
    if (z > -16) return x < 0 ? 'CROWN RELAY' : 'LIFE SUPPORT'
    return x < 0 ? 'MACHINE SHOP' : 'THERMAL EXCHANGE'
  }

  function markUsed(interaction: StationInteraction): void {
    interaction.used = true
    if (!['life-support', 'coolant', 'relay', 'lore'].includes(interaction.kind)) {
      interaction.group.visible = false
    }
  }

  function setSystemRepaired(interaction: StationInteraction): void {
    interaction.used = true
    if (interaction.screen) {
      interaction.screen.material.color.setHex(0x5ea9a5)
    }
  }

  function reset(): void {
    for (const interaction of interactions) {
      interaction.used = false
      interaction.group.visible = true
      if (interaction.screen) interaction.screen.material.color.setHex(0x8c2b20)
    }
  }

  function update(dt: number, elapsed: number): void {
    for (const alarm of alarms) {
      alarm.pivot.rotation.y = elapsed * 2.35 + alarm.phase
      const pulse = 0.55 + Math.max(0, Math.sin(elapsed * 5.5 + alarm.phase)) * 0.75
      alarm.lamp.intensity = 3.4 * pulse
      alarm.beam.material.opacity = 0.035 + pulse * 0.045
    }
    for (let index = 0; index < flickerMaterials.length; index += 1) {
      const material = flickerMaterials[index]
      const drop = seeded(Math.floor(elapsed * 11) + index * 17) > 0.89 ? 0.18 : 1
      material.color.multiplyScalar(drop)
      if (material.color.r < 0.2) {
        material.color.setHex(index === 8 || index === 3 ? 0x93c4ca : 0xbd291c)
      }
    }
    for (const emitter of sparks) {
      const attribute = emitter.points.geometry.getAttribute('position') as THREE.BufferAttribute
      const active = Math.sin(elapsed * 2.7 + emitter.phase) > 0.56 || Math.sin(elapsed * 8.9 + emitter.phase) > 0.88
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
      if (interaction.used || ['life-support', 'coolant', 'relay', 'lore'].includes(interaction.kind)) continue
      interaction.group.rotation.y += dt * 0.62
      interaction.group.position.y = interaction.position.y + Math.sin(elapsed * 1.7 + index) * 0.08
    }
    planet.rotation.y += dt * 0.003
  }

  return {
    colliders,
    interactions,
    ghostSpawns,
    districtAt,
    update,
    markUsed,
    setSystemRepaired,
    reset,
  }
}
