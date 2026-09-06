# Invitación digital + RSVP + Google Sheets

Proyecto gratuito para una boda. La misma aplicación de Google Apps Script:

1. Sirve la invitación digital.
2. Identifica cada invitación por un ID aleatorio en la URL.
3. Guarda la confirmación automáticamente en Google Sheets.
4. Limita la cantidad de asistentes al número de lugares asignados.
5. Permite que el invitado cambie su respuesta después.
6. Incluye un resumen automático de confirmados y pendientes.

## Archivos

- `Code.gs`: backend, lectura/escritura en Sheets y generación de enlaces.
- `Index.html`: invitación responsive + formulario RSVP.
- `appsscript.json`: manifiesto del proyecto.
- `Invitados_ejemplo.csv`: ejemplo de estructura de la hoja.
- `preview.html`: preview local; no toca Google Sheets.

## Instalación rápida

### 1) Crea la hoja

Crea un Google Sheet nuevo. Después entra a:

**Extensiones → Apps Script**

Reemplaza el contenido de `Code.gs` con el archivo de este proyecto.

Crea un archivo HTML llamado exactamente `Index` y pega el contenido de `Index.html`.

### 2) Ejecuta `setupProject()` una vez

Desde Apps Script selecciona `setupProject` y pulsa **Ejecutar**.

Google pedirá permisos porque el script necesita modificar tu propio Google Sheet.

Se crearán:

- Hoja `Invitados`
- Hoja `Resumen`
- IDs aleatorios de invitación

### 3) Personaliza los datos de tu boda

Apps Script → **Configuración del proyecto → Propiedades del script**.

Puedes crear/editar:

- `COUPLE_MONOGRAM` → `L · S`
- `COUPLE_NAMES` → nombres o iniciales
- `WEDDING_MONTH` → por ejemplo `ABRIL 2027`
- `WEDDING_DATE_ISO` → fecha ISO completa si quieres contador, por ejemplo `2027-04-17T17:00:00-06:00`
- `CEREMONY_TIME` → `17:00`
- `CITY` → `Zacatecas, Zacatecas`
- `VENUE` → nombre del lugar
- `MAPS_URL` → enlace de Google Maps
- `DRESS_CODE` → por ejemplo `Formal`

Si `WEDDING_DATE_ISO` está vacío, el contador simplemente no aparece.

### 4) Despliega la invitación

En Apps Script:

**Implementar → Nueva implementación → Aplicación web**

Configuración recomendada:

- Ejecutar como: **Yo**
- Quién tiene acceso: **Cualquier usuario**

Pulsa implementar y copia la URL que termina en `/exec`.

### 5) Guarda la URL y genera todos los links

Regresa al Google Sheet y recarga la página.

Aparecerá el menú **💍 Boda RSVP**.

Selecciona:

1. `Guardar URL del Web App`
2. Pega la URL `/exec`
3. `Generar enlaces`

Cada fila tendrá algo parecido a:

`https://script.google.com/.../exec?id=6A31F15E2D654A`

Ese es el enlace específico que debes mandar a esa persona/familia.

## Cómo funciona el RSVP

Ejemplo:

- Carlos & Fernanda tienen 2 lugares.
- Su enlace contiene un ID aleatorio.
- La invitación consulta el Sheet por ese ID.
- La web muestra “Hemos reservado 2 lugares”.
- Solo permite seleccionar 1 o 2 asistentes.
- Al confirmar, se actualizan automáticamente ESTADO, ASISTENTES y FECHA CONFIRMACIÓN.

## Seguridad práctica

Los IDs son aleatorios y no contienen nombres ni números consecutivos, por lo que no es sencillo adivinar la invitación de otra persona. Además, el servidor siempre valida que nadie confirme más lugares de los asignados.

Para una boda privada esta estrategia es mucho mejor que usar `?nombre=Juan`, `?id=1`, `?id=2`, etc.

## Preview

Abre `preview.html` en cualquier navegador. Es completamente local y simula una invitación de 2 personas. El botón RSVP funciona como demostración visual, pero no escribe en Google Sheets.
