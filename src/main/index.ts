import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { existsSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { spawn } from 'child_process'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)

// Allow video/audio autoplay without requiring a user gesture first
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// ── Probe without ffprobe — parse ffmpeg -i stderr (async, non-blocking) ─────
function probeFile(filePath: string): Promise<{ duration: number; width: number; height: number; fps: number; hasVideo: boolean; hasAudio: boolean; size: number; bitrate: number }> {
  return new Promise((resolve) => {
    if (!ffmpegPath) return resolve({ duration: 0, width: 0, height: 0, fps: 30, hasVideo: false, hasAudio: false, size: 0, bitrate: 0 })

    let output = ''
    const proc = spawn(ffmpegPath, ['-i', filePath, '-hide_banner'], { windowsHide: true })
    proc.stderr.on('data', (d: Buffer) => { output += d.toString() })
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })

    const timeout = setTimeout(() => { proc.kill(); resolve({ duration: 0, width: 0, height: 0, fps: 30, hasVideo: false, hasAudio: false, size: 0, bitrate: 0 }) }, 12000)

    proc.on('close', () => {
      clearTimeout(timeout)

      const durMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
      const duration = durMatch ? Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3]) : 0

      const videoMatch = output.match(/Video:.+?(\d{3,5})x(\d{3,5})/)
      const width = videoMatch ? Number(videoMatch[1]) : 0
      const height = videoMatch ? Number(videoMatch[2]) : 0

      const fpsMatch = output.match(/(\d+(?:\.\d+)?)\s*fps/) || output.match(/(\d+(?:\.\d+)?)\s*tbr/)
      const fps = fpsMatch ? Math.round(Number(fpsMatch[1])) : 30

      const bitrateMatch = output.match(/bitrate:\s*(\d+)\s*kb\/s/)
      const bitrate = bitrateMatch ? Number(bitrateMatch[1]) * 1000 : 0

      const hasVideo = /Video:/.test(output)
      const hasAudio = /Audio:/.test(output)

      let size = 0
      try { size = require('fs').statSync(filePath).size } catch { size = 0 }

      resolve({ duration, width, height, fps, hasVideo, hasAudio, size, bitrate })
    })

    proc.on('error', () => { clearTimeout(timeout); resolve({ duration: 0, width: 0, height: 0, fps: 30, hasVideo: false, hasAudio: false, size: 0, bitrate: 0 }) })
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 700,
    backgroundColor: '#080810',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a0814', symbolColor: '#aaaacc', height: 36 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, webSecurity: false
    }
  })
  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => { shell.openExternal(details.url); return { action: 'deny' } })
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ── Open media dialog ────────────────────────────────────────────────────────
ipcMain.handle('dialog:open-media', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Importar Mídia',
    filters: [
      { name: 'Mídia', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v', 'mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'svg'] },
      { name: 'Vídeo', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v'] },
      { name: 'Áudio', extensions: ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus'] },
      { name: 'Imagem', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff'] },
      { name: 'Todos', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  })
  return result.canceled ? [] : result.filePaths
})

// ── Open single file ─────────────────────────────────────────────────────────
ipcMain.handle('dialog:open-file', async (_event, filters: { name: string; extensions: string[] }[]) => {
  const result = await dialog.showOpenDialog({ filters, properties: ['openFile'] })
  return result.canceled ? null : result.filePaths[0]
})

// ── Media metadata ───────────────────────────────────────────────────────────
ipcMain.handle('media:metadata', async (_event, filePath: string) => {
  return probeFile(filePath)
})

// ── Thumbnail ────────────────────────────────────────────────────────────────
ipcMain.handle('media:thumbnail', async (_event, filePath: string, timeSec: number) => {
  const tmpDir = app.getPath('temp')
  const outFile = join(tmpDir, `cineo_thumb_${Date.now()}.jpg`)
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .screenshots({ timestamps: [timeSec], filename: outFile, size: '320x?' })
      .on('end', () => {
        if (existsSync(outFile)) resolve('data:image/jpeg;base64,' + readFileSync(outFile).toString('base64'))
        else reject('Thumbnail not generated')
      })
      .on('error', (err) => reject(err.message))
  })
})

// ── Full audio analysis in main process (no renderer memory crash) ────────────
interface AutoCutOptions { silenceThreshold: number; minSilenceDuration: number; minVoiceDuration: number; padding: number; detectClapSignals: boolean; clapThreshold: number }
interface DetectedSegment { start: number; end: number; type: 'voice' | 'silence' | 'cut_signal'; confidence: number }

function analyzeWavBuffer(wav: Buffer, opts: AutoCutOptions): DetectedSegment[] {
  // Find 'data' chunk and read fmt info
  let sampleRate = 22050, bitsPerSample = 16, numChannels = 1, dataOffset = 44
  let pos = 12
  while (pos < wav.length - 8) {
    const id = wav.toString('ascii', pos, pos + 4)
    const sz = wav.readUInt32LE(pos + 4)
    if (id === 'fmt ') { numChannels = wav.readUInt16LE(pos + 8 + 2); sampleRate = wav.readUInt32LE(pos + 8 + 4); bitsPerSample = wav.readUInt16LE(pos + 8 + 14) }
    if (id === 'data') { dataOffset = pos + 8; break }
    pos += 8 + sz
  }

  const frameStep = (bitsPerSample / 8) * numChannels
  const totalSamples = Math.floor((wav.length - dataOffset) / frameStep)
  const frameDur = 0.02
  const frameSize = Math.floor(sampleRate * frameDur)
  const totalFrames = Math.floor(totalSamples / frameSize)

  const rms: number[] = []
  for (let f = 0; f < totalFrames; f++) {
    let sum = 0
    for (let s = 0; s < frameSize; s++) {
      const off = dataOffset + (f * frameSize + s) * frameStep
      if (off + 2 > wav.length) break
      const v = bitsPerSample === 16 ? wav.readInt16LE(off) / 32768 : (wav.readUInt8(off) - 128) / 128
      sum += v * v
    }
    rms.push(Math.sqrt(sum / frameSize))
  }

  const maxRms = Math.max(...rms, 0.001)
  const norm = rms.map(v => v / maxRms)
  const silent = norm.map(v => v < opts.silenceThreshold)

  const claps: number[] = []
  if (opts.detectClapSignals) {
    for (let i = 2; i < norm.length - 2; i++) {
      const prev = (norm[i-1] + norm[i-2]) / 2
      const curr = norm[i]
      const next = (norm[i+1] + norm[i+2]) / 2
      if (curr > opts.clapThreshold && curr > prev * 3 && curr > next * 1.5) claps.push(i * frameDur)
    }
  }

  const silences: DetectedSegment[] = []
  let sStart = -1
  for (let i = 0; i <= silent.length; i++) {
    const s = silent[i] ?? false
    if (s && sStart < 0) sStart = i * frameDur
    else if (!s && sStart >= 0) {
      const dur = i * frameDur - sStart
      if (dur >= opts.minSilenceDuration) silences.push({ start: sStart, end: i * frameDur, type: 'silence', confidence: Math.min(1, dur / (opts.minSilenceDuration * 3)) })
      sStart = -1
    }
  }

  const cuts: DetectedSegment[] = claps.map(t => ({ start: t, end: t + frameDur * 3, type: 'cut_signal' as const, confidence: 0.9 }))
  const allCuts = [...silences, ...cuts].sort((a, b) => a.start - b.start)
  const totalDur = totalSamples / sampleRate
  const segments: DetectedSegment[] = []
  let vStart = 0

  for (const cut of allCuts) {
    if (vStart < cut.start - opts.padding) {
      const vs = Math.max(0, vStart - opts.padding)
      const ve = Math.min(totalDur, cut.start + opts.padding)
      if (ve - vs >= opts.minVoiceDuration) segments.push({ start: vs, end: ve, type: 'voice', confidence: 1 })
    }
    segments.push(cut)
    vStart = cut.end
  }
  if (vStart < totalDur - 0.1) {
    const vs = Math.max(0, vStart - opts.padding)
    if (totalDur - vs >= opts.minVoiceDuration) segments.push({ start: vs, end: totalDur, type: 'voice', confidence: 1 })
  }
  return segments.sort((a, b) => a.start - b.start)
}

ipcMain.handle('media:analyze-audio', async (event, filePath: string, options: AutoCutOptions) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const tmpDir = app.getPath('temp')
  const wavPath = join(tmpDir, `cineo_audio_${Date.now()}.wav`)

  const sendProgress = (p: number) => win?.webContents.send('analyze:progress', p)
  sendProgress(5)

  await new Promise<void>((resolve, reject) => {
    ffmpeg(filePath)
      .noVideo().audioChannels(1).audioFrequency(22050).audioCodec('pcm_s16le')
      .output(wavPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error('Sem trilha de áudio: ' + err.message)))
      .run()
  })

  sendProgress(50)
  const wavBuf = readFileSync(wavPath)
  sendProgress(70)
  const segments = analyzeWavBuffer(wavBuf, options)
  sendProgress(100)

  try { require('fs').unlinkSync(wavPath) } catch { /* ignore */ }
  return segments
})

// ── Read binary file as base64 (for audio analysis) ──────────────────────────
ipcMain.handle('fs:read-binary', async (_event, filePath: string) => {
  return readFileSync(filePath).toString('base64')
})

// ── Read text file ────────────────────────────────────────────────────────────
ipcMain.handle('fs:read-text', async (_event, filePath: string) => {
  return readFileSync(filePath, 'utf8')
})

// ── Write text file ───────────────────────────────────────────────────────────
ipcMain.handle('fs:write-text', async (_event, filePath: string, content: string) => {
  writeFileSync(filePath, content, 'utf8')
})

// ── Save dialog ──────────────────────────────────────────────────────────────
ipcMain.handle('export:save-dialog', async (_event, defaultName = 'cineo_export', format = 'mp4') => {
  const extMap: Record<string, string> = { mp4: 'MP4', mov: 'MOV', mkv: 'MKV', webm: 'WebM', avi: 'AVI', mp3: 'MP3', wav: 'WAV', gif: 'GIF' }
  const result = await dialog.showSaveDialog({
    title: 'Exportar',
    defaultPath: `${defaultName}.${format}`,
    filters: [{ name: extMap[format] || 'Vídeo', extensions: [format] }, { name: 'Todos', extensions: ['*'] }]
  })
  return result.canceled ? null : result.filePath
})

// ── Export render ────────────────────────────────────────────────────────────
interface ColorCorrection { brightness: number; contrast: number; saturation: number; hue: number; temperature: number }
interface TextOverlay { text: string; fontSize: number; fontColor: string; backgroundColor: string; backgroundOpacity: number; fontFamily: string; bold: boolean; italic: boolean; x: number; y: number; align: string }
interface StickerData { content: string; x: number; y: number; scale: number; rotation: number; opacity: number }
interface ExportClipData {
  path: string; timelineStart: number; startTime: number; duration: number
  volume: number; speed: number; fadeIn: number; fadeOut: number
  colorCorrection: ColorCorrection; type: string
  voiceEnhance?: boolean; noiseReduction?: number
  textData?: TextOverlay; stickerData?: StickerData
}
interface ExportOptions { width: number; height: number; fps: number; quality: string; format: string }

function escapeDrawtextStr(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '’')
    .replace(/:/g, '\\:')
    .replace(/\n/g, '\\n')
    .replace(/%/g, '\\%')
}

function fontFileForOS(bold: boolean, italic: boolean): string {
  if (process.platform === 'win32') {
    if (bold && italic) return 'C:/Windows/Fonts/arialbi.ttf'
    if (bold) return 'C:/Windows/Fonts/arialbd.ttf'
    if (italic) return 'C:/Windows/Fonts/ariali.ttf'
    return 'C:/Windows/Fonts/arial.ttf'
  }
  const base = '/usr/share/fonts/truetype/liberation/LiberationSans'
  return bold ? `${base}-Bold.ttf` : `${base}-Regular.ttf`
}

function buildDrawtextFilter(td: TextOverlay, tStart: number, tEnd: number, W: number, H: number): string {
  const fontSize = Math.round(td.fontSize * H / 1080)
  const x = `w*${(td.x / 100).toFixed(4)}-tw/2`
  const y = `h*${(td.y / 100).toFixed(4)}-th/2`
  const font = fontFileForOS(td.bold, td.italic)
  const text = escapeDrawtextStr(td.text || '')
  const enable = `between(t,${tStart.toFixed(3)},${tEnd.toFixed(3)})`
  const bgAlpha = td.backgroundOpacity > 0
    ? Math.round(td.backgroundOpacity * 255).toString(16).padStart(2, '0')
    : null
  let dt = `drawtext=fontfile='${font}':text='${text}':fontsize=${fontSize}:fontcolor='${td.fontColor}':x=${x}:y=${y}:enable='${enable}'`
  if (bgAlpha) dt += `:box=1:boxcolor='${td.backgroundColor}${bgAlpha}':boxborderw=${Math.round(8 * H / 1080)}`
  return dt
}

function buildPerClipVideoFilters(clip: ExportClipData, W: number, H: number): string {
  const cc = clip.colorCorrection
  const filters: string[] = []
  filters.push(`setpts=PTS-STARTPTS`)
  filters.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`)
  if (clip.speed !== 1) filters.push(`setpts=PTS/${clip.speed.toFixed(4)}`)
  const eq: string[] = []
  if (cc.brightness !== 1) eq.push(`brightness=${(cc.brightness - 1).toFixed(3)}`)
  if (cc.contrast !== 1) eq.push(`contrast=${cc.contrast.toFixed(3)}`)
  if (cc.saturation !== 1) eq.push(`saturation=${cc.saturation.toFixed(3)}`)
  if (eq.length > 0) filters.push(`eq=${eq.join(':')}`)
  if (cc.hue !== 0) filters.push(`hue=h=${cc.hue.toFixed(1)}`)
  if (cc.temperature !== 0) {
    const t = cc.temperature / 100
    if (t > 0) filters.push(`colorbalance=rs=${t.toFixed(3)}:gs=0:bs=${(-t * 0.5).toFixed(3)}:rm=${t.toFixed(3)}:gm=0:bm=${(-t * 0.5).toFixed(3)}`)
    else filters.push(`colorbalance=rs=0:gs=0:bs=${(-t).toFixed(3)}:rm=0:gm=0:bm=${(-t).toFixed(3)}`)
  }
  const outDur = clip.duration / (clip.speed || 1)
  if (clip.fadeIn > 0) filters.push(`fade=t=in:st=0:d=${clip.fadeIn.toFixed(2)}`)
  if (clip.fadeOut > 0) filters.push(`fade=t=out:st=${(outDur - clip.fadeOut).toFixed(2)}:d=${clip.fadeOut.toFixed(2)}`)
  return filters.join(',')
}

function buildPerClipAudioFilters(clip: ExportClipData): string {
  const filters: string[] = ['asetpts=PTS-STARTPTS']
  if (clip.voiceEnhance) filters.push('highpass=f=80,equalizer=f=1000:width_type=o:width=3:g=3,equalizer=f=3000:width_type=o:width=2:g=2')
  if (clip.noiseReduction && clip.noiseReduction > 0) {
    const nf = Math.round(-10 - clip.noiseReduction * 30)
    filters.push(`afftdn=nf=${nf}`)
  }
  if (clip.volume !== 1) filters.push(`volume=${clip.volume.toFixed(3)}`)
  if (clip.speed !== 1) {
    let s = clip.speed
    while (s < 0.5) { filters.push('atempo=0.5'); s /= 0.5 }
    while (s > 2.0) { filters.push('atempo=2.0'); s /= 2.0 }
    if (Math.abs(s - 1) > 0.001) filters.push(`atempo=${s.toFixed(4)}`)
  }
  const outDur = clip.duration / (clip.speed || 1)
  if (clip.fadeIn > 0) filters.push(`afade=t=in:st=0:d=${clip.fadeIn.toFixed(2)}`)
  if (clip.fadeOut > 0) filters.push(`afade=t=out:st=${(outDur - clip.fadeOut).toFixed(2)}:d=${clip.fadeOut.toFixed(2)}`)
  return filters.join(',')
}

ipcMain.handle('export:render', async (event, clips: ExportClipData[], outputPath: string, options: ExportOptions) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const isAudioOnly = options.format === 'mp3' || options.format === 'wav'
  const crf = options.quality === 'high' ? 18 : options.quality === 'medium' ? 23 : 28

  const videoClips = clips.filter((c) => (c.type === 'video' || c.type === 'image') && c.path)
  const audioOnlyClips = clips.filter((c) => c.type === 'audio' && c.path)
  const textOverlays = clips.filter((c) => c.type === 'text' && c.textData)
  const stickerOverlays = clips.filter((c) => c.type === 'sticker' && c.stickerData)

  if (videoClips.length === 0 && audioOnlyClips.length === 0) throw new Error('Nenhuma mídia para exportar')

  // Timeline reference: first video clip's timeline start
  const firstVideoTL = videoClips.length > 0 ? videoClips[0].timelineStart : 0

  // Build all text+sticker drawtext filters, using output time (relative to first video clip)
  const drawtextFilters: string[] = []
  for (const tc of textOverlays) {
    if (!tc.textData || !tc.textData.text.trim()) continue
    const tS = tc.timelineStart - firstVideoTL
    const tE = tS + tc.duration
    if (tE > 0) drawtextFilters.push(buildDrawtextFilter(tc.textData, Math.max(0, tS), tE, options.width, options.height))
  }
  for (const sc of stickerOverlays) {
    if (!sc.stickerData) continue
    const content = sc.stickerData.content
    const animMatch = content.match(/^\[([a-z]+)\]$/)
    const label = animMatch ? animMatch[1].toUpperCase() : content
    if (!label) continue
    const fakeTd: TextOverlay = {
      text: label, fontSize: 56, fontColor: '#ffffff',
      backgroundColor: '#000000', backgroundOpacity: 0.5,
      fontFamily: 'Arial', bold: true, italic: false,
      x: sc.stickerData.x, y: sc.stickerData.y, align: 'center'
    }
    const tS = sc.timelineStart - firstVideoTL
    const tE = tS + sc.duration
    if (tE > 0) drawtextFilters.push(buildDrawtextFilter(fakeTd, Math.max(0, tS), tE, options.width, options.height))
  }

  return new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg()

    // Add video/image inputs
    for (const c of videoClips) cmd.input(c.path).seekInput(c.startTime).inputOptions([`-t ${c.duration}`])
    // Add audio-only inputs
    for (const c of audioOnlyClips) cmd.input(c.path).seekInput(c.startTime).inputOptions([`-t ${c.duration}`])

    const nVideo = videoClips.length
    const nAudio = audioOnlyClips.length
    const hasVideo = nVideo > 0 && !isAudioOnly

    if (!hasVideo && nAudio === 0) return reject('Nenhuma mídia para exportar')

    // ── Simple case: single video, no separate audio ──────────────────────────
    if (hasVideo && nVideo === 1 && nAudio === 0) {
      const vc = videoClips[0]
      const vFilters = [buildPerClipVideoFilters(vc, options.width, options.height), ...drawtextFilters].join(',')
      cmd.videoFilters(vFilters)
      const af = buildPerClipAudioFilters(vc)
      if (af !== 'asetpts=PTS-STARTPTS') cmd.audioFilters(af)
      cmd.outputOptions(buildOutputOptions(options, crf)).output(outputPath)
        .on('progress', (p) => win?.webContents.send('export:progress', p.percent ?? 0))
        .on('end', () => resolve())
        .on('error', (err) => reject(err.message))
        .run()
      return
    }

    // ── Complex filtergraph ───────────────────────────────────────────────────
    const filterParts: string[] = []
    let videoStreamLabel = ''
    let audioStreamLabel = ''

    if (hasVideo) {
      // Per-clip video filters
      for (let i = 0; i < nVideo; i++) {
        filterParts.push(`[${i}:v]${buildPerClipVideoFilters(videoClips[i], options.width, options.height)}[v${i}]`)
      }
      if (nVideo === 1) {
        videoStreamLabel = 'v0'
      } else {
        const concatInputs = videoClips.map((_, i) => `[v${i}]`).join('')
        filterParts.push(`${concatInputs}concat=n=${nVideo}:v=1:a=0[vcat]`)
        videoStreamLabel = 'vcat'
      }
      // Apply text overlays after concat
      if (drawtextFilters.length > 0) {
        filterParts.push(`[${videoStreamLabel}]${drawtextFilters.join(',')}[vout]`)
        videoStreamLabel = 'vout'
      }

      // Per-clip audio from video files
      for (let i = 0; i < nVideo; i++) {
        filterParts.push(`[${i}:a]${buildPerClipAudioFilters(videoClips[i])}[av${i}]`)
      }
      if (nVideo === 1) {
        audioStreamLabel = 'av0'
      } else {
        const concatAInputs = videoClips.map((_, i) => `[av${i}]`).join('')
        filterParts.push(`${concatAInputs}concat=n=${nVideo}:v=0:a=1[acat]`)
        audioStreamLabel = 'acat'
      }
    }

    // Add separate audio-only tracks
    if (nAudio > 0) {
      const offset = nVideo
      for (let i = 0; i < nAudio; i++) {
        filterParts.push(`[${offset + i}:a]${buildPerClipAudioFilters(audioOnlyClips[i])}[xa${i}]`)
      }
      if (audioStreamLabel) {
        // Mix video audio with separate audio
        const mixInputs = [`[${audioStreamLabel}]`, ...audioOnlyClips.map((_, i) => `[xa${i}]`)].join('')
        filterParts.push(`${mixInputs}amix=inputs=${1 + nAudio}:duration=longest[amix]`)
        audioStreamLabel = 'amix'
      } else {
        if (nAudio === 1) {
          audioStreamLabel = 'xa0'
        } else {
          const mixInputs = audioOnlyClips.map((_, i) => `[xa${i}]`).join('')
          filterParts.push(`${mixInputs}amix=inputs=${nAudio}:duration=longest[amix]`)
          audioStreamLabel = 'amix'
        }
      }
    }

    cmd.complexFilter(filterParts)
    if (videoStreamLabel) cmd.outputOptions([`-map [${videoStreamLabel}]`])
    if (audioStreamLabel && !isAudioOnly) cmd.outputOptions([`-map [${audioStreamLabel}]`])
    else if (audioStreamLabel && isAudioOnly) cmd.outputOptions([`-map [${audioStreamLabel}]`])

    cmd.outputOptions(buildOutputOptions(options, crf)).output(outputPath)
      .on('progress', (p) => win?.webContents.send('export:progress', p.percent ?? 0))
      .on('end', () => resolve())
      .on('error', (err) => reject(err.message))
      .run()
  })
})

function buildOutputOptions(options: ExportOptions, crf: number): string[] {
  const fmt = options.format
  if (fmt === 'mp3') return ['-c:a libmp3lame', '-q:a 2', '-vn']
  if (fmt === 'wav') return ['-c:a pcm_s16le', '-vn']
  if (fmt === 'gif') return [`-r ${Math.min(options.fps, 15)}`]
  if (fmt === 'webm') return [`-crf ${crf}`, `-r ${options.fps}`, '-c:v libvpx-vp9', '-c:a libopus', '-b:v 0']
  if (fmt === 'mov') return [`-crf ${crf}`, `-r ${options.fps}`, '-c:v libx264', '-c:a aac', '-movflags +faststart', '-preset fast']
  if (fmt === 'avi') return [`-crf ${crf}`, `-r ${options.fps}`, '-c:v libx264', '-c:a aac', '-preset fast']
  if (fmt === 'mkv') return [`-crf ${crf}`, `-r ${options.fps}`, '-c:v libx264', '-c:a aac', '-preset fast']
  return [`-crf ${crf}`, `-r ${options.fps}`, '-c:v libx264', '-c:a aac', '-movflags +faststart', '-preset fast']
}

// ── Project auto-save / load ─────────────────────────────────────────────────
ipcMain.handle('project:save', async (_event, projectId: string, data: string) => {
  writeFileSync(join(app.getPath('userData'), `autosave_${projectId}.json`), data, 'utf8')
})

ipcMain.handle('project:load', async (_event, projectId: string) => {
  const p = join(app.getPath('userData'), `autosave_${projectId}.json`)
  if (!existsSync(p)) return null
  return readFileSync(p, 'utf8')
})

// ── Transcribe audio using local Whisper (downloads ~75 MB model on first use)
ipcMain.handle('media:transcribe', async (event, filePath: string, clipStartOffset: number) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const send = (p: number) => win?.webContents.send('transcribe:progress', p)

  send(5)
  const wavPath = join(app.getPath('temp'), `cineo_tr_${Date.now()}.wav`)
  await new Promise<void>((resolve, reject) => {
    ffmpeg(filePath)
      .noVideo().audioChannels(1).audioFrequency(16000).audioCodec('pcm_s16le')
      .output(wavPath)
      .on('end', resolve)
      .on('error', (err) => reject(new Error('Sem áudio: ' + err.message)))
      .run()
  })
  send(25)

  // Dynamic import works from CJS because Node.js supports ESM interop
  const transformers = await import('@xenova/transformers') as any
  const { pipeline, env } = transformers
  env.cacheDir = join(app.getPath('userData'), 'models')

  const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
    progress_callback: (info: any) => {
      if (info.status === 'progress' && info.progress != null) send(25 + info.progress * 0.5)
    }
  })
  send(76)

  const result = await transcriber(wavPath, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 })
  send(98)
  try { require('fs').unlinkSync(wavPath) } catch { /* ignore */ }
  send(100)

  const chunks = (result.chunks ?? []) as Array<{ text: string; timestamp: [number, number | null] }>
  return chunks
    .map((c) => ({
      text: c.text.trim(),
      start: (c.timestamp[0] ?? 0) + clipStartOffset,
      end: ((c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 2)) + clipStartOffset
    }))
    .filter((c) => c.text.length > 0)
})

// ── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
ipcMain.on('window:maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender)
  w?.isMaximized() ? w.unmaximize() : w?.maximize()
})
ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
