// Utilidades puras (sin DOM ni localStorage): formato es/USD, fechas LOCALES, ids y escape.
// Fechas: siempre 'YYYY-MM-DD' como texto. Nunca new Date('YYYY-MM-DD') (interpreta UTC y corre un día).

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtUSD = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = n => String(n).padStart(2, '0');

// Escapa texto del usuario antes de insertarlo en HTML.
export function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Minúsculas y sin tildes, para buscar sin importar acentos ni mayúsculas.
export const normalizar = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function nuevoId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const ahoraISO = () => new Date().toISOString();

// ---- Fechas locales ----
export function aISO(fecha) {
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

export function hoyISO() {
  return aISO(new Date());
}

// 'YYYY-MM-DD' → Date a medianoche LOCAL. Devuelve null si el texto no es una fecha válida.
export function parseFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return null;
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(a, mes - 1, dia);
  return f.getFullYear() === a && f.getMonth() === mes - 1 && f.getDate() === dia ? f : null;
}

// Diferencia en días enteros (b − a), inmune al cambio de horario.
export function diasEntre(isoA, isoB) {
  const a = parseFecha(isoA), b = parseFecha(isoB);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

export function sumarDias(iso, dias) {
  const f = parseFecha(iso);
  f.setDate(f.getDate() + dias);
  return aISO(f);
}

// Suma meses de calendario; si el día no existe en el mes destino (31 ene + 1 mes) cae al último día.
export function sumarMeses(iso, meses) {
  const f = parseFecha(iso);
  const dia = f.getDate();
  f.setDate(1);
  f.setMonth(f.getMonth() + meses);
  const ultimo = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
  f.setDate(Math.min(dia, ultimo));
  return aISO(f);
}

// ---- Formato ----
export function formatoFecha(iso) {
  const f = parseFecha(iso);
  return f ? `${pad(f.getDate())}/${MESES[f.getMonth()]}/${f.getFullYear()}` : '—';
}

export function formatoUSD(n) {
  return Number.isFinite(n) ? fmtUSD.format(n) : '—';
}

export function formatoKm(n) {
  if (!Number.isFinite(n)) return '—';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' km';
}

export function formatoNumero(n, decimales = 2) {
  return Number.isFinite(n) ? n.toLocaleString('es', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }) : '—';
}

export function redondear2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
