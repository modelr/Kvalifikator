const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://vtwgjriksttsjnlcpimz.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_ZxC1Ua1Kbv5pJP5zIv3pmg_kggA7dAX'

const DEFAULT_BASE_DIR = 'D:\\Клиенты 2025\\Квалификатор'

function settingsFilePath() {
  return path.join(app.getPath('userData'), 'app-settings.json')
}

function readSettings() {
  try {
    const p = settingsFilePath()
    if (!fs.existsSync(p)) return {}
    return JSON.parse(fs.readFileSync(p, 'utf-8') || '{}')
  } catch {
    return {}
  }
}

function writeSettings(nextSettings) {
  const p = settingsFilePath()
  fs.writeFileSync(p, JSON.stringify(nextSettings, null, 2), 'utf-8')
}

function getBaseDir() {
  const settings = readSettings()
  return settings.baseDir || DEFAULT_BASE_DIR
}

function setBaseDir(baseDir) {
  const settings = readSettings()
  writeSettings({ ...settings, baseDir })
}

function resolveLeadFolderPath({ folderPath, notesPath }) {
  const baseDir = getBaseDir()

  if (folderPath && fs.existsSync(folderPath)) {
    return folderPath
  }

  const candidateFromFolder = folderPath ? path.basename(path.normalize(folderPath)) : ''
  const candidateFromNotes = notesPath ? path.basename(path.dirname(path.normalize(notesPath))) : ''
  const folderName = candidateFromFolder || candidateFromNotes

  if (!folderName || folderName === '.' || folderName === path.sep) {
    return folderPath || null
  }

  return path.join(baseDir, folderName)
}

function resolveLeadNotesPath({ notesPath, folderPath }) {
  if (notesPath && fs.existsSync(notesPath)) {
    return notesPath
  }

  const fileName = notesPath ? path.basename(path.normalize(notesPath)) : 'notes.txt'
  if (!folderPath) return notesPath || null
  return path.join(folderPath, fileName)
}

function resolveLeadPaths(row) {
  const folder_path = resolveLeadFolderPath({
    folderPath: row?.folder_path,
    notesPath: row?.notes_path,
  })

  const notes_path = resolveLeadNotesPath({
    notesPath: row?.notes_path,
    folderPath: folder_path,
  })

  return {
    ...row,
    folder_path,
    notes_path,
  }
}


// ---------- storage: сохраняем сессию в файл ----------
function storageFilePath() {
  return path.join(app.getPath('userData'), 'supabase-auth.json')
}

const fileStorage = {
  getItem: (key) => {
    try {
      const p = storageFilePath()
      if (!fs.existsSync(p)) return null
      const json = JSON.parse(fs.readFileSync(p, 'utf-8') || '{}')
      return json[key] ?? null
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    const p = storageFilePath()
    let json = {}
    try {
      if (fs.existsSync(p)) json = JSON.parse(fs.readFileSync(p, 'utf-8') || '{}')
    } catch {}
    json[key] = value
    fs.writeFileSync(p, JSON.stringify(json, null, 2), 'utf-8')
  },
  removeItem: (key) => {
    const p = storageFilePath()
    if (!fs.existsSync(p)) return
    let json = {}
    try {
      json = JSON.parse(fs.readFileSync(p, 'utf-8') || '{}')
    } catch {}
    delete json[key]
    fs.writeFileSync(p, JSON.stringify(json, null, 2), 'utf-8')
  },
}

// ---------- единственный клиент, который хранит сессию ----------
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: fileStorage,
  },
})

// JWT decode (без проверки подписи) — чисто для дебага роли
function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1]
    const s = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(s)
  } catch {
    return null
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.loadFile('index.html')
}

ipcMain.handle('auth:login', async (_evt, { email, password }) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }
  return { ok: true, user: data.user?.email ?? null }
})

ipcMain.handle('auth:logout', async () => {
  const { error } = await supabase.auth.signOut()
  if (error) return { ok: false, error: error.message }
  return { ok: true }
})

ipcMain.handle('auth:session', async () => {
  const { data, error } = await supabase.auth.getSession()
  if (error) return { ok: false, error: error.message }
  return { ok: true, session: data.session }
})


ipcMain.handle('settings:getBaseDir', async () => {
  const baseDir = getBaseDir()
  return { ok: true, baseDir }
})

ipcMain.handle('settings:pickBaseDir', async () => {
  const currentPath = getBaseDir()
  const res = await dialog.showOpenDialog({
    defaultPath: currentPath,
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    title: 'Выберите папку Квалификатор',
  })

  if (res.canceled || !res.filePaths?.length) {
    return { ok: false, error: 'Выбор папки отменён' }
  }

  const [baseDir] = res.filePaths
  setBaseDir(baseDir)
  return { ok: true, baseDir }
})

ipcMain.handle('fs:pickFiles', async () => {
  const res = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
  })
  if (res.canceled) return { ok: true, files: [] }
  return { ok: true, files: res.filePaths }
})

ipcMain.handle('leads:create', async (_evt, { title, text, files }) => {
  // 1) сессия
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) return { ok: false, error: 'Not logged in' }

  const jwt = decodeJwtPayload(token)
  const user_id = jwt?.sub
  if (!user_id) return { ok: false, error: 'No user_id in token' }

  // 2) делаем Q-номер по id в БД (самый простой способ: вставляем строку-заготовку, получаем id)
  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  })

  const { data: row0, error: e0 } = await supabaseAuthed
    .from('leads')
    .insert({
      user_id,
      title: (title || 'new'),
      raw: text,
      status: 'estimating',
      waiting_tooltip: null,
      estimating_tooltip: null,
    })
    .select()
    .single()

  if (e0) return { ok: false, error: e0.message }

  const id = row0.id
  const q = `q-${String(id).padStart(3, '0')}`

  const safe = (s) => String(s || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')  // запрещённые для Windows
    .replace(/\s+/g, ' ')
    .slice(0, 40)

  const titleClean = safe(title)
  const folderName = titleClean ? `${q}_${titleClean}` : q

  // 3) папка сделки
  const baseDir = getBaseDir()
  const folder = path.join(baseDir, folderName)
  fs.mkdirSync(folder, { recursive: true })

  // 4) notes.txt
  const notesPath = path.join(folder, 'notes.txt')
  fs.writeFileSync(notesPath, text || '', 'utf-8')

  // 5) копируем файлы
  const copied = []
  const fileList = Array.isArray(files) ? files : []
  for (const src of fileList) {
    const name = path.basename(src)
    const dst = path.join(folder, name)
    fs.copyFileSync(src, dst)
    copied.push(dst)
  }

  // 6) обновляем запись путями
  const { data: row1, error: e1 } = await supabaseAuthed
    .from('leads')
    .update({ q, folder_path: folder, notes_path: notesPath })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (e1) return { ok: false, error: e1.message }

  return { ok: true, row: row1, copied, id, q, folder, notesPath }
})

ipcMain.handle('board:list', async () => {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) return { ok: false, error: 'Not logged in' }

  const jwt = decodeJwtPayload(token)
  const user_id = jwt?.sub
  if (!user_id) return { ok: false, error: 'No user_id in token' }

  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await supabaseAuthed
    .from('leads')
    .select('id,q,title,phone,email,status,folder_path,notes_path,waiting_tooltip,estimating_tooltip,created_at')
    .eq('user_id', user_id)
    .in('status', ['new', 'estimating', 'waiting'])
    .order('id', { ascending: false })

  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: (data || []).map(resolveLeadPaths) }
})

ipcMain.handle('board:setStage', async (_evt, { id, status }) => {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) return { ok: false, error: 'Not logged in' }

  const jwt = decodeJwtPayload(token)
  const user_id = jwt?.sub
  if (!user_id) return { ok: false, error: 'No user_id in token' }

  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  })

  const { error } = await supabaseAuthed
    .from('leads')
    .update({ status })
    .eq('id', id)
    .eq('user_id', user_id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
})


ipcMain.handle('board:setTooltip', async (_evt, { id, stage, tooltip }) => {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) return { ok: false, error: 'Not logged in' }

  const jwt = decodeJwtPayload(token)
  const user_id = jwt?.sub
  if (!user_id) return { ok: false, error: 'No user_id in token' }

  const stageToColumn = {
    waiting: 'waiting_tooltip',
    estimating: 'estimating_tooltip',
  }

  const column = stageToColumn[stage]
  if (!column) return { ok: false, error: 'Invalid stage for tooltip' }

  const normalizedTooltip = typeof tooltip === 'string' ? tooltip.trim() : ''

  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  })

  const { error } = await supabaseAuthed
    .from('leads')
    .update({ [column]: normalizedTooltip || null })
    .eq('id', id)
    .eq('user_id', user_id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
})

ipcMain.handle('board:setContact', async (_evt, { id, phone, email }) => {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) return { ok: false, error: 'Not logged in' }

  const jwt = decodeJwtPayload(token)
  const user_id = jwt?.sub
  if (!user_id) return { ok: false, error: 'No user_id in token' }

  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  })

  const { error } = await supabaseAuthed
    .from('leads')
    .update({ phone: phone || null, email: email || null })
    .eq('id', id)
    .eq('user_id', user_id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
})

ipcMain.handle('board:reject', async (_evt, { id, reason }) => {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) return { ok: false, error: 'Not logged in' }

  const jwt = decodeJwtPayload(token)
  const user_id = jwt?.sub
  if (!user_id) return { ok: false, error: 'No user_id in token' }

  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  })

  const { data: row, error: eGet } = await supabaseAuthed
    .from('leads')
    .select('folder_path')
    .eq('id', id)
    .eq('user_id', user_id)
    .maybeSingle()

  if (eGet) return { ok: false, error: eGet.message }

  const folder = resolveLeadFolderPath({
    folderPath: row?.folder_path,
  })
  if (folder) {
    const p = path.join(folder, 'Причина отказа.txt')
    fs.writeFileSync(p, String(reason || ''), 'utf-8')
  }

  const { error } = await supabaseAuthed
    .from('leads')
    .update({ status: 'rejected', reject_reason: reason || null })
    .eq('id', id)
    .eq('user_id', user_id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
})

ipcMain.handle('board:toWork', async (_evt, { id, crmNumber }) => {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) return { ok: false, error: 'Not logged in' }

  const jwt = decodeJwtPayload(token)
  const user_id = jwt?.sub
  if (!user_id) return { ok: false, error: 'No user_id in token' }

  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  })

  const { data: row, error: eGet } = await supabaseAuthed
    .from('leads')
    .select('folder_path')
    .eq('id', id)
    .eq('user_id', user_id)
    .maybeSingle()

  if (eGet) return { ok: false, error: eGet.message }

  const folder = resolveLeadFolderPath({
    folderPath: row?.folder_path,
  })
  if (folder) {
    const p = path.join(folder, 'Номер заказа в СРМ.txt')
    fs.writeFileSync(p, String(crmNumber || ''), 'utf-8')
  }

  const { error } = await supabaseAuthed
    .from('leads')
    .update({ status: 'in_work', crm_number: crmNumber || null })
    .eq('id', id)
    .eq('user_id', user_id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
})

ipcMain.handle('leads:list', async () => {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) return { ok: false, error: 'Not logged in' }

  const jwt = decodeJwtPayload(token)
  const user_id = jwt?.sub
  if (!user_id) return { ok: false, error: 'No user_id in token' }

  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await supabaseAuthed
    .from('leads')
    .select('id,q,created_at,title,raw,status,folder_path,notes_path')
    .eq('user_id', user_id)
    .eq('status', 'new')
    .order('id', { ascending: false })

  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: (data || []).map(resolveLeadPaths) }
})

ipcMain.handle('leads:setStatus', async (_evt, { id, status }) => {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) return { ok: false, error: 'Not logged in' }

  const jwt = decodeJwtPayload(token)
  const user_id = jwt?.sub
  if (!user_id) return { ok: false, error: 'No user_id in token' }

  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  })

  const { error } = await supabaseAuthed
    .from('leads')
    .update({ status })
    .eq('id', id)
    .eq('user_id', user_id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
})

// === notes editor ===
ipcMain.handle('leads:readNotes', async (_evt, { notesPath }) => {
  try {
    if (!notesPath) return { ok: false, error: 'notesPath is empty' }
    const resolvedNotesPath = resolveLeadNotesPath({ notesPath, folderPath: null })
    const text = await fs.promises.readFile(resolvedNotesPath, 'utf8')
    return { ok: true, text, notesPath: resolvedNotesPath }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
})

ipcMain.handle('leads:saveNotes', async (_evt, { notesPath, text }) => {
  try {
    if (!notesPath) return { ok: false, error: 'notesPath is empty' }
    const resolvedNotesPath = resolveLeadNotesPath({ notesPath, folderPath: null })
    await fs.promises.writeFile(resolvedNotesPath, String(text ?? ''), 'utf8')
    return { ok: true, notesPath: resolvedNotesPath }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
})


ipcMain.handle('leads:openFolder', async (_evt, { folderPath }) => {
  try {
    if (!folderPath) return { ok: false, error: 'folderPath is empty' }
    const resolvedFolderPath = resolveLeadFolderPath({ folderPath })
    const result = await shell.openPath(resolvedFolderPath)
    if (result) return { ok: false, error: result }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
})

app.whenReady().then(createWindow)