import React, { useState, useRef, useEffect } from 'react'
import { useAuthStore } from './store/useAuthStore'
import { useEditorStore } from './store/useEditorStore'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import { Toolbar } from './components/Toolbar'
import { MediaPanel } from './components/MediaPanel'
import { Preview } from './components/Preview'
import { AutoCutPanel } from './components/AutoCutPanel'
import { ClipPropertiesPanel } from './components/ClipPropertiesPanel'
import { Timeline } from './components/Timeline'
import { StickerPanel } from './components/StickerPanel'
import type { TitleAnimation } from './types'

type SidebarTab = 'media' | 'effects' | 'transitions' | 'stickers'
type RightTab = 'clip' | 'autocut'

function EditorPage(): React.ReactElement {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('media')
  const [rightTab, setRightTab] = useState<RightTab>('clip')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | ''>('')
  const { tracks, addTextClip, selectedClipId, loadProjectData } = useEditorStore()
  const { activeProjectId } = useAuthStore()

  // Auto-save: load on mount, save on every meaningful change
  useEffect(() => {
    if (!activeProjectId) return
    window.electron.loadProject(activeProjectId).then((raw) => {
      if (!raw) return
      try { loadProjectData(JSON.parse(raw)) } catch { /* corrupt save */ }
    })

    let timer: ReturnType<typeof setTimeout> | null = null
    const unsub = useEditorStore.subscribe((state, prev) => {
      if (
        state.clips === prev.clips &&
        state.tracks === prev.tracks &&
        state.mediaLibrary === prev.mediaLibrary &&
        state.project === prev.project &&
        state.markers === prev.markers
      ) return
      if (timer) clearTimeout(timer)
      setSaveStatus('saving')
      timer = setTimeout(() => {
        const { clips, tracks, mediaLibrary, project, markers } = useEditorStore.getState()
        window.electron.saveProject(activeProjectId, JSON.stringify({ clips, tracks, mediaLibrary, project, markers }))
          .then(() => setSaveStatus('saved'))
          .catch(() => setSaveStatus(''))
      }, 2000)
    })
    return () => { unsub(); if (timer) clearTimeout(timer) }
  }, [activeProjectId, loadProjectData])

  const SIDEBAR_ICONS = [
    {
      id: 'media' as SidebarTab, title: 'Mídia',
      icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M16 10l5-3v10l-5-3v-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
    },
    {
      id: 'effects' as SidebarTab, title: 'Texto',
      icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 7V4h16v3M9 20h6M12 4v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    },
    {
      id: 'transitions' as SidebarTab, title: 'Transições',
      icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    },
    {
      id: 'stickers' as SidebarTab, title: 'Adesivos',
      icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/><path d="M8 13s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    }
  ]

  function handleAddText() {
    const track = tracks.find((t) => t.type === 'video' && !t.locked)
    if (!track) return
    const { clips, currentTime } = useEditorStore.getState()
    const trackClips = clips.filter((c) => c.trackId === track.id)
    const start = currentTime || trackClips.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0)
    addTextClip(track.id, start)
  }

  return (
    <div className="editor-root">
      <Toolbar saveStatus={saveStatus} />
      <div className="editor-body">
        {/* Left: icon strip + panel */}
        <div className="editor-sidebar">
          <div className="editor-icon-strip">
            {SIDEBAR_ICONS.map((btn) => (
              <button
                key={btn.id}
                className={`icon-strip-btn${sidebarTab === btn.id ? ' active' : ''}`}
                title={btn.title}
                onClick={() => setSidebarTab(btn.id)}
              >
                {btn.icon}
              </button>
            ))}
          </div>
          <div className="editor-panel">
            {sidebarTab === 'media' && <MediaPanel />}
            {sidebarTab === 'effects' && <TextPanel onAddText={handleAddText} />}
            {sidebarTab === 'transitions' && <TransitionsPanel />}
            {sidebarTab === 'stickers' && <StickerPanel />}
          </div>
        </div>

        {/* Center */}
        <Preview />

        {/* Right panel */}
        <div className="editor-right">
          <div className="right-panel-tabs">
            <button
              className={`right-panel-tab${rightTab === 'clip' ? ' active' : ''}`}
              onClick={() => setRightTab('clip')}
            >
              Clipe
              {selectedClipId && <span style={{ marginLeft: 4, width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', display: 'inline-block', verticalAlign: 'middle' }} />}
            </button>
            <button
              className={`right-panel-tab${rightTab === 'autocut' ? ' active' : ''}`}
              onClick={() => setRightTab('autocut')}
            >
              Auto-Corte
            </button>
          </div>
          {rightTab === 'clip' ? <ClipPropertiesPanel /> : <AutoCutPanel />}
        </div>
      </div>

      <div style={{ flexShrink: 0, height: 230, overflow: 'hidden' }}>
        <Timeline />
      </div>
    </div>
  )
}

// ── AI Title Modal ────────────────────────────────────────────────────────────
interface AiTitleResult {
  text: string
  animation: TitleAnimation
  fontColor: string
  backgroundColor: string
  backgroundOpacity: number
  bold: boolean
  italic: boolean
  fontSize: number
  reason: string
}

function AiTitleModal({ onClose, onApply }: { onClose: () => void; onApply: (r: AiTitleResult) => void }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('cineo_ai_key') || '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [overrideText, setOverrideText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AiTitleResult | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setImageFile(f)
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(f)
    setResult(null); setError('')
  }

  async function analyze() {
    if (!imageFile) { setError('Selecione uma imagem primeiro.'); return }
    if (!apiKey.trim()) { setError('Insira sua chave da API Anthropic.'); return }
    setLoading(true); setError('')
    localStorage.setItem('cineo_ai_key', apiKey.trim())

    try {
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = (ev) => resolve((ev.target?.result as string).split(',')[1])
        reader.readAsDataURL(imageFile)
      })
      const mediaType = imageFile.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      const prompt = `Analise esta imagem e retorne configurações para um título animado de vídeo.
O usuário quer um título estilo: "${overrideText || '(extraia da imagem)'}"
Responda APENAS com JSON válido, nenhum texto fora do JSON:
{"text":"TITULO","animation":"fadeIn","fontColor":"#ffffff","backgroundColor":"#000000","backgroundOpacity":0,"bold":true,"italic":false,"fontSize":72,"reason":"razão"}
Opções de animation: fadeIn, slideUp, slideDown, zoomIn, glow, bounce, shake
Guia: fadeIn=elegante/cinematográfico, slideUp=moderno, slideDown=dramático, zoomIn=impactante, glow=neon/música, bounce=divertido/redes sociais, shake=intenso/esportes`

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey.trim(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
            { type: 'text', text: prompt }
          ] }]
        })
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `HTTP ${res.status}`) }
      const data = await res.json()
      const raw = data.content[0]?.text || ''
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('IA não retornou JSON válido.')
      const parsed: AiTitleResult = JSON.parse(jsonMatch[0])
      if (overrideText.trim()) parsed.text = overrideText.trim()
      setResult(parsed)
    } catch (e: unknown) {
      setError(String((e as Error).message ?? e))
    } finally {
      setLoading(false)
    }
  }

  const ANIM_LABELS: Record<string, string> = { fadeIn:'Fade In', slideUp:'Slide ↑', slideDown:'Slide ↓', zoomIn:'Zoom In', glow:'Brilho', bounce:'Bounce', shake:'Shake', none:'Nenhuma' }

  return (
    <div className="modal-backdrop" onClick={!loading ? onClose : undefined}>
      <div className="modal-box" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 className="modal-title" style={{ margin: 0 }}>✨ Título com IA</h2>
          {!loading && <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#55557a', cursor: 'pointer', fontSize: 18 }}>×</button>}
        </div>

        {/* Image upload */}
        <div style={{ marginBottom: 14 }}>
          <div className="ac-label" style={{ marginBottom: 6 }}><span>Imagem de referência</span></div>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{ width: '100%', aspectRatio: '16/5', borderRadius: 8, border: '1px dashed rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.04)', cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
          >
            {imagePreview
              ? <img src={imagePreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 11, color: '#44446a' }}>Clique para selecionar uma imagem</span>
            }
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
        </div>

        {/* Optional title override */}
        <div style={{ marginBottom: 14 }}>
          <div className="ac-label" style={{ marginBottom: 6 }}><span>Texto do título (opcional)</span></div>
          <input
            value={overrideText}
            onChange={(e) => setOverrideText(e.target.value)}
            placeholder="Deixe em branco para a IA detectar da imagem"
            style={{ width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: '#d0d0f0', fontSize: 12, outline: 'none' }}
          />
        </div>

        {/* API Key */}
        <div style={{ marginBottom: 16 }}>
          <div className="ac-label" style={{ marginBottom: 6 }}><span>Chave API Anthropic</span></div>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type="password"
            placeholder="sk-ant-..."
            style={{ width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: '#d0d0f0', fontSize: 12, outline: 'none', fontFamily: 'monospace' }}
          />
          <div style={{ fontSize: 9, color: '#33334d', marginTop: 4 }}>Salva localmente. Obtenha em console.anthropic.com</div>
        </div>

        {error && <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, marginBottom: 12, fontSize: 11, color: '#fca5a5' }}>{error}</div>}

        {/* Result preview */}
        {result && (
          <div style={{ marginBottom: 14, padding: '12px 14px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: result.fontColor, fontFamily: 'Impact', background: result.backgroundOpacity > 0 ? `${result.backgroundColor}${Math.round(result.backgroundOpacity * 255).toString(16).padStart(2,'0')}` : 'transparent', padding: result.backgroundOpacity > 0 ? '2px 8px' : 0, borderRadius: 3 }}>{result.text || '(sem texto)'}</div>
              <div style={{ marginLeft: 'auto', fontSize: 10, color: '#a78bfa', background: 'rgba(139,92,246,0.2)', padding: '2px 7px', borderRadius: 4 }}>{ANIM_LABELS[result.animation] ?? result.animation}</div>
            </div>
            <div style={{ fontSize: 9, color: '#55557a', lineHeight: 1.6 }}>💡 {result.reason}</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {!loading && <button className="modal-cancel" onClick={onClose}>Cancelar</button>}
          {!result && (
            <button className="modal-confirm" onClick={analyze} disabled={loading} style={{ minWidth: 130 }}>
              {loading
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="login-spinner" style={{ width: 14, height: 14 }} />Analisando...</span>
                : '✨ Analisar com IA'}
            </button>
          )}
          {result && (
            <>
              <button className="modal-cancel" onClick={() => setResult(null)}>Refazer</button>
              <button className="modal-confirm" onClick={() => onApply(result)} style={{ minWidth: 120 }}>Aplicar título</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Text panel ────────────────────────────────────────────────────────────────
function TextPanel({ onAddText }: { onAddText: () => void }) {
  const [showAiModal, setShowAiModal] = useState(false)
  const PRESETS = [
    { label: 'Título', style: { fontSize: 72, bold: true } },
    { label: 'Subtítulo', style: { fontSize: 48, bold: false } },
    { label: 'Legenda', style: { fontSize: 36, bold: false } },
    { label: 'Lower Third', style: { fontSize: 32, bold: true, y: 85 } },
    { label: 'Citação', style: { fontSize: 28, italic: true } },
    { label: 'Crédito', style: { fontSize: 22, bold: false, y: 95 } },
  ]
  const { tracks, addTextClip, currentTime } = useEditorStore()

  function addPreset(preset: typeof PRESETS[0]) {
    const track = tracks.find((t) => t.type === 'video' && !t.locked)
    if (!track) return
    const start = currentTime
    addTextClip(track.id, start, { ...preset.style, text: preset.label } as Parameters<typeof addTextClip>[2])
  }

  function applyAiResult(r: AiTitleResult) {
    const track = tracks.find((t) => t.type === 'video' && !t.locked)
    if (!track) return
    addTextClip(track.id, currentTime, {
      text: r.text,
      fontSize: r.fontSize || 72,
      fontColor: r.fontColor || '#ffffff',
      backgroundColor: r.backgroundColor || '#000000',
      backgroundOpacity: r.backgroundOpacity ?? 0,
      bold: r.bold ?? true,
      italic: r.italic ?? false,
      animation: r.animation || 'fadeIn',
    })
    setShowAiModal(false)
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="panel-header">
          <span className="panel-title">Texto</span>
          <button className="panel-import-btn" onClick={onAddText}>+ Adicionar</button>
        </div>
        <div className="panel-body">
          {/* AI Title button */}
          <button
            onClick={() => setShowAiModal(true)}
            style={{ width: '100%', marginBottom: 12, padding: '9px 0', background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(79,70,229,0.2))', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 8, color: '#c4b5fd', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            ✨ Título animado com IA
          </button>

          <div style={{ fontSize: 10, color: '#44446a', marginBottom: 8 }}>Predefinições rápidas</div>
          {PRESETS.map((p) => (
            <div
              key={p.label}
              className="media-item"
              style={{ cursor: 'pointer', padding: '10px 12px' }}
              onClick={() => addPreset(p)}
            >
              <div style={{ fontSize: 11, color: '#c0c0e0', fontWeight: 600 }}>{p.label}</div>
              <div style={{ fontSize: 9, color: '#44446a', marginTop: 2 }}>{p.style.fontSize}px</div>
            </div>
          ))}
        </div>
      </div>
      {showAiModal && <AiTitleModal onClose={() => setShowAiModal(false)} onApply={applyAiResult} />}
    </>
  )
}

// ── Transitions panel ──────────────────────────────────────────────────────
function TransitionsPanel() {
  const TRANSITIONS = [
    { name: 'Fade', icon: '⬛' },
    { name: 'Dissolve', icon: '🌫' },
    { name: 'Slide →', icon: '➡' },
    { name: 'Slide ←', icon: '⬅' },
    { name: 'Zoom In', icon: '🔍' },
    { name: 'Zoom Out', icon: '🔎' },
    { name: 'Glitch', icon: '⚡' },
    { name: 'Flash', icon: '💡' },
    { name: 'Circular', icon: '⭕' },
    { name: 'Rotação', icon: '🔄' },
    { name: 'Blur', icon: '🌀' },
    { name: 'Página', icon: '📄' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <span className="panel-title">Transições</span>
      </div>
      <div className="panel-body">
        <div style={{ fontSize: 10, color: '#44446a', marginBottom: 10 }}>Arraste entre dois clipes na timeline</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {TRANSITIONS.map((t) => (
            <div
              key={t.name}
              className="media-item"
              style={{ cursor: 'grab', padding: '8px', textAlign: 'center' }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
              <div style={{ fontSize: 10, color: '#9999cc' }}>{t.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function App(): React.ReactElement {
  const { currentUser, activeProjectId } = useAuthStore()
  if (!currentUser) return <LoginPage />
  if (!activeProjectId) return <DashboardPage />
  return <EditorPage />
}
