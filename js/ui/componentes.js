// Componentes de UI compartidos: hoja inferior, selector de ítems con búsqueda, toast, chip de estado.
import { lista, guardar } from '../estado.js';
import { esc, formatoUSD, normalizar } from '../util.js';

export const COLORES = ['#00e5ff', '#ff2bd6', '#a855ff', '#3d7bff', '#ff8a00', '#ffe600', '#b6ff00'];
export const CATEGORIAS = ['Motor', 'Frenos', 'Suspensión y dirección', 'Neumáticos', 'Eléctrico', 'Fluidos y filtros', 'Transmisión', 'Carrocería', 'Aire y clima', 'Otros'];

// Solo colores de la paleta pasan a estilos en línea (evita inyectar CSS desde datos).
export const colorSeguro = c => (COLORES.includes(c) ? c : COLORES[0]);

export { normalizar };

// ---- Toast ----
export function toast(mensaje) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = mensaje;
  el.classList.add('visible');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('visible'), 2600);
}

// ---- Hoja inferior ----
// Devuelve { cuerpo, cerrar }. El contenido se pinta en `cuerpo`.
export function abrirHoja(titulo) {
  const fondo = document.createElement('div');
  fondo.className = 'hoja-fondo';
  fondo.innerHTML = `
    <div class="hoja" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="hoja-cab"><h2>${esc(titulo)}</h2><button type="button" class="hoja-cerrar" aria-label="Cerrar">✕</button></div>
      <div class="hoja-cuerpo"></div>
    </div>`;
  const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', alTecla); };
  const alTecla = e => { if (e.key === 'Escape') cerrar(); };
  fondo.addEventListener('click', e => { if (e.target === fondo) cerrar(); });
  fondo.querySelector('.hoja-cerrar').addEventListener('click', cerrar);
  document.addEventListener('keydown', alTecla);
  document.body.append(fondo);
  return { cuerpo: fondo.querySelector('.hoja-cuerpo'), cerrar };
}

// ---- Selector de ítems del catálogo ----
// Lista los ítems activos con buscador; si el texto no existe ofrece "+ Crear «texto»".
export function selectorItem({ alElegir }) {
  const { cuerpo, cerrar } = abrirHoja('Elegir ítem');
  cuerpo.innerHTML = `
    <input type="search" class="entrada" placeholder="Buscar repuesto o servicio…" aria-label="Buscar ítem" autocomplete="off">
    <div class="opciones" role="list"></div>`;
  const buscador = cuerpo.querySelector('input');
  const contenedor = cuerpo.querySelector('.opciones');

  const elegir = item => { cerrar(); alElegir(item); };

  function pintar() {
    const texto = normalizar(buscador.value);
    const items = lista('items').filter(i => i.activo !== false);
    const coinciden = items.filter(i => !texto || normalizar(i.nombre).includes(texto)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const exacto = items.some(i => normalizar(i.nombre) === texto);
    contenedor.innerHTML = coinciden.map(i => `
      <button type="button" class="opcion" data-id="${esc(i.id)}">
        <span><b>${esc(i.nombre)}</b><small>${esc(i.tipo)} · ${esc(i.categoria ?? 'Otros')}</small></span>
        <span class="apagado">${i.ultimoPrecio != null ? esc(formatoUSD(i.ultimoPrecio)) : ''}</span>
      </button>`).join('')
      + (texto && !exacto ? `<button type="button" class="opcion crear">+ Crear «${esc(buscador.value.trim())}»</button>` : '')
      + (!coinciden.length && !texto ? '<p class="apagado">El catálogo está vacío. Escribe un nombre para crear el primer ítem.</p>' : '');
  }

  contenedor.addEventListener('click', e => {
    const b = e.target.closest('.opcion');
    if (!b) return;
    if (b.classList.contains('crear')) return formularioCrear(buscador.value.trim());
    elegir(lista('items').find(i => i.id === b.dataset.id));
  });

  function formularioCrear(nombre) {
    cuerpo.innerHTML = `
      <form class="formulario" novalidate>
        <label class="campo">Nombre<input name="nombre" class="entrada" value="${esc(nombre)}" required></label>
        <label class="campo">Tipo
          <select name="tipo" class="entrada"><option value="repuesto">Repuesto</option><option value="servicio">Servicio</option></select>
        </label>
        <label class="campo">Categoría
          <select name="categoria" class="entrada">${CATEGORIAS.map(c => `<option>${esc(c)}</option>`).join('')}</select>
        </label>
        <p class="error" role="alert" hidden></p>
        <button class="btn btn-primario" type="submit">Crear y elegir</button>
      </form>`;
    const form = cuerpo.querySelector('form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(form);
      const nom = String(f.get('nombre')).trim();
      const error = form.querySelector('.error');
      if (!nom) { error.textContent = 'Escribe un nombre.'; error.hidden = false; return; }
      const existente = lista('items', { incluirBorrados: false }).find(i => normalizar(i.nombre) === normalizar(nom));
      if (existente) { error.textContent = 'Ya existe un ítem con ese nombre.'; error.hidden = false; return; }
      const item = guardar('items', { nombre: nom, tipo: f.get('tipo'), categoria: f.get('categoria'), ultimoPrecio: null, ultimaFecha: null, activo: true });
      elegir(item);
    });
    form.nombre.focus();
  }

  buscador.addEventListener('input', pintar);
  pintar();
  buscador.focus();
}

// ---- Chip de estado: SIEMPRE icono + texto, nunca solo color ----
const ESTADOS = {
  vencido: ['▲', 'Vencido'],
  proximo: ['●', 'Próximo'],
  ok: ['✓', 'Al día'],
  'sin-registro': ['–', 'Sin registro previo'],
};
export function chipEstado(estado) {
  const [icono, texto] = ESTADOS[estado] ?? ESTADOS.ok;
  return `<span class="estado estado-${estado}"><span aria-hidden="true">${icono}</span> ${texto}</span>`;
}
