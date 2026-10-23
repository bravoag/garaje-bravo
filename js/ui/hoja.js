// ui/hoja.js — hoja de vida imprimible de un vehículo (#/hoja/<id>). Solo desde ordenador.
// "Imprimir / Guardar PDF" usa window.print(): en el diálogo del navegador se elige "Guardar como PDF". Sin librerías.
import { datos, lista } from '../estado.js';
import { esc, hoyISO, formatoUSD, formatoKm, formatoFecha, formatoNumero } from '../util.js';
import { hojaDeVida } from '../calc.js';
import { colorSeguro } from './componentes.js';

// El filtro sobrevive mientras la app está abierta.
const filtro = { desde: '', hasta: '', extra: false };

const cap = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
const pct = n => (n === null ? '—' : `${formatoNumero(n, 0)} %`);

export function render(vista, param) {
  const hoy = hoyISO();
  const v = lista('vehiculos').find(x => x.id === param);
  if (!v) {
    vista.innerHTML = `
      <header class="cabecera"><span class="etiqueta">Documento</span><h1>Hoja de vida</h1></header>
      <section class="tarjeta vacio"><h2>Vehículo no encontrado</h2><a class="btn btn-primario" href="#/vehiculos">Ir a Vehículos</a></section>`;
    return;
  }
  const h = hojaDeVida(datos, v.id, { desde: filtro.desde || null, hasta: filtro.hasta || null }, hoy);
  const r = h.resumen;

  // Historial con subtotal al cierre de cada año.
  let filas = '';
  h.historial.forEach((t, i) => {
    filas += `<tr>
      <td>${esc(formatoFecha(t.fecha))}</td><td class="num">${esc(formatoKm(t.km))}</td><td>${esc(cap(t.tipoMtto))}</td>
      <td>${t.lineas.map(l => `${esc(formatoNumero(l.cantidad, Number.isInteger(l.cantidad) ? 0 : 2))} × ${esc(l.nombre)} <span class="gris">(${esc(formatoUSD(l.precioUnit))})</span>`).join('<br>')}</td>
      <td class="num">${esc(formatoUSD(t.total))}</td></tr>`;
    const sigue = h.historial[i + 1];
    if (!sigue || sigue.fecha.slice(0, 4) !== t.fecha.slice(0, 4)) {
      const anio = t.fecha.slice(0, 4);
      filas += `<tr class="subtotal"><td colspan="4">Subtotal ${esc(anio)}</td><td class="num">${esc(formatoUSD(h.subtotalesAnio.find(s => s.anio === anio).total))}</td></tr>`;
    }
  });

  vista.innerHTML = `<div class="solo-pc">
    <div class="no-imprimir controles-hoja">
      <a class="volver" href="#/vehiculos/${esc(v.id)}">‹ ${esc(v.alias)}</a>
      <div class="fila">
        <label class="campo">Desde<input class="entrada" type="date" name="desde" value="${esc(filtro.desde)}"></label>
        <label class="campo">Hasta<input class="entrada" type="date" name="hasta" value="${esc(filtro.hasta)}"></label>
      </div>
      <label class="interruptor"><input type="checkbox" name="extra" ${filtro.extra ? 'checked' : ''}> Incluir combustible y seguros</label>
      <button type="button" class="btn btn-primario" id="imprimir">Imprimir / Guardar PDF</button>
    </div>

    <article class="hoja-vida" style="--c:${colorSeguro(v.color)}">
      <header class="hv-encabezado">
        <p class="hv-sup">Hoja de vida del vehículo · emitida el ${esc(formatoFecha(hoy))}</p>
        <h1>${esc(v.alias)}</h1>
        <dl class="hv-datos">
          <div><dt>Marca y modelo</dt><dd>${esc(v.marca)} ${esc(v.modelo)}</dd></div>
          <div><dt>Año</dt><dd>${esc(v.anio)}</dd></div>
          <div><dt>Placa</dt><dd>${esc(v.placa)}</dd></div>
          <div><dt>VIN</dt><dd>${esc(v.vin || '—')}</dd></div>
          <div><dt>Combustible</dt><dd>${esc(cap(v.combustible) || '—')}</dd></div>
          <div><dt>Alta / compra</dt><dd>${esc(formatoFecha(v.fechaCompra || v.fechaAlta))}</dd></div>
          <div><dt>Km actual</dt><dd>${esc(formatoKm(h.kmActual))}</dd></div>
        </dl>
      </header>

      <section>
        <h2>Resumen de mantenimiento</h2>
        <dl class="hv-datos">
          <div><dt>Trabajos</dt><dd>${r.trabajos}</dd></div>
          <div><dt>Gasto total</dt><dd>${esc(formatoUSD(r.gasto))}</dd></div>
          <div><dt>Costo por km</dt><dd>${r.costoPorKm === null ? '—' : esc(formatoNumero(r.costoPorKm, 3)) + ' US$/km'}</dd></div>
          <div><dt>Gasto mensual promedio</dt><dd>${esc(formatoUSD(r.gastoMensual))}</dd></div>
          <div><dt>Último servicio</dt><dd>${r.ultimo ? `${esc(formatoFecha(r.ultimo.fecha))} · ${esc(formatoKm(r.ultimo.km))}` : '—'}</dd></div>
          <div><dt>Preventivo / correctivo</dt><dd>${pct(r.preventivoPct)} / ${pct(r.correctivoPct)}</dd></div>
        </dl>
      </section>

      <section>
        <h2>Historial de mantenimiento <span class="gris">(del más reciente al más antiguo)</span></h2>
        ${h.historial.length ? `<table class="hv-tabla">
          <thead><tr><th>Fecha</th><th>Km</th><th>Tipo</th><th>Ítems</th><th>Total</th></tr></thead>
          <tbody>${filas}</tbody></table>` : '<p class="gris">Sin trabajos en el período elegido.</p>'}
      </section>

      ${h.garantias.length ? `<section>
        <h2>Garantías vigentes</h2>
        <table class="hv-tabla"><thead><tr><th>Ítem</th><th>Instalado</th><th>Garantía hasta</th></tr></thead>
        <tbody>${h.garantias.map(g => `<tr><td>${esc(g.nombre)}</td><td>${esc(formatoFecha(g.fecha))}</td><td>${esc(formatoFecha(g.garantiaHasta))}</td></tr>`).join('')}</tbody></table>
      </section>` : ''}

      ${h.proximos.length ? `<section>
        <h2>Próximos servicios</h2>
        <table class="hv-tabla"><thead><tr><th>Servicio</th><th>Estado</th><th>Próximo</th></tr></thead>
        <tbody>${h.proximos.map(p => `<tr><td>${esc(p.nombre)}</td><td>${p.estado === 'vencido' ? '▲ Vencido' : '● Próximo'}</td>
          <td>${[p.proximoKm !== null && `a los ${formatoKm(p.proximoKm)}`, p.proximaFecha && `el ${formatoFecha(p.proximaFecha)}`].filter(Boolean).map(esc).join(' o ')}</td></tr>`).join('')}</tbody></table>
      </section>` : ''}

      ${filtro.extra ? `<section>
        <h2>Combustible</h2>
        ${h.combustible.llenados ? `<dl class="hv-datos">
          <div><dt>Llenados</dt><dd>${h.combustible.llenados}</dd></div>
          <div><dt>Litros</dt><dd>${esc(formatoNumero(h.combustible.litros, 1))} L</dd></div>
          <div><dt>Gasto</dt><dd>${esc(formatoUSD(h.combustible.gasto))}</dd></div>
          <div><dt>Rendimiento promedio</dt><dd>${h.combustible.kmPorLitroPromedio === null ? '—' : esc(formatoNumero(h.combustible.kmPorLitroPromedio, 1)) + ' km/L'}</dd></div>
        </dl>` : '<p class="gris">Sin llenados en el período.</p>'}
        <h2>Seguros y documentos vigentes</h2>
        ${h.segurosVigentes.length ? `<table class="hv-tabla"><thead><tr><th>Tipo</th><th>Entidad</th><th>Póliza</th><th>Vence</th></tr></thead>
          <tbody>${h.segurosVigentes.map(s => `<tr><td>${esc(cap(s.tipo))}</td><td>${esc(s.entidad)}</td><td>${esc(s.poliza || '—')}</td><td>${esc(formatoFecha(s.vence))}</td></tr>`).join('')}</tbody></table>` : '<p class="gris">Ninguno vigente.</p>'}
      </section>` : ''}
    </article>
  </div>
  <p class="solo-pc-aviso">La hoja de vida está disponible desde un ordenador.</p>`;

  const controles = vista.querySelector('.controles-hoja');
  controles?.addEventListener('change', e => {
    if (e.target.name === 'desde') filtro.desde = e.target.value;
    if (e.target.name === 'hasta') filtro.hasta = e.target.value;
    if (e.target.name === 'extra') filtro.extra = e.target.checked;
    render(vista, param);
  });
  vista.querySelector('#imprimir')?.addEventListener('click', () => window.print());
}
