// ui/inicio.js — resumen de la flota y una tarjeta por vehículo. Solo pinta: los cálculos vienen de calc.js.
import { datos, lista } from '../estado.js';
import { esc, hoyISO, formatoUSD, formatoKm, formatoNumero } from '../util.js';
import { kpisGlobal, kpisVehiculo, kmActual, recordatorios, alertasPorVehiculo, puestaAPunto, ritmoUso } from '../calc.js';
import { colorSeguro } from './componentes.js';

const TODOS = { mantenimiento: true, combustible: true, seguros: true };
const TODO = { desde: null, hasta: null };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function chipAlerta(a, tieneProgramados) {
  if (a?.vencidos) return `<span class="estado estado-vencido"><span aria-hidden="true">▲</span> ${plural(a.vencidos, 'vencido', 'vencidos')}</span>`;
  if (a?.proximos) return `<span class="estado estado-proximo"><span aria-hidden="true">●</span> ${plural(a.proximos, 'próximo', 'próximos')}</span>`;
  if (a?.kmDesactualizado) return `<span class="estado estado-proximo"><span aria-hidden="true">●</span> Actualiza el km (${plural(a.kmDesactualizado, 'día', 'días')})</span>`;
  if (tieneProgramados) return '<span class="estado estado-ok"><span aria-hidden="true">✓</span> Al día</span>';
  return '<span class="estado estado-sin-registro"><span aria-hidden="true">–</span> Sin servicios programados</span>';
}

export function render(vista) {
  const vehiculos = lista('vehiculos').filter(v => v.estado !== 'vendido');
  if (!vehiculos.length) {
    vista.innerHTML = `
      <header class="cabecera"><span class="etiqueta">Resumen</span><h1>Inicio</h1></header>
      <section class="tarjeta vacio">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13l2-5h14l2 5M3 13v5h2m14 0h2v-5M5 18h14M7 15.5h.01M17 15.5h.01"/></svg>
        <h2>Bienvenido a Garaje Bravo</h2>
        <p>Agrega tu primer vehículo para empezar a controlar mantenimiento, combustible y costos.</p>
        <a class="btn btn-primario" href="#/vehiculos/nuevo">Agregar vehículo</a>
      </section>`;
    return;
  }

  const hoy = hoyISO();
  const mes = kpisGlobal(datos, { desde: hoy.slice(0, 8) + '01', hasta: hoy }, TODOS, hoy);
  const nombreMes = new Date(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  const rec = recordatorios(datos, hoy);
  const alertas = alertasPorVehiculo(rec);
  const vencidos = Object.values(alertas).reduce((s, a) => s + a.vencidos, 0);
  const proximos = Object.values(alertas).reduce((s, a) => s + a.proximos, 0);
  const sinKm = Object.values(alertas).filter(a => a.kmDesactualizado).length;

  const resumenAlertas = vencidos || proximos || sinKm
    ? [vencidos && `<span class="estado estado-vencido"><span aria-hidden="true">▲</span> ${plural(vencidos, 'vencido', 'vencidos')}</span>`,
       proximos && `<span class="estado estado-proximo"><span aria-hidden="true">●</span> ${plural(proximos, 'próximo', 'próximos')}</span>`,
       sinKm && `<span class="estado estado-proximo"><span aria-hidden="true">●</span> Km sin actualizar (${sinKm})</span>`].filter(Boolean).join('')
    : '<span class="estado estado-ok"><span aria-hidden="true">✓</span> Todo al día</span>';

  const tarjetas = vehiculos.map(v => {
    const pp = puestaAPunto(datos, v.id, hoy);
    // Terminada la puesta a punto, la tarjeta muestra la operación normal (el número que debe bajar); mientras tanto, lo acumulado.
    const enOperacion = !pp.enCurso && pp.operacion && pp.operacion.km !== null;
    const k = enOperacion ? pp.operacion : kpisVehiculo(datos, v.id, TODO, TODOS, hoy);
    const ritmo = ritmoUso(datos, v.id, hoy);
    const a = alertas[v.id];
    return `
    <a class="tarjeta vehiculo-inicio" href="#/analisis/${esc(v.id)}" style="--c:${colorSeguro(v.color)}">
      <span class="vi-cab">
        <span class="vehiculo-punto" aria-hidden="true"></span>
        <span class="vehiculo-datos"><b>${esc(v.alias)}</b><small>${esc(v.marca)} ${esc(v.modelo)} · ${esc(v.placa)}</small></span>
        <span class="vi-km">${esc(formatoKm(kmActual(datos, v.id)))}</span>
      </span>
      <span class="vi-mini">
        <span>Costo por km${enOperacion ? ' · operación' : ''}<b>${k.costoPorKm === null ? '—' : esc(formatoNumero(k.costoPorKm, 3)) + ' US$'}</b></span>
        <span>Gasto mensual${enOperacion ? ' · operación' : ''}<b>${esc(formatoUSD(k.gastoMensual))}</b></span>
      </span>
      ${ritmo ? `<span class="vi-ritmo">Ritmo: ${esc(formatoNumero(ritmo.kmPorDia, 0))} km/día · ~${esc(formatoKm(ritmo.kmAnual))}/año</span>` : ''}
      ${pp.enCurso && pp.puesta.gasto > 0 ? `<span class="estado estado-sin-registro"><span aria-hidden="true">●</span> Puesta a punto en curso · ${esc(formatoUSD(pp.puesta.gasto))}</span>` : ''}
      ${chipAlerta(a, v.programados?.length > 0)}
    </a>`;
  }).join('');

  vista.innerHTML = `
    <header class="cabecera"><span class="etiqueta">Resumen</span><h1>Inicio</h1></header>
    <section class="tarjeta franja">
      <span class="etiqueta">Gasto de ${esc(nombreMes)}</span>
      <b class="franja-total">${esc(formatoUSD(mes.gasto))}</b>
      <a class="alertas-resumen" href="#/recordatorios" aria-label="Ver avisos">${resumenAlertas}<span class="ir" aria-hidden="true">›</span></a>
    </section>
    <div class="pila">${tarjetas}</div>`;
}
