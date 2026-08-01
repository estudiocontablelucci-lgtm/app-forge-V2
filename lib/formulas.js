/**
 * Formulas de negocio. Fuente de verdad unica: la usan tanto la UI como el
 * servidor al persistir e1rm en set_logs. Si vivieran duplicadas, un dia el
 * e1RM guardado dejaria de coincidir con el que muestra la pantalla.
 *
 * Zona protegida: no cambiar el calculo sin consulta explicita.
 */

/** e1RM Brzycki. Null fuera del rango util (la formula diverge en reps >= 37). */
export const brzycki = (kg, reps) => (reps > 0 && reps < 37 ? (kg * 36) / (37 - reps) : null);

/** Key de un set en el hash de logs del cliente. */
export const keyOf = (week, exId, n) => `${week}|${exId}|${n}`;

export const isNum = (v) => typeof v === "number" && !isNaN(v);
