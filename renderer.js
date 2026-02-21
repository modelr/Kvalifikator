const out = document.getElementById('out')
const email = document.getElementById('email')
const password = document.getElementById('password')
let pickedFiles = []

function askText(title, placeholder) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.style.position = 'fixed'
    overlay.style.left = 0
    overlay.style.top = 0
    overlay.style.right = 0
    overlay.style.bottom = 0
    overlay.style.background = 'rgba(0,0,0,0.35)'
    overlay.style.display = 'flex'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    overlay.style.zIndex = 9999

    const box = document.createElement('div')
    box.style.width = '520px'
    box.style.background = '#fff'
    box.style.borderRadius = '10px'
    box.style.padding = '14px'
    box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)'

    const h = document.createElement('div')
    h.textContent = title
    h.style.fontSize = '18px'
    h.style.fontWeight = '700'
    h.style.marginBottom = '8px'
	h.className = 'leadTitle'
	
    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = placeholder || ''
    input.style.width = '100%'
    input.style.fontSize = '16px'
    input.style.padding = '8px'
    input.style.boxSizing = 'border-box'

    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.justifyContent = 'flex-end'
    row.style.gap = '10px'
    row.style.marginTop = '10px'

    const btnCancel = document.createElement('button')
    btnCancel.textContent = 'Отмена'

    const btnOk = document.createElement('button')
    btnOk.textContent = 'OK'
    btnOk.style.background = '#78c850'
    btnOk.style.color = '#fff'
    btnOk.style.border = '0'
    btnOk.style.padding = '6px 12px'
    btnOk.style.borderRadius = '6px'

    function close(val) {
      overlay.remove()
      resolve(val)
    }

    btnCancel.onclick = () => close(null)
    btnOk.onclick = () => close(input.value || '')

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(input.value || '')
      if (e.key === 'Escape') close(null)
    })

    row.appendChild(btnCancel)
    row.appendChild(btnOk)

    box.appendChild(h)
    box.appendChild(input)
    box.appendChild(row)

    overlay.appendChild(box)
    document.body.appendChild(overlay)

    input.focus()
  })
}

document.getElementById('btnLogin').addEventListener('click', async () => {
  out.textContent = 'Logging in...'
  const res = await window.api.login(email.value, password.value)
  out.textContent = res.ok ? ('OK. user=' + res.user) : ('Error: ' + res.error)
})

document.getElementById('btnLogout').addEventListener('click', async () => {
  const res = await window.api.logout()
  out.textContent = res.ok ? 'Logged out' : ('Error: ' + res.error)
})

document.getElementById('btnPickFiles').addEventListener('click', async () => {
  const res = await window.api.pickFiles()
  if (!res.ok) {
    out.textContent = 'Pick files error: ' + res.error
    return
  }
  pickedFiles = res.files || []
  document.getElementById('filesInfo').textContent = pickedFiles.length ? `Файлов: ${pickedFiles.length}` : ''
})

document.getElementById('btnCreateLead').addEventListener('click', async () => {
  out.textContent = 'Creating lead...'
    try {
  const text = document.getElementById('leadText').value || ''
  const title = document.getElementById('leadTitle').value
  const res = await window.api.createLead(title, text, pickedFiles)

  if (!res.ok) {
    out.textContent = 'Create lead error: ' + res.error
    return
  }

  out.textContent = res.ok
    ? `Created ${res.q || res.row?.q} id=${res.id || res.row?.id}`
    : `Create lead error: ${res.error}`
  pickedFiles = []
  document.getElementById('filesInfo').textContent = ''
  document.getElementById('leadTitle').value = ''
  document.getElementById('leadText').value = ''
  await refreshBoard()
    } catch (e) {
    out.textContent = 'Create lead error: ' + (e?.message || e)
  }
})

async function refreshList() {
  const list = document.getElementById('list')
  if (!list) return

  const res = await window.api.listLeads()
  if (!res.ok) {
    list.innerHTML = 'List error: ' + res.error
    return
  }

  list.innerHTML = ''
  for (const row of res.rows) {
    const card = document.createElement('div')
    card.style.border = '1px solid #ccc'
    card.style.padding = '8px'
    card.style.marginBottom = '8px'

    const title = document.createElement('div')
    title.innerHTML = `<b>${row.q || row.id}</b> — ${row.created_at || ''}`
    card.appendChild(title)

    const text = document.createElement('pre')
    text.textContent = row.raw || ''
    card.appendChild(text)

    const btnHot = document.createElement('button')
    btnHot.textContent = '🔥 Горячий'
    btnHot.onclick = async () => {
      const r = await window.api.setStatus(row.id, 'hot')
      if (!r.ok) return alert(r.error)
      card.remove()
    }

    const btnWarm = document.createElement('button')
    btnWarm.textContent = '🙂 Тёплый'
    btnWarm.onclick = async () => {
      const r = await window.api.setStatus(row.id, 'warm')
      if (!r.ok) return alert(r.error)
      card.remove()
    }

    const btnCold = document.createElement('button')
    btnCold.textContent = '🥶 Холодный'
    btnCold.onclick = async () => {
      const r = await window.api.setStatus(row.id, 'cold')
      if (!r.ok) return alert(r.error)
      card.remove()
    }

    const btnDone = document.createElement('button')
    btnDone.textContent = '✅ Закрыть'
    btnDone.onclick = async () => {
      const r = await window.api.setStatus(row.id, 'done')
      if (!r.ok) return alert(r.error)
      card.remove()
    }

    card.appendChild(btnHot)
    card.appendChild(document.createTextNode(' '))
    card.appendChild(btnWarm)
    card.appendChild(document.createTextNode(' '))
    card.appendChild(btnCold)
    card.appendChild(document.createTextNode(' '))
    card.appendChild(btnDone)

    list.appendChild(card)
  }
}

// обновлять список после создания сделки:
const oldCreateHandler = document.getElementById('btnCreateLead')
if (oldCreateHandler) {
  // просто дернем refreshList после успешного create (без рефакторинга)
  oldCreateHandler.addEventListener('click', () => setTimeout(refreshList, 600))
}

setTimeout(refreshList, 300)

// автологин-проверка
;(async () => {
  const res = await window.api.getSession()
  if (res.ok && res.session?.user?.email) {
    out.textContent = 'Already logged in: ' + res.session.user.email
  }
})()

function shortTitle(s) {
  const t = (s || '').trim().split('\n')[0] || ''
  return t.length > 14 ? (t.slice(0, 14) + '…') : t
}

function makeCard(row) {
  const card = document.createElement('div')
  card.className = 'card'

  const top = document.createElement('div')
  top.className = 'topRow'

  const btnWait = document.createElement('button')
  btnWait.className = 'tab'
  btnWait.textContent = 'Ждем клиента'

  const btnEst = document.createElement('button')
  btnEst.className = 'tab'
  btnEst.textContent = 'Оцениваем'

  function paintTabs() {
    btnWait.classList.toggle('active', row.status === 'waiting')
    btnEst.classList.toggle('active', row.status !== 'waiting')
  }
  paintTabs()

  btnWait.onclick = async () => {
    const r = await window.api.boardSetStage(row.id, 'waiting')
    if (!r.ok) return alert(r.error)
    row.status = 'waiting'
    paintTabs()
  }

  btnEst.onclick = async () => {
    const r = await window.api.boardSetStage(row.id, 'estimating')
    if (!r.ok) return alert(r.error)
    row.status = 'estimating'
    paintTabs()
  }

  top.appendChild(btnWait)
  top.appendChild(btnEst)
  card.appendChild(top)

const titleRow = document.createElement('div')
titleRow.className = 'titleRow'

const title = document.createElement('div')
title.className = 'titleLine'
title.textContent = `${row.q || ('q-???')}_${shortTitle(row.title || row.raw)}`

const btnInfo = document.createElement('button')
btnInfo.type = 'button'
btnInfo.className = 'btnInfo'
btnInfo.textContent = 'i'
btnInfo.dataset.notes = row.notes_path || ''

const btnFolder = document.createElement('button')
btnFolder.type = 'button'
btnFolder.className = 'btnInfo'
btnFolder.textContent = '📁'
btnFolder.dataset.folder = row.folder_path || ''
btnFolder.title = 'Открыть папку заказа'

titleRow.appendChild(title)
titleRow.appendChild(btnInfo)
titleRow.appendChild(btnFolder)
card.appendChild(titleRow)

  const kv = document.createElement('div')
  kv.className = 'kv'

  const phone = document.createElement('input')
  phone.placeholder = 'тел:'
  phone.value = row.phone || ''

  const email = document.createElement('input')
  email.placeholder = 'email:'
  email.value = row.email || ''

  async function saveContact() {
    const r = await window.api.boardSetContact(row.id, phone.value, email.value)
    if (!r.ok) alert(r.error)
  }
  phone.onchange = saveContact
  email.onchange = saveContact

  kv.appendChild(document.createTextNode('тел: '))
  kv.appendChild(phone)
  kv.appendChild(document.createElement('br'))
  kv.appendChild(document.createTextNode('email: '))
  kv.appendChild(email)
  card.appendChild(kv)

  const bottom = document.createElement('div')
  bottom.className = 'bottomRow'

  const btnReject = document.createElement('button')
  btnReject.className = 'btn danger'
  btnReject.textContent = 'Отказ'
  btnReject.className = 'btnGray'
  btnReject.onclick = async () => {
    const reason = await askText('Причина отказа', 'Введите причину отказа…')
	if (reason === null) return
    const r = await window.api.boardReject(row.id, reason)
    if (!r.ok) return alert(r.error)
    card.remove()
  }

  const btnWork = document.createElement('button')
  btnWork.className = 'btn work'
  btnWork.textContent = 'В работу'
  btnWork.className = 'btnGray'
  btnWork.onclick = async () => {
    const crm = await askText('Номер из CRM', 'Введите номер заказа в CRM…')
	if (crm === null) return
	if (!crm.trim()) return
    const r = await window.api.boardToWork(row.id, crm.trim())
    if (!r.ok) return alert(r.error)
    card.remove()
  }

  bottom.appendChild(btnReject)
  bottom.appendChild(btnWork)
  card.appendChild(bottom)

  return card
}

  const notesModal = document.getElementById('notesModal')
  const notesText = document.getElementById('notesText')
  const btnNotesSave = document.getElementById('btnNotesSave')
  const btnNotesCancel = document.getElementById('btnNotesCancel')

  let currentNotesPath = null

  function openNotesModal(path, text){
    currentNotesPath = path
    notesText.value = text ?? ''
    notesModal.classList.remove('hidden')
  }
  function closeNotesModal(){
    currentNotesPath = null
    notesModal.classList.add('hidden')
  }

  btnNotesCancel.addEventListener('click', () => closeNotesModal())

  btnNotesSave.addEventListener('click', async () => {
    if (!currentNotesPath) return closeNotesModal()
    const res = await window.api.saveNotes(currentNotesPath, notesText.value)
    if (!res.ok) {
      alert('Save error: ' + res.error)
      return
    }
    closeNotesModal()
  })

// делегирование кликов по кнопкам "i"
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btnInfo')
  if (!btn || btn.dataset.folder) return
  const notesPath = btn.dataset.notes
  if (!notesPath) { alert('notes_path пустой'); return }
  const res = await window.api.readNotes(notesPath)
  if (!res.ok) { alert('Read error: ' + res.error); return }
  openNotesModal(notesPath, res.text)
})

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btnInfo[data-folder]')
  if (!btn) return
  const folderPath = btn.dataset.folder
  if (!folderPath) { alert('folder_path пустой'); return }
  const res = await window.api.openFolder(folderPath)
  if (!res.ok) { alert('Open folder error: ' + res.error) }
})

async function refreshBoard() {
  const board = document.getElementById('board')
  if (!board) return
  const res = await window.api.boardList()
  if (!res.ok) {
    board.innerHTML = 'Board error: ' + res.error
    return
  }
  board.innerHTML = ''
  for (const row of res.rows) board.appendChild(makeCard(row))
}

// после запуска и после создания сделки — обновляем доску
setTimeout(refreshBoard, 300)
document.getElementById('btnCreateLead').addEventListener('click', () => setTimeout(refreshBoard, 800))
