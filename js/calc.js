// calc.js — FUNCIONES PURAS (sin DOM, sin localStorage). Toda la lógica de KPIs y recordatorios vive aquí.
// Definiciones: docs/garaje-bravo-blueprint.md secciones 6 y 10. Pruebas: tests/calc.test.mjs.
// Todas reciben `datos` ({vehiculos, items, trabajos, combustible, seguros, config}) y `hoy` ('YYYY-MM-DD')
// como parámetro, y ignoran los registros con `borrado: true`.
import { diasEntre, sumarDias, sumarMeses, redondear2, normalizar } from './util.js';

const DIAS_POR_MES = 30.4375;
export const UMBRAL_PROXIMO_KM = 500;
export const UMBRAL_PROXIMO_DIAS = 30;

const vivos = arr => (arr ?? []).filter(r => !r.borrado);
const suma = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const max = (a, b) => (a >= b ? a : b);
const min = (a, b) => (a <= b ? a : b);

// Orden cronológico; en empate de fecha, por km.
const porFechaKm = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.km ?? 0) - (b.km ?? 0));

function enPeriodo(fecha, periodo) {
  return (!periodo.desde || fecha >= periodo.desde) && (!periodo.hasta || fecha <= periodo.hasta);
}

export function totalTrabajo(lineas) {
  return redondear2(suma(lineas ?? [], l => l.cantidad * l.precioUnit));
}

// ---- Períodos ----
export function periodoPreset(nombre, hoy) {
  switch (nombre) {
    case '30d': return { desde: sumarDias(hoy, -29), hasta: hoy };
    case '90d': return { desde: sumarDias(hoy, -89), hasta: hoy };
    case '12m': return { desde: sumarDias(sumarMeses(hoy, -12), 1), hasta: hoy };
    case 'anio': return { desde: hoy.slice(0, 4) + '-01-01', hasta: hoy };
    default: return { desde: null, hasta: null };
  }
}

// ---- Ítems: último precio ----
// Busca el trabajo más reciente (fecha; empate → km mayor) que contenga el ítem.
export function recalcularUltimo(itemId, trabajos) {
  let mejor = null;
  for (const t of vivos(trabajos)) {
    if (!t.lineas?.some(l => l.itemId === itemId)) continue;
    if (!mejor || porFechaKm(t, mejor) >= 0) mejor = t;
  }
  if (!mejor) return null;
  const linea = [...mejor.lineas].reverse().find(l => l.itemId === itemId);
  return { ultimoPrecio: linea.precioUnit, ultimaFecha: mejor.fecha };
}

// Todas las compras de un ítem (más reciente primero). Marca la(s) más barata(s) si hay más de una compra.
export function historialPrecios(datos, itemId) {
  const compras = [];
  for (const t of vivos(datos.trabajos)) {
    for (const l of t.lineas ?? []) {
      if (l.itemId !== itemId) continue;
      compras.push({ trabajoId: t.id, fecha: t.fecha, km: t.km, vehiculoId: t.vehiculoId, cantidad: l.cantidad, precioUnit: l.precioUnit });
    }
  }
  compras.sort((a, b) => porFechaKm(b, a));
  const minimo = Math.min(...compras.map(c => c.precioUnit));
  return compras.map(c => ({ ...c, masBarato: compras.length > 1 && c.precioUnit === minimo }));
}

// ---- Histórico unificado (trabajos + combustible + seguros + lecturas de km) ----
// filtros: { vehiculoId, tipos: {mantenimiento, combustible, seguros}, desde, hasta, texto }
export function registrosUnificados(datos, filtros = {}) {
  const { vehiculoId = null, tipos = { mantenimiento: true, combustible: true, seguros: true, km: true }, desde = null, hasta = null, texto = '' } = filtros;
  const nombreItem = id => (datos.items ?? []).find(i => i.id === id)?.nombre ?? 'Ítem eliminado';
  const filas = [];

  if (tipos.mantenimiento) {
    for (const t of vivos(datos.trabajos)) {
      const nombres = (t.lineas ?? []).map(l => nombreItem(l.itemId));
      filas.push({ tipo: 'trabajo', id: t.id, fecha: t.fecha, km: t.km, vehiculoId: t.vehiculoId, monto: t.total,
        titulo: nombres.join(', '), detalle: t.tipoMtto ?? '', busqueda: [...nombres, t.notas] });
    }
  }
  if (tipos.combustible) {
    for (const c of vivos(datos.combustible)) {
      filas.push({ tipo: 'combustible', id: c.id, fecha: c.fecha, km: c.km, vehiculoId: c.vehiculoId, monto: c.total,
        titulo: `Combustible · ${c.litros} L`, detalle: c.estacion ?? '', busqueda: ['combustible', c.estacion, c.notas] });
    }
  }
  if (tipos.seguros) {
    for (const s of vivos(datos.seguros)) {
      filas.push({ tipo: 'seguro', id: s.id, fecha: s.desde, km: null, vehiculoId: s.vehiculoId, monto: s.monto,
        titulo: [s.tipo.charAt(0).toUpperCase() + s.tipo.slice(1), s.entidad].filter(Boolean).join(' · '), detalle: s.poliza ? `Póliza ${s.poliza}` : '', busqueda: [s.tipo, s.entidad, s.poliza, s.notas] });
    }
  }

  if (tipos.km) {
    for (const k of vivos(datos.kms)) {
      filas.push({ tipo: 'km', id: k.id, fecha: k.fecha, km: k.km, vehiculoId: k.vehiculoId, monto: 0,
        titulo: 'Lectura de kilometraje', detalle: k.notas ?? '', busqueda: ['kilometraje', 'km', k.notas] });
    }
  }

  const buscado = normalizar(texto);
  const resultado = filas
    .filter(f => (!vehiculoId || f.vehiculoId === vehiculoId) && enPeriodo(f.fecha, { desde, hasta })
      && (!buscado || f.busqueda.some(b => normalizar(b).includes(buscado))))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (b.km ?? 0) - (a.km ?? 0)));
  const porVehiculo = {};
  for (const f of resultado) porVehiculo[f.vehiculoId] = (porVehiculo[f.vehiculoId] ?? 0) + f.monto;
  return { filas: resultado.map(({ busqueda, ...f }) => f), total: suma(resultado, f => f.monto), porVehiculo };
}

// ---- Odómetro ----
function registrosKm(datos, vehiculoId) {
  return [
    ...vivos(datos.trabajos).filter(t => t.vehiculoId === vehiculoId),
    ...vivos(datos.combustible).filter(c => c.vehiculoId === vehiculoId),
    ...vivos(datos.kms).filter(k => k.vehiculoId === vehiculoId),     // lecturas de odómetro sin gasto
  ].filter(r => Number.isFinite(r.km));
}

const vehiculoPorId = (datos, id) => vivos(datos.vehiculos).find(v => v.id === id) ?? null;

export function kmActual(datos, vehiculoId) {
  const v = vehiculoPorId(datos, vehiculoId);
  return registrosKm(datos, vehiculoId).reduce((m, r) => max(m, r.km), v?.kmInicial ?? 0);
}

// Puntos del odómetro: cada registro con km más el km de alta (`kmInicial` en `fechaAlta`).
// Si hay registros ANTERIORES a la fecha de alta con km MAYOR que el km de alta, las fechas no cuadran (se dio de alta con la
// fecha de hoy pero el km era el de la compra): el km de alta se ubica en la fecha del primer registro. Si el historial anterior
// tiene km menores (se dio de alta hoy con el km de hoy), la fecha de alta se respeta.
function puntosKm(v, registros) {
  if (!Number.isFinite(v.kmInicial)) return [...registros].sort(porFechaKm);
  const primera = registros.map(r => r.fecha).sort()[0];
  const fechaAlta = v.fechaAlta ?? primera;
  const incoherente = registros.some(r => r.fecha < fechaAlta && r.km > v.kmInicial);
  const base = { fecha: incoherente ? primera : fechaAlta, km: v.kmInicial };
  return [...registros, base].filter(p => p.fecha).sort(porFechaKm);
}

// Km recorridos en [inicio, fin] = kmFin − kmIni; null si resulta ≤ 0.
// kmFin = mayor km con fecha ≤ fin. kmIni = km del último punto con fecha < inicio; si no hay (el rango arranca en el primer
// punto del odómetro) es el km de ese primer punto. El km de alta es un punto más, ubicado en SU fecha: si el vehículo ya tenía
// historial anterior (se dio de alta hoy con el km de hoy), ese historial queda con km menores y la cuenta cuadra.
function kmRecorridos(v, registros, inicio, fin) {
  const puntos = puntosKm(v, registros);
  const hasta = puntos.filter(p => p.fecha <= fin);
  if (!hasta.length) return null;
  const kmFin = hasta.reduce((m, p) => max(m, p.km), -Infinity);
  const previos = puntos.filter(p => p.fecha < inicio);
  const kmIni = previos.length ? previos[previos.length - 1].km : puntos[0].km;
  const km = kmFin - kmIni;
  return km > 0 ? km : null;
}

// Primer día de seguimiento de un vehículo: la fecha de alta, o antes si ya hay gastos/km registrados de fechas anteriores
// (p. ej. se dio de alta hoy pero se cargó el historial de años previos). Así los promedios cubren todo lo registrado.
function inicioSeguimiento(datos, v, hoy) {
  const fechas = [v.fechaAlta, ...registrosKm(datos, v.id).map(r => r.fecha)].filter(Boolean).sort();
  return fechas[0] ?? hoy;
}

// ---- KPIs por vehículo ----
export function kpisVehiculo(datos, vehiculoId, periodo, incluir, hoy) {
  const v = vehiculoPorId(datos, vehiculoId);
  if (!v) return null;
  const registros = registrosKm(datos, vehiculoId);
  const desdeSeguimiento = inicioSeguimiento(datos, v, hoy);

  const inicio = max(periodo.desde ?? desdeSeguimiento, desdeSeguimiento);
  const fin = min(periodo.hasta ?? hoy, hoy);
  const dias = fin >= inicio ? diasEntre(inicio, fin) + 1 : 0;
  const meses = Math.max(1, dias / DIAS_POR_MES);

  const trabajos = incluir.mantenimiento
    ? vivos(datos.trabajos).filter(t => t.vehiculoId === vehiculoId && enPeriodo(t.fecha, periodo)) : [];
  const combustible = incluir.combustible
    ? vivos(datos.combustible).filter(c => c.vehiculoId === vehiculoId && enPeriodo(c.fecha, periodo)) : [];
  const seguros = incluir.seguros && v.usaSeguros
    ? vivos(datos.seguros).filter(s => s.vehiculoId === vehiculoId && enPeriodo(s.desde, periodo)) : [];

  const gastoTrabajos = suma(trabajos, t => t.total);
  const gastoCombustible = suma(combustible, c => c.total);
  const gastoSeguros = suma(seguros, s => s.monto);
  const gasto = gastoTrabajos + gastoCombustible + gastoSeguros;

  const km = dias > 0 ? kmRecorridos(v, registros, inicio, fin) : null;

  const gastoPreventivo = suma(trabajos.filter(t => t.tipoMtto === 'preventivo'), t => t.total);
  const gastoCorrectivo = suma(trabajos.filter(t => t.tipoMtto === 'correctivo'), t => t.total);

  // Mantenimiento por categoría y por ítem, a partir de las líneas.
  const porCategoria = {};
  const porItem = {};
  let gastoRepuestos = 0, gastoServicios = 0, gastoManoObra = 0;
  for (const t of trabajos) {
    for (const l of t.lineas ?? []) {
      const item = (datos.items ?? []).find(i => i.id === l.itemId);
      const monto = l.cantidad * l.precioUnit;
      if (item?.tipo === 'repuesto') gastoRepuestos += monto; else gastoServicios += monto;
      if (normalizar(item?.nombre).includes('mano de obra')) gastoManoObra += monto;   // convención: ítems llamados «Mano de obra…»
      const cat = item?.categoria ?? 'Otros';
      porCategoria[cat] = (porCategoria[cat] ?? 0) + monto;
      porItem[l.itemId] = { itemId: l.itemId, nombre: item?.nombre ?? 'Ítem eliminado', gasto: (porItem[l.itemId]?.gasto ?? 0) + monto };
    }
  }
  if (incluir.combustible && gastoCombustible) porCategoria['Combustible'] = gastoCombustible;
  if (incluir.seguros && gastoSeguros) porCategoria['Seguros y documentos'] = gastoSeguros;
  for (const k of Object.keys(porCategoria)) porCategoria[k] = redondear2(porCategoria[k]);
  const topItems = Object.values(porItem).map(i => ({ ...i, gasto: redondear2(i.gasto) })).sort((a, b) => b.gasto - a.gasto).slice(0, 5);

  const combustibleStats_ = combustibleStats(vivos(datos.combustible).filter(c => c.vehiculoId === vehiculoId), periodo);

  return {
    vehiculoId, rango: { inicio, fin }, dias, meses, gasto, gastoTrabajos, gastoCombustible, gastoSeguros,
    km,
    costoPorKm: km && gasto >= 0 ? gasto / km : null,
    kmPorDolar: km && gasto > 0 ? km / gasto : null,
    kmDiario: km && dias > 0 ? km / dias : null,
    gastoMensual: gasto / meses,
    costoPorDia: dias > 0 ? gasto / dias : null,
    gastoPreventivo, gastoCorrectivo,
    gastoRepuestos: redondear2(gastoRepuestos), gastoServicios: redondear2(gastoServicios), gastoManoObra: redondear2(gastoManoObra),
    preventivoPct: gastoTrabajos > 0 ? (gastoPreventivo / gastoTrabajos) * 100 : null,
    correctivoPct: gastoTrabajos > 0 ? (gastoCorrectivo / gastoTrabajos) * 100 : null,
    porCategoria, topItems,
    porMes: gastoPorMes({ trabajos, combustible, seguros }),
    combustible: combustibleStats_,
    costoCombustiblePorKm: km && gastoCombustible ? gastoCombustible / km : null,
  };
}

function gastoPorMes({ trabajos, combustible, seguros }) {
  const meses = {};
  const sumar = (fecha, campo, monto) => {
    const mes = fecha.slice(0, 7);
    meses[mes] ??= { mes, mantenimiento: 0, combustible: 0, seguros: 0 };
    meses[mes][campo] += monto;
  };
  trabajos.forEach(t => sumar(t.fecha, 'mantenimiento', t.total));
  combustible.forEach(c => sumar(c.fecha, 'combustible', c.total));
  seguros.forEach(s => sumar(s.desde, 'seguros', s.monto));
  return Object.values(meses).sort((a, b) => (a.mes < b.mes ? -1 : 1));
}

// ---- KPIs globales (toda la flota) ----
export function kpisGlobal(datos, periodo, incluir, hoy) {
  const vehiculos = vivos(datos.vehiculos);
  const por = vehiculos.map(v => kpisVehiculo(datos, v.id, periodo, incluir, hoy));
  const gasto = suma(por, k => k.gasto);
  const km = suma(por, k => k.km ?? 0);

  const primerAlta = vehiculos.map(v => inicioSeguimiento(datos, v, hoy)).sort()[0] ?? hoy;
  const inicio = max(periodo.desde ?? primerAlta, primerAlta);
  const fin = min(periodo.hasta ?? hoy, hoy);
  const dias = fin >= inicio ? diasEntre(inicio, fin) + 1 : 0;
  const meses = Math.max(1, dias / DIAS_POR_MES);

  const porCategoria = {};
  const porItem = {};
  const porMes = {};
  for (const k of por) {
    for (const [cat, m] of Object.entries(k.porCategoria)) porCategoria[cat] = redondear2((porCategoria[cat] ?? 0) + m);
    for (const i of k.topItems) porItem[i.itemId] = { ...i, gasto: redondear2((porItem[i.itemId]?.gasto ?? 0) + i.gasto) };
    for (const m of k.porMes) {
      porMes[m.mes] ??= { mes: m.mes, mantenimiento: 0, combustible: 0, seguros: 0, porVehiculo: {} };
      porMes[m.mes].mantenimiento += m.mantenimiento;
      porMes[m.mes].combustible += m.combustible;
      porMes[m.mes].seguros += m.seguros;
      porMes[m.mes].porVehiculo[k.vehiculoId] = (porMes[m.mes].porVehiculo[k.vehiculoId] ?? 0) + m.mantenimiento + m.combustible + m.seguros;
    }
  }
  const gastoTrabajos = suma(por, k => k.gastoTrabajos);
  const gastoPreventivo = suma(por, k => k.gastoPreventivo);
  const gastoCorrectivo = suma(por, k => k.gastoCorrectivo);

  return {
    rango: { inicio, fin }, dias, meses, gasto, km: km > 0 ? km : null,
    gastoRepuestos: redondear2(suma(por, k => k.gastoRepuestos)), gastoServicios: redondear2(suma(por, k => k.gastoServicios)), gastoManoObra: redondear2(suma(por, k => k.gastoManoObra)),
    costoPorKm: km > 0 ? gasto / km : null,
    kmPorDolar: km > 0 && gasto > 0 ? km / gasto : null,
    kmDiario: km > 0 && dias > 0 ? km / dias : null,
    gastoMensual: gasto / meses,
    costoPorDia: dias > 0 ? gasto / dias : null,
    preventivoPct: gastoTrabajos > 0 ? (gastoPreventivo / gastoTrabajos) * 100 : null,
    correctivoPct: gastoTrabajos > 0 ? (gastoCorrectivo / gastoTrabajos) * 100 : null,
    porCategoria,
    topItems: Object.values(porItem).sort((a, b) => b.gasto - a.gasto).slice(0, 5),
    porMes: Object.values(porMes).sort((a, b) => (a.mes < b.mes ? -1 : 1)),
    porVehiculo: por,
    ranking: por.filter(k => k.costoPorKm !== null).map(k => ({ vehiculoId: k.vehiculoId, costoPorKm: k.costoPorKm }))
      .sort((a, b) => b.costoPorKm - a.costoPorKm),
    vehiculoMasCaro: por.length ? por.reduce((a, b) => (b.gasto > a.gasto ? b : a)).vehiculoId : null,
  };
}

// ---- Puesta a punto (auto usado recién comprado) ----
// Una sola fecha por vehículo (`puestaAPuntoHasta`) divide TODO lo registrado: hasta esa fecha (inclusive) es puesta a punto;
// desde el día siguiente es operación normal. Sin fecha (o en el futuro) la puesta a punto sigue en curso.
const TODO_INCLUIDO = { mantenimiento: true, combustible: true, seguros: true };
// ¿Este vehículo usa puesta a punto? Casilla explícita del formulario; con fecha de fin siempre. Si nunca se decidió (datos de antes
// de esta casilla) se asume que sí cuando se compró hace ≤ 90 días: un auto que ya tenías de años no la tiene.
export function usaPuestaAPunto(v, hoy) {
  if (v.puestaAPuntoHasta) return true;
  if (typeof v.usaPuestaAPunto === 'boolean') return v.usaPuestaAPunto;
  return Boolean(v.fechaCompra) && diasEntre(v.fechaCompra, hoy) >= 0 && diasEntre(v.fechaCompra, hoy) <= 90;
}

export function puestaAPunto(datos, vehiculoId, hoy) {
  const v = vehiculoPorId(datos, vehiculoId);
  if (!v) return null;
  if (!usaPuestaAPunto(v, hoy)) return { aplica: false, fin: null, enCurso: false, puesta: null, operacion: null };
  const fin = v.puestaAPuntoHasta || null;
  const enCurso = !fin || fin > hoy;
  const puesta = kpisVehiculo(datos, vehiculoId, { desde: null, hasta: enCurso ? null : fin }, TODO_INCLUIDO, hoy);
  const operacion = !enCurso && fin < hoy ? kpisVehiculo(datos, vehiculoId, { desde: sumarDias(fin, 1), hasta: null }, TODO_INCLUIDO, hoy) : null;
  return { aplica: true, fin, enCurso, puesta, operacion };
}

// Inversión desde la compra: precio de compra + gasto de puesta a punto + gasto de operación normal.
export function inversionTotal(datos, vehiculoId, hoy) {
  const v = vehiculoPorId(datos, vehiculoId);
  if (!v) return null;
  const p = puestaAPunto(datos, vehiculoId, hoy);
  const compra = Number.isFinite(v.precioCompra) ? v.precioCompra : null;
  // Sin puesta a punto, todo lo gastado cuenta como operación normal.
  const puesta = p.puesta?.gasto ?? 0;
  const operacion = p.aplica ? (p.operacion?.gasto ?? 0) : kpisVehiculo(datos, vehiculoId, { desde: null, hasta: null }, TODO_INCLUIDO, hoy).gasto;
  return { compra, puesta, operacion, total: (compra ?? 0) + puesta + operacion, enCurso: p.enCurso, puestaAplica: p.aplica,
    pctGastoSobreCompra: compra ? ((puesta + operacion) / compra) * 100 : null };
}

export function inversionFlota(datos, hoy) {
  const por = vivos(datos.vehiculos).map(v => inversionTotal(datos, v.id, hoy));
  const compras = por.filter(i => i.compra !== null);
  const compra = suma(compras, i => i.compra);
  const puesta = suma(por, i => i.puesta), operacion = suma(por, i => i.operacion);
  return { compra, puesta, operacion, total: compra + puesta + operacion, puestaAplica: por.some(i => i.puestaAplica),
    pctGastoSobreCompra: compra ? ((suma(compras, i => i.puesta + i.operacion)) / compra) * 100 : null };
}

// ---- Ritmo de uso: km por día ----
// Entre el punto de referencia y la última lectura de km. La referencia es el último registro con ≥ 90 días de antigüedad
// respecto a esa lectura (así el ritmo se actualiza con el uso reciente); si no existe, el km inicial del vehículo.
// Sin al menos 14 días de datos o sin km recorridos no se estima nada (no se inventa).
export function ritmoUso(datos, vehiculoId, hoy) {
  const v = vehiculoPorId(datos, vehiculoId);
  const registros = v ? registrosKm(datos, vehiculoId).sort(porFechaKm) : [];
  if (!registros.length) return null;
  const ultimo = registros[registros.length - 1];
  const previos = registros.filter(r => r.fecha <= sumarDias(ultimo.fecha, -90));
  const ref = previos.length ? previos[previos.length - 1] : puntosKm(v, registros)[0];
  const dias = diasEntre(ref.fecha, ultimo.fecha);
  const km = ultimo.km - ref.km;
  if (dias < 14 || km <= 0) return null;
  return { kmPorDia: km / dias, kmAnual: (km / dias) * 365, dias };
}

// ---- Combustible ----
// `registros`: llenados de UN vehículo. km/L por llenado completo: (km − kmLlenoAnterior) / Σ litros desde el lleno
// anterior (exclusive) hasta este (inclusive). Sin lleno de referencia → null.
export function combustibleStats(registros, periodo) {
  const todos = vivos(registros).sort(porFechaKm);
  let ultimoLleno = null;
  let litrosDesde = 0;
  const calculados = todos.map(r => {
    litrosDesde += r.litros;
    let kmPorLitro = null;
    if (r.tanqueLleno) {
      if (ultimoLleno && r.km > ultimoLleno.km && litrosDesde > 0) kmPorLitro = (r.km - ultimoLleno.km) / litrosDesde;
      ultimoLleno = r;
      litrosDesde = 0;
    }
    return { id: r.id, fecha: r.fecha, km: r.km, litros: r.litros, precioLitro: r.precioLitro, total: r.total, tanqueLleno: r.tanqueLleno, kmPorLitro };
  });
  const llenados = calculados.filter(l => enPeriodo(l.fecha, periodo));

  // Promedio ponderado: distancia entre el primer y el último lleno / litros cargados después del primero.
  let kmPorLitroPromedio = null;
  const llenos = llenados.filter(l => l.tanqueLleno);
  if (llenos.length >= 2) {
    const primero = llenos[0], ultimo = llenos[llenos.length - 1];
    const litros = suma(llenados.slice(llenados.indexOf(primero) + 1, llenados.indexOf(ultimo) + 1), l => l.litros);
    if (ultimo.km > primero.km && litros > 0) kmPorLitroPromedio = (ultimo.km - primero.km) / litros;
  }
  return {
    llenados,
    litros: suma(llenados, l => l.litros),
    gasto: suma(llenados, l => l.total),
    precioLitro: llenados.map(l => ({ fecha: l.fecha, precioLitro: l.precioLitro })),
    kmPorLitroPromedio,
  };
}

// Campos enlazados del llenado: `editado` = 'litros' | 'precioLitro' | 'total'.
// Editar litros o precio recalcula el total; editar el total recalcula el precio por litro.
export function recalcularCombustible({ litros, precioLitro, total }, editado) {
  if (editado === 'total') {
    if (litros > 0 && Number.isFinite(total)) precioLitro = Math.round((total / litros) * 10000) / 10000;
  } else if (litros > 0 && precioLitro >= 0 && Number.isFinite(precioLitro)) {
    total = redondear2(litros * precioLitro);
  }
  return { litros, precioLitro, total };
}

// ---- Último servicio por ítem (por vehículo) ----
export function ultimoServicioPorItem(datos, vehiculoId, hoy) {
  const trabajos = vivos(datos.trabajos).filter(t => t.vehiculoId === vehiculoId).sort(porFechaKm);
  const actual = kmActual(datos, vehiculoId);
  const ultimos = new Map();
  for (const t of trabajos) for (const l of t.lineas ?? []) ultimos.set(l.itemId, t);
  return [...ultimos].map(([itemId, t]) => ({
    itemId, fecha: t.fecha, km: t.km, haceKm: actual - t.km, haceDias: diasEntre(t.fecha, hoy),
  })).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

// ---- Recordatorios ----
const SEVERIDAD = { vencido: 0, proximo: 1, 'sin-registro': 2, ok: 3 };
const peor = (a, b) => (SEVERIDAD[a] <= SEVERIDAD[b] ? a : b);

export function recordatorios(datos, hoy) {
  const activos = vivos(datos.vehiculos).filter(v => v.estado !== 'vendido');
  const servicios = [];
  const seguros = [];
  const kmDesactualizado = [];
  const diasSinKm = datos.config?.diasSinKm ?? 30;

  for (const v of activos) {
    const actual = kmActual(datos, v.id);
    const trabajos = vivos(datos.trabajos).filter(t => t.vehiculoId === v.id).sort(porFechaKm);
    const ritmo = ritmoUso(datos, v.id, hoy);

    for (const p of v.programados ?? []) {
      if (!p.intervaloKm && !p.intervaloMeses) continue;
      const ultimo = [...trabajos].reverse().find(t => t.lineas?.some(l => l.itemId === p.itemId));
      const base = { vehiculoId: v.id, itemId: p.itemId, intervaloKm: p.intervaloKm ?? null, intervaloMeses: p.intervaloMeses ?? null };
      if (!ultimo) {
        servicios.push({ ...base, estado: 'sin-registro', ultimoKm: null, ultimaFecha: null, proximoKm: null, proximaFecha: null, kmRestantes: null, diasRestantes: null });
        continue;
      }
      const proximoKm = p.intervaloKm ? ultimo.km + p.intervaloKm : null;
      const proximaFecha = p.intervaloMeses ? sumarMeses(ultimo.fecha, p.intervaloMeses) : null;
      const kmRestantes = proximoKm !== null ? proximoKm - actual : null;
      const diasRestantes = proximaFecha ? diasEntre(hoy, proximaFecha) : null;
      let estado = 'ok';
      if (kmRestantes !== null) estado = peor(estado, kmRestantes <= 0 ? 'vencido' : kmRestantes <= UMBRAL_PROXIMO_KM ? 'proximo' : 'ok');
      if (diasRestantes !== null) estado = peor(estado, diasRestantes <= 0 ? 'vencido' : diasRestantes <= UMBRAL_PROXIMO_DIAS ? 'proximo' : 'ok');
      // Fecha estimada: la más cercana entre el plazo en meses y los días que tardarán en recorrerse los km restantes (a tu ritmo real).
      let fechaEstimada = null, limite = null;
      if (estado === 'ok' || estado === 'proximo') {
        const porKm = kmRestantes !== null && ritmo ? sumarDias(hoy, Math.ceil(kmRestantes / ritmo.kmPorDia)) : null;
        if (porKm && proximaFecha) { fechaEstimada = porKm < proximaFecha ? porKm : proximaFecha; limite = porKm < proximaFecha ? 'km' : 'meses'; }
        else if (porKm) { fechaEstimada = porKm; limite = 'km'; }
        else if (proximaFecha) { fechaEstimada = proximaFecha; limite = 'meses'; }
      }
      servicios.push({ ...base, estado, ultimoKm: ultimo.km, ultimaFecha: ultimo.fecha, proximoKm, proximaFecha, kmRestantes, diasRestantes, fechaEstimada, limite });
    }

    // Seguros/documentos: solo el vigente más reciente de cada tipo (una renovación reemplaza al vencido anterior).
    if (v.usaSeguros) {
      const ultimoPorTipo = new Map();
      for (const s of vivos(datos.seguros).filter(s => s.vehiculoId === v.id)) {
        const previo = ultimoPorTipo.get(s.tipo);
        if (!previo || s.vence > previo.vence) ultimoPorTipo.set(s.tipo, s);
      }
      for (const s of ultimoPorTipo.values()) {
        const diasRestantes = diasEntre(hoy, s.vence);
        const estado = diasRestantes < 0 ? 'vencido' : diasRestantes <= UMBRAL_PROXIMO_DIAS ? 'proximo' : 'ok';
        seguros.push({ vehiculoId: v.id, seguroId: s.id, tipo: s.tipo, entidad: s.entidad ?? '', vence: s.vence, estado, diasRestantes });
      }
    }

    // Km desactualizado: último registro con km demasiado viejo.
    const ultimaFecha = registrosKm(datos, v.id).map(r => r.fecha).sort().pop() ?? v.fechaAlta ?? hoy;
    const dias = diasEntre(ultimaFecha, hoy);
    if (dias > diasSinKm) kmDesactualizado.push({ vehiculoId: v.id, dias, ultimaFecha });
  }

  const orden = (a, b) => SEVERIDAD[a.estado] - SEVERIDAD[b.estado];
  servicios.sort(orden);
  seguros.sort(orden);
  const urgentes = x => x.estado === 'vencido' || x.estado === 'proximo';
  return {
    servicios, seguros, kmDesactualizado,
    pendientes: servicios.filter(urgentes).length + seguros.filter(urgentes).length + kmDesactualizado.length,
  };
}

// ---- Hoja de vida de un vehículo (datos para el PDF imprimible) ----
// Mismas definiciones de la sección 10 con incluir = solo mantenimiento. `periodo` filtra resumen e historial.
export function hojaDeVida(datos, vehiculoId, periodo, hoy) {
  const v = vehiculoPorId(datos, vehiculoId);
  if (!v) return null;
  const k = kpisVehiculo(datos, vehiculoId, periodo, { mantenimiento: true, combustible: false, seguros: false }, hoy);
  const nombreItem = id => (datos.items ?? []).find(i => i.id === id)?.nombre ?? 'Ítem eliminado';
  const todos = vivos(datos.trabajos).filter(t => t.vehiculoId === vehiculoId).sort(porFechaKm);
  const trabajos = todos.filter(t => enPeriodo(t.fecha, periodo));
  const recientesPrimero = [...trabajos].reverse();   // el PDF lista del más reciente al más antiguo

  const historial = recientesPrimero.map(t => ({
    id: t.id, fecha: t.fecha, km: t.km, tipoMtto: t.tipoMtto, total: t.total,
    lineas: (t.lineas ?? []).map(l => ({ nombre: nombreItem(l.itemId), cantidad: l.cantidad, precioUnit: l.precioUnit, subtotal: redondear2(l.cantidad * l.precioUnit) })),
  }));
  const porAnio = {};
  for (const t of trabajos) porAnio[t.fecha.slice(0, 4)] = (porAnio[t.fecha.slice(0, 4)] ?? 0) + t.total;
  const subtotalesAnio = Object.entries(porAnio).sort().map(([anio, total]) => ({ anio, total: redondear2(total) }));

  const garantias = [];
  for (const t of todos) {
    for (const l of t.lineas ?? []) {
      if (l.garantiaHasta && l.garantiaHasta >= hoy) garantias.push({ nombre: nombreItem(l.itemId), fecha: t.fecha, garantiaHasta: l.garantiaHasta });
    }
  }
  garantias.sort((a, b) => (a.garantiaHasta < b.garantiaHasta ? -1 : 1));

  const ultimo = todos.length ? { fecha: todos[todos.length - 1].fecha, km: todos[todos.length - 1].km } : null;
  const proximos = recordatorios(datos, hoy).servicios.filter(r => r.vehiculoId === vehiculoId && (r.estado === 'vencido' || r.estado === 'proximo'))
    .map(r => ({ ...r, nombre: nombreItem(r.itemId) }));
  const comb = combustibleStats(vivos(datos.combustible).filter(c => c.vehiculoId === vehiculoId), periodo);

  return {
    vehiculo: v, kmActual: kmActual(datos, vehiculoId),
    resumen: { trabajos: trabajos.length, gasto: k.gastoTrabajos, costoPorKm: k.costoPorKm, gastoMensual: k.gastoMensual, preventivoPct: k.preventivoPct, correctivoPct: k.correctivoPct, ultimo },
    historial, subtotalesAnio, garantias, proximos,
    combustible: { llenados: comb.llenados.length, litros: comb.litros, gasto: comb.gasto, kmPorLitroPromedio: comb.kmPorLitroPromedio },
    segurosVigentes: vivos(datos.seguros).filter(s => s.vehiculoId === vehiculoId && s.vence >= hoy).sort((a, b) => (a.vence < b.vence ? -1 : 1)),
  };
}

// Resumen de alertas por vehículo a partir del resultado de recordatorios().
export function alertasPorVehiculo(rec) {
  const porVeh = {};
  const de = id => (porVeh[id] ??= { vencidos: 0, proximos: 0, kmDesactualizado: null });
  for (const x of [...rec.servicios, ...rec.seguros]) {
    if (x.estado === 'vencido') de(x.vehiculoId).vencidos++;
    else if (x.estado === 'proximo') de(x.vehiculoId).proximos++;
  }
  for (const k of rec.kmDesactualizado) de(k.vehiculoId).kmDesactualizado = k.dias;
  return porVeh;
}

// ---- Validaciones del formulario (advierten, no bloquean) ----
// ¿El km es coherente con el registro anterior y el siguiente del vehículo (por fecha)?
export function kmCoherente(datos, vehiculoId, fecha, km, excluirId = null) {
  const v = vehiculoPorId(datos, vehiculoId);
  const regs = registrosKm(datos, vehiculoId).filter(r => r.id !== excluirId).sort(porFechaKm);
  const previos = regs.filter(r => r.fecha < fecha);
  const siguientes = regs.filter(r => r.fecha > fecha);
  let anterior = previos.length ? previos[previos.length - 1].km : null;
  if (anterior === null && v && (!v.fechaAlta || fecha >= v.fechaAlta)) anterior = v.kmInicial ?? null;
  const siguiente = siguientes.length ? siguientes[0].km : null;
  const ok = (anterior === null || km >= anterior) && (siguiente === null || km <= siguiente);
  return { ok, anterior, siguiente };
}

// % de diferencia vs el último precio si supera el umbral; si no, null.
export function precioAnomalo(precio, ultimoPrecio, umbralPct) {
  if (!ultimoPrecio || ultimoPrecio <= 0) return null;
  const pct = ((precio - ultimoPrecio) / ultimoPrecio) * 100;
  return Math.abs(pct) > umbralPct ? Math.round(pct) : null;
}

// ---- Fusión local/remoto (sync e importación) ----
// Por `id`, gana el `act` más reciente (empate → local). Los borrados se propagan: nunca se pierde un registro.
export function fusionar(local, remoto) {
  const resultado = { version: local.version ?? remoto.version ?? 1 };
  for (const col of ['vehiculos', 'items', 'trabajos', 'combustible', 'seguros', 'kms', 'categorias']) {
    const mapa = new Map();
    for (const r of remoto[col] ?? []) mapa.set(r.id, r);
    for (const r of local[col] ?? []) {
      const otro = mapa.get(r.id);
      mapa.set(r.id, !otro || (r.act ?? '') >= (otro.act ?? '') ? r : otro);
    }
    resultado[col] = [...mapa.values()].sort((a, b) => (a.id < b.id ? -1 : 1));   // orden estable: evita commits de más
  }
  const cl = local.config ?? {}, cr = remoto.config ?? {};
  resultado.config = (cr.act ?? '') > (cl.act ?? '') ? cr : cl;
  return resultado;
}
