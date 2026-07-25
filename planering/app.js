const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

let state = { templates:[], templateMembers:[], platser:[], vistelsePeriods:[], vistelseFamilies:[], vistelseMembers:[] }
let activeTab = 'platser'
let calendarPlatsId = null
let calendarPeriodId = null
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
    const [tp,tm,pl,vp,vf,vm] = await Promise.all([
      sb.from('family_templates').select('*').eq('klan_id',currentKlanId).order('name'),
      sb.from('template_members').select('*').eq('klan_id',currentKlanId).order('sort_order'),
      sb.from('platser').select('*').eq('klan_id',currentKlanId).order('recurring',{ascending:false}).order('name'),
      sb.from('vistelse_periods').select('*').eq('klan_id',currentKlanId).order('starts_at',{ascending:false}),
      sb.from('vistelse_families').select('*').eq('klan_id',currentKlanId).order('created_at'),
      sb.from('vistelse_members').select('*').eq('klan_id',currentKlanId).order('created_at'),
    ])
    state.templates = tp.data||[]
    state.templateMembers = tm.data||[]
    state.platser = pl.data||[]
    state.vistelsePeriods = vp.data||[]
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
function monthShort(dateStr){ const months=['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec']; const d=new Date(toUTCms(dateStr)); return months[d.getUTCMonth()] }
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

function periodById(id){ return state.vistelsePeriods.find(p=>p.id===id) }

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
function setCalendarPlats(id){ calendarPlatsId = id; calendarPeriodId = null; weekAnchorDate = null; renderActive() }
function setCalendarChartMode(mode){ calendarChartMode = mode; renderActive() }
function setCalendarPeriod(id){ calendarPeriodId = id; weekAnchorDate = null; renderActive() }

// Lös koppling, ingen databas: redigera listan här om ni vill ändra vilka
// standardperioder som föreslås som namn när man skapar en ny period.
const STANDARD_PERIOD_NAMES = ['Påsk','Sommar','Jul','Nyår']

function suggestedPeriodNames(){
  const y = new Date().getFullYear()
  const names = []
  STANDARD_PERIOD_NAMES.forEach(n=>{ names.push(`${n} ${y}`); names.push(`${n} ${y+1}`) })
  return names
}

function periodsForPlats(platsId){
  return state.vistelsePeriods.filter(p=>p.plats_id===platsId).sort((a,b)=>b.starts_at.localeCompare(a.starts_at))
}

function renderKalender(){
  if(!state.platser.length){
    return `<p class="empty">Skapa ett ställe (t.ex. Båstad) under fliken Ställen för att kunna planera vistelser där.</p>`
  }
  if(!calendarPlatsId || !state.platser.find(p=>p.id===calendarPlatsId)){
    calendarPlatsId = state.platser[0].id
  }
  const platsOpts = state.platser.map(pl=>`<option value="${pl.id}" ${pl.id===calendarPlatsId?'selected':''}>${pl.recurring?'🔁 ':''}${esc(pl.name)}</option>`).join('')

  const periods = periodsForPlats(calendarPlatsId)
  if(!calendarPeriodId || !periods.find(p=>p.id===calendarPeriodId)){
    calendarPeriodId = periods.length ? periods[0].id : null
  }
  const platsHeader = `<div class="sh"><span class="sh-title">Kalender</span></div>
    <div class="fg" style="max-width:260px"><select onchange="setCalendarPlats(this.value)">${platsOpts}</select></div>
    <div class="hint">Vistelseplanering är helt separat från avräkning och mandagar i Hushållskostnader.</div>`

  if(!periods.length){
    return `${platsHeader}
      <p class="empty">Inga perioder ännu för ${esc(platsName(calendarPlatsId))}. Skapa en period (t.ex. "Sommar 2026") för att börja planera vilka dagar var och en är där.</p>
      <button class="btn btn-p" onclick="newPeriodModal('${calendarPlatsId}')">+ Ny period</button>`
  }

  const period = periodById(calendarPeriodId)
  const periodOpts = periods.map(p=>`<option value="${p.id}" ${p.id===calendarPeriodId?'selected':''}>${esc(p.name)} (${fmtDate(p.starts_at)}–${fmtDate(p.ends_at)})</option>`).join('')
  const vfs = state.vistelseFamilies.filter(vf=>vf.period_id===calendarPeriodId)

  const periodBar = `<div class="fr" style="align-items:flex-end;margin-bottom:8px;flex-wrap:wrap">
    <div class="fg" style="max-width:280px;flex:1"><label>Period</label><select onchange="setCalendarPeriod(this.value)">${periodOpts}</select></div>
    <div class="btn-row">
      <button class="btn btn-g btn-sm" onclick="newPeriodModal('${calendarPlatsId}')">+ Ny period</button>
      <button class="btn btn-g btn-sm" onclick="editPeriodModal('${period.id}')">✏️ Redigera</button>
      <button class="btn btn-d btn-sm" onclick="delPeriod('${period.id}')">Ta bort period</button>
    </div>
  </div>`

  const chartToggle = `<div class="btn-row" style="margin-bottom:8px">
    <button class="btn ${calendarChartMode==='bar'?'btn-p':'btn-g'} btn-sm" onclick="setCalendarChartMode('bar')">📊 Diagram</button>
    <button class="btn ${calendarChartMode==='timeline'?'btn-p':'btn-g'} btn-sm" onclick="setCalendarChartMode('timeline')">📅 Tidslinje</button>
    <button class="btn ${calendarChartMode==='people'?'btn-p':'btn-g'} btn-sm" onclick="setCalendarChartMode('people')">👤 Personer</button>
    <button class="btn ${calendarChartMode==='week'?'btn-p':'btn-g'} btn-sm" onclick="setCalendarChartMode('week')">🔎 Vecka</button>
  </div>`
  const chartHtml = calendarChartMode==='timeline'
    ? renderTimelineChart(vfs, period)
    : calendarChartMode==='people'
    ? renderPersonTimelineChart(vfs, period)
    : calendarChartMode==='week'
    ? renderWeekGantt(vfs, period)
    : renderOccupancyChart(computeDailyOccupancy(vfs, period), vfs)

  const familyCards = vfs.map(vf => renderFamilyCard(vf, period)).join('')

  return `${platsHeader}
    ${periodBar}
    <div class="btn-row" style="margin-bottom:10px">
      <button class="btn btn-g btn-sm" onclick="copyInFamilyModal('${calendarPlatsId}','${period.id}')">+ Kopiera in familj</button>
      <button class="btn btn-p btn-sm" onclick="newAdhocFamilyModal('${calendarPlatsId}','${period.id}')">+ Adhoc-familj</button>
    </div>
    ${chartToggle}
    ${vfs.length ? chartHtml : ''}
    <div class="sh" style="margin-top:14px"><span class="sh-title" style="font-size:14px">Familjer i ${esc(period.name)}</span></div>
    ${vfs.length ? familyCards : '<p class="empty">Inga familjer inkopierade i den här perioden ännu.</p>'}`
}

// ── PERIODER ──────────────────────────────────────────────────────────────────
function newPeriodModal(platsId){
  const chips = suggestedPeriodNames()
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Ny period – ${esc(platsName(platsId))}</div>
    <div class="fg"><label>Namn</label>
      <input id="np-name" placeholder="t.ex. Sommar 2026" autofocus/>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
        ${chips.map(c=>`<button type="button" class="btn btn-g btn-sm" onclick="document.getElementById('np-name').value='${esc(c).replace(/'/g,"\\'")}'">${esc(c)}</button>`).join('')}
      </div>
    </div>
    <div class="fr">
      <div class="fg" style="flex:1"><label>Från</label><input type="date" id="np-start" value="${today()}"/></div>
      <div class="fg" style="flex:1"><label>Till</label><input type="date" id="np-end" value="${today()}"/></div>
    </div>
    <div class="hint">Perioden sätter ramen för vilka datum ni kan välja när ni sätter dagar för familjer i den.</div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="savePeriod('${platsId}')">Skapa</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function savePeriod(platsId){
  const name = document.getElementById('np-name').value.trim()
  const start = document.getElementById('np-start').value
  const end = document.getElementById('np-end').value
  if(!name){ alert('Ange ett namn.'); return }
  if(!start || !end){ alert('Ange både från- och tilldatum.'); return }
  if(end < start){ alert('Slutdatum kan inte vara före startdatum.'); return }
  const res = await sb.from('vistelse_periods').insert({ klan_id: currentKlanId, plats_id: platsId, name, starts_at: start, ends_at: end }).select().single()
  if(res.error){ alert('Kunde inte skapa perioden: '+res.error.message); return }
  closeModal()
  calendarPeriodId = res.data.id
  await init()
}

function editPeriodModal(periodId){
  const p = periodById(periodId)
  if(!p) return
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Redigera period</div>
    <div class="fg"><label>Namn</label><input id="ep-name" value="${esc(p.name)}" autofocus/></div>
    <div class="fr">
      <div class="fg" style="flex:1"><label>Från</label><input type="date" id="ep-start" value="${p.starts_at}"/></div>
      <div class="fg" style="flex:1"><label>Till</label><input type="date" id="ep-end" value="${p.ends_at}"/></div>
    </div>
    <div class="hint">Krymper du intervallet tas inga redan satta dagar bort automatiskt – de blir bara liggande utanför periodens ram tills någon redigerar dem.</div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveEditPeriod('${periodId}')">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function saveEditPeriod(periodId){
  const name = document.getElementById('ep-name').value.trim()
  const start = document.getElementById('ep-start').value
  const end = document.getElementById('ep-end').value
  if(!name){ alert('Ange ett namn.'); return }
  if(!start || !end){ alert('Ange både från- och tilldatum.'); return }
  if(end < start){ alert('Slutdatum kan inte vara före startdatum.'); return }
  const { error } = await sb.from('vistelse_periods').update({name, starts_at:start, ends_at:end}).eq('id',periodId)
  if(error){ alert('Kunde inte spara: '+error.message); return }
  closeModal(); await init()
}

async function delPeriod(periodId){
  if(!confirm('Ta bort perioden? Alla familjer och personers dagar som hör till den här perioden tas bort samtidigt. Går inte att ångra.')) return
  const { error } = await sb.from('vistelse_periods').delete().eq('id',periodId)
  if(error){ alert('Kunde inte ta bort perioden: '+error.message); return }
  calendarPeriodId = null
  await init()
}

// ── KOPIERA IN / ADHOC ────────────────────────────────────────────────────────
function copyInFamilyModal(platsId, periodId){
  const alreadyIn = new Set(state.vistelseFamilies.filter(vf=>vf.period_id===periodId).map(vf=>vf.template_id))
  const opts = state.templates.map(t=>{
    const already = alreadyIn.has(t.id)
    return `<div class="slim-row" style="cursor:pointer" onclick="copyInTemplate('${platsId}','${periodId}','${t.id}')">
      <div style="flex:1"><div class="slim-desc">${esc(t.name)}${already?' <span class="tag">✓ Redan inkopierad</span>':''}</div><div class="slim-sub">${templateMembersFor(t.id).length} person(er) i mallen</div></div>
      <div class="slim-actions"><button class="btn btn-p btn-sm">Kopiera in${already?' igen':''}</button></div>
    </div>`
  }).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Kopiera in familj – ${esc(periodById(periodId)?.name||'')}</div>
    ${state.templates.length ? opts : '<p class="empty">Inga familjemallar finns ännu – skapa en i Hushållskostnader, eller lägg till en adhoc-familj här istället.</p>'}
    <div class="btn-row" style="margin-top:10px">
      <button class="btn btn-g" onclick="closeModal()">Stäng</button>
    </div>
  </div></div>`)
}

async function copyInTemplate(platsId, periodId, templateId){
  const tpl = state.templates.find(t=>t.id===templateId)
  if(!tpl) return
  const already = state.vistelseFamilies.some(vf=>vf.period_id===periodId && vf.template_id===templateId)
  if(already && !confirm(`"${tpl.name}" är redan inkopierad i den här perioden. Kopiera in en gång till ändå?`)) return
  const res = await sb.from('vistelse_families').insert({
    klan_id: currentKlanId, plats_id: platsId, period_id: periodId, template_id: templateId, name: tpl.name, is_adhoc:false
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

function newAdhocFamilyModal(platsId, periodId){
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Ny adhoc-familj – ${esc(periodById(periodId)?.name||'')}</div>
    <div class="fg"><label>Namn</label><input id="af-name" placeholder="t.ex. Vänner från Göteborg" autofocus/></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveAdhocFamily('${platsId}','${periodId}')">Skapa</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function saveAdhocFamily(platsId, periodId){
  const name = document.getElementById('af-name').value.trim()
  if(!name){ alert('Ange ett namn.'); return }
  const { error } = await sb.from('vistelse_families').insert({ klan_id: currentKlanId, plats_id: platsId, period_id: periodId, template_id:null, name, is_adhoc:true })
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

// ── FAMILJEKORT ───────────────────────────────────────────────────────────────
function renderFamilyCard(vf, period){
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
  const vf = vfById(vfId)
  const period = periodById(vf.period_id)
  const members = membersFor(vfId)
  const rows = members.map(m=>`<label style="display:flex;align-items:center;gap:7px;cursor:pointer;padding:3px 0">
    <input type="checkbox" class="bulk-member" value="${m.id}" checked style="width:auto"/> ${esc(m.name)}
  </label>`).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Sätt dagar för alla – ${esc(vfById(vfId)?.name||'')}</div>
    <div class="hint">Detta ersätter de valda personernas nuvarande dagar med intervallet nedan (måste ligga inom perioden ${esc(period.name)}: ${fmtDateY(period.starts_at)}–${fmtDateY(period.ends_at)}). Justera enskilda personer efteråt via deras egen "📅 Dagar"-knapp.</div>
    <div class="fr">
      <div class="fg" style="flex:1"><label>Från</label><input type="date" id="bulk-start" min="${period.starts_at}" max="${period.ends_at}" value="${period.starts_at}"/></div>
      <div class="fg" style="flex:1"><label>Till</label><input type="date" id="bulk-end" min="${period.starts_at}" max="${period.ends_at}" value="${period.ends_at}"/></div>
    </div>
    <div class="fg"><label>Gäller personer</label>${rows || '<div class="card-sub">Inga personer att sätta dagar för – lägg till en person först.</div>'}</div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveBulkDates('${vfId}')">Sätt dagar</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function saveBulkDates(vfId){
  const vf = vfById(vfId)
  const period = periodById(vf.period_id)
  const start = document.getElementById('bulk-start').value
  const end = document.getElementById('bulk-end').value
  if(!start || !end){ alert('Ange både från- och tilldatum.'); return }
  if(end < start){ alert('Slutdatum kan inte vara före startdatum.'); return }
  if(start < period.starts_at || end > period.ends_at){ alert(`Datumen måste ligga inom perioden ${period.name} (${fmtDateY(period.starts_at)}–${fmtDateY(period.ends_at)}).`); return }
  const ids = Array.from(document.querySelectorAll('.bulk-member:checked')).map(el=>el.value)
  if(!ids.length){ alert('Välj minst en person.'); return }
  const dates = datesBetween(start,end)
  for(const id of ids){
    const { error } = await sb.from('vistelse_members').update({day_states:dates}).eq('id',id)
    if(error){ alert('Kunde inte spara dagar för en av personerna: '+error.message); return }
  }
  closeModal(); await init()
}

// ── DAGAR PER PERSON (klickbar kalendervy, en mini-månad per månad i perioden) ─
function monthsSpanned(startDate, endDate){
  const months = []
  let y = parseInt(startDate.slice(0,4)), m = parseInt(startDate.slice(5,7))-1
  const endY = parseInt(endDate.slice(0,4)), endM = parseInt(endDate.slice(5,7))-1
  let guard = 0
  while((y<endY || (y===endY && m<=endM)) && guard<60){
    months.push([y,m]); guard++
    m++; if(m>11){ m=0; y++ }
  }
  return months
}

const MONTH_NAMES_FULL = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December']

function renderMonthGrid(year, month, periodStart, periodEnd, selectedSet, memberId){
  const firstOfMonth = new Date(Date.UTC(year,month,1))
  const daysInMonth = new Date(Date.UTC(year,month+1,0)).getUTCDate()
  const firstWeekday = (firstOfMonth.getUTCDay()+6)%7 // 0=måndag
  const cells = []
  for(let i=0;i<firstWeekday;i++) cells.push(null)
  for(let d=1; d<=daysInMonth; d++) cells.push(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
  while(cells.length%7!==0) cells.push(null)

  const dayHeaders = ['Må','Ti','On','To','Fr','Lö','Sö']
  const cellsHtml = cells.map(dateStr=>{
    if(!dateStr) return `<div></div>`
    const dayNum = parseInt(dateStr.slice(8,10))
    const inRange = dateStr>=periodStart && dateStr<=periodEnd
    if(!inRange) return `<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--border)">${dayNum}</div>`
    const selected = selectedSet.has(dateStr)
    return `<div onclick="toggleMemberDate('${memberId}','${dateStr}')" style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:12px;border-radius:6px;cursor:pointer;user-select:none;${selected?'background:var(--accent);color:#fff;font-weight:700':'background:rgba(0,0,0,.045);color:var(--text)'}">${dayNum}</div>`
  }).join('')

  return `<div style="margin-bottom:12px">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">${MONTH_NAMES_FULL[month]} ${year}</div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;font-size:10px;color:var(--muted);margin-bottom:3px">${dayHeaders.map(h=>`<div style="text-align:center">${h}</div>`).join('')}</div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">${cellsHtml}</div>
  </div>`
}

function openMemberDayEditor(memberId){
  const m = memberById(memberId)
  if(!m) return
  const vf = vfById(m.vistelse_family_id)
  const period = periodById(vf.period_id)
  const selectedSet = new Set(m.day_states||[])
  const monthsHtml = monthsSpanned(period.starts_at, period.ends_at)
    .map(([y,mo])=>renderMonthGrid(y,mo,period.starts_at,period.ends_at,selectedSet,memberId)).join('')

  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Dagar – ${esc(m.name)}</div>
    <div class="hint">${esc(period.name)}, ${fmtDateY(period.starts_at)}–${fmtDateY(period.ends_at)}. Klicka på en dag för att slå på/av. ${selectedSet.size} dag${selectedSet.size===1?'':'ar'} valda.</div>
    <div style="max-height:56vh;overflow-y:auto;padding-right:2px">${monthsHtml}</div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn btn-g btn-sm" onclick="markAllMemberDates('${memberId}')">Markera hela perioden</button>
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

async function toggleMemberDate(memberId, date){
  const m = memberById(memberId)
  const has = (m.day_states||[]).includes(date)
  const newDates = has ? m.day_states.filter(d=>d!==date) : unionDates(m.day_states,[date])
  if(await saveMemberDates(memberId, newDates)) openMemberDayEditor(memberId)
}

async function markAllMemberDates(memberId){
  const m = memberById(memberId)
  const period = periodById(vfById(m.vistelse_family_id).period_id)
  if(await saveMemberDates(memberId, datesBetween(period.starts_at, period.ends_at))) openMemberDayEditor(memberId)
}

async function clearMemberDates(memberId){
  if(!confirm('Rensa alla dagar för den här personen?')) return
  if(await saveMemberDates(memberId, [])) openMemberDayEditor(memberId)
}

// ── DIAGRAM: DAGLIG BELÄGGNING (headcount per dag på stället, staplat per familj) ─
const FAMILY_COLORS = ['#7c5cbf','#e07a5f','#3d9970','#2a9d8f','#e9c46a','#4361ee','#f4a261','#9b5de5','#00b4d8','#ef476f','#588157','#c9184a']
function familyColorFor(vfs, vfId){
  const idx = vfs.findIndex(v=>v.id===vfId)
  return FAMILY_COLORS[idx>=0 ? idx%FAMILY_COLORS.length : 0]
}

function computeDailyOccupancy(vfs, period){
  const days = []
  let cur = period.starts_at, guard = 0
  while(cur <= period.ends_at && guard < 3660){
    guard++
    const byFamily = vfs.map(vf=>{
      const count = membersFor(vf.id).filter(m=>(m.day_states||[]).includes(cur)).length
      return { vfId: vf.id, count }
    }).filter(f=>f.count>0)
    const count = byFamily.reduce((s,f)=>s+f.count,0)
    days.push({date:cur, count, familyCount:byFamily.length, byFamily})
    cur = isoAdd(cur,1)
  }
  return days
}

function renderOccupancyChart(days, vfs){
  if(!days.length) return '<p class="empty">Inga dagar inplanerade ännu.</p>'
  const maxCount = Math.max(...days.map(d=>d.count), 1)
  const w = 700, h = 130, padBottom = 18, padTop = 16
  const usableH = h - padBottom - padTop
  const barW = w / days.length

  const weekMarks = days.map((d,i)=>{
    const isMonthStart = d.date.slice(8,10)==='01'
    const x = i*barW
    if(isMonthStart){
      return `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${h-padBottom}" stroke="var(--muted)" stroke-width="1.5"/>
        <text x="${(x+3).toFixed(1)}" y="12" font-size="10" font-weight="700" fill="var(--text)">${monthShort(d.date)}</text>`
    }
    if(dayOfWeekUTC(d.date)!==1) return ''
    const wn = isoWeekNumber(d.date)
    return `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${h-padBottom}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,2"/>
      <text x="${(x+2).toFixed(1)}" y="${h-4}" font-size="9" fill="var(--muted)">v.${wn}</text>`
  }).join('')

  const bars = days.map((d,i)=>{
    const x = i*barW
    let yOffset = h-padBottom
    const segRects = d.byFamily.map(f=>{
      const segH = maxCount>0 ? (f.count/maxCount)*usableH : 0
      const y = yOffset - segH
      yOffset = y
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(barW-1,1).toFixed(1)}" height="${segH.toFixed(1)}" fill="${familyColorFor(vfs,f.vfId)}"/>`
    }).join('')
    const labelY = yOffset - 3
    const showLabel = d.count>0 && barW>9
    const countLabel = showLabel ? `<text x="${(x+barW/2).toFixed(1)}" y="${labelY.toFixed(1)}" font-size="8" text-anchor="middle" fill="var(--muted)">${d.count}</text>` : ''
    return segRects + countLabel
  }).join('')

  const legend = vfs.map((vf,i)=>{
    if(!days.some(d=>d.byFamily.some(f=>f.vfId===vf.id))) return ''
    return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);margin-right:10px">
      <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${familyColorFor(vfs,vf.id)}"></span>${esc(vf.name)}
    </span>`
  }).join('')

  return `<div class="card" style="padding:12px 14px 8px;margin-bottom:12px;overflow-x:auto">
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px">📊 Antal personer per dag, färgkodat per familj</div>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;min-width:480px;height:${h}px;display:block">${weekMarks}${bars}</svg>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:2px">
      <span>${esc(fmtDate(days[0].date))}</span><span>${esc(fmtDate(days[days.length-1].date))}</span>
    </div>
    <div style="margin-top:8px;display:flex;flex-wrap:wrap">${legend}</div>
  </div>`
}

// ── DIAGRAM: TIDSLINJE PER FAMILJ (flera segment per familj, hanterar luckor) ─
function renderTimelineChart(vfs, period){
  const rowsData = vfs.map(vf => ({ vf, segments: toSegments(familyDates(vf.id)) })).filter(r=>r.segments.length)
  if(!rowsData.length) return '<p class="empty">Inga dagar inplanerade ännu i den här perioden.</p>'
  const minDate = period.starts_at, maxDate = period.ends_at
  const totalDays = Math.max(1, Math.round((toUTCms(maxDate)-toUTCms(minDate))/86400000)+1)
  const labelW = 130, w = 700, rowH = 26, padTop = 20
  const chartW = w - labelW
  const pxPerDay = chartW/totalDays
  const h = padTop + rowsData.length*rowH + 20

  let weekMarks = ''
  let cur = minDate, idx = 0, guard = 0
  while(cur <= maxDate && guard < 3660){
    guard++
    const isMonthStart = cur.slice(8,10)==='01'
    if(dayOfWeekUTC(cur)===1 || isMonthStart){
      const x = labelW + idx*pxPerDay
      if(isMonthStart){
        weekMarks += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${h-16}" stroke="var(--muted)" stroke-width="1.5"/>
          <text x="${(x+3).toFixed(1)}" y="13" font-size="10" font-weight="700" fill="var(--text)">${monthShort(cur)}</text>`
      } else {
        weekMarks += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${h-16}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,2"/>
          <text x="${(x+2).toFixed(1)}" y="${h-4}" font-size="9" fill="var(--muted)">v.${isoWeekNumber(cur)}</text>`
      }
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

// ── DIAGRAM: TIDSLINJE PER PERSON (inzoomad, grupperad per familj) ───────────
function renderPersonTimelineChart(vfs, period){
  // Bygg en radlista: en rubrikrad (ingen stapel) per familj, sedan en rad per person med stapel(ar)
  const rowsData = []
  vfs.forEach(vf=>{
    const memberRows = membersFor(vf.id)
      .map(m => ({ m, segments: toSegments((m.day_states||[]).slice().sort()) }))
      .filter(r => r.segments.length)
    if(!memberRows.length) return
    rowsData.push({ type:'header', vf })
    memberRows.forEach(r => rowsData.push({ type:'member', vf, m:r.m, segments:r.segments }))
  })
  if(!rowsData.some(r=>r.type==='member')) return '<p class="empty">Inga dagar inplanerade ännu i den här perioden.</p>'

  const minDate = period.starts_at, maxDate = period.ends_at
  const totalDays = Math.max(1, Math.round((toUTCms(maxDate)-toUTCms(minDate))/86400000)+1)
  const labelW = 150, w = 700, rowH = 22, padTop = 20
  const chartW = w - labelW
  const pxPerDay = chartW/totalDays
  const h = padTop + rowsData.length*rowH + 20

  let weekMarks = ''
  let cur = minDate, idx = 0, guard = 0
  while(cur <= maxDate && guard < 3660){
    guard++
    const isMonthStart = cur.slice(8,10)==='01'
    if(dayOfWeekUTC(cur)===1 || isMonthStart){
      const x = labelW + idx*pxPerDay
      if(isMonthStart){
        weekMarks += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${h-16}" stroke="var(--muted)" stroke-width="1.5"/>
          <text x="${(x+3).toFixed(1)}" y="13" font-size="10" font-weight="700" fill="var(--text)">${monthShort(cur)}</text>`
      } else {
        weekMarks += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${h-16}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,2"/>
          <text x="${(x+2).toFixed(1)}" y="${h-4}" font-size="9" fill="var(--muted)">v.${isoWeekNumber(cur)}</text>`
      }
    }
    cur = isoAdd(cur,1); idx++
  }

  const rows = rowsData.map((r,ri)=>{
    const y = padTop + ri*rowH
    if(r.type==='header'){
      const fam = r.vf.name.length>22 ? r.vf.name.slice(0,21)+'…' : r.vf.name
      return `<text x="0" y="${(y+rowH/2+4).toFixed(1)}" font-size="11" font-weight="700" fill="var(--text)">${esc(fam)}</text>`
    }
    const name = r.m.name.length>20 ? r.m.name.slice(0,19)+'…' : r.m.name
    const guestMark = r.m.is_guest ? ' 👤' : ''
    const label = `<text x="10" y="${(y+rowH/2+4).toFixed(1)}" font-size="11" fill="var(--text)">${esc(name+guestMark)}</text>`
    const bars = r.segments.map(s=>{
      const x1 = labelW + Math.round((toUTCms(s.start)-toUTCms(minDate))/86400000)*pxPerDay
      const segDays = Math.round((toUTCms(s.end)-toUTCms(s.start))/86400000)+1
      const bw = Math.max(segDays*pxPerDay-1,2)
      const fill = r.m.is_guest ? 'var(--border)' : 'var(--accent-light)'
      return `<rect x="${x1.toFixed(1)}" y="${(y+3).toFixed(1)}" width="${bw.toFixed(1)}" height="${(rowH-8).toFixed(1)}" rx="3" fill="${fill}" stroke="var(--accent)"/>`
    }).join('')
    return label+bars
  }).join('')

  return `<div class="card" style="padding:12px 14px 8px;margin-bottom:12px;overflow-x:auto">
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px">👤 Tidslinje per person (grupperad per familj, 👤 = gäst)</div>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;min-width:480px;height:${h}px;display:block">${weekMarks}${rows}</svg>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:2px;padding-left:${labelW}px">
      <span>${esc(fmtDate(minDate))}</span><span>${esc(fmtDate(maxDate))}</span>
    </div>
  </div>`
}

// ── VECKOVY – redigerbar per person ───────────────────────────────────────────
function shiftWeek(dir){
  weekAnchorDate = isoAdd(weekAnchorDate, dir*7)
  renderActive()
}

function renderWeekGantt(vfs, period){
  if(weekAnchorDate===null){
    let allDates = []
    vfs.forEach(vf => { allDates = allDates.concat(familyDates(vf.id)) })
    weekAnchorDate = allDates.length ? allDates.sort()[0] : period.starts_at
  }
  // håll ankaret inom rimligt avstånd från periodens gränser (± en vecka) så man kan
  // se hela periodens sista/första vecka, men inte navigera hur långt bort som helst
  if(weekAnchorDate < isoAdd(period.starts_at,-6)) weekAnchorDate = period.starts_at
  if(weekAnchorDate > period.ends_at) weekAnchorDate = period.ends_at
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
  if(!has){
    const vf = vfById(m.vistelse_family_id)
    const period = periodById(vf.period_id)
    if(date < period.starts_at || date > period.ends_at){ alert(`Datumet ligger utanför perioden ${period.name}.`); return }
  }
  const newDates = has ? m.day_states.filter(d=>d!==date) : unionDates(m.day_states,[date])
  await saveMemberDates(memberId, newDates)
  renderActive()
}

// ── START ─────────────────────────────────────────────────────────────────────
boot()
