import React, { useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useAuthStore } from '../store/useAuthStore'

// ── Animated sticker preview ─────────────────────────────────────────────────
function AnimatedSticker({ id, label, preview }: { id: string; label: string; preview: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ fontSize: 11, transform: 'scale(0.6)', transformOrigin: 'top center', height: 40, overflow: 'hidden' }}>
        {preview}
      </div>
      <div style={{ fontSize: 8, color: '#55557a', textAlign: 'center', lineHeight: 1.2 }}>{label}</div>
    </div>
  )
}

const CATEGORIES = [
  {
    name: 'Expressões', free: true,
    stickers: ['😂', '😍', '🥹', '😎', '🤩', '😭', '🤣', '😤', '🥳', '🤯', '😱', '🤔',
               '😆', '🤑', '😴', '🥺', '😇', '🤧', '😏', '🙄']
  },
  {
    name: 'Reações', free: true,
    stickers: ['👍', '👎', '❤️', '🔥', '💯', '✨', '💥', '⚡', '🎉', '🌟', '💪', '🙌',
               '👀', '💀', '🫶', '🤌', '🫠', '💫', '🥊', '🎯']
  },
  {
    name: 'Símbolos', free: true,
    stickers: ['🎬', '🎵', '📸', '💡', '🚀', '🌈', '💎', '🏆', '🔑', '🎮', '💻', '📱',
               '🎤', '🎸', '🎹', '🥁', '🎺', '🎻', '🎨', '✏️']
  },
  {
    name: 'PRO Pack', free: false,
    stickers: ['👑', '🦋', '🌸', '🎭', '🦄', '🌺', '🍀', '🦊', '🐉', '🌙', '☄️', '🎪',
               '🌊', '🦅', '🌴', '💫', '🔮', '🪄', '🦁', '🐺']
  },
]

const ANIMATED_STICKERS = [
  { id: 'subscribe', label: 'Inscreva-se', color: '#ff0000', emoji: '🔔' },
  { id: 'like', label: 'Curtir', color: '#0066cc', emoji: '👍' },
  { id: 'share', label: 'Compartilhar', color: '#25d366', emoji: '↗️' },
  { id: 'notification', label: 'Notificação', color: '#ff9900', emoji: '🔔' },
  { id: 'follow', label: 'Seguir', color: '#e1306c', emoji: '❤️' },
  { id: 'comment', label: 'Comentar', color: '#1da1f2', emoji: '💬' },
]

export function StickerPanel(): React.ReactElement {
  const { tracks, addStickerClip } = useEditorStore()
  const { currentUser } = useAuthStore()
  const isPro = currentUser?.isPro ?? false
  const [activeTab, setActiveTab] = useState<'emoji' | 'animated'>('emoji')
  const [activeCat, setActiveCat] = useState(0)
  const [search, setSearch] = useState('')

  function addSticker(content: string, isProSticker = false) {
    if (isProSticker && !isPro) return
    const track = tracks.find((t) => t.type === 'video' && !t.locked)
    if (!track) return
    const { currentTime } = useEditorStore.getState()
    addStickerClip(track.id, currentTime, { content, x: 50, y: 50 })
  }

  const cat = CATEGORIES[activeCat]
  const filteredEmoji = search.trim()
    ? CATEGORIES.flatMap((c) => c.stickers).filter((s) => s.includes(search))
    : cat.stickers

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header">
        <span className="panel-title">Adesivos</span>
        {!isPro && (
          <div style={{ padding: '2px 7px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 5, fontSize: 9, fontWeight: 700, color: '#f59e0b' }}>PRO+</div>
        )}
      </div>

      {/* Main tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <button onClick={() => setActiveTab('emoji')} style={{ flex: 1, height: 32, background: 'none', border: 'none', fontSize: 10, cursor: 'pointer', color: activeTab === 'emoji' ? '#a78bfa' : '#44446a', borderBottom: activeTab === 'emoji' ? '2px solid #7c3aed' : '2px solid transparent', fontWeight: activeTab === 'emoji' ? 600 : 400 }}>Emoji</button>
        <button onClick={() => setActiveTab('animated')} style={{ flex: 1, height: 32, background: 'none', border: 'none', fontSize: 10, cursor: 'pointer', color: activeTab === 'animated' ? '#a78bfa' : '#44446a', borderBottom: activeTab === 'animated' ? '2px solid #7c3aed' : '2px solid transparent', fontWeight: activeTab === 'animated' ? 600 : 400, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          Animados ✨
        </button>
      </div>

      {activeTab === 'emoji' && (
        <>
          {/* Search */}
          <div style={{ padding: '6px 10px 0' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar emoji..."
              style={{ width: '100%', padding: '5px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: '#d0d0f0', fontSize: 11, outline: 'none' }}
            />
          </div>

          {/* Category tabs */}
          {!search && (
            <div style={{ display: 'flex', padding: '4px 6px 0', overflowX: 'auto', flexShrink: 0 }}>
              {CATEGORIES.map((c, i) => (
                <button key={c.name} onClick={() => setActiveCat(i)} style={{
                  flexShrink: 0, padding: '3px 7px', fontSize: 9, background: 'none', border: 'none',
                  borderBottom: activeCat === i ? '2px solid #7c3aed' : '2px solid transparent',
                  color: activeCat === i ? '#a78bfa' : '#44446a', cursor: 'pointer', fontWeight: activeCat === i ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: 3
                }}>
                  {c.name}
                  {!c.free && !isPro && <span style={{ fontSize: 7, background: 'rgba(245,158,11,0.2)', color: '#f59e0b', padding: '1px 3px', borderRadius: 3, fontWeight: 700 }}>PRO</span>}
                </button>
              ))}
            </div>
          )}

          <div className="panel-body" style={{ padding: '8px 10px' }}>
            {!search && !cat.free && !isPro && (
              <div style={{ padding: '10px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8, marginBottom: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 16, marginBottom: 4 }}>👑</div>
                <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600, marginBottom: 3 }}>Pack PRO</div>
                <div style={{ fontSize: 9, color: '#55557a' }}>Faça upgrade para acessar.</div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
              {filteredEmoji.map((sticker, i) => {
                const isProSticker = !search && !cat.free
                const locked = isProSticker && !isPro
                return (
                  <button key={`${sticker}-${i}`} onClick={() => addSticker(sticker, isProSticker)} disabled={locked}
                    style={{ position: 'relative', aspectRatio: '1', fontSize: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
                    onMouseEnter={(e) => { if (!locked) { e.currentTarget.style.background = 'rgba(139,92,246,0.15)'; e.currentTarget.style.transform = 'scale(1.1)' } }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.transform = 'scale(1)' }}
                  >
                    {sticker}
                    {locked && <div style={{ position: 'absolute', top: 1, right: 1, fontSize: 7, background: 'rgba(245,158,11,0.3)', color: '#f59e0b', borderRadius: 2, padding: '1px 2px', fontWeight: 700, fontFamily: 'sans-serif' }}>🔒</div>}
                  </button>
                )
              })}
            </div>
            {filteredEmoji.length === 0 && <div style={{ textAlign: 'center', color: '#33334d', fontSize: 11, padding: 20 }}>Nenhum emoji encontrado</div>}
          </div>
        </>
      )}

      {activeTab === 'animated' && (
        <div className="panel-body" style={{ padding: '10px' }}>
          <div style={{ fontSize: 9, color: '#44446a', marginBottom: 8 }}>Clique para adicionar na timeline</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {ANIMATED_STICKERS.map((s) => (
              <button
                key={s.id}
                onClick={() => addSticker(`[${s.id}]`)}
                style={{
                  padding: '10px 8px', background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${s.color}33`,
                  borderRadius: 8, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${s.color}22`; e.currentTarget.style.borderColor = `${s.color}66` }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = `${s.color}33` }}
              >
                <div style={{ fontSize: 18 }}>{s.emoji}</div>
                <div style={{ fontSize: 9, color: '#9999cc', fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 7, padding: '1px 5px', background: `${s.color}22`, borderRadius: 3, color: s.color, fontWeight: 700 }}>ANIMADO</div>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.1)', borderRadius: 7, fontSize: 9, color: '#55557a', lineHeight: 1.6 }}>
            💡 Os adesivos animados aparecem com animação CSS no preview e na exportação final.
          </div>
        </div>
      )}

      <div style={{ padding: '6px 10px', fontSize: 9, color: '#2a2a40', textAlign: 'center', flexShrink: 0 }}>
        Clique para adicionar • Arraste para reposicionar
      </div>
    </div>
  )
}
