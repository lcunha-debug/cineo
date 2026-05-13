import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { MediaClip, TimelineClip, Track, Project, AutoCutOptions, Marker, ColorCorrection, TextOverlay, StickerData } from '../types'
import { defaultColorCorrection, defaultTextOverlay, defaultStickerData } from '../types'

const CLIP_COLORS: Record<string, string> = {
  video: '#3b82f6',
  audio: '#10b981',
  image: '#f59e0b',
  text: '#ec4899'
}

type HistorySnapshot = { clips: TimelineClip[]; tracks: Track[] }

const MAX_HISTORY = 50

function calcDuration(clips: TimelineClip[]): number {
  return clips.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0)
}

interface EditorState {
  project: Project
  setProject: (p: Partial<Project>) => void

  mediaLibrary: MediaClip[]
  addMedia: (clip: MediaClip) => void
  removeMedia: (id: string) => void

  tracks: Track[]
  addTrack: (type: 'video' | 'audio') => void
  removeTrack: (id: string) => void
  toggleTrackMuted: (id: string) => void
  toggleTrackLocked: (id: string) => void
  toggleTrackHidden: (id: string) => void
  renameTrack: (id: string, name: string) => void

  clips: TimelineClip[]
  addClipToTimeline: (mediaId: string, trackId: string, startTime: number) => void
  addTextClip: (trackId: string, startTime: number, textData?: Partial<TextOverlay>) => void
  addStickerClip: (trackId: string, startTime: number, stickerData?: Partial<StickerData>) => void
  removeClip: (id: string) => void
  moveClip: (id: string, startTime: number, trackId?: string) => void
  resizeClip: (id: string, duration: number) => void
  splitClipAt: (id: string, atTime: number) => void
  splitAtPlayhead: () => void
  replaceClips: (clips: TimelineClip[]) => void
  updateClip: (id: string, updates: Partial<TimelineClip>) => void
  duplicateClip: (id: string) => void

  clipboard: TimelineClip[]
  copyClip: (id: string) => void
  cutClip: (id: string) => void
  pasteClip: (trackId?: string) => void

  markers: Marker[]
  addMarker: (time: number, name?: string, color?: string) => void
  removeMarker: (id: string) => void
  updateMarker: (id: string, updates: Partial<Marker>) => void

  history: HistorySnapshot[]
  historyIndex: number
  undo: () => void
  redo: () => void
  _pushHistory: () => void

  currentTime: number
  isPlaying: boolean
  setCurrentTime: (t: number) => void
  setIsPlaying: (p: boolean) => void

  selectedClipId: string | null
  setSelectedClip: (id: string | null) => void
  selectedClipIds: string[]
  setSelectedClips: (ids: string[]) => void

  zoom: number
  setZoom: (z: number) => void

  snapEnabled: boolean
  setSnapEnabled: (v: boolean) => void

  autoCutOptions: AutoCutOptions
  setAutoCutOptions: (opts: Partial<AutoCutOptions>) => void

  exportProgress: number | null
  setExportProgress: (p: number | null) => void

  loadProjectData: (data: { project?: Project; clips?: TimelineClip[]; tracks?: Track[]; mediaLibrary?: MediaClip[]; markers?: Marker[] }) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: { name: 'Projeto sem título', width: 1920, height: 1080, fps: 30, duration: 0 },
  setProject: (p) => set((s) => ({ project: { ...s.project, ...p } })),

  mediaLibrary: [],
  addMedia: (clip) => set((s) => ({ mediaLibrary: [...s.mediaLibrary, clip] })),
  removeMedia: (id) => set((s) => ({ mediaLibrary: s.mediaLibrary.filter((c) => c.id !== id) })),

  tracks: [
    { id: 'track-video-1', type: 'video', name: 'Vídeo 1', muted: false, locked: false, hidden: false, height: 68 },
    { id: 'track-audio-1', type: 'audio', name: 'Áudio 1', muted: false, locked: false, hidden: false, height: 52 }
  ],
  addTrack: (type) =>
    set((s) => {
      const count = s.tracks.filter((t) => t.type === type).length + 1
      return {
        tracks: [...s.tracks, {
          id: uuidv4(), type,
          name: `${type === 'video' ? 'Vídeo' : 'Áudio'} ${count}`,
          muted: false, locked: false, hidden: false,
          height: type === 'video' ? 68 : 52
        }]
      }
    }),
  removeTrack: (id) => set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id), clips: s.clips.filter((c) => c.trackId !== id) })),
  toggleTrackMuted: (id) => set((s) => ({ tracks: s.tracks.map((t) => t.id === id ? { ...t, muted: !t.muted } : t) })),
  toggleTrackLocked: (id) => set((s) => ({ tracks: s.tracks.map((t) => t.id === id ? { ...t, locked: !t.locked } : t) })),
  toggleTrackHidden: (id) => set((s) => ({ tracks: s.tracks.map((t) => t.id === id ? { ...t, hidden: !t.hidden } : t) })),
  renameTrack: (id, name) => set((s) => ({ tracks: s.tracks.map((t) => t.id === id ? { ...t, name } : t) })),

  clips: [],

  addClipToTimeline: (mediaId, trackId, startTime) => {
    get()._pushHistory()
    const media = get().mediaLibrary.find((m) => m.id === mediaId)
    if (!media) return
    const track = get().tracks.find((t) => t.id === trackId)
    if (track?.locked) return
    const clip: TimelineClip = {
      id: uuidv4(), mediaId, trackId,
      startTime, duration: media.type === 'image' ? 5 : media.duration,
      mediaOffset: 0, name: media.name, type: media.type,
      color: CLIP_COLORS[media.type] ?? '#888',
      volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      voiceEnhance: false, noiseReduction: 0,
      colorCorrection: { ...defaultColorCorrection },
      waveformData: media.waveformData
    }
    set((s) => {
      const newDuration = Math.max(s.project.duration, clip.startTime + clip.duration)
      return { clips: [...s.clips, clip], project: { ...s.project, duration: newDuration } }
    })
  },

  addTextClip: (trackId, startTime, textData) => {
    get()._pushHistory()
    const track = get().tracks.find((t) => t.id === trackId)
    if (track?.locked) return
    const clip: TimelineClip = {
      id: uuidv4(), mediaId: '', trackId,
      startTime, duration: 5, mediaOffset: 0,
      name: textData?.text?.slice(0, 20) ?? 'Texto',
      type: 'text', color: CLIP_COLORS['text'],
      volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      colorCorrection: { ...defaultColorCorrection },
      textData: { ...defaultTextOverlay, ...textData }
    }
    set((s) => {
      const newDuration = Math.max(s.project.duration, clip.startTime + clip.duration)
      return { clips: [...s.clips, clip], project: { ...s.project, duration: newDuration } }
    })
  },

  addStickerClip: (trackId, startTime, stickerData) => {
    get()._pushHistory()
    const track = get().tracks.find((t) => t.id === trackId)
    if (track?.locked) return
    const data = { ...defaultStickerData, ...stickerData }
    const clip: TimelineClip = {
      id: uuidv4(), mediaId: '', trackId,
      startTime, duration: 5, mediaOffset: 0,
      name: data.content, type: 'sticker', color: '#ec4899',
      volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      colorCorrection: { ...defaultColorCorrection },
      stickerData: data
    }
    set((s) => {
      const newDuration = Math.max(s.project.duration, clip.startTime + clip.duration)
      return { clips: [...s.clips, clip], project: { ...s.project, duration: newDuration } }
    })
  },

  removeClip: (id) => {
    get()._pushHistory()
    set((s) => ({ clips: s.clips.filter((c) => c.id !== id) }))
  },

  moveClip: (id, startTime, trackId) => {
    const track = trackId ? get().tracks.find((t) => t.id === trackId) : undefined
    if (track?.locked) return
    set((s) => {
      const clips = s.clips.map((c) =>
        c.id === id ? { ...c, startTime: Math.max(0, startTime), ...(trackId ? { trackId } : {}) } : c
      )
      return { clips, project: { ...s.project, duration: Math.max(calcDuration(clips), 0) } }
    })
  },

  resizeClip: (id, duration) => set((s) => ({ clips: s.clips.map((c) => c.id === id ? { ...c, duration: Math.max(0.1, duration) } : c) })),

  splitClipAt: (id, atTime) => {
    get()._pushHistory()
    const { clips } = get()
    const clip = clips.find((c) => c.id === id)
    if (!clip) return
    const track = get().tracks.find((t) => t.id === clip.trackId)
    if (track?.locked) return
    const splitOffset = atTime - clip.startTime
    if (splitOffset <= 0.05 || splitOffset >= clip.duration - 0.05) return
    const left: TimelineClip = { ...clip, duration: splitOffset }
    const right: TimelineClip = {
      ...clip, id: uuidv4(),
      startTime: atTime, duration: clip.duration - splitOffset,
      mediaOffset: clip.mediaOffset + splitOffset
    }
    set({ clips: [...clips.filter((c) => c.id !== id), left, right] })
  },

  splitAtPlayhead: () => {
    const { currentTime, selectedClipId, clips } = get()
    if (selectedClipId) {
      get().splitClipAt(selectedClipId, currentTime)
      return
    }
    // Split all clips at playhead
    const toSplit = clips.filter((c) => currentTime > c.startTime + 0.05 && currentTime < c.startTime + c.duration - 0.05)
    for (const c of toSplit) get().splitClipAt(c.id, currentTime)
  },

  replaceClips: (clips) => {
    get()._pushHistory()
    set((s) => ({ clips, project: { ...s.project, duration: calcDuration(clips) } }))
  },

  updateClip: (id, updates) => set((s) => ({ clips: s.clips.map((c) => c.id === id ? { ...c, ...updates } : c) })),

  duplicateClip: (id) => {
    get()._pushHistory()
    const clip = get().clips.find((c) => c.id === id)
    if (!clip) return
    const newClip: TimelineClip = { ...clip, id: uuidv4(), startTime: clip.startTime + clip.duration }
    set((s) => {
      const newDuration = Math.max(s.project.duration, newClip.startTime + newClip.duration)
      return { clips: [...s.clips, newClip], project: { ...s.project, duration: newDuration } }
    })
  },

  clipboard: [],
  copyClip: (id) => {
    const clip = get().clips.find((c) => c.id === id)
    if (clip) set({ clipboard: [clip] })
  },
  cutClip: (id) => {
    const clip = get().clips.find((c) => c.id === id)
    if (!clip) return
    set({ clipboard: [clip] })
    get().removeClip(id)
  },
  pasteClip: (trackId) => {
    const { clipboard, currentTime, tracks } = get()
    if (clipboard.length === 0) return
    get()._pushHistory()
    const newClips = clipboard.map((c) => ({
      ...c,
      id: uuidv4(),
      trackId: trackId ?? c.trackId,
      startTime: currentTime
    }))
    set((s) => {
      const all = [...s.clips, ...newClips]
      return { clips: all, project: { ...s.project, duration: Math.max(s.project.duration, calcDuration(newClips)) } }
    })
  },

  markers: [],
  addMarker: (time, name = '', color = '#f43f5e') => {
    const marker: Marker = { id: uuidv4(), time, name, color }
    set((s) => ({ markers: [...s.markers, marker].sort((a, b) => a.time - b.time) }))
  },
  removeMarker: (id) => set((s) => ({ markers: s.markers.filter((m) => m.id !== id) })),
  updateMarker: (id, updates) => set((s) => ({ markers: s.markers.map((m) => m.id === id ? { ...m, ...updates } : m) })),

  history: [],
  historyIndex: -1,

  _pushHistory: () => {
    const { clips, tracks, history, historyIndex } = get()
    const snapshot: HistorySnapshot = {
      clips: JSON.parse(JSON.stringify(clips)),
      tracks: JSON.parse(JSON.stringify(tracks))
    }
    const newHistory = [...history.slice(0, historyIndex + 1), snapshot].slice(-MAX_HISTORY)
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex < 0) return
    const prev = history[historyIndex - 1]
    if (prev) {
      set({ clips: prev.clips, tracks: prev.tracks, historyIndex: historyIndex - 1, selectedClipId: null })
    } else {
      // undo all the way back to empty
      set({ clips: [], historyIndex: -1, selectedClipId: null })
    }
  },

  redo: () => {
    const { history, historyIndex } = get()
    const next = history[historyIndex + 1]
    if (!next) return
    set({ clips: next.clips, tracks: next.tracks, historyIndex: historyIndex + 1, selectedClipId: null })
  },

  currentTime: 0,
  isPlaying: false,
  setCurrentTime: (t) => set({ currentTime: t }),
  setIsPlaying: (p) => set({ isPlaying: p }),

  selectedClipId: null,
  setSelectedClip: (id) => set({ selectedClipId: id, selectedClipIds: id ? [id] : [] }),
  selectedClipIds: [],
  setSelectedClips: (ids) => set({ selectedClipIds: ids, selectedClipId: ids[0] ?? null }),

  zoom: 100,
  setZoom: (z) => set({ zoom: Math.max(5, Math.min(800, z)) }),

  snapEnabled: true,
  setSnapEnabled: (v) => set({ snapEnabled: v }),

  autoCutOptions: {
    silenceThreshold: 0.04, minSilenceDuration: 0.4,
    minVoiceDuration: 0.3, detectClapSignals: true,
    clapThreshold: 0.75, padding: 0.1
  },
  setAutoCutOptions: (opts) => set((s) => ({ autoCutOptions: { ...s.autoCutOptions, ...opts } })),

  exportProgress: null,
  setExportProgress: (p) => set({ exportProgress: p }),

  loadProjectData: (data) => set((s) => ({
    project: data.project ? { ...s.project, ...data.project } : s.project,
    clips: data.clips ?? s.clips,
    tracks: data.tracks ?? s.tracks,
    mediaLibrary: data.mediaLibrary ?? s.mediaLibrary,
    markers: data.markers ?? s.markers,
    history: [], historyIndex: -1,
    selectedClipId: null, selectedClipIds: [],
    currentTime: 0, isPlaying: false
  }))
}))
