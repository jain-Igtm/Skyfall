type VoiceCallback = (active: boolean, text: string) => void

export class StationAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private sirenGain: GainNode | null = null
  private sirenSource: AudioBufferSourceNode | null = null
  private ambienceGain: GainNode | null = null
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
    this.sirenGain.gain.setTargetAtTime(lowered ? 0.055 : 0.24, this.context.currentTime, 0.5)
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
    const length = scatter ? 0.19 : 0.11
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * length), context.sampleRate)
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
    gain.gain.exponentialRampToValueAtTime(0.001, now + length)
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    noise.start(now)

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
