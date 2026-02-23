const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSession: () => ipcRenderer.invoke('auth:session'),
  getBaseDir: () => ipcRenderer.invoke('settings:getBaseDir'),
  pickBaseDir: () => ipcRenderer.invoke('settings:pickBaseDir'),
  
  pickFiles: () => ipcRenderer.invoke('fs:pickFiles'),
  createLead: (title, text, files) => ipcRenderer.invoke('leads:create', { title, text, files }),
  listLeads: () => ipcRenderer.invoke('leads:list'),
  setStatus: (id, status) => ipcRenderer.invoke('leads:setStatus', { id, status }),

  boardList: () => ipcRenderer.invoke('board:list'),
  boardSetStage: (id, status, noteText) => ipcRenderer.invoke('board:setStage', { id, status, noteText }),
  boardSetContact: (id, phone, email) => ipcRenderer.invoke('board:setContact', { id, phone, email }),
  boardReject: (id, reason) => ipcRenderer.invoke('board:reject', { id, reason }),
  boardToWork: (id, crmNumber) => ipcRenderer.invoke('board:toWork', { id, crmNumber }),
  readNotes: (notesPath) => ipcRenderer.invoke('leads:readNotes', { notesPath }),
  saveNotes: (id, notesPath, text) => ipcRenderer.invoke('leads:saveNotes', { id, notesPath, text }),
  openFolder: (folderPath) => ipcRenderer.invoke('leads:openFolder', { folderPath }),
})
