/**
 * La vez pasada: que se hizo la ultima vez en este mismo ejercicio.
 *
 * Entrenar mostraba `Ref: 140kg × 8-10`, que es la PRESCRIPCION, y nada de lo
 * que se hizo de verdad. El dato estaba guardado —`logs` es `week|exId|setN` y
 * conserva todas las semanas— pero para verlo habia que salir a Historial, que
 * es lo que nadie hace a mitad de serie. En la practica se decidia de memoria.
 *
 * Esto NO toca el prellenado. El valor que entra al campo sigue saliendo del
 * programa (`refFor`), y por buenas razones: FORGE es un programa EJECUTADO, no
 * un log. Prellenar con lo ultimo haria que el mesociclo derive solo a repetir
 * carga y **anularia el deload sin que nadie lo note** —es -40% a proposito—.
 * La vez pasada se MUESTRA al lado, como dato para decidir.
 * Ver `docs/benchmark-apps-2026-08.md`.
 */
import { keyOf, isNum } from "./formulas.js";

/** El orden de las semanas: 'DL' al final, el resto por numero. Igual que en `lib/progreso.js`. */
const orden = (w) => {
  const s = String(w);
  if (s === "DL") return 1e6;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : -1;
};

/**
 * Cuantas series como maximo se buscan hacia atras.
 *
 * No se usa `ex.sets`: si el programa TENIA cinco series y hoy tiene tres, las
 * dos que sobran igual se entrenaron y cuentan para el e1RM de esa semana.
 * Doce es holgado y cuesta doce lecturas de un objeto.
 */
export const MAX_SERIES = 12;

/**
 * Las semanas anteriores a `week`, de la mas reciente a la mas vieja.
 *
 * **El deload NUNCA es fuente de comparacion.** Es una semana de menos carga a
 * proposito: comparar contra ella diria que todo el mundo mejoro. Vale en los
 * dos sentidos — ni cuando se entrena una semana normal ni cuando se entrena el
 * propio deload, que se compara contra la ultima normal. Mismo criterio que
 * `deltaE1rm` en `lib/progreso.js`.
 */
export function semanasAtras(week, weeks = []) {
  const o = orden(week);
  return (Array.isArray(weeks) ? weeks : [])
    .filter((w) => String(w) !== "DL" && orden(w) > 0 && orden(w) < o)
    .sort((a, b) => orden(b) - orden(a));
}

/**
 * Una serie cuenta si tiene REPS. No alcanza con `done`.
 *
 * `logsFromHistory` marca `done: true` en todo lo que baja del servidor, y en
 * el estado local `done` se pone al cerrar la serie. Lo que hace comparable a
 * una serie es que diga cuantas repeticiones se hicieron: sin eso no hay nada
 * que mostrar y tampoco e1RM que calcular.
 */
export function hecha(l) {
  return !!l && parseInt(l.reps, 10) > 0;
}

/**
 * La ultima vez que se entreno este ejercicio, con todas sus series.
 *
 * Devuelve `{ week, series: { [setN]: {kg, reps, rir} } }` o null.
 *
 * **Una sola semana para todo el ejercicio, no una por serie.** Buscar cada
 * serie por su cuenta parece mas completo y miente: la S1 saldria de la semana
 * pasada y la S4 de hace un mes, sin que la pantalla diga que son dias
 * distintos. Si la ultima vez se hicieron tres series y hoy tocan cuatro, la
 * cuarta no tiene comparacion — y eso es la verdad.
 *
 * No devuelve los escalones del dropset: `logsFromHistory` no los reconstruye,
 * asi que en un dispositivo que sincronizo estarian y en otro no. Mostrar un
 * dato que aparece segun el telefono es peor que no mostrarlo.
 */
export function anteriorDe(logs = {}, exId, week, weeks = []) {
  if (!exId) return null;
  for (const w of semanasAtras(week, weeks)) {
    const series = {};
    let hay = false;
    for (let n = 1; n <= MAX_SERIES; n++) {
      const l = logs[keyOf(w, exId, n)];
      if (!hecha(l)) continue;
      series[n] = { kg: l.kg, reps: l.reps, rir: l.rir };
      hay = true;
    }
    if (hay) return { week: w, series };
  }
  return null;
}

/**
 * El mejor e1RM de esas series, con `calc` inyectado.
 *
 * La formula no se importa aca: `brzycki` es zona protegida y este modulo no
 * tiene por que decidir cual se usa. Entra por parametro, que ademas lo hace
 * verificable sin arrastrar `lib/formulas.js`.
 *
 * **Solo la serie principal**, igual que en Progreso y por el mismo motivo: un
 * descuelgue con menos peso y muchas reps infla el Brzycki (CONTEXT.md
 * 2026-08-05). Como `anteriorDe` no trae escalones, esto sale gratis.
 */
export function e1rmDe(anterior, calc) {
  if (!anterior || typeof calc !== "function") return null;
  let best = 0;
  for (const s of Object.values(anterior.series || {})) {
    const kg = parseFloat(s.kg), reps = parseInt(s.reps, 10);
    if (!isNum(kg) || !reps) continue;
    best = Math.max(best, calc(kg, reps) || 0);
  }
  return best > 0 ? Math.round(best) : null;
}
