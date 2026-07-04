const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

let state = { people:[], entries:[] }
let activeTab = 'entries'
let entryYear = new Date().getFullYear()
let entryPersonFilter = null
let entryCategoryFilter = null
let reportYear = new Date().getFullYear()
let selectedPhotoFile = null

const DEFAULT_CATEGORIES = ['Reparation','Trädgård','El & Vatten','Städning','Inventarier/Möbler','Försäkring','Övrigt']

// ── GATE ──────────────────────────────────────────────────────────────────────
function boot(){
  const authed = localStorage.getItem('bastadkonto_authed')
  if(authed === 'yes'){ enterApp() } else { renderGateLogin() }
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
    <h2>Båstadkonto</h2>
    <p>Ange lösenordet för att komma in.</p>
    <div class="fg"><label>Lösenord</label><input id="gate-password" type="password" autofocus/></div>
    <button class="btn btn-p" style="width:100%" onclick="tryLogin()">Logga in</button>
    <div class="gate-status" id="gate-status"></div>
  </div></div>`)
}

function tryLogin(){
  const pw = document.getElementById('gate-password').value
  const statusEl = document.getElementById('gate-status')
  if(pw !== HOUSE_PASSWORD){ statusEl.textContent='Fel lösenord.'; return }
  localStorage.setItem('bastadkonto_authed','yes')
  enterApp()
}

function logout(){
  localStorage.removeItem('bastadkonto_authed')
  renderGateLogin()
}

async function enterApp(){
  hideGate()
  document.getElementById('mainApp').style.display=''
  await init()
}

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init(){
  showLoading()
  const [p,e] = await Promise.all([
    sb.from('house_people').select('*').order('name'),
    sb.from('house_entries').select('*').order('date',{ascending:false})
  ])
  state.people = p.data||[]
  state.entries = e.data||[]
  renderActive()
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
  if(tab==='entries') el.innerHTML = renderEntries()
  if(tab==='people')  el.innerHTML = renderPeople()
  if(tab==='report')  el.innerHTML = renderReport()
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function fmt(n,d=0){ return Number(n||0).toLocaleString('sv-SE',{minimumFractionDigits:d,maximumFractionDigits:d}) }
function fmtDate(d){ return d ? new Date(d).toLocaleDateString('sv-SE',{year:'numeric',month:'short',day:'numeric'}) : '' }
function today(){ return new Date().toISOString().slice(0,10) }
function personName(id){ return (state.people.find(p=>p.id===id)||{}).name||'(okänd)' }
function closeModal(){ document.getElementById('modal').style.display='none'; document.getElementById('modal').innerHTML='' }
function openModal(html){ document.getElementById('modal').innerHTML=html; document.getElementById('modal').style.display='block' }
function availableYears(){
  const years = new Set(state.entries.map(e=>new Date(e.date).getFullYear()))
  years.add(new Date().getFullYear())
  return Array.from(years).sort((a,b)=>b-a)
}

function availableCategories(){
  const used = new Set(state.entries.map(e=>e.category).filter(Boolean))
  DEFAULT_CATEGORIES.forEach(c=>used.add(c))
  return Array.from(used).sort()
}

function lightbox(url){
  openModal(`<div class="overlay" onclick="closeModal()" style="align-items:center;justify-content:center">
    <img src="${esc(url)}" style="max-width:92vw;max-height:85vh;border-radius:12px"/>
  </div>`)
}

// ── FOTO & TOLKNING ────────────────────────────────────────────────────────────
async function handlePhotoSelect(event, prefix){
  const file = event.target.files[0]
  if(!file) return
  selectedPhotoFile = file
  const previewUrl = URL.createObjectURL(file)
  const preview = document.getElementById(prefix+'-photo-preview')
  if(preview) preview.innerHTML = `<img src="${previewUrl}" style="max-width:120px;border-radius:8px;margin-top:6px;display:block"/>`
  const statusEl = document.getElementById(prefix+'-ocr-status')
  if(statusEl) statusEl.textContent = '🔍 Läser av kvittot…'
  try{
    const { data:{ text } } = await Tesseract.recognize(file, 'swe')
    const parsed = parseReceiptText(text)
    const amountInput = document.getElementById(prefix+'-amount')
    const dateInput = document.getElementById(prefix+'-date')
    if(parsed.amount && amountInput && !amountInput.value) amountInput.value = parsed.amount
    if(parsed.date && dateInput) dateInput.value = parsed.date
    if(statusEl){
      statusEl.textContent = (parsed.amount||parsed.date)
        ? '✅ Förslag ifyllt automatiskt – dubbelkolla innan du sparar.'
        : 'Kunde inte tolka belopp/datum automatiskt – fyll i manuellt.'
    }
  }catch(err){
    if(statusEl) statusEl.textContent = 'Kunde inte läsa av kvittot automatiskt – fyll i manuellt.'
  }
}

function parseReceiptText(text){
  let date = null
  const isoMatch = text.match(/(20\d{2})[-.](\d{2})[-.](\d{2})/)
  if(isoMatch){
    date = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  } else {
    const dmyMatch = text.match(/(\d{2})[.\/-](\d{2})[.\/-](20\d{2}|\d{2})/)
    if(dmyMatch){
      let [,d,m,y] = dmyMatch
      if(y.length===2) y = '20'+y
      date = `${y}-${m}-${d}`
    }
  }

  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean)
  const keywordRe = /(summa|totalt|total|att betala|belopp)/i
  let amount = null
  for(const line of lines){
    if(keywordRe.test(line)){
      const numMatch = line.match(/(\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{2})?)/)
      if(numMatch){ amount = normalizeAmount(numMatch[1]); break }
    }
  }
  if(!amount){
    const allNums = [...text.matchAll(/(\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{2}))/g)].map(m=>normalizeAmount(m[1])).filter(n=>n>0)
    if(allNums.length) amount = Math.max(...allNums)
  }
  return { date, amount }
}

function normalizeAmount(s){
  const cleaned = s.replace(/\s/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

async function uploadReceiptPhoto(file){
  const ext = (file.name.split('.').pop()||'jpg').toLowerCase()
  const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`
  const { error } = await sb.storage.from('receipts').upload(path, file)
  if(error) throw error
  const { data } = sb.storage.from('receipts').getPublicUrl(path)
  return data.publicUrl
}

// ── ENTRIES (Utlägg) ────────────────────────────────────────────────────────────
function renderEntries(){
  if(!state.people.length){
    return `<p class="empty">Lägg till minst en person innan du kan registrera utlägg.</p>
      <div style="text-align:center;margin-top:10px"><button class="btn btn-p" onclick="showTab('people', document.querySelectorAll('.tab')[1])">👤 Lägg till person</button></div>`
  }

  const years = availableYears()
  const yearOpts = years.map(y=>`<option value="${y}" ${y===entryYear?'selected':''}>${y}</option>`).join('')

  const yearEntries = state.entries.filter(e=>new Date(e.date).getFullYear()===entryYear)
  let filtered = entryPersonFilter ? yearEntries.filter(e=>e.person_id===entryPersonFilter) : yearEntries
  filtered = entryCategoryFilter ? filtered.filter(e=>e.category===entryCategoryFilter) : filtered

  const totAll = yearEntries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0)
  const totPaid = yearEntries.filter(e=>e.paid_date).reduce((s,e)=>s+(parseFloat(e.amount)||0),0)
  const totUnpaid = totAll - totPaid

  const sumBar = yearEntries.length ? `
    <div class="rep-summary" style="margin-bottom:12px">
      <div class="rep-row"><span>Totalt registrerat ${entryYear}</span><span>${fmt(totAll)} kr</span></div>
      <div class="rep-row"><span>Utbetalt</span><span>${fmt(totPaid)} kr</span></div>
      <div class="rep-row" style="font-weight:700;font-size:15px;margin-top:4px"><span>Kvar att betala ut</span><span>${fmt(totUnpaid)} kr</span></div>
    </div>` : ''

  const chips = `<div class="filter-chips">
    <span class="chip ${!entryPersonFilter?'on':''}" onclick="setEntryFilter(null)">Alla</span>
    ${state.people.map(p=>`<span class="chip ${entryPersonFilter===p.id?'on':''}" onclick="setEntryFilter('${p.id}')">${esc(p.name)}</span>`).join('')}
  </div>`

  const usedCategories = Array.from(new Set(yearEntries.map(e=>e.category).filter(Boolean))).sort()
  const categoryFilterHtml = usedCategories.length ? `<div class="fg" style="max-width:220px">
    <select onchange="setCategoryFilter(this.value)">
      <option value="">Alla kategorier</option>
      ${usedCategories.map(c=>`<option value="${esc(c)}" ${entryCategoryFilter===c?'selected':''}>${esc(c)}</option>`).join('')}
    </select>
  </div>` : ''

  const rows = filtered.map(e=>{
    const paid = !!e.paid_date
    return `<div class="entry-row">
      <div class="entry-top">
        <div>
          <div class="entry-desc">${esc(e.description)}</div>
          <div class="entry-sub">${esc(personName(e.person_id))} · ${fmtDate(e.date)}${e.category?' · '+esc(e.category):''}</div>
        </div>
        <div class="entry-amt">${fmt(e.amount)} kr</div>
      </div>
      ${e.image_url?`<img src="${esc(e.image_url)}" onclick="lightbox('${esc(e.image_url)}')" style="width:46px;height:46px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;margin-top:6px"/>`:''}
      <div class="entry-bottom">
        <span class="badge ${paid?'badge-paid':'badge-unpaid'}">${paid?'✅ Betald '+fmtDate(e.paid_date):'⏳ Obetald'}</span>
        <div class="entry-actions">
          ${paid
            ? `<button class="btn btn-g btn-sm" onclick="unmarkPaid('${e.id}')">Ångra</button>`
            : `<button class="btn btn-gold btn-sm" onclick="markPaidModal('${e.id}')">Markera betald</button>`}
          <button class="btn btn-g btn-sm" onclick="editEntry('${e.id}')">✏️</button>
          <button class="btn btn-d btn-sm" onclick="delEntry('${e.id}')">✕</button>
        </div>
      </div>
    </div>`
  }).join('')

  const emptyMsg = yearEntries.length===0
    ? `<p class="empty">Inga utlägg registrerade för ${entryYear} ännu.</p>`
    : filtered.length===0 ? '<p class="empty">Inga utlägg för den här personen.</p>' : ''

  return `<div class="sh">
      <span class="sh-title">Utlägg</span>
      <select style="width:auto" id="entry-year-sel" onchange="setEntryYear(this.value)">${yearOpts}</select>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div class="fr">
        <div class="fg"><label>Vem</label><select id="ne-person"><option value="">– välj –</option>${state.people.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
        <div class="fg"><label>Datum</label><input type="date" id="ne-date" value="${today()}"/></div>
      </div>
      <div class="fg"><label>Foto på kvittot (valfritt – försöker läsa av belopp/datum)</label>
        <input type="file" id="ne-photo" accept="image/*" capture="environment" onchange="handlePhotoSelect(event,'ne')"/>
        <div id="ne-photo-preview"></div>
        <div id="ne-ocr-status" style="font-size:12px;color:var(--muted);margin-top:4px"></div>
      </div>
      <div class="fg"><label>Vad köptes / betaldes</label><textarea id="ne-desc" placeholder="Beskriv vad utlägget avser, t.ex. leverantör, vad som köptes och varför"></textarea></div>
      <div class="fr">
        <div class="fg"><label>Belopp (kr)</label><input type="number" id="ne-amount" min="0" step="1"/></div>
        <div class="fg"><label>Kategori</label><input id="ne-category" list="category-list" placeholder="t.ex. Reparation"/></div>
      </div>
      <datalist id="category-list">${availableCategories().map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
      <button class="btn btn-p" style="width:100%" onclick="saveEntry()">💾 Registrera utlägg</button>
      <div id="ne-status" style="margin-top:8px;font-size:13px;color:var(--accent)"></div>
    </div>
    ${sumBar}${chips}${categoryFilterHtml}${emptyMsg}${rows}`
}

function setEntryYear(y){ entryYear=parseInt(y); renderActive() }
function setEntryFilter(id){ entryPersonFilter = entryPersonFilter===id ? null : id; renderActive() }
function setCategoryFilter(cat){ entryCategoryFilter = cat || null; renderActive() }

async function saveEntry(){
  const personId = document.getElementById('ne-person').value
  const date = document.getElementById('ne-date').value
  const desc = document.getElementById('ne-desc').value.trim()
  const amount = parseFloat(document.getElementById('ne-amount').value)||0
  const category = document.getElementById('ne-category').value.trim() || null
  const statusEl = document.getElementById('ne-status')
  if(!personId){ statusEl.textContent='Välj vem.'; return }
  if(!desc){ statusEl.textContent='Beskriv vad utlägget avser.'; return }
  if(!amount){ statusEl.textContent='Ange ett belopp.'; return }
  statusEl.textContent='Sparar…'
  let imageUrl = null
  if(selectedPhotoFile){
    statusEl.textContent='Laddar upp bild…'
    try{ imageUrl = await uploadReceiptPhoto(selectedPhotoFile) }
    catch(err){ statusEl.textContent='Kunde inte ladda upp bilden: '+err.message; return }
  }
  await sb.from('house_entries').insert({ person_id:personId, date, description:desc, amount, category, image_url:imageUrl, paid_date:null })
  selectedPhotoFile = null
  entryYear = new Date(date).getFullYear()
  await init()
  showTab('entries', document.querySelector('.tab'))
  const s = document.getElementById('ne-status'); if(s) s.textContent='✅ Sparat!'
  setTimeout(()=>{ const s2=document.getElementById('ne-status'); if(s2) s2.textContent='' }, 2500)
}

function editEntry(id){
  const e = state.entries.find(e=>e.id===id)
  if(!e) return
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Redigera utlägg</div>
    <div class="fr">
      <div class="fg"><label>Vem</label><select id="ee-person">${state.people.map(p=>`<option value="${p.id}" ${p.id===e.person_id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="fg"><label>Datum</label><input type="date" id="ee-date" value="${e.date}"/></div>
    </div>
    ${e.image_url?`<div class="fg"><label>Kvittobild</label><img src="${esc(e.image_url)}" onclick="lightbox('${esc(e.image_url)}')" style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer"/></div>`:''}
    <div class="fg"><label>Vad köptes / betaldes</label><textarea id="ee-desc">${esc(e.description)}</textarea></div>
    <div class="fr">
      <div class="fg"><label>Belopp (kr)</label><input type="number" id="ee-amount" min="0" step="1" value="${e.amount}"/></div>
      <div class="fg"><label>Kategori</label><input id="ee-category" list="category-list-edit" value="${esc(e.category||'')}" placeholder="t.ex. Reparation"/></div>
    </div>
    <datalist id="category-list-edit">${availableCategories().map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
    <div class="btn-row">
      <button class="btn btn-p" onclick="updateEntry('${id}')">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function updateEntry(id){
  const personId = document.getElementById('ee-person').value
  const date = document.getElementById('ee-date').value
  const desc = document.getElementById('ee-desc').value.trim()
  const amount = parseFloat(document.getElementById('ee-amount').value)||0
  const category = document.getElementById('ee-category').value.trim() || null
  if(!desc||!amount){ alert('Fyll i beskrivning och belopp.'); return }
  await sb.from('house_entries').update({ person_id:personId, date, description:desc, amount, category }).eq('id',id)
  closeModal(); await init()
}

async function delEntry(id){
  if(!confirm('Ta bort utlägget?')) return
  await sb.from('house_entries').delete().eq('id',id)
  await init()
}

function markPaidModal(id){
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Markera som betald</div>
    <div class="fg"><label>Utbetalningsdatum</label><input type="date" id="pd-date" value="${today()}"/></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="confirmMarkPaid('${id}')">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

async function confirmMarkPaid(id){
  const date = document.getElementById('pd-date').value
  if(!date){ alert('Ange ett datum.'); return }
  await sb.from('house_entries').update({ paid_date:date }).eq('id',id)
  closeModal(); await init()
}

async function unmarkPaid(id){
  if(!confirm('Ångra utbetalningen och markera som obetald igen?')) return
  await sb.from('house_entries').update({ paid_date:null }).eq('id',id)
  await init()
}

// ── PEOPLE (Personer) ────────────────────────────────────────────────────────────
function renderPeople(){
  const cards = state.people.map(p=>{
    const entries = state.entries.filter(e=>e.person_id===p.id)
    const unpaidCount = entries.filter(e=>!e.paid_date).length
    return `<div class="card">
      <div class="card-hdr">
        <div>
          <div class="card-title">${esc(p.name)}</div>
          ${p.email?`<div class="card-sub">${esc(p.email)}</div>`:''}
          <div class="card-sub">${entries.length} utlägg${unpaidCount?` · ${unpaidCount} obetalda`:''}</div>
        </div>
        <div class="btn-row">
          <button class="btn btn-g btn-sm" onclick="editPerson('${p.id}')">Redigera</button>
          <button class="btn btn-d btn-sm" onclick="delPerson('${p.id}')">Ta bort</button>
        </div>
      </div>
    </div>`
  }).join('')
  return `<div class="sh"><span class="sh-title">Personer</span><button class="btn btn-p" onclick="newPerson()">+ Lägg till</button></div>
    ${!state.people.length?'<p class="empty">Lägg till personer som kan registrera utlägg.</p>':cards}`
}

function personModal(p=null){
  const id=p?p.id:''
  openModal(`<div class="overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">${p?'Redigera person':'Ny person'}</div>
    <div class="fg"><label>Namn</label><input id="p-name" value="${esc(p?p.name:'')}" placeholder="t.ex. Jalle" autofocus/></div>
    <div class="fg"><label>Mejladress (valfritt, bara för identifiering)</label><input id="p-email" type="email" value="${esc(p?(p.email||''):'')}" placeholder="namn@exempel.se"/></div>
    <div class="btn-row">
      <button class="btn btn-p" onclick="savePerson('${id}')">Spara</button>
      <button class="btn btn-g" onclick="closeModal()">Avbryt</button>
    </div>
  </div></div>`)
}

function newPerson(){ personModal() }
function editPerson(id){ personModal(state.people.find(p=>p.id===id)) }

async function savePerson(id){
  const name = document.getElementById('p-name').value.trim()
  const email = document.getElementById('p-email').value.trim()
  if(!name){ alert('Ange ett namn.'); return }
  if(id) await sb.from('house_people').update({name,email}).eq('id',id)
  else await sb.from('house_people').insert({name,email})
  closeModal(); await init()
}

async function delPerson(id){
  const hasEntries = state.entries.some(e=>e.person_id===id)
  if(hasEntries){ alert('Den här personen har registrerade utlägg. Ta bort eller flytta dem först.'); return }
  if(!confirm('Ta bort person?')) return
  await sb.from('house_people').delete().eq('id',id)
  await init()
}

// ── REPORT (Rapport) ────────────────────────────────────────────────────────────
function renderReport(){
  const years = availableYears()
  const yearOpts = years.map(y=>`<option value="${y}" ${y===reportYear?'selected':''}>${y}</option>`).join('')
  const yearEntries = state.entries.filter(e=>new Date(e.date).getFullYear()===reportYear)

  if(!yearEntries.length){
    return `<div class="sh"><span class="sh-title">Rapport</span><select style="width:auto" onchange="setReportYear(this.value)">${yearOpts}</select></div>
      <p class="empty">Inga utlägg registrerade för ${reportYear}.</p>`
  }

  const totAll = yearEntries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0)
  const totPaid = yearEntries.filter(e=>e.paid_date).reduce((s,e)=>s+(parseFloat(e.amount)||0),0)

  const summary = `<div class="rep-summary">
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div><h3>Totalt registrerat ${reportYear}</h3><div class="rep-total-num">${fmt(totAll)} kr</div></div>
      <div style="text-align:right;font-size:12px;opacity:.8">${yearEntries.length} utlägg</div>
    </div>
    <div class="rep-divider">
      <div class="rep-row"><span>Utbetalt</span><span>${fmt(totPaid)} kr</span></div>
      <div class="rep-row" style="font-weight:700"><span>Kvar att betala ut</span><span>${fmt(totAll-totPaid)} kr</span></div>
    </div>
  </div>`

  // Kompakt sammanställning per kategori – till för bokföring/redovisning
  const catTotals = {}
  yearEntries.forEach(e=>{
    const cat = e.category || 'Okategoriserat'
    catTotals[cat] = (catTotals[cat]||0) + (parseFloat(e.amount)||0)
  })
  const catRows = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([cat,sum])=>
    `<div class="fam-row"><span>${esc(cat)}</span><span>${fmt(sum)} kr</span></div>`
  ).join('')
  const categoryCard = `<div class="fam-card">
    <div class="fam-name">Per kategori (för redovisning)</div>
    ${catRows}
    <div class="fam-total"><span>Totalt</span><span>${fmt(totAll)} kr</span></div>
  </div>`

  const csvBtn = `<button class="btn btn-g btn-sm" onclick="exportHouseCSV()">⬇ CSV (alla rader)</button>`

  const cards = state.people.map(p=>{
    const entries = yearEntries.filter(e=>e.person_id===p.id)
    if(!entries.length) return ''
    const registered = entries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0)
    const paid = entries.filter(e=>e.paid_date).reduce((s,e)=>s+(parseFloat(e.amount)||0),0)
    const remaining = registered - paid
    return `<div class="fam-card">
      <div class="fam-name">${esc(p.name)}</div>
      <div class="fam-row"><span>Antal utlägg</span><span>${entries.length}</span></div>
      <div class="fam-row"><span>Registrerat</span><span>${fmt(registered)} kr</span></div>
      <div class="fam-row"><span>Utbetalt</span><span>${fmt(paid)} kr</span></div>
      <div class="fam-total">
        <span>${remaining>0.5?'💸 Kvar att få':'✅ Kvitt'}</span>
        <span style="color:${remaining>0.5?'var(--gold)':'var(--accent)'}">${fmt(remaining)} kr</span>
      </div>
    </div>`
  }).join('')

  return `<div class="sh"><span class="sh-title">Rapport</span><select style="width:auto" onchange="setReportYear(this.value)">${yearOpts}</select></div>
    ${summary}
    <div class="sh" style="margin-top:4px"><span></span>${csvBtn}</div>
    ${categoryCard}${cards}`
}

function exportHouseCSV(){
  const yearEntries = state.entries.filter(e=>new Date(e.date).getFullYear()===reportYear)
  const rows = [['Datum','Person','Kategori','Beskrivning','Belopp','Betald']]
  yearEntries.forEach(e=>{
    rows.push([e.date, personName(e.person_id), e.category||'', e.description, fmt(e.amount), e.paid_date?fmtDate(e.paid_date):'Nej'])
  })
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n')
  const a = document.createElement('a')
  a.href = 'data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv)
  a.download = `bastadkonto_${reportYear}.csv`
  a.click()
}

function setReportYear(y){ reportYear=parseInt(y); renderActive() }

// ── START ─────────────────────────────────────────────────────────────────────
boot()
