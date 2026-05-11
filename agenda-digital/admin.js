const $ = (id) => document.getElementById(id);

let allReservas = [];
let currentFilter = 'all';

function init() {
  console.log('[init] auth=' + checkAuth());
  if (!checkAuth()) { showLogin(); return; }
  showPanel();
}

function checkAuth() {
  try { return sessionStorage.getItem('agenda_auth') === '1'; } catch (e) { return false; }
}

function showLogin() {
  $('loginScreen').classList.remove('hidden');
  $('panelContent').classList.add('hidden');
  $('loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  $('loginBtn').addEventListener('click', doLogin);
  $('loginPass').focus();
}

function doLogin() {
  const pass = $('loginPass').value.trim();
  const expected = CONFIG.ADMIN_PASSWORD || 'peluqueria2024';
  if (pass === expected) {
    try { sessionStorage.setItem('agenda_auth', '1'); } catch (e) {}
    showPanel();
  } else {
    $('loginError').classList.remove('hidden');
    $('loginPass').value = '';
    $('loginPass').focus();
  }
}

function showPanel() {
  $('loginScreen').classList.add('hidden');
  $('panelContent').classList.remove('hidden');
  if (CONFIG.BUSINESS) {
    const hb = $('headerBusiness');
    if (hb) hb.textContent = CONFIG.BUSINESS + ' — Panel';
  }
  $('btnReload').addEventListener('click', loadReservas);
  loadReservas();
}

function getBusinessDate() {
  const tz = CONFIG.TIMEZONE || 'America/Mexico_City';
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return dtf.format(new Date());
}

function cleanDate(str) {
  if (!str) return '';
  return str.includes('T') ? str.split('T')[0] : str.replace(/^'/, '');
}

function cleanTime(str) {
  if (!str) return '';
  if (str.includes('T')) { const t = str.split('T')[1]; return t ? t.substring(0, 5) : str; }
  return str.replace(/^'/, '').substring(0, 5);
}

async function loadReservas() {
  const list = $('reservasList');
  list.innerHTML = '<div class="text-xs text-[#9A9590] font-mono p-4">Cargando desde hoja...</div>';
  allReservas = [];

  const isDemo = !CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.includes('TU_ID_AQUI');
  if (isDemo) {
    loadFromLocal();
    return;
  }

  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL + '?t=' + Date.now(), { cache: 'no-store' });
    const json = await res.json();
    if (json.success && json.values && json.values.length > 1) {
      const rows = json.values;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        allReservas.push({
          fecha:    String(r[0] || '').trim(),
          hora:     String(r[1] || '').trim(),
          nombre:   String(r[2] || '').trim(),
          whatsapp: String(r[3] || '').trim(),
          servicio: String(r[4] || '').trim(),
          estado:   String(r[5] || '').trim().toLowerCase(),
          creado:   String(r[6] || '').trim(),
          pago:     String(r[7] || '').trim().toLowerCase(),
          nota:     String(r[8] || '').trim()
        });
      }
      applyFilter(); updateStats(); updateNextBar();
      return;
    } else {
      console.warn('Sheet devolvió:', json);
      list.innerHTML = '<div class="card-pastel p-5 text-xs text-[#E07A5F] font-mono">Sheet vacío o error. ¿Creaste la hoja "Reservas"?</div>';
    }
  } catch (e) {
    console.warn('Fallo Sheet:', e.message);
    list.innerHTML = '<div class="card-pastel p-5 text-xs text-[#E07A5F] font-mono">Error al conectar con Sheet. Revisa la URL en config.js y que el deploy sea "Anyone".</div>';
  }
}

function loadFromLocal() {
  try {
    const stored = localStorage.getItem('agenda_reservas');
    allReservas = stored ? JSON.parse(stored) : [];
    applyFilter(); updateStats(); updateNextBar();
  } catch (e) { console.error(e); }
}

function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('[data-filter]').forEach(b => {
    b.classList.remove('filter-active');
    b.classList.add('btn-ghost');
  });
  const active = document.querySelector('[data-filter="' + f + '"]');
  if (active) { active.classList.add('filter-active'); active.classList.remove('btn-ghost'); }
  applyFilter();
}

function applyFilter() {
  const todayStr = getBusinessDate();
  const today = new Date(todayStr + 'T00:00:00');
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);

  let filtered = allReservas.filter(r => r.estado !== 'cancelada');
  if (currentFilter === 'today') filtered = filtered.filter(r => cleanDate(r.fecha) === todayStr);
  else if (currentFilter === 'tomorrow') filtered = filtered.filter(r => new Date(cleanDate(r.fecha) + 'T00:00:00').getTime() === tomorrow.getTime());
  else if (currentFilter === 'week') filtered = filtered.filter(r => { const d = new Date(cleanDate(r.fecha) + 'T00:00:00'); return d >= today && d <= weekEnd; });
  else if (currentFilter === 'pending') filtered = filtered.filter(r => r.pago !== 'pagado');

  if (filtered.length === 0) {
    $('reservasList').innerHTML = '';
    $('emptyState').classList.remove('hidden');
    return;
  }
  $('emptyState').classList.add('hidden');
  renderList(filtered);
}

function updateStats() {
  const todayStr = getBusinessDate();
  const today = new Date(todayStr + 'T00:00:00');
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
  const active = allReservas.filter(r => r.estado !== 'cancelada');
  const weekCount = active.filter(r => { const d = new Date(cleanDate(r.fecha) + 'T00:00:00'); return d >= today && d <= weekEnd; }).length;
  const todayCount = active.filter(r => cleanDate(r.fecha) === todayStr).length;
  const cancelCount = allReservas.filter(r => r.estado === 'cancelada').length;

  $('statWeek').textContent = weekCount;
  $('statToday').textContent = todayCount;
  $('statCancel').textContent = cancelCount;
  $('statIncome').textContent = '$' + (weekCount * 300).toLocaleString();
}

function updateNextBar() {
  const now = new Date();
  const todayStr = getBusinessDate();
  const active = allReservas.filter(r => r.estado !== 'cancelada');
  const upcoming = active.map(r => ({ ...r, ts: new Date(cleanDate(r.fecha) + 'T' + cleanTime(r.hora) + ':00').getTime() })).filter(r => r.ts >= now.getTime()).sort((a, b) => a.ts - b.ts)[0];
  if (!upcoming) { $('nextBar').classList.add('hidden'); return; }
  $('nextBar').classList.remove('hidden');
  const fechaStr = cleanDate(upcoming.fecha);
  const horaStr = cleanTime(upcoming.hora);
  const isToday = fechaStr === todayStr;
  $('nextText').textContent = `${isToday ? 'Hoy' : fechaStr} a las ${horaStr} — ${upcoming.nombre} (${upcoming.servicio || 'Sin servicio'})`;
  const telClean = (upcoming.whatsapp || '').replace(/\D/g, '');
  $('nextWA').href = telClean ? `https://wa.me/52${telClean}` : '#';
}

function findIndex(fecha, hora) {
  return allReservas.findIndex(r => cleanDate(r.fecha) === fecha && cleanTime(r.hora) === hora);
}

function renderList(reservas) {
  const list = $('reservasList');
  list.innerHTML = '';
  reservas.forEach((r) => {
    const isCancel = r.estado === 'cancelada';
    const badgeClass = isCancel ? 'badge-cancel' : 'badge-conf';
    const badgeText  = isCancel ? 'Cancelada' : 'Confirmada';
    const payBadge = r.pago === 'pagado' ? '<span class="badge badge-paid">Pagado</span>' : '<span class="badge badge-pending">Pago pend.</span>';
    const telClean = (r.whatsapp || '').replace(/\D/g, '');
    const fechaLimpia = cleanDate(r.fecha);
    const horaLimpia = cleanTime(r.hora);
    const idSafe = fechaLimpia + '-' + horaLimpia.replace(':', '-');

    const div = document.createElement('div');
    div.className = 'card-pastel p-5';
    div.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center gap-4">
        <div class="flex-shrink-0 min-w-[120px]">
          <div class="font-mono text-xl font-bold text-[#3D405B]">${fechaLimpia}</div>
          <div class="font-mono text-sm text-[#E07A5F] font-bold">${horaLimpia}</div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-bold text-[#3D405B] truncate">${r.nombre || 'Sin nombre'}</div>
          <div class="text-xs text-[#9A9590] mt-0.5">${r.servicio || 'Sin servicio'}</div>
          ${r.creado ? `<div class="text-[10px] text-[#9A9590] font-mono mt-1">Recibido: ${r.creado}</div>` : ''}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <span class="badge ${badgeClass}">${badgeText}</span>
          ${payBadge}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          ${telClean ? `<a href="https://wa.me/52${telClean}" target="_blank" class="btn-sm">WhatsApp →</a>` : ''}
          ${!isCancel ? `<button class="btn-sm btn-danger" onclick="cancelReserva('${fechaLimpia}', '${horaLimpia}')">Cancelar</button>` : ''}
        </div>
      </div>
      ${!isCancel ? `<div class="mt-3 pt-3 border-t border-[#E8E4DE]">
        <div class="flex items-center gap-2">
          <input type="checkbox" id="pay-${idSafe}" ${r.pago === 'pagado' ? 'checked' : ''} onchange="togglePay('${fechaLimpia}', '${horaLimpia}')" class="accent-[#E07A5F]"/>
          <label for="pay-${idSafe}" class="text-[10px] font-bold uppercase tracking-widest text-[#9A9590]">Anticipo pagado</label>
        </div>
        <textarea id="note-${idSafe}" class="mt-2 w-full bg-[#FDFCF8] border border-[#E8E4DE] rounded-lg p-2 text-xs text-[#3D405B] resize-none" rows="1" placeholder="Nota interna (ej. Alergia, llega tarde...)" onblur="saveNote('${fechaLimpia}', '${horaLimpia}')">${r.nota || ''}</textarea>
      </div>` : ''}
    `;
    list.appendChild(div);
  });
}

async function cancelReserva(fecha, hora) {
  if (!confirm('¿Cancelar esta reserva? El horario quedará libre.')) return;
  const isDemo = !CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.includes('TU_ID_AQUI');
  if (isDemo) {
    try {
      const stored = localStorage.getItem('agenda_reservas');
      let reservas = stored ? JSON.parse(stored) : [];
      reservas = reservas.map(r => { if (cleanDate(r.fecha) === fecha && cleanTime(r.hora) === hora) return { ...r, estado: 'cancelada' }; return r; });
      localStorage.setItem('agenda_reservas', JSON.stringify(reservas));
      allReservas = reservas;
      applyFilter(); updateStats(); updateNextBar();
    } catch (e) { console.error(e); }
    return;
  }
  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', redirect: 'follow', body: JSON.stringify({ accion: 'cancelar', fecha, hora }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    const json = await res.json();
    if (json.success) { loadReservas(); } else { alert('Error: ' + (json.error || 'desconocido')); }
  } catch (err) { alert('Error al cancelar: ' + err.message); }
}

async function togglePay(fecha, hora) {
  const idSafe = fecha + '-' + hora.replace(':', '-');
  const cb = document.getElementById('pay-' + idSafe);
  if (!cb) return;
  const idx = findIndex(fecha, hora);
  if (idx === -1) return;
  const isDemo = !CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.includes('TU_ID_AQUI');
  const nuevoEstado = cb.checked ? 'pagado' : 'pendiente';
  if (isDemo) {
    try {
      const stored = localStorage.getItem('agenda_reservas');
      let reservas = stored ? JSON.parse(stored) : [];
      if (reservas[idx]) { reservas[idx].pago = nuevoEstado; localStorage.setItem('agenda_reservas', JSON.stringify(reservas)); allReservas = reservas; applyFilter(); updateStats(); }
    } catch (e) { console.error(e); }
    return;
  }
  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', redirect: 'follow', body: JSON.stringify({ accion: 'pagar', fecha, hora, valor: nuevoEstado }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    const json = await res.json();
    if (json.success) { allReservas[idx].pago = nuevoEstado; applyFilter(); updateStats(); }
    else { cb.checked = !cb.checked; alert('Error: ' + (json.error || 'desconocido')); }
  } catch (err) { console.error('Error al actualizar pago:', err); cb.checked = !cb.checked; }
}

async function saveNote(fecha, hora) {
  const idSafe = fecha + '-' + hora.replace(':', '-');
  const ta = document.getElementById('note-' + idSafe);
  if (!ta) return;
  const idx = findIndex(fecha, hora);
  if (idx === -1) return;
  const isDemo = !CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.includes('TU_ID_AQUI');
  const nota = ta.value.trim();
  if (isDemo) {
    try {
      const stored = localStorage.getItem('agenda_reservas');
      let reservas = stored ? JSON.parse(stored) : [];
      if (reservas[idx]) { reservas[idx].nota = nota; localStorage.setItem('agenda_reservas', JSON.stringify(reservas)); }
    } catch (e) { console.error(e); }
    return;
  }
  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', redirect: 'follow', body: JSON.stringify({ accion: 'nota', fecha, hora, nota }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    const json = await res.json();
    if (json.success) { allReservas[idx].nota = nota; }
    else { alert('Error: ' + (json.error || 'desconocido')); }
  } catch (err) { console.error('Error al guardar nota:', err); }
}
