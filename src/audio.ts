type VoiceCallback = (active: boolean, text: string) => void

export class StationAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private sirenGain: GainNode | null = null
  private sirenSource: AudioBufferSourceNode | null = null
  private ambienceGain: GainNode | null = null
  private mineGain: GainNode | null = null
  private mineActive = false
  private weaponShotBuffer: AudioBuffer | null = null
  private voiceCallback: VoiceCallback
  private speechTimer = 0
  private muted = false

  constructor(voiceCallback: VoiceCallback) {
    this.voiceCallback = voiceCallback
  }

  start(): void {
    if (this.context) {
      void this.context.resume()
      return
    }
    const AudioContextConstructor = window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextConstructor) return
    const context = new AudioContextConstructor()
    const master = context.createGain()
    master.gain.value = 0.56
    master.connect(context.destination)
    this.context = context
    this.master = master

    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -17
    compressor.knee.value = 15
    compressor.ratio.value = 7
    compressor.attack.value = 0.006
    compressor.release.value = 0.2
    compressor.connect(master)

    const ambienceGain = context.createGain()
    ambienceGain.gain.value = 0.055
    ambienceGain.connect(compressor)
    this.ambienceGain = ambienceGain

    const hum = context.createOscillator()
    hum.type = 'sine'
    hum.frequency.value = 47
    const humSecond = context.createOscillator()
    humSecond.type = 'triangle'
    humSecond.frequency.value = 94
    const humFilter = context.createBiquadFilter()
    humFilter.type = 'lowpass'
    humFilter.frequency.value = 240
    const humGain = context.createGain()
    humGain.gain.value = 0.24
    hum.connect(humFilter)
    humSecond.connect(humFilter)
    humFilter.connect(humGain)
    humGain.connect(ambienceGain)
    hum.start()
    humSecond.start()

    const mineGain = context.createGain()
    mineGain.gain.value = 0
    mineGain.connect(compressor)
    this.mineGain = mineGain

    const pump = context.createOscillator()
    pump.type = 'sawtooth'
    pump.frequency.value = 31
    const pumpUpper = context.createOscillator()
    pumpUpper.type = 'triangle'
    pumpUpper.frequency.value = 63
    const pumpFilter = context.createBiquadFilter()
    pumpFilter.type = 'lowpass'
    pumpFilter.frequency.value = 155
    pumpFilter.Q.value = 1.4
    const pumpGain = context.createGain()
    pumpGain.gain.value = 0.2
    const pumpPulse = context.createOscillator()
    pumpPulse.type = 'sine'
    pumpPulse.frequency.value = 1.12
    const pumpDepth = context.createGain()
    pumpDepth.gain.value = 0.13
    pump.connect(pumpFilter)
    pumpUpper.connect(pumpFilter)
    pumpFilter.connect(pumpGain)
    pumpGain.connect(mineGain)
    pumpPulse.connect(pumpDepth)
    pumpDepth.connect(pumpGain.gain)
    pump.start()
    pumpUpper.start()
    pumpPulse.start()

    const grindBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const grindData = grindBuffer.getChannelData(0)
    let brown = 0
    for (let index = 0; index < grindData.length; index += 1) {
      brown = brown * 0.985 + (Math.random() * 2 - 1) * 0.055
      grindData[index] = brown
    }
    const grind = context.createBufferSource()
    grind.buffer = grindBuffer
    grind.loop = true
    const grindFilter = context.createBiquadFilter()
    grindFilter.type = 'bandpass'
    grindFilter.frequency.value = 310
    grindFilter.Q.value = 0.65
    const grindGain = context.createGain()
    grindGain.gain.value = 0.16
    grind.connect(grindFilter)
    grindFilter.connect(grindGain)
    grindGain.connect(mineGain)
    grind.start()

    const sirenGain = context.createGain()
    sirenGain.gain.value = 0.24
    sirenGain.connect(compressor)
    this.sirenGain = sirenGain
    const sirenFilter = context.createBiquadFilter()
    sirenFilter.type = 'lowpass'
    sirenFilter.frequency.value = 3600
    sirenFilter.Q.value = 0.42
    sirenFilter.connect(sirenGain)
    void this.startRecordedAlarm(context, sirenFilter)
    void this.loadWeaponShot(context)
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.56, this.context.currentTime, 0.08)
    }
    if (muted) window.speechSynthesis?.cancel()
  }

  lowerAlarm(lowered: boolean): void {
    if (!this.context || !this.sirenGain) return
    this.sirenGain.gain.setTargetAtTime(lowered ? 0 : 0.24, this.context.currentTime, 0.5)
  }

  setMineActive(active: boolean): void {
    if (this.mineActive === active) return
    this.mineActive = active
    if (!this.context || !this.mineGain) return
    this.mineGain.gain.setTargetAtTime(active ? 0.25 : 0, this.context.currentTime, active ? 0.65 : 0.9)
  }

  speak(text: string): void {
    if (this.muted) return
    this.voiceCallback(true, text)
    window.clearTimeout(this.speechTimer)
    this.speechTimer = window.setTimeout(() => this.voiceCallback(false, text), Math.max(2500, text.length * 63))
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const voices = window.speechSynthesis.getVoices()
    const preferredNames = [
      /samantha/i,
      /zira/i,
      /ava/i,
      /victoria/i,
      /female/i,
      /google uk english female/i,
      /english.*united kingdom/i,
    ]
    utterance.voice = preferredNames
      .map((pattern) => voices.find((voice) => pattern.test(voice.name)))
      .find((voice) => voice !== undefined) ?? voices.find((voice) => voice.lang.startsWith('en')) ?? null
    utterance.rate = 0.86
    utterance.pitch = 0.9
    utterance.volume = 0.92
    utterance.onend = () => this.voiceCallback(false, text)
    window.speechSynthesis.speak(utterance)
  }

  gunshot(scatter = false): void {
    const context = this.context
    const master = this.master
    if (!context || !master || this.muted) return
    const now = context.currentTime
    const length = scatter ? 0.64 : 0.26
    if (this.weaponShotBuffer) {
      const shot = context.createBufferSource()
      shot.buffer = this.weaponShotBuffer
      shot.playbackRate.value = scatter ? 0.88 : 1.22 + Math.random() * 0.035
      const highpass = context.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = scatter ? 55 : 92
      const lowpass = context.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = scatter ? 5200 : 6500
      const shotGain = context.createGain()
      shotGain.gain.setValueAtTime(scatter ? 0.68 : 0.34, now)
      shotGain.gain.exponentialRampToValueAtTime(0.001, now + length)
      shot.connect(highpass)
      highpass.connect(lowpass)
      lowpass.connect(shotGain)
      shotGain.connect(master)
      shot.start(now)
      shot.stop(now + length + 0.02)
    } else {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.13), context.sampleRate)
      const data = buffer.getChannelData(0)
      for (let index = 0; index < data.length; index += 1) {
        const decay = 1 - index / data.length
        data[index] = (Math.random() * 2 - 1) * decay * decay
      }
      const noise = context.createBufferSource()
      noise.buffer = buffer
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = scatter ? 920 : 1550
      const gain = context.createGain()
      gain.gain.setValueAtTime(scatter ? 0.62 : 0.34, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13)
      noise.connect(filter)
      filter.connect(gain)
      gain.connect(master)
      noise.start(now)
    }

    const body = context.createOscillator()
    body.type = 'triangle'
    body.frequency.setValueAtTime(scatter ? 105 : 155, now)
    body.frequency.exponentialRampToValueAtTime(48, now + 0.09)
    const bodyGain = context.createGain()
    bodyGain.gain.setValueAtTime(scatter ? 0.28 : 0.13, now)
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
    body.connect(bodyGain)
    bodyGain.connect(master)
    body.start(now)
    body.stop(now + 0.11)
  }

  lift(descending: boolean): void {
    const context = this.context
    const master = this.master
    if (!context || !master || this.muted) return
    const now = context.currentTime
    this.metalClick(0.13, 440)
    const motor = context.createOscillator()
    motor.type = 'sawtooth'
    motor.frequency.setValueAtTime(descending ? 58 : 43, now)
    motor.frequency.linearRampToValueAtTime(descending ? 39 : 61, now + 4.45)
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 180
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.095, now + 0.28)
    gain.gain.setValueAtTime(0.095, now + 4.05)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 4.58)
    motor.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    motor.start(now)
    motor.stop(now + 4.62)
  }

  liftArrived(): void {
    this.metalClick(0.18, 230)
    window.setTimeout(() => this.metalClick(0.1, 620), 130)
  }

  reload(): void {
    this.metalClick(0.12, 760)
    window.setTimeout(() => this.metalClick(0.1, 520), 270)
  }

  empty(): void {
    this.metalClick(0.08, 330)
  }

  pickup(): void {
    this.metalClick(0.08, 930)
    window.setTimeout(() => this.metalClick(0.055, 1240), 75)
  }

  repair(): void {
    const context = this.context
    const master = this.master
    if (!context || !master || this.muted) return
    const now = context.currentTime
    for (let index = 0; index < 3; index += 1) {
      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = [260, 390, 585][index]
      const gain = context.createGain()
      gain.gain.setValueAtTime(0.001, now + index * 0.09)
      gain.gain.linearRampToValueAtTime(0.08, now + index * 0.09 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.09 + 0.34)
      oscillator.connect(gain)
      gain.connect(master)
      oscillator.start(now + index * 0.09)
      oscillator.stop(now + index * 0.09 + 0.36)
    }
  }

  ghostWhisper(distance: number): void {
    const context = this.context
    const master = this.master
    if (!context || !master || this.muted) return
    const now = context.currentTime
    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(118 + Math.random() * 36, now)
    oscillator.frequency.exponentialRampToValueAtTime(46, now + 1.2)
    const modulation = context.createOscillator()
    modulation.frequency.value = 7 + Math.random() * 3
    const modulationGain = context.createGain()
    modulationGain.gain.value = 18
    modulation.connect(modulationGain)
    modulationGain.connect(oscillator.frequency)
    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 290
    filter.Q.value = 3.2
    const gain = context.createGain()
    const volume = Math.max(0.015, Math.min(0.105, 0.16 - distance * 0.006))
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(volume, now + 0.25)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.35)
    oscillator.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    oscillator.start(now)
    modulation.start(now)
    oscillator.stop(now + 1.4)
    modulation.stop(now + 1.4)
  }

  bite(): void {
    const context = this.context
    const master = this.master
    if (!context || !master || this.muted) return
    const now = context.currentTime
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.23), context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < data.length; index += 1) {
      const envelope = Math.sin((index / data.length) * Math.PI)
      data[index] = (Math.random() * 2 - 1) * envelope
    }
    const source = context.createBufferSource()
    source.buffer = buffer
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 180
    const gain = context.createGain()
    gain.gain.value = 0.24
    source.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    source.start(now)
  }

  private metalClick(volume: number, frequency: number): void {
    const context = this.context
    const master = this.master
    if (!context || !master || this.muted) return
    const now = context.currentTime
    const oscillator = context.createOscillator()
    oscillator.type = 'square'
    oscillator.frequency.setValueAtTime(frequency, now)
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.42, now + 0.06)
    const gain = context.createGain()
    gain.gain.setValueAtTime(volume, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065)
    oscillator.connect(gain)
    gain.connect(master)
    oscillator.start(now)
    oscillator.stop(now + 0.07)
  }

  private async loadWeaponShot(context: AudioContext): Promise<void> {
    try {
      const response = await fetch('./assets/audio/weapon-shot.ogg')
      if (!response.ok) throw new Error(`Weapon sound download failed with ${response.status}`)
      const buffer = await context.decodeAudioData(await response.arrayBuffer())
      if (this.context === context) this.weaponShotBuffer = buffer
    } catch (error) {
      console.error('The bundled weapon recording could not be decoded.', error)
    }
  }

  private async startRecordedAlarm(context: AudioContext, destination: AudioNode): Promise<void> {
    try {
      const response = await fetch('./assets/audio/station-alarm.ogg')
      if (!response.ok) throw new Error(`Alarm download failed with ${response.status}`)
      const buffer = await context.decodeAudioData(await response.arrayBuffer())
      if (this.context !== context || this.sirenSource) return
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.connect(destination)
      source.start()
      this.sirenSource = source
    } catch (error) {
      console.error('The bundled station alarm could not be decoded.', error)
    }
  }
}
