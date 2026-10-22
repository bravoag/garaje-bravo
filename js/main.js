// Arranque: router por hash, estado de la nav y registro del service worker.
import * as inicio from './ui/inicio.js';
import * as analisis from './ui/analisis.js';
import * as registrar from './ui/registrar.js';
import * as recordatorios from './ui/recordatorios.js';
import * as mas from './ui/mas.js';
import * as historico from './ui/historico.js';
import * as vehiculos from './ui/vehiculos.js';
import * as catalogo from './ui/catalogo.js';
import * as ajustes from './ui/ajustes.js';
import * as hoja from './ui/hoja.js';
import { iniciarSync } from './sync.js';
import { limpiarGraficos } from './ui/graficos.js';
import { datos, alCambiar } from './estado.js';
import { recordatorios as calcularRecordatorios } from './calc.js';
import { hoyISO, esc } from './util.js';
import { toast } from './ui/componentes.js';

const rutas = { inicio, analisis, registrar, recordatorios, mas, historico, vehiculos, catalogo, ajustes, hoja };
// Subpantallas de Más resaltan "Más" en la nav.
const grupoNav = { recordatorios: 'mas', vehiculos: 'mas', catalogo: 'mas', ajustes: 'mas', hoja: 'mas' };

// Contador de avisos pendientes en el icono de Más (los avisos viven dentro de Más) (vencidos + próximos + km desactualizado).
function actualizarBadge() {
  const n = calcularRecordatorios(datos, hoyISO()).pendientes;
  const badge = document.getElementById('badge');
  badge.hidden = n === 0;
  badge.textContent = n > 99 ? '99+' : String(n);
  document.querySelector('[data-ruta="mas"]').setAttribute('aria-label', n ? `Más, ${n} avisos pendientes` : 'Más');
}

function navegar() {
  const [nombre = 'inicio', ...resto] = location.hash.replace(/^#\/?/, '').split('/');
  const param = resto.join('/') || null;   // "trabajo/<id>" llega entero a la pantalla
  const pantalla = Object.hasOwn(rutas, nombre) ? nombre : 'inicio';
  const vista = document.getElementById('vista');
  limpiarGraficos();   // destruye los gráficos de la pantalla anterior
  vista.innerHTML = '';
  try {
    rutas[pantalla].render(vista, param);
  } catch (e) {
    // Una pantalla rota no deja la app en blanco: se explica y se ofrece volver.
    console.error(e);
    vista.innerHTML = `<section class="tarjeta vacio error-pantalla"><h2>Algo salió mal</h2>
      <p>No pude mostrar esta pantalla. Tus datos no se tocaron.</p><pre>${esc(e.message)}</pre>
      <a class="btn btn-primario" href="#/inicio">Ir a Inicio</a></section>`;
  }
  document.title = `${vista.querySelector('h1')?.textContent ?? 'Garaje'} · Garaje Bravo`;
  vista.focus({ preventScroll: true });   // lectores de pantalla y teclado empiezan en el contenido nuevo
  const activa = grupoNav[pantalla] || pantalla;
  document.querySelectorAll('[data-ruta]').forEach(a => {
    if (a.dataset.ruta === activa) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  actualizarBadge();
}

window.addEventListener('hashchange', navegar);
window.addEventListener('garaje:sin-espacio', () => toast('No se pudo guardar en este dispositivo (sin espacio o navegación privada). Exporta un respaldo.'));
if (!location.hash) location.hash = '#/inicio';
navegar();

alCambiar(actualizarBadge);
iniciarSync();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
