// ui/recordatorios.js — servicios y documentos: Vencidos / Próximos / Sin registro previo / Al día.
// El cálculo vive en calc.recordatorios(); aquí solo se pinta. Estado siempre con icono + texto.
import { datos, lista } from '../estado.js';
import { esc, hoyISO, formatoKm, formatoFecha } from '../util.js';
import { recordatorios } from '../calc.js';
import { colorSeguro, chipEstado } from './componentes.js';

const SECCIONES = [['vencido', 'Vencidos'], ['proximo', 'Próximos'], ['sin-registro', 'Sin registro previo'], ['ok', 'Al día']];

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function detalleServicio(r) {
  if (r.estado === 'sin-registro') return 'Registra el último cambio real para calcular el próximo.';
  const objetivo = [r.proximoKm !== null && `a los ${formatoKm(r.proximoKm)}`, r.proximaFecha && `el ${formatoFecha(r.proximaFecha)}`].filter(Boolean).join(' o ');
  const estado = [];
  if (r.kmRestantes !== null) estado.push(r.kmRestantes > 0 ? `faltan ${formatoKm(r.kmRestantes)}` : `pasado por ${formatoKm(-r.kmRestantes)}`);
  if (r.diasRestantes !== null) estado.push(r.diasRestantes > 0 ? `faltan ${plural(r.diasRestantes, 'día', 'días')}` : r.diasRestantes === 0 ? 'vence hoy' : `venció hace ${plural(-r.diasRestantes, 'día', 'días')}`);
  return `Próximo ${objetivo} · ${estado.join(' · ')}`;
}

function detalleSeguro(s) {
  const cuando = s.diasRestantes > 0 ? `faltan ${plural(s.diasRestantes, 'día', 'días')}` : s.diasRestantes === 0 ? 'vence hoy' : `venció hace ${plural(-s.diasRestantes, 'día', 'días')}`;
  return `Vence el ${formatoFecha(s.vence)} · ${cuando}`;
}

export function render(vista) {
  const rec = recordatorios(datos, hoyISO());
  const vehiculos = lista('vehiculos');
  const veh = id => vehiculos.find(v => v.id === id);
  const nombreItem = id => datos.items.find(i => i.id === id)?.nombre ?? 'Ítem eliminado';
  const punto = id => `<span class="vehiculo-punto" style="--c:${colorSeguro(veh(id)?.color)}" aria-hidden="true"></span>`;

  const filas = [
    ...rec.servicios.map(r => ({
      estado: r.estado, vehiculoId: r.vehiculoId, titulo: nombreItem(r.itemId), detalle: detalleServicio(r),
      href: r.estado === 'sin-registro' || r.estado === 'vencido' ? '#/registrar/trabajo' : `#/vehiculos/${r.vehiculoId}`,
    })),
    ...rec.seguros.map(s => ({
      estado: s.estado, vehiculoId: s.vehiculoId, titulo: [s.tipo.charAt(0).toUpperCase() + s.tipo.slice(1), s.entidad].filter(Boolean).join(' · '),
      detalle: detalleSeguro(s), href: s.estado === 'ok' ? '#/historico' : '#/registrar/seguro',
    })),
  ];

  const km = rec.kmDesactualizado.map(k => `
    <a class="tarjeta recordatorio estado-borde-proximo" href="#/registrar/km">
      <span class="recordatorio-cab">${punto(k.vehiculoId)}<b>Actualiza el km de ${esc(veh(k.vehiculoId)?.alias ?? '—')}</b></span>
      <span class="estado estado-proximo"><span aria-hidden="true">●</span> Km desactualizado</span>
      <small class="apagado">Último registro hace ${plural(k.dias, 'día', 'días')} (${esc(formatoFecha(k.ultimaFecha))}). Toca para actualizar el kilometraje.</small>
    </a>`).join('');

  const secciones = SECCIONES.map(([estado, titulo]) => {
    const items = filas.filter(f => f.estado === estado);
    if (!items.length) return '';
    return `<section class="seccion-aviso"><h2>${titulo} <small class="apagado">${items.length}</small></h2><div class="pila">${items.map(f => `
      <a class="tarjeta recordatorio estado-borde-${f.estado}" href="${esc(f.href)}">
        <span class="recordatorio-cab">${punto(f.vehiculoId)}<b>${esc(f.titulo)}</b><small class="apagado">${esc(veh(f.vehiculoId)?.alias ?? '')}</small></span>
        ${chipEstado(f.estado)}
        <small class="apagado">${esc(f.detalle)}</small>
      </a>`).join('')}</div></section>`;
  }).join('');

  const hay = km || secciones;
  vista.innerHTML = `
    <header class="cabecera"><a class="volver" href="#/mas">‹ Más</a><h1>Avisos</h1></header>
    ${km ? `<section class="seccion-aviso"><h2>Km desactualizado</h2><div class="pila">${km}</div></section>` : ''}
    ${secciones}
    ${hay ? '' : `<section class="tarjeta vacio">
      <h2>Sin recordatorios</h2>
      <p>Programa servicios en cada vehículo (por km o por meses) y aquí verás cuándo toca cada uno.</p>
      <a class="btn btn-primario" href="#/vehiculos">Ir a Vehículos</a>
    </section>`}`;
}
