// ui/vehiculos.js — lista de vehículos y formulario de alta/edición (con servicios programados por vehículo).
import { datos, lista, obtener, guardar } from '../estado.js';
import { esc, hoyISO, formatoKm, formatoFecha } from '../util.js';
import { kmActual, recordatorios } from '../calc.js';
import { COLORES, colorSeguro, toast, selectorItem, chipEstado } from './componentes.js';

const COMBUSTIBLES = ['gasolina', 'diésel', 'gas', 'eléctrico', 'híbrido'];

export function render(vista, param) {
  if (param === 'nuevo') return formulario(vista, null);
  if (param) {
    const v = obtener('vehiculos', param);
    if (v) return formulario(vista, v);
  }
  listado(vista);
}

// ---- Lista ----
function listado(vista) {
  const vehiculos = lista('vehiculos');
  const tarjetas = vehiculos.map(v => `
    <a class="tarjeta vehiculo" href="#/vehiculos/${esc(v.id)}" style="--c:${colorSeguro(v.color)}">
      <span class="vehiculo-punto" aria-hidden="true"></span>
      <span class="vehiculo-datos">
        <b>${esc(v.alias)}</b>
        <small>${esc(v.marca)} ${esc(v.modelo)} · ${esc(v.anio)} · ${esc(v.placa)}</small>
      </span>
      <span class="vehiculo-km">${esc(formatoKm(kmActual(datos, v.id)))}${v.estado === 'vendido' ? '<small class="estado estado-sin-registro">Vendido</small>' : ''}</span>
    </a>`).join('');

  vista.innerHTML = `
    <header class="cabecera"><span class="etiqueta">Flota</span><h1>Vehículos</h1></header>
    ${vehiculos.length ? `<div class="pila">${tarjetas}</div>
      <p><a class="btn btn-primario" href="#/vehiculos/nuevo">+ Agregar vehículo</a></p>` : `
    <section class="tarjeta vacio">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13l2-5h14l2 5M3 13v5h2m14 0h2v-5M5 18h14M7 15.5h.01M17 15.5h.01"/></svg>
      <h2>Aún no hay vehículos</h2>
      <p>Agrega tu primer vehículo para empezar a registrar trabajos.</p>
      <a class="btn btn-primario" href="#/vehiculos/nuevo">Agregar vehículo</a>
    </section>`}`;
}

// ---- Formulario ----
function colorLibre() {
  const usados = lista('vehiculos').map(v => v.color);
  return COLORES.find(c => !usados.includes(c)) ?? COLORES[0];
}

function formulario(vista, v) {
  const nuevo = !v;
  const d = v ?? { color: colorLibre(), fechaAlta: hoyISO(), estado: 'activo', usaSeguros: false, programados: [] };
  const programados = (d.programados ?? []).map(p => ({ ...p }));
  const campo = (nombre, etiqueta, atributos = '') =>
    `<label class="campo">${etiqueta}<input class="entrada" name="${nombre}" value="${esc(d[nombre] ?? '')}" ${atributos}></label>`;

  vista.innerHTML = `
    <header class="cabecera">
      <a class="volver" href="#/vehiculos">‹ Vehículos</a>
      <h1>${nuevo ? 'Nuevo vehículo' : esc(d.alias)}</h1>
    </header>
    <form class="formulario" novalidate>
      ${campo('alias', 'Alias', 'required placeholder="Ej. Palio" autocomplete="off"')}
      <div class="fila">${campo('marca', 'Marca', 'required autocomplete="off"')}${campo('modelo', 'Modelo', 'required autocomplete="off"')}</div>
      <div class="fila">
        ${campo('anio', 'Año', 'required type="number" inputmode="numeric" min="1950" max="2100" step="1"')}
        ${campo('placa', 'Placa', 'required autocomplete="off"')}
      </div>
      <fieldset class="campo">
        <legend>Color del vehículo</legend>
        <div class="colores">
          ${COLORES.map(c => `
            <label class="color" style="--c:${c}">
              <input type="radio" name="color" value="${c}" ${c === d.color ? 'checked' : ''}>
              <span aria-label="Color ${c}"><i aria-hidden="true">✓</i></span>
            </label>`).join('')}
        </div>
      </fieldset>
      <div class="fila">
        ${campo('kmInicial', 'Km actual (inicial)', 'required type="number" inputmode="numeric" min="0" step="1"')}
        ${campo('fechaAlta', 'Fecha de ese km', 'type="date"')}
      </div>
      <p class="ayuda">Es la fecha en que el vehículo tenía ese km (si es el km de compra, la fecha de compra). Si cargas gastos de fechas anteriores, los indicadores igual los toman en cuenta.</p>
      <label class="campo">Combustible
        <select class="entrada" name="combustible"><option value="">—</option>
          ${COMBUSTIBLES.map(c => `<option ${c === d.combustible ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </label>
      ${campo('vin', 'VIN (opcional)', 'autocomplete="off"')}
      <div class="fila">
        ${campo('fechaCompra', 'Fecha de compra (opcional)', 'type="date"')}
        ${campo('precioCompra', 'Precio de compra USD (opcional)', 'type="number" inputmode="decimal" min="0" step="0.01"')}
      </div>
      ${campo('puestaAPuntoHasta', 'Puesta a punto hasta (opcional)', 'type="date"')}
      <p class="ayuda">Para un vehículo recién comprado: déjalo vacío mientras sigas poniéndolo al día. Cuando termines, pon la fecha del último trabajo: lo anterior cuenta como puesta a punto y lo posterior como operación normal.</p>
      <label class="interruptor"><input type="checkbox" name="usaSeguros" ${d.usaSeguros ? 'checked' : ''}> Usa seguros y documentos</label>
      <label class="campo">Notas<textarea class="entrada" name="notas" rows="2">${esc(d.notas ?? '')}</textarea></label>

      <section class="programados">
        <h2>Servicios programados</h2>
        <p class="apagado">Cada cuánto debe hacerse un servicio en ESTE vehículo (por km, por meses, o ambos).</p>
        <div id="lista-programados"></div>
        <button type="button" class="btn" id="agregar-programado">+ Agregar servicio programado</button>
      </section>

      ${nuevo ? '' : `<a class="btn ancho" href="#/historico/${esc(d.id)}">Ver historial de este vehículo</a>`}
      ${nuevo ? '' : `<a class="btn ancho solo-pc" href="#/hoja/${esc(d.id)}">Hoja de vida (PDF)</a>`}
      <p class="error" role="alert" hidden></p>
      <button class="btn btn-primario ancho" type="submit">${nuevo ? 'Crear vehículo' : 'Guardar cambios'}</button>
      ${nuevo ? '' : `<button class="btn ancho" type="button" id="vender">${d.estado === 'vendido' ? 'Reactivar vehículo' : 'Marcar como vendido'}</button>`}
    </form>`;

  const form = vista.querySelector('form');
  const errorEl = form.querySelector('.error');
  const mostrarError = msg => { errorEl.textContent = msg; errorEl.hidden = false; errorEl.scrollIntoView({ block: 'center' }); };

  // -- Servicios programados --
  function pintarProgramados() {
    // Vencimiento calculado con los intervalos que se están editando (sin guardar aún).
    const base = nuevo ? { id: '__nuevo', estado: 'activo', kmInicial: 0 } : d;
    const calculado = recordatorios({ ...datos, vehiculos: [{ ...base, programados }] }, hoyISO()).servicios;
    const cont = vista.querySelector('#lista-programados');
    cont.innerHTML = programados.map((p, i) => {
      const item = datos.items.find(x => x.id === p.itemId);
      const r = calculado.find(x => x.itemId === p.itemId);
      return `
      <div class="programado" data-i="${i}">
        <div class="programado-cab"><b>${esc(item?.nombre ?? 'Ítem')}</b><button type="button" class="quitar" aria-label="Quitar">✕</button></div>
        <div class="fila">
          <label class="campo">Cada (km)<input class="entrada" data-campo="intervaloKm" type="number" inputmode="numeric" min="1" step="1" value="${esc(p.intervaloKm ?? '')}"></label>
          <label class="campo">Cada (meses)<input class="entrada" data-campo="intervaloMeses" type="number" inputmode="numeric" min="1" step="1" value="${esc(p.intervaloMeses ?? '')}"></label>
        </div>
        ${r ? `<p class="vence">${chipEstado(r.estado)} ${textoVencimiento(r)}</p>` : ''}
      </div>`;
    }).join('') || '<p class="apagado">Ninguno todavía.</p>';
  }

  function textoVencimiento(r) {
    if (r.estado === 'sin-registro') return '— registra el último cambio real para calcular el próximo.';
    const partes = [];
    if (r.proximoKm !== null) partes.push(`a los ${formatoKm(r.proximoKm)}`);
    if (r.proximaFecha) partes.push(`el ${formatoFecha(r.proximaFecha)}`);
    return `· próximo ${partes.join(' o ')}`;
  }

  const cont = vista.querySelector('#lista-programados');
  cont.addEventListener('input', e => {
    const campoEl = e.target.dataset.campo;
    if (!campoEl) return;
    const i = Number(e.target.closest('.programado').dataset.i);
    programados[i][campoEl] = e.target.value === '' ? null : Number(e.target.value);
  });
  // El vencimiento se refresca al terminar de editar, no en cada tecla (no pierde el foco).
  cont.addEventListener('change', e => { if (e.target.dataset.campo) pintarProgramados(); });
  cont.addEventListener('click', e => {
    if (!e.target.closest('.quitar')) return;
    programados.splice(Number(e.target.closest('.programado').dataset.i), 1);
    pintarProgramados();
  });
  vista.querySelector('#agregar-programado').addEventListener('click', () => {
    selectorItem({
      alElegir: item => {
        if (programados.some(p => p.itemId === item.id)) return toast('Ese servicio ya está programado.');
        programados.push({ itemId: item.id, intervaloKm: null, intervaloMeses: null });
        pintarProgramados();
      },
    });
  });
  pintarProgramados();

  // -- Guardar --
  form.addEventListener('submit', e => {
    e.preventDefault();
    errorEl.hidden = true;
    const f = new FormData(form);
    const texto = n => String(f.get(n) ?? '').trim();
    const numero = n => (texto(n) === '' ? null : Number(texto(n)));

    for (const [n, etiqueta] of [['alias', 'el alias'], ['marca', 'la marca'], ['modelo', 'el modelo'], ['placa', 'la placa']]) {
      if (!texto(n)) return mostrarError(`Falta ${etiqueta}.`);
    }
    const anio = numero('anio');
    if (!Number.isInteger(anio) || anio < 1950 || anio > 2100) return mostrarError('El año no es válido.');
    const kmInicial = numero('kmInicial');
    if (kmInicial === null || kmInicial < 0) return mostrarError('Indica el km actual del vehículo.');
    if (!f.get('color')) return mostrarError('Elige un color.');
    const alias = texto('alias').toLowerCase();
    if (lista('vehiculos').some(x => x.id !== d.id && x.alias.trim().toLowerCase() === alias)) return mostrarError('Ya tienes un vehículo con ese alias.');
    if (programados.some(p => !p.intervaloKm && !p.intervaloMeses)) return mostrarError('Cada servicio programado necesita un intervalo en km, en meses o en ambos.');

    guardar('vehiculos', {
      ...d,
      alias: texto('alias'), marca: texto('marca'), modelo: texto('modelo'), anio, placa: texto('placa'),
      color: f.get('color'), kmInicial, fechaAlta: texto('fechaAlta') || hoyISO(),
      combustible: texto('combustible'), vin: texto('vin'), fechaCompra: texto('fechaCompra'), precioCompra: numero('precioCompra'), puestaAPuntoHasta: texto('puestaAPuntoHasta') || null,
      usaSeguros: form.usaSeguros.checked, notas: texto('notas'), estado: d.estado ?? 'activo',
      programados: programados.map(p => ({ itemId: p.itemId, intervaloKm: p.intervaloKm || null, intervaloMeses: p.intervaloMeses || null })),
    });
    toast(nuevo ? 'Vehículo creado' : 'Cambios guardados');
    location.hash = '#/vehiculos';
  });

  vista.querySelector('#vender')?.addEventListener('click', () => {
    const vendiendo = d.estado !== 'vendido';
    if (vendiendo && !confirm(`¿Marcar «${d.alias}» como vendido? Se conserva todo su historial.`)) return;
    guardar('vehiculos', { ...d, estado: vendiendo ? 'vendido' : 'activo' });
    toast(vendiendo ? 'Marcado como vendido' : 'Vehículo reactivado');
    location.hash = '#/vehiculos';
  });
}
