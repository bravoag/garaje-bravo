// foto.js — comprime una imagen en el cliente y guarda copias locales pendientes de subir (la subida llega en sync.js).
const PREFIJO = 'garaje.foto.';

// Redimensiona (lado mayor ≤ ladoMax) y devuelve un data URL JPEG. Respeta la orientación EXIF.
export async function comprimirImagen(archivo, ladoMax = 1280, calidad = 0.7) {
  const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  const escala = Math.min(1, ladoMax / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#fff';                      // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  bmp.close?.();
  return lienzo.toDataURL('image/jpeg', calidad);
}

// Devuelve false si no hay espacio en localStorage.
export function guardarFotoLocal(trabajoId, dataUrl) {
  try { localStorage.setItem(PREFIJO + trabajoId, dataUrl); return true; } catch { return false; }
}
export function leerFotoLocal(trabajoId) {
  try { return localStorage.getItem(PREFIJO + trabajoId); } catch { return null; }
}
export function borrarFotoLocal(trabajoId) {
  try { localStorage.removeItem(PREFIJO + trabajoId); } catch { /* nada */ }
}

// Rutas de fotos ya subidas que hay que borrar del repo en la próxima sincronización.
const CLAVE_BORRAR = 'garaje.fotosBorrar';
export function fotosPorBorrar() {
  try { return JSON.parse(localStorage.getItem(CLAVE_BORRAR) ?? '[]'); } catch { return []; }
}
function escribirPorBorrar(rutas) {
  try { localStorage.setItem(CLAVE_BORRAR, JSON.stringify(rutas)); } catch { /* sin espacio */ }
}
export function registrarFotoPorBorrar(ruta) {
  const rutas = fotosPorBorrar();
  if (ruta && !rutas.includes(ruta)) escribirPorBorrar([...rutas, ruta]);
}
export function quitarFotoPorBorrar(ruta) {
  escribirPorBorrar(fotosPorBorrar().filter(r => r !== ruta));
}
