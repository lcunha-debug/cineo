import type { AutoCutOptions, DetectedSegment } from '../types'

export async function analyzeAudioForAutoCut(
  filePathOrBuffer: string | ArrayBuffer,
  options: AutoCutOptions,
  onProgress: (pct: number) => void
): Promise<DetectedSegment[]> {
  onProgress(5)

  let arrayBuffer: ArrayBuffer
  if (typeof filePathOrBuffer === 'string') {
    const response = await fetch(`file:///${filePathOrBuffer.replace(/\\/g, '/')}`)
    arrayBuffer = await response.arrayBuffer()
  } else {
    arrayBuffer = filePathOrBuffer
  }
  onProgress(20)

  // Decode audio
  const audioCtx = new OfflineAudioContext(1, 1, 44100)
  let audioBuffer: AudioBuffer
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  } catch {
    throw new Error('Não foi possível decodificar o áudio. Certifique-se de que o arquivo tem trilha de áudio.')
  }
  onProgress(40)

  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const frameDuration = 0.02 // 20ms analysis frames
  const frameSize = Math.floor(sampleRate * frameDuration)
  const totalFrames = Math.floor(channelData.length / frameSize)

  onProgress(50)

  // Calculate RMS per frame
  const rmsValues: number[] = []
  for (let i = 0; i < totalFrames; i++) {
    const start = i * frameSize
    let sum = 0
    for (let j = start; j < start + frameSize && j < channelData.length; j++) {
      sum += channelData[j] * channelData[j]
    }
    rmsValues.push(Math.sqrt(sum / frameSize))
  }

  onProgress(65)

  // Normalize RMS for dynamic threshold
  const maxRms = Math.max(...rmsValues, 0.001)
  const normalizedRms = rmsValues.map((v) => v / maxRms)

  // Detect silence segments
  const silenceFrames: boolean[] = normalizedRms.map((v) => v < options.silenceThreshold)

  // Detect clap signals: look for sudden spike above clapThreshold
  const clapSignals: number[] = []
  if (options.detectClapSignals) {
    for (let i = 2; i < normalizedRms.length - 2; i++) {
      const prev = (normalizedRms[i - 1] + normalizedRms[i - 2]) / 2
      const curr = normalizedRms[i]
      const next = (normalizedRms[i + 1] + normalizedRms[i + 2]) / 2
      // Sharp attack pattern: low → very high → drops back
      if (curr > options.clapThreshold && curr > prev * 3 && curr > next * 1.5) {
        clapSignals.push(i * frameDuration)
      }
    }
  }

  onProgress(80)

  // Build silence segments from boolean array
  const rawSilences: DetectedSegment[] = []
  let silenceStart = -1

  for (let i = 0; i <= silenceFrames.length; i++) {
    const isSilent = silenceFrames[i] ?? false
    if (isSilent && silenceStart < 0) {
      silenceStart = i * frameDuration
    } else if (!isSilent && silenceStart >= 0) {
      const end = i * frameDuration
      const duration = end - silenceStart
      if (duration >= options.minSilenceDuration) {
        rawSilences.push({
          start: silenceStart,
          end,
          type: 'silence',
          confidence: Math.min(1, duration / (options.minSilenceDuration * 3))
        })
      }
      silenceStart = -1
    }
  }

  // Add clap segments
  const clapSegments: DetectedSegment[] = clapSignals.map((t) => ({
    start: t,
    end: t + frameDuration * 3,
    type: 'cut_signal' as const,
    confidence: 0.9
  }))

  // Build voice segments (inverse of silence, minus clap zones)
  const totalDuration = channelData.length / sampleRate
  const segments: DetectedSegment[] = []
  let voiceStart = 0

  const allCutPoints = [...rawSilences, ...clapSegments].sort((a, b) => a.start - b.start)

  for (const cut of allCutPoints) {
    if (voiceStart < cut.start - options.padding) {
      const vStart = Math.max(0, voiceStart - options.padding)
      const vEnd = Math.min(totalDuration, cut.start + options.padding)
      if (vEnd - vStart >= options.minVoiceDuration) {
        segments.push({ start: vStart, end: vEnd, type: 'voice', confidence: 1 })
      }
    }
    segments.push(cut)
    voiceStart = cut.end
  }

  // Final voice segment
  if (voiceStart < totalDuration - 0.1) {
    const vStart = Math.max(0, voiceStart - options.padding)
    if (totalDuration - vStart >= options.minVoiceDuration) {
      segments.push({ start: vStart, end: totalDuration, type: 'voice', confidence: 1 })
    }
  }

  onProgress(100)
  return segments.sort((a, b) => a.start - b.start)
}

export async function generateWaveformData(filePath: string, samples = 500): Promise<number[]> {
  try {
    const response = await fetch(`file:///${filePath.replace(/\\/g, '/')}`)
    const arrayBuffer = await response.arrayBuffer()
    const audioCtx = new OfflineAudioContext(1, 1, 44100)
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    const channelData = audioBuffer.getChannelData(0)
    const blockSize = Math.floor(channelData.length / samples)
    const result: number[] = []
    let max = 0.001
    for (let i = 0; i < samples; i++) {
      const start = i * blockSize
      let sum = 0
      for (let j = start; j < start + blockSize && j < channelData.length; j++) {
        sum += Math.abs(channelData[j])
      }
      const avg = sum / blockSize
      result.push(avg)
      if (avg > max) max = avg
    }
    return result.map((v) => v / max)
  } catch {
    return []
  }
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`
}

export function secondsToPixels(seconds: number, zoom: number): number {
  return seconds * zoom
}

export function pixelsToSeconds(pixels: number, zoom: number): number {
  return pixels / zoom
}
