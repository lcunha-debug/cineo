import React, { useRef, useCallback, useEffect, useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { secondsToPixels, pixelsToSeconds, formatTime } from '../utils/audioAnalyzer'
import type { TimelineClip, Track, Marker } from '../types'

const RULER_H = 28
const MARKER_H = 20
const LABEL_W = 88

// ── Snap helpers ────────────────────────────────────────────────────────────
function getSnapPoints(clips: TimelineClip[], markers: Marker[], excludeId: string): number[] {
  const pts = new Set<number>([0])
  markers.forEach((m) => pts.add(m.time))
  clips.forEach((c) => { if (c.id !== excludeId) { pts.add(c.startTime); pts.add(c.startTime + c.duration) } })
  return Array.from(pts)
}

function snap(value: number, points: number[], zoom: number, threshold = 10): number {
  const threshSec = threshold / zoom
  let best = value
  let bestDist = threshSec
  for (const p of points) {
    const d = Math.abs(value - p)
    if (d < bestDist) { bestDist = d; best = p }
  }
  return best
}

// ── Waveform rendering ───────────────────────────────────────────────────────
function WaveformBars({ data, width, height }: { data: number[]; width: number; height: number }) {
  if (!data || data.length === 0) return null
  const bars = Math.min(data.length, Math.floor(width / 2))
  const step = data.length / bars
  const mid = height / 2
  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const val = data[Math.floor(i * step)] ?? 0
        const h = Math.max(1, val * mid * 0.9)
        return <rect key={i} x={i * 2} y={mid - h} width={1.5} height={h * 2} fill="rgba(255,255,255,0.7)" rx="0.5" />
      })}
    </svg>
  )
}

// ── Clip component ───────────────────────────────────────────────────────────
function Clip({
  clip, zoom, isSelected, track,
  onClick, onMoveStart, onResizeStart
}: {
  clip: TimelineClip; zoom: number; isSelected: boolean; track?: Track
  onClick: () => void
  onMoveStart: (e: React.MouseEvent) => void
  onResizeStart: (e: React.MouseEvent, side: 'left' | 'right') => void
}) {
  const left = secondsToPixels(clip.startTime, zoom)
  const width = Math.max(secondsToPixels(clip.duration, zoom), 6)
  const isLocked = track?.locked
  const isMuted = track?.muted
  const isHidden = track?.hidden

  if (isHidden) return null

  return (
    <div
      className={`timeline-clip${isSelected ? ' selected' : ''}${isLocked ? ' locked' : ''}`}
      style={{ left, width, backgroundColor: clip.color + (isMuted ? '55' : 'cc'), opacity: isMuted ? 0.5 : 1 }}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseDown={isLocked ? undefined : onMoveStart}
      title={clip.name}
    >
      {!isLocked && (
        <div className="resize-handle resize-handle-left"
          onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, 'left') }} />
      )}

      {/* Thumbnail for video clips */}
      {clip.type === 'video' && (() => {
        const { mediaLibrary } = useEditorStore.getState()
        const media = mediaLibrary.find((m) => m.id === clip.mediaId)
        if (media?.thumbnail) return (
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${media.thumbnail})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.25 }} />
        )
        return null
      })()}

      {/* Waveform for audio */}
      {clip.type === 'audio' && clip.waveformData && (
        <WaveformBars data={clip.waveformData} width={width} height={track?.height ?? 48} />
      )}

      <div className="timeline-clip-label">{clip.name}</div>

      {/* Speed badge */}
      {clip.speed !== 1 && (
        <div style={{ position: 'absolute', top: 3, right: 18, fontSize: 9, background: 'rgba(0,0,0,0.6)', color: '#fbbf24', padding: '1px 4px', borderRadius: 3 }}>
          {clip.speed}x
        </div>
      )}

      {/* Fade indicators */}
      {clip.fadeIn > 0 && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.min(secondsToPixels(clip.fadeIn, zoom), width / 2), background: 'linear-gradient(to right, rgba(0,0,0,0.5), transparent)', pointerEvents: 'none' }} />
      )}
      {clip.fadeOut > 0 && (
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: Math.min(secondsToPixels(clip.fadeOut, zoom), width / 2), background: 'linear-gradient(to left, rgba(0,0,0,0.5), transparent)', pointerEvents: 'none' }} />
      )}

      {!isLocked && (
        <div className="resize-handle resize-handle-right"
          onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, 'right') }} />
      )}
    </div>
  )
}

// ── Marker bar ───────────────────────────────────────────────────────────────
function MarkerBar({ markers, zoom, onAdd, onRemove, scrollWidth }: {
  markers: Marker[]; zoom: number; onAdd: (t: number) => void; onRemove: (id: string) => void; scrollWidth: number
}) {
  const [hovering, setHovering] = useState<number | null>(null)

  return (
    <div
      style={{ height: MARKER_H, position: 'relative', width: scrollWidth, minWidth: '100%', background: 'rgba(8,6,18,0.7)', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'crosshair' }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setHovering(pixelsToSeconds(e.clientX - rect.left, zoom))
      }}
      onMouseLeave={() => setHovering(null)}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        onAdd(Math.max(0, pixelsToSeconds(e.clientX - rect.left, zoom)))
      }}
    >
      {hovering !== null && (
        <div style={{ position: 'absolute', left: secondsToPixels(hovering, zoom), top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.15)', pointerEvents: 'none' }} />
      )}
      {markers.map((m) => (
        <div
          key={m.id}
          style={{ position: 'absolute', left: secondsToPixels(m.time, zoom), top: 2, bottom: 2, width: 12, cursor: 'pointer', zIndex: 5 }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); onRemove(m.id) }}
          title={m.name || formatTime(m.time) + ' (clique direito para remover)'}
        >
          <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `10px solid ${m.color}` }} />
          {m.name && (
            <div style={{ position: 'absolute', top: 11, left: -20, fontSize: 8, color: m.color, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{m.name}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Track row ────────────────────────────────────────────────────────────────
function TrackRow({
  track, zoom, clips, selectedClipId, snapEnabled, markers, allClips,
  onClipSelect, onDropMedia, onMoveClip, onResizeClip
}: {
  track: Track; zoom: number; clips: TimelineClip[]; selectedClipId: string | null
  snapEnabled: boolean; markers: Marker[]; allClips: TimelineClip[]
  onClipSelect: (id: string | null) => void
  onDropMedia: (trackId: string, time: number, mediaId: string) => void
  onMoveClip: (id: string, newStart: number, trackId?: string) => void
  onResizeClip: (id: string, dur: number, side: 'left' | 'right', newStart: number) => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{
    type: 'move' | 'resize'; clipId: string; side?: 'left' | 'right'
    startX: number; originalStart: number; originalDuration: number
  } | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent, clip: TimelineClip, type: 'move' | 'resize', side?: 'left' | 'right') => {
    if (e.button !== 0 || track.locked) return
    e.preventDefault()
    dragState.current = { type, clipId: clip.id, side, startX: e.clientX, originalStart: clip.startTime, originalDuration: clip.duration }
  }, [track.locked])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const ds = dragState.current
      if (!ds) return
      const dx = e.clientX - ds.startX
      const dt = pixelsToSeconds(dx, zoom)
      const snapPts = snapEnabled ? getSnapPoints(allClips, markers, ds.clipId) : []

      if (ds.type === 'move') {
        const raw = Math.max(0, ds.originalStart + dt)
        onMoveClip(ds.clipId, snapEnabled ? snap(raw, snapPts, zoom) : raw)
      } else if (ds.type === 'resize' && ds.side === 'right') {
        onResizeClip(ds.clipId, Math.max(0.1, ds.originalDuration + dt), 'right', ds.originalStart)
      } else if (ds.type === 'resize' && ds.side === 'left') {
        const newStart = ds.originalStart + dt
        onResizeClip(ds.clipId, Math.max(0.1, ds.originalDuration - dt), 'left', newStart)
      }
    }
    function onMouseUp() { dragState.current = null }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [zoom, snapEnabled, markers, allClips, onMoveClip, onResizeClip])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const mediaId = e.dataTransfer.getData('mediaId')
    if (!mediaId || !rowRef.current) return
    const rect = rowRef.current.getBoundingClientRect()
    onDropMedia(track.id, Math.max(0, pixelsToSeconds(e.clientX - rect.left, zoom)), mediaId)
  }

  if (track.hidden) return <div style={{ height: 0, overflow: 'hidden' }} />

  const totalWidth = secondsToPixels(Math.max(...allClips.map((c) => c.startTime + c.duration), 60) + 20, zoom)

  return (
    <div
      ref={rowRef}
      className="timeline-track-row"
      style={{ height: track.height, minWidth: totalWidth }}
      onClick={() => onClipSelect(null)}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDrop={handleDrop}
    >
      {clips.map((clip) => (
        <Clip
          key={clip.id}
          clip={clip}
          zoom={zoom}
          track={track}
          isSelected={selectedClipId === clip.id}
          onClick={() => onClipSelect(clip.id)}
          onMoveStart={(e) => handleMouseDown(e, clip, 'move')}
          onResizeStart={(e, side) => handleMouseDown(e, clip, 'resize', side)}
        />
      ))}
    </div>
  )
}

// ── Track label ──────────────────────────────────────────────────────────────
function TrackLabel({
  track,
  onToggleMute, onToggleLock, onToggleHide, onRename, onRemove
}: {
  track: Track
  onToggleMute: () => void; onToggleLock: () => void
  onToggleHide: () => void; onRename: (n: string) => void; onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(track.name)
  const inputRef = useRef<HTMLInputElement>(null)

  function commitRename() {
    setEditing(false)
    if (name.trim()) onRename(name.trim())
    else setName(track.name)
  }

  if (track.hidden) return <div style={{ height: 0, overflow: 'hidden' }} />

  return (
    <div className="track-label-row" style={{ height: track.height }}>
      <div style={{ width: 5, height: '60%', borderRadius: 2, background: track.type === 'video' ? '#60a5fa' : '#34d399', flexShrink: 0, marginRight: 5 }} />
      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditing(false); setName(track.name) } }}
          autoFocus
          style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 4, color: '#e0e0ff', fontSize: 10, padding: '1px 4px', outline: 'none' }}
        />
      ) : (
        <span
          style={{ flex: 1, fontSize: 10, color: '#8888aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
          onDoubleClick={() => setEditing(true)}
        >{track.name}</span>
      )}
      <div className="track-label-controls">
        <button className={`tl-icon-btn${track.muted ? ' active-red' : ''}`} onClick={onToggleMute} title={track.muted ? 'Ativar som' : 'Silenciar'}>
          {track.muted
            ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            : <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          }
        </button>
        <button className={`tl-icon-btn${track.locked ? ' active-yellow' : ''}`} onClick={onToggleLock} title={track.locked ? 'Desbloquear' : 'Bloquear'}>
          {track.locked
            ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            : <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          }
        </button>
        <button className={`tl-icon-btn${track.hidden ? ' active-dim' : ''}`} onClick={onToggleHide} title={track.hidden ? 'Mostrar' : 'Ocultar'}>
          {track.hidden
            ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            : <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
          }
        </button>
      </div>
    </div>
  )
}

// ── Main Timeline ────────────────────────────────────────────────────────────
export function Timeline(): React.ReactElement {
  const {
    tracks, clips, zoom, setZoom, currentTime, setCurrentTime,
    project, selectedClipId, setSelectedClip, snapEnabled, setSnapEnabled,
    addClipToTimeline, moveClip, resizeClip, removeClip, addTrack,
    splitAtPlayhead, duplicateClip, copyClip, pasteClip,
    markers, addMarker, removeMarker,
    toggleTrackMuted, toggleTrackLocked, toggleTrackHidden, renameTrack, removeTrack,
    isPlaying, setIsPlaying, undo, redo
  } = useEditorStore()

  const scrollRef = useRef<HTMLDivElement>(null)
  const playheadLeft = secondsToPixels(currentTime, zoom)
  const scrollWidth = secondsToPixels(Math.max(project.duration + 20, 60), zoom)

  // Keep playhead visible while playing; also when user seeks while paused
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const { scrollLeft, clientWidth } = container
    if (isPlaying) {
      // Scroll forward when playhead reaches 70% of view
      if (playheadLeft > scrollLeft + clientWidth * 0.7) {
        container.scrollLeft = playheadLeft - clientWidth * 0.2
      }
    } else {
      // Snap into view when scrubbing while paused
      if (playheadLeft < scrollLeft || playheadLeft > scrollLeft + clientWidth - 20) {
        container.scrollLeft = Math.max(0, playheadLeft - clientWidth * 0.3)
      }
    }
  }, [playheadLeft, isPlaying])

  function handleRulerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!scrollRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    setCurrentTime(Math.max(0, Math.min(project.duration, pixelsToSeconds(x, zoom))))
    setIsPlaying(false)
  }

  function handleMoveClip(id: string, newStart: number, trackId?: string) {
    moveClip(id, newStart, trackId)
  }
  function handleResizeClip(id: string, dur: number, side: 'left' | 'right', newStart: number) {
    resizeClip(id, dur)
    if (side === 'left') moveClip(id, Math.max(0, newStart))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return
    const key = e.key
    if (key === 'Delete' || key === 'Backspace') {
      if (selectedClipId) { removeClip(selectedClipId); setSelectedClip(null) }
    }
    if (key === ' ') { e.preventDefault(); setIsPlaying(!isPlaying) }
    if (key === 's' || key === 'S') splitAtPlayhead()
    if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); undo() }
    if ((e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))) { e.preventDefault(); redo() }
    if ((e.ctrlKey || e.metaKey) && key === 'c' && selectedClipId) copyClip(selectedClipId)
    if ((e.ctrlKey || e.metaKey) && key === 'v') pasteClip()
    if ((e.ctrlKey || e.metaKey) && key === 'd' && selectedClipId) duplicateClip(selectedClipId)
    if (key === 'm') addMarker(currentTime, '', MARKER_COLORS[markers.length % MARKER_COLORS.length])
    if (key === 'ArrowLeft') setCurrentTime(Math.max(0, currentTime - (e.shiftKey ? 5 : 1/30)))
    if (key === 'ArrowRight') setCurrentTime(Math.min(project.duration, currentTime + (e.shiftKey ? 5 : 1/30)))
    if (key === 'Home') setCurrentTime(0)
    if (key === 'End') setCurrentTime(project.duration)
  }

  const MARKER_COLORS = ['#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899']
  const selectedClip = clips.find((c) => c.id === selectedClipId)

  return (
    <div className="timeline-root outline-none" style={{ height: '100%' }} tabIndex={0} onKeyDown={handleKeyDown}>
      {/* Toolbar */}
      <div className="timeline-toolbar">
        <button className="tl-btn" onClick={() => setIsPlaying(!isPlaying)} title="Play/Pause (Espaço)">
          {isPlaying
            ? <svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            : <svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          }
        </button>
        <button className="tl-btn" onClick={() => { setCurrentTime(0); setIsPlaying(false) }} title="Início (Home)">
          <svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <span className="tl-time" style={{ fontFamily: 'monospace' }}>{formatTime(currentTime)}</span>
        <div className="tl-divider" />

        <button className="tl-btn" onClick={undo} title="Desfazer (Ctrl+Z)">
          <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 0 1 0 16H7M3 10l4-4M3 10l4 4"/></svg>
        </button>
        <button className="tl-btn" onClick={redo} title="Refazer (Ctrl+Y)">
          <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 0 0 0 16h6M21 10l-4-4M21 10l-4 4"/></svg>
        </button>
        <button className="tl-btn" onClick={splitAtPlayhead} title="Dividir na posição atual (S)">
          <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v20M2 12h4M18 12h4"/></svg>
        </button>
        <button className="tl-btn" onClick={() => selectedClipId && duplicateClip(selectedClipId)} title="Duplicar clipe (Ctrl+D)" disabled={!selectedClipId}>
          <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2"/></svg>
        </button>

        <div className="tl-divider" />

        <button className={`tl-btn${snapEnabled ? ' active-snap' : ''}`} onClick={() => setSnapEnabled(!snapEnabled)} title="Snap magnético">
          <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
        </button>
        <button className="tl-btn" onClick={() => addMarker(currentTime, '', MARKER_COLORS[markers.length % MARKER_COLORS.length])} title="Adicionar marcador (M)">
          <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z"/><circle cx="12" cy="11" r="3" stroke="currentColor" strokeWidth="2"/></svg>
        </button>

        <div className="tl-divider" />

        <button className="tl-btn" onClick={() => addTrack('video')} title="Nova faixa de vídeo" style={{ width: 'auto', padding: '0 7px', fontSize: 9 }}>+ Vídeo</button>
        <button className="tl-btn" onClick={() => addTrack('audio')} title="Nova faixa de áudio" style={{ width: 'auto', padding: '0 7px', fontSize: 9 }}>+ Áudio</button>

        <div style={{ flex: 1 }} />

        <div className="flex items-center gap-1">
          <button className="tl-btn" onClick={() => setZoom(zoom / 1.5)} title="Diminuir zoom">
            <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"/></svg>
          </button>
          <span className="tl-time" style={{ width: 48, textAlign: 'center' }}>{Math.round(zoom)}px/s</span>
          <button className="tl-btn" onClick={() => setZoom(zoom * 1.5)} title="Aumentar zoom">
            <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="timeline-area">
        {/* Labels column */}
        <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
          {/* Ruler offset */}
          <div style={{ height: RULER_H + MARKER_H, background: 'rgba(10,8,20,0.6)', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }} />
          {/* Track labels */}
          <div style={{ overflowY: 'hidden', flex: 1 }}>
            {tracks.map((track) => (
              <TrackLabel
                key={track.id}
                track={track}
                onToggleMute={() => toggleTrackMuted(track.id)}
                onToggleLock={() => toggleTrackLocked(track.id)}
                onToggleHide={() => toggleTrackHidden(track.id)}
                onRename={(n) => renameTrack(track.id, n)}
                onRemove={() => removeTrack(track.id)}
              />
            ))}
          </div>
        </div>

        {/* Scrollable area */}
        <div ref={scrollRef} className="timeline-scroll">
          <div style={{ width: scrollWidth, minWidth: '100%', position: 'relative' }}>
            {/* Ruler */}
            <div className="timeline-ruler cursor-crosshair" onClick={handleRulerClick}>
              <TimelineRuler zoom={zoom} duration={project.duration} />
            </div>

            {/* Marker bar */}
            <MarkerBar
              markers={markers} zoom={zoom} scrollWidth={scrollWidth}
              onAdd={(t) => addMarker(t, '', MARKER_COLORS[markers.length % MARKER_COLORS.length])}
              onRemove={removeMarker}
            />

            {/* Playhead — extends through all tracks */}
            <div className="playhead" style={{ left: playheadLeft }} />

            {/* Marker lines extending through tracks */}
            {markers.map((m) => (
              <div key={m.id} style={{ position: 'absolute', left: secondsToPixels(m.time, zoom), top: RULER_H + MARKER_H, bottom: 0, width: 1, background: m.color + '55', pointerEvents: 'none', zIndex: 5 }} />
            ))}

            {/* Track rows */}
            {tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                zoom={zoom}
                clips={clips.filter((c) => c.trackId === track.id)}
                allClips={clips}
                selectedClipId={selectedClipId}
                snapEnabled={snapEnabled}
                markers={markers}
                onClipSelect={setSelectedClip}
                onDropMedia={(trackId, time, mediaId) => addClipToTimeline(mediaId, trackId, time)}
                onMoveClip={handleMoveClip}
                onResizeClip={handleResizeClip}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Selected clip info bar */}
      {selectedClip && (
        <div style={{ padding: '5px 12px', background: 'rgba(10,8,20,0.95)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 14, fontSize: 10, color: '#55557a', flexShrink: 0 }}>
          <span style={{ color: '#aaaacc', fontWeight: 600 }}>{selectedClip.name}</span>
          <span>Início: <b style={{ color: '#d0d0f0', fontFamily: 'monospace' }}>{formatTime(selectedClip.startTime)}</b></span>
          <span>Dur: <b style={{ color: '#d0d0f0', fontFamily: 'monospace' }}>{formatTime(selectedClip.duration)}</b></span>
          <span>Fim: <b style={{ color: '#d0d0f0', fontFamily: 'monospace' }}>{formatTime(selectedClip.startTime + selectedClip.duration)}</b></span>
          {selectedClip.speed !== 1 && <span style={{ color: '#fbbf24' }}>{selectedClip.speed}x</span>}
          {selectedClip.volume !== 1 && <span style={{ color: '#60a5fa' }}>vol {Math.round(selectedClip.volume * 100)}%</span>}
          <button onClick={() => { copyClip(selectedClip.id) }} style={{ background: 'none', border: 'none', color: '#8888aa', cursor: 'pointer', fontSize: 10 }}>Copiar</button>
          <button onClick={() => duplicateClip(selectedClip.id)} style={{ background: 'none', border: 'none', color: '#8888aa', cursor: 'pointer', fontSize: 10 }}>Duplicar</button>
          <button onClick={() => splitAtPlayhead()} style={{ background: 'none', border: 'none', color: '#8888aa', cursor: 'pointer', fontSize: 10 }}>Dividir</button>
          <button onClick={() => { removeClip(selectedClip.id); setSelectedClip(null) }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Excluir (Del)
          </button>
        </div>
      )}
    </div>
  )
}

function TimelineRuler({ zoom, duration }: { zoom: number; duration: number }) {
  const totalWidth = secondsToPixels(Math.max(duration + 20, 60), zoom)
  const step = zoom >= 200 ? 0.5 : zoom >= 100 ? 1 : zoom >= 50 ? 2 : zoom >= 20 ? 5 : 10
  const ticks: number[] = []
  for (let t = 0; t <= Math.ceil(duration + 20); t += step) ticks.push(t)
  return (
    <div style={{ position: 'relative', flexShrink: 0, overflow: 'hidden', height: RULER_H }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: totalWidth, height: RULER_H }}>
        {ticks.map((t) => (
          <div key={t} style={{ position: 'absolute', bottom: 0, left: secondsToPixels(t, zoom), display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 8.5, color: '#44446a', fontFamily: 'monospace', marginBottom: 3, userSelect: 'none', whiteSpace: 'nowrap' }}>{formatTime(t)}</span>
            <div style={{ width: 1, height: t % (step * 5) === 0 ? 8 : 5, background: t % (step * 5) === 0 ? '#33334a' : '#1e1e2e' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
