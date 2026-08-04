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

/* ---------- bienestar: sueño, estres, energia ---------- */

/**
 * Los tres numeros del health check, sesion por sesion.
 *
 * Se preguntan antes de cada entrenamiento y hasta ahora se guardaban sin que
 * nadie los mirara: quedaban en el detalle de una sesion suelta, que es el
 * unico lugar donde NO significan nada. Valen como serie — y sobre todo
 * cruzados contra lo que se levanto ese dia.
 *
 * Ojo con el estres: 5 es MUCHO estres, al reves que los otros dos. Compararlo
 * de frente con sueño y energia daria exactamente la conclusion contraria.
 */
export const BIENESTAR = [
  { id: "sleep", label: "Sueño", bueno: "alto" },
  { id: "energy", label: "Energía", bueno: "alto" },
  { id: "stress", label: "Estrés", bueno: "bajo" },
];

/** Correlacion de Pearson. Null si no hay con que: hacen falta datos que varien. */
export function correlacion(xs, ys) {
  const pares = xs.map((x, i) => [x, ys[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pares.length < 4) return null;
  const n = pares.length;
  const mx = pares.reduce((a, [x]) => a + x, 0) / n;
  const my = pares.reduce((a, [, y]) => a + y, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (const [x, y] of pares) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  // Sin variacion no hay correlacion que calcular: contestar 4 de sueño todos
  // los dias no dice nada sobre el rendimiento, y dividir por cero diria que si.
  if (!dx || !dy) return null;
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100;
}

/** En palabras, con el umbral explicito: |r| < 0.3 no es una relacion. */
export function fuerzaCorrelacion(r) {
  if (r === null) return null;
  const a = Math.abs(r);
  if (a < 0.3) return "sin relación clara";
  if (a < 0.6) return r > 0 ? "algo de relación" : "algo de relación inversa";
  return r > 0 ? "relación fuerte" : "relación inversa fuerte";
}

/**
 * Serie de bienestar y su cruce con el tonelaje de esa sesion.
 *
 * `tonelajeDe` recibe una entrada del historial y devuelve los kg de ese dia.
 * Se inyecta para no meter aca la forma del historial ni la logica de series.
 */
export function bienestar(history = [], tonelajeDe = () => null) {
  const sesiones = [...history]
    .filter((h) => h?.health)
    .sort((a, b) => (a.date || 0) - (b.date || 0))
    .map((h) => ({
      fecha: h.date,
      week: h.week,
      session: h.session,
      sleep: h.health.sleep ?? null,
      stress: h.health.stress ?? null,
      energy: h.health.energy ?? null,
      tonelaje: tonelajeDe(h),
    }));

  const col = (k) => sesiones.map((s) => s[k]);
  const tons = col("tonelaje");

  return {
    sesiones,
    promedios: Object.fromEntries(BIENESTAR.map(({ id }) => {
      const vals = col(id).filter(Number.isFinite);
      return [id, vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null];
    })),
    // Contra el tonelaje: es la pregunta que justifica preguntar todos los dias.
    contraTonelaje: Object.fromEntries(BIENESTAR.map(({ id }) => [id, correlacion(col(id), tons)])),
    entreSi: {
      sleepEnergy: correlacion(col("sleep"), col("energy")),
      stressEnergy: correlacion(col("stress"), col("energy")),
      sleepStress: correlacion(col("sleep"), col("stress")),
    },
  };
}
