type WisprCallbacks = {
  onStatus?: (message: string) => void
  onPartial?: (text: string) => void
  onFinal?: (text: string) => void
  onError?: (error: Error) => void
}

type WisprTokenResponse = {
  accessToken: string
  clientId: string
  expiresIn?: number
}

type StartOptions = {
  languages?: string[]
  context?: Record<string, unknown>
  /**
   * Diccionario de correcciones para mejorar el reconocimiento de voz.
   * Las claves son las palabras que Wispr Flow está entendiendo mal,
   * y los valores son las palabras correctas que debería transcribir.
   * 
   * Ejemplo:
   * ```typescript
   * corrections: {
   *   "gato": "gato",
   *   "pero": "perro",
   *   "casa": "casa"
   * }
   * ```
   */
  corrections?: Record<string, string>
}

type WisprMessage = {
  status?: string
  final?: boolean
  body?: {
    text?: string
    detected_language?: string
  }
  message?: {
    event?: string
    text?: string
  }
  error?: {
    code?: string
    message?: string
  }
}

const WISPR_WS_BASE = "wss://platform-api.wisprflow.ai/api/v1/dash"
const DEFAULT_LANGUAGES = ["es", "en"]

function floatToPcm16(samples: number[]): Uint8Array {
  const buffer = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buffer)

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }

  return new Uint8Array(buffer)
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

function rms(samples: number[]): number {
  if (!samples.length) return 0
  const sum = samples.reduce((acc, value) => acc + value * value, 0)
  return Math.sqrt(sum / samples.length)
}

export class WisprFlowClient {
  private readonly callbacks: WisprCallbacks

  private websocket: WebSocket | null = null

  private mediaStream: MediaStream | null = null

  private audioContext: AudioContext | null = null

  private processor: ScriptProcessorNode | null = null

  private gainNode: GainNode | null = null

  private packetPosition = 0

  private pendingSamples: number[] = []

  private readonly sampleRate = 16_000

  private readonly chunkDuration = 0.2 // seconds

  private readonly chunkSize = Math.floor(this.sampleRate * this.chunkDuration)

  private token: string | null = null

  private finalPromise: Promise<string> | null = null

  private resolveFinal: ((text: string) => void) | null = null

  private rejectFinal: ((error: Error) => void) | null = null

  private finalTimeout: number | null = null

  private isCommitSent = false

  private isStreaming = false

  private languages: string[] = DEFAULT_LANGUAGES

  constructor(callbacks: WisprCallbacks = {}) {
    this.callbacks = callbacks
  }

  async start(options: StartOptions = {}): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error("Wispr Flow can only run in the browser.")
    }

    if (this.websocket) {
      throw new Error("There is already an active Wispr Flow session.")
    }

    this.languages = options.languages?.length ? options.languages : DEFAULT_LANGUAGES
    this.packetPosition = 0
    this.pendingSamples = []
    this.isCommitSent = false
    this.isStreaming = false

    this.callbacks.onStatus?.("Session authenticated. Requesting microphone access...")
    const { accessToken } = await this.fetchToken()
    this.token = accessToken

    const wsUrl = `${WISPR_WS_BASE}/client_ws?client_key=Bearer%20${encodeURIComponent(accessToken)}`
    const websocket = new WebSocket(wsUrl)

    websocket.addEventListener("open", () => {
      this.callbacks.onStatus?.("Conectando con Wispr Flow...")
      
      // Combinar context y corrections en un solo objeto context
      const contextPayload: Record<string, unknown> = {
        ...(options.context ?? {}),
      }
      
      // Si hay correcciones, agregarlas al context
      // Wispr Flow puede usar diferentes formatos, intentamos con 'corrections' y 'vocabulary'
      if (options.corrections && Object.keys(options.corrections).length > 0) {
        contextPayload.corrections = options.corrections
        // También agregamos como vocabulary para compatibilidad
        contextPayload.vocabulary = Object.values(options.corrections)
      }
      
      websocket.send(
        JSON.stringify({
          type: "auth",
          access_token: accessToken,
          language: this.languages,
          context: contextPayload,
        })
      )
    })

    websocket.addEventListener("message", this.handleMessage)
    websocket.addEventListener("error", this.handleError)
    websocket.addEventListener("close", this.handleClose)

    this.websocket = websocket
  }

  async finalize(): Promise<string | null> {
    if (!this.websocket) {
      return null
    }

    try {
      await this.stopAudioStreaming()
      this.flushPending()

      if (!this.isCommitSent && this.websocket.readyState === WebSocket.OPEN) {
        const commitPayload = {
          type: "commit",
          total_packets: this.packetPosition,
        }
        console.debug("Enviando commit a Wispr", commitPayload)
        this.websocket.send(JSON.stringify(commitPayload))
        this.isCommitSent = true
        this.callbacks.onStatus?.("Waiting for the final transcript from Wispr...")
      }

      const finalText = await this.ensureFinalPromise()
      return finalText
    } finally {
      this.dispose()
    }
  }

  dispose(): void {
    this.stopAudioStreaming().catch(() => {
      /* noop */
    })
    this.closeWebSocket()
    this.clearFinalPromise()
    this.pendingSamples = []
    this.packetPosition = 0
    this.isCommitSent = false
    this.isStreaming = false
  }

  private handleMessage = (event: MessageEvent<string>) => {
    let payload: WisprMessage
    try {
      payload = JSON.parse(event.data)
    } catch {
      console.warn("Mensaje no reconocido de Wispr:", event.data)
      return
    }

    if (payload.status === "auth") {
      console.debug("Wispr auth", payload)
      this.callbacks.onStatus?.("Session authenticated. Requesting microphone access...")
      this.startAudioStreaming().catch((error) => this.notifyError(error))
      return
    }

    if (payload.status === "info") {
      const eventName = payload.message?.event
      console.debug("Wispr info", payload)
      if (eventName === "authenticated" && !this.isStreaming) {
        this.callbacks.onStatus?.("Session authenticated. Requesting microphone access...")
        this.startAudioStreaming().catch((error) => this.notifyError(error))
      } else if (eventName === "commit_received") {
        this.callbacks.onStatus?.("Wispr received all audio. Generating final text...")
      }
      return
    }

    if (payload.status === "text") {
      console.debug("Wispr texto", payload)
      const text = payload.body?.text ?? ""
      if (!text) {
        return
      }

      if (payload.final) {
        this.callbacks.onStatus?.("Final transcript received.")
        this.callbacks.onFinal?.(text)
        this.resolveFinal?.(text)
        this.clearFinalPromise()
        this.closeWebSocket()
      } else {
        this.callbacks.onStatus?.("Transcribing in real time...")
        this.callbacks.onPartial?.(text)
      }
      return
    }

    if (payload.status === "error") {
      console.error("Wispr error", payload)
      const message = payload.message?.text || payload.error?.message || "Wispr Flow returned an unknown error."
      this.notifyError(new Error(message))
    }
  }

  private handleError = (event: Event) => {
    console.error("Wispr WebSocket error", event)
    this.notifyError(new Error("Connection error with Wispr Flow."))
  }

  private handleClose = (event: CloseEvent) => {
    if (!this.isCommitSent) {
      const reason = event.reason?.trim()
      const detail = reason ? `${reason}` : `code ${event.code}`
      this.notifyError(new Error(`Wispr closed the connection before completing the transcription (${detail}).`))
    }
  }

  private async fetchToken(): Promise<WisprTokenResponse> {
    const clientId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `wispr-client-${Date.now()}`

    const response = await fetch("/api/wispr/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clientId }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || "Unable to create the Wispr session. Check the configured API key.")
    }

    const data = (await response.json()) as WisprTokenResponse
    if (!data?.accessToken) {
      throw new Error("The Wispr token response did not include an access token.")
    }

    return data
  }

  private async startAudioStreaming(): Promise<void> {
    if (this.isStreaming) {
      return
    }

    this.callbacks.onStatus?.("Requesting microphone access...")

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: this.sampleRate,
        noiseSuppression: true,
        echoCancellation: true,
      },
    })

    const audioContext = new AudioContext({ sampleRate: this.sampleRate })
    await audioContext.resume()

    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    const gain = audioContext.createGain()
    gain.gain.value = 0

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      if (input) {
        this.enqueueSamples(input)
      }
    }

    source.connect(processor)
    processor.connect(gain)
    gain.connect(audioContext.destination)

    this.mediaStream = stream
    this.audioContext = audioContext
    this.processor = processor
    this.gainNode = gain
    this.isStreaming = true

    this.callbacks.onStatus?.("Streaming audio to Wispr...")
  }

  private async stopAudioStreaming(): Promise<void> {
    if (!this.isStreaming) {
      return
    }

    if (this.processor) {
      this.processor.disconnect()
      this.processor.onaudioprocess = null
      this.processor = null
    }

    if (this.gainNode) {
      this.gainNode.disconnect()
      this.gainNode = null
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close()
      } catch (error) {
        console.debug("Error al cerrar AudioContext", error)
      }
      this.audioContext = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop())
      this.mediaStream = null
    }

    this.isStreaming = false
  }

  private enqueueSamples(channelData: Float32Array) {
    if (this.websocket?.readyState !== WebSocket.OPEN) {
      return
    }

    for (let i = 0; i < channelData.length; i += 1) {
      this.pendingSamples.push(channelData[i])
    }

    while (this.pendingSamples.length >= this.chunkSize) {
      const chunk = this.pendingSamples.splice(0, this.chunkSize)
      this.sendAudioPacket(chunk)
    }
  }

  private flushPending() {
    if (!this.pendingSamples.length) {
      return
    }

    const chunk = this.pendingSamples.splice(0, this.pendingSamples.length)
    this.sendAudioPacket(chunk)
  }

  private sendAudioPacket(samples: number[]) {
    if (!samples.length || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return
    }

    const pcmBytes = floatToPcm16(samples)
    const base64 = uint8ToBase64(pcmBytes)
    const volume = rms(samples)

    const packet = {
      type: "append",
      position: this.packetPosition,
      audio_packets: {
        packets: [base64],
        volumes: [volume],
        packet_duration: this.chunkSize / this.sampleRate,
        audio_encoding: "wav",
        byte_encoding: "base64",
      },
    }

    this.packetPosition += 1

    try {
      console.debug("Enviando paquete de audio a Wispr", {
        position: this.packetPosition,
        duration: samples.length / this.sampleRate,
      })
      this.websocket.send(JSON.stringify(packet))
    } catch (error) {
      console.error("No se pudo enviar audio a Wispr", error)
    }
  }

  private ensureFinalPromise(): Promise<string> {
    if (!this.finalPromise) {
      this.finalPromise = new Promise<string>((resolve, reject) => {
        this.resolveFinal = resolve
        this.rejectFinal = reject
      })

      if (typeof window !== "undefined") {
        this.finalTimeout = window.setTimeout(() => {
          this.rejectFinal?.(new Error("Wispr transcription took too long."))
          this.clearFinalPromise()
        }, 20_000)
      }
    }

    return this.finalPromise
  }

  private clearFinalPromise() {
    if (this.finalTimeout !== null && typeof window !== "undefined") {
      window.clearTimeout(this.finalTimeout)
    }

    this.finalPromise = null
    this.resolveFinal = null
    this.rejectFinal = null
    this.finalTimeout = null
  }

  private closeWebSocket() {
    if (this.websocket) {
      this.websocket.removeEventListener("message", this.handleMessage)
      this.websocket.removeEventListener("error", this.handleError)
      this.websocket.removeEventListener("close", this.handleClose)

      if (this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.close(1000, "client_complete")
      }
    }

    this.websocket = null
  }

  private notifyError(error: Error) {
    this.callbacks.onError?.(error)
    this.rejectFinal?.(error)
    this.clearFinalPromise()
    this.dispose()
  }
}
