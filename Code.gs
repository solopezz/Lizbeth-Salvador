/**
 * Backend RSVP — Lizbeth & Salvador
 * Google Apps Script vinculado a un Google Sheet.
 *
 * Flujo:
 *  - GitHub Pages carga la invitación por ID usando JSONP (evita CORS).
 *  - El formulario RSVP se envía a un iframe oculto mediante POST normal.
 *  - Apps Script actualiza la fila correspondiente y responde con postMessage.
 */

const SHEET_INVITADOS = 'Invitados';
const SHEET_RESUMEN = 'Resumen';
const DEFAULT_PUBLIC_SITE_URL = 'https://solopezz.github.io/Lizbeth-Salvador/';

const COL = {
  ID: 1,
  NOMBRE: 2,
  LUGARES: 3,
  ESTADO: 4,
  ASISTENTES: 5,
  FECHA: 6,
  TELEFONO: 7,
  MENSAJE: 8,
  ENLACE: 9,
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💍 Boda RSVP')
    .addItem('1. Preparar hojas', 'setupProject')
    .addItem('2. Generar IDs faltantes', 'generateInviteIds')
    .addItem('3. Guardar URL del sitio', 'setPublicSiteUrl')
    .addItem('4. Generar enlaces', 'generateInviteLinks')
    .addToUi();
}

/**
 * GET público.
 * ?action=invite&id=ABC&callback=miFuncion devuelve JSONP.
 */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};

    if (p.action === 'invite') {
      const callback = validateCallback_(p.callback || 'weddingRsvpCallback');
      const result = loadInvitation_(p.id || '');
      return jsonp_(callback, result);
    }

    return ContentService
      .createTextOutput('RSVP Lizbeth & Salvador: API activa')
      .setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    const callback = validateCallback_((e && e.parameter && e.parameter.callback) || 'weddingRsvpCallback');
    return jsonp_(callback, { ok: false, message: 'No se pudo cargar la invitación.' });
  }
}

/**
 * POST desde el formulario del sitio.
 * Recibe application/x-www-form-urlencoded para evitar problemas CORS.
 */
function doPost(e) {
  let result;

  try {
    const p = (e && e.parameter) || {};
    result = saveRsvp_({
      id: p.id,
      status: p.status,
      attendees: p.attendees,
      message: p.message,
    });
  } catch (err) {
    result = { ok: false, message: err && err.message ? err.message : 'No se pudo guardar la respuesta.' };
  }

  // La respuesta se carga en un iframe oculto del sitio y avisa a la página padre.
  const payload = JSON.stringify({
    source: 'wedding-rsvp',
    ok: !!result.ok,
    message: result.message || (result.ok ? 'Respuesta guardada.' : 'No se pudo guardar la respuesta.'),
    status: result.status || '',
    attendees: Number(result.attendees || 0),
  }).replace(/</g, '\\u003c');

  return HtmlService.createHtmlOutput(
    '<!doctype html><html><body><script>' +
    'window.parent.postMessage(' + payload + ', "*");' +
    '</script></body></html>'
  );
}

/**
 * Ejecutar UNA VEZ desde Apps Script vinculado al Google Sheet.
 * Es seguro volver a ejecutarlo: no borra la lista existente.
 */
function setupProject() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abre Apps Script desde Extensiones → Apps Script dentro del Google Sheet.');

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());

  let sheet = ss.getSheetByName(SHEET_INVITADOS);
  if (!sheet) sheet = ss.insertSheet(SHEET_INVITADOS);

  const headers = [
    'ID', 'INVITACIÓN / FAMILIA', 'LUGARES', 'ESTADO', 'ASISTENTES',
    'FECHA CONFIRMACIÓN', 'TELÉFONO', 'MENSAJE', 'ENLACE'
  ];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(2, 1, 1, headers.length).setValues([
      ['', 'Invitado de prueba', 2, 'PENDIENTE', '', '', '', '', '']
    ]);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sheet.setFrozenRows(1);
  sheet.getRange('C2:C').setNumberFormat('0');
  sheet.getRange('E2:E').setNumberFormat('0');
  sheet.getRange('F2:F').setNumberFormat('dd/MM/yyyy HH:mm');
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 240);
  sheet.setColumnWidth(3, 90);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 100);
  sheet.setColumnWidth(6, 170);
  sheet.setColumnWidth(7, 140);
  sheet.setColumnWidth(8, 280);
  sheet.setColumnWidth(9, 430);

  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#6E5D4B')
    .setFontColor('#FFFFFF');

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['PENDIENTE', 'CONFIRMADO', 'NO_ASISTE'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange('D2:D').setDataValidation(statusRule);

  setupSummary_(ss);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PUBLIC_SITE_URL')) {
    props.setProperty('PUBLIC_SITE_URL', DEFAULT_PUBLIC_SITE_URL);
  }

  generateInviteIds();
  generateInviteLinks();

  SpreadsheetApp.getUi().alert(
    'Listo. Se prepararon Invitados y Resumen. Puedes reemplazar la fila de prueba por tus invitados.'
  );
}

function setupSummary_(ss) {
  let sheet = ss.getSheetByName(SHEET_RESUMEN);
  if (!sheet) sheet = ss.insertSheet(SHEET_RESUMEN);
  sheet.clear();

  sheet.getRange('A1:B1').setValues([['RESUMEN RSVP', 'TOTAL']]);
  sheet.getRange('A2:A7').setValues([
    ['Invitaciones'],
    ['Personas invitadas'],
    ['Personas confirmadas'],
    ['Invitaciones pendientes'],
    ['Invitaciones que no asistirán'],
    ['Lugares pendientes de respuesta'],
  ]);

  sheet.getRange('B2').setFormula('=COUNTA(Invitados!B2:B)');
  sheet.getRange('B3').setFormula('=SUM(Invitados!C2:C)');
  sheet.getRange('B4').setFormula('=SUMIF(Invitados!D2:D,"CONFIRMADO",Invitados!E2:E)');
  sheet.getRange('B5').setFormula('=COUNTIF(Invitados!D2:D,"PENDIENTE")');
  sheet.getRange('B6').setFormula('=COUNTIF(Invitados!D2:D,"NO_ASISTE")');
  sheet.getRange('B7').setFormula('=SUMIF(Invitados!D2:D,"PENDIENTE",Invitados!C2:C)');

  sheet.getRange('A1:B1')
    .setFontWeight('bold')
    .setBackground('#6E5D4B')
    .setFontColor('#FFFFFF');
  sheet.getRange('A1:B7').setBorder(true, true, true, true, true, true);
  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 120);
}

function loadInvitation_(inviteId) {
  const id = normalizeInviteId_(inviteId);
  if (!id) return { ok: false, message: 'La invitación no contiene un ID válido.' };

  const found = findInviteRow_(id);
  if (!found) return { ok: false, message: 'No encontramos esta invitación.' };

  const v = found.values;
  return {
    ok: true,
    guest: {
      id: String(v[COL.ID - 1]),
      name: String(v[COL.NOMBRE - 1] || 'Invitado'),
      reservedSeats: Math.max(1, Number(v[COL.LUGARES - 1]) || 1),
      status: String(v[COL.ESTADO - 1] || 'PENDIENTE'),
      attendees: Number(v[COL.ASISTENTES - 1] || 0),
    },
  };
}

function saveRsvp_(payload) {
  const id = normalizeInviteId_(payload.id);
  if (!id) throw new Error('ID de invitación inválido.');

  const status = String(payload.status || '').toUpperCase();
  if (!['CONFIRMADO', 'NO_ASISTE'].includes(status)) {
    throw new Error('Selecciona si podrás asistir.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const found = findInviteRow_(id);
    if (!found) throw new Error('Invitación no encontrada.');

    const reservedSeats = Math.max(1, Number(found.values[COL.LUGARES - 1]) || 1);
    let attendees = Number(payload.attendees || 0);

    if (status === 'NO_ASISTE') {
      attendees = 0;
    } else if (!Number.isInteger(attendees) || attendees < 1 || attendees > reservedSeats) {
      throw new Error('El número de asistentes no coincide con los lugares reservados.');
    }

    const message = String(payload.message || '').trim().slice(0, 500);
    const row = found.row;
    const sheet = found.sheet;

    sheet.getRange(row, COL.ESTADO).setValue(status);
    sheet.getRange(row, COL.ASISTENTES).setValue(attendees);
    sheet.getRange(row, COL.FECHA).setValue(new Date());
    sheet.getRange(row, COL.MENSAJE).setValue(message);
    SpreadsheetApp.flush();

    return {
      ok: true,
      status,
      attendees,
      message: status === 'CONFIRMADO'
        ? '¡Gracias por confirmar! Nos emociona compartir este día contigo.'
        : 'Gracias por avisarnos. Te tendremos presente en este día especial.',
    };
  } finally {
    lock.releaseLock();
  }
}

function generateInviteIds() {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_INVITADOS);
  if (!sheet) throw new Error('Primero ejecuta setupProject().');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const existing = new Set(rows.map(r => String(r[0] || '').toUpperCase()).filter(Boolean));
  const out = [];

  rows.forEach(r => {
    const currentId = String(r[0] || '').trim().toUpperCase();
    const name = String(r[1] || '').trim();

    if (!name) {
      out.push([currentId]);
      return;
    }

    if (currentId) {
      out.push([currentId]);
      return;
    }

    let id;
    do {
      id = Utilities.getUuid().replace(/-/g, '').slice(0, 14).toUpperCase();
    } while (existing.has(id));

    existing.add(id);
    out.push([id]);
  });

  sheet.getRange(2, COL.ID, out.length, 1).setValues(out);

  for (let row = 2; row <= lastRow; row++) {
    const name = sheet.getRange(row, COL.NOMBRE).getValue();
    if (name && !sheet.getRange(row, COL.ESTADO).getValue()) {
      sheet.getRange(row, COL.ESTADO).setValue('PENDIENTE');
    }
  }
}

function setPublicSiteUrl() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const current = props.getProperty('PUBLIC_SITE_URL') || DEFAULT_PUBLIC_SITE_URL;

  const response = ui.prompt(
    'URL pública de la invitación',
    'Usaremos esta URL para generar los enlaces individuales.\nActual: ' + current,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;
  let url = response.getResponseText().trim();
  if (!/^https:\/\//i.test(url)) {
    ui.alert('La URL debe comenzar con https://');
    return;
  }
  if (!url.endsWith('/')) url += '/';

  props.setProperty('PUBLIC_SITE_URL', url);
  generateInviteLinks();
}

function generateInviteLinks() {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_INVITADOS);
  if (!sheet) throw new Error('Primero ejecuta setupProject().');

  generateInviteIds();

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  let baseUrl = PropertiesService.getScriptProperties().getProperty('PUBLIC_SITE_URL') || DEFAULT_PUBLIC_SITE_URL;
  if (!baseUrl.endsWith('/')) baseUrl += '/';

  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const links = rows.map(r => {
    const id = String(r[0] || '').trim();
    const name = String(r[1] || '').trim();
    return [id && name ? baseUrl + '?id=' + encodeURIComponent(id) : ''];
  });

  sheet.getRange(2, COL.ENLACE, links.length, 1).setValues(links);
}

function findInviteRow_(id) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_INVITADOS);
  if (!sheet || sheet.getLastRow() < 2) return null;

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][COL.ID - 1] || '').trim().toUpperCase() === id) {
      return { sheet, row: i + 2, values: values[i] };
    }
  }
  return null;
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  throw new Error('No se encontró el Google Sheet. Ejecuta setupProject() desde una hoja vinculada.');
}

function normalizeInviteId_(value) {
  const id = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9]{8,40}$/.test(id) ? id : '';
}

function validateCallback_(value) {
  const cb = String(value || '').trim();
  return /^[A-Za-z_$][0-9A-Za-z_$\.]{0,100}$/.test(cb) ? cb : 'weddingRsvpCallback';
}

function jsonp_(callback, data) {
  const body = callback + '(' + JSON.stringify(data).replace(/</g, '\\u003c') + ');';
  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
