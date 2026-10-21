// ui/historico.js — "cuánto he gastado": lista unificada con filtros, total, detalle, edición y borrado (soft).
// Rutas: #/historico  y  #/historico/<vehiculoId>
import { datos, lista, borrar, recalcularItems } from '../estado.js';
import { esc, formatoUSD, formatoFecha, formatoKm } from '../util.js';
import { registrosUnificados } from '../calc.js';
import { leerFotoLocal, borrarFotoLocal, registrarFotoPorBorrar } from '../foto.js';
import { descargarFoto } from '../sync.js';
import { exportarExcel } from '../exportar.js';
import { colorSeguro, abrirHoja, toast } from './componentes.js';

// El filtro sobrevive mientras la app está abierta (volver desde el detalle no lo pierde).
const filtro = { vehiculoId: null, tipos: { mantenimiento: true, combustible: true, seguros: true }, desde: '', hasta: '', texto: '' };

const ETIQUETA_TIPO = { trabajo: 'Servicio', combustible: 'Combustible', seguro: 'Seguro' };
const RUTA_EDITAR = { trabajo: id => `#/registrar/trabajo/${id}`, combustible: id => `#/registrar/combustible/${id}`, seguro: id => `#/registrar/seguro/${id}` };
const COLECCION = { trabajo: 'trabajos', combustible: 'combustible', seguro: 'seguros' };

export function render(vista, param) {
  if (param !== null && param !== undefined) filtro.vehiculoId = lista('vehiculos').some(v => v.id === param) ? param : null;
  const vehiculos = lista('vehiculos');
  if (filtro.vehiculoId && !vehiculos.some(v => v.id === filtro.vehiculoId)) filtro.vehiculoId = null;

  vista.innerHTML = `<div id="hist">
    <header class="cabecera"><span class="etiqueta">Gastos</span><h1>Histórico</h1></header>
    <div class="chips" role="radiogroup" aria-label="Vehículo">
      <label class="chip"><input type="radio" name="veh" value="" ${!filtro.vehiculoId ? 'checked' : ''}><span>Todos</span></label>
      ${vehiculos.map(v => `<label class="chip" style="--c:${colorSeguro(v.color)}"><input type="radio" name="veh" value="${esc(v.id)}" ${v.id === filtro.vehiculoId ? 'checked' : ''}><span>${esc(v.alias)}</span></label>`).join('')}
    </div>
    <section class="tarjeta franja" aria-live="polite"></section>
    <details class="filtros" ${filtro.desde || filtro.hasta || filtro.texto || Object.values(filtro.tipos).includes(false) ? 'open' : ''}>
      <summary>Filtros</summary>
      <div class="formulario">
        <div class="chips">
          <label class="chip"><input type="checkbox" name="tipo" value="mantenimiento" ${filtro.tipos.mantenimiento ? 'checked' : ''}><span>Servicios y mantenimiento</span></label>
          <label class="chip"><input type="checkbox" name="tipo" value="combustible" ${filtro.tipos.combustible ? 'checked' : ''}><span>Combustible</span></label>
          <label class="chip"><input type="checkbox" name="tipo" value="seguros" ${filtro.tipos.seguros ? 'checked' : ''}><span>Seguros</span></label>
        </div>
        <div class="fila">
          <label class="campo">Desde<input class="entrada" type="date" name="desde" value="${esc(filtro.desde)}"></label>
          <label class="campo">Hasta<input class="entrada" type="date" name="hasta" value="${esc(filtro.hasta)}"></label>
        </div>
        <label class="campo">Buscar ítem o proveedor<input class="entrada" type="search" name="texto" value="${esc(filtro.texto)}" autocomplete="off"></label>
      </div>
    </details>
    <div class="pila" id="filas"></div>
    <p class="solo-pc"><button type="button" class="btn ancho" id="exportar">Exportar todo a Excel</button></p>
    <p class="solo-pc-aviso">Exportar a Excel: disponible desde un ordenador.</p></div>`;

  const raiz = vista.querySelector('#hist');   // los listeners van en un nodo propio: #vista se reutiliza entre pantallas
  const franja = vista.querySelector('.franja');
  const filas = vista.querySelector('#filas');

  function pintar() {
    const r = registrosUnificados(datos, { ...filtro, desde: filtro.desde || null, hasta: filtro.hasta || null });
    const desglose = !filtro.vehiculoId && vehiculos.length > 1
      ? `<div class="desglose">${vehiculos.filter(v => r.porVehiculo[v.id]).map(v => `
          <span class="desglose-item" style="--c:${colorSeguro(v.color)}"><i class="vehiculo-punto" aria-hidden="true"></i>${esc(v.alias)} <b>${esc(formatoUSD(r.porVehiculo[v.id]))}</b></span>`).join('')}</div>` : '';
    franja.innerHTML = `<span class="etiqueta">Total gastado</span><b class="franja-total">${esc(formatoUSD(r.total))}</b>${desglose}`;

    if (!r.filas.length) {
      const hayDatos = lista('trabajos').length || lista('combustible').length || lista('seguros').length;
      filas.innerHTML = `
        <section class="tarjeta vacio">
          <h2>${hayDatos ? 'Sin resultados' : 'Aún no hay registros'}</h2>
          <p>${hayDatos ? 'Ajusta los filtros para ver más.' : 'Registra tu primer trabajo para empezar el historial.'}</p>
          ${hayDatos ? '' : '<a class="btn btn-primario" href="#/registrar">Registrar</a>'}
        </section>`;
      return;
    }
    filas.innerHTML = r.filas.map(f => {
      const v = vehiculos.find(x => x.id === f.vehiculoId);
      return `
      <button type="button" class="tarjeta fila-reg" data-tipo="${f.tipo}" data-id="${esc(f.id)}" style="--c:${colorSeguro(v?.color)}">
        <span class="vehiculo-punto" aria-hidden="true"></span>
        <span class="vehiculo-datos">
          <b>${esc(f.titulo)}</b>
          <small>${esc(formatoFecha(f.fecha))} · ${esc(v?.alias ?? '—')}${f.detalle ? ' · ' + esc(f.detalle) : ''}</small>
        </span>
        <span class="vehiculo-km">${esc(formatoUSD(f.monto))}${f.km != null ? `<small>${esc(formatoKm(f.km))}</small>` : ''}</span>
      </button>`;
    }).join('');
  }

  raiz.addEventListener('change', e => {
    if (e.target.name === 'veh') filtro.vehiculoId = e.target.value || null;
    if (e.target.name === 'tipo') filtro.tipos[e.target.value] = e.target.checked;
    if (e.target.name === 'desde') filtro.desde = e.target.value;
    if (e.target.name === 'hasta') filtro.hasta = e.target.value;
    pintar();
  });
  raiz.addEventListener('input', e => { if (e.target.name === 'texto') { filtro.texto = e.target.value; pintar(); } });
  filas.addEventListener('click', e => {
    const b = e.target.closest('.fila-reg');
    if (b) detalle(b.dataset.tipo, b.dataset.id, pintar);
  });
  raiz.querySelector('#exportar')?.addEventListener('click', async () => toast(await exportarExcel() === 'xlsx' ? 'Excel descargado' : 'Descargué CSV de respaldo'));
  pintar();
}

function detalle(tipo, id, alCambiar) {
  const col = COLECCION[tipo];
  const r = datos[col].find(x => x.id === id && !x.borrado);
  if (!r) return;
  const v = lista('vehiculos').find(x => x.id === r.vehiculoId);
  const { cuerpo, cerrar } = abrirHoja(ETIQUETA_TIPO[tipo]);
  const nombreItem = itemId => datos.items.find(i => i.id === itemId)?.nombre ?? 'Ítem eliminado';

  let contenido = '';
  if (tipo === 'trabajo') {
    const guardada = leerFotoLocal(r.id);
    const src = guardada?.startsWith('data:image/') ? guardada : null;   // solo imágenes propias
    contenido = `
      <dl class="datos">
        <dt>Vehículo</dt><dd>${esc(v?.alias ?? '—')}</dd>
        <dt>Fecha</dt><dd>${esc(formatoFecha(r.fecha))}</dd>
        <dt>Km</dt><dd>${esc(formatoKm(r.km))}</dd>
        <dt>Tipo</dt><dd class="cap">${esc(r.tipoMtto)}</dd>
        ${r.proveedor ? `<dt>Proveedor</dt><dd>${esc(r.proveedor)}</dd>` : ''}
      </dl>
      <div class="pila">${r.lineas.map(l => `
        <div class="tarjeta compra"><span class="vehiculo-datos"><b>${esc(nombreItem(l.itemId))}</b>
          <small>${esc(l.cantidad)} × ${esc(formatoUSD(l.precioUnit))}${l.garantiaHasta ? ' · garantía hasta ' + esc(formatoFecha(l.garantiaHasta)) : ''}</small></span>
          <span class="vehiculo-km">${esc(formatoUSD(l.cantidad * l.precioUnit))}</span></div>`).join('')}</div>
      <p class="total-detalle">Total <b>${esc(formatoUSD(r.total))}</b></p>
      ${src ? `<img class="foto-previa" src="${src}" alt="Foto de la factura">` : r.foto ? '<p class="apagado" id="foto-remota">Cargando foto…</p>' : ''}`;
  } else if (tipo === 'combustible') {
    contenido = `
      <dl class="datos">
        <dt>Vehículo</dt><dd>${esc(v?.alias ?? '—')}</dd>
        <dt>Fecha</dt><dd>${esc(formatoFecha(r.fecha))}</dd>
        <dt>Km</dt><dd>${esc(formatoKm(r.km))}</dd>
        <dt>Litros</dt><dd>${esc(r.litros)}</dd>
        <dt>Precio por litro</dt><dd>${esc(formatoUSD(r.precioLitro))}</dd>
        <dt>Tanque lleno</dt><dd>${r.tanqueLleno ? 'Sí' : 'No'}</dd>
        ${r.estacion ? `<dt>Estación</dt><dd>${esc(r.estacion)}</dd>` : ''}
      </dl>
      <p class="total-detalle">Total <b>${esc(formatoUSD(r.total))}</b></p>`;
  } else {
    contenido = `
      <dl class="datos">
        <dt>Vehículo</dt><dd>${esc(v?.alias ?? '—')}</dd>
        <dt>Tipo</dt><dd class="cap">${esc(r.tipo)}</dd>
        ${r.entidad ? `<dt>Entidad</dt><dd>${esc(r.entidad)}</dd>` : ''}
        ${r.poliza ? `<dt>Póliza</dt><dd>${esc(r.poliza)}</dd>` : ''}
        <dt>Desde</dt><dd>${esc(formatoFecha(r.desde))}</dd>
        <dt>Vence</dt><dd>${esc(formatoFecha(r.vence))}</dd>
      </dl>
      <p class="total-detalle">Monto <b>${esc(formatoUSD(r.monto))}</b></p>`;
  }
  if (r.notas) contenido += `<p class="apagado">${esc(r.notas)}</p>`;

  cuerpo.innerHTML = `${contenido}
    <div class="acciones">
      ${RUTA_EDITAR[tipo] ? `<a class="btn btn-primario" href="${esc(RUTA_EDITAR[tipo](r.id))}" id="editar">Editar</a>` : ''}
      <button type="button" class="btn peligro" id="borrar">Borrar</button>
    </div>`;

  cuerpo.querySelector('#editar')?.addEventListener('click', cerrar);
  const marcaFoto = cuerpo.querySelector('#foto-remota');
  if (marcaFoto) {
    descargarFoto(r.foto).then(url => {
      if (!marcaFoto.isConnected) return;
      if (url) marcaFoto.outerHTML = `<img class="foto-previa" src="${url}" alt="Foto de la factura">`;
      else marcaFoto.textContent = 'La foto no está disponible todavía (sincroniza o revisa la conexión).';
    });
  }
  cuerpo.querySelector('#borrar').addEventListener('click', () => {
    if (!confirm('¿Borrar este registro? Se puede recuperar solo desde un respaldo.')) return;
    const itemIds = tipo === 'trabajo' ? r.lineas.map(l => l.itemId) : [];
    borrar(col, r.id);
    if (tipo === 'trabajo') { recalcularItems(itemIds); borrarFotoLocal(r.id); if (r.foto) registrarFotoPorBorrar(r.foto); }
    cerrar();
    toast('Registro borrado');
    alCambiar();
  });
}
