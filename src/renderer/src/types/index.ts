export type MediaType = 'video' | 'audio' | 'image' | 'text' | 'sticker'

export interface MediaClip {
  id: string
  name: string
  path: string
  type: Exclude<MediaType, 'text'>
  duration: number
  width: number
  height: number
  fps: number
  thumbnail?: string
  hasVideo: boolean
  hasAudio: boolean
  fileSize: number
  waveformData?: number[]  // normalized 0-1 amplitude values (audio/video with audio)
}

export interface ColorCorrection {
  brightness: number   // 0-2, 1=normal
  contrast: number     // 0-2, 1=normal
  saturation: number   // 0-3, 1=normal
  hue: number          // -180 to 180 degrees
  temperature: number  // -100 to 100 (cool/warm)
}

export const defaultColorCorrection: ColorCorrection = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  temperature: 0
}

export type TitleAnimation = 'none' | 'fadeIn' | 'slideUp' | 'slideDown' | 'zoomIn' | 'glow' | 'bounce' | 'shake'

export interface TextOverlay {
  text: string
  fontSize: number       // px relative to 1080p height
  fontColor: string
  backgroundColor: string
  backgroundOpacity: number  // 0-1
  fontFamily: string
  bold: boolean
  italic: boolean
  x: number   // 0-100 (percent of frame)
  y: number   // 0-100 (percent of frame)
  align: 'left' | 'center' | 'right'
  animation?: TitleAnimation
}

export interface StickerData {
  content: string      // emoji character or image URL
  x: number            // 0-100 percent of frame
  y: number            // 0-100 percent of frame
  scale: number        // 0.5-3.0, 1=default
  rotation: number     // -180 to 180 degrees
  opacity: number      // 0-1
}

export const defaultStickerData: StickerData = {
  content: '⭐', x: 50, y: 50, scale: 1, rotation: 0, opacity: 1
}

export const defaultTextOverlay: TextOverlay = {
  text: 'Seu texto aqui',
  fontSize: 48,
  fontColor: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 0,
  fontFamily: 'Arial',
  bold: false,
  italic: false,
  x: 50,
  y: 85,
  align: 'center',
  animation: 'none'
}

export interface TimelineClip {
  id: string
  mediaId: string          // empty string for text clips
  trackId: string
  startTime: number
  duration: number
  mediaOffset: number
  name: string
  type: MediaType
  color: string
  volume: number           // 0-2, 1=normal
  speed: number            // 0.25-4, 1=normal
  fadeIn: number           // seconds
  fadeOut: number          // seconds
  colorCorrection: ColorCorrection
  voiceEnhance?: boolean   // boost voice frequencies + highpass
  noiseReduction?: number  // 0=off, 0.1-1.0 = strength
  textData?: TextOverlay
  stickerData?: StickerData
  waveformData?: number[]  // normalized 0-1 amplitude values
}

export interface Track {
  id: string
  type: 'video' | 'audio'
  name: string
  muted: boolean
  locked: boolean
  hidden: boolean
  height: number
}

export interface Marker {
  id: string
  time: number
  name: string
  color: string
}

export interface Project {
  name: string
  width: number
  height: number
  fps: number
  duration: number
}

export interface AutoCutOptions {
  silenceThreshold: number
  minSilenceDuration: number
  minVoiceDuration: number
  detectClapSignals: boolean
  clapThreshold: number
  padding: number
}

export interface DetectedSegment {
  start: number
  end: number
  type: 'voice' | 'silence' | 'cut_signal'
  confidence: number
}

export type ExportFormat = 'mp4' | 'mov' | 'mkv' | 'webm' | 'avi' | 'mp3' | 'wav' | 'gif'

export interface ExportOptions {
  width: number
  height: number
  fps: number
  quality: 'high' | 'medium' | 'low'
  format: ExportFormat
}

export interface ExportClipData {
  path: string
  timelineStart: number    // position in output timeline (seconds)
  startTime: number        // trim-in point in source file
  duration: number         // source content duration (before speed)
  volume: number
  speed: number
  fadeIn: number
  fadeOut: number
  colorCorrection: ColorCorrection
  voiceEnhance?: boolean
  noiseReduction?: number
  type: MediaType
  textData?: TextOverlay
  stickerData?: StickerData
}

export interface Subtitle {
  id: string
  startTime: number
  endTime: number
  text: string
}

declare global {
  interface Window {
    electron: {
      openMediaDialog: () => Promise<string[]>
      getMediaMetadata: (filePath: string) => Promise<{
        duration: number
        width: number
        height: number
        fps: number
        hasVideo: boolean
        hasAudio: boolean
        size: number
        bitrate: number
      }>
      generateThumbnail: (filePath: string, time: number) => Promise<string>
      openSaveDialog: (defaultName?: string, format?: ExportFormat) => Promise<string | null>
      openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
      renderExport: (
        clips: ExportClipData[],
        outputPath: string,
        options: ExportOptions
      ) => Promise<void>
      onExportProgress: (cb: (progress: number) => void) => () => void
      analyzeAudio: (filePath: string, options: AutoCutOptions) => Promise<DetectedSegment[]>
      onAnalyzeProgress: (cb: (p: number) => void) => () => void
      extractAudio: (filePath: string) => Promise<string>
      readBinaryFile: (path: string) => Promise<string>
      readTextFile: (path: string) => Promise<string>
      writeTextFile: (path: string, content: string) => Promise<void>
      saveProject: (projectId: string, data: string) => Promise<void>
      loadProject: (projectId: string) => Promise<string | null>
      transcribeAudio: (filePath: string, clipStartOffset: number) => Promise<{ text: string; start: number; end: number }[]>
      onTranscribeProgress: (cb: (p: number) => void) => () => void
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
    }
  }
}
