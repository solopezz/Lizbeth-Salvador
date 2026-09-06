const CONFIG = {
  weddingDate: '2027-04-24T13:00:00-06:00',
  ceremonyMap: 'https://www.google.com/maps/search/?api=1&query=Iglesia+de+Santo+Domingo%2C+Genaro+Codina+722%2C+Zacatecas+Centro%2C+98000+Zacatecas%2C+Zac.',
  receptionMap: 'https://www.google.com/maps/search/?api=1&query=Grand+Casa+Torres%2C+Pzla.+de+Santo+Domingo+518%2C+Zacatecas+Centro%2C+98000+Zacatecas%2C+Zac.',
  apiUrl: 'https://script.google.com/macros/s/AKfycbw0pGZaY0tQTW7lIv2pjQlY-M-PdEows91eaB_M44LQkRqEYxpmiL_Ur-3eAklfayY/exec',
};

const params = new URLSearchParams(window.location.search);
const inviteId = (params.get('id') || 'DEMO').trim().toUpperCase();
let guest = { id: 'DEMO', name: 'Invitado especial', reservedSeats: 2, status: 'PENDIENTE', attendees: 0 };

const gate = document.getElementById('inviteGate');
const gateGuest = document.getElementById('gateGuest');
const openInviteButton = document.getElementById('openInviteButton');
const greeting = document.getElementById('guestGreeting');
const attendees = document.getElementById('attendees');
const spotsHelp = document.getElementById('spotsHelp');
const form = document.getElementById('rsvpForm');
const formMessage = document.getElementById('formMessage');
const submitButton = document.getElementById('submitButton');
const attendanceField = document.getElementById('attendanceField');
const statusInputs = [...document.querySelectorAll('input[name="status"]')];

document.getElementById('ceremonyMap').href = CONFIG.ceremonyMap;
document.getElementById('receptionMap').href = CONFIG.receptionMap;

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

function renderGuest(){
  const spots = Math.max(1, Number(guest.reservedSeats) || 1);
  if (inviteId !== 'DEMO') gateGuest.textContent = `Para ${guest.name}`;
  greeting.textContent = spots === 1
    ? `${guest.name}, hemos reservado 1 lugar especialmente para ti.`
    : `${guest.name}, hemos reservado ${spots} lugares especialmente para ustedes.`;

  attendees.innerHTML = '';
  for(let i=1;i<=spots;i++){
    const option=document.createElement('option');
    option.value=String(i); option.textContent=String(i); attendees.appendChild(option);
  }
  spotsHelp.textContent=`Máximo permitido: ${spots}`;

  statusInputs.forEach(i => i.checked = false);
  if(guest.status==='CONFIRMADO'){
    const yes=statusInputs.find(i=>i.value==='Confirmado'); if(yes) yes.checked=true;
    attendees.value=String(Math.min(spots,Math.max(1,Number(guest.attendees)||1)));
    formMessage.textContent='Ya habías confirmado. Puedes actualizar tu respuesta si tus planes cambian.';
  }else if(guest.status==='NO_ASISTE'){
    const no=statusInputs.find(i=>i.value==='No asistirá'); if(no) no.checked=true;
    formMessage.textContent='Ya habías indicado que no asistirías. Puedes actualizar tu respuesta si cambian tus planes.';
  }
  syncAttendance();
}

function syncAttendance(){
  const selected=document.querySelector('input[name="status"]:checked');
  attendanceField.style.display=selected&&selected.value==='No asistirá'?'none':'block';
}
statusInputs.forEach(input=>input.addEventListener('change',syncAttendance));

function loadGuestWithJsonp(){
  return new Promise((resolve,reject)=>{
    if(!CONFIG.apiUrl||inviteId==='DEMO'){ resolve(guest); return; }
    const callbackName=`__weddingGuest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script=document.createElement('script');
    const timeout=setTimeout(()=>finish(new Error('Tiempo de espera agotado.')),10000);
    function finish(error,data){ clearTimeout(timeout); delete window[callbackName]; script.remove(); error?reject(error):resolve(data); }
    window[callbackName]=data=>{
      if(!data||!data.ok||!data.guest){ finish(new Error(data?.message||'No encontramos esta invitación.')); return; }
      finish(null,data.guest);
    };
    const url=new URL(CONFIG.apiUrl);
    url.searchParams.set('action','invite'); url.searchParams.set('id',inviteId); url.searchParams.set('callback',callbackName); url.searchParams.set('_',Date.now().toString());
    script.src=url.toString(); script.onerror=()=>finish(new Error('No se pudo conectar con el RSVP.')); document.head.appendChild(script);
  });
}

async function initializeInvitation(){
  if(inviteId==='DEMO'){ renderGuest(); formMessage.textContent='Modo de prueba. Usa un enlace personalizado para probar el RSVP real.'; return; }
  try{ guest=await loadGuestWithJsonp(); renderGuest(); }
  catch(error){ gateGuest.textContent='Nuestra invitación'; greeting.textContent='No pudimos encontrar esta invitación.'; formMessage.textContent=error.message||'Revisa que el enlace esté completo.'; form.style.opacity='.55'; form.style.pointerEvents='none'; }
}

function openInvitation(){
  openInviteButton.disabled=true;
  gate.classList.add('is-opening');
  setTimeout(()=>{ gate.classList.add('is-open'); document.body.classList.remove('invite-locked'); },1050);
}
openInviteButton.addEventListener('click',openInvitation);

function sendRsvpPost(payload){
  const iframeName=`rsvpTarget_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const iframe=document.createElement('iframe'); iframe.name=iframeName; iframe.style.display='none'; iframe.setAttribute('aria-hidden','true'); document.body.appendChild(iframe);
  const postForm=document.createElement('form'); postForm.method='POST'; postForm.action=CONFIG.apiUrl; postForm.target=iframeName; postForm.style.display='none';
  Object.entries(payload).forEach(([key,value])=>{ const input=document.createElement('input'); input.type='hidden'; input.name=key; input.value=String(value??''); postForm.appendChild(input); });
  document.body.appendChild(postForm); postForm.submit(); postForm.remove();
  return()=>setTimeout(()=>iframe.remove(),100);
}

async function verifySavedRsvp(payload){
  const expectedAttendees=payload.status==='CONFIRMADO'?Number(payload.attendees):0; let lastError=null;
  for(let attempt=0;attempt<12;attempt++){
    await sleep(attempt===0?700:500);
    try{ const latest=await loadGuestWithJsonp(); if(latest.status===payload.status&&Number(latest.attendees||0)===expectedAttendees) return latest; }
    catch(error){ lastError=error; }
  }
  throw lastError||new Error('No pudimos verificar la respuesta guardada. Recarga la página antes de intentarlo otra vez.');
}

async function submitRsvpToAppsScript(payload){ const cleanup=sendRsvpPost(payload); try{return await verifySavedRsvp(payload);}finally{cleanup();} }

form.addEventListener('submit',async event=>{
  event.preventDefault();
  const selected=document.querySelector('input[name="status"]:checked');
  if(!selected){ formMessage.textContent='Selecciona si podrás acompañarnos.'; return; }
  const status=selected.value==='Confirmado'?'CONFIRMADO':'NO_ASISTE';
  const payload={id:inviteId,status,attendees:status==='CONFIRMADO'?Number(attendees.value):0,message:document.getElementById('message').value.trim()};
  submitButton.disabled=true; submitButton.textContent='Guardando...'; formMessage.textContent='Estamos registrando tu respuesta...';
  try{
    if(!CONFIG.apiUrl||inviteId==='DEMO'){ await sleep(450); localStorage.setItem(`rsvp-${inviteId}`,JSON.stringify(payload)); formMessage.textContent='Respuesta guardada en modo de prueba.'; }
    else{ const latest=await submitRsvpToAppsScript(payload); guest={...guest,...latest}; renderGuest(); formMessage.textContent=status==='CONFIRMADO'?'¡Gracias por confirmar! Nos emociona compartir este día contigo.':'Gracias por avisarnos. Te tendremos presente en este día especial.'; }
  }catch(error){ formMessage.textContent=error.message||'No pudimos verificar tu respuesta. Recarga la página antes de volver a enviarla.'; }
  finally{ submitButton.disabled=false; submitButton.textContent='Guardar respuesta'; }
});

function tick(){
  const target=new Date(CONFIG.weddingDate).getTime(); const diff=Math.max(0,target-Date.now());
  const d=Math.floor(diff/86400000),h=Math.floor(diff/3600000)%24,m=Math.floor(diff/60000)%60,s=Math.floor(diff/1000)%60;
  document.getElementById('days').textContent=d; document.getElementById('hours').textContent=String(h).padStart(2,'0'); document.getElementById('minutes').textContent=String(m).padStart(2,'0'); document.getElementById('seconds').textContent=String(s).padStart(2,'0');
}
tick(); setInterval(tick,1000);

const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)entry.target.classList.add('visible')}),{threshold:.1});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
initializeInvitation();
