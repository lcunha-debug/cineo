import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  openMediaDialog: () => ipcRenderer.invoke('dialog:open-media'),
  getMediaMetadata: (filePath: string) => ipcRenderer.invoke('media:metadata', filePath),
  generateThumbnail: (filePath: string, time: number) => ipcRenderer.invoke('media:thumbnail', filePath, time),
  openSaveDialog: (defaultName?: string, format?: string) => ipcRenderer.invoke('export:save-dialog', defaultName, format),
  openFile: (filters?: { name: string; extensions: string[] }[]) => ipcRenderer.invoke('dialog:open-file', filters ?? []),
  renderExport: (clips: unknown[], outputPath: string, options: unknown) =>
    ipcRenderer.invoke('export:render', clips, outputPath, options),
  onExportProgress: (cb: (progress: number) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, p: number) => cb(p)
    ipcRenderer.on('export:progress', handler)
    return () => ipcRenderer.removeListener('export:progress', handler)
  },
  analyzeAudio: (filePath: string, options: unknown) => ipcRenderer.invoke('media:analyze-audio', filePath, options),
  onAnalyzeProgress: (cb: (p: number) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, p: number) => cb(p)
    ipcRenderer.on('analyze:progress', handler)
    return () => ipcRenderer.removeListener('analyze:progress', handler)
  },
  extractAudio: (filePath: string) => ipcRenderer.invoke('media:extract-audio', filePath),
  readBinaryFile: (path: string) => ipcRenderer.invoke('fs:read-binary', path),
  readTextFile: (path: string) => ipcRenderer.invoke('fs:read-text', path),
  writeTextFile: (path: string, content: string) => ipcRenderer.invoke('fs:write-text', path, content),
  saveProject: (projectId: string, data: string) => ipcRenderer.invoke('project:save', projectId, data),
  loadProject: (projectId: string) => ipcRenderer.invoke('project:load', projectId),
  transcribeAudio: (filePath: string, clipStartOffset: number) => ipcRenderer.invoke('media:transcribe', filePath, clipStartOffset),
  onTranscribeProgress: (cb: (p: number) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, p: number) => cb(p)
    ipcRenderer.on('transcribe:progress', handler)
    return () => ipcRenderer.removeListener('transcribe:progress', handler)
  },
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close')
})
