import React, { useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useAuthStore } from '../store/useAuthStore'
import { formatTime } from '../utils/audioAnalyzer'
import { ExportModal } from './ExportModal'

export function Toolbar({ saveStatus }: { saveStatus?: 'saved' | 'saving' | '' }): React.ReactElement {
  const { project, setProject, currentTime, undo, redo, splitAtPlayhead, isPlaying, setIsPlaying, selectedClipId, duplicateClip, copyClip, pasteClip } = useEditorStore()
  const { setActiveProject, activeProjectId, projects, currentUser } = useAuthStore()
  const [showExport, setShowExport] = useState(false)

  const projectName = projects.find((p) => p.id === activeProjectId)?.name ?? 'Projeto'

  return (
    <>
      <div className="editor-toolbar" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        {/* Back */}
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button className="toolbar-back-btn" onClick={() => setActiveProject(null)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Projetos
          </button>
        </div>

        {/* Logo */}
        <div className="toolbar-logo" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="toolbar-logo-icon">
            <svg width="13" height="13" viewBox="0 0 32 32" fill="none">
              <path d="M6 8L6 24M6 16L26 8L26 24L6 16Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="toolbar-logo-text">cineo</span>
        </div>

        <span className="toolbar-project-name" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {projectName}
        </span>

        <div className="toolbar-gap" />

        {/* Edit controls */}
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button className="toolbar-btn" onClick={undo} title="Desfazer (Ctrl+Z)">
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 0 1 0 16H7M3 10l4-4M3 10l4 4"/></svg>
          </button>
          <button className="toolbar-btn" onClick={redo} title="Refazer (Ctrl+Y)">
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 0 0 0 16h6M21 10l-4-4M21 10l-4 4"/></svg>
          </button>

          <div className="toolbar-divider" />

          <button className="toolbar-btn" onClick={splitAtPlayhead} title="Dividir clipe (S)">
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v20M2 12h4M18 12h4"/></svg>
          </button>
          <button className="toolbar-btn" onClick={() => selectedClipId && copyClip(selectedClipId)} title="Copiar (Ctrl+C)" disabled={!selectedClipId}>
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2"/></svg>
          </button>
          <button className="toolbar-btn" onClick={() => pasteClip()} title="Colar (Ctrl+V)">
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" stroke="currentColor" strokeWidth="2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1" stroke="currentColor" strokeWidth="2"/></svg>
          </button>
          <button className="toolbar-btn" onClick={() => selectedClipId && duplicateClip(selectedClipId)} title="Duplicar (Ctrl+D)" disabled={!selectedClipId}>
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 9H11a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z" stroke="currentColor" strokeWidth="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 0 2 2v1" stroke="currentColor" strokeWidth="2"/></svg>
          </button>
        </div>

        <div className="toolbar-divider" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} />

        {/* Time + settings */}
        <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button className="toolbar-btn" onClick={() => setIsPlaying(!isPlaying)} title="Play/Pause (Espaço)" style={{ width: 28, height: 28 }}>
              {isPlaying
                ? <svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                : <svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              }
            </button>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#aaaacc', minWidth: 60 }}>{formatTime(currentTime)}</span>
          </div>

          <select
            value={project.fps}
            onChange={(e) => setProject({ fps: Number(e.target.value) })}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '3px 8px', color: '#8888aa', fontSize: 11, cursor: 'pointer', outline: 'none' }}
          >
            {[24, 25, 30, 50, 60].map((f) => <option key={f} value={f} style={{ background: '#0f0c20' }}>{f} FPS</option>)}
          </select>

          <select
            value={`${project.width}x${project.height}`}
            onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); setProject({ width: w, height: h }) }}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '3px 8px', color: '#8888aa', fontSize: 11, cursor: 'pointer', outline: 'none' }}
          >
            <option value="3840x2160" style={{ background: '#0f0c20' }}>4K</option>
            <option value="2560x1440" style={{ background: '#0f0c20' }}>2K</option>
            <option value="1920x1080" style={{ background: '#0f0c20' }}>1080p</option>
            <option value="1280x720" style={{ background: '#0f0c20' }}>720p</option>
            <option value="1080x1920" style={{ background: '#0f0c20' }}>Vertical</option>
            <option value="1080x1080" style={{ background: '#0f0c20' }}>Quadrado</option>
          </select>
        </div>

        {/* Save status */}
        {saveStatus && (
          <div style={{ WebkitAppRegion: 'no-drag', fontSize: 10, color: saveStatus === 'saved' ? '#34d399' : '#8888aa', display: 'flex', alignItems: 'center', gap: 4 } as React.CSSProperties}>
            {saveStatus === 'saving'
              ? <><span className="login-spinner" style={{ width: 8, height: 8 }} />Salvando...</>
              : <>✓ Salvo</>}
          </div>
        )}

        {/* Pro badge + export */}
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {currentUser?.isPro && (
            <div style={{ padding: '3px 8px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderRadius: 5, fontSize: 10, fontWeight: 700, color: '#1a0a00', letterSpacing: '0.5px' }}>PRO</div>
          )}

          <button className="toolbar-export-btn" onClick={() => setShowExport(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Exportar
          </button>
        </div>

        {/* Window controls — hidden on mobile */}
        {!(window as any).__CINEO_MOBILE__ && (
          <div className="flex items-center gap-1 ml-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button className="toolbar-btn" onClick={() => window.electron.minimizeWindow()} title="Minimizar">
              <svg width="9" height="2" viewBox="0 0 10 2" fill="currentColor"><rect width="10" height="2" rx="1"/></svg>
            </button>
            <button className="toolbar-btn" onClick={() => window.electron.maximizeWindow()} title="Maximizar">
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="8" height="8" rx="1"/></svg>
            </button>
            <button className="toolbar-btn" onClick={() => window.electron.closeWindow()} title="Fechar" style={{ '--btn-hover-color': '#ef4444' } as React.CSSProperties}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '')}>
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l8 8M9 1L1 9"/></svg>
            </button>
          </div>
        )}
      </div>

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </>
  )
}
