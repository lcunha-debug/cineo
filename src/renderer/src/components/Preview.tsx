import React, { useRef, useEffect, useCallback } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { formatTime } from '../utils/audioAnalyzer'
import type { TimelineClip } from '../types'

// ── Text overlay (draggable, animated) ───────────────────────────────────────
function TextOverlayEl({ clip, scale, containerRef }: { clip: TimelineClip; scale: number; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { updateClip, selectedClipId, setSelectedClip } = useEditorStore()
  const td = clip.textData
  if (!td) return null

  const isSelected = selectedClipId === clip.id
  const bgHex = td.backgroundOpacity > 0
    ? td.backgroundColor + Math.round(td.backgroundOpacity * 255).toString(16).padStart(2, '0')
    : 'transparent'
  const animClass = td.animation && td.animation !== 'none' ? `text-anim-${td.animation}` : ''

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedClip(clip.id)
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const startX = e.clientX; const startY = e.clientY
    const startTdX = td.x; const startTdY = td.y
    function onMove(ev: MouseEvent) {
      const dx = ((ev.clientX - startX) / rect.width) * 100
      const dy = ((ev.clientY - startY) / rect.height) * 100
      updateClip(clip.id, { textData: { ...td, x: Math.max(0, Math.min(100, startTdX + dx)), y: Math.max(0, Math.min(100, startTdY + dy)) } })
    }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleResizeDown(e: React.MouseEvent) {
    e.stopPropagation()
    const startX = e.clientX
    const startSize = td.fontSize
    function onMove(ev: MouseEvent) {
      const newSize = Math.max(8, Math.min(400, Math.round(startSize + (ev.clientX - startX))))
      updateClip(clip.id, { textData: { ...td, fontSize: newSize } })
    }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{ position: 'absolute', left: `${td.x}%`, top: `${td.y}%`, cursor: 'move', userSelect: 'none', zIndex: 10 }}
    >
      <div
        key={clip.id}
        className={animClass}
        style={{
          transform: 'translate(-50%, -50%)',
          fontSize: td.fontSize * scale,
          fontFamily: td.fontFamily,
          fontWeight: td.bold ? 700 : 400,
          fontStyle: td.italic ? 'italic' : 'normal',
          color: td.fontColor,
          background: bgHex,
          padding: td.backgroundOpacity > 0 ? `${4 * scale}px ${8 * scale}px` : 0,
          borderRadius: 4 * scale,
          textAlign: td.align,
          whiteSpace: 'pre-wrap',
          maxWidth: '80%',
          textShadow: '0 1px 4px rgba(0,0,0,0.6)',
          lineHeight: 1.2,
          outline: isSelected ? '1px dashed rgba(139,92,246,0.8)' : 'none',
          outlineOffset: 3,
          position: 'relative',
        }}
      >
        {td.text || ''}
        {isSelected && (
          <div
            onMouseDown={handleResizeDown}
            style={{ position: 'absolute', right: -6, bottom: -6, width: 10, height: 10, background: '#7c3aed', borderRadius: 2, cursor: 'se-resize', zIndex: 20 }}
          />
        )}
      </div>
    </div>
  )
}

// ── Animated sticker badge renderer ──────────────────────────────────────────
const ANIMATED_STICKER_META: Record<string, { icon: string; label: string }> = {
  subscribe:    { icon: '🔔', label: 'Inscreva-se' },
  like:         { icon: '👍', label: 'Curtir' },
  share:        { icon: '↗️', label: 'Compartilhar' },
  notification: { icon: '🔔', label: 'Notificação' },
  follow:       { icon: '❤️', label: 'Seguir' },
  comment:      { icon: '💬', label: 'Comentar' },
}

function AnimatedStickerBadge({ id, scale }: { id: string; scale: number }) {
  const meta = ANIMATED_STICKER_META[id]
  if (!meta) return <span style={{ fontSize: 80 * scale }}>{id}</span>
  return (
    <div className={`anim-sticker-wrap anim-${id}`} style={{ fontSize: 18 * scale }}>
      <div className="anim-sticker-badge">
        <span className="anim-sticker-icon">{meta.icon}</span>
        <span className="anim-sticker-label">{meta.label}</span>
      </div>
    </div>
  )
}

// ── Sticker overlay (draggable) ──────────────────────────────────────────────
function StickerOverlayEl({ clip, scale, containerRef }: { clip: TimelineClip; scale: number; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { updateClip, selectedClipId, setSelectedClip } = useEditorStore()
  const sd = clip.stickerData
  if (!sd) return null

  const isSelected = selectedClipId === clip.id

  const animMatch = sd.content.match(/^\[([a-z]+)\]$/)
  const animId = animMatch ? animMatch[1] : null

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedClip(clip.id)
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const startX = e.clientX; const startY = e.clientY
    const startSdX = sd.x; const startSdY = sd.y
    function onMove(ev: MouseEvent) {
      const dx = ((ev.clientX - startX) / rect.width) * 100
      const dy = ((ev.clientY - startY) / rect.height) * 100
      updateClip(clip.id, { stickerData: { ...sd, x: Math.max(0, Math.min(100, startSdX + dx)), y: Math.max(0, Math.min(100, startSdY + dy)) } })
    }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleResizeDown(e: React.MouseEvent) {
    e.stopPropagation()
    const startX = e.clientX
    const startScale = sd.scale
    function onMove(ev: MouseEvent) {
      const newScale = Math.max(0.1, Math.min(8, startScale + (ev.clientX - startX) * 0.02))
      updateClip(clip.id, { stickerData: { ...sd, scale: Math.round(newScale * 100) / 100 } })
    }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        left: `${sd.x}%`,
        top: `${sd.y}%`,
        transform: `translate(-50%, -50%) scale(${sd.scale}) rotate(${sd.rotation}deg)`,
        fontSize: animId ? undefined : 80 * scale,
        opacity: sd.opacity,
        cursor: 'move',
        userSelect: 'none',
        lineHeight: 1,
        zIndex: 11,
        outline: isSelected ? '1px dashed rgba(139,92,246,0.8)' : 'none',
        outlineOffset: 3,
      }}
    >
      {animId
        ? <AnimatedStickerBadge id={animId} scale={scale} />
        : sd.content
      }
      {isSelected && (
        <div
          onMouseDown={handleResizeDown}
          style={{ position: 'absolute', right: -8, bottom: -8, width: 12, height: 12, background: '#7c3aed', borderRadius: 2, cursor: 'se-resize', zIndex: 20, transform: `scale(${1 / sd.scale})` }}
        />
      )}
    </div>
  )
}

// ── Preview ──────────────────────────────────────────────────────────────────
export function Preview(): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const lastSrcRef = useRef('')
  const isPlayingRef = useRef(false)

  const {
    currentTime, isPlaying, setCurrentTime, setIsPlaying,
    project, clips, mediaLibrary, tracks
  } = useEditorStore()

  const scale = 0.3

  const activeVideoClip = clips
    .filter((c) => (c.type === 'video' || c.type === 'image') && !isHiddenTrack(c))
    .find((c) => currentTime >= c.startTime && currentTime < c.startTime + c.duration)

  const activeMedia = activeVideoClip ? mediaLibrary.find((m) => m.id === activeVideoClip.mediaId) : undefined

  const overlayClips = clips.filter((c) =>
    !isHiddenTrack(c) &&
    currentTime >= c.startTime &&
    currentTime < c.startTime + c.duration &&
    (c.type === 'text' || c.type === 'sticker')
  )

  function isHiddenTrack(clip: TimelineClip) {
    const { tracks } = useEditorStore.getState()
    const track = tracks.find((t) => t.id === clip.trackId)
    return track?.hidden ?? false
  }

  // Keep a ref so loadedmetadata callback always sees current isPlaying
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  // ── Load src only when the media file changes ─────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeMedia) return
    const targetSrc = `file:///${activeMedia.path.replace(/\\/g, '/')}`
    if (lastSrcRef.current === targetSrc) return   // already loaded — don't reload
    lastSrcRef.current = targetSrc
    video.src = targetSrc
    video.load()
    video.addEventListener('loadedmetadata', () => {
      const clip = useEditorStore.getState().clips.find((c) => c.mediaId === activeMedia.id && (c.type === 'video' || c.type === 'image'))
      const mediaTime = clip ? Math.max(0, useEditorStore.getState().currentTime - clip.startTime + (clip.mediaOffset ?? 0)) : 0
      video.currentTime = mediaTime
      if (isPlayingRef.current) video.play().catch(() => {})
    }, { once: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMedia?.id])

  // ── Seek when user scrubs (not during playback — RAF handles sync then) ───
  useEffect(() => {
    if (isPlaying) return
    const video = videoRef.current
    if (!video || !activeVideoClip) return
    const mediaTime = Math.max(0, currentTime - activeVideoClip.startTime + (activeVideoClip.mediaOffset ?? 0))
    if (Math.abs(video.currentTime - mediaTime) > 0.15) video.currentTime = mediaTime
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime])

  // ── Play / pause ──────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) video.play().catch(() => {})
    else video.pause()
  }, [isPlaying])

  // ── Speed, volume, mute ───────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeVideoClip) return
    video.playbackRate = activeVideoClip.speed || 1
    const track = tracks.find((t) => t.id === activeVideoClip.trackId)
    video.muted = track?.muted ?? false
    video.volume = Math.min(1, activeVideoClip.volume ?? 1)
  }, [activeVideoClip, tracks])

  // ── RAF ticker — keeps timeline currentTime in sync with video ────────────
  const tick = useCallback(() => {
    const video = videoRef.current
    const { clips: storeClips, currentTime: ct, project: proj, setCurrentTime: sct, setIsPlaying: sip } = useEditorStore.getState()
    const clip = storeClips.find((c) => (c.type === 'video' || c.type === 'image') && ct >= c.startTime && ct < c.startTime + c.duration)
    if (!video || !clip) return
    const timelineTime = clip.startTime + video.currentTime - (clip.mediaOffset ?? 0)
    if (timelineTime >= proj.duration) {
      sip(false); sct(proj.duration); return
    }
    sct(timelineTime)
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    if (isPlaying) rafRef.current = requestAnimationFrame(tick)
    else cancelAnimationFrame(rafRef.current)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, tick])

  // CSS filter from color correction
  const cc = activeVideoClip?.colorCorrection
  const videoFilter = cc
    ? `brightness(${cc.brightness}) contrast(${cc.contrast}) saturate(${cc.saturation}) hue-rotate(${cc.hue}deg)`
    : undefined

  const aspectRatio = `${project.width} / ${project.height}`

  return (
    <div className="editor-center">
      <div className="preview-area">
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            ref={frameRef}
            style={{
              position: 'relative',
              aspectRatio,
              maxWidth: '100%',
              maxHeight: '100%',
              width: '100%',
              background: '#000',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {activeMedia ? (
              activeMedia.type === 'image' ? (
                <img
                  src={`file:///${activeMedia.path.replace(/\\/g, '/')}`}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'contain', filter: videoFilter }}
                />
              ) : (
                <video
                  ref={videoRef}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', filter: videoFilter }}
                />
              )
            ) : (
              <div className="preview-no-clip">
                <div className="preview-no-clip-icon">
                  <svg width="56" height="56" viewBox="0 0 64 64" fill="none">
                    <rect x="8" y="16" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="2"/>
                    <path d="M24 32L40 24V40L24 32Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span style={{ fontSize: 13, color: '#22223a', marginTop: 8 }}>Adicione clipes na timeline</span>
              </div>
            )}

            {overlayClips.map((clip) =>
              clip.type === 'text'
                ? <TextOverlayEl key={clip.id} clip={clip} scale={scale} containerRef={frameRef} />
                : <StickerOverlayEl key={clip.id} clip={clip} scale={scale} containerRef={frameRef} />
            )}

            <div style={{ position: 'absolute', bottom: 8, right: 10, fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.55)', padding: '2px 8px', borderRadius: 5, pointerEvents: 'none' }}>
              {formatTime(currentTime)} / {formatTime(project.duration)}
            </div>
          </div>
        </div>
      </div>

      <div className="preview-controls">
        <button className="preview-btn" onClick={() => { setCurrentTime(0); setIsPlaying(false) }} title="Início">
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
          </svg>
        </button>

        <button className="preview-btn" onClick={() => setCurrentTime(Math.max(0, currentTime - 5))} title="-5s">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zm-5 0a1 1 0 000 1.6l5.333 4A1 1 0 0014 16V8a1 1 0 00-1.6-.8l-5.334 4z"/>
          </svg>
        </button>

        <button className="preview-play-btn" onClick={() => setIsPlaying(!isPlaying)} title={isPlaying ? 'Pausar' : 'Play'}>
          {isPlaying
            ? <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            : <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z"/></svg>
          }
        </button>

        <button className="preview-btn" onClick={() => setCurrentTime(Math.min(project.duration, currentTime + 5))} title="+5s">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zm5 0a1 1 0 000-1.6l-5.333-4A1 1 0 0010 8v8a1 1 0 001.6.8l5.333-4z"/>
          </svg>
        </button>

        <div className="toolbar-divider" />

        <span className="preview-time">{formatTime(currentTime)}</span>
        <input
          className="preview-scrubber"
          type="range"
          min={0}
          max={project.duration || 1}
          step={0.01}
          value={currentTime}
          onChange={(e) => { setIsPlaying(false); setCurrentTime(Number(e.target.value)) }}
        />
        <span className="preview-time">{formatTime(project.duration)}</span>

        {activeVideoClip && activeVideoClip.speed !== 1 && (
          <div style={{ padding: '2px 7px', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 5, fontSize: 10, color: '#fbbf24', fontWeight: 700 }}>
            {activeVideoClip.speed}x
          </div>
        )}
      </div>
    </div>
  )
}
