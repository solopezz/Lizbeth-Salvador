const CONFIG = {
  weddingDate: '2027-04-17T17:00:00-06:00',
  mapsUrl: 'https://maps.google.com',
  apiUrl: 'https://script.google.com/macros/s/AKfycbw0pGZaY0tQTW7lIv2pjQlY-M-PdEows91eaB_M44LQkRqEYxpmiL_Ur-3eAklfayY/exec',
};

const params = new URLSearchParams(window.location.search);
const inviteId = (params.get('id') || 'DEMO').trim().toUpperCase();

let guest = {
  id: 'DEMO',
  name: 'Invitado de prueba',
  reservedSeats: 2,
  status: 'PENDIENTE',
  attendees: 0,
};

const greeting = document.getElementById('guestGreeting');
const attendees = document.getElementById('attendees');
const spotsHelp = document.getElementById('spotsHelp');
const form = document.getElementById('rsvpForm');
const formMessage = document.getElementById('formMessage');
const submitButton = document.getElementById('submitButton');
const attendanceField = document.getElementById('attendanceField');
const statusInputs = [...document.querySelectorAll('input[name="status"]')];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function renderGuest() {
  const spots = Math.max(1, Number(guest.reservedSeats) || 1);

  greeting.textContent = spots === 1
    ? `${guest.name}, hemos reservado 1 lugar para ti.`
    : `${guest.name}, hemos reservado ${spots} lugares para ustedes.`;

  attendees.innerHTML = '';
  for (let i = 1; i <= spots; i++) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = String(i);
    attendees.appendChild(option);
  }

  spotsHelp.textContent = `Máximo permitido: ${spots}`;

  if (guest.status === 'CONFIRMADO') {
    const yes = statusInputs.find(i => i.value === 'Confirmado');
    if (yes) yes.checked = true;
    attendees.value = String(Math.min(spots, Math.max(1, Number(guest.attendees) || 1)));
  } else if (guest.status === 'NO_ASISTE') {
    const no = statusInputs.find(i => i.value === 'No asistirá');
    if (no) no.checked = true;
  }

  syncAttendance();
}

function syncAttendance() {
  const selected = document.querySelector('input[name="status"]:checked');
  const isNo = selected && selected.value === 'No asistirá';
  attendanceField.style.display = isNo ? 'none' : 'block';
}

statusInputs.forEach(input => input.addEventListener('change', syncAttendance));

function loadGuestWithJsonp() {
  return new Promise((resolve, reject) => {
    if (!CONFIG.apiUrl || inviteId === 'DEMO') {
      resolve(guest);
      return;
    }

    const callbackName = `__weddingGuest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const timeout = setTimeout(() => finish(new Error('Tiempo de espera agotado.')), 10000);

    function finish(error, data) {
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
      error ? reject(error) : resolve(data);
    }

    window[callbackName] = data => {
      if (!data || !data.ok || !data.guest) {
        finish(new Error(data?.message || 'No encontramos esta invitación.'));
        return;
      }
      finish(null, data.guest);
    };

    const url = new URL(CONFIG.apiUrl);
    url.searchParams.set('action', 'invite');
    url.searchParams.set('id', inviteId);
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('_', Date.now().toString());
    script.src = url.toString();
    script.onerror = () => finish(new Error('No se pudo conectar con el RSVP.'));
    document.head.appendChild(script);
  });
}

async function initializeInvitation() {
  if (!CONFIG.apiUrl) {
    formMessage.textContent = 'Modo demo: todavía falta conectar Google Sheets.';
    renderGuest();
    return;
  }

  if (inviteId === 'DEMO') {
    formMessage.textContent = 'Modo de prueba. Usa un enlace de invitado para probar el RSVP real.';
    renderGuest();
    return;
  }

  formMessage.textContent = 'Cargando tu invitación...';
  submitButton.disabled = true;

  try {
    guest = await loadGuestWithJsonp();
    formMessage.textContent = '';
    renderGuest();
  } catch (error) {
    greeting.textContent = 'No pudimos encontrar esta invitación.';
    formMessage.textContent = error.message || 'Revisa que el enlace esté completo.';
    form.style.opacity = '.55';
    form.style.pointerEvents = 'none';
  } finally {
    submitButton.disabled = false;
  }
}

function sendRsvpPost(payload) {
  const iframeName = `rsvpTarget_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const iframe = document.createElement('iframe');
  iframe.name = iframeName;
  iframe.style.display = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const postForm = document.createElement('form');
  postForm.method = 'POST';
  postForm.action = CONFIG.apiUrl;
  postForm.target = iframeName;
  postForm.style.display = 'none';

  Object.entries(payload).forEach(([key, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = String(value ?? '');
    postForm.appendChild(input);
  });

  document.body.appendChild(postForm);
  postForm.submit();
  postForm.remove();

  return () => setTimeout(() => iframe.remove(), 100);
}

async function verifySavedRsvp(payload) {
  const expectedAttendees = payload.status === 'CONFIRMADO' ? Number(payload.attendees) : 0;
  let lastError = null;

  for (let attempt = 0; attempt < 12; attempt++) {
    await sleep(attempt === 0 ? 700 : 500);

    try {
      const latest = await loadGuestWithJsonp();
      const sameStatus = latest.status === payload.status;
      const sameAttendees = Number(latest.attendees || 0) === expectedAttendees;

      if (sameStatus && sameAttendees) {
        return latest;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No pudimos verificar la respuesta guardada. Intenta recargar la página.');
}

async function submitRsvpToAppsScript(payload) {
  const cleanupIframe = sendRsvpPost(payload);

  try {
    return await verifySavedRsvp(payload);
  } finally {
    cleanupIframe();
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();

  const selected = document.querySelector('input[name="status"]:checked');
  if (!selected) {
    formMessage.textContent = 'Selecciona si podrás acompañarnos.';
    return;
  }

  const status = selected.value === 'Confirmado' ? 'CONFIRMADO' : 'NO_ASISTE';
  const payload = {
    id: inviteId,
    status,
    attendees: status === 'CONFIRMADO' ? Number(attendees.value) : 0,
    message: document.getElementById('message').value.trim(),
  };

  submitButton.disabled = true;
  submitButton.textContent = 'Guardando...';
  formMessage.textContent = 'Estamos registrando tu respuesta...';

  try {
    if (!CONFIG.apiUrl || inviteId === 'DEMO') {
      await sleep(450);
      localStorage.setItem(`rsvp-${inviteId}`, JSON.stringify(payload));
      formMessage.textContent = 'Respuesta guardada en modo demo.';
    } else {
      const latest = await submitRsvpToAppsScript(payload);
      guest = { ...guest, ...latest };
      renderGuest();
      formMessage.textContent = status === 'CONFIRMADO'
        ? '¡Gracias por confirmar! Nos emociona compartir este día contigo.'
        : 'Gracias por avisarnos. Te tendremos presente en este día especial.';
    }
  } catch (error) {
    formMessage.textContent = error.message || 'No pudimos verificar tu respuesta. Recarga la página antes de volver a enviarla.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Guardar respuesta';
  }
});

function tick() {
  const target = new Date(CONFIG.weddingDate).getTime();
  const diff = Math.max(0, target - Date.now());

  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000) % 24;
  const m = Math.floor(diff / 60000) % 60;
  const s = Math.floor(diff / 1000) % 60;

  document.getElementById('days').textContent = d;
  document.getElementById('hours').textContent = String(h).padStart(2, '0');
  document.getElementById('minutes').textContent = String(m).padStart(2, '0');
  document.getElementById('seconds').textContent = String(s).padStart(2, '0');
}

tick();
setInterval(tick, 1000);

document.getElementById('mapsButton').href = CONFIG.mapsUrl;

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

initializeInvitation();
