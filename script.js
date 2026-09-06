const CONFIG = {
  weddingDate: '2027-04-17T17:00:00-06:00',
  mapsUrl: 'https://maps.google.com',

  // Pega aquí la URL /exec de Google Apps Script cuando la tengamos.
  apiUrl: '',
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
    formMessage.textContent = 'Ya habías confirmado. Puedes modificar tu respuesta si lo necesitas.';
  } else if (guest.status === 'NO_ASISTE') {
    const no = statusInputs.find(i => i.value === 'No asistirá');
    if (no) no.checked = true;
    formMessage.textContent = 'Ya habías indicado que no asistirías. Puedes modificar tu respuesta si cambian tus planes.';
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

function submitRsvpToAppsScript(payload) {
  return new Promise((resolve, reject) => {
    const iframeName = `rsvpTarget_${Date.now()}`;
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

    const timer = setTimeout(() => cleanup(new Error('El servidor tardó demasiado en responder.')), 12000);

    function onMessage(event) {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!data || data.source !== 'wedding-rsvp') return;

      if (data.ok) cleanup(null, data);
      else cleanup(new Error(data.message || 'No se pudo guardar la respuesta.'));
    }

    function cleanup(error, data) {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      postForm.remove();
      setTimeout(() => iframe.remove(), 100);
      error ? reject(error) : resolve(data);
    }

    window.addEventListener('message', onMessage);
    postForm.submit();
  });
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
  formMessage.textContent = '';

  try {
    if (!CONFIG.apiUrl || inviteId === 'DEMO') {
      await new Promise(resolve => setTimeout(resolve, 450));
      localStorage.setItem(`rsvp-${inviteId}`, JSON.stringify(payload));
      formMessage.textContent = 'Respuesta guardada en modo demo. Al conectar Google Sheets se actualizará automáticamente.';
    } else {
      const result = await submitRsvpToAppsScript(payload);
      guest.status = status;
      guest.attendees = payload.attendees;
      formMessage.textContent = result.message || '¡Gracias! Tu respuesta fue registrada correctamente.';
    }
  } catch (error) {
    formMessage.textContent = error.message || 'No pudimos guardar tu respuesta. Intenta de nuevo.';
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
