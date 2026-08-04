/**
 * Asistencia al gimnasio: dias por mes, promedios y tendencia.
 *
 * Distinto de la adherencia al programa, que compara sesiones hechas contra
 * programadas en una ventana corta. Esto es la otra pregunta, la larga: cuantos
 * dias por mes se entrena, y si eso viene subiendo o bajando. La planilla tenia
 * las dos y la app solo la primera.
 *
 * DIAS, no sesiones: entrenar dos veces un martes es un dia de gimnasio, no dos.
 *
 * Dos fuentes que se combinan. Lo que la app registro se calcula solo del
 * historial; los meses anteriores a la app solo existen si alguien los carga a
 * mano. Un mes cargado a mano MANDA sobre el calculado — el caso tipico es el
 * mes en que se empezo a usar la app, donde el historial tiene tres sesiones y
 * la persona entreno nueve.
 */

/** 'AAAA-MM' de una fecha, en horario local: el mes es el del calendario. */
export function mesDe(fecha) {
  const d = aFecha(fecha);
  return d && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * A Date, o null.
 *
 * El null se descarta ANTES de construir la fecha: `new Date(null)` no es una
 * fecha invalida, es la epoca — una sesion sin fecha aparecia como diciembre de
 * 1969 y estiraba la serie cincuenta y siete anios hacia atras.
 */
function aFecha(v) {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const diaDe = (fecha) => {
  const d = aFecha(fecha);
  return d && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Dias distintos con entrenamiento, por mes, sacados del historial de la app.
 *
 * Se cuentan dias y no entradas: dos sesiones el mismo dia son un dia. Y se
 * mira TODO el historial, sin filtrar por programa: ir al gimnasio es ir al
 * gimnasio, aunque ese dia se entrenara otra rutina.
 */
export function mesesDesdeHistorial(history = []) {
  const porMes = new Map();
  for (const h of history) {
    const dia = diaDe(h?.date);
    if (!dia) continue;
    const mes = dia.slice(0, 7);
    if (!porMes.has(mes)) porMes.set(mes, new Set());
    porMes.get(mes).add(dia);
  }
  return Object.fromEntries([...porMes].map(([m, dias]) => [m, dias.size]));
}

/**
 * Combina lo calculado con lo cargado a mano. Lo manual gana.
 *
 * No se toma el maximo: si alguien corrige un mes hacia abajo porque conto mal,
 * el maximo ignoraria la correccion y el dato quedaria mintiendo para siempre.
 */
export function combinar(calculado = {}, manual = {}) {
  const out = { ...calculado };
  for (const [mes, dias] of Object.entries(manual)) {
    if (dias === null || dias === undefined) continue;
    out[mes] = dias;
  }
  return out;
}

/** Todos los meses entre el primero y el ultimo, incluidos los de cero. */
export function rango(meses = {}) {
  const claves = Object.keys(meses).sort();
  if (!claves.length) return [];
  const [aIni, mIni] = claves[0].split("-").map(Number);
  const [aFin, mFin] = claves[claves.length - 1].split("-").map(Number);

  const out = [];
  let a = aIni, m = mIni;
  while (a < aFin || (a === aFin && m <= mFin)) {
    const clave = `${a}-${String(m).padStart(2, "0")}`;
    // Un mes sin entrenar es un CERO, no un hueco: saltearlo haria que el
    // promedio suba justo por los meses en que no se fue.
    out.push({ mes: clave, dias: meses[clave] ?? 0 });
    m++;
    if (m > 12) { m = 1; a++; }
  }
  return out;
}

const prom = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

/**
 * Resumen para la pantalla.
 *
 * `desde` permite el segundo promedio de la planilla ("desde 07/2025"), que es
 * el que muestra si algo cambio: el historico completo diluye una mejora
 * reciente entre dos anios de datos viejos.
 */
export function resumen(meses = {}, { desde = null, hoy = new Date() } = {}) {
  const serie = rango(meses);
  if (!serie.length) return { serie: [], total: 0, promedio: null, promedioDesde: null, mejor: null, mesActual: null, racha: 0 };

  const mesHoy = mesDe(hoy);
  // El mes en curso no entra en los promedios: todavia no termino y arrastraria
  // el promedio hacia abajo por estar a mitad de camino.
  const cerrados = serie.filter((x) => x.mes !== mesHoy);

  const desdeSerie = desde ? cerrados.filter((x) => x.mes >= desde) : [];
  const mejor = serie.reduce((a, b) => (b.dias > (a?.dias ?? -1) ? b : a), null);

  // Racha: meses cerrados consecutivos, desde el ultimo hacia atras, con al
  // menos un dia.
  let racha = 0;
  for (let i = cerrados.length - 1; i >= 0; i--) {
    if (cerrados[i].dias > 0) racha++; else break;
  }

  return {
    serie,
    total: serie.reduce((a, b) => a + b.dias, 0),
    promedio: prom(cerrados.map((x) => x.dias)),
    promedioDesde: desde && desdeSerie.length ? prom(desdeSerie.map((x) => x.dias)) : null,
    desde,
    mejor,
    mesActual: serie.find((x) => x.mes === mesHoy) || null,
    racha,
  };
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** '2026-08' -> 'ago 26'. */
export function etiquetaMes(clave) {
  const [a, m] = String(clave).split("-").map(Number);
  if (!a || !m) return String(clave);
  return `${MESES_CORTOS[m - 1]} ${String(a).slice(2)}`;
}
