import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type Ghost = {
  group: THREE.Group
  hitMeshes: THREE.Mesh[]
  material: THREE.ShaderMaterial
  voidMaterials: THREE.MeshBasicMaterial[]
  health: number
  maxHealth: number
  speed: number
  damage: number
  baseY: number
  attackTimer: number
  flashTimer: number
  phase: number
  dead: boolean
  deathTimer: number
}

const ghostVertexShader = `
  uniform float uTime;
  uniform float uPhase;
  varying vec2 vUv;
  varying float vFresnel;
  varying float vRipple;

  void main() {
    vUv = uv;
    vec3 changed = position;
    float ripple = sin(position.y * 5.0 + uTime * 2.2 + uPhase) * 0.035;
    ripple += sin(position.y * 11.0 - uTime * 3.1 + uPhase * 1.7) * 0.015;
    changed.x += normal.x * ripple;
    changed.z += normal.z * ripple;
    vec4 worldPosition = modelMatrix * vec4(changed, 1.0);
    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
    vec3 eyeDirection = normalize(cameraPosition - worldPosition.xyz);
    vFresnel = pow(1.0 - abs(dot(worldNormal, eyeDirection)), 1.7);
    vRipple = ripple;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const ghostFragmentShader = `
  uniform sampler2D uEctoplasm;
  uniform float uTime;
  uniform float uPhase;
  uniform float uFlash;
  uniform float uFade;
  varying vec2 vUv;
  varying float vFresnel;
  varying float vRipple;

  void main() {
    vec2 textureUv = vec2(vUv.x * 1.15 + sin(vUv.y * 9.0 + uTime) * 0.025, vUv.y * 1.42 - uTime * 0.018);
    vec3 ectoplasm = texture2D(uEctoplasm, textureUv).rgb;
    float ectoplasmLight = dot(ectoplasm, vec3(0.2126, 0.7152, 0.0722));
    float crawling = sin(vUv.y * 39.0 - uTime * 5.2 + sin(vUv.x * 17.0 + uPhase) * 2.0);
    float ragged = smoothstep(0.02, 0.31, vUv.y + sin(vUv.x * 28.0 + uPhase) * 0.055);
    float alpha = (0.08 + vFresnel * 0.4 + max(0.0, crawling) * 0.07 + ectoplasmLight * 0.16) * ragged * uFade;
    vec3 cold = mix(vec3(0.12, 0.28, 0.31), vec3(0.58, 0.86, 0.88), vFresnel + uFlash * 0.72);
    cold = mix(cold, ectoplasm * vec3(0.72, 0.95, 1.0), 0.42);
    cold += vec3(0.08, 0.18, 0.2) * abs(vRipple) * 8.0;
    gl_FragColor = vec4(cold, alpha);
  }
`

const ectoplasmTexture = new THREE.TextureLoader().load('./assets/textures/ghost-ectoplasm.webp')
ectoplasmTexture.colorSpace = THREE.SRGBColorSpace
ectoplasmTexture.wrapS = THREE.RepeatWrapping
ectoplasmTexture.wrapT = THREE.RepeatWrapping
ectoplasmTexture.anisotropy = 2

function createGhostMaterial(phase: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uEctoplasm: { value: ectoplasmTexture },
      uTime: { value: 0 },
      uPhase: { value: phase },
      uFlash: { value: 0 },
      uFade: { value: 1 },
    },
    vertexShader: ghostVertexShader,
    fragmentShader: ghostFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
  })
}

export function createGhost(
  scene: THREE.Scene,
  position: THREE.Vector3,
  health: number,
  wave: number,
): Ghost {
  const phase = Math.random() * Math.PI * 2
  const material = createGhostMaterial(phase)
  const group = new THREE.Group()
  group.position.copy(position)
  group.scale.setScalar(0.92 + Math.random() * 0.2)

  const bodyParts: THREE.BufferGeometry[] = []
  const torsoGeometry = new THREE.CylinderGeometry(0.42, 0.83, 2.65, 9, 3, true)
  const torsoPositions = torsoGeometry.getAttribute('position') as THREE.BufferAttribute
  for (let index = 0; index < torsoPositions.count; index += 1) {
    const y = torsoPositions.getY(index)
    if (y < -1) {
      torsoPositions.setY(index, y + Math.sin(index * 4.91 + phase) * 0.35)
    }
  }
  torsoGeometry.computeVertexNormals()
  torsoGeometry.translate(0, -0.2, 0)
  bodyParts.push(torsoGeometry)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 7), material)
  head.scale.set(0.76, 1.08, 0.72)
  head.position.y = 1.48
  group.add(head)

  for (const [x, rotation] of [[-0.62, -0.15], [0.62, 0.15]] as const) {
    const arm = new THREE.CylinderGeometry(0.09, 0.18, 2.25, 6, 1, true)
    arm.rotateZ(rotation)
    arm.translate(x, -0.1, 0)
    bodyParts.push(arm)
  }

  for (let index = 0; index < 4; index += 1) {
    const wisp = new THREE.ConeGeometry(0.22 + index * 0.025, 1.5 + (index % 2) * 0.38, 5, 1, true)
    wisp.rotateZ((index - 1.5) * 0.09)
    wisp.translate(-0.48 + index * 0.32, -1.85 + Math.sin(index) * 0.13, 0)
    bodyParts.push(wisp)
  }

  const bodyGeometry = mergeGeometries(bodyParts, false)
  if (!bodyGeometry) throw new Error('Ghost body geometry could not be merged.')
  for (const geometry of bodyParts) geometry.dispose()
  const body = new THREE.Mesh(bodyGeometry, material)
  group.add(body)

  const voidMaterials: THREE.MeshBasicMaterial[] = []
  const voidMaterial = new THREE.MeshBasicMaterial({
    color: 0x000204,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    fog: false,
  })
  voidMaterials.push(voidMaterial)
  const faceParts: THREE.BufferGeometry[] = []
  for (const x of [-0.17, 0.17]) {
    const eye = new THREE.SphereGeometry(0.105, 6, 4)
    eye.scale(0.66, 1.55, 0.3)
    eye.translate(x, 1.57, 0.36)
    faceParts.push(eye)
  }
  const mouth = new THREE.SphereGeometry(0.16, 7, 5)
  mouth.scale(0.68, 1.58, 0.25)
  mouth.translate(0, 1.24, 0.38)
  faceParts.push(mouth)
  const faceGeometry = mergeGeometries(faceParts, false)
  if (!faceGeometry) throw new Error('Ghost face geometry could not be merged.')
  for (const geometry of faceParts) geometry.dispose()
  group.add(new THREE.Mesh(faceGeometry, voidMaterial))

  scene.add(group)
  const ghost: Ghost = {
    group,
    hitMeshes: [body, head],
    material,
    voidMaterials,
    health,
    maxHealth: health,
    speed: 1.3 + Math.min(1.2, wave * 0.1) + Math.random() * 0.38,
    damage: 10 + Math.min(12, wave * 1.4),
    baseY: position.y,
    attackTimer: 0.8 + Math.random(),
    flashTimer: 0,
    phase,
    dead: false,
    deathTimer: 0,
  }
  for (const mesh of ghost.hitMeshes) mesh.userData.ghost = ghost
  return ghost
}

export function updateGhostVisual(ghost: Ghost, elapsed: number): void {
  ghost.material.uniforms.uTime.value = elapsed
  ghost.material.uniforms.uFlash.value = ghost.flashTimer > 0 ? 1 : 0
  const fade = ghost.dead ? Math.max(0, 1 - ghost.deathTimer / 0.82) : 1
  ghost.material.uniforms.uFade.value = fade
  for (const material of ghost.voidMaterials) material.opacity = 0.9 * fade
  ghost.group.scale.y = (0.92 + Math.sin(elapsed * 2.4 + ghost.phase) * 0.035) * (ghost.dead ? 1 + ghost.deathTimer * 0.6 : 1)
  ghost.group.scale.x = ghost.dead ? Math.max(0.05, 1 - ghost.deathTimer * 0.82) : 1
  ghost.group.scale.z = ghost.group.scale.x
}

export function disposeGhost(scene: THREE.Scene, ghost: Ghost): void {
  scene.remove(ghost.group)
  ghost.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
    else if (object.material !== ghost.material) object.material.dispose()
  })
  ghost.material.dispose()
}
