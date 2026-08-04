(() => {
  'use strict'

  const bootScreen = document.getElementById('boot-screen')
  const bootButton = document.getElementById('boot-button')
  const consoleView = document.getElementById('console')
  const incidentClock = document.getElementById('incident-clock')
  const archiveStatus = document.getElementById('archive-status')
  const coreCount = document.getElementById('core-count')
  const motionCount = document.getElementById('motion-count')
  const timeline = document.getElementById('timeline')
  const timelineLabel = document.getElementById('timeline-label')
  const playButton = document.getElementById('play-button')
  const eventLog = document.getElementById('event-log')
  const terminal = document.getElementById('terminal')
  const sectorHeading = document.getElementById('sector-heading')
  const sectorState = document.getElementById('sector-state')
  const sectorCopy = document.getElementById('sector-copy')
  const signalCanvas = document.getElementById('signal-canvas')
  const signalStrength = document.getElementById('signal-strength')
  const sealButton = document.getElementById('seal-button')
  const sectorButtons = [...document.querySelectorAll('.sector')]
  const routeButtons = [...document.querySelectorAll('.route')]

  if (
    !bootScreen || !bootButton || !consoleView || !incidentClock || !archiveStatus ||
    !coreCount || !motionCount || !timeline || !timelineLabel || !playButton ||
    !eventLog || !terminal || !sectorHeading || !sectorState || !sectorCopy ||
    !signalCanvas || !signalStrength || !sealButton
  ) {
    throw new Error('Black box interface is incomplete.')
  }

  const sectors = {
    crown: {
      name: 'CROWN RELAY',
      code: 'C-01',
      copy: 'A narrow-beam transmitter once routed traffic to the nearest Imperial receivers. The archive contains 2,418 unanswered handshakes.',
      warningAt: 372,
      criticalAt: 641,
      offlineAt: 781,
    },
    security: {
      name: 'SECURITY STORES',
      code: 'W-04',
      copy: 'Local armory authorization opened after central credentials expired. The controller treated personnel survival as a maintenance exception.',
      warningAt: 248,
      criticalAt: 596,
      offlineAt: null,
    },
    operations: {
      name: 'OPERATIONS',
      code: 'O-00',
      copy: 'The station controller remained operational on a degraded legal model. It could issue orders, but no authority remained to validate them.',
      warningAt: 312,
      criticalAt: 748,
      offlineAt: 862,
    },
    life: {
      name: 'LIFE SUPPORT',
      code: 'E-03',
      copy: 'Pressure loss began behind the eastern scrubber bank. Repair telemetry continued after personnel tracking stopped.',
      warningAt: 108,
      criticalAt: 521,
      offlineAt: 836,
    },
    equipment: {
      name: 'EQUIPMENT BAY 03',
      code: 'S-12',
      copy: 'Clear breathing shields and lightweight mining shells were released under evacuation rule gamma. Inventory records disagree with the number taken.',
      warningAt: 184,
      criticalAt: 704,
      offlineAt: null,
    },
    lift: {
      name: 'SERVICE LIFT',
      code: 'L-09',
      copy: 'The lift made three descents after the evacuation order. Its final ascent command originated twenty-eight metres below the station floor.',
      warningAt: 328,
      criticalAt: 684,
      offlineAt: 804,
    },
    shaft: {
      name: 'SHAFT FOUR',
      code: 'D-28',
      copy: 'Core pump heat climbed while the excavation pit continued drawing power. Motion returns appeared inside sealed rock and moved upward.',
      warningAt: 46,
      criticalAt: 462,
      offlineAt: 812,
    },
  }

  const events = [
    { at: 0, level: 'normal', title: 'EVACUATION ORDER', text: 'Local alarm begins. No external incident number is assigned.' },
    { at: 46, level: 'warning', title: 'THERMAL SPIKE', text: 'Shaft Four coolant loop reports cavitation below the core pump.' },
    { at: 108, level: 'warning', title: 'PRESSURE LOSS', text: 'Eastern scrubber bank loses two seals. Atmosphere decline begins.' },
    { at: 184, level: 'normal', title: 'EQUIPMENT RELEASE', text: 'Breathing shields and mining shells unlock under rule gamma.' },
    { at: 248, level: 'warning', title: 'LOCAL ARMORY OVERRIDE', text: 'Security stores reject central credentials, then accept local statute.' },
    { at: 328, level: 'warning', title: 'DESCENT', text: 'Service lift receives a manual call from Shaft Four.' },
    { at: 406, level: 'critical', title: 'MOTION RETURNS', text: 'Non-material signatures cross three pressure bulkheads without opening them.' },
    { at: 487, level: 'normal', title: 'GUIDANCE LOOP', text: 'Station control repeats calm evacuation instructions. No route remains verified.' },
    { at: 562, level: 'critical', title: 'COOLANT LOST', text: 'Deep thermal exchange falls below pump survival minimum.' },
    { at: 641, level: 'warning', title: 'RELAY FAILURE', text: 'Crown relay exhausts its final recognized authority certificate.' },
    { at: 704, level: 'critical', title: 'EQUIPMENT BAY BREACH', text: 'Inventory cameras fail. Suit telemetry continues moving west.' },
    { at: 748, level: 'critical', title: 'PERSONNEL SIGNAL LOSS', text: 'Operations begins recording occupants as unverified maintenance loads.' },
    { at: 812, level: 'critical', title: 'SHAFT FOUR DARK', text: 'Lift and pump telemetry disappear together. Motion returns remain.' },
    { at: 862, level: 'critical', title: 'LOCAL CONTROL ONLY', text: 'Controller stops seeking authorization and preserves the archive.' },
    { at: 900, level: 'normal', title: 'RECORD ENDS', text: 'No receiver signs custody of incident packet 6A-771.' },
  ]

  const state = {
    initialized: false,
    time: 0,
    playing: false,
    selectedSector: null,
    routes: new Set(),
    sealed: false,
    lastFrame: 0,
    signalPhase: 0,
    lastUiSecond: -1,
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let audioContext = null

  function ensureAudio() {
    if (audioContext) return audioContext
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    audioContext = new AudioContextClass()
    return audioContext
  }

  function beep(frequency = 430, duration = 0.055, volume = 0.025) {
    const context = ensureAudio()
    if (!context) return
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'square'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(volume, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + duration)
  }

  function formatClock(seconds) {
    const start = 3 * 3600 + 17 * 60 + 42
    const total = start + Math.floor(seconds)
    const hours = Math.floor(total / 3600) % 24
    const minutes = Math.floor((total % 3600) / 60)
    const secs = total % 60
    return [hours, minutes, secs].map((value) => String(value).padStart(2, '0')).join(':')
  }

  function formatElapsed(seconds) {
    const minutes = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `T+${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  function motionAt(seconds) {
    if (seconds < 406) return 0
    const ramp = Math.floor((seconds - 406) / 31) + 1
    return Math.min(19, ramp + (seconds > 704 ? 4 : 0))
  }

  function archiveStateAt(seconds) {
    if (state.sealed) return 'PACKET SEALED'
    if (seconds < 406) return 'RECONSTRUCTING'
    if (seconds < 748) return 'ANOMALY PRESENT'
    if (seconds < 862) return 'PERSONNEL UNCERTAIN'
    return 'LOCAL CONTROL ONLY'
  }

  function sectorStatus(sector, seconds) {
    if (sector.offlineAt !== null && seconds >= sector.offlineAt) return 'offline'
    if (seconds >= sector.criticalAt) return 'critical'
    if (seconds >= sector.warningAt) return 'warning'
    return 'nominal'
  }

  function statusLabel(status) {
    return {
      nominal: 'NOMINAL',
      warning: 'DEGRADED',
      critical: 'CRITICAL',
      offline: 'NO RETURN',
    }[status]
  }

  function terminalLine(text, level = 'normal', time = state.time) {
    const line = document.createElement('p')
    if (level !== 'normal') line.classList.add(`is-${level}`)
    const stamp = document.createElement('span')
    stamp.textContent = formatClock(time)
    line.append(stamp, document.createTextNode(text))
    terminal.append(line)
    while (terminal.children.length > 18) terminal.firstElementChild?.remove()
    terminal.scrollTop = terminal.scrollHeight
  }

  function selectSector(id, announce = true) {
    const sector = sectors[id]
    if (!sector) return
    state.selectedSector = id
    const status = sectorStatus(sector, state.time)
    sectorHeading.textContent = `${sector.name} · ${sector.code}`
    sectorState.textContent = statusLabel(status)
    sectorState.classList.toggle('state-pill--warning', status === 'warning')
    sectorState.style.color = status === 'critical' || status === 'offline' ? '#d47c72' : ''
    sectorCopy.textContent = sector.copy
    for (const button of sectorButtons) {
      button.classList.toggle('is-selected', button.dataset.sector === id)
    }
    if (announce) {
      beep(status === 'critical' || status === 'offline' ? 220 : 520, 0.045)
      terminalLine(`${sector.name}: ${statusLabel(status)}. ${sector.copy}`, status === 'nominal' ? 'normal' : status)
    }
  }

  function updateSectorMap() {
    for (const button of sectorButtons) {
      const sector = sectors[button.dataset.sector]
      if (!sector) continue
      const status = sectorStatus(sector, state.time)
      button.classList.toggle('is-warning', status === 'warning')
      button.classList.toggle('is-critical', status === 'critical')
      button.classList.toggle('is-offline', status === 'offline')
      button.setAttribute('aria-label', `${sector.name}: ${statusLabel(status)}`)
    }
    if (state.selectedSector) selectSector(state.selectedSector, false)
  }

  function updateEventLog() {
    const visible = events.filter((event) => event.at <= state.time).slice(-6).reverse()
    eventLog.replaceChildren(...visible.map((event) => {
      const item = document.createElement('li')
      if (event.level !== 'normal') item.classList.add(`is-${event.level}`)
      const strong = document.createElement('strong')
      strong.textContent = `${formatElapsed(event.at)} · ${event.title}`
      item.append(strong, document.createElement('br'), document.createTextNode(event.text))
      return item
    }))
  }

  function updateRouting() {
    const used = state.routes.size
    coreCount.textContent = `${2 - used} / 2`
    for (const button of routeButtons) {
      const selected = state.routes.has(button.dataset.route)
      button.setAttribute('aria-pressed', String(selected))
      button.classList.toggle('is-blocked', !selected && used >= 2)
      button.disabled = state.sealed
    }
    sealButton.disabled = state.sealed || used !== 2
    sealButton.textContent = state.sealed ? 'INCIDENT PACKET SEALED' : 'SEAL INCIDENT PACKET'
  }

  function updateInterface(force = false) {
    const wholeSecond = Math.floor(state.time)
    if (!force && wholeSecond === state.lastUiSecond) return
    state.lastUiSecond = wholeSecond
    incidentClock.textContent = formatClock(state.time)
    timeline.value = String(Math.floor(state.time))
    timelineLabel.textContent = formatElapsed(state.time)
    motionCount.textContent = String(motionAt(state.time))
    archiveStatus.textContent = archiveStateAt(state.time)
    signalStrength.textContent = motionAt(state.time) === 0 ? 'QUIET' : motionAt(state.time) < 8 ? 'PRESENT' : 'SATURATED'
    updateSectorMap()
    updateEventLog()
    updateRouting()
  }

  function routeOutcome() {
    const has = (name) => state.routes.has(name)
    if (has('life') && has('relay')) {
      return {
        level: 'warning',
        title: 'SURVIVAL / TRANSMISSION PRIORITY',
        body: 'Atmosphere decline slows and the Crown relay emits one complete packet. Twelve personnel signals remain for forty-seven minutes. No receiver signs custody.',
      }
    }
    if (has('life') && has('coolant')) {
      return {
        level: 'normal',
        title: 'SURVIVAL / STATION PRIORITY',
        body: 'Life support and the deep coolant loop stabilize. Nineteen personnel signals converge on the service lift. The station survives locally. No call leaves the moon.',
      }
    }
    return {
      level: 'critical',
      title: 'ASSET / TRANSMISSION PRIORITY',
      body: 'The core pump remains within warranty and the Crown relay transmits successfully. Atmosphere reaches lethal threshold before a receiver acknowledges the packet.',
    }
  }

  function sealPacket() {
    if (state.sealed || state.routes.size !== 2) return
    state.sealed = true
    state.playing = false
    playButton.textContent = 'PLAY'
    playButton.setAttribute('aria-pressed', 'false')
    const outcome = routeOutcome()
    beep(outcome.level === 'critical' ? 180 : 720, 0.14, 0.035)
    terminalLine(`ORDER SEALED: ${outcome.title}.`, outcome.level)
    terminalLine(outcome.body, outcome.level)
    terminalLine('Custody remains local. The archive does not identify a lawful successor.', 'warning')
    updateInterface(true)
  }

  function toggleRoute(route) {
    if (state.sealed) return
    if (state.routes.has(route)) {
      state.routes.delete(route)
      beep(310)
    } else if (state.routes.size < 2) {
      state.routes.add(route)
      beep(610)
    } else {
      beep(150, 0.08)
      terminalLine('Emergency core request denied. Only two local cores remain.', 'warning')
    }
    updateRouting()
  }

  function resizeSignalCanvas() {
    const rect = signalCanvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const width = Math.max(1, Math.floor(rect.width * dpr))
    const height = Math.max(1, Math.floor(rect.height * dpr))
    if (signalCanvas.width !== width || signalCanvas.height !== height) {
      signalCanvas.width = width
      signalCanvas.height = height
    }
  }

  function drawSignal(frameTime) {
    resizeSignalCanvas()
    const context = signalCanvas.getContext('2d')
    if (!context) return
    const width = signalCanvas.width
    const height = signalCanvas.height
    const count = motionAt(state.time)
    const intensity = Math.min(1, count / 12)
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#050809'
    context.fillRect(0, 0, width, height)

    context.strokeStyle = 'rgba(105, 139, 131, 0.12)'
    context.lineWidth = 1
    for (let x = 0; x < width; x += width / 12) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, height)
      context.stroke()
    }
    for (let y = 0; y < height; y += height / 4) {
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(width, y)
      context.stroke()
    }

    const phase = reducedMotion ? 0 : frameTime * 0.0018
    context.beginPath()
    for (let x = 0; x <= width; x += 3) {
      const normalized = x / width
      const base = Math.sin(normalized * 15 + phase) * 0.045
      const carrier = Math.sin(normalized * 64 - phase * 2.4) * (0.018 + intensity * 0.09)
      const spikeWindow = Math.max(0, Math.sin(normalized * Math.PI * (5 + count * 0.18) + phase * 1.7))
      const spike = count > 0 ? Math.pow(spikeWindow, 14) * (0.05 + intensity * 0.36) : 0
      const noise = Math.sin(normalized * 211 + state.time * 0.13) * intensity * 0.025
      const y = height * (0.52 + base + carrier - spike + noise)
      if (x === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.strokeStyle = count > 10 ? 'rgba(210, 114, 103, 0.9)' : 'rgba(143, 211, 191, 0.88)'
    context.lineWidth = Math.max(1, width / 620)
    context.shadowColor = count > 10 ? 'rgba(190, 84, 74, 0.65)' : 'rgba(109, 198, 172, 0.55)'
    context.shadowBlur = 8
    context.stroke()
    context.shadowBlur = 0

    if (!reducedMotion) {
      const sweepX = ((frameTime * 0.09) % (width + 80)) - 40
      const gradient = context.createLinearGradient(sweepX - 35, 0, sweepX + 35, 0)
      gradient.addColorStop(0, 'rgba(136, 220, 195, 0)')
      gradient.addColorStop(0.5, 'rgba(136, 220, 195, 0.12)')
      gradient.addColorStop(1, 'rgba(136, 220, 195, 0)')
      context.fillStyle = gradient
      context.fillRect(sweepX - 35, 0, 70, height)
    }
  }

  function animate(frameTime) {
    if (!state.lastFrame) state.lastFrame = frameTime
    const delta = Math.min(0.1, (frameTime - state.lastFrame) / 1000)
    state.lastFrame = frameTime
    if (state.initialized && state.playing && !state.sealed) {
      state.time = Math.min(900, state.time + delta * 8)
      if (state.time >= 900) {
        state.playing = false
        playButton.textContent = 'PLAY'
        playButton.setAttribute('aria-pressed', 'false')
        terminalLine('Playback reached the end of the recoverable archive.', 'warning', 900)
      }
      updateInterface()
    }
    if (state.initialized) drawSignal(frameTime)
    requestAnimationFrame(animate)
  }

  function initialize() {
    if (state.initialized) return
    state.initialized = true
    ensureAudio()?.resume?.()
    beep(520, 0.08)
    window.setTimeout(() => beep(720, 0.1), 90)
    bootScreen.classList.add('is-hidden')
    consoleView.classList.add('is-live')
    consoleView.setAttribute('aria-hidden', 'false')
    terminalLine('Archive integrity check complete. Sixty-three percent of local telemetry is recoverable.')
    terminalLine('Warning: personnel identity table was overwritten by extraction maintenance records.', 'warning')
    selectSector('operations', false)
    updateInterface(true)
  }

  bootButton.addEventListener('click', initialize)

  for (const button of sectorButtons) {
    button.addEventListener('click', () => selectSector(button.dataset.sector))
  }

  for (const button of routeButtons) {
    button.addEventListener('click', () => toggleRoute(button.dataset.route))
  }

  timeline.addEventListener('input', () => {
    state.time = Number(timeline.value)
    state.playing = false
    playButton.textContent = 'PLAY'
    playButton.setAttribute('aria-pressed', 'false')
    beep(470, 0.025, 0.012)
    updateInterface(true)
  })

  playButton.addEventListener('click', () => {
    if (state.sealed) return
    if (state.time >= 900) state.time = 0
    state.playing = !state.playing
    playButton.textContent = state.playing ? 'PAUSE' : 'PLAY'
    playButton.setAttribute('aria-pressed', String(state.playing))
    beep(state.playing ? 620 : 330)
    updateInterface(true)
  })

  sealButton.addEventListener('click', sealPacket)
  window.addEventListener('resize', resizeSignalCanvas)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      state.playing = false
      playButton.textContent = 'PLAY'
      playButton.setAttribute('aria-pressed', 'false')
    }
  })

  requestAnimationFrame(animate)
})()
