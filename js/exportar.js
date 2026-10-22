// exportar.js — Excel (.xlsx con SheetJS), CSV de respaldo, y respaldo/importación JSON. SOLO se usa desde ordenador.
// Las funciones de filas/CSV/validación son puras (sin DOM) y tienen pruebas en tests/exportar.test.mjs.
import { datos, fusionarDatos } from './estado.js';
import { parseFecha, hoyISO } from './util.js';

const vivos = a => (a ?? []).filter(r => !r.borrado);
const cap = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
const fecha = iso => (iso ? parseFecha(iso) : null);                 // Date local → celda de fecha real en Excel
const porFecha = (a, b) => (a['Fecha'] ?? a['Desde']) - (b['Fecha'] ?? b['Desde']);

export const COLUMNAS_SERVICIOS = ['ID trabajo', 'Fecha', 'Vehículo', 'Marca', 'Modelo', 'Placa', 'Km', 'Tipo de mantenimiento', 'Ítem', 'Tipo de ítem', 'Categoría', 'Cantidad', 'Precio unitario (USD)', 'Subtotal línea (USD)', 'Total del trabajo (USD)', 'Garantía hasta', 'Tiene foto', 'Notas'];
export const COLUMNAS_COMBUSTIBLE = ['ID', 'Fecha', 'Vehículo', 'Placa', 'Km', 'Litros', 'Precio por litro (USD)', 'Total (USD)', 'Tanque lleno', 'Estación', 'Notas'];
export const COLUMNAS_SEGUROS = ['ID', 'Vehículo', 'Placa', 'Tipo', 'Entidad', 'Póliza', 'Desde', 'Vence', 'Monto (USD)', 'Notas'];

export const COLUMNAS_KM = ['ID', 'Fecha', 'Vehículo', 'Placa', 'Km', 'Notas'];

// Los vehículos se buscan entre TODOS (también vendidos): el historial no pierde el nombre.
const vehiculoDe = (d, id) => (d.vehiculos ?? []).find(v => v.id === id) ?? {};

// Hoja "Servicios": una fila por LÍNEA de trabajo, ordenada por fecha ascendente, sin borrados.
export function filasServicios(d) {
  const filas = [];
  for (const t of vivos(d.trabajos)) {
    const v = vehiculoDe(d, t.vehiculoId);
    for (const l of t.lineas ?? []) {
      const item = (d.items ?? []).find(i => i.id === l.itemId) ?? {};
      filas.push({
        'ID trabajo': t.id, 'Fecha': fecha(t.fecha), 'Vehículo': v.alias ?? '', 'Marca': v.marca ?? '', 'Modelo': v.modelo ?? '', 'Placa': v.placa ?? '',
        'Km': t.km, 'Tipo de mantenimiento': cap(t.tipoMtto),
        'Ítem': item.nombre ?? 'Ítem eliminado', 'Tipo de ítem': cap(item.tipo), 'Categoría': item.categoria ?? '',
        'Cantidad': l.cantidad, 'Precio unitario (USD)': l.precioUnit, 'Subtotal línea (USD)': Math.round(l.cantidad * l.precioUnit * 100) / 100,
        'Total del trabajo (USD)': t.total, 'Garantía hasta': fecha(l.garantiaHasta), 'Tiene foto': t.foto ? 'Sí' : 'No', 'Notas': t.notas ?? '',
      });
    }
  }
  return filas.sort(porFecha);
}

export function filasCombustible(d) {
  return vivos(d.combustible).map(c => {
    const v = vehiculoDe(d, c.vehiculoId);
    return {
      'ID': c.id, 'Fecha': fecha(c.fecha), 'Vehículo': v.alias ?? '', 'Placa': v.placa ?? '', 'Km': c.km, 'Litros': c.litros,
      'Precio por litro (USD)': c.precioLitro, 'Total (USD)': c.total, 'Tanque lleno': c.tanqueLleno ? 'Sí' : 'No', 'Estación': c.estacion ?? '', 'Notas': c.notas ?? '',
    };
  }).sort(porFecha);
}

export function filasSeguros(d) {
  return vivos(d.seguros).map(s => {
    const v = vehiculoDe(d, s.vehiculoId);
    return {
      'ID': s.id, 'Vehículo': v.alias ?? '', 'Placa': v.placa ?? '', 'Tipo': cap(s.tipo), 'Entidad': s.entidad ?? '', 'Póliza': s.poliza ?? '',
      'Desde': fecha(s.desde), 'Vence': fecha(s.vence), 'Monto (USD)': s.monto, 'Notas': s.notas ?? '',
    };
  }).sort(porFecha);
}

export function filasKm(d) {
  return vivos(d.kms).map(k => {
    const v = vehiculoDe(d, k.vehiculoId);
    return { 'ID': k.id, 'Fecha': fecha(k.fecha), 'Vehículo': v.alias ?? '', 'Placa': v.placa ?? '', 'Km': k.km, 'Notas': k.notas ?? '' };
  }).sort(porFecha);
}

// ---- CSV de respaldo (BOM UTF-8, separador ';', coma decimal: se abre bien en Excel en español) ----
const pad = n => String(n).padStart(2, '0');
function celdaCSV(v) {
  let t;
  if (v instanceof Date) t = `${pad(v.getDate())}/${pad(v.getMonth() + 1)}/${v.getFullYear()}`;
  else if (typeof v === 'number') t = String(v).replace('.', ',');
  else t = String(v ?? '');
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
export function aCSV(filas, columnas) {
  return '﻿' + [columnas.join(';'), ...filas.map(f => columnas.map(c => celdaCSV(f[c])).join(';'))].join('\r\n');
}

// ---- Respaldo JSON ----
const COLECCIONES = ['vehiculos', 'items', 'trabajos', 'combustible', 'seguros'];
export function validarRespaldo(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'El archivo no es un respaldo de Garaje Bravo.' };
  for (const c of COLECCIONES) if (!Array.isArray(obj[c])) return { ok: false, error: `Falta la lista «${c}»: no parece un respaldo de Garaje Bravo.` };
  for (const c of COLECCIONES) if (obj[c].some(r => !r || typeof r.id !== 'string')) return { ok: false, error: `Hay registros sin id en «${c}».` };
  return { ok: true, conteos: Object.fromEntries(COLECCIONES.map(c => [c, vivos(obj[c]).length])) };
}

// ---- Descargas (DOM) ----
function descargar(nombre, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportarJSON() {
  descargar(`garaje-respaldo-${hoyISO()}.json`, new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' }));
}

// Lee el archivo y lo valida; devuelve { ok, error?, conteos?, datos? }. NO modifica nada todavía.
export async function leerRespaldo(archivo) {
  let obj;
  try { obj = JSON.parse(await archivo.text()); } catch { return { ok: false, error: 'El archivo no es un JSON válido.' }; }
  const v = validarRespaldo(obj);
  return v.ok ? { ...v, datos: obj } : v;
}
// Fusiona por id (gana el act más reciente): nunca borra lo que ya tienes.
export const aplicarRespaldo = obj => fusionarDatos(obj);

let promesaXLSX = null;
function cargarXLSX() {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
  promesaXLSX ??= new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'vendor/xlsx.full.min.js';
    s.onload = () => ok(globalThis.XLSX);
    s.onerror = () => { promesaXLSX = null; mal(new Error('No se pudo cargar SheetJS')); };
    document.head.append(s);
  });
  return promesaXLSX;
}

function hojaExcel(XLSX, wb, nombre, filas, columnas) {
  const ws = XLSX.utils.json_to_sheet(filas, { header: columnas, cellDates: true });   // `header` conserva los títulos aunque no haya filas
  ws['!cols'] = columnas.map(c => ({ wch: Math.min(40, Math.max(c.length + 2, ...filas.map(f => String(f[c] instanceof Date ? '00/00/0000' : f[c] ?? '').length + 2))) }));
  ws['!autofilter'] = { ref: ws['!ref'] };
  for (const celda of Object.keys(ws)) if (celda[0] !== '!' && ws[celda].t === 'd') ws[celda].z = 'dd/mm/yyyy';
  XLSX.utils.book_append_sheet(wb, ws, nombre);
}

// Excel con 3 hojas planas. Si SheetJS no carga, descarga CSV (uno por hoja). Devuelve 'xlsx' o 'csv'.
export async function exportarExcel() {
  const servicios = filasServicios(datos), combustible = filasCombustible(datos), seguros = filasSeguros(datos), kms = filasKm(datos);
  try {
    const XLSX = await cargarXLSX();
    const wb = XLSX.utils.book_new();
    hojaExcel(XLSX, wb, 'Servicios', servicios, COLUMNAS_SERVICIOS);
    hojaExcel(XLSX, wb, 'Combustible', combustible, COLUMNAS_COMBUSTIBLE);
    if (seguros.length) hojaExcel(XLSX, wb, 'Seguros', seguros, COLUMNAS_SEGUROS);
    if (kms.length) hojaExcel(XLSX, wb, 'Kilometraje', kms, COLUMNAS_KM);
    XLSX.writeFile(wb, `garaje-${hoyISO()}.xlsx`, { cellDates: true });
    return 'xlsx';
  } catch {
    const hoy = hoyISO();
    const csv = (nombre, filas, cols) => descargar(`garaje-${nombre}-${hoy}.csv`, new Blob([aCSV(filas, cols)], { type: 'text/csv;charset=utf-8' }));
    csv('servicios', servicios, COLUMNAS_SERVICIOS);
    setTimeout(() => csv('combustible', combustible, COLUMNAS_COMBUSTIBLE), 400);
    if (seguros.length) setTimeout(() => csv('seguros', seguros, COLUMNAS_SEGUROS), 800);
    if (kms.length) setTimeout(() => csv('kilometraje', kms, COLUMNAS_KM), 1200);
    return 'csv';
  }
}
