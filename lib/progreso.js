/**
 * Progreso dentro del ciclo: cuanto cambio cada ejercicio de punta a punta.
 *
 * La app mostraba los e1RM semana por semana y una flecha. La planilla mostraba
 * ademas Δ y Δ%, que es lo que convierte cuatro numeros en una respuesta:
 * subieron 7 kg no dice lo mismo en un press de 80 que en un curl de 18.
 *
 * Funcion pura y aparte para poder verificarla. Vive fuera de `lib/formulas.js`
 * porque eso es zona protegida y esto no toca ninguna de sus formulas.
 */

/** El orden de las semanas: 'DL' al final, el resto por numero. */
const orden = (w) => {
  const s = String(w);
  if (s === "DL") return 1e6;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : -1;
};

/**
 * Δ de un ejercicio entre la primera y la ultima semana CON DATOS.
 *
 * No entre la semana 1 y la ultima del programa: un ejercicio que entro en la
 * semana 2 no retrocedio, empezo despues. Y las semanas sin datos en el medio
 * no cuentan, porque no significan una caida sino que ese dia se hizo otra cosa.
 *
 * El deload queda FUERA. Es una semana de menos volumen a proposito: medir el
 * progreso del ciclo contra ella diria que todo el mundo empeora.
 *
 * `semanaEnCurso` marca el resultado como provisional cuando la ultima semana
 * con datos es la que se esta entrenando ahora: todavia puede faltar la serie
 * pesada, y un Δ negativo ahi es una foto a mitad de camino, no un retroceso.
 */
export function deltaE1rm(porSemana = {}, { semanaEnCurso = null } = {}) {
  const semanas = Object.keys(porSemana)
    .filter((w) => String(w) !== "DL" && Number.isFinite(porSemana[w]) && porSemana[w] > 0)
    .sort((a, b) => orden(a) - orden(b));

  if (semanas.length < 2) {
    return { primera: null, ultima: null, delta: null, pct: null, provisional: false, semanas: semanas.length };
  }

  const wIni = semanas[0];
  const wFin = semanas[semanas.length - 1];
  const primera = porSemana[wIni];
  const ultima = porSemana[wFin];
  const delta = Math.round(ultima - primera);

  return {
    primera: Math.round(primera),
    ultima: Math.round(ultima),
    delta,
    pct: primera > 0 ? Math.round((delta / primera) * 1000) / 10 : null,
    provisional: semanaEnCurso !== null && String(wFin) === String(semanaEnCurso),
    semanas: semanas.length,
    desde: wIni,
    hasta: wFin,
  };
}

/**
 * Resumen del ciclo: cuantos ejercicios subieron, cuantos bajaron.
 *
 * Con quince filas de numeros, la pregunta real ("voy bien?") se responde
 * contando, no leyendo. Los provisionales se cuentan aparte para no dar por
 * cerrado lo que todavia se esta entrenando.
 */
export function resumenCiclo(filas = []) {
  let suben = 0, bajan = 0, iguales = 0, provisionales = 0;
  for (const f of filas) {
    if (f?.delta === null || f?.delta === undefined) continue;
    if (f.provisional) provisionales++;
    if (f.delta > 0) suben++;
    else if (f.delta < 0) bajan++;
    else iguales++;
  }
  return { suben, bajan, iguales, provisionales, total: suben + bajan + iguales };
}
