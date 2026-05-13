import { create } from 'zustand'

// ── Pro user registry ────────────────────────────────────────────────────────
// Hardcoded pro users (case-insensitive username match)
const PRO_USERS = new Set(['rox.criador', 'admin'])

function isProUser(username: string): boolean {
  return PRO_USERS.has(username.toLowerCase())
}

export interface User {
  id: string
  username: string
  createdAt: number
  isPro: boolean
}

export interface Project {
  id: string
  name: string
  createdAt: number
  thumbnail?: string
  duration?: number
}

interface AuthState {
  currentUser: User | null
  projects: Project[]
  login: (username: string, password: string) => { ok: boolean; error?: string }
  register: (username: string, password: string) => { ok: boolean; error?: string }
  logout: () => void
  createProject: (name: string) => Project
  deleteProject: (id: string) => void
  renameProject: (id: string, name: string) => void
  duplicateProject: (id: string) => void
  openProject: (id: string) => void
  activeProjectId: string | null
  setActiveProject: (id: string | null) => void
  proUsers: string[]
}

type StoredUser = { id: string; username: string; password: string; createdAt: number }

function getUsers(): Record<string, StoredUser> {
  try { return JSON.parse(localStorage.getItem('cineo_users') ?? '{}') } catch { return {} }
}
function saveUsers(users: Record<string, StoredUser>) {
  localStorage.setItem('cineo_users', JSON.stringify(users))
}
function getSession(): User | null {
  try { return JSON.parse(localStorage.getItem('cineo_session') ?? 'null') } catch { return null }
}
function getUserProjects(userId: string): Project[] {
  try { return JSON.parse(localStorage.getItem(`cineo_projects_${userId}`) ?? '[]') } catch { return [] }
}
function saveUserProjects(userId: string, projects: Project[]) {
  localStorage.setItem(`cineo_projects_${userId}`, JSON.stringify(projects))
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: getSession(),
  projects: getSession() ? getUserProjects(getSession()!.id) : [],
  activeProjectId: null,
  proUsers: Array.from(PRO_USERS),

  login: (username, password) => {
    if (!username.trim() || !password.trim())
      return { ok: false, error: 'Preencha todos os campos' }
    const users = getUsers()
    const user = users[username.toLowerCase()]
    if (!user) return { ok: false, error: 'Usuário não encontrado' }
    if (user.password !== password) return { ok: false, error: 'Senha incorreta' }
    const session: User = {
      id: user.id, username: user.username,
      createdAt: user.createdAt, isPro: isProUser(user.username)
    }
    localStorage.setItem('cineo_session', JSON.stringify(session))
    set({ currentUser: session, projects: getUserProjects(user.id) })
    return { ok: true }
  },

  register: (username, password) => {
    if (!username.trim()) return { ok: false, error: 'Informe um nome de usuário' }
    if (username.trim().length < 3) return { ok: false, error: 'Mínimo 3 caracteres no nome' }
    if (!password.trim()) return { ok: false, error: 'Informe uma senha' }
    if (password.length < 4) return { ok: false, error: 'Mínimo 4 caracteres na senha' }
    const users = getUsers()
    if (users[username.toLowerCase()]) return { ok: false, error: 'Usuário já existe' }
    const id = `user_${Date.now()}`
    users[username.toLowerCase()] = { id, username: username.trim(), password, createdAt: Date.now() }
    saveUsers(users)
    const session: User = { id, username: username.trim(), createdAt: Date.now(), isPro: isProUser(username.trim()) }
    localStorage.setItem('cineo_session', JSON.stringify(session))
    set({ currentUser: session, projects: [] })
    return { ok: true }
  },

  logout: () => {
    localStorage.removeItem('cineo_session')
    set({ currentUser: null, projects: [], activeProjectId: null })
  },

  createProject: (name) => {
    const { currentUser, projects } = get()
    if (!currentUser) throw new Error('Not logged in')
    const project: Project = {
      id: `proj_${Date.now()}`,
      name: name.trim() || 'Projeto sem título',
      createdAt: Date.now()
    }
    const updated = [project, ...projects]
    saveUserProjects(currentUser.id, updated)
    set({ projects: updated })
    return project
  },

  deleteProject: (id) => {
    const { currentUser, projects } = get()
    if (!currentUser) return
    const updated = projects.filter((p) => p.id !== id)
    saveUserProjects(currentUser.id, updated)
    set({ projects: updated })
  },

  renameProject: (id, name) => {
    const { currentUser, projects } = get()
    if (!currentUser) return
    const updated = projects.map((p) => p.id === id ? { ...p, name } : p)
    saveUserProjects(currentUser.id, updated)
    set({ projects: updated })
  },

  duplicateProject: (id) => {
    const { currentUser, projects } = get()
    if (!currentUser) return
    const orig = projects.find((p) => p.id === id)
    if (!orig) return
    const copy: Project = { ...orig, id: `proj_${Date.now()}`, name: `${orig.name} (cópia)`, createdAt: Date.now() }
    const updated = [copy, ...projects]
    saveUserProjects(currentUser.id, updated)
    set({ projects: updated })
  },

  openProject: (id) => set({ activeProjectId: id }),
  setActiveProject: (id) => set({ activeProjectId: id })
}))
