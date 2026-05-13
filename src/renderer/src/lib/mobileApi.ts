// Mobile API bridge — replaces window.electron.* in browser/Capacitor context
import type { AutoCutOptions, DetectedSegment, ExportClipData, ExportOptions } from '../types'

// File registry: blob URL → File object
const fileReg = new Map<string, File>()

let exportCb: ((p: number) => void) | null = null
let analyzeCb: ((p: number) => void) | null = null
let transcribeCb: ((p: number) => void) | null = null

function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    input.accept = accept
    input.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    document.body.appendChild(input)
    const cleanup = () => { try { document.body.removeChild(input) } catch {} }
    input.addEventListener('change', () => { cleanup(); resolve(Array.from(input.files || [])) })
    input.addEventListener('cancel', () => { cleanup(); resolve([]) })
    input.click()
  })
}

function reg(file: File): string {
  const url = URL.createObjectURL(file)
  fileReg.set(url, file)
  return url
}

async function videoMeta(src: string) {
  return new Promise<{ duration: number; width: number; height: number; fps: number; hasVideo: boolean; hasAudio: boolean }>((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight, fps: 30, hasVideo: v.videoWidth > 0, hasAudio: true })
      v.src = ''
    }
    v.onerror = () => resolve({ duration: 0, width: 0, height: 0, fps: 30, hasVideo: false, hasAudio: false })
    v.src = src
  })
}

let ffmpegInstance: any = null
async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const ffmpeg = new FFmpeg()
  ffmpeg.on('progress', ({ progress }: any) => exportCb?.(Math.round(progress * 100)))
  const BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
  await ffmpeg.load({ coreURL: `${BASE}/ffmpeg-core.js`, wasmURL: `${BASE}/ffmpeg-core.wasm` })
  ffmpegInstance = ffmpeg
  return ffmpeg
}

const mobileApi: Window['electron'] = {
  // ── Media ──────────────────────────────────────────────────────────────────
  async openMediaDialog() {
    const files = await pickFiles('video/*,audio/*,image/*', true)
    return files.map(reg)
  },

  async getMediaMetadata(filePath) {
    const file = fileReg.get(filePath)
    const size = file?.size || 0
    if (file?.type.startsWith('image/')) {
      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve({ duration: 0, width: img.width, height: img.height, fps: 0, hasVideo: false, hasAudio: false, size, bitrate: 0 })
        img.onerror = () => resolve({ duration: 0, width: 0, height: 0, fps: 0, hasVideo: false, hasAudio: false, size: 0, bitrate: 0 })
        img.src = filePath
      })
    }
    const m = await videoMeta(filePath)
    return { ...m, size, bitrate: 0 }
  },

  async generateThumbnail(filePath, time) {
    return new Promise((resolve) => {
      const v = document.createElement('video')
      v.src = filePath
      v.currentTime = time || 0.1
      const capture = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 160; canvas.height = 90
        canvas.getContext('2d')!.drawImage(v, 0, 0, 160, 90)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
        v.src = ''
      }
      v.onseeked = capture
      v.onloadeddata = () => { if (v.readyState >= 2) capture() }
      v.onerror = () => resolve('')
    })
  },

  async openSaveDialog(defaultName) {
    return `${defaultName || 'export'}.mp4`
  },

  async openFile() {
    const files = await pickFiles('*/*', false)
    if (!files.length) return null
    return reg(files[0])
  },

  // ── Export ─────────────────────────────────────────────────────────────────
  async renderExport(clips: ExportClipData[], outputPath: string, options: ExportOptions) {
    exportCb?.(5)
    const { fetchFile } = await import('@ffmpeg/util')
    const ffmpeg = await getFFmpeg()
    exportCb?.(15)

    // Write all source files into FFmpeg virtual FS
    const clipMap: Record<string, string> = {}
    let idx = 0
    for (const clip of clips) {
      if (!clip.path || clip.type === 'text' || clip.type === 'sticker') continue
      if (clipMap[clip.path]) continue
      const ext = clip.path.split('.').pop()?.toLowerCase() || 'mp4'
      const fname = `inp${idx++}.${ext}`
      clipMap[clip.path] = fname
      await ffmpeg.writeFile(fname, await fetchFile(clip.path))
    }
    exportCb?.(40)

    const mediaClips = clips.filter(c => c.type !== 'text' && c.type !== 'sticker' && c.path && clipMap[c.path])

    let cmd: string[]
    if (mediaClips.length === 0) { exportCb?.(100); return }

    if (mediaClips.length === 1) {
      const c = mediaClips[0]
      const inp = clipMap[c.path]
      const trimArgs: string[] = []
      if (c.startTime > 0) trimArgs.push('-ss', String(c.startTime))
      trimArgs.push('-t', String(c.duration))
      cmd = ['-i', inp, ...trimArgs, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac', '-movflags', '+faststart', 'output.mp4']
    } else {
      // Concat multiple clips
      const inputs: string[] = []
      const filterParts: string[] = []
      mediaClips.forEach((c, i) => {
        inputs.push('-i', clipMap[c.path])
        filterParts.push(`[${i}:v][${i}:a]`)
      })
      const filter = `${filterParts.join('')}concat=n=${mediaClips.length}:v=1:a=1[v][a]`
      cmd = [...inputs, '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac', 'output.mp4']
    }

    await ffmpeg.exec(cmd)
    exportCb?.(90)

    const data = await ffmpeg.readFile('output.mp4') as Uint8Array
    const blob = new Blob([data], { type: 'video/mp4' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = outputPath || 'cineo_export.mp4'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 2000)
    exportCb?.(100)
  },

  onExportProgress(cb) { exportCb = cb; return () => { exportCb = null } },

  // ── Audio analysis ─────────────────────────────────────────────────────────
  async analyzeAudio(filePath, options: AutoCutOptions) {
    analyzeCb?.(5)
    const response = await fetch(filePath)
    const arrayBuffer = await response.arrayBuffer()
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    const data = audioBuffer.getChannelData(0)
    const sr = audioBuffer.sampleRate
    const winSize = Math.max(1, Math.floor(sr * options.minSilenceDuration))
    const segments: DetectedSegment[] = []

    let inVoice = false
    let segStart = 0
    const total = data.length

    for (let i = 0; i < total; i += winSize) {
      analyzeCb?.(Math.round((i / total) * 90))
      const end = Math.min(i + winSize, total)
      let sum = 0
      for (let j = i; j < end; j++) sum += data[j] * data[j]
      const rms = Math.sqrt(sum / (end - i))
      const dB = 20 * Math.log10(rms + 1e-10)
      const isVoice = dB > options.silenceThreshold

      if (isVoice !== inVoice) {
        const t = i / sr
        segments.push({ start: segStart, end: t, type: inVoice ? 'voice' : 'silence', confidence: 0.85 })
        segStart = t
        inVoice = isVoice
      }
    }
    segments.push({ start: segStart, end: audioBuffer.duration, type: inVoice ? 'voice' : 'silence', confidence: 0.85 })
    analyzeCb?.(100)
    return segments
  },

  onAnalyzeProgress(cb) { analyzeCb = cb; return () => { analyzeCb = null } },

  async extractAudio(filePath) { return filePath },

  // ── File I/O ───────────────────────────────────────────────────────────────
  async readBinaryFile(path) {
    const r = await fetch(path)
    const buf = await r.arrayBuffer()
    let bin = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  },

  async readTextFile(path) {
    return (await fetch(path)).text()
  },

  async writeTextFile() {},

  saveProject(projectId, data) {
    try { localStorage.setItem(`cineo_proj_${projectId}`, data) } catch {}
    return Promise.resolve()
  },

  loadProject(projectId) {
    return Promise.resolve(localStorage.getItem(`cineo_proj_${projectId}`))
  },

  // ── Transcription ──────────────────────────────────────────────────────────
  async transcribeAudio(filePath, clipStartOffset) {
    transcribeCb?.(5)
    const mod = await import('@xenova/transformers') as any
    const { pipeline, env } = mod
    env.allowLocalModels = false
    env.useBrowserCache = true
    const transcriber = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny',
      { progress_callback: (info: any) => { if (info.status === 'progress') transcribeCb?.(Math.round(10 + info.progress * 0.6)) } }
    )
    const result = await transcriber(filePath, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 })
    transcribeCb?.(100)
    return (result.chunks || []).map((c: any) => ({
      text: c.text?.trim() || '',
      start: (c.timestamp?.[0] ?? 0) + clipStartOffset,
      end: (c.timestamp?.[1] ?? 0) + clipStartOffset
    })).filter((c: any) => c.text)
  },

  onTranscribeProgress(cb) { transcribeCb = cb; return () => { transcribeCb = null } },

  // ── Window controls — no-op on mobile ─────────────────────────────────────
  minimizeWindow() {},
  maximizeWindow() {},
  closeWindow() {},
}

// Mark as mobile so UI can conditionally render
;(window as any).__CINEO_MOBILE__ = true
window.electron = mobileApi
