// ui/registrar.js — menú "+" y formulario de Trabajo (también lo usa Histórico para editar).
// Rutas: #/registrar, #/registrar/trabajo, #/registrar/trabajo/<id>
import { datos, lista, obtener, guardar, recalcularItems } from '../estado.js';
import { esc, hoyISO, nuevoId, parseFecha, formatoUSD, formatoFecha, formatoKm } from '../util.js';
import { totalTrabajo, recalcularUltimo, kmActual, kmCoherente, precioAnomalo, recalcularCombustible } from '../calc.js';
import { comprimirImagen, guardarFotoLocal, leerFotoLocal, borrarFotoLocal, registrarFotoPorBorrar } from '../foto.js';
import { colorSeguro, toast, selectorItem } from './componentes.js';

export function render(vista, param) {
  const [tipo, id] = (param ?? '').split('/');
  const formularios = { trabajo: [formularioTrabajo, 'trabajos'], combustible: [formularioCombustible, 'combustible'], seguro: [formularioSeguro, 'seguros'] };
  if (formularios[tipo]) {
    const [formulario, coleccion] = formularios[tipo];
    const existente = id ? obtener(coleccion, id) : null;
    if (id && !existente) return menu(vista);
    return formulario(vista, existente);
  }
  menu(vista);
}

function menu(vista) {
  const hayVehiculos = lista('vehiculos').length > 0;
  const usaSeguros = lista('vehiculos').some(v => v.usaSeguros);
  vista.innerHTML = `
    <header class="cabecera"><span class="etiqueta">Nuevo registro</span><h1>Registrar</h1></header>
    <nav class="lista" aria-label="Tipo de registro">
      <a href="#/registrar/trabajo">Trabajo de mantenimiento</a>
      <a href="#/registrar/combustible">Combustible</a>
      ${usaSeguros ? '<a href="#/registrar/seguro">Seguro o documento</a>' : ''}
    </nav>
    ${hayVehiculos ? '' : '<p class="apagado">Primero <a href="#/vehiculos/nuevo">agrega un vehículo</a>.</p>'}`;
}

const num = v => (v === '' || v == null ? null : Number(v));

// Chips de vehículo (radio `vehiculoId`) con su color.
function chipsVehiculos(vehiculos, seleccionado) {
  return `<div class="chips">${vehiculos.map(v => `
    <label class="chip" style="--c:${colorSeguro(v.color)}"><input type="radio" name="vehiculoId" value="${esc(v.id)}" ${v.id === seleccionado ? 'checked' : ''}><span>${esc(v.alias)}</span></label>`).join('')}
  </div>`;
}

// Vehículo por defecto: el del último registro guardado, si sigue disponible.
function vehiculoPorDefecto(vehiculos) {
  const recientes = [...lista('trabajos'), ...lista('combustible')].sort((a, b) => (b.act > a.act ? 1 : -1));
  return vehiculos.some(v => v.id === recientes[0]?.vehiculoId) ? recientes[0].vehiculoId : vehiculos[0].id;
}

// Advierte (sin bloquear) si el km no cuadra con el historial. true = continuar.
function confirmarKm(vehiculoId, fecha, km, excluirId) {
  const c = kmCoherente(datos, vehiculoId, fecha, km, excluirId);
  if (c.ok) return true;
  const partes = [c.anterior !== null && `anterior: ${formatoKm(c.anterior)}`, c.siguiente !== null && `siguiente: ${formatoKm(c.siguiente)}`].filter(Boolean);
  return confirm(`Este km no es coherente con tu historial (${partes.join(', ')}). ¿Guardar igual?`);
}

function sinVehiculos(vista, titulo) {
  vista.innerHTML = `
    <header class="cabecera"><span class="etiqueta">Nuevo registro</span><h1>${esc(titulo)}</h1></header>
    <section class="tarjeta vacio">
      <h2>Primero agrega un vehículo</h2>
      <p>Los registros se asocian a un vehículo.</p>
      <a class="btn btn-primario" href="#/vehiculos/nuevo">Agregar vehículo</a>
    </section>`;
}

export function formularioTrabajo(vista, existente) {
  const vehiculos = lista('vehiculos').filter(v => v.estado !== 'vendido' || v.id === existente?.vehiculoId);
  if (!vehiculos.length) return sinVehiculos(vista, 'Trabajo');

  const id = existente?.id ?? nuevoId();
  const lineas = (existente?.lineas ?? []).map(l => ({ ...l }));
  const vehiculoInicial = existente?.vehiculoId ?? vehiculoPorDefecto(vehiculos);
  const proveedores = [...new Set(lista('trabajos').map(t => t.proveedor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  let fotoNueva = null;
  let quitarFoto = false;

  vista.innerHTML = `
    <header class="cabecera">
      <a class="volver" href="#/${existente ? 'historico' : 'registrar'}">‹ ${existente ? 'Histórico' : 'Registrar'}</a>
      <h1>${existente ? 'Editar trabajo' : 'Nuevo trabajo'}</h1>
    </header>
    <form class="formulario" novalidate>
      <fieldset class="campo"><legend>Vehículo</legend>
        ${chipsVehiculos(vehiculos, vehiculoInicial)}
      </fieldset>
      <div class="fila">
        <label class="campo">Fecha<input class="entrada" type="date" name="fecha" value="${esc(existente?.fecha ?? hoyISO())}" required></label>
        <label class="campo">Km<input class="entrada" type="number" inputmode="numeric" min="0" step="1" name="km" value="${esc(existente?.km ?? '')}" required></label>
      </div>
      <p class="ayuda" id="ayuda-km"></p>
      <fieldset class="campo"><legend>Tipo de mantenimiento</legend>
        <div class="chips">
          <label class="chip"><input type="radio" name="tipoMtto" value="preventivo" ${existente?.tipoMtto !== 'correctivo' ? 'checked' : ''}><span>Preventivo</span></label>
          <label class="chip"><input type="radio" name="tipoMtto" value="correctivo" ${existente?.tipoMtto === 'correctivo' ? 'checked' : ''}><span>Correctivo</span></label>
        </div>
      </fieldset>
      <label class="campo">Proveedor (taller o tienda)
        <input class="entrada" name="proveedor" list="lista-proveedores" autocomplete="off" value="${esc(existente?.proveedor ?? '')}">
        <datalist id="lista-proveedores">${proveedores.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      </label>

      <section class="programados">
        <h2>Ítems</h2>
        <div id="lineas"></div>
        <button type="button" class="btn" id="agregar-item">+ Agregar ítem</button>
      </section>

      <div class="campo">Foto de la factura (opcional)
        <input type="file" id="archivo-foto" accept="image/*" hidden>
        <div id="foto-zona"></div>
      </div>
      <label class="campo">Notas<textarea class="entrada" name="notas" rows="2">${esc(existente?.notas ?? '')}</textarea></label>

      <p class="error" role="alert" hidden></p>
      <div class="barra-guardar">
        <div class="total"><span class="etiqueta">Total</span><b id="total">${esc(formatoUSD(0))}</b></div>
        <button class="btn btn-primario" type="submit">Guardar</button>
      </div>
    </form>`;

  const form = vista.querySelector('form');
  const errorEl = form.querySelector('.error');
  const mostrarError = msg => { errorEl.textContent = msg; errorEl.hidden = false; errorEl.scrollIntoView({ block: 'center' }); };
  const vehiculoSel = () => form.vehiculoId.value;
  const itemDe = itemId => datos.items.find(i => i.id === itemId);
  // Última compra del ítem sin contar este mismo trabajo (así editar no se compara contra sí mismo).
  const ultimoDe = itemId => recalcularUltimo(itemId, lista('trabajos').filter(t => t.id !== id));

  // -- Ayuda de km --
  const ayudaKm = () => {
    vista.querySelector('#ayuda-km').textContent = `Km actual de este vehículo: ${formatoKm(kmActual(datos, vehiculoSel()))}`;
  };
  form.addEventListener('change', e => { if (e.target.name === 'vehiculoId') ayudaKm(); });
  ayudaKm();

  // -- Líneas --
  const cont = vista.querySelector('#lineas');
  function pintarLineas() {
    cont.innerHTML = lineas.map((l, i) => {
      const it = itemDe(l.itemId);
      return `
      <div class="linea" data-i="${i}">
        <div class="programado-cab">
          <span class="linea-titulo"><b>${esc(it?.nombre ?? 'Ítem')}</b><small>${esc(it?.tipo ?? '')} · ${esc(it?.categoria ?? '')}</small></span>
          <button type="button" class="quitar" aria-label="Quitar ítem">✕</button>
        </div>
        <p class="ayuda" data-ultima></p>
        <div class="fila">
          <label class="campo">Cantidad<input class="entrada" data-campo="cantidad" type="number" inputmode="decimal" min="0" step="any" value="${esc(l.cantidad ?? 1)}"></label>
          <label class="campo">Precio unit. USD<input class="entrada" data-campo="precioUnit" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(l.precioUnit ?? '')}"></label>
        </div>
        <label class="campo">Garantía hasta (opcional)<input class="entrada" data-campo="garantiaHasta" type="date" value="${esc(l.garantiaHasta ?? '')}"></label>
        <div class="linea-pie"><span class="estado estado-proximo" data-aviso></span><b data-subtotal></b></div>
      </div>`;
    }).join('') || '<p class="apagado">Agrega al menos un repuesto o servicio.</p>';
    actualizar();
  }

  // Refresca textos calculados sin volver a pintar (no se pierde el foco al teclear).
  function actualizar() {
    const umbral = datos.config.umbralPrecioPct;
    cont.querySelectorAll('.linea').forEach(el => {
      const l = lineas[Number(el.dataset.i)];
      const u = ultimoDe(l.itemId);
      el.querySelector('[data-ultima]').textContent = u
        ? `Última vez: ${formatoUSD(u.ultimoPrecio)} el ${formatoFecha(u.ultimaFecha)}${u.ultimoProveedor ? ' en ' + u.ultimoProveedor : ''}`
        : 'Primera vez que registras este ítem.';
      const pct = u && Number.isFinite(l.precioUnit) ? precioAnomalo(l.precioUnit, u.ultimoPrecio, umbral) : null;
      el.querySelector('[data-aviso]').textContent = pct === null ? '' : `▲ ${pct > 0 ? '+' : ''}${pct} % vs última compra`;
      el.querySelector('[data-subtotal]').textContent = formatoUSD((l.cantidad || 0) * (l.precioUnit || 0));
    });
    vista.querySelector('#total').textContent = formatoUSD(totalTrabajo(lineas.map(l => ({ cantidad: l.cantidad || 0, precioUnit: l.precioUnit || 0 }))));
  }

  cont.addEventListener('input', e => {
    const campo = e.target.dataset.campo;
    if (!campo) return;
    const l = lineas[Number(e.target.closest('.linea').dataset.i)];
    l[campo] = campo === 'garantiaHasta' ? (e.target.value || null) : num(e.target.value);
    actualizar();
  });
  cont.addEventListener('click', e => {
    if (!e.target.closest('.quitar')) return;
    lineas.splice(Number(e.target.closest('.linea').dataset.i), 1);
    pintarLineas();
  });
  vista.querySelector('#agregar-item').addEventListener('click', () => {
    selectorItem({
      alElegir: item => {
        if (lineas.some(l => l.itemId === item.id)) return toast('Ese ítem ya está en el trabajo.');
        lineas.push({ itemId: item.id, cantidad: 1, precioUnit: ultimoDe(item.id)?.ultimoPrecio ?? null, garantiaHasta: null });
        pintarLineas();
      },
    });
  });
  pintarLineas();

  // -- Foto --
  const zonaFoto = vista.querySelector('#foto-zona');
  const archivo = vista.querySelector('#archivo-foto');
  function pintarFoto() {
    const src = fotoNueva ?? (quitarFoto ? null : leerFotoLocal(id));
    const hayRemota = !fotoNueva && !quitarFoto && existente?.foto && !src;
    zonaFoto.innerHTML = src
      ? `<img class="foto-previa" src="${src}" alt="Foto de la factura"><button type="button" class="btn" id="quitar-foto">Quitar foto</button>`
      : hayRemota
        ? `<p class="apagado">Foto adjunta (se descarga al sincronizar).</p><button type="button" class="btn" id="quitar-foto">Quitar foto</button>`
        : `<button type="button" class="btn" id="elegir-foto">Tomar o elegir foto</button>`;
  }
  zonaFoto.addEventListener('click', e => {
    if (e.target.id === 'elegir-foto') archivo.click();
    if (e.target.id === 'quitar-foto') { fotoNueva = null; quitarFoto = true; pintarFoto(); }
  });
  archivo.addEventListener('change', async () => {
    const f = archivo.files[0];
    archivo.value = '';
    if (!f) return;
    try { fotoNueva = await comprimirImagen(f); quitarFoto = false; } catch { toast('No se pudo leer esa imagen.'); }
    pintarFoto();
  });
  pintarFoto();

  // -- Guardar --
  form.addEventListener('submit', e => {
    e.preventDefault();
    errorEl.hidden = true;
    const f = new FormData(form);
    const fecha = f.get('fecha');
    const km = num(f.get('km'));
    if (!parseFecha(fecha)) return mostrarError('Indica una fecha válida.');
    if (km === null || !Number.isFinite(km) || km < 0) return mostrarError('Indica el km del vehículo.');
    if (!lineas.length) return mostrarError('Agrega al menos un ítem.');
    for (const l of lineas) {
      const nombre = itemDe(l.itemId)?.nombre ?? 'un ítem';
      if (!(l.cantidad > 0)) return mostrarError(`La cantidad de «${nombre}» debe ser mayor que 0.`);
      if (!Number.isFinite(l.precioUnit) || l.precioUnit < 0) return mostrarError(`Falta el precio de «${nombre}».`);
    }
    if (!confirmarKm(f.get('vehiculoId'), fecha, km, existente?.id)) return;

    if (fotoNueva && !guardarFotoLocal(id, fotoNueva)) return mostrarError('No hay espacio en el dispositivo para la foto. Guarda sin foto o libera espacio.');
    if (quitarFoto) { borrarFotoLocal(id); if (existente?.foto) registrarFotoPorBorrar(existente.foto); }

    const itemsPrevios = existente?.lineas.map(l => l.itemId) ?? [];
    const limpias = lineas.map(l => ({ itemId: l.itemId, cantidad: l.cantidad, precioUnit: l.precioUnit, garantiaHasta: l.garantiaHasta || null }));
    guardar('trabajos', {
      ...existente, id,
      vehiculoId: f.get('vehiculoId'), fecha, km,
      proveedor: String(f.get('proveedor')).trim(), tipoMtto: f.get('tipoMtto'),
      lineas: limpias, total: totalTrabajo(limpias),
      foto: fotoNueva ? `fotos/${id}.jpg` : quitarFoto ? null : (existente?.foto ?? null),
      notas: String(f.get('notas')).trim(),
    });
    recalcularItems([...itemsPrevios, ...limpias.map(l => l.itemId)]);
    toast(`Trabajo guardado · ${formatoUSD(totalTrabajo(limpias))}`);
    location.hash = existente ? '#/historico' : '#/inicio';
  });
}

// ---------- Combustible ----------
export function formularioCombustible(vista, existente) {
  const vehiculos = lista('vehiculos').filter(v => v.estado !== 'vendido' || v.id === existente?.vehiculoId);
  if (!vehiculos.length) return sinVehiculos(vista, 'Combustible');
  const estaciones = [...new Set(lista('combustible').map(c => c.estacion).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  vista.innerHTML = `
    <header class="cabecera">
      <a class="volver" href="#/${existente ? 'historico' : 'registrar'}">‹ ${existente ? 'Histórico' : 'Registrar'}</a>
      <h1>${existente ? 'Editar llenado' : 'Nuevo llenado'}</h1>
    </header>
    <form class="formulario" novalidate>
      <fieldset class="campo"><legend>Vehículo</legend>${chipsVehiculos(vehiculos, existente?.vehiculoId ?? vehiculoPorDefecto(vehiculos))}</fieldset>
      <div class="fila">
        <label class="campo">Fecha<input class="entrada" type="date" name="fecha" value="${esc(existente?.fecha ?? hoyISO())}" required></label>
        <label class="campo">Km<input class="entrada" type="number" inputmode="numeric" min="0" step="1" name="km" value="${esc(existente?.km ?? '')}" required></label>
      </div>
      <p class="ayuda" id="ayuda-km"></p>
      <div class="fila">
        <label class="campo">Litros<input class="entrada" type="number" inputmode="decimal" min="0" step="any" name="litros" value="${esc(existente?.litros ?? '')}" required></label>
        <label class="campo">Precio por litro<input class="entrada" type="number" inputmode="decimal" min="0" step="any" name="precioLitro" value="${esc(existente?.precioLitro ?? '')}"></label>
      </div>
      <label class="campo">Total USD<input class="entrada" type="number" inputmode="decimal" min="0" step="0.01" name="total" value="${esc(existente?.total ?? '')}" required></label>
      <p class="ayuda">Escribe litros y precio, o litros y total: el otro dato se calcula solo.</p>
      <label class="interruptor"><input type="checkbox" name="tanqueLleno" ${existente?.tanqueLleno === false ? '' : 'checked'}> Tanque lleno (necesario para calcular km/L)</label>
      <label class="campo">Estación (opcional)
        <input class="entrada" name="estacion" list="lista-estaciones" autocomplete="off" value="${esc(existente?.estacion ?? '')}">
        <datalist id="lista-estaciones">${estaciones.map(e => `<option value="${esc(e)}">`).join('')}</datalist>
      </label>
      <label class="campo">Notas<textarea class="entrada" name="notas" rows="2">${esc(existente?.notas ?? '')}</textarea></label>
      <p class="error" role="alert" hidden></p>
      <div class="barra-guardar">
        <div class="total"><span class="etiqueta">Total</span><b id="total">${esc(formatoUSD(existente?.total ?? 0))}</b></div>
        <button class="btn btn-primario" type="submit">Guardar</button>
      </div>
    </form>`;

  const form = vista.querySelector('form');
  const errorEl = form.querySelector('.error');
  const mostrarError = msg => { errorEl.textContent = msg; errorEl.hidden = false; errorEl.scrollIntoView({ block: 'center' }); };
  const ayudaKm = () => { vista.querySelector('#ayuda-km').textContent = `Km actual de este vehículo: ${formatoKm(kmActual(datos, form.vehiculoId.value))}`; };
  form.addEventListener('change', e => { if (e.target.name === 'vehiculoId') ayudaKm(); });
  ayudaKm();

  // Campos enlazados: litros / precio / total.
  form.addEventListener('input', e => {
    if (!['litros', 'precioLitro', 'total'].includes(e.target.name)) return;
    const r = recalcularCombustible({ litros: num(form.litros.value), precioLitro: num(form.precioLitro.value), total: num(form.total.value) }, e.target.name);
    if (e.target.name !== 'precioLitro' && r.precioLitro !== null) form.precioLitro.value = r.precioLitro;
    if (e.target.name !== 'total' && r.total !== null) form.total.value = r.total;
    vista.querySelector('#total').textContent = formatoUSD(r.total ?? 0);
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    errorEl.hidden = true;
    const f = new FormData(form);
    const fecha = f.get('fecha'), km = num(f.get('km')), litros = num(f.get('litros'));
    const { precioLitro, total } = recalcularCombustible({ litros, precioLitro: num(f.get('precioLitro')), total: num(f.get('total')) }, 'total');
    if (!parseFecha(fecha)) return mostrarError('Indica una fecha válida.');
    if (km === null || !(km >= 0)) return mostrarError('Indica el km del vehículo.');
    if (!(litros > 0)) return mostrarError('Los litros deben ser mayores que 0.');
    if (total === null || !(total >= 0)) return mostrarError('Indica el total pagado o el precio por litro.');
    if (!confirmarKm(f.get('vehiculoId'), fecha, km, existente?.id)) return;
    guardar('combustible', {
      ...existente, vehiculoId: f.get('vehiculoId'), fecha, km, litros, precioLitro, total,
      tanqueLleno: form.tanqueLleno.checked, estacion: String(f.get('estacion')).trim(), notas: String(f.get('notas')).trim(),
    });
    toast(`Llenado guardado · ${formatoUSD(total)}`);
    location.hash = existente ? '#/historico' : '#/inicio';
  });
}

// ---------- Seguros y documentos ----------
const TIPOS_SEGURO = [['seguro', 'Seguro'], ['registro/patente', 'Registro / patente'], ['revisión', 'Revisión'], ['otro', 'Otro']];

export function formularioSeguro(vista, existente) {
  const vehiculos = lista('vehiculos').filter(v => v.usaSeguros && (v.estado !== 'vendido' || v.id === existente?.vehiculoId));
  if (!vehiculos.length) {
    vista.innerHTML = `
      <header class="cabecera"><span class="etiqueta">Nuevo registro</span><h1>Seguro o documento</h1></header>
      <section class="tarjeta vacio">
        <h2>Ningún vehículo usa seguros</h2>
        <p>Activa «Usa seguros y documentos» en el vehículo que quieras controlar.</p>
        <a class="btn btn-primario" href="#/vehiculos">Ir a Vehículos</a>
      </section>`;
    return;
  }
  const entidades = [...new Set(lista('seguros').map(s => s.entidad).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  vista.innerHTML = `
    <header class="cabecera">
      <a class="volver" href="#/${existente ? 'historico' : 'registrar'}">‹ ${existente ? 'Histórico' : 'Registrar'}</a>
      <h1>${existente ? 'Editar documento' : 'Seguro o documento'}</h1>
    </header>
    <form class="formulario" novalidate>
      <fieldset class="campo"><legend>Vehículo</legend>${chipsVehiculos(vehiculos, existente?.vehiculoId ?? vehiculos[0].id)}</fieldset>
      <label class="campo">Tipo
        <select class="entrada" name="tipo">${TIPOS_SEGURO.map(([v, t]) => `<option value="${v}" ${existente?.tipo === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </label>
      <label class="campo">Aseguradora u organismo
        <input class="entrada" name="entidad" list="lista-entidades" autocomplete="off" value="${esc(existente?.entidad ?? '')}">
        <datalist id="lista-entidades">${entidades.map(e => `<option value="${esc(e)}">`).join('')}</datalist>
      </label>
      <label class="campo">N.º de póliza (opcional)<input class="entrada" name="poliza" autocomplete="off" value="${esc(existente?.poliza ?? '')}"></label>
      <div class="fila">
        <label class="campo">Desde<input class="entrada" type="date" name="desde" value="${esc(existente?.desde ?? hoyISO())}" required></label>
        <label class="campo">Vence<input class="entrada" type="date" name="vence" value="${esc(existente?.vence ?? '')}" required></label>
      </div>
      <label class="campo">Monto USD (puede ser 0)<input class="entrada" type="number" inputmode="decimal" min="0" step="0.01" name="monto" value="${esc(existente?.monto ?? '')}" required></label>
      <label class="campo">Notas<textarea class="entrada" name="notas" rows="2">${esc(existente?.notas ?? '')}</textarea></label>
      <p class="error" role="alert" hidden></p>
      <button class="btn btn-primario ancho" type="submit">Guardar</button>
    </form>`;

  const form = vista.querySelector('form');
  const errorEl = form.querySelector('.error');
  const mostrarError = msg => { errorEl.textContent = msg; errorEl.hidden = false; };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(form);
    const desde = f.get('desde'), vence = f.get('vence'), monto = num(f.get('monto'));
    if (!parseFecha(desde)) return mostrarError('Indica la fecha de inicio.');
    if (!parseFecha(vence)) return mostrarError('Indica la fecha de vencimiento.');
    if (vence < desde) return mostrarError('El vencimiento no puede ser anterior al inicio.');
    if (monto === null || !(monto >= 0)) return mostrarError('Indica el monto (0 si no tuvo costo).');
    guardar('seguros', {
      ...existente, vehiculoId: f.get('vehiculoId'), tipo: f.get('tipo'), entidad: String(f.get('entidad')).trim(),
      poliza: String(f.get('poliza')).trim(), desde, vence, monto, notas: String(f.get('notas')).trim(),
    });
    toast('Documento guardado');
    location.hash = existente ? '#/historico' : '#/inicio';
  });
}
