const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

let state = { templates:[], templateMembers:[], platser:[], vistelseFamilies:[], vistelseMembers:[] }
let activeTab = 'platser'
let calendarPlatsId = null
let calendarChartMode = 'timeline'
let weekAnchorDate = null
let currentKlanId = null
let currentKlanName = ''

// ── GLOBAL FELHANTERING ────────────────────────────────────────────────────────
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

// ── KLAN-SESSION (delas med Kvittodelning, ingen egen inloggning) ─────────────
function boot(){
  const savedId = localStorage.getItem('kvitton_klan_id')
  const savedName = localStorage.getItem('kvitton_klan_name')
  if(savedId && savedName){
    currentKlanId = savedId
    currentKlanName = savedName
    enterApp()
  } else {
    renderNotLoggedIn()
  }
}

function renderNotLoggedIn(){
  const g = document.getElementById('authGate')
  g.style.display='block'
  g.innerHTML = `<div class="gate"><div class="gate-box">
    <h2>Vistelseplanering</h2>
    <p>Du behöver logga in i en klan via Hushållskostnader innan du kan planera vistelser.</p>
    <a class="btn btn-p" style="width:100%;text-align:center;text-decoration:none;display:block" href="../">🧾 Gå till Hushållskostnader</a>
  </div></div>`
}

async function enterApp(){
  document.getElementById('authGate').style.display='none'
  document.getElementById('authGate').innerHTML=''
  document.getElementById('mainApp').style.display=''
  document.getElementById('klanPill').textContent = '👥 '+currentKlanName
  renderSwitcher()
  await init()
}

// ── VÄXLINGSMENY (Hushållskostnader / Vistelseplanering / Fastighetskostnader / Projekt) ─────────────────
function renderSwitcher(){
  const items = [
    {key:'kvitton', icon:'🧾', label:'Hushållskostnader', href:'../'},
    {key:'planering', icon:'🗓️', label:'Vistelseplanering', href:'./'},
    {key:'bastadkonto', icon:'🏠', label:'Fastighetskostnader', href:'../bastadkonto/'},
    {key:'projekt', icon:'✅', label:'Projekt', href:'../bastadkonto/?tab=projects'},
  ]
  const el = document.getElementById('appSwitcher')
  if(!el) return
  el.innerHTML = items.map(it=>`<a class="switch-item ${it.key==='planering'?'on':''}" href="${it.href}">${it.icon} ${it.label}</a>`).join('')
}

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init(){
  showLoading()
  try{
    const [tp,tm,pl,vf,vm] = await Promise.all([
      sb.from('family_templates').select('*').eq('klan_id',currentKlanId).order('name'),
      sb.from('template_members').select('*').eq('klan_id',currentKlanId).order('sort_order'),
      sb.from('platser').select('*').eq('klan_id',currentKlanId).order('recurring',{ascending:false}).order('name'),
      sb.from('vistelse_families').select('*').eq('klan_id',currentKlanId).order('created_at'),
      sb.from('vistelse_members').select('*').eq('klan_id',currentKlanId).order('created_at'),
    ])
    state.templates = tp.data||[]
    state.templateMembers = tm.data||[]
    state.platser = pl.data||[]
    state.vistelseFamilies = vf.data||[]
    state.vistelseMembers = vm.data||[]
    renderActive()
  }catch(err){
    console.error(err)
    showError(err.message || String(err))
    const el = document.getElementById('tab-'+activeTab)
    if(el) el.innerHTML = '<p class="empty">Kunde inte ladda data. Felmeddelandet syns högst upp.</p>'
  }
}

function showLoading(){ const el=document.getElementById('tab-'+activeTab); if(el) el.innerHTML='<div class="loading">Laddar…</div>' }

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
    if(tab==='platser')  el.innerHTML = renderPlatser()
    if(tab==='kalender') el.innerHTML = renderKalender()
  }catch(err){
    console.error(err)
    if(el) el.innerHTML = '<p class="empty">Något gick fel när den här fliken skulle visas.</p>'
    showError(err.message || String(err))
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function fmt(n,d=0){ return Number(n||0).toLocaleString('sv-SE',{minimumFractionDigits:d,maximumFractionDigits:d}) }
function fmtDate(d){ return new Date(d).toLocaleDateString('sv-SE',{month:'short',day:'numeric'}) }
function fmtDateY(d){ return new Date(d).toLocaleDateString('sv-SE',{year:'numeric',month:'short',day:'numeric'}) }
function isoAdd(dateStr, days){ const [y,m,d]=dateStr.split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d)); dt.setUTCDate(dt.getUTCDate()+days); return dt.toISOString().slice(0,10) }
function toUTCms(dateStr){ const [y,m,d]=dateStr.split('-').map(Number); return Date.UTC(y,m-1,d) }
function dayOfWeekUTC(dateStr){ return new Date(toUTCms(dateStr)).getUTCDay() }
function isoWeekNumber(dateStr){
  const date = new Date(toUTCms(dateStr))
  const dayNum = (date.getUTCDay()+6)%7
  date.setUTCDate(date.getUTCDate()-dayNum+3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(),0,4))
  const firstDayNum = (firstThursday.getUTCDay()+6)%7
  firstThursday.setUTCDate(firstThursday.getUTCDate()-firstDayNum+3)
  return 1 + Math.round((date-firstThursday)/(7*24*3600*1000))
}
function today(){ return new Date().toISOString().slice(0,10) }
function platsName(id){ return (state.platser.find(p=>p.id===id)||{}).name||'' }
function isoWeekStart(dateStr){ const dow=dayOfWeekUTC(dateStr); const diff = dow===0 ? -6 : (1-dow); return isoAdd(dateStr, diff) }
function getWeekDates(anchorDate){ const monday=isoWeekStart(anchorDate); const dates=[]; for(let i=0;i<7;i++) dates.push(isoAdd(monday,i)); return dates }
function dayLabelUTC(dateStr){ const days=['sö','må','ti','on','to','fr','lö']; const d=new Date(toUTCms(dateStr)); return `${days[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth()+1}` }
function closeModal(){ document.getElementById('modal').style.display='none'; document.getElementById('modal').innerHTML='' }
function openModal(html){ document.getElementById('modal').innerHTML=html; document.getElementById('modal').style.display='block' }
function datesBetween(start,end){ const out=[]; let cur=start, guard=0; while(cur<=end && guard<3660){ out.push(cur); cur=isoAdd(cur,1); guard++ } return out }
function unionDates(existing, extra){ return Array.from(new Set([...(existing||[]),...extra])).sort() }

// ── FAMILJER/MEDLEMMAR – DATA-HELPERS ────────────────────────────────────────
function templateName(id){ return (state.templates.find(t=>t.id===id)||{}).name||'' }
function templateMembersFor(templateId){ return state.templateMembers.filter(m=>m.template_id===templateId).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)) }
function membersFor(vfId){ return state.vistelseMembers.filter(m=>m.vistelse_family_id===vfId) }
function vfById(id){ return state.vistelseFamilies.find(vf=>vf.id===id) }
function memberById(id){ return state.vistelseMembers.find(m=>m.id===id) }

// unionen av alla dagar (sorterad, unik) för en familjs samtliga medlemmar
function familyDates(vfId){
  const members = membersFor(vfId)
  let all = []
  members.forEach(m => { all = all.concat(m.day_states||[]) })
  return Array.from(new Set(all)).sort()
}

// bryter en sorterad datumlista i sammanhängande segment (hanterar luckor)
function toSegments(sortedDates){
  if(!sortedDates.length) return []
  const segs = []
  let segStart = sortedDates[0], prev = sortedDates[0]
  for(let i=1;i<sortedDates.length;i++){
    const d = sortedDates[i]
    if(d !== isoAdd(prev,1)){
      segs.push({start:segStart, end:prev})
      segStart = d
    }
    prev = d
  }
  segs.push({start:segStart, end:prev})
  return segs
}

// om label saknas, föreslå årtalet från ett startdatum – rent kosmetiskt, styr ingen logik
async function maybeSetDefaultLabel(vf, startDate){
  if(vf.label) return
  const year = startDate.slice(0,4)
  const { error } = await sb.from('vistelse_families').update({label:year}).eq('id',vf.id)
  if(!error) vf.label = year
}

// ── PLATSER ───────────────────────────────────────────────────────────────────
function renderPlatser(){
  const cards = state.platser.map(pl=>{
    const vfCount = state.vistelseFamilies.filter(vf=>vf.plats_id===pl.id).length
    return `<div class="card" onclick="editPlats('${pl.id}')" style="cursor:pointer">
      <div class="card-hdr">
        <div>
          <div class="card-title">${esc(pl.name)}${pl.recurring?' <span class="tag">🔁 Återkommande</span>':''}</div>
          <div class="card-sub">${vfCount} famil${vfCount===1?'j':'jer'} inplanerade</div>
        </div>
        <div class="btn-row">
          <button class="btn btn-d btn-sm" onclick="event.stopPropagation(); delPlats('${pl.id}')">Ta bort</button>
        </div>
      </div>
    </div>`
  }).join('')
  return `<div class="sh"><span class="sh-title">Ställen</span><button class="btn btn-p" onclick="newPlats()">+ Lägg till</button></div>
    <div class="hint">Ett ställe (t.ex. Båstad eller Kroatien) kan kopplas till perioder i Kvittodelning, så ni kan se vilka som är var. Vistelser planeras per ställe under fliken Kalender. Återkommande ställen (t.ex. sommarstället) visas överst i listor.</div>
    ${!state.platser.length?'<p class="empty">Inga ställen ännu.</p>':cards}`
}

function platsModal(pl=null){
  const id=pl?pl.id:''
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">${pl?'Redigera ställe':'Nytt ställe'}</div>
    <div class="fg"><label>Namn</label><input id="pl-name" value="${esc(pl?pl.name:'')}" placeholder="t.ex. Båstad" autofocus/></div>
    <div class="fg"><label style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" id="pl-recurring" style="width:auto" ${pl&&pl.recurring?'checked':''}/> 🔁 Återkommande ställe (visas överst i listor)</label></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="savePlats('${id}')">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

function newPlats(){ platsModal() }
function editPlats(id){ platsModal(state.platser.find(p=>p.id===id)) }

async function savePlats(id){
  const name = document.getElementById('pl-name').value.trim()
  if(!name){ alert('Ange ett namn.'); return }
  const recurring = document.getElementById('pl-recurring').checked
  const { error } = id
    ? await sb.from('platser').update({name, recurring}).eq('id',id)
    : await sb.from('platser').insert({name, recurring, klan_id: currentKlanId})
  if(error){ alert('Kunde inte spara stället: '+error.message); return }
  closeModal(); await init()
}

async function delPlats(id){
  if(!confirm('Ta bort stället? Perioder i Kvittodelning som var kopplade till det förlorar bara kopplingen, de tas inte bort. OBS: eventuella inkopierade familjer i planeringskalendern för stället tas bort.')) return
  const { error } = await sb.from('platser').delete().eq('id',id)
  if(error){ alert('Kunde inte ta bort stället: '+error.message); return }
  await init()
}

// ── KALENDER / VISTELSEFAMILJER ───────────────────────────────────────────────
function setCalendarPlats(id){ calendarPlatsId = id; weekAnchorDate = null; renderActive() }
function setCalendarChartMode(mode){ calendarChartMode = mode; renderActive() }

function renderKalender(){
  if(!state.platser.length){
    return `<p class="empty">Skapa ett ställe (t.ex. Båstad) under fliken Ställen för att kunna planera vistelser där.</p>`
  }
  if(!calendarPlatsId || !state.platser.find(p=>p.id===calendarPlatsId)){
    calendarPlatsId = state.platser[0].id
  }
  const platsOpts = state.platser.map(pl=>`<option value="${pl.id}" ${pl.id===calendarPlatsId?'selected':''}>${pl.recurring?'🔁 ':''}${esc(pl.name)}</option>`).join('')
  const vfs = state.vistelseFamilies.filter(vf=>vf.plats_id===calendarPlatsId)

  const chartToggle = `<div class="btn-row" style="margin-bottom:8px">
    <button class="btn ${calendarChartMode==='bar'?'btn-p':'btn-g'} btn-sm" onclick="setCalendarChartMode('bar')">📊 Diagram</button>
    <button class="btn ${calendarChartMode==='timeline'?'btn-p':'btn-g'} btn-sm" onclick="setCalendarChartMode('timeline')">📅 Tidslinje</button>
    <button class="btn ${calendarChartMode==='week'?'btn-p':'btn-g'} btn-sm" onclick="setCalendarChartMode('week')">🔎 Vecka</button>
  </div>`
  const chartHtml = calendarChartMode==='timeline'
    ? renderTimelineChart(vfs)
    : calendarChartMode==='week'
    ? renderWeekGantt(vfs)
    : renderOccupancyChart(computeDailyOccupancy(vfs))

  const familyCards = vfs.map(vf => renderFamilyCard(vf)).join('')

  return `<div class="sh"><span class="sh-title">Kalender</span>
      <div class="btn-row">
        <button class="btn btn-g btn-sm" onclick="copyInFamilyModal('${calendarPlatsId}')">+ Kopiera in familj</button>
        <button class="btn btn-p btn-sm" onclick="newAdhocFamilyModal('${calendarPlatsId}')">+ Adhoc-familj</button>
      </div>
    </div>
    <div class="fg" style="max-width:260px"><select onchange="setCalendarPlats(this.value)">${platsOpts}</select></div>
    <div class="hint">Vistelseplanering är helt separat från avräkning och mandagar i Hushållskostnader. Kopiera in en familj för att börja planera vilka dagar var och en är i ${esc(platsName(calendarPlatsId))}.</div>
    ${chartToggle}
    ${vfs.length ? chartHtml : ''}
    <div class="sh" style="margin-top:14px"><span class="sh-title" style="font-size:14px">Familjer</span></div>
    ${vfs.length ? familyCards : '<p class="empty">Inga familjer inkopierade för det här stället ännu.</p>'}`
}

// ── KOPIERA IN / ADHOC ────────────────────────────────────────────────────────
function copyInFamilyModal(platsId){
  const opts = state.templates.map(t=>`<div class="slim-row" style="cursor:pointer" onclick="copyInTemplate('${platsId}','${t.id}')">
    <div style="flex:1"><div class="slim-desc">${esc(t.name)}</div><div class="slim-sub">${templateMembersFor(t.id).length} person(er) i mallen</div></div>
    <div class="slim-actions"><button class="btn btn-p btn-sm">Kopiera in</button></div>
  </div>`).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Kopiera in familj – ${esc(platsName(platsId))}</div>
    ${state.templates.length ? opts : '<p class="empty">Inga familjemallar finns ännu – skapa en i Hushållskostnader, eller lägg till en adhoc-familj här istället.</p>'}
    <div class="btn-row" style="margin-top:10px">
      <button class="btn btn-g" onclick="closeModal()">Stäng</button>
    </div>
  </div></div>`)
}

async function copyInTemplate(platsId, templateId){
  const tpl = state.templates.find(t=>t.id===templateId)
  if(!tpl) return
  const res = await sb.from('vistelse_families').insert({
    klan_id: currentKlanId, plats_id: platsId, template_id: templateId, name: tpl.name, is_adhoc:false
  }).select().single()
  if(res.error){ alert('Kunde inte kopiera in familjen: '+res.error.message); return }
  const tmembers = templateMembersFor(templateId)
  if(tmembers.length){
    const rows = tmembers.map(m => ({ vistelse_family_id: res.data.id, klan_id: currentKlanId, name: m.name, is_guest:false, day_states:[] }))
    const mres = await sb.from('vistelse_members').insert(rows)
    if(mres.error){ alert('Familjen kopierades in, men medlemmarna kunde inte skapas: '+mres.error.message) }
  }
  closeModal(); await init()
}

function newAdhocFamilyModal(platsId){
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Ny adhoc-familj – ${esc(platsName(platsId))}</div>
    <div class="fg"><label>Namn</label><input id="af-name" placeholder="t.ex. Vänner från Göteborg" autofocus/></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveAdhocFamily('${platsId}')">Skapa</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function saveAdhocFamily(platsId){
  const name = document.getElementById('af-name').value.trim()
  if(!name){ alert('Ange ett namn.'); return }
  const { error } = await sb.from('vistelse_families').insert({ klan_id: currentKlanId, plats_id: platsId, template_id:null, name, is_adhoc:true })
  if(error){ alert('Kunde inte skapa familjen: '+error.message); return }
  closeModal(); await init()
}

async function delVistelseFamily(vfId){
  if(!confirm('Ta bort familjen och alla dess personer/dagar från planeringen? Går inte att ångra.')) return
  const { error } = await sb.from('vistelse_families').delete().eq('id',vfId)
  if(error){ alert('Kunde inte ta bort: '+error.message); return }
  await init()
}

async function updateVistelseFamilyName(vfId, name){
  name = name.trim()
  if(!name) return
  const { error } = await sb.from('vistelse_families').update({name}).eq('id',vfId)
  if(error){ alert('Kunde inte spara namnet: '+error.message); return }
  const vf = vfById(vfId); if(vf) vf.name = name
}

async function updateVistelseFamilyLabel(vfId, label){
  const { error } = await sb.from('vistelse_families').update({label: label.trim() || null}).eq('id',vfId)
  if(error){ alert('Kunde inte spara etiketten: '+error.message); return }
  const vf = vfById(vfId); if(vf) vf.label = label.trim() || null
}

// ── FAMILJEKORT ───────────────────────────────────────────────────────────────
function renderFamilyCard(vf){
  const members = membersFor(vf.id)
  const dates = familyDates(vf.id)
  const rangeLabel = dates.length ? `${fmtDateY(dates[0])} – ${fmtDateY(dates[dates.length-1])}` : 'Inga dagar satta ännu'

  const memberRows = members.map(m=>{
    const cnt = (m.day_states||[]).length
    const badge = cnt ? `${cnt} dag${cnt===1?'':'ar'}` : 'Inga dagar'
    return `<div class="slim-row">
      <div style="flex:1;min-width:0">
        <div class="slim-desc">${esc(m.name)}${m.is_guest?' <span class="tag">Gäst</span>':''}</div>
        <div class="slim-sub">${badge}</div>
      </div>
      <div class="slim-actions">
        <button class="btn btn-g btn-sm" onclick="openMemberDayEditor('${m.id}')">📅 Dagar</button>
        <button class="btn btn-d btn-sm" onclick="delMember('${m.id}')">✕</button>
      </div>
    </div>`
  }).join('')

  return `<div class="card" style="margin-bottom:10px">
    <div class="card-hdr">
      <div style="flex:1;min-width:0">
        <input value="${esc(vf.name)}" onchange="updateVistelseFamilyName('${vf.id}',this.value)" style="font-weight:600;font-size:15px;border:none;background:transparent;padding:2px 0;width:100%" />
        <div class="card-sub">${esc(rangeLabel)}</div>
        <div style="margin-top:4px">
          <input value="${esc(vf.label||'')}" placeholder="Etikett, t.ex. Sommar 2026" onchange="updateVistelseFamilyLabel('${vf.id}',this.value)" style="font-size:12px;color:var(--muted);border:1px dashed var(--border);border-radius:6px;padding:2px 6px;width:180px"/>
        </div>
      </div>
      <div class="btn-row" style="flex-direction:column;align-items:flex-end">
        <button class="btn btn-g btn-sm" onclick="addPersonModal('${vf.id}')">+ Person</button>
        <button class="btn btn-g btn-sm" onclick="bulkSetDatesModal('${vf.id}')">🙋 Sätt dagar för alla</button>
        <button class="btn btn-d btn-sm" onclick="delVistelseFamily('${vf.id}')">Ta bort familj</button>
      </div>
    </div>
    ${memberRows || '<p class="empty" style="margin-top:6px">Inga personer än.</p>'}
  </div>`
}

function addPersonModal(vfId){
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Lägg till person</div>
    <div class="fg"><label>Namn</label><input id="ap-name" placeholder="t.ex. Max" autofocus/></div>
    <div class="fg"><label style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" id="ap-guest" style="width:auto"/> Gäst</label></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveNewPerson('${vfId}')">Lägg till</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function saveNewPerson(vfId){
  const name = document.getElementById('ap-name').value.trim()
  if(!name){ alert('Ange ett namn.'); return }
  const is_guest = document.getElementById('ap-guest').checked
  const { error } = await sb.from('vistelse_members').insert({ vistelse_family_id: vfId, klan_id: currentKlanId, name, is_guest, day_states:[] })
  if(error){ alert('Kunde inte lägga till personen: '+error.message); return }
  closeModal(); await init()
}

async function delMember(memberId){
  if(!confirm('Ta bort personen från vistelsen?')) return
  const { error } = await sb.from('vistelse_members').delete().eq('id',memberId)
  if(error){ alert('Kunde inte ta bort: '+error.message); return }
  await init()
}

// "🙋 Sätt dagar för alla" – ersätter (inte adderar) valda medlemmars dagar med ett datumintervall
function bulkSetDatesModal(vfId){
  const members = membersFor(vfId)
  const rows = members.map(m=>`<label style="display:flex;align-items:center;gap:7px;cursor:pointer;padding:3px 0">
    <input type="checkbox" class="bulk-member" value="${m.id}" checked style="width:auto"/> ${esc(m.name)}
  </label>`).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Sätt dagar för alla – ${esc(vfById(vfId)?.name||'')}</div>
    <div class="hint">Detta ersätter de valda personernas nuvarande dagar med intervallet nedan. Justera enskilda personer efteråt via deras egen "📅 Dagar"-knapp.</div>
    <div class="fr">
      <div class="fg" style="flex:1"><label>Från</label><input type="date" id="bulk-start" value="${today()}"/></div>
      <div class="fg" style="flex:1"><label>Till</label><input type="date" id="bulk-end" value="${today()}"/></div>
    </div>
    <div class="fg"><label>Gäller personer</label>${rows || '<div class="card-sub">Inga personer att sätta dagar för – lägg till en person först.</div>'}</div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveBulkDates('${vfId}')">Sätt dagar</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function saveBulkDates(vfId){
  const start = document.getElementById('bulk-start').value
  const end = document.getElementById('bulk-end').value
  if(!start || !end){ alert('Ange både från- och tilldatum.'); return }
  if(end < start){ alert('Slutdatum kan inte vara före startdatum.'); return }
  const ids = Array.from(document.querySelectorAll('.bulk-member:checked')).map(el=>el.value)
  if(!ids.length){ alert('Välj minst en person.'); return }
  const dates = datesBetween(start,end)
  for(const id of ids){
    const { error } = await sb.from('vistelse_members').update({day_states:dates}).eq('id',id)
    if(error){ alert('Kunde inte spara dagar för en av personerna: '+error.message); return }
  }
  const vf = vfById(vfId)
  if(vf) await maybeSetDefaultLabel(vf, start)
  closeModal(); await init()
}

// ── DAGAR PER PERSON (lägg till/ta bort enstaka dagar eller intervall) ───────
function openMemberDayEditor(memberId){
  const m = memberById(memberId)
  if(!m) return
  const dates = (m.day_states||[]).slice().sort()
  const chips = dates.map(d=>`<span class="tag" style="display:inline-flex;align-items:center;gap:5px;margin:2px">
      ${esc(fmtDateY(d))}
      <button onclick="removeMemberDate('${memberId}','${d}')" style="border:none;background:none;cursor:pointer;color:var(--muted);font-weight:700;padding:0">✕</button>
    </span>`).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Dagar – ${esc(m.name)}</div>
    <div class="fg"><label>Nuvarande dagar (${dates.length})</label>
      <div style="display:flex;flex-wrap:wrap;gap:2px">${chips || '<span class="card-sub">Inga dagar satta</span>'}</div>
    </div>
    <div class="fg"><label>Lägg till intervall</label>
      <div class="fr">
        <input type="date" id="md-range-start" value="${today()}" style="flex:1"/>
        <input type="date" id="md-range-end" value="${today()}" style="flex:1"/>
        <button class="btn btn-g btn-sm" onclick="addMemberDateRange('${memberId}')">Lägg till</button>
      </div>
    </div>
    <div class="fg"><label>Lägg till enstaka dag</label>
      <div class="fr">
        <input type="date" id="md-single" value="${today()}" style="flex:1"/>
        <button class="btn btn-g btn-sm" onclick="addMemberSingleDate('${memberId}')">Lägg till</button>
      </div>
    </div>
    <div class="btn-row" style="margin-top:6px">
      <button class="btn btn-d btn-sm" onclick="clearMemberDates('${memberId}')">Rensa alla dagar</button>
      <button class="btn btn-g" onclick="closeModal()">Stäng</button>
    </div>
  </div></div>`)
}

async function saveMemberDates(memberId, newDates){
  const { error } = await sb.from('vistelse_members').update({day_states:newDates}).eq('id',memberId)
  if(error){ alert('Kunde inte spara: '+error.message); return false }
  const m = memberById(memberId); if(m) m.day_states = newDates
  return true
}

async function addMemberDateRange(memberId){
  const start = document.getElementById('md-range-start').value
  const end = document.getElementById('md-range-end').value
  if(!start || !end){ alert('Ange både från- och tilldatum.'); return }
  if(end < start){ alert('Slutdatum kan inte vara före startdatum.'); return }
  const m = memberById(memberId)
  const merged = unionDates(m.day_states, datesBetween(start,end))
  if(await saveMemberDates(memberId, merged)){
    const vf = vfById(m.vistelse_family_id)
    if(vf) await maybeSetDefaultLabel(vf, start)
    openMemberDayEditor(memberId)
  }
}

async function addMemberSingleDate(memberId){
  const d = document.getElementById('md-single').value
  if(!d){ alert('Ange ett datum.'); return }
  const m = memberById(memberId)
  const merged = unionDates(m.day_states, [d])
  if(await saveMemberDates(memberId, merged)){
    const vf = vfById(m.vistelse_family_id)
    if(vf) await maybeSetDefaultLabel(vf, d)
    openMemberDayEditor(memberId)
  }
}

async function removeMemberDate(memberId, date){
  const m = memberById(memberId)
  const filtered = (m.day_states||[]).filter(d=>d!==date)
  if(await saveMemberDates(memberId, filtered)) openMemberDayEditor(memberId)
}

async function clearMemberDates(memberId){
  if(!confirm('Rensa alla dagar för den här personen?')) return
  if(await saveMemberDates(memberId, [])) openMemberDayEditor(memberId)
}

// ── DIAGRAM: DAGLIG BELÄGGNING (headcount per dag på stället) ────────────────
function computeDailyOccupancy(vfs){
  let allDates = []
  vfs.forEach(vf => { allDates = allDates.concat(familyDates(vf.id)) })
  if(!allDates.length) return []
  const minDate = allDates.reduce((m,d)=>d<m?d:m, allDates[0])
  const maxDate = allDates.reduce((m,d)=>d>m?d:m, allDates[0])
  const days = []
  let cur = minDate, guard = 0
  while(cur <= maxDate && guard < 3660){
    guard++
    let count = 0, familyCount = 0
    vfs.forEach(vf=>{
      const present = membersFor(vf.id).some(m=>(m.day_states||[]).includes(cur))
      if(present){
        familyCount++
        count += membersFor(vf.id).filter(m=>(m.day_states||[]).includes(cur)).length
      }
    })
    days.push({date:cur, count, familyCount})
    cur = isoAdd(cur,1)
  }
  return days
}

function renderOccupancyChart(days){
  if(!days.length) return '<p class="empty">Inga dagar inplanerade ännu.</p>'
  const maxCount = Math.max(...days.map(d=>d.count), 1)
  const w = 700, h = 110, padBottom = 18
  const barW = w / days.length
  const weekMarks = days.map((d,i)=>{
    if(dayOfWeekUTC(d.date)!==1) return ''
    const x = i*barW
    const wn = isoWeekNumber(d.date)
    return `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${h-padBottom}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,2"/>
      <text x="${(x+2).toFixed(1)}" y="${h-4}" font-size="9" fill="var(--muted)">v.${wn}</text>`
  }).join('')
  const bars = days.map((d,i)=>{
    const barH = maxCount>0 ? (d.count/maxCount)*(h-padBottom-10) : 0
    const x = i*barW, y = h-padBottom-barH
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(barW-1,1).toFixed(1)}" height="${barH.toFixed(1)}" fill="${d.familyCount>1?'var(--accent)':'var(--accent-light)'}" stroke="${d.familyCount>1?'var(--accent)':'none'}"/>`
  }).join('')
  return `<div class="card" style="padding:12px 14px 8px;margin-bottom:12px;overflow-x:auto">
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px">📊 Antal personer per dag (mörkare = flera familjer samtidigt)</div>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;min-width:480px;height:${h}px;display:block">${weekMarks}${bars}</svg>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:2px">
      <span>${esc(fmtDate(days[0].date))}</span><span>${esc(fmtDate(days[days.length-1].date))}</span>
    </div>
  </div>`
}

// ── DIAGRAM: TIDSLINJE PER FAMILJ (flera segment per familj, hanterar luckor) ─
function renderTimelineChart(vfs){
  const rowsData = vfs.map(vf => ({ vf, segments: toSegments(familyDates(vf.id)) })).filter(r=>r.segments.length)
  if(!rowsData.length) return '<p class="empty">Inga dagar inplanerade ännu.</p>'
  let allDates = []
  rowsData.forEach(r => r.segments.forEach(s => { allDates.push(s.start); allDates.push(s.end) }))
  const minDate = allDates.reduce((m,d)=>d<m?d:m, allDates[0])
  const maxDate = allDates.reduce((m,d)=>d>m?d:m, allDates[0])
  const totalDays = Math.max(1, Math.round((toUTCms(maxDate)-toUTCms(minDate))/86400000)+1)
  const labelW = 130, w = 700, rowH = 26, padTop = 8
  const chartW = w - labelW
  const pxPerDay = chartW/totalDays
  const h = padTop + rowsData.length*rowH + 20

  let weekMarks = ''
  let cur = minDate, idx = 0, guard = 0
  while(cur <= maxDate && guard < 3660){
    guard++
    if(dayOfWeekUTC(cur)===1){
      const x = labelW + idx*pxPerDay
      const wn = isoWeekNumber(cur)
      weekMarks += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${h-16}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,2"/>
        <text x="${(x+2).toFixed(1)}" y="${h-4}" font-size="9" fill="var(--muted)">v.${wn}</text>`
    }
    cur = isoAdd(cur,1); idx++
  }

  const rows = rowsData.map((r,ri)=>{
    const y = padTop + ri*rowH
    const label = `<text x="0" y="${(y+rowH/2+4).toFixed(1)}" font-size="11" fill="var(--text)">${esc(r.vf.name.length>16?r.vf.name.slice(0,15)+'…':r.vf.name)}</text>`
    const bars = r.segments.map(s=>{
      const x1 = labelW + Math.round((toUTCms(s.start)-toUTCms(minDate))/86400000)*pxPerDay
      const segDays = Math.round((toUTCms(s.end)-toUTCms(s.start))/86400000)+1
      const bw = Math.max(segDays*pxPerDay-1,2)
      return `<rect x="${x1.toFixed(1)}" y="${(y+4).toFixed(1)}" width="${bw.toFixed(1)}" height="${(rowH-10).toFixed(1)}" rx="4" fill="var(--accent-light)" stroke="var(--accent)"/>`
    }).join('')
    return label+bars
  }).join('')

  return `<div class="card" style="padding:12px 14px 8px;margin-bottom:12px;overflow-x:auto">
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px">📅 Tidslinje per familj</div>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;min-width:480px;height:${h}px;display:block">${weekMarks}${rows}</svg>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:2px;padding-left:${labelW}px">
      <span>${esc(fmtDate(minDate))}</span><span>${esc(fmtDate(maxDate))}</span>
    </div>
  </div>`
}

// ── VECKOVY – redigerbar per person ───────────────────────────────────────────
function shiftWeek(dir){ weekAnchorDate = isoAdd(weekAnchorDate, dir*7); renderActive() }

function renderWeekGantt(vfs){
  if(weekAnchorDate===null){
    let allDates = []
    vfs.forEach(vf => { allDates = allDates.concat(familyDates(vf.id)) })
    weekAnchorDate = allDates.length ? allDates.sort()[0] : today()
  }
  const weekDates = getWeekDates(weekAnchorDate)
  const weekStart = weekDates[0], weekEnd = weekDates[6]
  const wn = isoWeekNumber(weekStart)

  const activeFamilies = vfs
    .map(vf => ({ vf, members: membersFor(vf.id) }))
    .filter(r => r.members.some(m => (m.day_states||[]).some(d => d>=weekStart && d<=weekEnd)))
    .sort((a,b)=>a.vf.name.localeCompare(b.vf.name,'sv'))

  const nav = `<div class="btn-row" style="justify-content:center;align-items:center;gap:14px;margin-bottom:8px">
    <button class="btn btn-g btn-sm" onclick="shiftWeek(-1)">‹ Föregående</button>
    <span style="font-weight:600;font-size:14px">v.${wn} · ${esc(fmtDate(weekStart))} – ${esc(fmtDate(weekEnd))}</span>
    <button class="btn btn-g btn-sm" onclick="shiftWeek(1)">Nästa ›</button>
  </div>`

  if(!activeFamilies.length){
    return `${nav}<p class="empty">Ingen är inplanerad den här veckan. Klicka på en cell nedan för att lägga till någon, eller byt vecka.</p>
      ${renderEmptyWeekTable(vfs, weekDates)}`
  }

  const dayHeaders = weekDates.map(d=>`<th style="padding:6px 4px;border-bottom:2px solid var(--border);text-align:center;white-space:nowrap;font-size:11px;color:var(--muted)">${esc(dayLabelUTC(d))}</th>`).join('')

  const bodyRows = activeFamilies.map(({vf,members})=>{
    const memberRows = members.map(m=>{
      const cells = weekDates.map(d=>{
        const present = (m.day_states||[]).includes(d)
        return `<td style="padding:4px;text-align:center;cursor:pointer" onclick="toggleWeekDay('${m.id}','${d}')">
          <span style="display:inline-block;min-width:20px;padding:2px 5px;border-radius:6px;${present?'background:var(--accent-light);color:var(--accent);font-weight:600':'color:var(--border)'}">${present?'✓':'–'}</span>
        </td>`
      }).join('')
      return `<tr><td style="padding:4px 8px 4px 20px;white-space:nowrap;font-size:12px;color:var(--muted)">${esc(m.name)}${m.is_guest?' 👤':''}</td>${cells}</tr>`
    }).join('')
    const totalCells = weekDates.map(d=>{
      const total = members.filter(m=>(m.day_states||[]).includes(d)).length
      return `<td style="padding:4px;text-align:center;font-weight:600">${total||'–'}</td>`
    }).join('')
    return `<tr style="border-top:1px solid var(--border)"><td colspan="8" style="padding:6px 8px;font-weight:600;font-size:13px">${esc(vf.name)}</td></tr>
      ${memberRows}
      <tr style="font-size:12px;color:var(--muted)"><td style="padding:4px 8px 4px 20px">Totalt</td>${totalCells}</tr>`
  }).join('')

  return `${nav}
    <div class="card" style="padding:12px;overflow-x:auto;margin-bottom:12px">
      <table style="width:100%;border-collapse:collapse;min-width:480px">
        <thead><tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid var(--border);white-space:nowrap;font-size:11px;color:var(--muted)">Familj / person</th>${dayHeaders}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div class="hint">Klicka på en cell för att lägga till eller ta bort den dagen för personen.</div>`
}

// Om ingen är inplanerad den valda veckan visas ändå alla familjer/personer som klickbara rader,
// så man kan lägga till närvaro direkt utan att först behöva byta till en vecka som redan har data.
function renderEmptyWeekTable(vfs, weekDates){
  if(!vfs.length) return ''
  const dayHeaders = weekDates.map(d=>`<th style="padding:6px 4px;border-bottom:2px solid var(--border);text-align:center;white-space:nowrap;font-size:11px;color:var(--muted)">${esc(dayLabelUTC(d))}</th>`).join('')
  const bodyRows = vfs.map(vf=>{
    const members = membersFor(vf.id)
    if(!members.length) return ''
    const memberRows = members.map(m=>{
      const cells = weekDates.map(d=>{
        const present = (m.day_states||[]).includes(d)
        return `<td style="padding:4px;text-align:center;cursor:pointer" onclick="toggleWeekDay('${m.id}','${d}')">
          <span style="display:inline-block;min-width:20px;padding:2px 5px;border-radius:6px;${present?'background:var(--accent-light);color:var(--accent);font-weight:600':'color:var(--border)'}">${present?'✓':'–'}</span>
        </td>`
      }).join('')
      return `<tr><td style="padding:4px 8px 4px 20px;white-space:nowrap;font-size:12px;color:var(--muted)">${esc(m.name)}${m.is_guest?' 👤':''}</td>${cells}</tr>`
    }).join('')
    return `<tr style="border-top:1px solid var(--border)"><td colspan="8" style="padding:6px 8px;font-weight:600;font-size:13px">${esc(vf.name)}</td></tr>${memberRows}`
  }).join('')
  return `<div class="card" style="padding:12px;overflow-x:auto;margin-bottom:12px">
      <table style="width:100%;border-collapse:collapse;min-width:480px">
        <thead><tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid var(--border);white-space:nowrap;font-size:11px;color:var(--muted)">Familj / person</th>${dayHeaders}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`
}

async function toggleWeekDay(memberId, date){
  const m = memberById(memberId)
  if(!m) return
  const has = (m.day_states||[]).includes(date)
  const newDates = has ? m.day_states.filter(d=>d!==date) : unionDates(m.day_states,[date])
  const ok = await saveMemberDates(memberId, newDates)
  if(ok && !has){
    const vf = vfById(m.vistelse_family_id)
    if(vf) await maybeSetDefaultLabel(vf, date)
  }
  renderActive()
}

// ── START ─────────────────────────────────────────────────────────────────────
boot()
