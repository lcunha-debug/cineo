import React from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useEditorStore } from '../store/useEditorStore'
import { generateWaveformData } from '../utils/audioAnalyzer'
import type { MediaClip, MediaType } from '../types'

function getMediaTypeIcon(type: MediaType) {
  if (type === 'video') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="6" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M16 10l5-3v10l-5-3v-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  )
  if (type === 'audio') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
      <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function formatSize(bytes: number) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  return (bytes / 1e3).toFixed(0) + ' KB'
}

export function MediaPanel(): React.ReactElement {
  const { mediaLibrary, addMedia, removeMedia, tracks, addClipToTimeline } = useEditorStore()
  const [loading, setLoading] = React.useState(false)
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [errors, setErrors] = React.useState<string[]>([])

  async function importMedia() {
    setLoading(true)
    setErrors([])
    const newErrors: string[] = []
    try {
      const paths = await window.electron.openMediaDialog()
      for (const p of paths) {
        const name = p.split(/[\\/]/).pop() ?? p
        const ext = name.split('.').pop()?.toLowerCase() ?? ''

        const extType: MediaType = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v'].includes(ext)
          ? 'video'
          : ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus'].includes(ext)
          ? 'audio'
          : 'image'

        let meta: { duration: number; width: number; height: number; fps: number; hasVideo: boolean; hasAudio: boolean; size: number; bitrate: number }
        try {
          meta = await window.electron.getMediaMetadata(p)
        } catch {
          newErrors.push(`${name}: não foi possível ler o arquivo.`)
          continue
        }

        // Validate: video file must actually have a video stream
        if (extType === 'video' && !meta.hasVideo) {
          newErrors.push(`${name}: arquivo não contém stream de vídeo válido.`)
          continue
        }

        // Validate: file must have positive duration (except images)
        if (extType !== 'image' && meta.duration <= 0) {
          newErrors.push(`${name}: duração inválida — arquivo pode estar corrompido.`)
          continue
        }

        const type: MediaType = extType === 'video' && !meta.hasVideo ? 'audio' : extType

        let thumbnail: string | undefined
        if (type === 'video') {
          try { thumbnail = await window.electron.generateThumbnail(p, Math.min(1, meta.duration * 0.1)) }
          catch { thumbnail = undefined }
        }

        // Only generate waveform for audio files — video files can be too large
        let waveformData: number[] | undefined
        if (type === 'audio') {
          waveformData = await generateWaveformData(p, 400)
          if (waveformData.length === 0) waveformData = undefined
        }

        const clip: MediaClip = {
          id: uuidv4(), name, path: p, type,
          duration: meta.duration, width: meta.width, height: meta.height,
          fps: meta.fps, thumbnail, hasVideo: meta.hasVideo, hasAudio: meta.hasAudio,
          fileSize: meta.size, waveformData
        }
        addMedia(clip)
      }
    } finally {
      setLoading(false)
      if (newErrors.length > 0) setErrors(newErrors)
    }
  }

  function handleDragStart(e: React.DragEvent, clip: MediaClip) {
    setDraggingId(clip.id)
    e.dataTransfer.setData('mediaId', clip.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  function handleDoubleClick(clip: MediaClip) {
    const trackType = clip.type === 'audio' ? 'audio' : 'video'
    const track = tracks.find((t) => t.type === trackType)
    if (!track) return
    const { clips } = useEditorStore.getState()
    const trackClips = clips.filter((c) => c.trackId === track.id)
    const endTime = trackClips.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0)
    addClipToTimeline(clip.id, track.id, endTime)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        <span className="panel-title">Mídia</span>
        <button className="panel-import-btn" onClick={importMedia} disabled={loading}>
          {loading
            ? <><span className="login-spinner" style={{ width: 10, height: 10, marginRight: 4 }} />Importando...</>
            : '+ Importar'}
        </button>
      </div>

      {errors.length > 0 && (
        <div style={{ margin: '6px 10px 0', padding: '7px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, fontSize: 10, color: '#fca5a5' }}>
          {errors.map((e, i) => <div key={i}>{e}</div>)}
          <button onClick={() => setErrors([])} style={{ marginTop: 4, background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 10, padding: 0 }}>Fechar</button>
        </div>
      )}

      <div className="panel-body">
        {mediaLibrary.length === 0 ? (
          <div className="media-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Importe vídeos, áudios<br/>ou imagens</span>
          </div>
        ) : (
          mediaLibrary.map((clip) => (
            <div
              key={clip.id}
              className={`media-item${draggingId === clip.id ? ' opacity-50' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, clip)}
              onDragEnd={() => setDraggingId(null)}
              onDoubleClick={() => handleDoubleClick(clip)}
              title={`${clip.name}\n${clip.type === 'image' ? '' : formatDuration(clip.duration) + ' · '}${formatSize(clip.fileSize)}${clip.width ? ` · ${clip.width}×${clip.height}` : ''}`}
            >
              <div className="media-item-thumb">
                {clip.thumbnail ? (
                  <img src={clip.thumbnail} alt="" />
                ) : (
                  <span style={{ color: '#33334d' }}>{getMediaTypeIcon(clip.type)}</span>
                )}
              </div>
              <div className="media-item-info">
                <div className="media-item-name">{clip.name}</div>
                <div className="media-item-dur" style={{ display: 'flex', gap: 6 }}>
                  {clip.type !== 'image' && <span>{formatDuration(clip.duration)}</span>}
                  {clip.width > 0 && <span style={{ color: '#33334d' }}>{clip.width}×{clip.height}</span>}
                  <span style={{ color: '#2a2a40' }}>{formatSize(clip.fileSize)}</span>
                </div>
              </div>
              <button
                className="media-item-del"
                onClick={(e) => { e.stopPropagation(); removeMedia(clip.id) }}
                title="Remover"
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
