// Estado: `datos` en memoria + persistencia en localStorage. Sin DOM.
// Cada cambio → persistirLocal() → avisa a los suscriptores (sync.js se engancha aquí en el Paso 9).
import { nuevoId, ahoraISO } from './util.js';
import { recalcularUltimo, fusionar } from './calc.js';

const CLAVE = 'garaje.datos';
const CLAVE_PENDIENTE = 'garaje.pendiente';
export const COLECCIONES = ['vehiculos', 'items', 'trabajos', 'combustible', 'seguros', 'kms', 'categorias'];

// Categorías iniciales. Ids FIJOS (no aleatorios): si dos dispositivos las siembran por separado, al sincronizar convergen
// en los mismos registros y no se duplican. `act` antiguo para que cualquier edición real gane siempre.
export const CATEGORIAS_BASE = ['Motor', 'Frenos', 'Suspensión y dirección', 'Neumáticos', 'Eléctrico', 'Fluidos y filtros', 'Transmisión', 'Carrocería', 'Aire y clima', 'Otros'];
const slug = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const CONFIG_DEFECTO = { umbralPrecioPct: 20, diasSinKm: 30 };

function vacio() {
  return { version: 1, vehiculos: [], items: [], trabajos: [], combustible: [], seguros: [], kms: [], categorias: [], config: { ...CONFIG_DEFECTO } };
}

// Objeto único: los demás módulos importan esta referencia y siempre ven el contenido vigente.
export const datos = vacio();

const suscriptores = [];
export function alCambiar(fn) { suscriptores.push(fn); }

// Normaliza cualquier JSON recibido (local, remoto, importado) a la forma esperada.
export function aplicarDatos(origen) {
  const base = vacio();
  for (const col of COLECCIONES) base[col] = Array.isArray(origen?.[col]) ? origen[col] : [];
  base.config = { ...CONFIG_DEFECTO, ...(origen?.config ?? {}) };
  base.version = origen?.version ?? 1;
  Object.assign(datos, base);
  sembrarCategorias();
}

// Solo si NO existe ningún registro de categoría (ni borrado): datos nuevos o anteriores a las categorías editables.
function sembrarCategorias() {
  if (datos.categorias.length) return;
  datos.categorias = CATEGORIAS_BASE.map(nombre => ({ id: `cat-${slug(nombre)}`, nombre, act: '2000-01-01T00:00:00.000Z' }));
}

export function cargarLocal() {
  let crudo = null;
  try { crudo = localStorage.getItem(CLAVE); } catch { /* sin acceso a localStorage */ }
  if (!crudo) { aplicarDatos(null); return; }
  try {
    aplicarDatos(JSON.parse(crudo));
  } catch {
    // JSON dañado: se conserva una copia para recuperarla y se arranca vacío (nunca se pisa en silencio).
    try { localStorage.setItem(CLAVE + '.corrupto', crudo); } catch { /* sin espacio */ }
    aplicarDatos(null);
  }
}

// Devuelve true si se guardó. false si el navegador lo impidió (cuota, modo privado).
export function persistirLocal() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
    localStorage.setItem(CLAVE_PENDIENTE, '1');
    return true;
  } catch {
    return false;
  }
}

export const hayPendiente = () => { try { return localStorage.getItem(CLAVE_PENDIENTE) === '1'; } catch { return false; } };
export function limpiarPendiente() { try { localStorage.removeItem(CLAVE_PENDIENTE); } catch { /* nada */ } }

// ---- CRUD genérico ----
export function lista(col, { incluirBorrados = false } = {}) {
  return incluirBorrados ? datos[col] : datos[col].filter(r => !r.borrado);
}

export function obtener(col, id) {
  return datos[col].find(r => r.id === id && !r.borrado) ?? null;
}

// Crea (sin id) o reemplaza (con id). Siempre actualiza `act`. Devuelve el registro guardado.
export function guardar(col, registro) {
  const reg = { ...registro, id: registro.id ?? nuevoId(), act: ahoraISO() };
  const i = datos[col].findIndex(r => r.id === reg.id);
  if (i === -1) datos[col].push(reg); else datos[col][i] = reg;
  cambio();
  return reg;
}

// Borrado suave. Un ítem del catálogo usado en trabajos o en servicios programados no se borra: se archiva.
export function borrar(col, id) {
  const reg = datos[col].find(r => r.id === id);
  if (!reg) return;
  if (col === 'items' && itemEnUso(id)) throw new Error('El ítem tiene historial: archívalo en lugar de borrarlo.');
  reg.borrado = true;
  reg.act = ahoraISO();
  cambio();
}

// Actualiza ultimoPrecio/ultimaFecha de cada ítem tras guardar, editar o borrar un trabajo.
export function recalcularItems(itemIds) {
  for (const id of new Set(itemIds)) {
    const item = datos.items.find(i => i.id === id);
    if (!item) continue;
    const u = recalcularUltimo(id, datos.trabajos) ?? { ultimoPrecio: null, ultimaFecha: null };
    if (item.ultimoPrecio !== u.ultimoPrecio || item.ultimaFecha !== u.ultimaFecha) {
      guardar('items', { ...item, ...u });
    }
  }
}

function itemEnUso(itemId) {
  return lista('trabajos').some(t => t.lineas?.some(l => l.itemId === itemId))
    || lista('vehiculos').some(v => v.programados?.some(p => p.itemId === itemId));
}

function cambio() {
  // Si el navegador no deja guardar (sin espacio, modo privado) la app avisa: el dato solo está en memoria.
  if (!persistirLocal()) globalThis.dispatchEvent?.(new Event('garaje:sin-espacio'));
  suscriptores.forEach(fn => fn());
}

// ---- Categorías de ítems (editables) ----
const normal = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function nombresCategorias() {
  return lista('categorias').map(c => c.nombre).sort((a, b) => (a === 'Otros') - (b === 'Otros') || a.localeCompare(b, 'es'));
}
export function categoriaExiste(nombre, exceptoId = null) {
  return lista('categorias').some(c => c.id !== exceptoId && normal(c.nombre) === normal(nombre));
}
export const itemsDeCategoria = nombre => lista('items').filter(i => i.categoria === nombre);

// Renombrar: los ítems que la usan pasan al nombre nuevo (se guardan por nombre).
export function renombrarCategoria(id, nombreNuevo) {
  const cat = datos.categorias.find(c => c.id === id);
  const viejo = cat.nombre;
  guardar('categorias', { ...cat, nombre: nombreNuevo });
  if (viejo !== nombreNuevo) for (const i of itemsDeCategoria(viejo)) guardar('items', { ...i, categoria: nombreNuevo });
}

// Eliminar: antes se mueven sus ítems a `destino` (otra categoría) para no dejar nada sin clasificar.
export function eliminarCategoria(id, destino) {
  const cat = datos.categorias.find(c => c.id === id);
  for (const i of itemsDeCategoria(cat.nombre)) guardar('items', { ...i, categoria: destino });
  borrar('categorias', id);
}

// Importación de un respaldo: se fusiona por id con lo que ya hay (gana el act más reciente), sin borrar nada.
export function fusionarDatos(otro) {
  aplicarDatos(fusionar(datos, otro));
  cambio();
}

export function guardarConfig(parcial) {
  Object.assign(datos.config, parcial, { act: ahoraISO() });   // `act` permite fusionar la config entre dispositivos
  cambio();
}

cargarLocal();
