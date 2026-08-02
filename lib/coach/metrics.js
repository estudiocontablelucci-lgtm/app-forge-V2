/**
 * Metricas de seguimiento de un alumno.
 *
 * Funciones puras a proposito: no tocan la base ni la sesion, reciben las filas
 * ya leidas y devuelven numeros. Es lo que permite que `verify-coach-metrics`
 * ejercite las reglas de negocio de verdad (adherencia, desvio de RIR) sin
 * levantar un servidor ni inventar una copia de la formula.
 *
 * El e1RM y el tonelaje salen de `lib/formulas.js`, el mismo modulo que usa la
 * pantalla de Progreso del atleta: el entrenador y el alumno tienen que ver el
 * mismo numero o la conversacion entre los dos no cierra.
 */
import { brzycki, isNum } from "../formulas.js";

const DIA = 86400000;

/* ---------- RIR ---------- */

/**
 * El objetivo de RIR se escribe como texto libre en la plantilla: "2", "2-3",
 * "1-2". Se devuelve como rango incluso cuando es un solo numero, asi el
 * calculo del desvio es uno solo.
 */
export function parseRirObjetivo(txt) {
  if (txt === null || txt === undefined) return null;
  const nums = String(txt).match(/\d+(?:[.,]\d+)?/g);
  if (!nums || !nums.length) return null;
  const vals = nums.map((n) => parseFloat(n.replace(",", "."))).filter(Number.isFinite);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

/**
 * Cuanto se aparta el RIR reportado del objetivo, con signo.
 *
 * Se mide contra el BORDE del rango, no contra el punto medio: un objetivo
 * "2-3" con promedio 3 esta en objetivo, no desviado 0.5. Positivo = reporta
 * mas reps en reserva de las pedidas, o sea la carga quedo corta.
 */
export function desvioRir(promedio, objetivo) {
  if (!objetivo || !isNum(promedio)) return null;
  if (promedio > objetivo.max) return promedio - objetivo.max;
  if (promedio < objetivo.min) return promedio - objetivo.min;
  return 0;
}

/** Umbral del aviso: mas de 1 punto de desvio es carga mal calibrada. */
export const UMBRAL_RIR = 1;

/**
 * Ejercicios cuya carga esta mal calibrada segun el RIR que reporto el alumno.
 *
 * Solo mira las series de la semana mas reciente en que se entreno ese
 * ejercicio: un desvio de hace tres semanas ya se corrigio o dejo de importar,
 * y promediar todo el ciclo lo diluye justo cuando hay que actuar.
 */
export function alertasRir(sets, ejercicios) {
  const porEjercicio = new Map();
  for (const s of sets) {
    if (!isNum(s.rir)) continue;
    const clave = s.programExerciseId || s.exerciseName;
    if (!porEjercicio.has(clave)) porEjercicio.set(clave, []);
    porEjercicio.get(clave).push(s);
  }

  const alertas = [];
  for (const [clave, todas] of porEjercicio) {
    const ex = ejercicios.find((e) => e.id === clave) || ejercicios.find((e) => e.name === clave);
    const objetivo = parseRirObjetivo(ex?.rir);
    if (!objetivo) continue;

    // La semana mas reciente con datos de ese ejercicio.
    const ultima = todas.reduce((max, s) => (ordenSemana(s.week) > ordenSemana(max) ? s.week : max), todas[0].week);
    const recientes = todas.filter((s) => s.week === ultima);
    const promedio = recientes.reduce((a, s) => a + Number(s.rir), 0) / recientes.length;

    const desvio = desvioRir(promedio, objetivo);
    if (desvio === null || Math.abs(desvio) <= UMBRAL_RIR) continue;

    alertas.push({
      id: ex?.id || clave,
      name: ex?.name || s0(recientes),
      objetivo: ex?.rir ?? null,
      semana: ultima,
      promedio: redondear(promedio, 1),
      desvio: redondear(desvio, 1),
      // Que hacer, en los terminos del entrenador. Reportar MAS reserva de la
      // pedida significa que se quedo corto: la carga sube.
      sentido: desvio > 0 ? "liviano" : "pesado",
      series: recientes.length,
    });
  }
  return alertas.sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio));
}

const s0 = (arr) => arr[0]?.exerciseName || "Ejercicio";

/** "DL" (deload) va siempre al final; el resto ordena por numero. */
export function ordenSemana(w) {
  const s = String(w);
  if (s === "DL") return 1e6;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : -1;
}

/* ---------- volumen ---------- */

/**
 * Tonelaje por semana: kg x reps de toda serie con carga externa.
 *
 * Las mismas exclusiones que la pantalla del atleta: los ejercicios medidos en
 * pasos no suman tonelaje, y "BW" (peso corporal) queda fuera porque no hay
 * carga externa que sumar.
 */
export function tonelajePorSemana(sets, ejercicios = []) {
  const enPasos = new Set(ejercicios.filter((e) => e.unit === "pasos").map((e) => e.id));
  const out = {};
  for (const s of sets) {
    if (enPasos.has(s.programExerciseId)) continue;
    const kg = Number(s.kg), reps = parseInt(s.reps, 10);
    if (!isNum(kg) || !reps) continue;
    out[s.week] = (out[s.week] || 0) + kg * reps;
  }
  return out;
}

/** Mejor e1RM por ejercicio y por semana, igual que la tabla de Progreso. */
export function e1rmPorEjercicio(sets, ejercicios = []) {
  const enPasos = new Set(ejercicios.filter((e) => e.unit === "pasos").map((e) => e.id));
  const out = {};
  for (const s of sets) {
    const clave = s.programExerciseId || s.exerciseName;
    if (enPasos.has(clave)) continue;
    const kg = Number(s.kg), reps = parseInt(s.reps, 10);
    if (!isNum(kg) || !reps) continue;
    const e1 = brzycki(kg, reps);
    if (!e1) continue;
    out[clave] = out[clave] || { name: s.exerciseName, porSemana: {} };
    out[clave].porSemana[s.week] = Math.max(out[clave].porSemana[s.week] || 0, e1);
  }

  // Se resuelve el nombre contra el programa: el del set_log es el que tenia el
  // ejercicio cuando se entreno y puede haber cambiado desde entonces.
  return Object.entries(out).map(([id, v]) => {
    const ex = ejercicios.find((e) => e.id === id);
    const semanas = Object.keys(v.porSemana).sort((a, b) => ordenSemana(a) - ordenSemana(b));
    const primera = v.porSemana[semanas[0]];
    const ultima = v.porSemana[semanas[semanas.length - 1]];
    return {
      id,
      name: ex?.name || v.name,
      retirado: !ex,
      porSemana: Object.fromEntries(semanas.map((w) => [w, Math.round(v.porSemana[w])])),
      // Progreso dentro del ciclo. Con una sola semana no hay delta que mostrar.
      delta: semanas.length > 1 ? Math.round(ultima - primera) : null,
    };
  }).sort((a, b) => Number(a.retirado) - Number(b.retirado) || a.name.localeCompare(b.name, "es"));
}

/* ---------- adherencia ---------- */

/**
 * Sesiones hechas contra programadas en la ventana de los ultimos N dias.
 *
 * Programadas = cuantas sesiones distintas tiene una semana del programa. Es la
 * lectura honesta y simple: un fullbody 3x espera tres sesiones cada siete
 * dias. No se intenta adivinar en que dias concretos deberia haber entrenado —
 * la app no pide un calendario y fingir que lo sabe daria un numero inventado.
 */
export function adherencia(sesiones, sesionesPorSemana, ahora = Date.now(), dias = 7) {
  const desde = ahora - dias * DIA;
  const enVentana = sesiones.filter((s) => {
    const t = new Date(s.date).getTime();
    return Number.isFinite(t) && t >= desde && t <= ahora;
  });
  const programadas = sesionesPorSemana || 0;
  return {
    hechas: enVentana.length,
    programadas,
    // Sin programa asignado no hay denominador y el porcentaje no significa nada.
    pct: programadas ? Math.round((enVentana.length / programadas) * 100) : null,
    dias,
    desde: new Date(desde).toISOString(),
  };
}

/* ---------- semana en curso ---------- */

/** La semana mas avanzada que el alumno ya empezo a entrenar. */
export function semanaEnCurso(sesiones) {
  if (!sesiones.length) return null;
  return sesiones.reduce((max, s) => (ordenSemana(s.week) > ordenSemana(max) ? s.week : max), sesiones[0].week);
}

function redondear(v, d) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/**
 * Arma la ficha completa a partir de lo que ya leyo el repo.
 *
 * Recibe el programa con los ids que ve el ENTRENADOR (sin prefijo) y los sets
 * ya traducidos a esos mismos ids. Alinear eso es responsabilidad de quien
 * llama, y es exactamente donde aparecieron los bugs de la etapa anterior: un
 * id mal traducido no rompe nada, solo muestra todo vacio como si el alumno no
 * hubiera entrenado.
 */
export function fichaDeAlumno({ programa, sesiones = [], sets = [], ahora = Date.now() }) {
  const ejercicios = programa?.exercises || [];
  const porSemana = programa?.sessions?.length || 0;

  const ordenadas = [...sesiones].sort((a, b) => new Date(b.date) - new Date(a.date));
  const tonnage = tonelajePorSemana(sets, ejercicios);

  return {
    semanaEnCurso: semanaEnCurso(ordenadas),
    adherencia: adherencia(ordenadas, porSemana, ahora),
    ultimo: ordenadas[0] || null,
    tonelaje: Object.keys(tonnage)
      .sort((a, b) => ordenSemana(a) - ordenSemana(b))
      .map((w) => ({ week: w, kg: Math.round(tonnage[w]) })),
    e1rm: e1rmPorEjercicio(sets, ejercicios),
    notas: ordenadas.filter((s) => s.note && String(s.note).trim()),
    alertasRir: alertasRir(sets, ejercicios),
  };
}
