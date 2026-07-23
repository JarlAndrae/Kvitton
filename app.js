const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

let state = { templates:[], templateMembers:[], periods:[], periodFamilies:[], periodMembers:[], receipts:[], platser:[] }
let activeTab = 'receipts'
let currentKlanId = null
let currentKlanName = ''
let receiptFilter = null

// GLOBAL FELHANTERING
function showError(msg){
  let el = document.getElementById('errorBanner')
  if(!el){
    el = document.createElement('div')
    el.id = 'errorBanner'
    document.body.prepend(el)
  }
  el.style.cssText = 'position:sticky;top:0;z-index:9999;background:#c1121f;color:#fff;padding:10px 14px;font-size:13px;display:flex;gap:10px;align-items:flex-start'
  el.innerHTML = '<span style="flex:1">⚠️ Ett fel uppstod: ' + esc(String(msg).slice(0,300)) + '</span><button onclick="this.parentElement.style.display=\'none\'" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer;line-height:1;flex-shrink:0">✕</button>'
  el.style.display='flex'
}
window.addEventListener('error', e => showError(e.message || 'Okänt fel'))
window.addEventListener('unhandledrejection', e => showError((e.reason && e.reason.message) || String(e.reason) || 'Okänt fel (promise)'))

// HELPERS
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function fmt(n,d){ d=d||0; return Number(n||0).toLocaleString('sv-SE',{minimumFractionDigits:d,maximumFractionDigits:d}) }
function fmtDate(d){ return new Date(d).toLocaleDateString('sv-SE',{month:'short',day:'numeric'}) }
function fmtDateY(d){ return new Date(d).toLocaleDateString('sv-SE',{year:'numeric',month:'short',day:'numeric'}) }
function today(){ return new Date().toISOString().slice(0,10) }
function closeModal(){ document.getElementById('modal').style.display='none'; document.getElementById('modal').innerHTML='' }
function openModal(html){ document.getElementById('modal').innerHTML=html; document.getElementById('modal').style.display='block' }
function currentPeriod(){ return state.periods.find(function(p){ return p.id===state.selectedPeriodId }) }
function periodReceipts(){ return state.receipts.filter(function(r){ return r.period_id===state.selectedPeriodId }) }
function isOpenPeriod(p){ return p && p.status==='oppen' }
function isLastPeriod(p){ return p && p.status==='last' }
function isCleared(p){ return p && p.status==='clearad' }
function isCompressed(p){ return p && p.status==='komprimerad' }
function periodFamiliesFor(periodId){ return state.periodFamilies.filter(function(pf){ return pf.period_id===periodId }) }
function periodMembersFor(pfId){ return state.periodMembers.filter(function(m){ return m.period_family_id===pfId }).sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0) }) }
function pfName(id){ var f=state.periodFamilies.find(function(pf){ return pf.id===id }); return f?f.name:'' }
function platsName(id){ var p=state.platser.find(function(pl){ return pl.id===id }); return p?p.name:'' }

function getDatesInPeriod(period){
  const dates = []
  const sParts = period.starts_at.split('-').map(Number)
  const eParts = period.ends_at.split('-').map(Number)
  const d = new Date(sParts[0], sParts[1]-1, sParts[2])
  const end = new Date(eParts[0], eParts[1]-1, eParts[2])
  while(d <= end){ dates.push(new Date(d)); d.setDate(d.getDate()+1) }
  return dates
}
function dayLabel(date){
  const days = ['sö','må','ti','on','to','fr','lö']
  return days[date.getDay()] + ' ' + date.getDate()
}
function memberDays(member, dates){
  if(member.days_mode === 'custom'){
    let arr = []
    try{ arr = Array.isArray(member.day_states) ? member.day_states : JSON.parse(member.day_states||'[]') }catch(e){ arr=[] }
    return arr.reduce(function(s,v){ return s+(parseFloat(v)||0) },0)
  }
  return dates.length
}
function statusLabel(status){
  const map = {oppen:'Öppen', last:'Låst', clearad:'Clearad', komprimerad:'Komprimerad'}
  return map[status] || status
}

// KLAN-INLOGGNING
function boot(){
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
  const g = document.getElementById('authGate')
  g.style.display='block'
  g.innerHTML = html
}
function hideGate(){
  document.getElementById('authGate').style.display='none'
  document.getElementById('authGate').innerHTML=''
}

function renderGateLogin(){
  gate(`<div class="gate"><div class="gate-box">
    <h2>Kvittodelning</h2>
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
  const res = await sb.rpc('login_klan', { p_name: name, p_password: password })
  const data = res.data, error = res.error
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

function renderSwitcher(){
  const items = [
    {key:'kvitton', icon:'🧾', label:'Kvitton', href:'./'},
    {key:'planering', icon:'🗓️', label:'Planering', href:'planering/'},
    {key:'bastadkonto', icon:'🏠', label:'Båstadkonto', href:'bastadkonto/'},
    {key:'projekt', icon:'✅', label:'Projekt', href:'bastadkonto/?tab=projects'},
  ]
  const el = document.getElementById('appSwitcher')
  if(!el) return
  el.innerHTML = items.map(function(it){ return '<a class="switch-item '+(it.key==='kvitton'?'on':'')+'" href="'+it.href+'">'+it.icon+' '+it.label+'</a>' }).join('')
}

function newKlanModal(){
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Skapa ny klan</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px">Familjemallar och perioder är separata per klan. Dela lösenordet med de du vill ha med.</p>
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
  const res = await sb.rpc('create_klan', { klan_name: name, klan_password: password })
  const data = res.data, error = res.error
  if(error){ statusEl.textContent='Fel: '+error.message; return }
  closeModal()
  currentKlanId = data
  currentKlanName = name
  localStorage.setItem('kvitton_klan_id', currentKlanId)
  localStorage.setItem('kvitton_klan_name', currentKlanName)
  localStorage.removeItem('kvitton_period')
  await enterApp()
}

function renderKlan(){
  return `<div class="sh"><span class="sh-title">${esc(currentKlanName)}</span></div>
    <div class="card">
      <div class="card-sub" style="margin-bottom:8px">Dela klanens namn och lösenord med de du vill bjuda in.</div>
      <div class="btn-row">
        <button class="btn btn-g btn-sm" onclick="switchKlan()">Byt / lämna klan</button>
        <button class="btn btn-g btn-sm" onclick="newKlanModal()">+ Ny klan</button>
        <button class="btn btn-g btn-sm" onclick="renderAdminLogin()">🔧 Admin</button>
      </div>
    </div>`
}

function renderAdminLogin(){
  gate(`<div class="gate"><div class="gate-box">
    <h2>Admin</h2>
    <div class="fg"><label>Admin-lösenord</label><input id="admin-password" type="password" autofocus/></div>
    <button class="btn btn-p" style="width:100%" onclick="tryAdminLogin()">Logga in</button>
    <div class="gate-status" id="admin-login-status"></div>
    <button class="btn btn-g" style="width:100%;margin-top:8px" onclick="enterApp()">Avbryt</button>
  </div></div>`)
}

async function tryAdminLogin(){
  const pw = document.getElementById('admin-password').value
  const statusEl = document.getElementById('admin-login-status')
  if(pw !== ADMIN_PASSWORD){ statusEl.textContent='Fel lösenord.'; return }
  await renderAdminPanel()
}

async function renderAdminPanel(){
  const res = await sb.from('klaner').select('*').order('name')
  const klaner = res.data, error = res.error
  if(error){ showError(error.message); return }
  const rows = (klaner||[]).map(function(k){ return '<div class="card"><div class="card-hdr"><div class="card-title">'+esc(k.name)+'</div><div class="btn-row"><button class="btn btn-d btn-sm" onclick="adminDeleteKlan(\''+k.id+'\',\''+esc(k.name)+'\')">Ta bort</button></div></div></div>' }).join('')
  gate(`<div class="gate" style="align-items:flex-start;padding-top:40px"><div class="gate-box" style="max-width:480px">
    <h2>Admin – alla klaner</h2>
    ${rows || '<p class="empty">Inga klaner.</p>'}
    <button class="btn btn-g" style="width:100%;margin-top:10px" onclick="enterApp()">Tillbaka till appen</button>
  </div></div>`)
}

async function adminDeleteKlan(id, name){
  if(!confirm('Ta bort klanen "'+name+'" och ALL dess data? Går inte att ångra.')) return
  await sb.from('receipts').delete().eq('klan_id',id)
  await sb.from('period_members').delete().eq('klan_id',id)
  await sb.from('period_families').delete().eq('klan_id',id)
  await sb.from('template_members').delete().eq('klan_id',id)
  await sb.from('family_templates').delete().eq('klan_id',id)
  await sb.from('periods').delete().eq('klan_id',id)
  await sb.from('platser').delete().eq('klan_id',id)
  await sb.from('klaner').delete().eq('id',id)
  await renderAdminPanel()
}

// INIT / TABS
async function init(){
  showLoading()
  try{
    const results = await Promise.all([
      sb.from('family_templates').select('*').eq('klan_id',currentKlanId).order('name'),
      sb.from('template_members').select('*').eq('klan_id',currentKlanId).order('sort_order'),
      sb.from('periods').select('*').eq('klan_id',currentKlanId).order('starts_at',{ascending:false}),
      sb.from('period_families').select('*').eq('klan_id',currentKlanId).order('sort_order'),
      sb.from('period_members').select('*').eq('klan_id',currentKlanId).order('sort_order'),
      sb.from('receipts').select('*').eq('klan_id',currentKlanId).order('date',{ascending:false}),
      sb.from('platser').select('*').eq('klan_id',currentKlanId).order('name'),
    ])
    state.templates = results[0].data||[]
    state.templateMembers = results[1].data||[]
    state.periods = results[2].data||[]
    state.periodFamilies = results[3].data||[]
    state.periodMembers = results[4].data||[]
    state.receipts = results[5].data||[]
    state.platser = results[6].data||[]

    const selectable = state.periods.filter(function(p){ return p.status==='oppen'||p.status==='last' })
    const savedPeriodId = localStorage.getItem('kvitton_period')
    if(selectable.length){
      if(savedPeriodId && selectable.find(function(p){ return p.id===savedPeriodId })){
        state.selectedPeriodId = savedPeriodId
      } else if(!state.selectedPeriodId || !selectable.find(function(p){ return p.id===state.selectedPeriodId })){
        state.selectedPeriodId = selectable[0].id
      }
    } else {
      state.selectedPeriodId = null
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
  const selectable = state.periods.filter(function(p){ return p.status==='oppen'||p.status==='last' })
  if(!selectable.length){
    sel.style.display='none'
    createBtn.style.display=''
    return
  }
  sel.style.display=''
  createBtn.style.display='none'
  sel.innerHTML = selectable.map(function(p){ return '<option value="'+p.id+'" '+(p.id===state.selectedPeriodId?'selected':'')+'>'+(p.status==='last'?'🔒 ':'')+esc(p.name)+'</option>' }).join('')
}

function onPeriodChange(id){
  state.selectedPeriodId = id
  localStorage.setItem('kvitton_period', id)
  renderActive()
}

function showTab(tab, btn){
  activeTab = tab
  document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('on') })
  if(btn) btn.classList.add('on')
  document.querySelectorAll('.main > div').forEach(function(d){ d.style.display='none' })
  document.getElementById('tab-'+tab).style.display=''
  renderActive()
}

function renderActive(){
  const el = document.getElementById('tab-'+activeTab)
  if(!el) return
  if(activeTab==='receipts') el.innerHTML = renderReceipts()
  else if(activeTab==='bulk') renderBulk(el)
  else if(activeTab==='report') el.innerHTML = renderReport()
  else if(activeTab==='templates') el.innerHTML = renderMallar()
  else if(activeTab==='periods') el.innerHTML = renderPerioder()
  else if(activeTab==='history') el.innerHTML = renderHistorik()
  else if(activeTab==='klan') el.innerHTML = renderKlan()
}

// ============================================================
// MALLAR (familjemallar)
// ============================================================
function renderMallar(){
  const cards = state.templates.map(function(t){
    const members = state.templateMembers.filter(function(m){ return m.template_id===t.id }).sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0) })
    const rows = members.map(function(m){ return '<div class="card-sub">'+esc(m.name)+' · faktor-mat '+fmt(m.factor_mat,2)+' · faktor-vin '+fmt(m.factor_vin,2)+'</div>' }).join('')
    return `<div class="card">
      <div class="card-hdr">
        <div>
          <div class="card-title">${esc(t.name)}</div>
          ${rows || '<div class="card-sub">Inga medlemmar</div>'}
        </div>
        <div class="btn-row">
          <button class="btn btn-g btn-sm" onclick="editTemplateModal('${t.id}')">Redigera</button>
          <button class="btn btn-d btn-sm" onclick="delTemplate('${t.id}')">Ta bort</button>
        </div>
      </div>
    </div>`
  }).join('')
  return `<div class="sh"><span class="sh-title">Familjemallar</span><button class="btn btn-p" onclick="newTemplateModal()">+ Ny mall</button></div>
    <div class="hint">En mall beskriver en familjs medlemmar (namn, faktor, vindrickare) – utan dagar. Dagar sätts per period när mallen kopieras in.</div>
    ${!state.templates.length?'<p class="empty">Inga familjemallar ännu.</p>':cards}`
}

let templateEditMembers = []
let templateEditId = null

function newTemplateModal(){
  templateEditId = null
  templateEditMembers = [{name:'',factor_mat:1,factor_vin:0}]
  renderTemplateModal('')
}
function editTemplateModal(id){
  templateEditId = id
  const t = state.templates.find(function(x){ return x.id===id })
  templateEditMembers = state.templateMembers.filter(function(m){ return m.template_id===id }).sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0) }).map(function(m){ return {name:m.name,factor_mat:m.factor_mat,factor_vin:m.factor_vin} })
  if(!templateEditMembers.length) templateEditMembers=[{name:'',factor_mat:1,factor_vin:0}]
  renderTemplateModal(t?t.name:'')
}

function renderTemplateModal(name){
  const rows = templateEditMembers.map(function(m,i){ return `<div class="fr" style="align-items:center;gap:6px;margin-bottom:6px">
    <input placeholder="Namn" value="${esc(m.name)}" oninput="templateEditMembers[${i}].name=this.value" style="flex:2"/>
    <input type="number" step="0.05" min="0" value="${m.factor_mat}" oninput="templateEditMembers[${i}].factor_mat=parseFloat(this.value)||0" style="flex:1" title="Faktor-mat"/>
    <input type="number" step="0.05" min="0" value="${m.factor_vin}" oninput="templateEditMembers[${i}].factor_vin=parseFloat(this.value)||0" style="flex:1" title="Faktor-vin"/>
    <button class="btn btn-d btn-sm" onclick="templateEditMembers.splice(${i},1);renderTemplateModal(document.getElementById('t-name').value)">✕</button>
  </div>` }).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">${templateEditId?'Redigera mall':'Ny mall'}</div>
    <div class="fg"><label>Namn på familj</label><input id="t-name" value="${esc(name)}" placeholder="t.ex. J+S" autofocus/></div>
    <div class="fg"><label>Medlemmar <span style="font-weight:400;color:var(--muted)">(namn · faktor-mat · faktor-vin)</span></label>${rows}
      <button class="btn btn-g btn-sm" onclick="templateEditMembers.push({name:'',factor_mat:1,factor_vin:0});renderTemplateModal(document.getElementById('t-name').value)">+ Lägg till medlem</button>
    </div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveTemplate()">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function saveTemplate(){
  const name = document.getElementById('t-name').value.trim()
  if(!name){ alert('Ange ett namn.'); return }
  const members = templateEditMembers.filter(function(m){ return m.name && m.name.trim() })
  if(!members.length){ alert('Lägg till minst en medlem.'); return }
  let templateId = templateEditId
  if(templateId){
    await sb.from('family_templates').update({name:name}).eq('id',templateId)
    await sb.from('template_members').delete().eq('template_id',templateId)
  } else {
    const res = await sb.from('family_templates').insert({name:name, klan_id:currentKlanId}).select().single()
    if(res.error){ alert('Kunde inte spara mallen: '+res.error.message); return }
    templateId = res.data.id
  }
  const rows = members.map(function(m,i){ return {template_id:templateId, klan_id:currentKlanId, name:m.name.trim(), factor_mat: isNaN(parseFloat(m.factor_mat))?1:parseFloat(m.factor_mat), factor_vin: isNaN(parseFloat(m.factor_vin))?0:parseFloat(m.factor_vin), sort_order:i} })
  const res2 = await sb.from('template_members').insert(rows)
  if(res2.error){ alert('Kunde inte spara medlemmar: '+res2.error.message); return }
  closeModal(); await init()
}

async function delTemplate(id){
  if(!confirm('Ta bort mallen? Perioder som redan kopierat in den påverkas inte.')) return
  await sb.from('family_templates').delete().eq('id',id)
  await init()
}

// ============================================================
// PERIODER
// ============================================================
function renderPerioder(){
  const lastPeriods = state.periods.filter(function(p){ return p.status==='last' }).sort(function(a,b){ return new Date(b.starts_at)-new Date(a.starts_at) })
  const openPeriods = state.periods.filter(function(p){ return p.status==='oppen' }).sort(function(a,b){ return new Date(b.starts_at)-new Date(a.starts_at) })

  const lastCard = lastPeriods.map(function(p){
    const rep = computeReport(p.id)
    const famRows = rep.perFamily.map(function(f){ return '<div class="rep-row"><span>'+esc(f.name)+'</span><span>'+fmt(f.balance,0)+' kr</span></div>' }).join('')
    return `<div class="card" style="border:2px solid var(--gold, #c9a227)">
      <div class="card-hdr">
        <div>
          <div class="card-title">🔒 ${esc(p.name)} <span class="badge badge-lock">Låst – redo att clearas</span></div>
          <div class="card-sub">${new Date(p.starts_at).toLocaleDateString('sv-SE')} – ${new Date(p.ends_at).toLocaleDateString('sv-SE')}</div>
        </div>
      </div>
      <div class="sum-bar" style="margin-top:8px">
        <div class="rep-row"><span>🥗 Mat</span><span>${fmt(rep.totMat)} kr</span></div>
        <div class="rep-row"><span>🍷 Vin</span><span>${fmt(rep.totVin)} kr</span></div>
        <div class="rep-row" style="font-weight:700"><span>Totalt</span><span>${fmt(rep.totMat+rep.totVin)} kr</span></div>
      </div>
      <div style="margin-top:8px">${famRows}</div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn btn-g btn-sm" onclick="selectPeriod('${p.id}');showTab('report',document.querySelectorAll('.tab')[2])">Visa rapport</button>
        <button class="btn btn-g btn-sm" onclick="unlockPeriod('${p.id}')">🔓 Lås upp</button>
        <button class="btn btn-p btn-sm" onclick="clearPeriod('${p.id}')">✅ Cleara (alla har swishat)</button>
      </div>
    </div>`
  }).join('')

  const cards = openPeriods.map(function(p){
    const pfs = periodFamiliesFor(p.id)
    const dates = getDatesInPeriod(p)
    const tags = pfs.map(function(pf){
      const members = periodMembersFor(pf.id)
      const totDays = members.reduce(function(s,m){ return s+memberDays(m,dates) },0)
      return '<span class="tag tag-clickable" onclick="openPeriodFamiliesModal(\''+p.id+'\')">'+esc(pf.name)+': '+members.length+' pers · '+fmt(totDays,1)+'d ✏️</span>'
    }).join('')
    const pReceipts = state.receipts.filter(function(r){ return r.period_id===p.id })
    const totMat = pReceipts.reduce(function(s,r){ return s+(parseFloat(r.total_amount)||0)-(parseFloat(r.alcohol_amount)||0) },0)
    const totVin = pReceipts.reduce(function(s,r){ return s+(parseFloat(r.alcohol_amount)||0) },0)
    const platsBadge = p.plats_id ? '<span class="badge" style="background:var(--accent-light);color:var(--accent)">📍 '+esc(platsName(p.plats_id))+'</span>' : ''
    return `<div class="card">
      <div class="card-hdr">
        <div style="flex:1">
          <div class="card-title">${esc(p.name)} <span class="badge badge-active">Öppen</span> ${platsBadge}</div>
          <div class="card-sub">${new Date(p.starts_at).toLocaleDateString('sv-SE')} – ${new Date(p.ends_at).toLocaleDateString('sv-SE')}</div>
          ${pReceipts.length?'<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:var(--muted)"><span>'+pReceipts.length+' kvitton</span><span>🥗 '+fmt(totMat)+' kr</span><span>🍷 '+fmt(totVin)+' kr</span></div>':''}
          <div class="tags" style="margin-top:6px">${tags || '<span class="card-sub">Inga familjer kopplade ännu</span>'}</div>
        </div>
        <div class="btn-row" style="flex-direction:column;align-items:flex-end">
          <button class="btn btn-g btn-sm" onclick="selectPeriod('${p.id}')">Välj</button>
          <button class="btn btn-g btn-sm" onclick="openPeriodFamiliesModal('${p.id}')">👨‍👩‍👧 Familjer</button>
          <button class="btn btn-g btn-sm" onclick="editPeriodBasics('${p.id}')">Redigera</button>
          <button class="btn btn-w btn-sm" onclick="lockPeriod('${p.id}')">🔒 Lås</button>
          <button class="btn btn-d btn-sm" onclick="delPeriod('${p.id}')">Ta bort</button>
        </div>
      </div>
    </div>`
  }).join('')

  return `<div class="sh"><span class="sh-title">Perioder</span><button class="btn btn-p" onclick="newPeriodModal()">+ Ny period</button></div>
    ${lastCard}
    ${(!openPeriods.length && !lastPeriods.length)?'<p class="empty">Skapa en period för att börja logga kvitton.</p>':cards}`
}

function selectPeriod(id){ state.selectedPeriodId=id; localStorage.setItem('kvitton_period',id); renderPeriodSelect(); closeModal() }

function newPeriodModal(){
  const platsOpts = '<option value="">– inget särskilt –</option>' + state.platser.map(function(pl){ return '<option value="'+pl.id+'">'+esc(pl.name)+'</option>' }).join('')
  const tplRows = state.templates.map(function(t){ return '<label style="display:flex;align-items:center;gap:7px;cursor:pointer;padding:4px 0"><input type="checkbox" id="np-tpl-'+t.id+'" style="width:auto"/> '+esc(t.name)+'</label>' }).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Ny period</div>
    <div class="fg"><label>Namn</label><input id="p-name" placeholder="t.ex. Sommar 2026" autofocus/></div>
    <div class="fr">
      <div class="fg"><label>Start</label><input type="date" id="p-start" value="${today()}"/></div>
      <div class="fg"><label>Slut</label><input type="date" id="p-end" value="${today()}"/></div>
    </div>
    <div class="fg"><label>Ställe</label><select id="p-plats">${platsOpts}</select></div>
    <div class="fg"><label>Familjer att kopiera in (kan ändras senare)</label>${tplRows || '<div class="card-sub">Inga mallar – skapa en under fliken Mallar, eller lägg till adhoc-familjer efter att perioden skapats.</div>'}</div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="savePeriod()">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function savePeriod(){
  const name = document.getElementById('p-name').value.trim()
  if(!name){ alert('Ange ett namn.'); return }
  const startsAt = document.getElementById('p-start').value
  const endsAt = document.getElementById('p-end').value
  if(endsAt < startsAt){ alert('Slutdatum kan inte vara före startdatum.'); return }
  const platsId = document.getElementById('p-plats').value || null
  const res = await sb.from('periods').insert({name:name, starts_at:startsAt, ends_at:endsAt, klan_id:currentKlanId, status:'oppen', plats_id:platsId}).select().single()
  if(res.error){ alert('Kunde inte skapa perioden: '+res.error.message); return }
  const p = res.data

  const checkedTemplates = state.templates.filter(function(t){ const el=document.getElementById('np-tpl-'+t.id); return el && el.checked })
  for(const t of checkedTemplates){
    const res2 = await sb.from('period_families').insert({period_id:p.id, klan_id:currentKlanId, template_id:t.id, name:t.name, is_adhoc:false}).select().single()
    if(res2.error || !res2.data) continue
    const pf = res2.data
    const members = state.templateMembers.filter(function(m){ return m.template_id===t.id })
    if(members.length){
      await sb.from('period_members').insert(members.map(function(m,i){ return {period_family_id:pf.id, klan_id:currentKlanId, name:m.name, factor_mat:m.factor_mat, factor_vin:m.factor_vin, is_guest:false, days_mode:'all', day_states:[], sort_order:i} }))
    }
  }
  state.selectedPeriodId = p.id
  localStorage.setItem('kvitton_period', p.id)
  closeModal(); await init(); showTab('periods', document.querySelectorAll('.tab')[4])
}

function editPeriodBasics(periodId){
  const p = state.periods.find(function(x){ return x.id===periodId })
  if(!p) return
  const platsOpts = '<option value="">– inget särskilt –</option>' + state.platser.map(function(pl){ return '<option value="'+pl.id+'" '+(pl.id===p.plats_id?'selected':'')+'>'+esc(pl.name)+'</option>' }).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Redigera period</div>
    <div class="fg"><label>Namn</label><input id="ep-name" value="${esc(p.name)}" autofocus/></div>
    <div class="fr">
      <div class="fg"><label>Start</label><input type="date" id="ep-start" value="${p.starts_at}"/></div>
      <div class="fg"><label>Slut</label><input type="date" id="ep-end" value="${p.ends_at}"/></div>
    </div>
    <div class="fg"><label>Ställe</label><select id="ep-plats">${platsOpts}</select></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="savePeriodBasics('${periodId}')">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function savePeriodBasics(periodId){
  const name = document.getElementById('ep-name').value.trim()
  if(!name){ alert('Ange ett namn.'); return }
  const startsAt = document.getElementById('ep-start').value
  const endsAt = document.getElementById('ep-end').value
  if(endsAt < startsAt){ alert('Slutdatum kan inte vara före startdatum.'); return }
  const res = await sb.from('periods').update({name:name, starts_at:startsAt, ends_at:endsAt, plats_id: document.getElementById('ep-plats').value || null}).eq('id',periodId)
  if(res.error){ alert('Kunde inte spara: '+res.error.message); return }
  closeModal(); await init()
}

async function delPeriod(id){
  if(!confirm('Ta bort perioden och alla dess kvitton, familjer och medlemmar?')) return
  await sb.from('periods').delete().eq('id',id)
  if(state.selectedPeriodId===id) state.selectedPeriodId=null
  await init()
}

async function lockPeriod(id){
  if(!confirm('Lås perioden? Inga fler kvitton eller familjeändringar kan göras förrän den låses upp igen.')) return
  const report = computeReport(id)
  await sb.from('periods').update({status:'last', frozen_report:report}).eq('id',id)
  await init()
}
async function unlockPeriod(id){
  if(!confirm('Lås upp perioden så att kvitton och familjer kan ändras igen?')) return
  await sb.from('periods').update({status:'oppen'}).eq('id',id)
  await init()
}
async function clearPeriod(id){
  if(!confirm('Markera hela perioden som clearad (alla har swishat)? Perioden flyttas till Historik.')) return
  const report = computeReport(id)
  await sb.from('periods').update({status:'clearad', cleared_at:new Date().toISOString(), frozen_report:report}).eq('id',id)
  if(state.selectedPeriodId===id) state.selectedPeriodId=null
  await init()
}
async function compressPeriod(id){
  if(!confirm('Komprimera perioden? Totalsumman behålls men alla kvitton och detaljer slängs permanent. Går inte att ångra.')) return
  await sb.from('receipts').delete().eq('period_id',id)
  await sb.from('periods').update({status:'komprimerad', compressed_at:new Date().toISOString()}).eq('id',id)
  await init()
  showTab('history', document.querySelectorAll('.tab')[5])
}

// ── PERIODFAMILJER-MODAL ─────────────────────────────────────
function openPeriodFamiliesModal(periodId){
  const p = state.periods.find(function(x){ return x.id===periodId })
  if(!p) return
  const pfs = periodFamiliesFor(periodId)
  const dates = getDatesInPeriod(p)
  const remainingTemplates = state.templates.filter(function(t){ return !pfs.find(function(pf){ return pf.template_id===t.id }) })

  const famBlocks = pfs.map(function(pf){
    const members = periodMembersFor(pf.id)
    const rows = members.map(function(m){
      const d = memberDays(m, dates)
      const dayBadge = m.days_mode==='all' ? 'Alla dagar' : fmt(d,1)+' dagar'
      return `<div class="fr" style="align-items:center;gap:6px;padding:4px 0;border-top:1px solid var(--border,#eee)">
        <div style="flex:1;font-size:13px">${esc(m.name)}${m.is_guest?' <span class="tag">Gäst</span>':''}<div class="card-sub">faktor-mat ${fmt(m.factor_mat,2)} · faktor-vin ${fmt(m.factor_vin,2)}</div></div>
        <span class="tag tag-clickable" onclick="openMemberDaysModal('${periodId}','${m.id}')">${dayBadge} ✏️</span>
        <button class="btn btn-g btn-sm" onclick="editMemberModal('${periodId}','${m.id}')">✏️</button>
        <button class="btn btn-d btn-sm" onclick="delMember('${periodId}','${m.id}')">✕</button>
      </div>`
    }).join('')
    return `<div class="card" style="margin-bottom:10px">
      <div class="card-hdr">
        <div class="card-title">${esc(pf.name)}${pf.is_adhoc?' <span class="tag">Adhoc</span>':''}</div>
        <div class="btn-row">
          <button class="btn btn-g btn-sm" onclick="addMemberModal('${periodId}','${pf.id}',false)">+ Medlem</button>
          <button class="btn btn-g btn-sm" onclick="addMemberModal('${periodId}','${pf.id}',true)">+ Gäst</button>
          <button class="btn btn-d btn-sm" onclick="delPeriodFamily('${periodId}','${pf.id}')">Ta bort familj</button>
        </div>
      </div>
      ${rows || '<p class="empty" style="margin-top:6px">Inga medlemmar än.</p>'}
    </div>`
  }).join('')

  const addTplOpts = remainingTemplates.length ? '<select id="pf-add-tpl" style="width:auto">'+remainingTemplates.map(function(t){ return '<option value="'+t.id+'">'+esc(t.name)+'</option>' }).join('')+'</select><button class="btn btn-g btn-sm" onclick="addTemplateToPeriod(\''+periodId+'\')">+ Kopiera in mall</button>' : ''

  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal" style="max-width:520px">
    <div class="modal-title">Familjer – ${esc(p.name)}</div>
    ${famBlocks || '<p class="empty">Inga familjer kopplade ännu.</p>'}
    <div class="btn-row" style="flex-wrap:wrap;margin-top:10px">
      ${addTplOpts}
      <button class="btn btn-g btn-sm" onclick="addAdhocFamilyModal('${periodId}')">+ Adhoc-familj</button>
    </div>
    <div class="btn-row" style="margin-top:14px">
      <button class="btn btn-g" onclick="closeModal()">Stäng</button>
    </div>
  </div></div>`)
}

async function addTemplateToPeriod(periodId){
  const tplId = document.getElementById('pf-add-tpl').value
  const t = state.templates.find(function(x){ return x.id===tplId })
  if(!t) return
  const res = await sb.from('period_families').insert({period_id:periodId, klan_id:currentKlanId, template_id:t.id, name:t.name, is_adhoc:false}).select().single()
  if(res.error){ alert('Kunde inte lägga till: '+res.error.message); return }
  const pf = res.data
  const members = state.templateMembers.filter(function(m){ return m.template_id===t.id })
  if(members.length){
    await sb.from('period_members').insert(members.map(function(m,i){ return {period_family_id:pf.id, klan_id:currentKlanId, name:m.name, factor_mat:m.factor_mat, factor_vin:m.factor_vin, is_guest:false, days_mode:'all', day_states:[], sort_order:i} }))
  }
  await init(); openPeriodFamiliesModal(periodId)
}

function addAdhocFamilyModal(periodId){
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Ny adhoc-familj</div>
    <div class="fg"><label>Namn</label><input id="adhoc-name" placeholder="t.ex. Grannarna" autofocus/></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveAdhocFamily('${periodId}')">Spara</button>
      <button class="btn btn-g" onclick="openPeriodFamiliesModal('${periodId}')">Avbryt</button>
    </div>
  </div></div>`)
}
async function saveAdhocFamily(periodId){
  const name = document.getElementById('adhoc-name').value.trim()
  if(!name){ alert('Ange ett namn.'); return }
  const res = await sb.from('period_families').insert({period_id:periodId, klan_id:currentKlanId, template_id:null, name:name, is_adhoc:true})
  if(res.error){ alert('Kunde inte spara: '+res.error.message); return }
  await init(); openPeriodFamiliesModal(periodId)
}

async function delPeriodFamily(periodId, pfId){
  if(!confirm('Ta bort familjen ur perioden, inkl. alla dess medlemmar?')) return
  await sb.from('period_families').delete().eq('id',pfId)
  await init(); openPeriodFamiliesModal(periodId)
}

function addMemberModal(periodId, pfId, isGuest){
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">${isGuest?'Ny gäst':'Ny medlem'}</div>
    <div class="fg"><label>Namn</label><input id="m-name" autofocus/></div>
    <div class="fg"><label>Faktor-mat</label><input type="number" id="m-factor-mat" value="1" min="0" step="0.05"/></div>
    <div class="fg"><label>Faktor-vin</label><input type="number" id="m-factor-vin" value="0" min="0" step="0.05"/></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveNewMember('${periodId}','${pfId}',${isGuest})">Spara</button>
      <button class="btn btn-g" onclick="openPeriodFamiliesModal('${periodId}')">Avbryt</button>
    </div>
  </div></div>`)
}
async function saveNewMember(periodId, pfId, isGuest){
  const name = document.getElementById('m-name').value.trim()
  if(!name){ alert('Ange ett namn.'); return }
  const factorMat = parseFloat(document.getElementById('m-factor-mat').value)||0
  const factorVin = parseFloat(document.getElementById('m-factor-vin').value)||0
  const res = await sb.from('period_members').insert({period_family_id:pfId, klan_id:currentKlanId, name:name, factor_mat:factorMat, factor_vin:factorVin, is_guest:isGuest, days_mode:'all', day_states:[]})
  if(res.error){ alert('Kunde inte spara: '+res.error.message); return }
  await init(); openPeriodFamiliesModal(periodId)
}

function editMemberModal(periodId, memberId){
  const m = state.periodMembers.find(function(x){ return x.id===memberId })
  if(!m) return
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Redigera ${m.is_guest?'gäst':'medlem'}</div>
    <div class="fg"><label>Namn</label><input id="m-name" value="${esc(m.name)}" autofocus/></div>
    <div class="fg"><label>Faktor-mat</label><input type="number" id="m-factor-mat" value="${m.factor_mat}" min="0" step="0.05"/></div>
    <div class="fg"><label>Faktor-vin</label><input type="number" id="m-factor-vin" value="${m.factor_vin}" min="0" step="0.05"/></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveMember('${periodId}','${memberId}')">Spara</button>
      <button class="btn btn-g" onclick="openPeriodFamiliesModal('${periodId}')">Avbryt</button>
    </div>
  </div></div>`)
}
async function saveMember(periodId, memberId){
  const name = document.getElementById('m-name').value.trim()
  if(!name){ alert('Ange ett namn.'); return }
  const factorMat = parseFloat(document.getElementById('m-factor-mat').value)||0
  const factorVin = parseFloat(document.getElementById('m-factor-vin').value)||0
  const res = await sb.from('period_members').update({name:name, factor_mat:factorMat, factor_vin:factorVin}).eq('id',memberId)
  if(res.error){ alert('Kunde inte spara: '+res.error.message); return }
  await init(); openPeriodFamiliesModal(periodId)
}
async function delMember(periodId, memberId){
  if(!confirm('Ta bort personen ur perioden?')) return
  await sb.from('period_members').delete().eq('id',memberId)
  await init(); openPeriodFamiliesModal(periodId)
}

// dagar per medlem: array av 0/0.5/1, ett värde per datum i perioden
let memberDayState = []
function openMemberDaysModal(periodId, memberId){
  const p = state.periods.find(function(x){ return x.id===periodId })
  const m = state.periodMembers.find(function(x){ return x.id===memberId })
  const dates = getDatesInPeriod(p)
  if(m.days_mode==='custom'){
    try{ memberDayState = Array.isArray(m.day_states)?m.day_states.slice():JSON.parse(m.day_states||'[]') }catch(e){ memberDayState=[] }
    if(memberDayState.length!==dates.length){ const old=memberDayState; memberDayState = Array(dates.length).fill(0).map(function(_,i){ return old[i]||0 }) }
  } else {
    memberDayState = Array(dates.length).fill(1)
  }
  renderMemberDaysModal(periodId, memberId)
}
function renderMemberDaysModal(periodId, memberId){
  const p = state.periods.find(function(x){ return x.id===periodId })
  const dates = getDatesInPeriod(p)
  const m = state.periodMembers.find(function(x){ return x.id===memberId })
  const total = memberDayState.reduce(function(s,v){ return s+v },0)
  const cells = memberDayState.map(function(val,i){
    const isOn = val>0, isHalf = val===0.5
    return `<div class="day-cell">
      <div class="day-cb ${isOn?(isHalf?'half':'on'):''}" onclick="toggleMemberDay(${i},'${periodId}','${memberId}')">${isOn?(isHalf?'½':'✓'):''}</div>
      ${isOn ? `<button class="day-half-btn ${isHalf?'on':''}" onclick="toggleMemberHalf(${i},'${periodId}','${memberId}')">½</button>` : '<div style="height:18px"></div>'}
      <div class="day-label">${dayLabel(dates[i])}</div>
    </div>`
  }).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Dagar – ${esc(m.name)}</div>
    <div class="fam-days-row" style="border:none;padding:0">
      <div class="fam-days-name"><span>Närvaro</span><span>${fmt(total,1)} av ${dates.length} dagar</span></div>
      <div class="day-grid">${cells}</div>
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn btn-g btn-sm" onclick="resetMemberDaysToAll('${periodId}','${memberId}')">Alla dagar</button>
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn btn-p" onclick="saveMemberDays('${periodId}','${memberId}')">Spara</button>
      <button class="btn btn-g" onclick="openPeriodFamiliesModal('${periodId}')">Avbryt</button>
    </div>
  </div></div>`)
}
function resetMemberDaysToAll(periodId, memberId){
  const p = state.periods.find(function(x){ return x.id===periodId })
  memberDayState = Array(getDatesInPeriod(p).length).fill(1)
  renderMemberDaysModal(periodId, memberId)
}
function toggleMemberDay(idx, periodId, memberId){
  memberDayState[idx] = memberDayState[idx]>0 ? 0 : 1
  renderMemberDaysModal(periodId, memberId)
}
function toggleMemberHalf(idx, periodId, memberId){
  memberDayState[idx] = memberDayState[idx]===0.5 ? 1 : 0.5
  renderMemberDaysModal(periodId, memberId)
}
async function saveMemberDays(periodId, memberId){
  const p = state.periods.find(function(x){ return x.id===periodId })
  const dates = getDatesInPeriod(p)
  const allDays = memberDayState.every(function(v){ return v===1 }) && memberDayState.length===dates.length
  const payload = allDays ? {days_mode:'all', day_states:[]} : {days_mode:'custom', day_states:memberDayState}
  const res = await sb.from('period_members').update(payload).eq('id',memberId)
  if(res.error){ alert('Kunde inte spara: '+res.error.message); return }
  await init(); openPeriodFamiliesModal(periodId)
}

// ============================================================
// RAPPORT – kostnadsfördelning
// ============================================================
function computeReport(periodId){
  const period = state.periods.find(function(p){ return p.id===periodId })
  const dates = period ? getDatesInPeriod(period) : []
  const pfs = periodFamiliesFor(periodId)
  const receipts = state.receipts.filter(function(r){ return r.period_id===periodId })
  const totMat = receipts.reduce(function(s,r){ return s+(parseFloat(r.total_amount)||0)-(parseFloat(r.alcohol_amount)||0) },0)
  const totVin = receipts.reduce(function(s,r){ return s+(parseFloat(r.alcohol_amount)||0) },0)

  let sumMandagar=0, sumVinMandagar=0
  const allMembers = []
  pfs.forEach(function(pf){
    periodMembersFor(pf.id).forEach(function(m){
      const days = memberDays(m, dates)
      const mandagar = days*(parseFloat(m.factor_mat)||0)
      const vinMandagar = days*(parseFloat(m.factor_vin)||0)
      sumMandagar += mandagar
      sumVinMandagar += vinMandagar
      allMembers.push(Object.assign({}, m, {familyId:pf.id, familyName:pf.name, days:days, mandagar:mandagar, vinMandagar:vinMandagar}))
    })
  })
  const matPerMandag = sumMandagar>0 ? totMat/sumMandagar : 0
  const vinPerVinMandag = sumVinMandagar>0 ? totVin/sumVinMandagar : 0

  const paidMat={}, paidVin={}
  pfs.forEach(function(pf){ paidMat[pf.id]=0; paidVin[pf.id]=0 })
  receipts.forEach(function(r){
    const fid = r.paid_by_period_family_id
    if(!fid || !(fid in paidMat)) return
    paidMat[fid] += (parseFloat(r.total_amount)||0)-(parseFloat(r.alcohol_amount)||0)
    paidVin[fid] += (parseFloat(r.alcohol_amount)||0)
  })

  const perFamily = pfs.map(function(pf){
    const members = allMembers.filter(function(m){ return m.familyId===pf.id })
    const famMandagar = members.reduce(function(s,m){ return s+m.mandagar },0)
    const famVinMandagar = members.reduce(function(s,m){ return s+m.vinMandagar },0)
    const owedMat = matPerMandag*famMandagar
    const owedVin = vinPerVinMandag*famVinMandagar
    const paid = (paidMat[pf.id]||0)+(paidVin[pf.id]||0)
    const owed = owedMat+owedVin
    return { id:pf.id, name:pf.name, mandagar:famMandagar, vinMandagar:famVinMandagar, owedMat:owedMat, owedVin:owedVin, owed:owed, paid:paid, balance: paid-owed }
  })

  return { dates:dates, totMat:totMat, totVin:totVin, sumMandagar:sumMandagar, sumVinMandagar:sumVinMandagar, matPerMandag:matPerMandag, vinPerVinMandag:vinPerVinMandag, members:allMembers, perFamily:perFamily }
}

function renderReport(){
  const period = currentPeriod()
  if(!period) return '<p class="empty">Välj en period.</p>'
  const rep = computeReport(period.id)
  if(!state.receipts.filter(function(r){ return r.period_id===period.id }).length) return '<p class="empty">Inga kvitton i perioden ännu.</p>'
  if(!rep.members.length) return '<p class="empty">Lägg till familjer och medlemmar under fliken Perioder → Familjer.</p>'

  const sumBar = `<div class="sum-bar">
    <div class="rep-row"><span>🥗 Mat</span><span>${fmt(rep.totMat)} kr</span></div>
    <div class="rep-row"><span>🍷 Vin</span><span>${fmt(rep.totVin)} kr</span></div>
    <div class="rep-row" style="font-weight:700;font-size:15px;margin-top:4px"><span>Totalt</span><span>${fmt(rep.totMat+rep.totVin)} kr</span></div>
    <div class="rep-row" style="margin-top:6px;color:var(--muted);font-size:12px"><span>Mandagar</span><span>${fmt(rep.sumMandagar,1)} · ${fmt(rep.matPerMandag,2)} kr/mandag</span></div>
    ${rep.sumVinMandagar>0?`<div class="rep-row" style="color:var(--muted);font-size:12px"><span>Vinmandagar</span><span>${fmt(rep.sumVinMandagar,1)} · ${fmt(rep.vinPerVinMandag,2)} kr/vinmandag</span></div>`:''}
  </div>`

  const famRows = rep.perFamily.map(function(f){ return `<div class="card">
    <div class="card-hdr">
      <div>
        <div class="card-title">${esc(f.name)}</div>
        <div class="card-sub">Mandagar: ${fmt(f.mandagar,1)}${f.vinMandagar>0?' · Vinmandagar: '+fmt(f.vinMandagar,1):''}</div>
        <div class="card-sub">Ska betala: ${fmt(f.owed)} kr (mat ${fmt(f.owedMat)} · vin ${fmt(f.owedVin)})</div>
        <div class="card-sub">Har betalat: ${fmt(f.paid)} kr</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700;color:${f.balance>=0?'var(--green)':'var(--danger)'}">${f.balance>=0?'+':''}${fmt(f.balance)} kr</div>
        <div class="card-sub">${f.balance>=0?'ska ha tillbaka':'ska betala'}</div>
      </div>
    </div>
  </div>` }).join('')

  return `<div class="sh"><span class="sh-title">Rapport – ${esc(period.name)}</span></div>${sumBar}${famRows}`
}

// ============================================================
// KVITTON
// ============================================================
function setReceiptFilter(famId){ receiptFilter = receiptFilter===famId?null:famId; renderActive() }

function renderReceipts(){
  const period = currentPeriod()
  if(!state.periods.filter(function(p){ return p.status==='oppen'||p.status==='last' }).length){
    return `<p class="empty">Skapa en period innan du kan registrera kvitton.</p>
      <div style="text-align:center;margin-top:10px"><button class="btn btn-p" onclick="showTab('periods', document.querySelectorAll('.tab')[4])">📅 Skapa period</button></div>`
  }
  if(!period) return '<p class="empty">Välj en period ovan.</p>'
  const locked = !isOpenPeriod(period)
  const allReceipts = periodReceipts()
  const filtered = receiptFilter ? allReceipts.filter(function(r){ return r.paid_by_period_family_id===receiptFilter }) : allReceipts

  const totMat = allReceipts.reduce(function(s,r){ return s+(parseFloat(r.total_amount)||0)-(parseFloat(r.alcohol_amount)||0) },0)
  const totVin = allReceipts.reduce(function(s,r){ return s+(parseFloat(r.alcohol_amount)||0) },0)
  const sumBar = allReceipts.length ? `
    <div class="sum-bar">
      <div class="rep-row"><span>🥗 Mat</span><span>${fmt(totMat)} kr</span></div>
      <div class="rep-row"><span>🍷 Vin</span><span>${fmt(totVin)} kr</span></div>
      <div class="rep-row" style="font-weight:700;font-size:15px;margin-top:4px"><span>Totalt</span><span>${fmt(totMat+totVin)} kr</span></div>
    </div>` : ''

  const lockedBanner = locked ? `<div class="hint" style="background:var(--danger-light);color:var(--danger)">🔒 Perioden är låst. Lås upp den under fliken Perioder för att lägga till fler kvitton.</div>` : ''

  const pfs = periodFamiliesFor(period.id)
  const chips = `<div class="filter-chips">
    <span class="chip ${!receiptFilter?'on':''}" onclick="setReceiptFilter(null)">Alla</span>
    ${pfs.map(function(pf){ return '<span class="chip '+(receiptFilter===pf.id?'on':'')+'" onclick="setReceiptFilter(\''+pf.id+'\')">'+esc(pf.name)+'</span>' }).join('')}
  </div>`

  const rows = filtered.map(function(r){
    const paidBy = pfName(r.paid_by_period_family_id)
    const wine = r.alcohol_amount > 0
    return `<div class="slim-row">
      <div style="flex:1;min-width:0">
        <div class="slim-desc">${wine?'🍷 ':'🥗 '}${esc(r.description)}</div>
        <div class="slim-sub">${fmtDate(r.date)}${!receiptFilter&&paidBy?' · '+esc(paidBy):''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="slim-amt">${fmt(r.total_amount)} kr</div>
      </div>
      <div class="slim-actions">
        <button class="btn btn-g btn-sm" onclick="editReceipt('${r.id}')">✏️</button>
        <button class="btn btn-d btn-sm" onclick="delReceipt('${r.id}')">✕</button>
      </div>
    </div>`
  }).join('')

  const emptyMsg = allReceipts.length===0 ? '<p class="empty">Inga kvitton ännu. Tryck på Registrera kvitton nedan.</p>'
    : filtered.length===0 ? '<p class="empty">Inga kvitton för det filtret.</p>' : ''

  const addBtn = locked
    ? `<button class="btn btn-g" disabled title="Perioden är låst">🔒 Registrera</button>`
    : `<button class="btn btn-p" onclick="showTab('bulk', document.querySelectorAll('.tab')[1])">➕ Registrera kvitton</button>`

  return `<div class="sh"><span class="sh-title">${esc(period.name)}</span></div>
    ${lockedBanner}${sumBar}${chips}${emptyMsg}${rows}
    <div style="text-align:center;margin-top:14px">${addBtn}</div>`
}

function editReceipt(id){
  const r = state.receipts.find(function(x){ return x.id===id })
  if(!r) return
  const pfs = periodFamiliesFor(r.period_id)
  const paidOpts = '<option value="">– okänt –</option>' + pfs.map(function(pf){ return '<option value="'+pf.id+'" '+(pf.id===r.paid_by_period_family_id?'selected':'')+'>'+esc(pf.name)+'</option>' }).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Redigera kvitto</div>
    <div class="fg"><label>Beskrivning</label><input id="r-desc" value="${esc(r.description)}" autofocus/></div>
    <div class="fr">
      <div class="fg"><label>Datum</label><input type="date" id="r-date" value="${r.date}"/></div>
      <div class="fg"><label>Belopp (kr)</label><input type="number" id="r-total" value="${r.total_amount}" step="0.01"/></div>
    </div>
    <input type="hidden" id="r-type-val" value="${r.alcohol_amount>0?'wine':'food'}"/>
    <div class="fg"><label style="display:flex;gap:12px">
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="radio" name="r-type" value="food" ${r.alcohol_amount>0?'':'checked'} onchange="document.getElementById('r-type-val').value='food'" style="width:auto"/>🥗 Mat</label>
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="radio" name="r-type" value="wine" ${r.alcohol_amount>0?'checked':''} onchange="document.getElementById('r-type-val').value='wine'" style="width:auto"/>🍷 Vin</label>
    </label></div>
    <div class="fg"><label>Betald av</label><select id="r-paid">${paidOpts}</select></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveReceiptEdit('${id}')">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}
async function saveReceiptEdit(id){
  const desc = document.getElementById('r-desc').value.trim()
  const total = parseFloat(document.getElementById('r-total').value)||0
  if(!desc){ alert('Ange en beskrivning.'); return }
  const isWine = document.getElementById('r-type-val').value === 'wine'
  const res = await sb.from('receipts').update({
    description: desc,
    date: document.getElementById('r-date').value,
    total_amount: total,
    alcohol_amount: isWine ? total : 0,
    paid_by_period_family_id: document.getElementById('r-paid').value || null,
  }).eq('id', id)
  if(res.error){ alert('Kunde inte spara: '+res.error.message); return }
  closeModal(); await init()
}
async function delReceipt(id){
  if(!confirm('Ta bort kvittot?')) return
  await sb.from('receipts').delete().eq('id',id)
  await init()
}

// ── BULK ENTRY ────────────────────────────────────────────────
let bulkRows = []
let bulkNextId = 1
function addBulkRow(){
  bulkRows.push({id:bulkNextId++, desc:'', date:today(), amount:'', type:'food', paidBy:''})
}
function renderBulk(el){
  const period = currentPeriod()
  const openPeriods = state.periods.filter(function(p){ return p.status==='oppen' })
  if(!state.periods.length){
    el.innerHTML = `<div class="sh"><span class="sh-title">Registrera flera</span></div><p class="empty">Skapa en period innan du kan registrera kvitton.</p>`
    return
  }
  if(!openPeriods.length){
    el.innerHTML = `<div class="sh"><span class="sh-title">Registrera flera</span></div><p class="empty">Alla perioder är låsta. Lås upp en period under fliken Perioder för att registrera fler kvitton.</p>`
    return
  }
  if(!bulkRows.length) addBulkRow()
  const pfs = period ? periodFamiliesFor(period.id) : []
  const famOpts = '<option value="">– välj familj –</option>' + pfs.map(function(pf){ return '<option value="'+pf.id+'">'+esc(pf.name)+'</option>' }).join('')

  const rowsHtml = bulkRows.map(function(row,i){
    const thisFamOpts = famOpts.replace('value="'+row.paidBy+'"', 'value="'+row.paidBy+'" selected')
    return `<div class="card" style="margin-bottom:8px">
    <div class="fg"><input placeholder="Beskrivning" value="${esc(row.desc)}" oninput="bulkRows[${i}].desc=this.value"/></div>
    <div class="fr">
      <input type="date" value="${row.date}" oninput="bulkRows[${i}].date=this.value" style="flex:1"/>
      <input type="number" placeholder="Belopp" value="${row.amount}" oninput="bulkRows[${i}].amount=this.value" step="0.01" style="flex:1"/>
    </div>
    <div class="fr" style="align-items:center">
      <select onchange="bulkRows[${i}].type=this.value" style="flex:1">
        <option value="food" ${row.type==='food'?'selected':''}>🥗 Mat</option>
        <option value="wine" ${row.type==='wine'?'selected':''}>🍷 Vin</option>
      </select>
      <select onchange="bulkRows[${i}].paidBy=this.value" style="flex:1">${thisFamOpts}</select>
      <button class="btn btn-d btn-sm" onclick="bulkRows.splice(${i},1);renderBulk(document.getElementById('tab-bulk'))">✕</button>
    </div>
  </div>`
  }).join('')

  el.innerHTML = `<div class="sh"><span class="sh-title">Registrera flera</span></div>
    <div class="hint">Period: <strong>${esc(period?period.name:'')}</strong></div>
    ${rowsHtml}
    <div class="btn-row">
      <button class="btn btn-g btn-sm" onclick="addBulkRow();renderBulk(document.getElementById('tab-bulk'))">+ Ny rad</button>
      <button class="btn btn-p" onclick="saveBulkRows()">Spara alla</button>
    </div>`
}
async function saveBulkRows(){
  const period = currentPeriod()
  if(!period){ alert('Välj en period.'); return }
  const valid = bulkRows.filter(function(r){ return r.desc.trim() && parseFloat(r.amount)>0 })
  if(!valid.length){ alert('Fyll i minst en rad med beskrivning och belopp.'); return }
  const rows = valid.map(function(r){ return {
    period_id: period.id,
    klan_id: currentKlanId,
    description: r.desc.trim(),
    date: r.date,
    total_amount: parseFloat(r.amount)||0,
    alcohol_amount: r.type==='wine' ? (parseFloat(r.amount)||0) : 0,
    paid_by_period_family_id: r.paidBy || null,
  } })
  const res = await sb.from('receipts').insert(rows)
  if(res.error){ alert('Kunde inte spara: '+res.error.message); return }
  bulkRows = []
  showTab('receipts', document.querySelectorAll('.tab')[0])
  await init()
}

// ============================================================
// HISTORIK
// ============================================================
function renderHistorik(){
  const hist = state.periods.filter(function(p){ return p.status==='clearad'||p.status==='komprimerad' }).sort(function(a,b){ return new Date(b.starts_at)-new Date(a.starts_at) })
  if(!hist.length) return '<div class="sh"><span class="sh-title">Historik</span></div><p class="empty">Inga clearade perioder ännu.</p>'
  const rows = hist.map(function(p){
    const rep = p.frozen_report || {totMat:0,totVin:0}
    const tot = (parseFloat(rep.totMat)||0)+(parseFloat(rep.totVin)||0)
    return `<div class="slim-row" onclick="openHistoryDetail('${p.id}')" style="cursor:pointer">
      <div style="flex:1;min-width:0">
        <div class="slim-desc">${esc(p.name)} ${p.status==='komprimerad'?'<span class="tag">Komprimerad</span>':'<span class="tag">Clearad</span>'}</div>
        <div class="slim-sub">${new Date(p.starts_at).toLocaleDateString('sv-SE')} – ${new Date(p.ends_at).toLocaleDateString('sv-SE')}</div>
      </div>
      <div class="slim-amt">${fmt(tot)} kr</div>
    </div>`
  }).join('')
  return `<div class="sh"><span class="sh-title">Historik</span></div>${rows}`
}

function openHistoryDetail(periodId){
  const p = state.periods.find(function(x){ return x.id===periodId })
  if(!p) return
  const rep = p.frozen_report || {totMat:0,totVin:0,perFamily:[]}
  const famRows = (rep.perFamily||[]).map(function(f){ return '<div class="rep-row"><span>'+esc(f.name)+'</span><span>'+fmt(f.owed)+' kr (betalat '+fmt(f.paid)+' kr)</span></div>' }).join('')
  const compressBtn = p.status==='clearad' ? `<button class="btn btn-w btn-sm" onclick="compressPeriod('${p.id}')">🗜️ Komprimera</button>` : ''
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">${esc(p.name)}</div>
    <div class="card-sub">${new Date(p.starts_at).toLocaleDateString('sv-SE')} – ${new Date(p.ends_at).toLocaleDateString('sv-SE')}</div>
    <div class="sum-bar" style="margin-top:8px">
      <div class="rep-row"><span>🥗 Mat</span><span>${fmt(rep.totMat)} kr</span></div>
      <div class="rep-row"><span>🍷 Vin</span><span>${fmt(rep.totVin)} kr</span></div>
      <div class="rep-row" style="font-weight:700"><span>Totalt</span><span>${fmt((parseFloat(rep.totMat)||0)+(parseFloat(rep.totVin)||0))} kr</span></div>
    </div>
    <div style="margin-top:8px">${famRows || '<p class="empty">Ingen detaljerad data sparad.</p>'}</div>
    ${p.status==='komprimerad' ? '<div class="hint" style="margin-top:8px">Kvitton och detaljer är slängda – bara totalsumman finns kvar.</div>' : ''}
    <div class="btn-row" style="margin-top:12px">
      ${compressBtn}
      <button class="btn btn-g" onclick="closeModal()">Stäng</button>
    </div>
  </div></div>`)
}

// ── START ─────────────────────────────────────────────────────
boot()
