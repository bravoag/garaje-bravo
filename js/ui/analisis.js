// ui/analisis.js — KPIs y gráficos. Todo el cálculo vive en calc.js; aquí solo se pinta.
// Rutas: #/analisis (Global) y #/analisis/<vehiculoId>
import { datos, lista } from '../estado.js';
import { esc, hoyISO, formatoUSD, formatoKm, formatoNumero, formatoFecha } from '../util.js';
import { kpisGlobal, kpisVehiculo, periodoPreset, puestaAPunto, inversionTotal, inversionFlota } from '../calc.js';
import { colorSeguro } from './componentes.js';
import { CATEGORICOS, COLOR_OTROS, limpiarGraficos, cargarChart, barrasApiladas, dona, lineas, mesesContinuos, etiquetaMes, tabla } from './graficos.js';

// La selección sobrevive mientras la app está abierta.
const sel = { preset: 'todo', desde: '', hasta: '', incluir: { mantenimiento: true, combustible: true, seguros: true }, tab: 'general' };

const PRESETS = [['todo', 'Todo'], ['30d', '30 días'], ['90d', '90 días'], ['12m', '12 meses'], ['anio', 'Este año'], ['custom', 'Personalizado']];
const TABS = [['general', 'General'], ['gasto', 'Gasto'], ['combustible', 'Combustible']];
const ICONOS = {
  costo: 'M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 1.7 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3',
  distancia: 'M5 20 9 4M19 20 15 4M12 6v3M12 12v3M12 18v2',
  mensual: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  rendimiento: 'M4 16a8 8 0 1 1 16 0M12 16l4-5',
};
const dash = '—';
const usd = n => (n === null || n === undefined ? dash : formatoUSD(n));
const usdKm = n => (n === null || n === undefined ? dash : `${formatoNumero(n, 3)} US$/km`);

export function render(vista, param) {
  limpiarGraficos();
  const vehiculos = lista('vehiculos');
  if (!vehiculos.length) {
    vista.innerHTML = `
      <header class="cabecera"><span class="etiqueta">KPIs</span><h1>Análisis</h1></header>
      <section class="tarjeta vacio">
        <h2>Aún no hay vehículos</h2>
        <p>Agrega un vehículo y registra trabajos o combustible para ver costos por km y por mes.</p>
        <a class="btn btn-primario" href="#/vehiculos/nuevo">Agregar vehículo</a>
      </section>`;
    return;
  }
  const vehiculoId = vehiculos.some(v => v.id === param) ? param : null;
  const usaSeguros = vehiculos.some(v => v.usaSeguros);
  const hoy = hoyISO();
  const periodo = sel.preset === 'custom' ? { desde: sel.desde || null, hasta: sel.hasta || null } : periodoPreset(sel.preset, hoy);
  const incluir = { ...sel.incluir, seguros: sel.incluir.seguros && usaSeguros };
  const k = vehiculoId ? kpisVehiculo(datos, vehiculoId, periodo, incluir, hoy) : kpisGlobal(datos, periodo, incluir, hoy);
  const v = vehiculoId ? vehiculos.find(x => x.id === vehiculoId) : null;

  vista.innerHTML = `<div id="analisis">
    <header class="cabecera"><span class="etiqueta">KPIs</span><h1>Análisis</h1></header>
    <div class="chips" role="radiogroup" aria-label="Vehículo">
      <label class="chip"><input type="radio" name="veh" value="" ${!vehiculoId ? 'checked' : ''}><span>Global</span></label>
      ${vehiculos.map(x => `<label class="chip" style="--c:${colorSeguro(x.color)}"><input type="radio" name="veh" value="${esc(x.id)}" ${x.id === vehiculoId ? 'checked' : ''}><span>${esc(x.alias)}</span></label>`).join('')}
    </div>
    <div class="filtros-fila">
      <div class="chips desliza" role="radiogroup" aria-label="Período">
        ${PRESETS.map(([val, txt]) => `<label class="chip chip-chico"><input type="radio" name="periodo" value="${val}" ${sel.preset === val ? 'checked' : ''}><span>${txt}</span></label>`).join('')}
      </div>
      ${sel.preset === 'custom' ? `<div class="fila">
        <label class="campo">Desde<input class="entrada" type="date" name="desde" value="${esc(sel.desde)}"></label>
        <label class="campo">Hasta<input class="entrada" type="date" name="hasta" value="${esc(sel.hasta)}"></label></div>` : ''}
      <div class="chips" aria-label="Qué incluir">
        <label class="chip chip-chico"><input type="checkbox" name="incluir" value="mantenimiento" ${sel.incluir.mantenimiento ? 'checked' : ''}><span>Mantenimiento</span></label>
        <label class="chip chip-chico"><input type="checkbox" name="incluir" value="combustible" ${sel.incluir.combustible ? 'checked' : ''}><span>Combustible</span></label>
        ${usaSeguros ? `<label class="chip chip-chico"><input type="checkbox" name="incluir" value="seguros" ${sel.incluir.seguros ? 'checked' : ''}><span>Seguros</span></label>` : ''}
      </div>
    </div>
    ${vehiculoId ? `<p class="solo-pc"><a class="btn" href="#/hoja/${esc(vehiculoId)}">Hoja de vida (PDF)</a></p>` : ''}
    <div class="pestanas" role="tablist">
      ${TABS.map(([val, txt]) => `<button type="button" role="tab" class="pestana" data-tab="${val}" aria-selected="${sel.tab === val}">${txt}</button>`).join('')}
    </div>
    <div id="contenido" role="tabpanel"></div>
  </div>`;

  const raiz = vista.querySelector('#analisis');
  const contenido = raiz.querySelector('#contenido');
  const repintar = () => render(vista, vehiculoId);

  raiz.addEventListener('change', e => {
    const n = e.target.name;
    if (n === 'veh') { location.hash = e.target.value ? `#/analisis/${e.target.value}` : '#/analisis'; return; }
    if (n === 'periodo') sel.preset = e.target.value;
    if (n === 'desde') sel.desde = e.target.value;
    if (n === 'hasta') sel.hasta = e.target.value;
    if (n === 'incluir') sel.incluir[e.target.value] = e.target.checked;
    repintar();
  });
  raiz.querySelector('.pestanas').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) { sel.tab = b.dataset.tab; repintar(); }
  });

  const ctx = { k, v, vehiculoId, vehiculos, periodo, incluir };
  if (sel.tab === 'general') contenido.innerHTML = pestanaGeneral(ctx);
  else if (sel.tab === 'gasto') pestanaGasto(contenido, ctx);
  else pestanaCombustible(contenido, ctx);
}

// ---------- General ----------
function tarjeta(icono, titulo, valor, minis, tono = '') {
  return `<article class="kpi ${tono}">
    <header><span class="kpi-icono" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${ICONOS[icono]}"/></svg></span><span class="etiqueta">${esc(titulo)}</span></header>
    <b class="kpi-valor">${esc(valor)}</b>
    <div class="kpi-mini">${minis.map(([t, val]) => `<span>${esc(t)} <b>${esc(val)}</b></span>`).join('')}</div>
  </article>`;
}

function pestanaGeneral({ k, vehiculoId, vehiculos }) {
  const sinKm = k.km === null;
  const tarjetas = `<div class="kpis">
    ${tarjeta('costo', 'Costo total', usd(k.gasto), [['Por día', usd(k.costoPorDia)], ['Por km', usdKm(k.costoPorKm)]], 'kpi-calido')}
    ${tarjeta('distancia', 'Distancia', sinKm ? dash : formatoKm(k.km), [['Por día', k.kmDiario === null ? dash : `${formatoNumero(k.kmDiario, 1)} km`]])}
    ${tarjeta('mensual', 'Gasto mensual promedio', usd(k.gastoMensual), [['Meses', formatoNumero(k.meses, 1)], ['Días', String(k.dias)]], 'kpi-calido')}
    ${tarjeta('rendimiento', 'Rendimiento', k.kmPorDolar === null ? dash : `${formatoNumero(k.kmPorDolar, 2)} km/US$`, [['Costo por km', usdKm(k.costoPorKm)]])}
  </div>`;

  const pv = k.preventivoPct === null ? '' : `
    <section class="tarjeta">
      <h2>Preventivo vs correctivo</h2>
      <div class="particion" role="img" aria-label="Preventivo ${formatoNumero(k.preventivoPct, 0)} por ciento, correctivo ${formatoNumero(k.correctivoPct, 0)} por ciento">
        <i style="flex:${k.preventivoPct};background:${CATEGORICOS[0]}"></i><i style="flex:${k.correctivoPct};background:${CATEGORICOS[1]}"></i>
      </div>
      <div class="leyenda-html">
        <span><i style="background:${CATEGORICOS[0]}"></i>Preventivo <b>${esc(formatoNumero(k.preventivoPct, 0))} %</b></span>
        <span><i style="background:${CATEGORICOS[1]}"></i>Correctivo <b>${esc(formatoNumero(k.correctivoPct, 0))} %</b></span>
      </div>
    </section>`;

  const maxKm = k.ranking?.[0]?.costoPorKm ?? 0;
  const ranking = !vehiculoId && k.ranking?.length > 1 ? `
    <section class="tarjeta">
      <h2>Ranking por costo por km</h2>
      <p class="ayuda">De más caro a más barato.</p>
      <div class="ranking">${k.ranking.map(r => {
        const ve = vehiculos.find(x => x.id === r.vehiculoId);
        return `<div class="rank-fila" style="--c:${colorSeguro(ve?.color)}">
          <span class="rank-nombre"><i class="vehiculo-punto" aria-hidden="true"></i>${esc(ve?.alias ?? '—')}</span>
          <span class="rank-valor">${esc(usdKm(r.costoPorKm))}</span>
          <span class="rank-barra"><i style="width:${maxKm ? (r.costoPorKm / maxKm) * 100 : 0}%"></i></span>
        </div>`;
      }).join('')}</div>
    </section>` : '';

  const vacio = k.gasto === 0 ? '<p class="apagado">Sin gastos en este período. Prueba con otro período o registra un trabajo.</p>' : '';
  return `${tarjetas}${vacio}${seccionInversion(vehiculoId)}${seccionPuestaAPunto(vehiculoId)}${seccionRepuestos(k)}${pv}${ranking}
    <p class="ayuda nota">El costo por km solo es confiable si registras el km con regularidad.</p>`;
}

// ---- Piezas de la pestaña General ----
const partes = lista => lista.filter(p => p.valor > 0);
function barraPartes(lista, descripcion) {
  const v = partes(lista);
  if (!v.length) return '';
  return `<div class="particion" role="img" aria-label="${esc(descripcion)}">${v.map(p => `<i style="flex:${p.valor};background:${p.color}"></i>`).join('')}</div>
    <div class="leyenda-html">${v.map(p => `<span><i style="background:${p.color}"></i>${esc(p.nombre)} <b>${esc(formatoUSD(p.valor))}</b></span>`).join('')}</div>`;
}

// Inversión desde la compra: no depende del filtro de período (es acumulada).
function seccionInversion(vehiculoId) {
  const hoy = hoyISO();
  const inv = vehiculoId ? inversionTotal(datos, vehiculoId, hoy) : inversionFlota(datos, hoy);
  if (!inv || inv.total === 0) return '';
  const puestaEnCurso = vehiculoId ? inv.enCurso : false;
  return `<section class="tarjeta">
    <h2>Inversión desde la compra</h2>
    <b class="franja-total">${esc(formatoUSD(inv.total))}</b>
    ${barraPartes([
      { nombre: 'Compra', valor: inv.compra ?? 0, color: CATEGORICOS[0] },
      { nombre: puestaEnCurso ? 'Puesta a punto (en curso)' : 'Puesta a punto', valor: inv.puesta, color: CATEGORICOS[1] },
      { nombre: inv.puestaAplica ? 'Operación normal' : 'Gastos registrados', valor: inv.operacion, color: CATEGORICOS[2] },
    ], 'Reparto de la inversión total')}
    ${inv.pctGastoSobreCompra !== null ? `<p class="ayuda">Lo gastado después de comprar equivale al ${esc(formatoNumero(inv.pctGastoSobreCompra, 1))} % del precio de compra.</p>` : '<p class="ayuda">Pon el precio de compra en el vehículo para ver esta proporción.</p>'}
    <p class="ayuda">Es acumulado: no depende del período elegido arriba.</p>
  </section>`;
}

// Puesta a punto (solo con un vehículo elegido): cuánto va y cómo se comporta la operación normal desde que termina.
function seccionPuestaAPunto(vehiculoId) {
  if (!vehiculoId) return '';
  const p = puestaAPunto(datos, vehiculoId, hoyISO());
  if (!p?.aplica) return '';
  const op = p.operacion;
  return `<section class="tarjeta">
    <h2>Puesta a punto</h2>
    ${p.enCurso
      ? `<p class="estado estado-proximo"><span aria-hidden="true">●</span> En curso · ${esc(formatoUSD(p.puesta.gasto))} invertidos</p>
         <p class="ayuda">Cuando termines, <a href="#/vehiculos/${esc(vehiculoId)}">pon la fecha de fin en el vehículo</a>: desde ahí verás tu costo en operación normal.</p>`
      : `<p class="estado estado-ok"><span aria-hidden="true">✓</span> Terminó el ${esc(formatoFecha(p.fin))} · ${esc(formatoUSD(p.puesta.gasto))}</p>
         <h3 class="subtitulo">Operación normal desde entonces</h3>
         ${op && op.gasto + (op.km ?? 0) > 0 ? `<div class="kpis">
            ${tarjeta('mensual', 'Gasto mensual', usd(op.gastoMensual), [['Días', String(op.dias)]], 'kpi-calido')}
            ${tarjeta('costo', 'Costo por km', usdKm(op.costoPorKm), [['Por día', usd(op.costoPorDia)], ['Km', op.km === null ? dash : formatoKm(op.km)]])}
          </div>` : '<p class="ayuda">Aún sin gastos ni km después de esa fecha: aparecerán a medida que registres.</p>'}`}
  </section>`;
}

// Repuestos vs servicios (líneas de los trabajos del período elegido).
function seccionRepuestos(k) {
  const total = k.gastoRepuestos + k.gastoServicios;
  if (total <= 0) return '';
  return `<section class="tarjeta">
    <h2>Repuestos vs servicios</h2>
    ${barraPartes([
      { nombre: `Repuestos ${formatoNumero((k.gastoRepuestos / total) * 100, 0)} %`, valor: k.gastoRepuestos, color: CATEGORICOS[2] },
      { nombre: `Servicios ${formatoNumero((k.gastoServicios / total) * 100, 0)} %`, valor: k.gastoServicios, color: CATEGORICOS[3] },
    ], 'Reparto entre repuestos y servicios')}
    ${k.gastoManoObra > 0 ? `<p class="ayuda">De los servicios, mano de obra: <b>${esc(formatoUSD(k.gastoManoObra))}</b> (${esc(formatoNumero((k.gastoManoObra / total) * 100, 0))} % del mantenimiento). Cuenta los ítems cuyo nombre empieza por «Mano de obra».</p>` : ''}
  </section>`;
}

// ---------- Gasto ----------
function pestanaGasto(contenido, { k, v, vehiculoId, vehiculos, periodo, incluir }) {
  const mesesConDatos = k.porMes.map(m => m.mes);
  const meses = mesesContinuos(mesesConDatos);
  const hayDatos = k.gasto > 0;

  // Series de barras: en Global una por vehículo (su color); en un vehículo, por categoría general.
  let series;
  if (!vehiculoId) {
    series = vehiculos.map(x => ({ nombre: x.alias, color: colorSeguro(x.color), datos: meses.map(m => k.porMes.find(p => p.mes === m)?.porVehiculo[x.id] ?? 0) }))
      .filter(s => s.datos.some(d => d > 0));
  } else {
    series = [['mantenimiento', 'Mantenimiento'], ['combustible', 'Combustible'], ['seguros', 'Seguros']]
      .filter(([c]) => incluir[c])
      .map(([c, nombre], i) => ({ nombre, color: CATEGORICOS[i], datos: meses.map(m => k.porMes.find(p => p.mes === m)?.[c] ?? 0) }))
      .filter(s => s.datos.some(d => d > 0));
  }

  // Dona: top 6 categorías + "Otros".
  const cats = Object.entries(k.porCategoria).sort((a, b) => b[1] - a[1]);
  const partes = cats.slice(0, 6).map(([nombre, valor], i) => ({ nombre, valor, color: CATEGORICOS[i] }));
  const resto = cats.slice(6).reduce((s, [, val]) => s + val, 0);
  if (resto > 0) partes.push({ nombre: 'Otros', valor: resto, color: COLOR_OTROS });
  const totalCat = partes.reduce((s, p) => s + p.valor, 0);

  const maxItem = k.topItems[0]?.gasto ?? 0;

  if (!hayDatos) { contenido.innerHTML = '<section class="tarjeta vacio"><h2>Sin gastos en este período</h2><p>Registra trabajos o combustible, o cambia el período.</p><a class="btn btn-primario" href="#/registrar">Registrar</a></section>'; return; }

  contenido.innerHTML = `
    <section class="tarjeta">
      <h2>Gasto por mes</h2>
      <div class="grafico" style="height:240px"><canvas id="g-meses" role="img" aria-label="Gasto por mes"></canvas></div>
      ${tabla(['Mes', ...series.map(s => s.nombre)], meses.map((m, i) => [etiquetaMes(m), ...series.map(s => formatoUSD(s.datos[i]))]))}
    </section>
    <section class="tarjeta">
      <h2>Gasto por categoría</h2>
      <div class="dona-fila">
        <div class="grafico dona-lienzo"><canvas id="g-dona" role="img" aria-label="Gasto por categoría"></canvas></div>
        <ul class="leyenda-lista">${partes.map(p => `<li><i style="background:${p.color}"></i><span>${esc(p.nombre)}</span><b>${esc(formatoUSD(p.valor))}</b><small>${esc(formatoNumero((p.valor / totalCat) * 100, 0))} %</small></li>`).join('')}</ul>
      </div>
    </section>
    ${k.topItems.length ? `<section class="tarjeta">
      <h2>Ítems con más gasto</h2>
      <div class="ranking">${k.topItems.map(i => `<div class="rank-fila" style="--c:${CATEGORICOS[0]}">
        <span class="rank-nombre">${esc(i.nombre)}</span><span class="rank-valor">${esc(formatoUSD(i.gasto))}</span>
        <span class="rank-barra"><i style="width:${maxItem ? (i.gasto / maxItem) * 100 : 0}%"></i></span></div>`).join('')}</div>
    </section>` : ''}`;

  cargarChart().then(() => {
    const c1 = contenido.querySelector('#g-meses'), c2 = contenido.querySelector('#g-dona');
    if (c1) barrasApiladas(c1, meses, series);
    if (c2) dona(c2, partes);
  }).catch(() => { contenido.insertAdjacentHTML('afterbegin', '<p class="error" role="alert">No se pudieron cargar los gráficos. Revisa la conexión y recarga.</p>'); });
}

// ---------- Combustible ----------
function pestanaCombustible(contenido, { k, vehiculoId, vehiculos }) {
  const porVeh = vehiculoId ? [k] : k.porVehiculo;
  const nombreDe = id => vehiculos.find(x => x.id === id);
  const litros = porVeh.reduce((s, x) => s + x.combustible.litros, 0);
  const gasto = porVeh.reduce((s, x) => s + x.combustible.gasto, 0);

  if (!porVeh.some(x => x.combustible.llenados.length)) {
    contenido.innerHTML = '<section class="tarjeta vacio"><h2>Sin llenados en este período</h2><p>Registra combustible para ver el rendimiento.</p><a class="btn btn-primario" href="#/registrar/combustible">Registrar llenado</a></section>';
    return;
  }

  const kmLPorVeh = porVeh.map(x => ({ alias: nombreDe(x.vehiculoId)?.alias ?? '—', color: colorSeguro(nombreDe(x.vehiculoId)?.color), val: x.combustible.kmPorLitroPromedio, costoKm: x.costoCombustiblePorKm }));
  const seriesKmL = porVeh.map(x => ({ nombre: nombreDe(x.vehiculoId)?.alias ?? '—', color: colorSeguro(nombreDe(x.vehiculoId)?.color), puntos: x.combustible.llenados.filter(l => l.kmPorLitro !== null).map(l => ({ fecha: l.fecha, y: l.kmPorLitro })) })).filter(s => s.puntos.length);
  const seriesPrecio = porVeh.map(x => ({ nombre: nombreDe(x.vehiculoId)?.alias ?? '—', color: colorSeguro(nombreDe(x.vehiculoId)?.color), puntos: x.combustible.precioLitro.filter(p => Number.isFinite(p.precioLitro)).map(p => ({ fecha: p.fecha, y: p.precioLitro })) })).filter(s => s.puntos.length);

  contenido.innerHTML = `
    <div class="kpis">
      <article class="kpi"><header><span class="etiqueta">Litros</span></header><b class="kpi-valor">${esc(formatoNumero(litros, 1))} L</b></article>
      <article class="kpi kpi-calido"><header><span class="etiqueta">Gasto en combustible</span></header><b class="kpi-valor">${esc(formatoUSD(gasto))}</b></article>
    </div>
    <section class="tarjeta">
      <h2>Rendimiento promedio</h2>
      <div class="ranking">${kmLPorVeh.map(x => `<div class="rank-fila" style="--c:${x.color}">
        <span class="rank-nombre"><i class="vehiculo-punto" aria-hidden="true"></i>${esc(x.alias)}</span>
        <span class="rank-valor">${x.val === null ? dash : esc(formatoNumero(x.val, 1) + ' km/L')}</span>
        <small class="apagado rank-sub">${x.costoKm === null ? '' : esc(usdKm(x.costoKm)) + ' en combustible'}</small></div>`).join('')}</div>
      ${kmLPorVeh.every(x => x.val === null) ? '<p class="ayuda">Para calcular km/L necesitas al menos dos llenados con «tanque lleno».</p>' : ''}
    </section>
    ${seriesKmL.length ? `<section class="tarjeta"><h2>km por litro en cada llenado</h2>
      <div class="grafico" style="height:220px"><canvas id="g-kml" role="img" aria-label="Kilómetros por litro por llenado"></canvas></div>
      ${tabla(['Vehículo', 'Fecha', 'km/L'], seriesKmL.flatMap(s => s.puntos.map(p => [s.nombre, p.fecha, formatoNumero(p.y, 1)])))}</section>` : ''}
    ${seriesPrecio.length ? `<section class="tarjeta"><h2>Precio por litro</h2>
      <div class="grafico" style="height:220px"><canvas id="g-precio" role="img" aria-label="Precio por litro en el tiempo"></canvas></div>
      ${tabla(['Vehículo', 'Fecha', 'US$/L'], seriesPrecio.flatMap(s => s.puntos.map(p => [s.nombre, p.fecha, formatoNumero(p.y, 3)])))}</section>` : ''}`;

  cargarChart().then(() => {
    const a = contenido.querySelector('#g-kml'), b = contenido.querySelector('#g-precio');
    if (a) lineas(a, seriesKmL, { formatoY: v => formatoNumero(v, 1), sufijo: ' km/L' });
    if (b) lineas(b, seriesPrecio, { formatoY: v => formatoNumero(v, 2), sufijo: ' US$/L' });
  }).catch(() => { contenido.insertAdjacentHTML('afterbegin', '<p class="error" role="alert">No se pudieron cargar los gráficos. Revisa la conexión y recarga.</p>'); });
}
