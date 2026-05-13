import React, { useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useAuthStore } from '../store/useAuthStore'
import type { ExportFormat, ExportOptions, ExportClipData } from '../types'

const FORMATS: { id: ExportFormat; label: string; icon: string; pro?: boolean }[] = [
  { id: 'mp4',  label: 'MP4',  icon: '🎬' },
  { id: 'mov',  label: 'MOV',  icon: '🎥' },
  { id: 'mkv',  label: 'MKV',  icon: '📦' },
  { id: 'webm', label: 'WebM', icon: '🌐' },
  { id: 'avi',  label: 'AVI',  icon: '💾' },
  { id: 'gif',  label: 'GIF',  icon: '✨' },
  { id: 'mp3',  label: 'MP3',  icon: '🎵' },
  { id: 'wav',  label: 'WAV',  icon: '🔊' },
]

const RESOLUTIONS = [
  { label: '8K',       w: 7680, h: 4320, pro: true },
  { label: '4K',       w: 3840, h: 2160, pro: true },
  { label: '2K',       w: 2560, h: 1440, pro: false },
  { label: '1080p',    w: 1920, h: 1080, pro: false },
  { label: '720p',     w: 1280, h: 720,  pro: false },
  { label: '480p',     w: 854,  h: 480,  pro: false },
  { label: 'Shorts',   w: 1080, h: 1920, pro: false },
  { label: 'Quadrado', w: 1080, h: 1080, pro: false },
]

interface Props { onClose: () => void }

export function ExportModal({ onClose }: Props): React.ReactElement {
  const { clips, mediaLibrary, tracks, project, setExportProgress, exportProgress } = useEditorStore()
  const { currentUser } = useAuthStore()
  const isPro = currentUser?.isPro ?? false

  const [format, setFormat] = useState<ExportFormat>('mp4')
  const [quality, setQuality] = useState<'high' | 'medium' | 'low'>('high')
  const [resIdx, setResIdx] = useState(3) // 1080p default
  const [fps, setFps] = useState(project.fps)
  const [exporting, setExporting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const res = RESOLUTIONS[resIdx]
  const isAudioOnly = format === 'mp3' || format === 'wav'

  async function handleExport() {
    setError(''); setDone(false)

    const mediaMap = new Map<string, string>()
    mediaLibrary.forEach((m) => mediaMap.set(m.id, m.path))

    // Media clips (video, audio, image) — must have a real path
    const mediaClips: ExportClipData[] = clips
      .filter((c) => {
        const track = tracks.find((t) => t.id === c.trackId)
        if (track?.muted || track?.hidden) return false
        if (isAudioOnly && c.type === 'video') return false
        if (c.type === 'text' || c.type === 'sticker') return false
        return true
      })
      .sort((a, b) => a.startTime - b.startTime)
      .map((c) => ({
        path: mediaMap.get(c.mediaId) ?? '',
        timelineStart: c.startTime,
        startTime: c.mediaOffset,
        duration: c.duration,          // source duration (not divided by speed)
        volume: c.volume,
        speed: c.speed,
        fadeIn: c.fadeIn,
        fadeOut: c.fadeOut,
        colorCorrection: c.colorCorrection,
        voiceEnhance: c.voiceEnhance,
        noiseReduction: c.noiseReduction,
        type: c.type,
        textData: c.textData,
        stickerData: c.stickerData
      }))
      .filter((c) => c.path)

    // Text/sticker overlays — no path needed, just timing + data
    const overlayClips: ExportClipData[] = clips
      .filter((c) => {
        const track = tracks.find((t) => t.id === c.trackId)
        if (track?.muted || track?.hidden) return false
        return c.type === 'text' || c.type === 'sticker'
      })
      .map((c) => ({
        path: '',
        timelineStart: c.startTime,
        startTime: 0,
        duration: c.duration,
        volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
        colorCorrection: c.colorCorrection,
        type: c.type,
        textData: c.textData,
        stickerData: c.stickerData
      }))

    const exportClips = [...mediaClips, ...overlayClips]

    if (mediaClips.length === 0) {
      setError('Nenhum clipe para exportar. Adicione mídia na timeline.')
      return
    }

    const outputPath = await window.electron.openSaveDialog(`cineo_export_${Date.now()}`, format)
    if (!outputPath) return

    const options: ExportOptions = {
      width: isAudioOnly ? 0 : res.w,
      height: isAudioOnly ? 0 : res.h,
      fps, quality, format
    }

    setExporting(true)
    setExportProgress(0)
    const cleanup = window.electron.onExportProgress((p) => setExportProgress(p))
    try {
      await window.electron.renderExport(exportClips, outputPath, options)
      setDone(true)
    } catch (e) {
      setError(String(e))
    } finally {
      cleanup()
      setExporting(false)
      setExportProgress(null)
    }
  }

  return (
    <div className="modal-backdrop" onClick={!exporting ? onClose : undefined}>
      <div className="modal-box" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 className="modal-title" style={{ margin: 0 }}>Exportar projeto</h2>
          {!exporting && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#55557a', cursor: 'pointer', fontSize: 18 }}>×</button>
          )}
        </div>

        {/* Format */}
        <div style={{ marginBottom: 18 }}>
          <div className="ac-label" style={{ marginBottom: 8 }}><span>Formato</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                style={{ padding: '8px 6px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${format === f.id ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.07)'}`, background: format === f.id ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)', color: format === f.id ? '#c4b5fd' : '#8888aa', textAlign: 'center' }}
              >
                <div style={{ fontSize: 16 }}>{f.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2 }}>{f.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Resolution (hidden for audio-only) */}
        {!isAudioOnly && (
          <div style={{ marginBottom: 18 }}>
            <div className="ac-label" style={{ marginBottom: 8 }}><span>Resolução</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {RESOLUTIONS.map((r, i) => {
                const locked = r.pro && !isPro
                return (
                  <button
                    key={r.label}
                    disabled={locked}
                    onClick={() => !locked && setResIdx(i)}
                    style={{ padding: '7px 6px', borderRadius: 7, cursor: locked ? 'not-allowed' : 'pointer', border: `1px solid ${resIdx === i ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.07)'}`, background: resIdx === i ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)', opacity: locked ? 0.4 : 1, textAlign: 'center' }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: resIdx === i ? '#c4b5fd' : '#8888aa' }}>{r.label}</div>
                    <div style={{ fontSize: 9, color: '#44446a' }}>{r.w}×{r.h}</div>
                    {locked && <div style={{ fontSize: 8, color: '#f59e0b', marginTop: 1 }}>PRO</div>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Quality + FPS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
          <div>
            <div className="ac-label" style={{ marginBottom: 6 }}><span>Qualidade</span></div>
            {(['high', 'medium', 'low'] as const).map((q) => (
              <label key={q} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer', fontSize: 12, color: quality === q ? '#c4b5fd' : '#8888aa' }}>
                <input type="radio" checked={quality === q} onChange={() => setQuality(q)} style={{ accentColor: '#7c3aed' }} />
                {q === 'high' ? 'Alta (CRF 18)' : q === 'medium' ? 'Média (CRF 23)' : 'Baixa (CRF 28)'}
              </label>
            ))}
          </div>
          <div>
            <div className="ac-label" style={{ marginBottom: 6 }}><span>FPS</span></div>
            {[24, 25, 30, 50, 60].map((f) => (
              <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer', fontSize: 12, color: fps === f ? '#c4b5fd' : '#8888aa' }}>
                <input type="radio" checked={fps === f} onChange={() => setFps(f)} style={{ accentColor: '#7c3aed' }} />
                {f} fps
              </label>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 16, fontSize: 11, color: '#55557a', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>Formato: <b style={{ color: '#8888aa' }}>{format.toUpperCase()}</b></span>
          {!isAudioOnly && <span>Resolução: <b style={{ color: '#8888aa' }}>{res.w}×{res.h}</b></span>}
          <span>Qualidade: <b style={{ color: '#8888aa' }}>{quality}</b></span>
          <span>FPS: <b style={{ color: '#8888aa' }}>{fps}</b></span>
          {currentUser?.isPro && <span style={{ color: '#f59e0b', fontWeight: 700 }}>PRO ✓</span>}
        </div>

        {/* Progress */}
        {exporting && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8888aa', marginBottom: 6 }}>
              <span>Exportando...</span>
              <span>{Math.round(exportProgress ?? 0)}%</span>
            </div>
            <div style={{ height: 4, background: '#1e1e2e', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${exportProgress ?? 0}%`, background: 'linear-gradient(90deg, #7c3aed, #4f46e5)', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {done && (
          <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: '#6ee7b7', textAlign: 'center' }}>
            ✓ Exportação concluída com sucesso!
          </div>
        )}

        {error && (
          <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: '#fca5a5' }}>
            Erro: {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {!exporting && <button className="modal-cancel" onClick={onClose}>Cancelar</button>}
          <button
            className="modal-confirm"
            onClick={handleExport}
            disabled={exporting}
            style={{ minWidth: 120 }}
          >
            {exporting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="login-spinner" style={{ width: 14, height: 14 }} />
                Exportando...
              </span>
            ) : done ? 'Exportar novamente' : 'Exportar'}
          </button>
        </div>
      </div>
    </div>
  )
}
