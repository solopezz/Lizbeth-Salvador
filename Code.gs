/**
 * Invitación digital + RSVP para Google Apps Script / Google Sheets.
 * Proyecto pensado para un script vinculado a una hoja de cálculo.
 */

const SHEET_INVITADOS = 'Invitados';
const SHEET_RESUMEN = 'Resumen';

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
    .addItem('3. Guardar URL del Web App', 'setWebAppUrl')
    .addItem('4. Generar enlaces', 'generateInviteLinks')
    .addToUi();
}

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.inviteId = (e && e.parameter && e.parameter.id) ? e.parameter.id : 'DEMO';

  return template.evaluate()
    .setTitle('Nuestra boda')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Ejecuta esta función una vez desde el editor vinculado al Google Sheet.
 * Crea las hojas, encabezados, ejemplo y guarda el Spreadsheet ID.
 */
function setupProject() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abre este script desde Extensiones → Apps Script dentro de tu Google Sheet.');

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());

  let invitados = ss.getSheetByName(SHEET_INVITADOS);
  if (!invitados) invitados = ss.insertSheet(SHEET_INVITADOS);
  invitados.clear();

  const headers = [[
    'ID', 'INVITACIÓN / FAMILIA', 'LUGARES', 'ESTADO', 'ASISTENTES',
    'FECHA CONFIRMACIÓN', 'TELÉFONO', 'MENSAJE', 'ENLACE'
  ]];
  invitados.getRange(1, 1, 1, headers[0].length).setValues(headers);
  invitados.setFrozenRows(1);

  invitados.getRange(2, 1, 4, 9).setValues([
    ['', 'Carlos & Fernanda', 2, 'PENDIENTE', '', '', '', '', ''],
    ['', 'Familia Hernández', 4, 'PENDIENTE', '', '', '', '', '', ''],
    ['', 'Daniel', 1, 'PENDIENTE', '', '', '', '', '', ''],
    ['', 'Mariana & Luis', 2, 'PENDIENTE', '', '', '', '', '', ''],
  ]);

  invitados.getRange('C2:C').setNumberFormat('0');
  invitados.getRange('E2:E').setNumberFormat('0');
  invitados.getRange('F2:F').setNumberFormat('dd/MM/yyyy HH:mm');
  invitados.autoResizeColumns(1, 9);
  invitados.setColumnWidth(2, 220);
  invitados.setColumnWidth(8, 260);
  invitados.setColumnWidth(9, 360);

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['PENDIENTE', 'CONFIRMADO', 'NO_ASISTE'], true)
    .setAllowInvalid(false)
    .build();
  invitados.getRange('D2:D').setDataValidation(statusRule);

  let resumen = ss.getSheetByName(SHEET_RESUMEN);
  if (!resumen) resumen = ss.insertSheet(SHEET_RESUMEN);
  resumen.clear();
  resumen.getRange('A1:B1').setValues([['RESUMEN RSVP', 'TOTAL']]);
  resumen.getRange('A2:A7').setValues([
    ['Invitaciones'],
    ['Personas invitadas'],
    ['Personas confirmadas'],
    ['Invitaciones pendientes'],
    ['Invitaciones que no asistirán'],
    ['Lugares pendientes de respuesta'],
  ]);
  resumen.getRange('B2').setFormula('=COUNTA(Invitados!B2:B)');
  resumen.getRange('B3').setFormula('=SUM(Invitados!C2:C)');
  resumen.getRange('B4').setFormula('=SUMIF(Invitados!D2:D,"CONFIRMADO",Invitados!E2:E)');
  resumen.getRange('B5').setFormula('=COUNTIF(Invitados!D2:D,"PENDIENTE")');
  resumen.getRange('B6').setFormula('=COUNTIF(Invitados!D2:D,"NO_ASISTE")');
  resumen.getRange('B7').setFormula('=SUMIF(Invitados!D2:D,"PENDIENTE",Invitados!C2:C)');
  resumen.getRange('A1:B1').setFontWeight('bold');
  resumen.getRange('A1:B7').setBorder(true, true, true, true, true, true);
  resumen.setColumnWidth(1, 280);
  resumen.setColumnWidth(2, 120);

  // Configuración pública inicial. Edita estos valores cuando quieras.
  const props = PropertiesService.getScriptProperties();
  const defaults = {
    COUPLE_MONOGRAM: 'L · S',
    COUPLE_NAMES: 'L & S',
    WEDDING_MONTH: 'ABRIL 2027',
    WEDDING_DATE_ISO: '',
    CEREMONY_TIME: '17:00',
    CITY: 'Zacatecas, Zacatecas',
    VENUE: 'Lugar por definir',
    MAPS_URL: '',
    DRESS_CODE: 'Formal',
  };
  Object.keys(defaults).forEach(k => {
    if (props.getProperty(k) === null) props.setProperty(k, defaults[k]);
  });

  generateInviteIds();
  SpreadsheetApp.getUi().alert('Listo. Se crearon las hojas Invitados y Resumen, y se generaron IDs de ejemplo.');
}

/** Devuelve datos públicos de una invitación. */
function loadInvitation(inviteId) {
  const id = normalizeInviteId_(inviteId);
  const config = getPublicConfig_();

  if (id === 'DEMO') {
    return {
      ok: true,
      demo: true,
      guest: {
        id: 'DEMO',
        name: 'Carlos & Fernanda',
        reservedSeats: 2,
        status: 'PENDIENTE',
        attendees: 0,
      },
      config: {
        ...config,
        weddingMonth: config.weddingMonth || 'ABRIL 2027',
        weddingDateISO: config.weddingDateISO || '2027-04-17T17:00:00-06:00',
        venue: config.venue === 'Lugar por definir' ? 'Terraza de ejemplo' : config.venue,
      },
    };
  }

  const found = findInviteRow_(id);
  if (!found) return { ok: false, message: 'No encontramos esta invitación. Revisa que el enlace esté completo.' };

  return {
    ok: true,
    demo: false,
    guest: rowToGuest_(found.values),
    config,
  };
}

/** Guarda o modifica la confirmación. */
function saveRsvp(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Solicitud inválida.');

  const id = normalizeInviteId_(payload.id);
  if (id === 'DEMO') {
    return { ok: true, demo: true, message: 'Modo demo: la confirmación se simuló correctamente.' };
  }

  const status = String(payload.status || '').toUpperCase();
  if (!['CONFIRMADO', 'NO_ASISTE'].includes(status)) throw new Error('Estado inválido.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const found = findInviteRow_(id);
    if (!found) throw new Error('Invitación no encontrada.');

    const reservedSeats = Number(found.values[COL.LUGARES - 1]) || 0;
    let attendees = Number(payload.attendees || 0);

    if (status === 'NO_ASISTE') attendees = 0;
    if (status === 'CONFIRMADO') {
      if (!Number.isInteger(attendees) || attendees < 1 || attendees > reservedSeats) {
        throw new Error(`El número de asistentes debe estar entre 1 y ${reservedSeats}.`);
      }
    }

    const message = String(payload.message || '').trim().slice(0, 500);
    const sheet = found.sheet;
    const row = found.row;

    sheet.getRange(row, COL.ESTADO).setValue(status);
    sheet.getRange(row, COL.ASISTENTES).setValue(attendees);
    sheet.getRange(row, COL.FECHA).setValue(new Date());
    sheet.getRange(row, COL.MENSAJE).setValue(message);

    SpreadsheetApp.flush();

    return {
      ok: true,
      guest: rowToGuest_(sheet.getRange(row, 1, 1, 9).getValues()[0]),
      message: status === 'CONFIRMADO'
        ? '¡Gracias por confirmar! Nos emociona compartir este día con ustedes.'
        : 'Gracias por avisarnos. Los tendremos presentes en este día especial.',
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

  const ids = new Set(
    sheet.getRange(2, COL.ID, lastRow - 1, 1).getValues().flat().filter(Boolean).map(v => String(v).toUpperCase())
  );

  for (let row = 2; row <= lastRow; row++) {
    const name = sheet.getRange(row, COL.NOMBRE).getValue();
    const existing = sheet.getRange(row, COL.ID).getValue();
    if (!name || existing) continue;

    let id;
    do {
      id = Utilities.getUuid().replace(/-/g, '').slice(0, 14).toUpperCase();
    } while (ids.has(id));

    ids.add(id);
    sheet.getRange(row, COL.ID).setValue(id);
    if (!sheet.getRange(row, COL.ESTADO).getValue()) sheet.getRange(row, COL.ESTADO).setValue('PENDIENTE');
  }
}

function setWebAppUrl() {
  const ui = SpreadsheetApp.getUi();
  const current = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL') || '';
  const response = ui.prompt(
    'URL del Web App',
    'Pega la URL que termina en /exec después de desplegar el proyecto.' + (current ? `\nActual: ${current}` : ''),
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;
  const url = response.getResponseText().trim();
  if (!/^https:\/\/script\.google\.com\//i.test(url)) {
    ui.alert('La URL no parece ser un Web App de Apps Script. Debe comenzar con https://script.google.com/');
    return;
  }

  PropertiesService.getScriptProperties().setProperty('WEB_APP_URL', url.replace(/\/$/, ''));
  generateInviteLinks();
}

function generateInviteLinks() {
  const props = PropertiesService.getScriptProperties();
  const baseUrl = props.getProperty('WEB_APP_URL');
  if (!baseUrl) throw new Error('Primero usa “Guardar URL del Web App” y pega la URL /exec.');

  const sheet = getSpreadsheet_().getSheetByName(SHEET_INVITADOS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  generateInviteIds();
  const ids = sheet.getRange(2, COL.ID, lastRow - 1, 1).getValues();
  const links = ids.map(([id]) => [id ? `${baseUrl}?id=${encodeURIComponent(id)}` : '']);
  sheet.getRange(2, COL.ENLACE, links.length, 1).setValues(links);
}

function getPublicConfig_() {
  const p = PropertiesService.getScriptProperties();
  return {
    monogram: p.getProperty('COUPLE_MONOGRAM') || 'L · S',
    coupleNames: p.getProperty('COUPLE_NAMES') || 'L & S',
    weddingMonth: p.getProperty('WEDDING_MONTH') || 'ABRIL 2027',
    weddingDateISO: p.getProperty('WEDDING_DATE_ISO') || '',
    ceremonyTime: p.getProperty('CEREMONY_TIME') || '17:00',
    city: p.getProperty('CITY') || 'Zacatecas, Zacatecas',
    venue: p.getProperty('VENUE') || 'Lugar por definir',
    mapsUrl: p.getProperty('MAPS_URL') || '',
    dressCode: p.getProperty('DRESS_CODE') || 'Formal',
  };
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Falta configurar SPREADSHEET_ID. Ejecuta setupProject() desde el Google Sheet.');
  return SpreadsheetApp.openById(id);
}

function findInviteRow_(inviteId) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_INVITADOS);
  if (!sheet) return null;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const range = sheet.getRange(2, 1, lastRow - 1, 9);
  const values = range.getValues();

  for (let i = 0; i < values.length; i++) {
    const rowId = String(values[i][COL.ID - 1] || '').trim().toUpperCase();
    if (rowId === inviteId) {
      return { sheet, row: i + 2, values: values[i] };
    }
  }
  return null;
}

function rowToGuest_(row) {
  return {
    id: String(row[COL.ID - 1] || ''),
    name: String(row[COL.NOMBRE - 1] || ''),
    reservedSeats: Number(row[COL.LUGARES - 1]) || 0,
    status: String(row[COL.ESTADO - 1] || 'PENDIENTE'),
    attendees: Number(row[COL.ASISTENTES - 1]) || 0,
  };
}

function normalizeInviteId_(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 64);
}
