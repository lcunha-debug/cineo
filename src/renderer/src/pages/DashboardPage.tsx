import { useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

function formatDate(ts: number) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(ts))
}

function formatDuration(sec?: number) {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function DashboardPage() {
  const { currentUser, projects, logout, createProject, deleteProject, openProject } = useAuthStore()
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  function handleCreate() {
    if (!newName.trim()) return
    const project = createProject(newName)
    setNewName('')
    setShowModal(false)
    openProject(project.id)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') { setShowModal(false); setNewName('') }
  }

  return (
    <div className="dash-bg">
      <div className="dash-glow dash-glow-1" />
      <div className="dash-glow dash-glow-2" />

      {/* Top bar */}
      <header className="dash-header">
        <div className="dash-logo">
          <div className="dash-logo-icon">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <path d="M6 8L6 24M6 16L26 8L26 24L6 16Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="dash-logo-text">cineo</span>
        </div>

        <div className="dash-user">
          {currentUser?.isPro && (
            <div style={{ padding: '3px 9px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderRadius: 6, fontSize: 10, fontWeight: 800, color: '#1a0a00', letterSpacing: '0.5px', marginRight: 4 }}>PRO</div>
          )}
          <div className="dash-avatar">{currentUser?.username?.[0]?.toUpperCase() ?? '?'}</div>
          <span className="dash-username">{currentUser?.username}</span>
          <button className="dash-logout" onClick={logout} title="Sair">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </header>

      <main className="dash-main">
        {projects.length === 0 ? (
          /* Empty state — centered create button */
          <div className="dash-empty">
            <div className="dash-empty-icon">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <rect x="8" y="16" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="2.5"/>
                <path d="M24 32L40 24V40L24 32Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="dash-empty-title">Nenhum projeto ainda</h2>
            <p className="dash-empty-sub">Crie seu primeiro projeto e comece a editar</p>
            <button className="dash-new-btn-hero" onClick={() => setShowModal(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              Novo projeto
            </button>
          </div>
        ) : (
          /* Project grid */
          <div className="dash-content">
            <div className="dash-section-header">
              <h2 className="dash-section-title">Meus projetos</h2>
              <button className="dash-new-btn" onClick={() => setShowModal(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
                Novo projeto
              </button>
            </div>

            <div className="dash-grid">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="dash-card"
                  onClick={() => openProject(p.id)}
                >
                  <div className="dash-card-thumb">
                    {p.thumbnail ? (
                      <img src={p.thumbnail} alt={p.name} />
                    ) : (
                      <div className="dash-card-thumb-empty">
                        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                          <path d="M6 8L6 24M6 16L26 8L26 24L6 16Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
                        </svg>
                      </div>
                    )}
                    <div className="dash-card-overlay">
                      <div className="dash-card-play">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M5 3l14 9-14 9V3z"/>
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="dash-card-info">
                    <span className="dash-card-name">{p.name}</span>
                    <span className="dash-card-meta">
                      {formatDate(p.createdAt)}
                      {p.duration !== undefined && <> · {formatDuration(p.duration)}</>}
                    </span>
                  </div>

                  <button
                    className="dash-card-delete"
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(p.id) }}
                    title="Excluir"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* New project modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => { setShowModal(false); setNewName('') }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Novo projeto</h2>
            <p className="modal-sub">Dê um nome para o seu projeto</p>
            <input
              className="modal-input"
              type="text"
              placeholder="Meu projeto incrível"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              maxLength={60}
            />
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => { setShowModal(false); setNewName('') }}>
                Cancelar
              </button>
              <button className="modal-confirm" onClick={handleCreate} disabled={!newName.trim()}>
                Criar projeto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirmId && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Excluir projeto?</h2>
            <p className="modal-sub">Esta ação não pode ser desfeita.</p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setDeleteConfirmId(null)}>
                Cancelar
              </button>
              <button
                className="modal-danger"
                onClick={() => { deleteProject(deleteConfirmId!); setDeleteConfirmId(null) }}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
