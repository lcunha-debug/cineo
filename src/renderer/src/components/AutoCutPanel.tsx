import React, { useState, useEffect } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { formatTime } from '../utils/audioAnalyzer'
import type { DetectedSegment, TimelineClip } from '../types'
import { defaultColorCorrection } from '../types'
import { v4 as uuidv4 } from 'uuid'

export function AutoCutPanel(): React.ReactElement {
  const { autoCutOptions, setAutoCutOptions, clips, mediaLibrary, replaceClips } = useEditorStore()
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<DetectedSegment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)

  const videoClips = clips.filter((c) => c.type === 'video' || c.type === 'audio')

  useEffect(() => {
    const cleanup = window.electron.onAnalyzeProgress((p) => setProgress(p))
    return cleanup
  }, [])

  async function handleAnalyze() {
    if (videoClips.length === 0) { setError('Adicione clipes na timeline primeiro.'); return }
    setError(null); setResult(null); setApplied(false); setAnalyzing(true); setProgress(0)
    try {
      const firstClip = [...videoClips].sort((a, b) => a.startTime - b.startTime)[0]
      const media = mediaLibrary.find((m) => m.id === firstClip.mediaId)
      if (!media) throw new Error('Mídia não encontrada.')
      // All analysis happens in the main process — no heavy work in renderer
      const segments = await window.electron.analyzeAudio(media.path, autoCutOptions)
      setResult(segments)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAnalyzing(false)
    }
  }

  function handleApplyCuts() {
    if (!result) return
    const voiceSegments = result.filter((s) => s.type === 'voice')
    if (voiceSegments.length === 0) { setError('Nenhum segmento de voz detectado.'); return }
    const newClips: TimelineClip[] = []
    let cursor = 0
    for (const seg of voiceSegments) {
      const duration = seg.end - seg.start
      for (const clip of videoClips) {
        newClips.push({ id: uuidv4(), mediaId: clip.mediaId, trackId: clip.trackId, startTime: cursor, duration, mediaOffset: seg.start, name: clip.name, type: clip.type, color: clip.color, volume: clip.volume ?? 1, speed: clip.speed ?? 1, fadeIn: 0, fadeOut: 0, colorCorrection: { ...defaultColorCorrection }, waveformData: clip.waveformData })
      }
      cursor += duration
    }
    replaceClips(newClips)
    setApplied(true)
  }

  const silenceCount = result?.filter((s) => s.type === 'silence').length ?? 0
  const clapCount = result?.filter((s) => s.type === 'cut_signal').length ?? 0
  const voiceCount = result?.filter((s) => s.type === 'voice').length ?? 0
  const savedTime = result ? result.filter((s) => s.type !== 'voice').reduce((sum, s) => sum + (s.end - s.start), 0) : 0

  return (
    <div className="right-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 12, overflowY: 'auto', height: '100%' }}>
      <div className="ac-section">
        <div className="ac-label">
          <span>Limite de silêncio</span>
          <span className="ac-value">{Math.round(autoCutOptions.silenceThreshold * 100)}%</span>
        </div>
        <input className="ac-slider" type="range" min="1" max="30" step="1"
          value={Math.round(autoCutOptions.silenceThreshold * 100)}
          onChange={(e) => setAutoCutOptions({ silenceThreshold: Number(e.target.value) / 100 })}
        />
      </div>

      <div className="ac-section">
        <div className="ac-label">
          <span>Silêncio mínimo</span>
          <span className="ac-value">{autoCutOptions.minSilenceDuration.toFixed(1)}s</span>
        </div>
        <input className="ac-slider" type="range" min="0.1" max="3.0" step="0.1"
          value={autoCutOptions.minSilenceDuration}
          onChange={(e) => setAutoCutOptions({ minSilenceDuration: Number(e.target.value) })}
        />
      </div>

      <div className="ac-section">
        <div className="ac-label">
          <span>Voz mínima</span>
          <span className="ac-value">{autoCutOptions.minVoiceDuration.toFixed(1)}s</span>
        </div>
        <input className="ac-slider" type="range" min="0.1" max="2.0" step="0.1"
          value={autoCutOptions.minVoiceDuration}
          onChange={(e) => setAutoCutOptions({ minVoiceDuration: Number(e.target.value) })}
        />
      </div>

      <div className="ac-section">
        <div className="ac-label">
          <span>Margem (padding)</span>
          <span className="ac-value">{autoCutOptions.padding.toFixed(2)}s</span>
        </div>
        <input className="ac-slider" type="range" min="0" max="0.5" step="0.01"
          value={autoCutOptions.padding}
          onChange={(e) => setAutoCutOptions({ padding: Number(e.target.value) })}
        />
      </div>

      <label className="ac-toggle">
        <input type="checkbox"
          checked={autoCutOptions.detectClapSignals}
          onChange={(e) => setAutoCutOptions({ detectClapSignals: e.target.checked })}
        />
        Detectar sinal de palma
      </label>

      {autoCutOptions.detectClapSignals && (
        <div className="ac-section">
          <div className="ac-label">
            <span>Sensibilidade da palma</span>
            <span className="ac-value">{Math.round(autoCutOptions.clapThreshold * 100)}%</span>
          </div>
          <input className="ac-slider" type="range" min="40" max="95" step="5"
            value={Math.round(autoCutOptions.clapThreshold * 100)}
            onChange={(e) => setAutoCutOptions({ clapThreshold: Number(e.target.value) / 100 })}
          />
        </div>
      )}

      <button
        className={`ac-btn ac-btn-analyze${analyzing ? ' analyzing' : ''}`}
        onClick={handleAnalyze}
        disabled={analyzing || videoClips.length === 0}
      >
        {analyzing ? (
          <>
            <span className="login-spinner" style={{ width: 14, height: 14 }} />
            Analisando... {Math.round(progress)}%
          </>
        ) : (
          <>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
            Analisar e Cortar
          </>
        )}
      </button>

      {analyzing && (
        <div className="ac-progress">
          <div className="ac-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: '#fca5a5', fontSize: 12, marginBottom: 8 }}>
          {error}
        </div>
      )}

      {result && !analyzing && (
        <>
          <div className="ac-result">
            <div className="ac-stat">
              <div className="ac-stat-val">{voiceCount}</div>
              <div className="ac-stat-lbl">segmentos voz</div>
            </div>
            <div className="ac-stat">
              <div className="ac-stat-val" style={{ color: '#f87171' }}>{silenceCount}</div>
              <div className="ac-stat-lbl">silêncios</div>
            </div>
            {clapCount > 0 && (
              <div className="ac-stat">
                <div className="ac-stat-val" style={{ color: '#fbbf24' }}>{clapCount}</div>
                <div className="ac-stat-lbl">sinais corte</div>
              </div>
            )}
            <div className="ac-stat">
              <div className="ac-stat-val" style={{ color: '#6ee7b7', fontSize: 14 }}>{formatTime(savedTime)}</div>
              <div className="ac-stat-lbl">economizado</div>
            </div>
          </div>

          <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 10 }}>
            {result.slice(0, 20).map((seg, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 5, background: 'rgba(255,255,255,0.02)', marginBottom: 2, fontSize: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: seg.type === 'voice' ? '#34d399' : seg.type === 'silence' ? '#f87171' : '#fbbf24', flexShrink: 0 }} />
                <span style={{ fontFamily: 'monospace', color: '#8888aa' }}>{formatTime(seg.start)}</span>
                <span style={{ color: '#33334d' }}>→</span>
                <span style={{ fontFamily: 'monospace', color: '#8888aa' }}>{formatTime(seg.end)}</span>
                <span style={{ flex: 1 }} />
                <span style={{ color: seg.type === 'voice' ? '#34d399' : seg.type === 'silence' ? '#f87171' : '#fbbf24' }}>
                  {seg.type === 'voice' ? 'voz' : seg.type === 'silence' ? 'silêncio' : 'corte'}
                </span>
              </div>
            ))}
          </div>

          {applied ? (
            <div style={{ padding: '8px 10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 7, color: '#6ee7b7', fontSize: 12, textAlign: 'center' }}>
              Cortes aplicados na timeline!
            </div>
          ) : (
            <button className="ac-btn ac-btn-apply" onClick={handleApplyCuts}>
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              </svg>
              Aplicar Cortes na Timeline
            </button>
          )}
        </>
      )}
    </div>
  )
}
