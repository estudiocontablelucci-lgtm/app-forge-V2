/**
 * Formulas de negocio. Fuente de verdad unica: la usan tanto la UI como el
 * servidor al persistir e1rm en set_logs. Si vivieran duplicadas, un dia el
 * e1RM guardado dejaria de coincidir con el que muestra la pantalla.
 *
 * Zona protegida: no cambiar el calculo sin consulta explicita.
 */

/** e1RM Brzycki. Null fuera del rango util (la formula diverge en reps >= 37). */
export const brzycki = (kg, reps) => (reps > 0 && reps < 37 ? (kg * 36) / (37 - reps) : null);

/**
 * Deload por defecto: -40% de volumen quitando series, nunca por debajo de 2.
 *
 * El piso importa. La regla anterior era `sets - 1`, que sobre 2 series deja 1
 * y recorta el 50% justo en los ejercicios que menos volumen tienen — entre
 * ellos el protocolo ASIM-IZQ, que existe para corregir asimetria a base de
 * series extra en el lado debil. Reducir ahi es hacer lo contrario de lo que el
 * protocolo pide.
 */
export const DELOAD_DEFAULT = { pct: 40, method: "sets", minSets: 2 };

const cfgDeload = (deload) => ({ ...DELOAD_DEFAULT, ...deload });

/**
 * Series que toca hacer en una semana. En deload depende de la configuracion
 * del programa; en el resto de las semanas es lo que dice el ejercicio.
 */
export function setsFor(ex, week, deload) {
  if (week !== "DL") return ex.sets;
  const { pct, method, minSets } = cfgDeload(deload);
  if (method === "reps") return ex.sets;          // el deload sale de las reps
  const objetivo = Math.round(ex.sets * (1 - pct / 100));
  // El piso no puede superar lo que el ejercicio ya tenia: un ejercicio de 1
  // serie no puede "subir" a 2 en deload.
  return Math.max(Math.min(minSets, ex.sets), objetivo);
}

/**
 * Rango de reps de una semana. Solo cambia en deload y solo si el programa
 * eligio reducir por reps en vez de por series.
 */
export function repsFor(ex, week, deload) {
  const { pct, method } = cfgDeload(deload);
  if (week !== "DL" || method !== "reps") return { min: ex.repsMin, max: ex.repsMax };
  const factor = 1 - pct / 100;
  const baja = (v) => (v === null || v === undefined ? v : Math.max(1, Math.round(v * factor)));
  return { min: baja(ex.repsMin), max: baja(ex.repsMax) };
}

/** Key de un set en el hash de logs del cliente. */
export const keyOf = (week, exId, n) => `${week}|${exId}|${n}`;

export const isNum = (v) => typeof v === "number" && !isNaN(v);
