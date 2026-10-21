// ui/graficos.js — Chart.js (local, carga diferida) con el estilo oscuro del proyecto.
// Marcas finas, rejilla de 1 px recesiva, separación de 2 px del color de superficie, tooltips con valor primero.
// Paleta categórica: pasos oscuros del método dataviz, validados contra la superficie #0e1018 (6 checks en verde).
import { esc, formatoUSD, formatoFecha, diasEntre, sumarDias } from '../util.js';

export const SUPERFICIE = '#0e1018';
const GRILLA = '#232840';
const TEXTO = '#f2f4ff';
const APAGADO = '#8b91b0';
export const CATEGORICOS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const COLOR_OTROS = '#6b7194';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ---- Carga diferida: Chart.js solo se descarga al abrir una pantalla con gráficos ----
let promesa = null;
export function cargarChart() {
  if (globalThis.Chart) return Promise.resolve(globalThis.Chart);
  promesa ??= new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'vendor/chart.umd.min.js';
    s.onload = () => { configurarBase(globalThis.Chart); ok(globalThis.Chart); };
    s.onerror = () => { promesa = null; mal(new Error('No se pudo cargar Chart.js')); };
    document.head.append(s);
  });
  return promesa;
}

function configurarBase(Chart) {
  Chart.defaults.color = APAGADO;
  Chart.defaults.borderColor = GRILLA;
  Chart.defaults.font.family = "'Barlow', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.animation = matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 250 };
}

// ---- Registro de gráficos vivos (se destruyen al cambiar de pantalla) ----
let activos = [];
export function limpiarGraficos() {
  activos.forEach(g => g.destroy());
  activos = [];
}
function dibujar(canvas, config) {
  const g = new globalThis.Chart(canvas, config);
  activos.push(g);
  return g;
}

// ---- Piezas comunes ----
const tooltipBase = {
  backgroundColor: '#151826', borderColor: GRILLA, borderWidth: 1, padding: 10, cornerRadius: 12,
  titleColor: APAGADO, bodyColor: TEXTO, footerColor: TEXTO, usePointStyle: true, boxPadding: 4,
  titleFont: { weight: '600' }, bodyFont: { weight: '600', size: 13 }, footerFont: { weight: '700' },
};
const ejeY = (formato) => ({
  beginAtZero: true,
  grid: { color: GRILLA, lineWidth: 1, drawTicks: false },
  border: { display: false },
  ticks: { padding: 8, maxTicksLimit: 5, callback: v => formato(v) },
});
const compacto = v => (Math.abs(v) >= 1000 ? `${v / 1000}K` : String(v));
const leyenda = (n, tipo = 'rect') => ({
  display: n >= 2,   // una sola serie no necesita leyenda: la nombra el título
  position: 'bottom',
  labels: { color: APAGADO, usePointStyle: true, pointStyle: tipo, boxWidth: 10, boxHeight: 10, padding: 14 },
});

export const etiquetaMes = mes => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(2, 4)}`;

// Meses continuos entre el primero y el último con datos (los vacíos se ven como 0, no se omiten).
export function mesesContinuos(meses) {
  if (!meses.length) return [];
  const lista = [];
  let [a, m] = meses[0].split('-').map(Number);
  const [fa, fm] = meses[meses.length - 1].split('-').map(Number);
  while (a < fa || (a === fa && m <= fm)) {
    lista.push(`${a}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; a++; }
  }
  return lista;
}

// ---- Barras apiladas por mes ----
// series: [{ nombre, color, datos: [...] }] alineadas con `meses` ('YYYY-MM').
export function barrasApiladas(canvas, meses, series) {
  return dibujar(canvas, {
    type: 'bar',
    data: {
      labels: meses.map(etiquetaMes),
      datasets: series.map(s => ({
        label: s.nombre, data: s.datos, backgroundColor: s.color,
        borderColor: SUPERFICIE, borderWidth: 2,          // el borde del color de superficie ES la separación de 2 px
        borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: { x: { stacked: true, grid: { display: false }, border: { color: GRILLA } }, y: { stacked: true, ...ejeY(v => compacto(v)) } },
      plugins: {
        legend: leyenda(series.length),
        tooltip: {
          ...tooltipBase,
          filter: c => c.parsed.y !== 0,   // no listar series sin gasto en ese mes
          callbacks: {
            label: c => `${formatoUSD(c.parsed.y)}  ${c.dataset.label}`,
            footer: items => (items.length > 1 ? `Total ${formatoUSD(items.reduce((s, i) => s + i.parsed.y, 0))}` : ''),
          },
        },
      },
    },
  });
}

// ---- Dona (partes de un total) ----
export function dona(canvas, partes) {
  return dibujar(canvas, {
    type: 'doughnut',
    data: {
      labels: partes.map(p => p.nombre),
      datasets: [{ data: partes.map(p => p.valor), backgroundColor: partes.map(p => p.color), borderColor: SUPERFICIE, borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { display: false },   // la leyenda HTML de al lado lleva nombre, monto y %
        tooltip: { ...tooltipBase, callbacks: { label: c => `${formatoUSD(c.parsed)}  ${c.label}` } },
      },
    },
  });
}

// ---- Líneas con eje X de fechas ----
// series: [{ nombre, color, puntos: [{ fecha: 'YYYY-MM-DD', y }] }]. El eje es lineal en días (sin adaptador de fechas).
const BASE = '2000-01-01';
const aDias = fecha => diasEntre(BASE, fecha);
export function lineas(canvas, series, { formatoY, sufijo = '' }) {
  return dibujar(canvas, {
    type: 'line',
    data: {
      datasets: series.map(s => ({
        label: s.nombre, data: s.puntos.map(p => ({ x: aDias(p.fecha), y: p.y })),
        borderColor: s.color, backgroundColor: s.color,
        borderWidth: 2, tension: 0, borderJoinStyle: 'round', borderCapStyle: 'round',
        pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: s.color,
        pointBorderColor: SUPERFICIE, pointBorderWidth: 2,   // anillo de 2 px del color de superficie
        pointHitRadius: 24,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      scales: {
        x: {
          type: 'linear', grid: { display: false }, border: { color: GRILLA },
          ticks: { maxTicksLimit: 5, callback: v => formatoFecha(sumarDias(BASE, Math.round(v))) },
          afterDataLimits: eje => { const m = Math.max(2, (eje.max - eje.min) * 0.06); eje.min -= m; eje.max += m; },
        },
        y: { ...ejeY(formatoY), beginAtZero: false },
      },
      plugins: {
        legend: leyenda(series.length, 'line'),
        tooltip: {
          ...tooltipBase,
          callbacks: {
            title: items => formatoFecha(sumarDias(BASE, Math.round(items[0].parsed.x))),
            label: c => `${formatoY(c.parsed.y)}${sufijo}  ${c.dataset.label}`,
          },
        },
      },
    },
  });
}

// ---- Vista de tabla (los valores nunca dependen del tooltip) ----
export function tabla(columnas, filas) {
  return `<details class="ver-tabla"><summary>Ver como tabla</summary>
    <div class="tabla-scroll"><table class="tabla">
      <thead><tr>${columnas.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${filas.map(f => `<tr>${f.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div></details>`;
}
