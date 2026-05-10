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

async function loadData() {
  renderLoading();
  const isDemo = !CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.includes('TU_ID_AQUI');

  try {
    if (isDemo) {
      console.warn('[DEMO] Usando datos de prueba.');
      await new Promise(r => setTimeout(r, 400));
      generateDemoData();
    } else {
      const res = await fetch(CONFIG.APPS_SCRIPT_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Error del servidor');
      parseReservas(json.values);
    }
  } catch (e) {
    console.warn('Fallo al cargar desde Sheets:', e.message);
    generateDemoData();
  }
  renderCalendar();
}

function parseReservas(rows) {
  if (!rows || rows.length < 2) { generateDemoData(); return; }
  slotsData = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const fecha  = (r[0] || '').toString().trim();
    const hora   = (r[1] || '').toString().trim();
    const estado = (r[5] || '').toString().trim().toLowerCase();
    if (!fecha || !hora) continue;
    if (!slotsData[fecha]) slotsData[fecha] = {};
    const isBusy = estado !== 'cancelada';
    slotsData[fecha][hora] = { status: isBusy ? 'busy' : 'free' };
  }
}

function generateDemoData() {
  slotsData = {};
  const today = new Date();
  const days = CONFIG.DAYS_AHEAD || 7;
  const slots = CONFIG.DEFAULT_SLOTS || ['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00'];
  for (let d = 0; d < days; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];
    slotsData[dateStr] = {};
    slots.forEach((slot, i) => {
      const busy = (d === 0 && i < 2) || (d === 1 && i === 4);
      slotsData[dateStr][slot] = { status: busy ? 'busy' : 'free' };
    });
  }
}

function renderCalendar() {
  const grid = $('calendarGrid');
  grid.innerHTML = '';
  const today = new Date();
  const diasSemana = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const days = CONFIG.DAYS_AHEAD || 7;
  const slots = CONFIG.DEFAULT_SLOTS || ['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00'];

  for (let d = 0; d < days; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];
    const daySlots = slotsData[dateStr] || {};

    const card = document.createElement('div');
    card.className = 'card-pastel p-5';
    let slotsHtml = '';
    slots.forEach(time => {
      const slot = daySlots[time] || { status: 'free' };
      const isBusy = slot.status === 'busy';
      slotsHtml += `<button class="slot-btn px-3 py-2 w-full text-center" ${isBusy ? 'disabled title="Ocupado"' : `onclick="selectSlot('${dateStr}','${time}')"`}>${time}</button>`;
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
  // El dueño marca pago desde el panel
  if (!nombre || !phone) return;

  const { date, time } = selectedSlot;
  const btn = $('reservaForm').querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  notifyWhatsApp(date, time, nombre, phone, servicio);

  const isDemo = !CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.includes('TU_ID_AQUI');

  if (isDemo) {
    if (!slotsData[date]) slotsData[date] = {};
    slotsData[date][time] = { status: 'busy' };
   saveToLocal(date, time, nombre, phone, servicio, 'pendiente');
    showSuccess();
    btn.disabled = false;
    btn.textContent = 'Confirmar Reserva';
    return;
  }

  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ fecha: date, hora: time, nombre, whatsapp: phone, servicio, pago: anticipo ? 'pagado' : 'pendiente' }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const text = await res.text();
    let json = { success: true };
    try { json = JSON.parse(text); } catch {}
    if (!json.success) throw new Error(json.error || 'Error al guardar');

    if (!slotsData[date]) slotsData[date] = {};
    slotsData[date][time] = { status: 'busy' };
    showSuccess();
  } catch (err) {
    console.error('POST falló:', err);
    alert('No se pudo guardar en la base de datos, pero ya enviamos WhatsApp al negocio.');
    if (!slotsData[date]) slotsData[date] = {};
    slotsData[date][time] = { status: 'busy' };
    showSuccess();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar Reserva';
  }
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
      fecha: date, hora: time, nombre, whatsapp: phone,
      servicio: servicio || '', estado: 'confirmada',
      creado: new Date().toISOString(),
      pago: pago || 'pendiente'
    });
    localStorage.setItem('agenda_reservas', JSON.stringify(reservas));
  } catch (e) { console.error('localStorage falló:', e); }
}

function showSuccess() {
  $('formActive').classList.add('hidden');
  $('formSuccess').classList.remove('hidden');
  renderCalendar();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}