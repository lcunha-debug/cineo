import React, { useState, useEffect, useRef } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import type { ColorCorrection, TextOverlay, StickerData, TitleAnimation } from '../types'
import { defaultColorCorrection } from '../types'
import { v4 as uuidv4 } from 'uuid'

const PRESETS: { name: string; cc: Partial<ColorCorrection> }[] = [
  { name: 'Normal', cc: { brightness: 1, contrast: 1, saturation: 1, hue: 0, temperature: 0 } },
  { name: 'Cinematográfico', cc: { brightness: 0.92, contrast: 1.15, saturation: 0.8, hue: 0, temperature: -15 } },
  { name: 'Vlog', cc: { brightness: 1.05, contrast: 1.05, saturation: 1.2, hue: 0, temperature: 10 } },
  { name: 'Antigo', cc: { brightness: 0.9, contrast: 0.95, saturation: 0.5, hue: 10, temperature: 20 } },
  { name: 'Neon', cc: { brightness: 1.1, contrast: 1.3, saturation: 1.8, hue: -15, temperature: -20 } },
  { name: 'B&W', cc: { brightness: 1, contrast: 1.2, saturation: 0, hue: 0, temperature: 0 } },
  { name: 'Quente', cc: { brightness: 1, contrast: 1.05, saturation: 1.1, hue: 0, temperature: 40 } },
  { name: 'Frio', cc: { brightness: 1, contrast: 1.05, saturation: 0.9, hue: 0, temperature: -40 } },
]

function Slider({ label, value, min, max, step, unit, onChange, defaultVal }: {
  label: string; value: number; min: number; max: number; step: number
  unit?: string; onChange: (v: number) => void; defaultVal: number
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="ac-section" style={{ marginBottom: 10 }}>
      <div className="ac-label">
        <span>{label}</span>
        <span className="ac-value" style={{ cursor: 'pointer' }} onClick={() => onChange(defaultVal)} title="Reset">
          {value.toFixed(step < 1 ? 2 : 0)}{unit ?? ''}
        </span>
      </div>
      <input className="ac-slider" type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(to right, #7c3aed ${pct}%, #1e1e2e ${pct}%)` }}
      />
    </div>
  )
}

export function ClipPropertiesPanel(): React.ReactElement {
  const { selectedClipId, clips, updateClip, tracks } = useEditorStore()
  const [tab, setTab] = useState<'basic' | 'color' | 'text' | 'sticker'>('basic')
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeProgress, setTranscribeProgress] = useState(0)
  const [transcribeStatus, setTranscribeStatus] = useState('')
  const [transcribeDone, setTranscribeDone] = useState(false)
  const [transcribeError, setTranscribeError] = useState('')
  const transcribeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => { transcribeCleanupRef.current?.() }
  }, [])

  const clip = clips.find((c) => c.id === selectedClipId)

  if (!clip) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: '#33334d', padding: 20, textAlign: 'center' }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span style={{ fontSize: 12 }}>Selecione um clipe na timeline</span>
    </div>
  )

  const cc = clip.colorCorrection
  const track = tracks.find((t) => t.id === clip.trackId)
  const isText = clip.type === 'text'
  const isSticker = clip.type === 'sticker'
  const hasAudio = clip.type === 'audio' || clip.type === 'video'
  const hasVideo = clip.type === 'video' || clip.type === 'image'

  function setCc(partial: Partial<ColorCorrection>) {
    updateClip(clip.id, { colorCorrection: { ...cc, ...partial } })
  }

  async function handleTranscribe() {
    const media = useEditorStore.getState().mediaLibrary.find((m) => m.id === clip.mediaId)
    if (!media) { setTranscribeError('Mídia não encontrada.'); return }

    setTranscribing(true); setTranscribeProgress(0); setTranscribeError(''); setTranscribeDone(false)
    setTranscribeStatus('Extraindo áudio...')

    const cleanup = window.electron.onTranscribeProgress((p) => {
      setTranscribeProgress(p)
      if (p < 25) setTranscribeStatus('Extraindo áudio...')
      else if (p < 76) setTranscribeStatus('Carregando modelo Whisper...')
      else if (p < 98) setTranscribeStatus('Transcrevendo fala...')
      else setTranscribeStatus('Concluindo...')
    })
    transcribeCleanupRef.current = cleanup

    try {
      const chunks = await window.electron.transcribeAudio(media.path, clip.startTime)
      // Find or create a text track for subtitles
      const textTrack = useEditorStore.getState().tracks.find((t) => t.type === 'video' && !t.locked)
      if (!textTrack) { setTranscribeError('Nenhuma faixa disponível.'); return }

      // Add a text clip for each transcription chunk
      for (const chunk of chunks) {
        const duration = Math.max(0.5, chunk.end - chunk.start)
        const { clips: currentClips } = useEditorStore.getState()
        // Insert directly into store to avoid re-renders between chunks
        useEditorStore.setState((s) => ({
          clips: [...s.clips, {
            id: uuidv4(), mediaId: '', trackId: textTrack.id,
            startTime: chunk.start, duration,
            mediaOffset: 0, name: chunk.text.slice(0, 20),
            type: 'text' as const, color: '#ec4899',
            volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
            colorCorrection: { ...defaultColorCorrection },
            textData: {
              text: chunk.text, fontSize: 48, fontColor: '#ffffff',
              backgroundColor: '#000000', backgroundOpacity: 0,
              fontFamily: 'Arial', bold: false, italic: false,
              x: 50, y: 85, align: 'center' as const, animation: 'none' as const
            }
          }]
        }))
      }
      setTranscribeDone(true)
    } catch (e: unknown) {
      setTranscribeError(e instanceof Error ? e.message : String(e))
    } finally {
      cleanup()
      transcribeCleanupRef.current = null
      setTranscribing(false)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        {(['basic', 'color', ...(isText ? ['text'] : []), ...(isSticker ? ['sticker'] : [])] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as typeof tab)}
            style={{ flex: 1, height: 36, background: 'none', border: 'none', fontSize: 10, fontWeight: 500, cursor: 'pointer', transition: 'color 0.15s', color: tab === t ? '#a78bfa' : '#44446a', borderBottom: tab === t ? '2px solid #7c3aed' : '2px solid transparent', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            {t === 'basic' ? 'Clipe' : t === 'color' ? 'Cores' : t === 'text' ? 'Texto' : 'Adesivo'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {tab === 'basic' && (
          <>
            {/* Clip name */}
            <div className="ac-section">
              <div className="ac-label"><span>Nome do clipe</span></div>
              <input
                style={{ width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: '#d0d0f0', fontSize: 12, outline: 'none' }}
                value={clip.name}
                onChange={(e) => updateClip(clip.id, { name: e.target.value })}
              />
            </div>

            {/* Volume — allows boost up to 20x via Web Audio gain */}
            {hasAudio && (
              <>
                <Slider label="Volume" value={clip.volume} min={0} max={20} step={0.05} unit="x"
                  onChange={(v) => updateClip(clip.id, { volume: v })} defaultVal={1} />
                {clip.volume > 1 && (
                  <div style={{ marginTop: -6, marginBottom: 10, fontSize: 9, color: '#f59e0b', padding: '3px 8px', background: 'rgba(245,158,11,0.1)', borderRadius: 5 }}>
                    ⚡ Boost ativo — {Math.round(clip.volume * 100)}% • pode distorcer em valores altos
                  </div>
                )}
              </>
            )}

            {/* Voice enhance + noise reduction */}
            {hasAudio && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#c0c0e0', fontWeight: 500 }}>Aprimorar Voz</div>
                    <div style={{ fontSize: 10, color: '#55557a', marginTop: 2 }}>Realça frequências de voz humana</div>
                  </div>
                  <button
                    onClick={() => updateClip(clip.id, { voiceEnhance: !clip.voiceEnhance })}
                    style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', background: clip.voiceEnhance ? '#7c3aed' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}
                  >
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: clip.voiceEnhance ? 21 : 3, transition: 'left 0.2s' }} />
                  </button>
                </div>

                <div className="ac-section" style={{ marginBottom: 10 }}>
                  <div className="ac-label">
                    <span>Redutor de Ruído</span>
                    <span className="ac-value" style={{ cursor: 'pointer' }} onClick={() => updateClip(clip.id, { noiseReduction: 0 })} title="Reset">
                      {clip.noiseReduction && clip.noiseReduction > 0 ? `${Math.round((clip.noiseReduction ?? 0) * 100)}%` : 'Off'}
                    </span>
                  </div>
                  <input className="ac-slider" type="range" min={0} max={1} step={0.05}
                    value={clip.noiseReduction ?? 0}
                    onChange={(e) => updateClip(clip.id, { noiseReduction: Number(e.target.value) })}
                    style={{ background: `linear-gradient(to right, #7c3aed ${(clip.noiseReduction ?? 0) * 100}%, #1e1e2e ${(clip.noiseReduction ?? 0) * 100}%)` }}
                  />
                </div>
              </>
            )}

            {/* Speed */}
            <div className="ac-section" style={{ marginBottom: 10 }}>
              <div className="ac-label"><span>Velocidade</span><span className="ac-value">{clip.speed}x</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 6 }}>
                {[0.25, 0.5, 1, 1.5, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateClip(clip.id, { speed: s })}
                    style={{ padding: '4px 0', fontSize: 10, borderRadius: 5, cursor: 'pointer', border: `1px solid ${clip.speed === s ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.07)'}`, background: clip.speed === s ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)', color: clip.speed === s ? '#a78bfa' : '#8888aa' }}
                  >{s}x</button>
                ))}
              </div>
              <input className="ac-slider" type="range" min={0.1} max={4} step={0.05} value={clip.speed}
                onChange={(e) => updateClip(clip.id, { speed: Number(e.target.value) })} />
            </div>

            {/* Fade in/out */}
            <Slider label="Fade In" value={clip.fadeIn} min={0} max={Math.min(clip.duration / 2, 5)} step={0.05} unit="s"
              onChange={(v) => updateClip(clip.id, { fadeIn: v })} defaultVal={0} />
            <Slider label="Fade Out" value={clip.fadeOut} min={0} max={Math.min(clip.duration / 2, 5)} step={0.05} unit="s"
              onChange={(v) => updateClip(clip.id, { fadeOut: v })} defaultVal={0} />

            {/* Duration */}
            <Slider label="Duração" value={clip.duration} min={0.1} max={Math.max(clip.duration * 2, 60)} step={0.1} unit="s"
              onChange={(v) => updateClip(clip.id, { duration: v })} defaultVal={clip.duration} />

            {/* Info */}
            <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 7, fontSize: 10, color: '#55557a', lineHeight: 1.8 }}>
              <div>Tipo: <span style={{ color: '#8888aa' }}>{clip.type}</span></div>
              <div>Faixa: <span style={{ color: '#8888aa' }}>{track?.name ?? '—'}</span></div>
              <div>Início: <span style={{ color: '#8888aa', fontFamily: 'monospace' }}>{clip.startTime.toFixed(2)}s</span></div>
              <div>Offset: <span style={{ color: '#8888aa', fontFamily: 'monospace' }}>{clip.mediaOffset.toFixed(2)}s</span></div>
            </div>

            {/* Transcription */}
            {hasAudio && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="ac-label" style={{ marginBottom: 8 }}><span>Transcrição de Voz</span></div>

                {transcribing && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8888aa', marginBottom: 5 }}>
                      <span>{transcribeStatus}</span>
                      <span>{Math.round(transcribeProgress)}%</span>
                    </div>
                    <div style={{ height: 3, background: '#1e1e2e', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${transcribeProgress}%`, background: 'linear-gradient(90deg, #7c3aed, #4f46e5)', borderRadius: 2, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ fontSize: 9, color: '#44446a', marginTop: 4 }}>Primeira vez: baixa modelo ~75 MB</div>
                  </div>
                )}

                {transcribeError && (
                  <div style={{ fontSize: 10, color: '#fca5a5', marginBottom: 6, padding: '5px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: 5 }}>{transcribeError}</div>
                )}

                {transcribeDone && !transcribing && (
                  <div style={{ fontSize: 10, color: '#6ee7b7', marginBottom: 6, padding: '5px 8px', background: 'rgba(16,185,129,0.08)', borderRadius: 5 }}>Legendas adicionadas na timeline!</div>
                )}

                {!transcribing && (
                  <button
                    className="ac-btn ac-btn-analyze"
                    onClick={handleTranscribe}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
                    </svg>
                    {transcribeDone ? 'Transcrever novamente' : 'Transcrever fala → texto'}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'color' && (
          <>
            {/* Color presets */}
            <div className="ac-section">
              <div className="ac-label"><span>Presets visuais</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setCc(p.cc)}
                    style={{ padding: '5px 4px', fontSize: 10, borderRadius: 5, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', color: '#8888aa', transition: 'all 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'; e.currentTarget.style.color = '#c4b5fd' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#8888aa' }}
                  >{p.name}</button>
                ))}
              </div>
            </div>

            <Slider label="Brilho" value={cc.brightness} min={0} max={2} step={0.01} onChange={(v) => setCc({ brightness: v })} defaultVal={1} />
            <Slider label="Contraste" value={cc.contrast} min={0} max={2} step={0.01} onChange={(v) => setCc({ contrast: v })} defaultVal={1} />
            <Slider label="Saturação" value={cc.saturation} min={0} max={3} step={0.01} onChange={(v) => setCc({ saturation: v })} defaultVal={1} />
            <Slider label="Matiz" value={cc.hue} min={-180} max={180} step={1} unit="°" onChange={(v) => setCc({ hue: v })} defaultVal={0} />
            <Slider label="Temperatura" value={cc.temperature} min={-100} max={100} step={1} onChange={(v) => setCc({ temperature: v })} defaultVal={0} />

            {/* Preview with CSS filter */}
            <div style={{ marginTop: 8 }}>
              <div className="ac-label"><span>Prévia do filtro</span></div>
              <div style={{
                width: '100%', aspectRatio: '16/9', borderRadius: 6, overflow: 'hidden',
                background: 'linear-gradient(135deg, #1a0533, #0a2444, #001a33)',
                filter: `brightness(${cc.brightness}) contrast(${cc.contrast}) saturate(${cc.saturation}) hue-rotate(${cc.hue}deg) sepia(${cc.temperature > 0 ? cc.temperature / 200 : 0})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Prévia de cor</span>
              </div>
            </div>

            <button
              onClick={() => setCc({ brightness: 1, contrast: 1, saturation: 1, hue: 0, temperature: 0 })}
              style={{ width: '100%', marginTop: 10, padding: '7px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: '#8888aa', fontSize: 12, cursor: 'pointer' }}
            >
              Resetar cores
            </button>
          </>
        )}

        {tab === 'text' && isText && (
          <TextEditor clip={clip} onUpdate={(td) => updateClip(clip.id, { textData: td, name: td.text.slice(0, 20) || 'Texto' })} />
        )}

        {tab === 'sticker' && isSticker && clip.stickerData && (
          <StickerEditor
            data={clip.stickerData}
            onUpdate={(sd) => updateClip(clip.id, { stickerData: sd })}
          />
        )}
      </div>
    </div>
  )
}

function StickerEditor({ data, onUpdate }: { data: StickerData; onUpdate: (sd: StickerData) => void }) {
  function set(partial: Partial<StickerData>) { onUpdate({ ...data, ...partial }) }
  return (
    <>
      <div style={{ textAlign: 'center', fontSize: 48, margin: '10px 0' }}>{data.content}</div>
      <Slider label="Posição X" value={data.x} min={0} max={100} step={1} unit="%" onChange={(v) => set({ x: v })} defaultVal={50} />
      <Slider label="Posição Y" value={data.y} min={0} max={100} step={1} unit="%" onChange={(v) => set({ y: v })} defaultVal={50} />
      <Slider label="Tamanho" value={data.scale} min={0.2} max={3} step={0.05} unit="x" onChange={(v) => set({ scale: v })} defaultVal={1} />
      <Slider label="Rotação" value={data.rotation} min={-180} max={180} step={1} unit="°" onChange={(v) => set({ rotation: v })} defaultVal={0} />
      <Slider label="Opacidade" value={data.opacity} min={0} max={1} step={0.01} onChange={(v) => set({ opacity: v })} defaultVal={1} />
      <button
        onClick={() => set({ x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 })}
        style={{ width: '100%', marginTop: 10, padding: '7px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: '#8888aa', fontSize: 12, cursor: 'pointer' }}
      >Resetar posição</button>
    </>
  )
}

const ANIMATIONS: { id: TitleAnimation; label: string; emoji: string }[] = [
  { id: 'none',      label: 'Nenhuma',    emoji: '—'  },
  { id: 'fadeIn',    label: 'Fade In',    emoji: '🌅' },
  { id: 'slideUp',   label: 'Slide ↑',   emoji: '⬆️' },
  { id: 'slideDown', label: 'Slide ↓',   emoji: '⬇️' },
  { id: 'zoomIn',    label: 'Zoom',       emoji: '🔍' },
  { id: 'glow',      label: 'Brilho',     emoji: '✨' },
  { id: 'bounce',    label: 'Bounce',     emoji: '🏀' },
  { id: 'shake',     label: 'Shake',      emoji: '⚡' },
]

function TextEditor({ clip, onUpdate }: { clip: { textData?: TextOverlay }; onUpdate: (td: TextOverlay) => void }) {
  const td = clip.textData!
  if (!td) return null

  function set(partial: Partial<TextOverlay>) {
    onUpdate({ ...td, ...partial })
  }

  const FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact', 'Trebuchet MS', 'Comic Sans MS']

  return (
    <>
      {/* Text content */}
      <div className="ac-section">
        <div className="ac-label"><span>Texto</span></div>
        <textarea
          value={td.text}
          onChange={(e) => set({ text: e.target.value })}
          rows={3}
          style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: '#d0d0f0', fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: td.fontFamily }}
        />
      </div>

      {/* Font */}
      <div className="ac-section">
        <div className="ac-label"><span>Fonte</span></div>
        <select
          value={td.fontFamily}
          onChange={(e) => set({ fontFamily: e.target.value })}
          style={{ width: '100%', padding: '6px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: '#d0d0f0', fontSize: 12, outline: 'none' }}
        >
          {FONTS.map((f) => <option key={f} value={f} style={{ background: '#0f0c20' }}>{f}</option>)}
        </select>
      </div>

      <Slider label="Tamanho" value={td.fontSize} min={12} max={200} step={1} unit="px"
        onChange={(v) => set({ fontSize: v })} defaultVal={48} />

      {/* Colors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <div className="ac-label"><span>Cor do texto</span></div>
          <input type="color" value={td.fontColor} onChange={(e) => set({ fontColor: e.target.value })}
            style={{ width: '100%', height: 32, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'none', cursor: 'pointer' }} />
        </div>
        <div>
          <div className="ac-label"><span>Cor de fundo</span></div>
          <input type="color" value={td.backgroundColor} onChange={(e) => set({ backgroundColor: e.target.value })}
            style={{ width: '100%', height: 32, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'none', cursor: 'pointer' }} />
        </div>
      </div>

      <Slider label="Opacidade fundo" value={td.backgroundOpacity} min={0} max={1} step={0.01}
        onChange={(v) => set({ backgroundOpacity: v })} defaultVal={0} />

      {/* Style toggles */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['bold', 'italic'] as const).map((style) => (
          <button
            key={style}
            onClick={() => set({ [style]: !td[style] })}
            style={{ flex: 1, padding: '6px 0', fontSize: 11, fontWeight: style === 'bold' ? 700 : 400, fontStyle: style === 'italic' ? 'italic' : 'normal', borderRadius: 6, cursor: 'pointer', border: `1px solid ${td[style] ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.07)'}`, background: td[style] ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)', color: td[style] ? '#a78bfa' : '#8888aa' }}
          >{style === 'bold' ? 'Negrito' : 'Itálico'}</button>
        ))}
        {(['left', 'center', 'right'] as const).map((a) => (
          <button
            key={a}
            onClick={() => set({ align: a })}
            style={{ flex: 1, padding: '6px 0', fontSize: 10, borderRadius: 6, cursor: 'pointer', border: `1px solid ${td.align === a ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.07)'}`, background: td.align === a ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)', color: td.align === a ? '#a78bfa' : '#8888aa' }}
          >{a === 'left' ? '←' : a === 'center' ? '↔' : '→'}</button>
        ))}
      </div>

      {/* Position */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <Slider label="Posição X" value={td.x} min={0} max={100} step={1} unit="%"
            onChange={(v) => set({ x: v })} defaultVal={50} />
        </div>
        <div>
          <Slider label="Posição Y" value={td.y} min={0} max={100} step={1} unit="%"
            onChange={(v) => set({ y: v })} defaultVal={85} />
        </div>
      </div>

      {/* Animation picker */}
      <div className="ac-section" style={{ marginBottom: 10 }}>
        <div className="ac-label"><span>Animação</span><span className="ac-value">{td.animation ?? 'none'}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {ANIMATIONS.map((a) => (
            <button
              key={a.id}
              onClick={() => set({ animation: a.id })}
              style={{ padding: '5px 4px', fontSize: 9, borderRadius: 5, cursor: 'pointer', textAlign: 'center',
                border: `1px solid ${(td.animation ?? 'none') === a.id ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.07)'}`,
                background: (td.animation ?? 'none') === a.id ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
                color: (td.animation ?? 'none') === a.id ? '#a78bfa' : '#8888aa' }}
            >
              <div style={{ fontSize: 13 }}>{a.emoji}</div>
              <div style={{ marginTop: 1 }}>{a.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div style={{ width: '100%', aspectRatio: '16/9', background: '#0e0c1e', borderRadius: 6, position: 'relative', overflow: 'hidden', marginTop: 4 }}>
        <div style={{
          position: 'absolute',
          left: `${td.x}%`, top: `${td.y}%`,
          transform: 'translate(-50%, -50%)',
          fontSize: td.fontSize * 0.18,
          fontFamily: td.fontFamily,
          fontWeight: td.bold ? 700 : 400,
          fontStyle: td.italic ? 'italic' : 'normal',
          color: td.fontColor,
          background: td.backgroundOpacity > 0 ? `${td.backgroundColor}${Math.round(td.backgroundOpacity * 255).toString(16).padStart(2, '0')}` : 'transparent',
          padding: td.backgroundOpacity > 0 ? '2px 6px' : '0',
          borderRadius: 3,
          whiteSpace: 'pre',
          textAlign: td.align,
          pointerEvents: 'none',
          maxWidth: '90%'
        }}>
          {td.text || 'Prévia'}
        </div>
      </div>
    </>
  )
}
