const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

let state = { families:[], platser:[], vistelser:[] }
let activeTab = 'platser'
let calendarPlatsId = null
let calendarChartMode = 'bar'
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
    <h2>Planering</h2>
    <p>Du behöver logga in i en klan via Kvittodelning innan du kan planera vistelser.</p>
    <a class="btn btn-p" style="width:100%;text-align:center;text-decoration:none;display:block" href="../">🧾 Gå till Kvittodelning</a>
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

// ── VÄXLINGSMENY (Kvitton / Planering / Båstadkonto / Projekt) ─────────────────
function renderSwitcher(){
  const items = [
    {key:'kvitton', icon:'🧾', label:'Kvitton', href:'../'},
    {key:'planering', icon:'🗓️', label:'Planering', href:'./'},
    {key:'bastadkonto', icon:'🏠', label:'Båstadkonto', href:'../bastadkonto/'},
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
    const [f,pl,vi] = await Promise.all([
      sb.from('families').select('*').eq('klan_id',currentKlanId).order('name'),
      sb.from('platser').select('*').eq('klan_id',currentKlanId).order('recurring',{ascending:false}).order('name'),
      sb.from('vistelser').select('*').eq('klan_id',currentKlanId).order('starts_at'),
    ])
    state.families = f.data||[]
    state.platser = pl.data||[]
    state.vistelser = vi.data||[]
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
    if(el) el.innerHTML = '<p class="empty">Något gick fel när den här fliken skulle visas. Felmeddelandet syns högst upp.</p>'
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
function dayDiff(a,b){ return Math.round((toUTCms(b)-toUTCms(a))/86400000) }
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
function famName(id){ return (state.families.find(f=>f.id===id)||{}).name||'' }
function famPersonCount(id){ const f=state.families.find(f=>f.id===id); return f ? (f.person_count||1) : 0 }
function platsName(id){ return (state.platser.find(p=>p.id===id)||{}).name||'' }
function closeModal(){ document.getElementById('modal').style.display='none'; document.getElementById('modal').innerHTML='' }
function openModal(html){ document.getElementById('modal').innerHTML=html; document.getElementById('modal').style.display='block' }

// ── PLATSER ───────────────────────────────────────────────────────────────────
function renderPlatser(){
  const cards = state.platser.map(pl=>{
    const vistCount = state.vistelser.filter(v=>v.plats_id===pl.id).length
    return `<div class="card">
      <div class="card-hdr">
        <div>
          <div class="card-title">${esc(pl.name)}${pl.recurring?' <span class="tag">🔁 Återkommande</span>':''}</div>
          <div class="card-sub">${vistCount} vistelse${vistCount===1?'':'r'} inplanerade</div>
        </div>
        <div class="btn-row">
          <button class="btn btn-g btn-sm" onclick="editPlats('${pl.id}')">Redigera</button>
          <button class="btn btn-d btn-sm" onclick="delPlats('${pl.id}')">Ta bort</button>
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
  if(!confirm('Ta bort stället? Perioder i Kvittodelning som var kopplade till det förlorar bara kopplingen, de tas inte bort. OBS: eventuella vistelser (planeringskalendern) för stället tas bort.')) return
  const { error } = await sb.from('platser').delete().eq('id',id)
  if(error){ alert('Kunde inte ta bort stället: '+error.message); return }
  await init()
}

// ── KALENDER / VISTELSER ──────────────────────────────────────────────────────
// Vistelser är planering – helt fristående från avräkning/mandagar i Kvittodelning.
function setCalendarPlats(id){ calendarPlatsId = id; renderActive() }
function setCalendarChartMode(mode){ calendarChartMode = mode; renderActive() }

function computeOverlapSegments(vistelser){
  if(!vistelser.length) return []
  const minDate = vistelser.reduce((m,v)=>v.starts_at<m?v.starts_at:m, vistelser[0].starts_at)
  const maxDate = vistelser.reduce((m,v)=>v.ends_at>m?v.ends_at:m, vistelser[0].ends_at)
  const segments = []
  let cur = minDate
  let segStart = null, curFamilies = null
  let guard = 0
  while(cur <= maxDate && guard < 3660){ // säkerhetsspärr: max ~10 år, ska aldrig triggas i praktiken
    guard++
    const present = vistelser.filter(v=>v.starts_at<=cur && v.ends_at>=cur).map(v=>v.family_id).sort()
    const key = present.join(',')
    if(curFamilies===null || key !== curFamilies.join(',')){
      if(segStart!==null) segments.push({start:segStart, end:isoAdd(cur,-1), families:curFamilies})
      segStart = cur
      curFamilies = present
    }
    cur = isoAdd(cur,1)
  }
  if(segStart!==null) segments.push({start:segStart, end:maxDate, families:curFamilies})
  return segments.filter(s=>s.families.length>0)
}

function computeDailyOccupancy(vistelser){
  if(!vistelser.length) return []
  const minDate = vistelser.reduce((m,v)=>v.starts_at<m?v.starts_at:m, vistelser[0].starts_at)
  const maxDate = vistelser.reduce((m,v)=>v.ends_at>m?v.ends_at:m, vistelser[0].ends_at)
  const days = []
  let cur = minDate
  let guard = 0
  while(cur <= maxDate && guard < 3660){
    guard++
    const presentFamilyIds = vistelser.filter(v=>v.starts_at<=cur && v.ends_at>=cur).map(v=>v.family_id)
    const count = presentFamilyIds.reduce((s,id)=>s+famPersonCount(id),0)
    days.push({date:cur, count, familyCount:presentFamilyIds.length})
    cur = isoAdd(cur,1)
  }
  return days
}

function renderOccupancyChart(days){
  if(!days.length) return ''
  const maxCount = Math.max(...days.map(d=>d.count), 1)
  const w = 700, h = 110, padBottom = 18, padTop = 8
  const barW = w / days.length
  const weekMarks = days.map((d,i)=>{
    if(dayOfWeekUTC(d.date)!==1) return ''
    const x = i*barW
    const wn = isoWeekNumber(d.date)
    return `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${h-padBottom}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,2"/>
      <text x="${(x+2).toFixed(1)}" y="${h-4}" font-size="9" fill="var(--muted)">v.${wn}</text>`
  }).join('')
  const bars = days.map((d,i)=>{
    const barH = maxCount>0 ? (d.count/maxCount)*(h-padBottom-padTop) : 0
    const x = i*barW
    const y = h - padBottom - barH
    const color = d.count===0 ? 'var(--border)' : (d.familyCount>1 ? 'var(--accent)' : 'var(--accent-muted)')
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(barW-1,1).toFixed(1)}" height="${Math.max(barH,0).toFixed(1)}" fill="${color}"><title>${esc(fmtDateY(d.date))}: ${d.count} person${d.count===1?'':'er'}</title></rect>`
  }).join('')
  return `<div class="card" style="padding:12px 14px 8px;margin-bottom:12px">
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px;display:flex;justify-content:space-between">
      <span>🛏️ Beläggning (personer/dag)</span><span>Max ${maxCount}</span>
    </div>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:110px;display:block">${weekMarks}${bars}</svg>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:2px">
      <span>${esc(fmtDate(days[0].date))}</span><span>${esc(fmtDate(days[days.length-1].date))}</span>
    </div>
  </div>`
}

function renderTimelineChart(vistelser){
  if(!vistelser.length) return ''
  const familyIds = Array.from(new Set(vistelser.map(v=>v.family_id)))
  const minDate = vistelser.reduce((m,v)=>v.starts_at<m?v.starts_at:m, vistelser[0].starts_at)
  const maxDate = vistelser.reduce((m,v)=>v.ends_at>m?v.ends_at:m, vistelser[0].ends_at)
  const totalDays = Math.max(dayDiff(minDate,maxDate)+1, 1)
  const w = 700, labelW = 92, padTop = 6, padBottom = 20, rowH = 32
  const chartW = w - labelW
  const h = padTop + familyIds.length*rowH + padBottom
  const pxPerDay = chartW/totalDays
  const colors = ['var(--accent)','var(--accent-muted)','var(--wine)','var(--danger)']

  const rows = familyIds.map((famId,rowIdx)=>{
    const y = padTop + rowIdx*rowH
    const label = `<text x="0" y="${(y+rowH/2+4).toFixed(1)}" font-size="12" fill="var(--text)">${esc(famName(famId))}</text>`
    const bars = vistelser.filter(v=>v.family_id===famId).map(v=>{
      const x = labelW + dayDiff(minDate,v.starts_at)*pxPerDay
      const bw = Math.max((dayDiff(v.starts_at,v.ends_at)+1)*pxPerDay - 2, 3)
      const color = colors[rowIdx % colors.length]
      const title = `${famName(famId)}: ${fmtDateY(v.starts_at)} – ${fmtDateY(v.ends_at)}`
      return `<rect x="${x.toFixed(1)}" y="${(y+4).toFixed(1)}" width="${bw.toFixed(1)}" height="${(rowH-10).toFixed(1)}" rx="4" fill="${color}"><title>${esc(title)}</title></rect>`
    }).join('')
    const rowLine = `<line x1="${labelW}" y1="${(y+rowH).toFixed(1)}" x2="${w}" y2="${(y+rowH).toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`
    return label+bars+rowLine
  }).join('')

  let weekMarks = ''
  let cur = minDate, idx = 0, guard = 0
  while(cur<=maxDate && guard<3660){
    guard++
    if(dayOfWeekUTC(cur)===1){
      const x = labelW + idx*pxPerDay
      const wn = isoWeekNumber(cur)
      weekMarks += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${h-padBottom}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,2"/>
        <text x="${(x+2).toFixed(1)}" y="${h-6}" font-size="9" fill="var(--muted)">v.${wn}</text>`
    }
    cur = isoAdd(cur,1)
    idx++
  }

  return `<div class="card" style="padding:12px 14px 8px;margin-bottom:12px;overflow-x:auto">
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px">📅 Tidslinje per familj</div>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;min-width:480px;height:${h}px;display:block">${weekMarks}${rows}</svg>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:2px;padding-left:${labelW}px">
      <span>${esc(fmtDate(minDate))}</span><span>${esc(fmtDate(maxDate))}</span>
    </div>
  </div>`
}

function renderKalender(){
  if(!state.platser.length){
    return `<p class="empty">Skapa ett ställe (t.ex. Båstad) under fliken Ställen för att kunna planera vistelser där.</p>`
  }
  if(!state.families.length){
    return `<p class="empty">Lägg till minst en familj i Kvittodelning innan ni kan anmäla vistelser.</p>`
  }
  if(!calendarPlatsId || !state.platser.find(p=>p.id===calendarPlatsId)){
    calendarPlatsId = state.platser[0].id
  }
  const platsOpts = state.platser.map(pl=>`<option value="${pl.id}" ${pl.id===calendarPlatsId?'selected':''}>${pl.recurring?'🔁 ':''}${esc(pl.name)}</option>`).join('')
  const vistelser = state.vistelser.filter(v=>v.plats_id===calendarPlatsId).sort((a,b)=>a.starts_at.localeCompare(b.starts_at))

  const segments = computeOverlapSegments(vistelser)
  const segmentHtml = segments.length ? segments.map(s=>{
    const names = s.families.map(id=>famName(id)).filter(Boolean)
    const totalPeople = s.families.reduce((sum,id)=>sum+famPersonCount(id),0)
    const overlap = names.length>1
    const dateLabel = s.start===s.end ? fmtDateY(s.start) : `${fmtDateY(s.start)} – ${fmtDateY(s.end)}`
    return `<div class="card" style="${overlap?'border-color:var(--accent);background:var(--accent-light)':''}">
      <div style="font-weight:600;font-size:14px">${dateLabel}</div>
      <div class="tags" style="margin-top:5px">${names.map(n=>`<span class="tag">${esc(n)}</span>`).join('')}</div>
      <div style="font-size:12px;color:${overlap?'var(--accent)':'var(--muted)'};font-weight:${overlap?'600':'500'};margin-top:5px">
        ${overlap?`👥 ${names.length} familjer samtidigt · `:''}🛏️ ${totalPeople} person${totalPeople===1?'':'er'}
      </div>
    </div>`
  }).join('') : '<p class="empty">Inga vistelser inplanerade för det här stället ännu.</p>'

  const listHtml = vistelser.map(v=>`<div class="slim-row">
    <div style="flex:1;min-width:0">
      <div class="slim-desc">${esc(famName(v.family_id))}</div>
      <div class="slim-sub">${fmtDateY(v.starts_at)} – ${fmtDateY(v.ends_at)}${v.note?' · '+esc(v.note):''}</div>
    </div>
    <div class="slim-actions">
      <button class="btn btn-g btn-sm" onclick="editVistelse('${v.id}')">✏️</button>
      <button class="btn btn-d btn-sm" onclick="delVistelse('${v.id}')">✕</button>
    </div>
  </div>`).join('')

  const chartToggle = `<div class="btn-row" style="margin-bottom:8px">
    <button class="btn ${calendarChartMode==='bar'?'btn-p':'btn-g'} btn-sm" onclick="setCalendarChartMode('bar')">📊 Diagram</button>
    <button class="btn ${calendarChartMode==='timeline'?'btn-p':'btn-g'} btn-sm" onclick="setCalendarChartMode('timeline')">📅 Tidslinje</button>
  </div>`
  const chartHtml = calendarChartMode==='timeline'
    ? renderTimelineChart(vistelser)
    : renderOccupancyChart(computeDailyOccupancy(vistelser))

  return `<div class="sh"><span class="sh-title">Kalender</span><button class="btn btn-p" onclick="newVistelse()">+ Anmäl vistelse</button></div>
    <div class="fg" style="max-width:260px"><select onchange="setCalendarPlats(this.value)">${platsOpts}</select></div>
    <div class="hint">Vistelser är planering – helt separat från avräkning och mandagar i Kvittodelning. Anmäl när ni tänker vara i ${esc(platsName(calendarPlatsId))}, så syns det direkt om flera familjer är där samtidigt.</div>
    ${chartToggle}
    ${vistelser.length ? chartHtml : ''}
    <div class="sh" style="margin-top:14px"><span class="sh-title" style="font-size:14px">Översikt</span></div>
    ${segmentHtml}
    <div class="sh" style="margin-top:14px"><span class="sh-title" style="font-size:14px">Alla vistelser</span></div>
    ${vistelser.length ? listHtml : '<p class="empty">–</p>'}`
}

function vistelseModal(v=null){
  const id=v?v.id:''
  const famOpts = state.families.map(f=>`<option value="${f.id}" ${v&&f.id===v.family_id?'selected':''}>${esc(f.name)}</option>`).join('')
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">${v?'Redigera vistelse':'Anmäl vistelse'} – ${esc(platsName(calendarPlatsId))}</div>
    <div class="fg"><label>Familj</label><select id="v-family">${famOpts}</select></div>
    <div class="fr">
      <div class="fg"><label>Från</label><input type="date" id="v-start" value="${v?v.starts_at:today()}"/></div>
      <div class="fg"><label>Till</label><input type="date" id="v-end" value="${v?v.ends_at:today()}"/></div>
    </div>
    <div class="fg"><label>Anteckning (valfritt)</label><input id="v-note" value="${esc(v?(v.note||''):'')}" placeholder="t.ex. kommer torsdag kväll"/></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="saveVistelse('${id}')">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

function newVistelse(){ vistelseModal() }
function editVistelse(id){ vistelseModal(state.vistelser.find(v=>v.id===id)) }

async function saveVistelse(id){
  const familyId = document.getElementById('v-family').value
  const starts = document.getElementById('v-start').value
  const ends = document.getElementById('v-end').value
  const note = document.getElementById('v-note').value.trim() || null
  if(!familyId){ alert('Välj en familj.'); return }
  if(!starts || !ends){ alert('Ange datum.'); return }
  if(ends < starts){ alert('Slutdatum kan inte vara före startdatum.'); return }
  const payload = { family_id:familyId, starts_at:starts, ends_at:ends, note, plats_id:calendarPlatsId, klan_id:currentKlanId }
  const { error } = id
    ? await sb.from('vistelser').update(payload).eq('id',id)
    : await sb.from('vistelser').insert(payload)
  if(error){ alert('Kunde inte spara vistelsen: '+error.message); return }
  closeModal(); await init()
}

async function delVistelse(id){
  if(!confirm('Ta bort vistelsen?')) return
  const { error } = await sb.from('vistelser').delete().eq('id',id)
  if(error){ alert('Kunde inte ta bort: '+error.message); return }
  await init()
}

// ── START ─────────────────────────────────────────────────────────────────────
boot()
