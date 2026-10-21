// sync.js — sincronización con el repo privado de datos vía GitHub Contents API (sin servidor propio).
// Verificado con la documentación vigente: PUT contents exige `sha` al actualizar (409/422 si está desactualizado);
// GET contents devuelve base64 solo hasta 1 MB (más grande → media type raw). Nunca se imprime ni se registra el token.
import { datos, aplicarDatos, persistirLocal, limpiarPendiente, hayPendiente, alCambiar, lista } from './estado.js';
import { fusionar } from './calc.js';
import { leerFotoLocal, borrarFotoLocal, fotosPorBorrar, quitarFotoPorBorrar } from './foto.js';

const API = 'https://api.github.com';
const CLAVE_TOKEN = 'garaje.token';
const CLAVE_REPO = 'garaje.repo';
const CLAVE_ULTIMO = 'garaje.ultimoSync';
export const REPO_DEFECTO = 'bravoag/garaje-bravo-datos';
const REINTENTOS = 3;

// ---- Configuración por dispositivo ----
const leer = k => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
export const leerConfig = () => ({ token: leer(CLAVE_TOKEN), repo: leer(CLAVE_REPO) });
export function guardarConfigSync({ token, repo }) {
  if (token !== undefined) localStorage.setItem(CLAVE_TOKEN, token.trim());
  if (repo !== undefined) localStorage.setItem(CLAVE_REPO, repo.trim());
}
export function quitarToken() { localStorage.removeItem(CLAVE_TOKEN); }

// ---- Base64 con UTF-8 (btoa directo rompe tildes y ñ) ----
export function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function deBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

// JSON con claves ordenadas: sirve para comparar sin que el orden de campos cause commits de más.
export function canonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  if (valor && typeof valor === 'object') return `{${Object.keys(valor).sort().map(k => `${JSON.stringify(k)}:${canonico(valor[k])}`).join(',')}}`;
  return JSON.stringify(valor);
}

// ---- Errores con mensaje para el usuario ----
export class ErrorSync extends Error {
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}
const MENSAJES = {
  red: 'Sin conexión: se sincronizará al volver.',
  auth: 'Token inválido o vencido. Ve a Más → Ajustes.',
  noencontrado: 'No encuentro el repositorio de datos. Revisa «propietario/repo» y el token en Ajustes.',
  conflicto: 'Hubo cambios simultáneos y no pude resolverlos. Intenta de nuevo.',
  otro: 'GitHub rechazó la solicitud.',
};
function errorDeEstado(status) {
  if (status === 401 || status === 403) return new ErrorSync('auth', MENSAJES.auth);
  if (status === 404) return new ErrorSync('noencontrado', MENSAJES.noencontrado);
  if (status === 409 || status === 422) return new ErrorSync('conflicto', MENSAJES.conflicto);
  return new ErrorSync('otro', `${MENSAJES.otro} (HTTP ${status})`);
}

async function llamar(cfg, fetchFn, metodo, ruta, { cuerpo, aceptar = 'application/vnd.github+json' } = {}) {
  try {
    return await fetchFn(`${API}/repos/${cfg.repo}/contents/${ruta}`, {
      method: metodo,
      cache: 'no-store',          // el navegador no debe servir un sha viejo
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: aceptar,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorSync('red', MENSAJES.red);
  }
}

// ---- datos.json: leer → fusionar → escribir con sha (reintenta ante conflicto) ----
// `obtenerLocal()` se llama en cada intento para no perder ediciones hechas mientras se sincronizaba.
export async function intercambiarDatos({ cfg, fetchFn = fetch, obtenerLocal }) {
  for (let intento = 0; intento < REINTENTOS; intento++) {
    const r = await llamar(cfg, fetchFn, 'GET', 'datos.json');
    let remoto = null, sha = null;
    if (r.status === 200) {
      const j = await r.json();
      sha = j.sha;
      let texto;
      if (j.content) texto = deBase64(j.content);
      else {   // archivo > 1 MB: solo el media type raw lo entrega
        const crudo = await llamar(cfg, fetchFn, 'GET', 'datos.json', { aceptar: 'application/vnd.github.raw+json' });
        if (!crudo.ok) throw errorDeEstado(crudo.status);
        texto = await crudo.text();
      }
      remoto = JSON.parse(texto);
    } else if (r.status !== 404) {
      throw errorDeEstado(r.status);    // 404 = primera vez: se crea
    }

    const local = obtenerLocal();
    const fusionado = remoto ? fusionar(local, remoto) : fusionar(local, {});
    const yaIgual = remoto && canonico(fusionado) === canonico(fusionar(remoto, {}));
    if (yaIgual) return fusionado;

    const p = await llamar(cfg, fetchFn, 'PUT', 'datos.json', {
      cuerpo: { message: `Sync ${new Date().toISOString()}`, content: aBase64(JSON.stringify(fusionado, null, 1)), ...(sha ? { sha } : {}) },
    });
    if (p.ok) return fusionado;
    if (p.status === 409 || p.status === 422) continue;   // sha desactualizado: releer, fusionar y reintentar
    throw errorDeEstado(p.status);
  }
  throw new ErrorSync('conflicto', MENSAJES.conflicto);
}

// ---- Fotos ----
async function shaDe(cfg, fetchFn, ruta) {
  const r = await llamar(cfg, fetchFn, 'GET', ruta);
  if (r.status === 404) return null;
  if (!r.ok) throw errorDeEstado(r.status);
  return (await r.json()).sha;
}

export async function subirFoto({ cfg, fetchFn = fetch, ruta, dataUrl }) {
  const content = dataUrl.slice(dataUrl.indexOf(',') + 1);   // ya es base64
  let sha = null;
  for (let intento = 0; intento < 2; intento++) {
    const p = await llamar(cfg, fetchFn, 'PUT', ruta, { cuerpo: { message: `Foto ${ruta}`, content, ...(sha ? { sha } : {}) } });
    if (p.ok) return;
    if ((p.status === 409 || p.status === 422) && intento === 0) { sha = await shaDe(cfg, fetchFn, ruta); continue; }   // ya existía: reemplazar
    throw errorDeEstado(p.status);
  }
}

export async function borrarFotoRemota({ cfg, fetchFn = fetch, ruta }) {
  const sha = await shaDe(cfg, fetchFn, ruta);
  if (!sha) return;   // ya no existe
  const r = await llamar(cfg, fetchFn, 'DELETE', ruta, { cuerpo: { message: `Borrar ${ruta}`, sha } });
  if (!r.ok && r.status !== 404) throw errorDeEstado(r.status);
}

const urlsFotos = new Map();
// Descarga una foto del repo y devuelve una URL local para mostrarla.
export async function descargarFoto(ruta) {
  if (urlsFotos.has(ruta)) return urlsFotos.get(ruta);
  const cfg = leerConfig();
  if (!cfg.token || !cfg.repo) return null;
  const r = await llamar(cfg, fetch, 'GET', ruta, { aceptar: 'application/vnd.github.raw+json' });
  if (!r.ok) return null;
  // GitHub responde con el media type pedido como Content-Type: se fuerza image/jpeg para que el <img> lo acepte.
  const url = URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: 'image/jpeg' }));
  urlsFotos.set(ruta, url);
  return url;
}

async function sincronizarFotos(cfg) {
  let aviso = '';
  // Borrados pendientes (si otra foto usa esa ruta, se conserva).
  const vivas = new Set(lista('trabajos').map(t => t.foto).filter(Boolean));
  for (const ruta of fotosPorBorrar()) {
    if (vivas.has(ruta)) { quitarFotoPorBorrar(ruta); continue; }
    try { await borrarFotoRemota({ cfg, ruta }); quitarFotoPorBorrar(ruta); } catch (e) { if (['red', 'auth'].includes(e.codigo)) throw e; aviso = 'No pude borrar una foto del repositorio.'; }
  }
  // Subidas pendientes: cada foto con copia local.
  for (const t of lista('trabajos')) {
    if (!t.foto) continue;
    const dataUrl = leerFotoLocal(t.id);
    if (!dataUrl) continue;
    try { await subirFoto({ cfg, ruta: t.foto, dataUrl }); borrarFotoLocal(t.id); } catch (e) { if (['red', 'auth'].includes(e.codigo)) throw e; aviso = 'No pude subir una foto; se reintentará.'; }
  }
  return aviso;
}

// ---- Orquestación ----
const estado = { sincronizando: false, error: null, aviso: '', ultimoSync: leer(CLAVE_ULTIMO) };
const oyentes = [];
export const alEstado = fn => oyentes.push(fn);
const notificar = () => oyentes.forEach(fn => fn(estadoSync()));
export function estadoSync() {
  const { token, repo } = leerConfig();
  return { configurado: Boolean(token && repo), pendiente: hayPendiente(), sincronizando: estado.sincronizando, error: estado.error, aviso: estado.aviso, ultimoSync: estado.ultimoSync };
}

let repetir = false;
let temporizador = null;

export async function sincronizar() {
  const cfg = leerConfig();
  if (!cfg.token || !cfg.repo) return { ok: false, motivo: 'sin-config' };
  if (estado.sincronizando) { repetir = true; return { ok: false, motivo: 'en-curso' }; }
  estado.sincronizando = true; estado.error = null; estado.aviso = '';
  notificar();
  try {
    estado.aviso = await sincronizarFotos(cfg);
    const fusionado = await intercambiarDatos({ cfg, obtenerLocal: () => datos });
    // Si el usuario editó algo durante la sincronización, esa edición (act más reciente) se conserva y queda pendiente.
    const final = fusionar(datos, fusionado);
    aplicarDatos(final);
    persistirLocal();
    if (canonico(final) === canonico(fusionado)) limpiarPendiente(); else repetir = true;
    estado.ultimoSync = new Date().toISOString();
    try { localStorage.setItem(CLAVE_ULTIMO, estado.ultimoSync); } catch { /* nada */ }
    return { ok: true };
  } catch (e) {
    estado.error = e instanceof ErrorSync ? { codigo: e.codigo, mensaje: e.message } : { codigo: 'otro', mensaje: 'Error inesperado al sincronizar.' };
    return { ok: false, motivo: estado.error.codigo };
  } finally {
    estado.sincronizando = false;
    notificar();
    if (repetir) { repetir = false; programar(); }
  }
}

// Sincroniza poco después del último cambio (agrupa varias ediciones seguidas).
export function programar(espera = 1500) {
  clearTimeout(temporizador);
  temporizador = setTimeout(sincronizar, espera);
}

// Al abrir la app, al volver la conexión y tras cada cambio.
export function iniciarSync() {
  alCambiar(() => programar());
  window.addEventListener('online', () => programar(300));
  programar(300);
}
