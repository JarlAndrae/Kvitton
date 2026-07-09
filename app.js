const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY) 

let state = { families:[], periods:[], receipts:[], periodFamilies:[], platser:[], selectedPeriodId:null }
let receiptFilter = null // family_id or null = all
let activeTab = 'receipts'
let hideTemporaryFamilies = false

let currentKlanId = null
let currentKlanName = ''

// ── GLOBAL FELHANTERING ────────────────────────────────────────────────────────
// Istället för att appen bara hänger sig/kraschar tyst vid ett oväntat fel,
// visas felet i en banner högst upp så det går att felsöka/rapportera.
function showError(msg){
  let el = document.getElementById('errorBanner')
  if(!el){
    el = document.createElement('div')
    el.id = 'errorBanner'
    document.body.prepend(el)
  }
  el.style.cssText = 'position:sticky;top:0;z-index:9999;background:#c1121f;color:#fff;padding:10px 14px;font-size:13px;display:flex;gap:10px;align-items:flex-start'
  el.innerHTML = `<span style="flex:1">⚠️ Ett fel uppstod: ${esc(String(msg).slice(0,300))}</span><button onclick="this.parentElement.style.display='none'" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer;line-height:1;flex-shrink:0">✕</button>`
  el.style.display='flex'
}
window.addEventListener('error', e => showError(e.message || 'Okänt fel'))
window.addEventListener('unhandledrejection', e => showError((e.reason && e.reason.message) || String(e.reason) || 'Okänt fel (promise)'))

// ── KLAN GATE (lösenordsbaserad) ────────────────────────────────────────────
function boot(){
  const params = new URLSearchParams(window.location.search)
  if(params.has('admin')){ renderAdminLogin(); return }
  const savedId = localStorage.getItem('kvitton_klan_id')
  const savedName = localStorage.getItem('kvitton_klan_name')
  if(savedId && savedName){
    currentKlanId = savedId
    currentKlanName = savedName
    enterApp()
  } else {
    renderGateLogin()
  }
}

function gate(html){
  document.getElementById('mainApp').style.display='none'
  const g = document.getElementById('authGate')
  g.style.display='block'
  g.innerHTML = html
}

function hideGate(){ document.getElementById('authGate').style.display='none'; document.getElementById('authGate').innerHTML='' }

function renderGateLogin(){
  gate(`<div class="gate"><div class="gate-box">
    <h2>Hushållskostnader</h2>
    <p>Ange klanens namn och lösenord för att komma in.</p>
    <div class="fg"><label>Klanens namn</label><input id="gate-name" placeholder="t.ex. Sommarhuset"/></div>
    <div class="fg"><label>Lösenord</label><input id="gate-password" type="password"/></div>
    <button class="btn btn-p" style="width:100%" onclick="tryLoginKlan()">Logga in</button>
    <div class="gate-status" id="gate-status"></div>
  </div></div>`)
}

async function tryLoginKlan(){
  const name = document.getElementById('gate-name').value.trim()
  const password = document.getElementById('gate-password').value
  const statusEl = document.getElementById('gate-status')
  if(!name || !password){ statusEl.textContent='Fyll i både namn och lösenord.'; return }
  statusEl.textContent='Loggar in…'
  const { data, error } = await sb.rpc('login_klan', { p_name: name, p_password: password })
  if(error){ statusEl.textContent='Fel: '+error.message; return }
  if(!data || !data.length){ statusEl.textContent='Fel namn eller lösenord.'; return }
  currentKlanId = data[0].id
  currentKlanName = data[0].name
  localStorage.setItem('kvitton_klan_id', currentKlanId)
  localStorage.setItem('kvitton_klan_name', currentKlanName)
  enterApp()
}

function switchKlan(){
  localStorage.removeItem('kvitton_klan_id')
  localStorage.removeItem('kvitton_klan_name')
  localStorage.removeItem('kvitton_period')
  currentKlanId = null
  renderGateLogin()
}

async function enterApp(){
  hideGate()
  document.getElementById('mainApp').style.display=''
  document.getElementById('klanPill').textContent = '👥 '+currentKlanName
  renderSwitcher()
  await init()
}

// ── VÄXLINGSMENY (Hushållskostnader / Vistelseplanering / Fastighetskostnader / Projekt) ─────────────────
function renderSwitcher(){
  const items = [
    {key:'kvitton', icon:'🧾', label:'Hushållskostnader', href:'./'},
    {key:'planering', icon:'🗓️', label:'Vistelseplanering', href:'planering/'},
    {key:'bastadkonto', icon:'🏠', label:'Fastighetskostnader', href:'bastadkonto/'},
    {key:'projekt', icon:'✅', label:'Projekt', href:'bastadkonto/?tab=projects'},
  ]
  const el = document.getElementById('appSwitcher')
  if(!el) return
  el.innerHTML = items.map(it=>`<a class="switch-item ${it.key==='kvitton'?'on':''}" href="${it.href}">${it.icon} ${it.label}</a>`).join('')
}

// ── ADMIN ─────────────────────────────────────────────────────────────────────
function renderAdminLogin(){
  gate(`<div class="gate"><div class="gate-box">
    <h2>Admin</h2>
    <div class="fg"><label>Admin-lösenord</label><input id="admin-password" type="password" autofocus/></div>
    <button class="btn btn-p" style="width:100%" onclick="tryAdminLogin()">Logga in</button>
    <div class="gate-status" id="admin-login-status"></div>
  </div></div>`)
}

async function tryAdminLogin(){
  const pw = document.getElementById('admin-password').value
  const statusEl = document.getElementById('admin-login-status')
  if(pw !== ADMIN_PASSWORD){ statusEl.textContent='Fel lösenord.'; return }
  await renderAdminPanel()
}

async function renderAdminPanel(){
  gate('<div class="gate"><div class="gate-box" style="max-width:520px"><div class="loading">Laddar…</div></div></div>')
  const { data, error } = await sb.from('klaner').select('*').order('created_at',{ascending:false})
  if(error){ gate(`<div class="gate"><div class="gate-box"><h2>Fel</h2><p>${esc(error.message)}</p></div></div>`); return }
  const rows = (data||[]).map(k=>`
    <div class="card" style="text-align:left">
      <div class="card-hdr">
        <div>
          <div class="card-title">${esc(k.name)}</div>
          <div class="card-sub">Lösenord: <code>${esc(k.password||'')}</code></div>
          <div class="card-sub">Skapad: ${new Date(k.created_at).toLocaleDateString('sv-SE')}</div>
        </div>
        <div class="btn-row" style="flex-direction:column;align-items:flex-end">
          <button class="btn btn-g btn-sm" onclick="adminEditKlan('${k.id}','${esc(k.name).replace(/'/g,"\\'")}','${esc(k.password||'').replace(/'/g,"\\'")}')">Redigera</button>
          <button class="btn btn-d btn-sm" onclick="adminDeleteKlan('${k.id}','${esc(k.name).replace(/'/g,"\\'")}')">Ta bort</button>
        </div>
      </div>
    </div>`).join('')
  gate(`<div class="gate" style="align-items:flex-start;padding-top:40px"><div class="gate-box" style="max-width:520px">
    <h2>Admin – alla klaner (${(data||[]).length})</h2>
    <p>Bara du ser den här sidan.</p>
    ${rows || '<p class="empty">Inga klaner ännu.</p>'}
    <button class="btn btn-g" style="width:100%;margin-top:10px" onclick="location.href=location.pathname">Stäng admin</button>
  </div></div>`)
}

function adminEditKlan(id, name, password){
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Redigera klan</div>
    <div class="fg"><label>Namn</label><input id="admin-edit-name" value="${esc(name)}"/></div>
    <div class="fg"><label>Lösenord</label><input id="admin-edit-password" value="${esc(password)}"/></div>
    <div class="gate-status" id="admin-edit-status"></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="adminSaveKlan('${id}')">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function adminSaveKlan(id){
  const name = document.getElementById('admin-edit-name').value.trim()
  const password = document.getElementById('admin-edit-password').value
  const statusEl = document.getElementById('admin-edit-status')
  if(!name || !password){ statusEl.textContent='Fyll i både namn och lösenord.'; return }
  const { error } = await sb.from('klaner').update({name,password}).eq('id',id)
  if(error){ statusEl.textContent='Fel: '+error.message; return }
  closeModal()
  await renderAdminPanel()
}

async function adminDeleteKlan(id, name){
  if(!confirm(`Ta bort klanen "${name}" och ALL dess data (familjer, perioder, kvitton)? Går inte att ångra.`)) return
  await sb.from('receipts').delete().eq('klan_id',id)
  await sb.from('period_families').delete().eq('klan_id',id)
  await sb.from('periods').delete().eq('klan_id',id)
  await sb.from('families').delete().eq('klan_id',id)
  await sb.from('platser').delete().eq('klan_id',id)
  await sb.from('klaner').delete().eq('id',id)
  await renderAdminPanel()
}

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init() {
  showLoading()
  try{
    const [f,p,r,pf,pl] = await Promise.all([
      sb.from('families').select('*').eq('klan_id',currentKlanId).order('name'),
      sb.from('periods').select('*').eq('klan_id',currentKlanId).order('starts_at',{ascending:false}),
      sb.from('receipts').select('*').eq('klan_id',currentKlanId).order('date',{ascending:false}),
      sb.from('period_families').select('*').eq('klan_id',currentKlanId),
      sb.from('platser').select('*').eq('klan_id',currentKlanId).order('recurring',{ascending:false}).order('name'),
    ])
    state.families = f.data||[]
    state.periods = p.data||[]
    state.receipts = r.data||[]
    state.periodFamilies = pf.data||[]
    state.platser = pl.data||[]
    const savedPeriodId = localStorage.getItem('kvitton_period')
    if(state.periods.length){
      if(savedPeriodId && state.periods.find(p=>p.id===savedPeriodId)){
        state.selectedPeriodId = savedPeriodId
      } else if(!state.selectedPeriodId){
        state.selectedPeriodId = state.periods[0].id
      }
    }
    renderPeriodSelect()
    renderActive()
  }catch(err){
    console.error(err)
    showError(err.message || String(err))
    const el = document.getElementById('tab-'+activeTab)
    if(el) el.innerHTML = '<p class="empty">Kunde inte ladda data. Felmeddelandet syns högst upp.</p>'
  }
}

function showLoading(){ const el=document.getElementById('tab-'+activeTab); if(el) el.innerHTML='<div class="loading">Laddar…</div>' }

function renderPeriodSelect(){
  const sel = document.getElementById('periodSel')
  const createBtn = document.getElementById('createPeriodBtn')
  if(!state.periods.length){
    sel.style.display='none'
    createBtn.style.display=''
    return
  }
  sel.style.display=''
  createBtn.style.display='none'
  sel.innerHTML = state.periods.map(p=>`<option value="${p.id}" ${p.id===state.selectedPeriodId?'selected':''}>${p.status==='avräknad'?'🔒 ':''}${esc(p.name)}</option>`).join('')
}

function onPeriodChange(id){ state.selectedPeriodId=id; localStorage.setItem('kvitton_period',id); renderActive() }

function showTab(name,btn){
  document.getElementById('tab-'+activeTab).style.display='none'
  document.getElementById('tab-'+name).style.display=''
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('on'))
  if(btn) btn.classList.add('on')
  activeTab=name
  renderActive()
}

function renderActive(){ render(activeTab) }

function render(tab){
  const el = document.getElementById('tab-'+tab)
  try{
    if(tab==='receipts') el.innerHTML = renderReceipts()
    if(tab==='report')   el.innerHTML = renderReport()
    if(tab==='families') el.innerHTML = renderFamilies()
    if(tab==='periods')  el.innerHTML = renderPeriods()
    if(tab==='bulk')     renderBulk(el)
    if(tab==='klan')     el.innerHTML = renderKlan()
  }catch(err){
    console.error(err)
    if(el) el.innerHTML = '<p class="empty">Något gick fel när den här fliken skulle visas. Felmeddelandet syns högst upp.</p>'
    showError(err.message || String(err))
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function fmt(n,d=0){ return Number(n||0).toLocaleString('sv-SE',{minimumFractionDigits:d,maximumFractionDigits:d}) }
function fmtDate(d){ return new Date(d).toLocaleDateString('sv-SE',{month:'short',day:'numeric'}) }
function fmtDateY(d){ return new Date(d).toLocaleDateString('sv-SE',{year:'numeric',month:'short',day:'numeric'}) }
function today(){ return new Date().toISOString().slice(0,10) }
function periodReceipts(){ return state.receipts.filter(r=>r.period_id===state.selectedPeriodId) }
function periodFamilyRows(){ return state.periodFamilies.filter(pf=>pf.period_id===state.selectedPeriodId) }
function effectiveFactor(pf, fam){ return (pf && pf.factor_override!=null) ? parseFloat(pf.factor_override) : parseFloat((fam&&fam.factor)||1) }
function effectiveWineDrinkers(pf, fam){ return (pf && pf.wine_drinkers_override!=null) ? parseInt(pf.wine_drinkers_override) : parseInt((fam&&fam.wine_drinkers)||0) }
function famName(id){ return (state.families.find(f=>f.id===id)||{}).name||'' }
function platsName(id){ return (state.platser.find(p=>p.id===id)||{}).name||'' }
function currentPeriod(){ return state.periods.find(p=>p.id===state.selectedPeriodId) }
function isLocked(p){ return p && p.status==='avräknad' }
function closeModal(){ document.getElementById('modal').style.display='none'; document.getElementById('modal').innerHTML='' }
function openModal(html){ document.getElementById('modal').innerHTML=html; document.getElementById('modal').style.display='block' }

// ── KLAN TAB ──────────────────────────────────────────────────────────────────
function renderKlan(){
  return `<div class="sh"><span class="sh-title">${esc(currentKlanName)}</span></div>
    <div class="card">
      <div class="card-sub" style="margin-bottom:8px">Dela klanens namn och lösenord med de du vill bjuda in.</div>
      <div class="btn-row">
        <button class="btn btn-g btn-sm" onclick="switchKlan()">Byt / lämna klan</button>
        <button class="btn btn-g btn-sm" onclick="newKlanModal()">+ Ny klan</button>
      </div>
    </div>`
}

function newKlanModal(){
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Skapa ny klan</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px">Familjer och perioder är separata per klan. Dela lösenordet med de du vill ha med.</p>
    <div class="fg"><label>Klanens namn</label><input id="new-klan-name" placeholder="t.ex. Fjällresan" autofocus/></div>
    <div class="fg"><label>Lösenord</label><input id="new-klan-password" type="password"/></div>
    <div class="gate-status" id="new-klan-status"></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="createKlanFromApp()">Skapa</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function createKlanFromApp(){
  const name = document.getElementById('new-klan-name').value.trim()
  const password = document.getElementById('new-klan-password').value
  const statusEl = document.getElementById('new-klan-status')
  if(!name || !password){ statusEl.textContent='Fyll i både namn och lösenord.'; return }
  statusEl.textContent='Skapar…'
  const { data, error } = await sb.rpc('create_klan', { klan_name: name, klan_password: password })
  if(error){ statusEl.textContent='Fel: '+error.message; return }
  closeModal()
  currentKlanId = data
  currentKlanName = name
  localStorage.setItem('kvitton_klan_id', currentKlanId)
  localStorage.setItem('kvitton_klan_name', currentKlanName)
  localStorage.removeItem('kvitton_period')
  await enterApp()
}

// ── RECEIPTS ──────────────────────────────────────────────────────────────────
function setReceiptFilter(famId){
  receiptFilter = receiptFilter === famId ? null : famId
  renderActive()
}

function renderReceipts(){
  if(!state.periods.length){
    return `<p class="empty">Skapa en period innan du kan registrera kvitton.</p>
      <div style="text-align:center;margin-top:10px"><button class="btn btn-p" onclick="showTab('periods', document.querySelectorAll('.tab')[4])">📅 Skapa period</button></div>`
  }
  if(!state.selectedPeriodId) return '<p class="empty">Välj en period ovan.</p>'
  const period = currentPeriod()
  const locked = isLocked(period)
  const allReceipts = periodReceipts()
  const filtered = receiptFilter ? allReceipts.filter(r=>r.paid_by_family_id===receiptFilter) : allReceipts

  // Summary always over all receipts
  const totMat = allReceipts.reduce((s,r)=>s+(parseFloat(r.total_amount)||0)-(parseFloat(r.alcohol_amount)||0),0)
  const totVin = allReceipts.reduce((s,r)=>s+(parseFloat(r.alcohol_amount)||0),0)
  const sumBar = allReceipts.length ? `
    <div class="sum-bar">
      <div class="rep-row"><span>🥗 Mat</span><span>${fmt(totMat)} kr</span></div>
      <div class="rep-row"><span>🍷 Vin</span><span>${fmt(totVin)} kr</span></div>
      <div class="rep-row" style="font-weight:700;font-size:15px;margin-top:4px"><span>Totalt</span><span>${fmt(totMat+totVin)} kr</span></div>
    </div>` : ''

  const lockedBanner = locked ? `<div class="hint" style="background:var(--danger-light);color:var(--danger)">🔒 Perioden är avräknad. Lås upp den under fliken Perioder för att lägga till fler kvitton.</div>` : ''

  // Filter chips – bara familjer kopplade till den här perioden
  const periodFamIds = new Set(state.periodFamilies.filter(pf=>pf.period_id===state.selectedPeriodId).map(pf=>pf.family_id))
  const chipFamilies = state.families.filter(f=>periodFamIds.has(f.id))
  const chips = `<div class="filter-chips">
    <span class="chip ${!receiptFilter?'on':''}" onclick="setReceiptFilter(null)">Alla</span>
    ${chipFamilies.map(f=>`<span class="chip ${receiptFilter===f.id?'on':''}" onclick="setReceiptFilter('${f.id}')">${esc(f.name)}</span>`).join('')}
  </div>`

  // Filtered sum if active
  const filtFam = receiptFilter ? state.families.find(f=>f.id===receiptFilter) : null
  const filtSum = filtFam ? (()=>{
    const fMat = filtered.reduce((s,r)=>s+(parseFloat(r.total_amount)||0)-(parseFloat(r.alcohol_amount)||0),0)
    const fVin = filtered.reduce((s,r)=>s+(parseFloat(r.alcohol_amount)||0),0)
    return `<div style="font-size:13px;color:var(--accent);font-weight:600;margin-bottom:8px">${esc(filtFam.name)}: ${fmt(fMat+fVin)} kr (mat ${fmt(fMat)} · vin ${fmt(fVin)})</div>`
  })() : ''

  // Slim rows
  const rows = filtered.map(r=>{
    const paidBy = famName(r.paid_by_family_id)
    const wine = r.alcohol_amount > 0
    return `<div class="slim-row" ${locked?'':`onclick="editReceipt('${r.id}')" style="cursor:pointer"`}>
      <div style="flex:1;min-width:0">
        <div class="slim-desc">${wine?'🍷 ':'🥗 '}${esc(r.description)}</div>
        <div class="slim-sub">${fmtDate(r.date)}${!receiptFilter&&paidBy?' · '+esc(paidBy):''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="slim-amt">${fmt(r.total_amount)} kr</div>
      </div>
      <div class="slim-actions">
        ${locked?'':`<button class="btn btn-d btn-sm" onclick="event.stopPropagation(); delReceipt('${r.id}')">✕</button>`}
      </div>
    </div>`
  }).join('')

  const emptyMsg = allReceipts.length===0
    ? '<p class="empty">Inga kvitton ännu. Tryck på Registrera kvitton nedan.</p>'
    : filtered.length===0 ? `<p class="empty">Inga kvitton för ${esc(filtFam?.name||'')}.</p>` : ''

  const addBtn = locked
    ? `<button class="btn btn-g" disabled title="Perioden är avräknad">🔒 Registrera</button>`
    : `<button class="btn btn-p" onclick="showTab('bulk', document.querySelectorAll('.tab')[1])">➕ Registrera kvitton</button>`

  const platsTag = period && period.plats_id ? `<div class="card-sub" style="margin-bottom:8px">📍 ${esc(platsName(period.plats_id))}</div>` : ''

  return `<div class="sh"><span class="sh-title">${esc((period||{}).name||'')}</span>
    ${addBtn}</div>
    ${platsTag}${lockedBanner}${sumBar}${chips}${filtSum}${emptyMsg}${rows}`
}

function setReceiptType(type){
  const isWine = type==='wine'
  document.getElementById('r-type-mat').classList.toggle('type-active', !isWine)
  document.getElementById('r-type-vin').classList.toggle('type-active', isWine)
  document.getElementById('r-type-val').value = type
  const desc = document.getElementById('r-desc')
  if(desc.value==='' || desc.value==='Matkvitto' || desc.value==='Vinkvitto'){
    desc.value = isWine ? 'Vinkvitto' : 'Matkvitto'
  }
}

function editReceipt(id){
  const r = state.receipts.find(r=>r.id===id)
  if(!r) return
  const period = state.periods.find(p=>p.id===r.period_id)
  if(isLocked(period)){ alert('Perioden är avräknad. Lås upp den under fliken Perioder för att kunna redigera kvitton.'); return }
  const isWine = r.alcohol_amount > 0
  const periodFamIds = new Set(state.periodFamilies.filter(pf=>pf.period_id===r.period_id).map(pf=>pf.family_id))
  const famOpts = state.families.filter(f=>periodFamIds.has(f.id) || f.id===r.paid_by_family_id).map(f=>`<option value="${f.id}" ${f.id===r.paid_by_family_id?'selected':''}>${esc(f.name)}</option>`).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Redigera kvitto</div>
    <div class="fg">
      <label>Typ</label>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button type="button" id="r-type-mat" class="type-btn ${!isWine?'type-active':''}" onclick="setReceiptType('mat')">🥗 Matkvitto</button>
        <button type="button" id="r-type-vin" class="type-btn ${isWine?'type-active':''}" onclick="setReceiptType('wine')">🍷 Vinkvitto</button>
      </div>
      <input type="hidden" id="r-type-val" value="${isWine?'wine':'mat'}"/>
    </div>
    <div class="fg"><label>Beskrivning</label><input id="r-desc" value="${esc(r.description)}"/></div>
    <div class="fr">
      <div class="fg"><label>Datum</label><input type="date" id="r-date" value="${r.date}"/></div>
      <div class="fg"><label>Betalat av</label><select id="r-paid"><option value="">– välj –</option>${famOpts}</select></div>
    </div>
    <div class="fg"><label>Belopp (kr)</label><input type="number" id="r-total" min="0" step="1" value="${r.total_amount}"/></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="updateReceipt('${id}')">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function updateReceipt(id){
  const desc = document.getElementById('r-desc').value.trim()
  const total = parseFloat(document.getElementById('r-total').value)||0
  if(!desc||!total){ alert('Fyll i beskrivning och belopp.'); return }
  const isWine = document.getElementById('r-type-val').value === 'wine'
  await sb.from('receipts').update({
    description: desc,
    date: document.getElementById('r-date').value,
    total_amount: total,
    alcohol_amount: isWine ? total : 0,
    paid_by_family_id: document.getElementById('r-paid').value || null,
  }).eq('id', id)
  closeModal(); await init()
}

async function delReceipt(id){
  const r = state.receipts.find(r=>r.id===id)
  const period = r ? state.periods.find(p=>p.id===r.period_id) : null
  if(isLocked(period)){ alert('Perioden är avräknad. Lås upp den under fliken Perioder för att kunna ta bort kvitton.'); return }
  if(!confirm('Ta bort kvittot?')) return
  await sb.from('receipts').delete().eq('id',id)
  await init()
}

function lightbox(url){
  openModal(`<div class="overlay" onclick="closeModal()" style="align-items:center;justify-content:center">
    <img src="${esc(url)}" style="max-width:92vw;max-height:85vh;border-radius:12px"/>
  </div>`)
}

// ── REPORT ────────────────────────────────────────────────────────────────────
// ── RAPPORT-BERÄKNING (delas mellan Rapport-flik, periodkort och CSV-export) ──
function computeReportData(periodId){
  const receipts = state.receipts.filter(r=>r.period_id===periodId)
  const pfRows = state.periodFamilies.filter(pf=>pf.period_id===periodId)

  const totMat = receipts.reduce((s,r)=>s+(parseFloat(r.total_amount)||0)-(parseFloat(r.alcohol_amount)||0),0)
  const totVin = receipts.reduce((s,r)=>s+(parseFloat(r.alcohol_amount)||0),0)
  const totAlt = totMat+totVin

  const pfMap = {}; pfRows.forEach(pf=>{ pfMap[pf.family_id]=parseFloat(pf.days)||0 })
  const pfMap2 = {}; pfRows.forEach(pf=>{ pfMap2[pf.family_id]=parseFloat(pf.guest_days)||0 })
  const pfById = {}; pfRows.forEach(pf=>{ pfById[pf.family_id]=pf })

  let sumMandagar=0, sumVinMandagar=0
  const famBase = state.families.filter(f=>pfMap[f.id]>0||pfMap2[f.id]>0).map(f=>{
    const days=pfMap[f.id]||0
    const guestDays=parseFloat(pfMap2[f.id]||0)
    const factor=effectiveFactor(pfById[f.id], f)
    const wineDrinkers=effectiveWineDrinkers(pfById[f.id], f)
    const mandagar=days*factor+guestDays
    const vinMandagar=days*wineDrinkers
    sumMandagar+=mandagar; sumVinMandagar+=vinMandagar
    return {id:f.id, name:f.name, days, guestDays, factor, wineDrinkers, mandagar, vinMandagar}
  })

  const paidMat={},paidVin={}
  state.families.forEach(f=>{paidMat[f.id]=0;paidVin[f.id]=0})
  receipts.forEach(r=>{
    if(!r.paid_by_family_id) return
    paidMat[r.paid_by_family_id]=(paidMat[r.paid_by_family_id]||0)+(parseFloat(r.total_amount)||0)-(parseFloat(r.alcohol_amount)||0)
    paidVin[r.paid_by_family_id]=(paidVin[r.paid_by_family_id]||0)+(parseFloat(r.alcohol_amount)||0)
  })

  const famData = famBase.map(f=>{
    const andelMat=sumMandagar>0?f.mandagar/sumMandagar:0
    const andelVin=sumVinMandagar>0?f.vinMandagar/sumVinMandagar:0
    const kronorMat=totMat*andelMat
    const kronorVin=totVin*andelVin
    const skalBetala=kronorMat+kronorVin
    const utlagt=(paidMat[f.id]||0)+(paidVin[f.id]||0)
    const diff=utlagt-skalBetala
    return {...f,andelMat:Math.round(andelMat*100),andelVin:Math.round(andelVin*100),kronorMat,kronorVin,skalBetala,utlagtMat:paidMat[f.id]||0,utlagtVin:paidVin[f.id]||0,utlagt,diff}
  }).sort((a,b)=>b.diff-a.diff)

  const mandagskostnadMat=sumMandagar>0?totMat/sumMandagar:0
  const mandagskostnadVin=sumVinMandagar>0?totVin/sumVinMandagar:0
  const totalVindrickare=famBase.reduce((s,f)=>s+f.wineDrinkers,0)

  const payers = famData.filter(f=>f.diff < -0.5).map(f=>({name:f.name, owe: -f.diff}))
  const receivers = famData.filter(f=>f.diff > 0.5).map(f=>({name:f.name, get: f.diff}))
  const transactions = []
  const payersCopy = payers.map(p=>({...p}))
  const receiversCopy = receivers.map(r=>({...r}))
  let pi=0, ri=0
  while(pi < payersCopy.length && ri < receiversCopy.length){
    const p = payersCopy[pi], r = receiversCopy[ri]
    const amt = Math.min(p.owe, r.get)
    if(amt > 0.5) transactions.push({from:p.name, to:r.name, amt})
    p.owe -= amt; r.get -= amt
    if(p.owe < 0.5) pi++
    if(r.get < 0.5) ri++
  }

  return { receiptCount: receipts.length, hasPfRows: pfRows.length>0, totMat, totVin, totAlt, famData, sumMandagar, sumVinMandagar, mandagskostnadMat, mandagskostnadVin, totalVindrickare, transactions }
}

// Sparar en fryst ögonblicksbild på perioden så beloppen inte ändras retroaktivt efter avräkning.
async function freezePeriodReport(periodId, data){
  const period = state.periods.find(p=>p.id===periodId)
  const json = JSON.stringify(data)
  if(period) period.frozen_report = json
  await sb.from('periods').update({frozen_report: json}).eq('id', periodId)
}

// Väljer fryst ögonblicksbild för avräknade perioder (och fryser i efterhand om den saknas), annars live-beräkning.
function getReportData(period){
  if(isLocked(period) && period.frozen_report){
    try{ return JSON.parse(period.frozen_report) }catch(e){}
  }
  const data = computeReportData(period.id)
  if(isLocked(period)) freezePeriodReport(period.id, data)
  return data
}

function renderReport(){
  if(!state.selectedPeriodId) return '<p class="empty">Välj en period.</p>'
  const period = currentPeriod()
  const locked = isLocked(period)
  const data = getReportData(period)
  if(!data.receiptCount) return '<p class="empty">Inga kvitton i perioden ännu.</p>'
  if(!data.hasPfRows) return '<p class="empty">Ange hur många dagar varje familj är med (Perioder → Dagar).</p>'

  const frozenBanner = locked ? `<div class="hint" style="background:var(--accent-light);color:var(--accent)">🔒 Perioden är avräknad – beloppen nedan är frysta från avräkningstillfället och påverkas inte av senare ändringar i familjer eller perioder.</div>` : ''

  const summary=`<div class="rep-summary">
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div><h3>Totalt utlagt</h3><div class="rep-total-num">${fmt(data.totAlt)} kr</div></div>
      <div style="text-align:right;font-size:12px;opacity:.8">${data.receiptCount} kvitton</div>
    </div>
    <div class="rep-divider">
      <div class="rep-row"><span>🥗 Mat</span><span>${fmt(data.totMat)} kr</span></div>
      <div class="rep-row"><span>🍷 Vin</span><span>${fmt(data.totVin)} kr</span></div>
    </div>
    <div class="rep-divider">
      <div class="rep-row"><span>Mandagar totalt</span><span>${fmt(data.sumMandagar)}</span></div>
      <div class="rep-row"><span>Kostnad/mandag mat</span><span>${fmt(data.mandagskostnadMat)} kr</span></div>
      <div class="rep-row"><span>Kostnad/vindag</span><span>${fmt(data.mandagskostnadVin)} kr</span></div>
      <div class="rep-row"><span>Vindrickare</span><span>${data.totalVindrickare} st</span></div>
    </div>
  </div>`

  const cards = data.famData.map(f=>`<div class="fam-card">
    <div class="fam-name">${esc(f.name)}</div>
    <div class="fam-row"><span>Dagar</span><span>${fmt(f.days,1)}</span></div>
    ${f.guestDays>0?`<div class="fam-row"><span>🧑‍🤝‍🧑 Gästdagar</span><span>+${fmt(f.guestDays,1)}</span></div>`:''}
    <div class="fam-row"><span>Mandagar (${fmt(f.mandagar,2)})</span><span>${f.andelMat}% av mat</span></div>
    ${f.vinMandagar>0?`<div class="fam-row"><span>VinMandagar (${fmt(f.vinMandagar,1)})</span><span>${f.andelVin}% av vin</span></div>`:''}
    <div style="border-top:1px solid var(--border);margin:7px 0"></div>
    <div class="fam-row"><span>🥗 KronorMat</span><span>${fmt(f.kronorMat)} kr</span></div>
    ${f.kronorVin>0?`<div class="fam-row"><span>🍷 KronorVin</span><span>${fmt(f.kronorVin)} kr</span></div>`:''}
    <div class="fam-row" style="font-weight:600"><span>Ska betala</span><span>${fmt(f.skalBetala)} kr</span></div>
    <div style="border-top:1px solid var(--border);margin:7px 0"></div>
    ${f.utlagtMat>0?`<div class="fam-row"><span>Utlagt mat</span><span>${fmt(f.utlagtMat)} kr</span></div>`:''}
    ${f.utlagtVin>0?`<div class="fam-row"><span>Utlagt vin</span><span>${fmt(f.utlagtVin)} kr</span></div>`:''}
    <div class="fam-total">
      <span>${f.diff>=0?'✅ Ska få tillbaka':'💸 Ska swisha'}</span>
      <span style="color:${f.diff>=0?'var(--accent-muted)':'var(--danger)'}">${f.diff>=0?'+':''}${fmt(f.diff)} kr</span>
    </div>
  </div>`).join('')

  const swishHtml = data.transactions.length ? `
    <div class="swish-box">
      <div class="swish-title">💸 Swish-instruktioner</div>
      ${data.transactions.map(t=>`
        <div class="swish-row">
          <span class="swish-from">${esc(t.from)}</span>
          <span style="color:var(--muted)">→</span>
          <span class="swish-to">${esc(t.to)}</span>
          <span class="swish-amt">${fmt(t.amt)} kr</span>
        </div>`).join('')}
    </div>` : ''

  const csvBtn=`<button class="btn btn-g btn-sm" onclick="exportCSV()">⬇ CSV</button>`

  return `<div class="sh"><span class="sh-title">Avräkning</span>${csvBtn}</div>${frozenBanner}${summary}${swishHtml}${cards}`
}

function exportCSV(){
  const period = currentPeriod()
  const data = getReportData(period)
  const rows=[['Familj','Dagar','Mandagar','Andel mat%','VinMandagar','Andel vin%','KronorMat','KronorVin','Ska betala','Utlagt','Diff']]
  data.famData.forEach(f=>{
    rows.push([f.name,fmt(f.days,1),fmt(f.mandagar,2),f.andelMat,fmt(f.vinMandagar,1),f.andelVin,fmt(f.kronorMat),fmt(f.kronorVin),fmt(f.skalBetala),fmt(f.utlagt),fmt(f.utlagt-f.skalBetala)])
  })
  const csv=rows.map(r=>r.join(';')).join('\n')
  const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv)
  a.download=`rapport.csv`;a.click()
}

// ── FAMILIES ──────────────────────────────────────────────────────────────────
function toggleHideTemporary(){ hideTemporaryFamilies = !hideTemporaryFamilies; renderActive() }

function renderFamilies(){
  const visible = hideTemporaryFamilies ? state.families.filter(f=>!f.is_temporary) : state.families
  const chips = `<div class="filter-chips">
    <span class="chip ${hideTemporaryFamilies?'on':''}" onclick="toggleHideTemporary()">Dölj tillfälliga</span>
  </div>`
  const cards = visible.map(f=>`<div class="card" onclick="editFamily('${f.id}')" style="cursor:pointer">
    <div class="card-hdr">
      <div>
        <div class="card-title">${esc(f.name)}${f.is_temporary?' <span class="tag">Tillfällig</span>':''}</div>
        <div class="card-sub">🛏️ ${f.person_count||1} person${(f.person_count||1)===1?'':'er'}</div>
        <div class="card-sub">Faktor: <strong>${fmt(parseFloat(f.factor||1),2)}</strong></div>
        <div class="card-sub">🍷 ${f.wine_drinkers} vindrickare</div>
      </div>
      <div class="btn-row">
        <button class="btn btn-d btn-sm" onclick="event.stopPropagation(); delFamily('${f.id}')">Ta bort</button>
      </div>
    </div>
  </div>`).join('')
  return `<div class="sh"><span class="sh-title">Familjer</span><button class="btn btn-p" onclick="newFamily()">+ Lägg till</button></div>
    ${chips}
    ${!visible.length?'<p class="empty">Inga familjer att visa.</p>':cards}`
}

function familyModal(f=null){
  const id=f?f.id:''
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">${f?'Redigera familj':'Ny familj'}</div>
    <div class="fg"><label>Namn</label><input id="f-name" value="${esc(f?f.name:'')}" placeholder="t.ex. J+S" autofocus/></div>
    <div class="fg"><label>Antal personer</label><input type="number" id="f-people" value="${f?(f.person_count||1):1}" min="1" step="1"/><div style="font-size:12px;color:var(--muted);margin-top:3px">Används för att se hur många sängplatser som behövs – inte samma sak som faktorn nedan</div></div>
    <div class="fr">
      <div class="fg"><label>Faktor</label><input type="number" id="f-factor" value="${f?f.factor:1}" min="0" step="0.05"/><div style="font-size:12px;color:var(--muted);margin-top:3px">t.ex. 1.75 = två personer varav en betalar 75%</div></div>
    </div>
    <div class="fg"><label>Antal vindrickare</label><input type="number" id="f-wine" value="${f?f.wine_drinkers:0}" min="0" step="1"/></div>
    <div class="fg"><label style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" id="f-temp" style="width:auto" ${f&&f.is_temporary?'checked':''}/> Tillfällig familj (visas dold som standard)</label></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveFamily('${id}')">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

function newFamily(){ familyModal() }
function editFamily(id){ familyModal(state.families.find(f=>f.id===id)) }

async function saveFamily(id){
  const payload={
    name:document.getElementById('f-name').value.trim(),
    person_count:parseInt(document.getElementById('f-people').value)||1,
    factor:parseFloat(document.getElementById('f-factor').value)||1,
    wine_drinkers:parseInt(document.getElementById('f-wine').value)||0,
    is_temporary:document.getElementById('f-temp').checked
  }
  if(!payload.name){ alert('Ange ett namn.'); return }
  if(id) await sb.from('families').update(payload).eq('id',id)
  else await sb.from('families').insert({...payload, klan_id: currentKlanId})
  closeModal(); await init()
}

async function delFamily(id){
  if(!confirm('Ta bort familj?')) return
  await sb.from('families').delete().eq('id',id)
  await init()
}

// ── PERIODS ───────────────────────────────────────────────────────────────────
function renderPeriods(){
  const cards = state.periods.map(p=>{
    const locked = isLocked(p)
    const entries=state.periodFamilies.filter(pf=>pf.period_id===p.id)
    const famDayTags = state.families.map(f=>{
      const ex = entries.find(e=>e.family_id===f.id)
      if(!ex) return ''
      const dagar = ex.days || 0
      const gast = ex.guest_days || 0
      const hasOverride = ex.factor_override!=null || ex.wine_drinkers_override!=null
      const label = dagar > 0 || gast > 0
        ? `${fmt(dagar,1)} dagar${gast>0?' (+'+fmt(gast,1)+' gäst)':''}`
        : '0 dagar'
      return `<span class="tag ${locked?'':'tag-clickable'}" ${locked?'':`onclick="event.stopPropagation(); editFamilyDays('${p.id}','${f.id}')"`}>${esc(f.name)}: ${label}${hasOverride?' ⚙️':''}${locked?'':' ✏️'}</span>`
    }).join('')
    // Stats
    const statsData = getReportData(p)
    const totMat = statsData.totMat
    const totVin = statsData.totVin
    const mkMat = statsData.sumMandagar>0 ? totMat/statsData.sumMandagar : 0
    const mkVin = statsData.sumMandagar>0 ? totVin/statsData.sumMandagar : 0
    const statsHtml = statsData.receiptCount ? `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--muted)">
        <span>${statsData.receiptCount} kvitton</span>
        <span>🥗 ${fmt(totMat)} kr</span>
        <span>🍷 ${fmt(totVin)} kr</span>
        ${statsData.sumMandagar>0?`<span>⚖️ ${fmt(mkMat)}/mandag mat · ${fmt(mkVin)}/mandag vin</span>`:''}
      </div>` : ''
    const statusBadge = locked
      ? `<span class="badge badge-lock">🔒 Avräknad</span>`
      : `<span class="badge badge-active">Aktiv</span>`
    const platsBadge = p.plats_id ? `<span class="badge" style="background:var(--accent-light);color:var(--accent)">📍 ${esc(platsName(p.plats_id))}</span>` : ''
    const lockBtn = locked
      ? `<button class="btn btn-g btn-sm" onclick="event.stopPropagation(); unlockPeriod('${p.id}')">🔓 Lås upp</button>`
      : `<button class="btn btn-w btn-sm" onclick="event.stopPropagation(); lockPeriod('${p.id}')">🔒 Avräkna</button>`
    return `<div class="card" ${locked?'':`onclick="editPeriodDates('${p.id}')" style="cursor:pointer"`}>
      <div class="card-hdr">
        <div style="flex:1">
          <div class="card-title">${esc(p.name)} ${statusBadge} ${platsBadge}</div>
          <div class="card-sub">${new Date(p.starts_at).toLocaleDateString('sv-SE')} – ${new Date(p.ends_at).toLocaleDateString('sv-SE')}</div>
          ${statsHtml}
          <div class="tags" style="margin-top:6px">${famDayTags}</div>
        </div>
        <div class="btn-row" style="flex-direction:column;align-items:flex-end">
          <button class="btn btn-g btn-sm" onclick="event.stopPropagation(); selectPeriod('${p.id}')">Välj</button>
          ${lockBtn}
          <button class="btn btn-d btn-sm" onclick="event.stopPropagation(); delPeriod('${p.id}')">Ta bort</button>
        </div>
      </div>
    </div>`
  }).join('')
  return `<div class="sh"><span class="sh-title">Perioder</span><button class="btn btn-p" onclick="newPeriod()">+ Ny period</button></div>
    ${!state.periods.length?'<p class="empty">Skapa en period för att börja logga kvitton.</p>':cards}`
}

async function lockPeriod(id){
  if(!confirm('Avräkna perioden? Det går inte längre att lägga till nya kvitton (du kan låsa upp den igen senare). Beloppen fryses vid avräkningen.')) return
  const data = computeReportData(id)
  await sb.from('periods').update({status:'avräknad', frozen_report: JSON.stringify(data)}).eq('id',id)
  await init()
}

async function unlockPeriod(id){
  if(!confirm('Lås upp perioden så att kvitton kan läggas till igen? Rapporten räknas då live igen tills du avräknar perioden på nytt.')) return
  await sb.from('periods').update({status:'aktiv'}).eq('id',id)
  await init()
}

function newPeriod(){
  const platsOpts = '<option value="">– inget särskilt –</option>' + state.platser.map(pl=>`<option value="${pl.id}">${pl.recurring?'🔁 ':''}${esc(pl.name)}</option>`).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Ny period</div>
    <div class="fg"><label>Namn</label><input id="p-name" placeholder="t.ex. Påsk 2025" autofocus/></div>
    <div class="fr">
      <div class="fg"><label>Startdatum</label><input type="date" id="p-start" value="${today()}"/></div>
      <div class="fg"><label>Slutdatum</label><input type="date" id="p-end" value="${today()}"/></div>
    </div>
    <div class="fg"><label>Ställe (valfritt)</label><select id="p-plats">${platsOpts}</select></div>
    <div class="fg"><label>Vilka familjer är med?</label>
      <div class="family-check-list" style="margin-top:6px">
        ${state.families.map(f=>`
          <label class="fam-check" id="fc-label-${f.id}">
            <input type="checkbox" id="fc-${f.id}" onchange="toggleFamCheck('${f.id}')"/> ${esc(f.name)}
          </label>`).join('')}
      </div>
    </div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="savePeriod()">Skapa</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

function toggleFamCheck(famId){
  const lbl = document.getElementById('fc-label-'+famId)
  const cb = document.getElementById('fc-'+famId)
  if(lbl) lbl.style.background = cb.checked ? 'var(--accent-light)' : ''
  if(lbl) lbl.style.borderColor = cb.checked ? 'var(--accent)' : ''
}

async function savePeriod(){
  const name=document.getElementById('p-name').value.trim()
  if(!name){ alert('Ange ett namn.'); return }
  const startsAt = document.getElementById('p-start').value
  const endsAt = document.getElementById('p-end').value
  if(endsAt < startsAt){ alert('Slutdatum kan inte vara före startdatum.'); return }
  const checked = state.families.filter(f=>document.getElementById('fc-'+f.id)?.checked)
  if(!checked.length){ alert('Välj minst en familj.'); return }
  const platsId = document.getElementById('p-plats').value || null
  const {data:p}=await sb.from('periods').insert({name,starts_at:startsAt,ends_at:endsAt,klan_id:currentKlanId,status:'aktiv',plats_id:platsId}).select().single()
  if(p){
    const rows = checked.map(f=>({period_id:p.id,family_id:f.id,klan_id:currentKlanId,days:0,guest_days:0,day_states:JSON.stringify([])}))
    await sb.from('period_families').insert(rows)
    state.selectedPeriodId=p.id
  }
  closeModal(); await init()
}

// dayState[familyId][dayIndex] = 0 | 1 | 0.5
let dayState = {}
let editDaysPeriodId = null

function getDatesInPeriod(period){
  const dates = []
  const [sy,sm,sd] = period.starts_at.split('-').map(Number)
  const [ey,em,ed] = period.ends_at.split('-').map(Number)
  const d = new Date(sy, sm-1, sd)
  const end = new Date(ey, em-1, ed)
  while(d <= end){ dates.push(new Date(d)); d.setDate(d.getDate()+1) }
  return dates
}

function dayLabel(date){
  const days = ['sö','må','ti','on','to','fr','lö']
  return days[date.getDay()] + ' ' + date.getDate()
}

function editDays(periodId){
  editDaysPeriodId = periodId
  const period = state.periods.find(p=>p.id===periodId)
  const existing = state.periodFamilies.filter(pf=>pf.period_id===periodId)
  const dates = getDatesInPeriod(period)

  dayState = {}
  state.families.forEach(f=>{
    const ex = existing.find(e=>e.family_id===f.id)
    dayState[f.id] = Array(dates.length).fill(0)
    if(ex && ex.day_states){
      try{ dayState[f.id] = JSON.parse(ex.day_states) } catch(e){}
    } else if(ex && ex.days > 0){
      let rem = ex.days
      for(let i=0;i<dates.length;i++){
        if(rem >= 1){ dayState[f.id][i]=1; rem-=1 }
        else if(rem >= 0.5){ dayState[f.id][i]=0.5; rem-=0.5 }
        else break
      }
    }
  })
  renderDaysModal(period, dates)
}

function renderDaysModal(period, dates){
  const famRows = state.families.map(f=>{
    if(!dayState[f.id] || dayState[f.id].length !== dates.length){
      const old = dayState[f.id] || []
      dayState[f.id] = Array(dates.length).fill(0).map((_,i) => old[i] || 0)
    }
    const total = dayState[f.id].reduce((s,v)=>s+v,0)
    const cells = dayState[f.id].map((val,i)=>{
      const isOn = val > 0
      const isHalf = val === 0.5
      return `<div class="day-cell">
        <div class="day-cb ${isOn?(isHalf?'half':'on'):''}" onclick="toggleDay('${f.id}',${i})">${isOn?(isHalf?'½':'✓'):''}</div>
        ${isOn ? `<button class="day-half-btn ${isHalf?'on':''}" onclick="toggleHalf('${f.id}',${i})">½</button>` : '<div style="height:18px"></div>'}
        <div class="day-label">${dayLabel(dates[i])}</div>
      </div>`
    }).join('')
    return `<div class="fam-days-row">
      <div class="fam-days-name"><span>${esc(f.name)}</span><span class="days-total">${fmt(total,1)} dagar</span></div>
      <div class="day-grid">${cells}</div>
    </div>`
  }).join('')

  const modalHtml = `<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Dagar – ${esc(period?.name||'')}</div>
    ${famRows}
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveEditDays()">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`
  openModal(modalHtml)
}

function toggleDay(famId, idx){
  if(!dayState[famId]) return
  dayState[famId][idx] = dayState[famId][idx] > 0 ? 0 : 1
  const period = state.periods.find(p=>p.id===editDaysPeriodId)
  renderDaysModal(period, getDatesInPeriod(period))
}

function toggleHalf(famId, idx){
  if(!dayState[famId]) return
  dayState[famId][idx] = dayState[famId][idx] === 0.5 ? 1 : 0.5
  const period = state.periods.find(p=>p.id===editDaysPeriodId)
  renderDaysModal(period, getDatesInPeriod(period))
}

async function saveEditDays(){
  const periodId = editDaysPeriodId
  await sb.from('period_families').delete().eq('period_id',periodId)
  const rows = state.families.map(f=>{
    const states = dayState[f.id]||[]
    const days = states.reduce((s,v)=>s+v,0)
    return { period_id:periodId, family_id:f.id, klan_id:currentKlanId, days, day_states: JSON.stringify(states) }
  }).filter(r=>r.days>0)
  if(rows.length) await sb.from('period_families').insert(rows)
  closeModal(); await init()
}

function editPeriodDates(periodId){
  const p = state.periods.find(p=>p.id===periodId)
  if(!p) return
  if(isLocked(p)){ alert('Perioden är avräknad. Lås upp den under fliken Perioder för att kunna redigera den.'); return }
  const existing = state.periodFamilies.filter(pf=>pf.period_id===periodId)
  const existingFamIds = existing.map(e=>e.family_id)
  const platsOpts = '<option value="">– inget särskilt –</option>' + state.platser.map(pl=>`<option value="${pl.id}" ${pl.id===p.plats_id?'selected':''}>${pl.recurring?'🔁 ':''}${esc(pl.name)}</option>`).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Redigera period</div>
    <div class="fg"><label>Namn</label><input id="ep-name" value="${esc(p.name)}"/></div>
    <div class="fr">
      <div class="fg"><label>Startdatum</label><input type="date" id="ep-start" value="${p.starts_at}"/></div>
      <div class="fg"><label>Slutdatum</label><input type="date" id="ep-end" value="${p.ends_at}"/></div>
    </div>
    <div class="fg"><label>Ställe (valfritt)</label><select id="ep-plats">${platsOpts}</select></div>
    <div class="fg"><label>Familjer i perioden</label>
      <div class="family-check-list" style="margin-top:6px">
        ${state.families.map(f=>{
          const checked = existingFamIds.includes(f.id)
          const pf = existing.find(e=>e.family_id===f.id)
          const factorVal = pf&&pf.factor_override!=null ? pf.factor_override : ''
          const wineVal = pf&&pf.wine_drinkers_override!=null ? pf.wine_drinkers_override : ''
          return `<div class="fam-check" id="efc-label-${f.id}" style="flex-direction:column;align-items:stretch;gap:6px;${checked?'background:var(--accent-light);border-color:var(--accent)':''}">
            <label style="display:flex;align-items:center;gap:7px;cursor:pointer">
              <input type="checkbox" id="efc-${f.id}" ${checked?'checked':''} onchange="toggleEditFamCheck('${f.id}')"/> ${esc(f.name)}
            </label>
            <div style="display:flex;gap:6px">
              <input type="number" id="efc-factor-${f.id}" min="0" step="0.05" value="${factorVal}" placeholder="Faktor ${fmt(parseFloat(f.factor||1),2)}" style="flex:1;font-size:12px;padding:5px 7px"/>
              <input type="number" id="efc-wine-${f.id}" min="0" step="1" value="${wineVal}" placeholder="Vin ${f.wine_drinkers||0}" style="flex:1;font-size:12px;padding:5px 7px"/>
            </div>
          </div>`
        }).join('')}
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px">Faktor/vin: fyll bara i om det avviker från familjens vanliga inställning den här perioden.</div>
      <div style="font-size:12px;color:var(--danger);margin-top:4px">OBS: om du tar bort en familj försvinner deras dagar i perioden.</div>
    </div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="savePeriodDates('${periodId}')">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

function toggleEditFamCheck(famId){
  const lbl = document.getElementById('efc-label-'+famId)
  const cb = document.getElementById('efc-'+famId)
  if(lbl){ lbl.style.background = cb.checked ? 'var(--accent-light)' : ''; lbl.style.borderColor = cb.checked ? 'var(--accent)' : '' }
}

async function savePeriodDates(periodId){
  const name = document.getElementById('ep-name').value.trim()
  if(!name){ alert('Ange ett namn.'); return }
  const startsAt = document.getElementById('ep-start').value
  const endsAt = document.getElementById('ep-end').value
  if(endsAt < startsAt){ alert('Slutdatum kan inte vara före startdatum.'); return }
  await sb.from('periods').update({
    name,
    starts_at: startsAt,
    ends_at: endsAt,
    plats_id: document.getElementById('ep-plats').value || null
  }).eq('id', periodId)

  const existing = state.periodFamilies.filter(pf=>pf.period_id===periodId)
  const checkedIds = state.families.filter(f=>document.getElementById('efc-'+f.id)?.checked).map(f=>f.id)
  const toAdd = checkedIds.filter(id=>!existing.find(e=>e.family_id===id))
  const toRemove = existing.filter(e=>!checkedIds.includes(e.family_id)).map(e=>e.family_id)
  const toUpdateOverrides = checkedIds.filter(id=>existing.find(e=>e.family_id===id))

  const readOverrides = (id) => {
    const factorRaw = document.getElementById('efc-factor-'+id)?.value
    const wineRaw = document.getElementById('efc-wine-'+id)?.value
    return {
      factor_override: factorRaw ? parseFloat(factorRaw) : null,
      wine_drinkers_override: wineRaw ? parseInt(wineRaw) : null
    }
  }

  if(toRemove.length){
    for(const famId of toRemove){
      await sb.from('period_families').delete().eq('period_id',periodId).eq('family_id',famId)
    }
  }
  if(toAdd.length){
    const addRows = toAdd.map(id=>({period_id:periodId,family_id:id,klan_id:currentKlanId,days:0,guest_days:0,day_states:'[]',...readOverrides(id)}))
    const {error} = await sb.from('period_families').insert(addRows)
    if(error){
      const {error:e2} = await sb.from('period_families').insert(toAdd.map(id=>({period_id:periodId,family_id:id,klan_id:currentKlanId,days:0})))
      if(e2) { alert('Kunde inte lägga till familj: '+e2.message); return }
    }
  }
  if(toUpdateOverrides.length){
    for(const famId of toUpdateOverrides){
      await sb.from('period_families').update(readOverrides(famId)).eq('period_id',periodId).eq('family_id',famId)
    }
  }

  closeModal(); await init()
}

function editFamilyDays(periodId, familyId){
  const periodCheck = state.periods.find(p=>p.id===periodId)
  if(isLocked(periodCheck)){ alert('Perioden är avräknad. Lås upp den under fliken Perioder för att kunna ändra dagar.'); return }
  editDaysPeriodId = periodId
  const period = state.periods.find(p=>p.id===periodId)
  const existing = state.periodFamilies.filter(pf=>pf.period_id===periodId)
  const dates = getDatesInPeriod(period)

  dayState = {}
  state.families.forEach(f=>{
    const ex = existing.find(e=>e.family_id===f.id)
    dayState[f.id] = Array(dates.length).fill(0)
    if(ex && ex.day_states){
      try{ dayState[f.id] = JSON.parse(ex.day_states) } catch(e){}
    } else if(ex && ex.days > 0){
      let rem = ex.days
      for(let i=0;i<dates.length;i++){
        if(rem >= 1){ dayState[f.id][i]=1; rem-=1 }
        else if(rem >= 0.5){ dayState[f.id][i]=0.5; rem-=0.5 }
        else break
      }
    }
  })

  renderSingleFamilyDaysModal(period, dates, familyId)
}

function renderSingleFamilyDaysModal(period, dates, familyId){
  const fam = state.families.find(f=>f.id===familyId)
  if(!dayState[familyId] || dayState[familyId].length !== dates.length){
    const old = dayState[familyId] || []
    dayState[familyId] = Array(dates.length).fill(0).map((_,i) => old[i] || 0)
  }
  const total = dayState[familyId].reduce((s,v)=>s+v,0)
  const cells = dayState[familyId].map((val,i)=>{
    const isOn = val > 0
    const isHalf = val === 0.5
    return `<div class="day-cell">
      <div class="day-cb ${isOn?(isHalf?'half':'on'):''}" onclick="toggleDaySingle('${familyId}',${i},'${period.id}')">${isOn?(isHalf?'½':'✓'):''}</div>
      ${isOn ? `<button class="day-half-btn ${isHalf?'on':''}" onclick="toggleHalfSingle('${familyId}',${i},'${period.id}')">½</button>` : '<div style="height:18px"></div>'}
      <div class="day-label">${dayLabel(dates[i])}</div>
    </div>`
  }).join('')

  const ex = state.periodFamilies.find(pf=>pf.period_id===editDaysPeriodId&&pf.family_id===familyId)
  const guestDays = ex ? (parseFloat(ex.guest_days)||0) : 0
  const factorVal = ex && ex.factor_override!=null ? ex.factor_override : ''
  const wineVal = ex && ex.wine_drinkers_override!=null ? ex.wine_drinkers_override : ''
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">${esc(fam?.name||'')} – ${esc(period?.name||'')}</div>
    <div class="fam-days-row" style="border:none;padding:0">
      <div class="fam-days-name"><span>Dagar närvarande</span><span class="days-total">${fmt(total,1)} dagar</span></div>
      <div class="day-grid">${cells}</div>
    </div>
    <div class="fg" style="margin-top:14px">
      <label>Extra gästdagar (läggs till mandagarna)</label>
      <input type="number" id="guest-days-input" min="0" step="0.5" value="${guestDays}" placeholder="0"/>
      <div style="font-size:12px;color:var(--muted);margin-top:3px">Gäster som ${esc(fam?.name||'')} bjuder på – deras dagar räknas in i familjens mandagar</div>
    </div>
    <div class="fr" style="margin-top:14px">
      <div class="fg"><label>Faktor denna period (valfritt)</label>
        <input type="number" id="factor-override-input" min="0" step="0.05" value="${factorVal}" placeholder="${fmt(parseFloat(fam?.factor||1),2)} (vanlig)"/>
      </div>
      <div class="fg"><label>Vindrickare denna period (valfritt)</label>
        <input type="number" id="wine-override-input" min="0" step="1" value="${wineVal}" placeholder="${fam?fam.wine_drinkers:0} (vanligt)"/>
      </div>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-top:-6px">Fyll bara i om det avviker från familjens vanliga inställning den här perioden.</div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn btn-p" onclick="saveEditDaysWithGuest('${familyId}')">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

function toggleDaySingle(famId, idx, periodId){
  if(!dayState[famId]) return
  dayState[famId][idx] = dayState[famId][idx] > 0 ? 0 : 1
  const period = state.periods.find(p=>p.id===periodId)
  renderSingleFamilyDaysModal(period, getDatesInPeriod(period), famId)
}

function toggleHalfSingle(famId, idx, periodId){
  if(!dayState[famId]) return
  dayState[famId][idx] = dayState[famId][idx] === 0.5 ? 1 : 0.5
  const period = state.periods.find(p=>p.id===periodId)
  renderSingleFamilyDaysModal(period, getDatesInPeriod(period), famId)
}

async function saveEditDaysWithGuest(familyId){
  const periodId = editDaysPeriodId
  const guestDays = parseFloat(document.getElementById('guest-days-input')?.value)||0
  const factorRaw = document.getElementById('factor-override-input')?.value
  const wineRaw = document.getElementById('wine-override-input')?.value
  const factorOverride = factorRaw ? parseFloat(factorRaw) : null
  const wineOverride = wineRaw ? parseInt(wineRaw) : null
  await sb.from('period_families').delete().eq('period_id',periodId)
  const rows = state.families.map(f=>{
    const s = dayState[f.id]||[]
    const d = s.reduce((sum,v)=>sum+v,0)
    const existingPf = state.periodFamilies.find(pf=>pf.period_id===periodId&&pf.family_id===f.id)
    const gd = f.id===familyId ? guestDays : (existingPf?.guest_days||0)
    const fo = f.id===familyId ? factorOverride : (existingPf?.factor_override ?? null)
    const wo = f.id===familyId ? wineOverride : (existingPf?.wine_drinkers_override ?? null)
    return { period_id:periodId, family_id:f.id, klan_id:currentKlanId, days:d, guest_days:gd, factor_override:fo, wine_drinkers_override:wo, day_states:JSON.stringify(s) }
  }).filter(r=>r.days>0||r.guest_days>0||r.factor_override!=null||r.wine_drinkers_override!=null||state.periodFamilies.find(pf=>pf.period_id===periodId&&pf.family_id===r.family_id))
  if(rows.length) await sb.from('period_families').insert(rows)
  closeModal(); await init()
}

function selectPeriod(id){ state.selectedPeriodId=id; renderPeriodSelect(); closeModal(); showTab('receipts',document.querySelector('.tab')) }

async function delPeriod(id){
  if(!confirm('Ta bort perioden och alla dess kvitton?')) return
  await sb.from('periods').delete().eq('id',id)
  if(state.selectedPeriodId===id) state.selectedPeriodId=null
  await init()
}

// ── BULK ENTRY ────────────────────────────────────────────────────────────────
let bulkRows = []
let bulkNextId = 1

function renderBulk(el){
  const periodFamIds = new Set(state.periodFamilies.filter(pf=>pf.period_id===state.selectedPeriodId).map(pf=>pf.family_id))
  const bulkFamilies = state.families.filter(f=>periodFamIds.has(f.id))
  const famOpts = '<option value="">– välj familj –</option>' + bulkFamilies.map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join('')
  const activePeriods = state.periods.filter(p=>!isLocked(p))
  const periodOpts = '<option value="">– välj period –</option>' + activePeriods.map(p=>`<option value="${p.id}" ${p.id===state.selectedPeriodId?'selected':''}>${esc(p.name)}</option>`).join('')

  if(!bulkRows.length) addBulkRow()

  if(!state.periods.length){
    el.innerHTML = `<div class="sh"><span class="sh-title">Registrera flera</span></div><p class="empty">Skapa en period innan du kan registrera kvitton.</p>
      <div style="text-align:center;margin-top:10px"><button class="btn btn-p" onclick="showTab('periods', document.querySelectorAll('.tab')[4])">📅 Skapa period</button></div>`
    return
  }
  if(!activePeriods.length){
    el.innerHTML = `<div class="sh"><span class="sh-title">Registrera flera</span></div><p class="empty">Alla perioder är avräknade. Lås upp en period under fliken Perioder för att registrera fler kvitton.</p>`
    return
  }

  const noFamiliesMsg = state.selectedPeriodId && !bulkFamilies.length
    ? `<p class="empty" style="margin-bottom:12px">Inga familjer är kopplade till den här perioden än. Lägg till dem under fliken Perioder.</p>` : ''

  const rows = bulkRows.map(r => `
    <div class="bulk-row" id="brow-${r.id}">
      <div class="bulk-type">
        <button class="${r.type==='mat'?'on':''}" onclick="setBulkType(${r.id},'mat')">🥗</button>
        <button class="${r.type==='vin'?'on':''}" onclick="setBulkType(${r.id},'vin')">🍷</button>
      </div>
      <input style="flex:2" placeholder="Beskrivning" value="${esc(r.desc)}" oninput="setBulkField(${r.id},'desc',this.value)"/>
      <input style="flex:1;min-width:70px" type="number" min="0" step="1" placeholder="kr" value="${r.amount||''}" oninput="setBulkField(${r.id},'amount',this.value)"/>
      <button class="del-row" onclick="delBulkRow(${r.id})">✕</button>
    </div>`).join('')

  el.innerHTML = `
    <div class="sh"><span class="sh-title">Registrera flera</span></div>
    <div class="card" style="margin-bottom:12px">
      <div class="fg" style="margin-bottom:10px">
        <label>Period</label>
        <select id="bulk-period" onchange="setBulkPeriod(this.value)">${periodOpts}</select>
      </div>
      <div class="fg" style="margin-bottom:0">
        <label>Betalat av</label>
        <select id="bulk-family">${famOpts}</select>
      </div>
    </div>
    ${noFamiliesMsg}
    <div id="bulk-rows">${rows}</div>
    <div class="btn-row" style="margin-top:4px">
      <button class="btn btn-g" onclick="addBulkRow()">+ Lägg till rad</button>
      <button class="btn btn-p" onclick="saveBulk()">💾 Spara alla</button>
    </div>
    <div id="bulk-status" style="margin-top:10px;font-size:13px;color:var(--accent)"></div>`
}

function setBulkPeriod(val){
  state.selectedPeriodId = val
  document.getElementById('periodSel').value = val
  renderActive()
}

function addBulkRow(){
  bulkRows.push({id: bulkNextId++, type:'mat', desc:'Matkvitto', amount:''})
  renderActive()
  setTimeout(()=>{
    const inputs = document.querySelectorAll('.bulk-row input[type=number]')
    if(inputs.length) inputs[inputs.length-1].focus()
  }, 50)
}

function delBulkRow(id){
  bulkRows = bulkRows.filter(r=>r.id!==id)
  if(!bulkRows.length) addBulkRow()
  else renderActive()
}

function setBulkType(id, type){
  const r = bulkRows.find(r=>r.id===id)
  if(!r) return
  r.type = type
  if(r.desc==='' || r.desc==='Matkvitto' || r.desc==='Vinkvitto'){
    r.desc = type==='vin' ? 'Vinkvitto' : 'Matkvitto'
  }
  renderActive()
}

function setBulkField(id, field, val){
  const r = bulkRows.find(r=>r.id===id)
  if(r) r[field] = val
}

async function saveBulk(){
  const periodId = document.getElementById('bulk-period').value
  const familyId = document.getElementById('bulk-family').value
  if(!periodId){ alert('Välj en period.'); return }
  if(!familyId){ alert('Välj vem som betalat.'); return }

  document.querySelectorAll('.bulk-row').forEach(el => {
    const id = parseInt(el.id.replace('brow-',''))
    const r = bulkRows.find(r=>r.id===id)
    if(!r) return
    const inputs = el.querySelectorAll('input')
    r.desc = inputs[0].value
    r.amount = inputs[1].value
  })

  const valid = bulkRows.filter(r => r.desc.trim() && parseFloat(r.amount)>0)
  if(!valid.length){ alert('Fyll i minst ett kvitto med belopp.'); return }

  const inserts = valid.map(r => ({
    period_id: periodId,
    klan_id: currentKlanId,
    paid_by_family_id: familyId,
    description: r.desc.trim(),
    date: today(),
    total_amount: parseFloat(r.amount),
    alcohol_amount: r.type==='vin' ? parseFloat(r.amount) : 0,
    image_url: null
  }))

  const statusEl = document.getElementById('bulk-status')
  statusEl.textContent = 'Sparar…'
  await sb.from('receipts').insert(inserts)
  bulkRows = []
  bulkNextId = 1
  statusEl.textContent = ''
  await init()
  showTab('bulk', document.querySelectorAll('.tab')[1])
  document.getElementById('bulk-status').textContent = `✅ ${valid.length} kvitton sparade!`
  setTimeout(()=>{ const s=document.getElementById('bulk-status'); if(s) s.textContent='' }, 3000)
}

// ── START ─────────────────────────────────────────────────────────────────────
boot()
