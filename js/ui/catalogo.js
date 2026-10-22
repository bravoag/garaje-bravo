// ui/catalogo.js — catálogo de ítems: lista con buscador, edición, archivado e historial de precios.
// Rutas: #/catalogo, #/catalogo/nuevo, #/catalogo/<id>, #/catalogo/categorias, #/catalogo/categorias/nueva, #/catalogo/categorias/<id>
import { datos, lista, obtener, guardar, borrar, nombresCategorias, categoriaExiste, itemsDeCategoria, renombrarCategoria, eliminarCategoria } from '../estado.js';
import { esc, formatoUSD, formatoFecha } from '../util.js';
import { historialPrecios } from '../calc.js';
import { colorSeguro, normalizar, toast } from './componentes.js';
import { cargarChart, lineas, tabla } from './graficos.js';

// La categoría elegida en el filtro sobrevive mientras la app está abierta (sirve para reclasificar varios seguidos).
let filtroCategoria = '';

export function render(vista, param) {
  if (param === 'categorias') return listaCategorias(vista);
  if (param?.startsWith('categorias/')) return formularioCategoria(vista, param.slice('categorias/'.length));
  if (param === 'nuevo') return formulario(vista, null);
  if (param) {
    const item = obtener('items', param);
    if (item) return formulario(vista, item);
  }
  listado(vista);
}

function listado(vista) {
  const items = [...lista('items')].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  vista.innerHTML = `
    <header class="cabecera"><span class="etiqueta">Repuestos y servicios</span><h1>Catálogo</h1></header>
    ${items.length ? `
      <input type="search" class="entrada" id="buscar" placeholder="Buscar ítem…" aria-label="Buscar ítem" autocomplete="off">
      <select class="entrada" id="filtro-categoria" aria-label="Filtrar por categoría">
        <option value="">Todas las categorías</option>
        ${nombresCategorias().map(c => `<option ${c === filtroCategoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <div class="opciones" id="filas"></div>` : `
      <section class="tarjeta vacio">
        <h2>El catálogo está vacío</h2>
        <p>Los ítems se crean al vuelo cuando registras un trabajo, o aquí mismo.</p>
      </section>`}
    <p><a class="btn btn-primario" href="#/catalogo/nuevo">+ Nuevo ítem</a></p>
    <p><a class="btn" href="#/catalogo/categorias">Categorías</a></p>`;
  if (!items.length) return;

  const filas = vista.querySelector('#filas');
  const pintar = () => {
    const t = normalizar(vista.querySelector('#buscar').value);
    const visibles = items.filter(i => (!t || normalizar(i.nombre).includes(t)) && (!filtroCategoria || i.categoria === filtroCategoria));
    // Activos primero, archivados al final.
    visibles.sort((a, b) => (a.activo === false) - (b.activo === false));
    filas.innerHTML = visibles.map(i => `
      <a class="opcion ${i.activo === false ? 'archivado' : ''}" href="#/catalogo/${esc(i.id)}">
        <span><b>${esc(i.nombre)}</b><small>${esc(i.tipo)} · ${esc(i.categoria ?? 'Otros')}${i.activo === false ? ' · Archivado' : ''}</small></span>
        <span class="apagado">${i.ultimoPrecio != null ? esc(formatoUSD(i.ultimoPrecio)) : ''}</span>
      </a>`).join('') || '<p class="apagado">Sin coincidencias.</p>';
  };
  vista.querySelector('#buscar').addEventListener('input', pintar);
  vista.querySelector('#filtro-categoria').addEventListener('change', e => { filtroCategoria = e.target.value; pintar(); });
  pintar();
}

// ---------- Categorías ----------
function listaCategorias(vista) {
  const nombres = nombresCategorias();
  vista.innerHTML = `
    <header class="cabecera"><a class="volver" href="#/catalogo">‹ Catálogo</a><h1>Categorías</h1></header>
    <div class="opciones">${nombres.map(n => {
      const cat = lista('categorias').find(c => c.nombre === n);
      const cuantos = itemsDeCategoria(n).length;
      return `<a class="opcion" href="#/catalogo/categorias/${esc(cat.id)}"><span><b>${esc(n)}</b><small>${cuantos} ${cuantos === 1 ? 'ítem' : 'ítems'}</small></span><span class="apagado">›</span></a>`;
    }).join('')}</div>
    <p><a class="btn btn-primario" href="#/catalogo/categorias/nueva">+ Nueva categoría</a></p>`;
}

function formularioCategoria(vista, id) {
  const nueva = id === 'nueva';
  const cat = nueva ? null : obtener('categorias', id);
  if (!nueva && !cat) return listaCategorias(vista);
  const cuantos = cat ? itemsDeCategoria(cat.nombre).length : 0;
  const otras = nombresCategorias().filter(n => n !== cat?.nombre);

  vista.innerHTML = `
    <header class="cabecera"><a class="volver" href="#/catalogo/categorias">‹ Categorías</a><h1>${nueva ? 'Nueva categoría' : esc(cat.nombre)}</h1></header>
    <form class="formulario" novalidate>
      <label class="campo">Nombre<input class="entrada" name="nombre" value="${esc(cat?.nombre ?? '')}" required autocomplete="off"></label>
      <p class="error" role="alert" hidden></p>
      <button class="btn btn-primario ancho" type="submit">${nueva ? 'Crear categoría' : 'Guardar nombre'}</button>
    </form>
    ${nueva ? '' : `<section class="programados formulario">
      <h2>Eliminar categoría</h2>
      ${otras.length ? `<p class="ayuda">${cuantos ? `Tiene ${cuantos} ${cuantos === 1 ? 'ítem' : 'ítems'}: se moverán a la categoría que elijas.` : 'No tiene ítems.'}</p>
        ${cuantos ? `<label class="campo">Mover sus ítems a
          <select class="entrada" id="destino">${otras.map(n => `<option>${esc(n)}</option>`).join('')}</select></label>` : ''}
        <button class="btn ancho peligro" type="button" id="eliminar-cat">Eliminar categoría</button>` : '<p class="ayuda">Es la única categoría: crea otra antes de eliminarla.</p>'}
    </section>`}`;

  const form = vista.querySelector('form');
  const errorEl = form.querySelector('.error');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const nombre = String(new FormData(form).get('nombre')).trim();
    if (!nombre) { errorEl.textContent = 'Escribe un nombre.'; errorEl.hidden = false; return; }
    if (categoriaExiste(nombre, cat?.id)) { errorEl.textContent = 'Ya existe una categoría con ese nombre.'; errorEl.hidden = false; return; }
    if (nueva) guardar('categorias', { nombre }); else renombrarCategoria(cat.id, nombre);
    toast(nueva ? 'Categoría creada' : 'Categoría actualizada');
    location.hash = '#/catalogo/categorias';
  });
  vista.querySelector('#eliminar-cat')?.addEventListener('click', () => {
    const destino = vista.querySelector('#destino')?.value ?? otras[0];
    if (!confirm(`¿Eliminar «${cat.nombre}»${cuantos ? ` y mover sus ${cuantos} ítems a «${destino}»` : ''}?`)) return;
    eliminarCategoria(cat.id, destino);
    toast('Categoría eliminada');
    location.hash = '#/catalogo/categorias';
  });
}

function formulario(vista, item) {
  const nuevo = !item;
  const d = item ?? { tipo: 'servicio', categoria: 'Otros', activo: true };
  // Si el ítem tiene una categoría que ya no existe, igual se muestra para no perderla al guardar.
  const categorias = nombresCategorias();
  if (d.categoria && !categorias.includes(d.categoria)) categorias.push(d.categoria);
  const compras = nuevo ? [] : historialPrecios(datos, d.id);
  const programado = !nuevo && lista('vehiculos').some(v => v.programados?.some(p => p.itemId === d.id));

  vista.innerHTML = `
    <header class="cabecera">
      <a class="volver" href="#/catalogo">‹ Catálogo</a>
      <h1>${nuevo ? 'Nuevo ítem' : esc(d.nombre)}</h1>
    </header>
    <form class="formulario" novalidate>
      <label class="campo">Nombre<input class="entrada" name="nombre" value="${esc(d.nombre ?? '')}" required autocomplete="off"></label>
      <div class="fila">
        <label class="campo">Tipo
          <select class="entrada" name="tipo"><option value="repuesto" ${d.tipo === 'repuesto' ? 'selected' : ''}>Repuesto</option><option value="servicio" ${d.tipo === 'servicio' ? 'selected' : ''}>Servicio</option></select>
        </label>
        <label class="campo">Categoría
          <select class="entrada" name="categoria">${categorias.map(c => `<option ${c === d.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        </label>
      </div>
      <p class="error" role="alert" hidden></p>
      <button class="btn btn-primario ancho" type="submit">${nuevo ? 'Crear ítem' : 'Guardar cambios'}</button>
      ${nuevo ? '' : `<button class="btn ancho" type="button" id="archivar">${d.activo === false ? 'Restaurar ítem' : 'Archivar ítem'}</button>`}
      ${!nuevo && !compras.length && !programado ? '<button class="btn ancho peligro" type="button" id="eliminar">Eliminar ítem</button>' : ''}
    </form>
    ${nuevo ? '' : `
    <section class="programados">
      <h2>Historial de precios</h2>
      ${compras.length > 1 ? `<div class="grafico" style="height:200px"><canvas id="g-precios" role="img" aria-label="Precio unitario en el tiempo"></canvas></div>
      ${tabla(['Fecha', 'Vehículo', 'Precio'], compras.map(c => [formatoFecha(c.fecha), lista('vehiculos').find(x => x.id === c.vehiculoId)?.alias ?? '—', formatoUSD(c.precioUnit)]))}` : ''}
      ${compras.length ? `<div class="pila">${compras.map(c => {
        const v = lista('vehiculos').find(x => x.id === c.vehiculoId);
        return `
        <div class="tarjeta compra ${c.masBarato ? 'barato' : ''}" style="--c:${colorSeguro(v?.color)}">
          <span class="vehiculo-punto" aria-hidden="true"></span>
          <span class="vehiculo-datos"><b>${esc(formatoFecha(c.fecha))}</b><small>${esc(v?.alias ?? '—')}</small></span>
          <span class="vehiculo-km">${esc(formatoUSD(c.precioUnit))}${c.cantidad !== 1 ? `<small>× ${esc(c.cantidad)}</small>` : ''}${c.masBarato ? '<small class="estado estado-ok"><span aria-hidden="true">★</span> Más barato</small>' : ''}</span>
        </div>`;
      }).join('')}</div>` : '<p class="apagado">Aún no hay compras registradas de este ítem.</p>'}
    </section>`}`;

  graficoPrecios(vista, compras);

  const form = vista.querySelector('form');
  const errorEl = form.querySelector('.error');
  const mostrarError = msg => { errorEl.textContent = msg; errorEl.hidden = false; };

  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(form);
    const nombre = String(f.get('nombre')).trim();
    if (!nombre) return mostrarError('Escribe un nombre.');
    if (lista('items').some(i => i.id !== d.id && normalizar(i.nombre) === normalizar(nombre))) return mostrarError('Ya existe un ítem con ese nombre.');
    guardar('items', { ultimoPrecio: null, ultimaFecha: null, ...d, nombre, tipo: f.get('tipo'), categoria: f.get('categoria') });
    toast(nuevo ? 'Ítem creado' : 'Cambios guardados');
    location.hash = '#/catalogo';
  });

  vista.querySelector('#archivar')?.addEventListener('click', () => {
    guardar('items', { ...d, activo: d.activo === false });
    toast(d.activo === false ? 'Ítem restaurado' : 'Ítem archivado');
    location.hash = '#/catalogo';
  });

  vista.querySelector('#eliminar')?.addEventListener('click', () => {
    if (!confirm(`¿Eliminar «${d.nombre}»?`)) return;
    try { borrar('items', d.id); } catch (err) { return toast(err.message); }
    toast('Ítem eliminado');
    location.hash = '#/catalogo';
  });
}

// Gráfico del historial de precios: una serie por vehículo, con su color.
function graficoPrecios(vista, compras) {
  const canvas = vista.querySelector('#g-precios');
  if (!canvas) return;
  const series = [...new Set(compras.map(c => c.vehiculoId))].map(id => {
    const v = lista('vehiculos').find(x => x.id === id);
    return { nombre: v?.alias ?? '—', color: colorSeguro(v?.color), puntos: compras.filter(c => c.vehiculoId === id).map(c => ({ fecha: c.fecha, y: c.precioUnit })).reverse() };
  });
  cargarChart().then(() => lineas(canvas, series, { formatoY: v => formatoUSD(v) })).catch(() => {});
}
