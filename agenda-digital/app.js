const $ = (id) => document.getElementById(id);

let slotsData = {};
let selectedSlot = null;

function init() {
  if (CONFIG.BUSINESS) {
    const hb = $('headerBusiness');
    if (hb) hb.textContent = CONFIG.BUSINESS;
  }
  $('btnRefresh').addEventListener('click', loadData);
  $('reservaForm').addEventListener('submit', onSubmit);
  $('btnNueva').addEventListener('click', resetForm);
  loadData();
}

function getBusinessDate() {
  const tz = CONFIG.TIMEZONE || 'America/Mexico_City';
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return dtf.format(new Date());
}

function formatBusinessDate(d) {
  const tz = CONFIG.TIMEZONE || 'America/Mexico_City';
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return dtf.format(d);
}

function getBusinessTime() {
  const tz = CONFIG.TIMEZONE || 'America/Mexico_City';
  const dtf = new Intl.DateTimeFormat('en', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = dtf.formatToParts(new Date());
  let hh = '', mm = '';
  for (const p of parts) {
    if (p.type === 'hour') hh = p.value;
    if (p.type === 'minute') mm = p.value;
  }
  return hh.padStart(2, '0') + ':' + mm.padStart(2, '0');
}

function loadData() {
  renderLoading();
  slotsData = {};
  fetchSheetData().then(() => renderCalendar());
}

async function fetchSheetData() {
  const isDemo = !CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.includes('TU_ID_AQUI');
  if (isDemo) {
    loadFromLocal();
    return;
  }
  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL + '?t=' + Date.now(), { cache: 'no-store' });
    const json = await res.json();
    if (json.success && json.values) {
      const rows = json.values;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const fecha = String(r[0] || '').trim().replace(/^'/, '');
        const hora = String(r[1] || '').trim().replace(/^'/, '').substring(0, 5);
        const estado = String(r[5] || '').trim().toLowerCase();
        if (!fecha || !hora) continue;
        if (estado === 'cancelada') {
          if (slotsData[fecha]) delete slotsData[fecha][hora];
          continue;
        }
        if (!slotsData[fecha]) slotsData[fecha] = {};
        slotsData[fecha][hora] = { status: 'busy' };
      }
    } else {
      console.warn('Sheet devolvió error:', json.error);
      loadFromLocal();
    }
  } catch (e) {
    console.warn('Fallo Sheet, usando local:', e.message);
    loadFromLocal();
  }
}

function loadFromLocal() {
  try {
    const stored = localStorage.getItem('agenda_reservas');
    if (!stored) return;
    const reservas = JSON.parse(stored);
    reservas.forEach(r => {
      if (!r.fecha || !r.hora) return;
      if (r.estado === 'cancelada') {
        if (slotsData[r.fecha]) delete slotsData[r.fecha][r.hora.substring(0, 5)];
        return;
      }
      if (!slotsData[r.fecha]) slotsData[r.fecha] = {};
      slotsData[r.fecha][r.hora.substring(0, 5)] = { status: 'busy' };
    });
  } catch (e) { console.error(e); }
}

function isSlotPast(dateStr, timeStr) {
  const todayStr = getBusinessDate();
  if (dateStr !== todayStr) return false;
  const nowTime = getBusinessTime();
  return timeStr < nowTime;
}

function renderCalendar() {
  const grid = $('calendarGrid');
  grid.innerHTML = '';
  const now = new Date();
  const diasSemana = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const days = CONFIG.DAYS_AHEAD || 7;
  const slots = CONFIG.DEFAULT_SLOTS || ['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00'];

  for (let d = 0; d < days; d++) {
    const date = new Date(now);
    date.setDate(now.getDate() + d);
    const dateStr = formatBusinessDate(date);
    const daySlots = slotsData[dateStr] || {};

    const card = document.createElement('div');
    card.className = 'card-pastel p-5';
    let slotsHtml = '';
    slots.forEach(time => {
      const slot = daySlots[time] || { status: 'free' };
      const isBusy = slot.status === 'busy';
      const isPast = isSlotPast(dateStr, time);
      if (isBusy) {
        slotsHtml += `<button class="slot-btn px-3 py-2 w-full text-center opacity-40 cursor-not-allowed" disabled title="Ocupado">${time}</button>`;
      } else if (isPast) {
        slotsHtml += `<button class="slot-btn px-3 py-2 w-full text-center opacity-30 cursor-not-allowed" disabled title="Horario cerrado">${time}</button>`;
      } else {
        slotsHtml += `<button class="slot-btn px-3 py-2 w-full text-center" onclick="selectSlot('${dateStr}','${time}')">${time}</button>`;
      }
    });

    card.innerHTML = `
      <div class="flex items-baseline justify-between mb-3">
        <div>
          <div class="day-label">${d === 0 ? 'Hoy' : diasSemana[date.getDay()]}</div>
          <div class="day-num">${date.getDate()}</div>
        </div>
        <div class="text-xs text-[#9A9590] font-mono font-bold uppercase">${meses[date.getMonth()]} ${date.getFullYear()}</div>
      </div>
      <div class="grid grid-cols-2 gap-2">${slotsHtml}</div>`;
    grid.appendChild(card);
  }
}

function renderLoading() {
  const grid = $('calendarGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const div = document.createElement('div');
    div.className = 'card-pastel p-5 space-y-3';
    div.innerHTML = `
      <div class="loading-shimmer h-6 w-24"></div>
      <div class="loading-shimmer h-8 w-16"></div>
      <div class="grid grid-cols-2 gap-2 mt-4">
        <div class="loading-shimmer h-10 w-full"></div>
        <div class="loading-shimmer h-10 w-full"></div>
        <div class="loading-shimmer h-10 w-full"></div>
        <div class="loading-shimmer h-10 w-full"></div>
      </div>`;
    grid.appendChild(div);
  }
}

function selectSlot(date, time) {
  selectedSlot = { date, time };
  const dateObj = new Date(date + 'T00:00:00');
  const diasSemana = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  $('selFecha').textContent = `${diasSemana[dateObj.getDay()]}, ${dateObj.getDate()} ${meses[dateObj.getMonth()]}`;
  $('selHora').textContent = time;

  $('formEmpty').classList.add('hidden');
  $('formActive').classList.remove('hidden');
  $('formSuccess').classList.add('hidden');

  const msg = `Hola, quiero reservar una cita para el ${dateObj.getDate()}/${dateObj.getMonth()+1} a las ${time} en ${CONFIG.BUSINESS}.`;
  $('btnWAPre').href = `https://wa.me/${CONFIG.PHONE}?text=${encodeURIComponent(msg)}`;
}

function resetForm() {
  selectedSlot = null;
  $('reservaForm').reset();
  $('formEmpty').classList.remove('hidden');
  $('formActive').classList.add('hidden');
  $('formSuccess').classList.add('hidden');
}

async function onSubmit(e) {
  e.preventDefault();
  if (!selectedSlot) return;

  const nombre = $('inpNombre').value.trim();
  const phone = $('inpWhatsApp').value.trim();
  const servicio = $('inpServicio').value.trim();
  if (!nombre || !phone) return;

  const { date, time } = selectedSlot;
  const btn = $('reservaForm').querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  // 1. Notificar WhatsApp inmediatamente
  notifyWhatsApp(date, time, nombre, phone, servicio);

  // 2. Guardar en localStorage como respaldo
  saveToLocal(date, time, nombre, phone, servicio, 'pendiente');

  // 3. Marcar slot ocupado localmente
  if (!slotsData[date]) slotsData[date] = {};
  slotsData[date][time] = { status: 'busy' };
  renderCalendar();

  // 4. Intentar guardar en Sheet (primordial)
  let sheetOk = false;
  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({
        fecha: date,
        hora: time,
        nombre: nombre,
        whatsapp: phone,
        servicio: servicio || '',
        pago: 'pendiente'
      }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const json = await res.json();
    if (json.success) {
      sheetOk = true;
      console.log('Guardado en Sheet OK');
    } else {
      console.warn('Sheet error:', json.error);
    }
  } catch (err) {
    console.warn('Sheet POST falló:', err.message);
  }

  if (!sheetOk) {
    alert('⚠️ Reserva guardada localmente pero NO llegó al Sheet. Revisa tu conexión o la URL del Apps Script.');
  }

  showSuccess();
  btn.disabled = false;
  btn.textContent = 'Confirmar Reserva';
}

function notifyWhatsApp(date, time, nombre, phone, servicio) {
  const msg = `*Nueva reserva - ${CONFIG.BUSINESS}*\n\n` +
    `*Fecha:* ${date}\n` +
    `*Hora:* ${time}\n` +
    `*Cliente:* ${nombre}\n` +
    `*WhatsApp:* ${phone}\n` +
    (servicio ? `*Servicio:* ${servicio}\n` : '') +
    `\nPara confirmar, responde por WhatsApp.`;
  window.open(`https://wa.me/${CONFIG.PHONE}?text=${encodeURIComponent(msg)}`, '_blank');
}

function saveToLocal(date, time, nombre, phone, servicio, pago) {
  try {
    const stored = localStorage.getItem('agenda_reservas');
    const reservas = stored ? JSON.parse(stored) : [];
    reservas.push({
      fecha: date,
      hora: time,
      nombre: nombre,
      whatsapp: phone,
      servicio: servicio || '',
      estado: 'confirmada',
      creado: new Date().toLocaleString('es-MX', { timeZone: CONFIG.TIMEZONE || 'America/Mexico_City' }),
      pago: pago || 'pendiente'
    });
    localStorage.setItem('agenda_reservas', JSON.stringify(reservas));
  } catch (e) { console.error('localStorage falló:', e); }
}

function showSuccess() {
  $('formActive').classList.add('hidden');
  $('formSuccess').classList.remove('hidden');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
