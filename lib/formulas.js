/**
 * Formulas de negocio. Fuente de verdad unica: la usan tanto la UI como el
 * servidor al persistir e1rm en set_logs. Si vivieran duplicadas, un dia el
 * e1RM guardado dejaria de coincidir con el que muestra la pantalla.
 *
 * Zona protegida: no cambiar el calculo sin consulta explicita.
 */

/** e1RM Brzycki. Null fuera del rango util (la formula diverge en reps >= 37). */
export const brzycki = (kg, reps) => (reps > 0 && reps < 37 ? (kg * 36) / (37 - reps) : null);

/** Un ejercicio a peso corporal: dominadas, fondos, flexiones. */
export const esBW = (ref) => String(ref ?? "").trim().toUpperCase() === "BW";

/**
 * Los kilos que movio DE VERDAD una serie.
 *
 * En un ejercicio a peso corporal el campo de kilos es el LASTRE —la pantalla
 * de Entrenar lo rotula "+KG"— asi que ocho dominadas se registraban como
 * `kg` vacio y quedaban en cero: fuera del tonelaje y sin e1RM. La app decia
 * que no habias movido nada mientras te levantabas ochenta kilos ocho veces.
 *
 * `pesoCorporal` es el VIGENTE A LA FECHA de esa serie, no el de hoy. Es la
 * razon por la que el peso tuvo que dejar de ser un numero suelto: con uno
 * solo, bajar tres kilos reescribia hacia atras el e1RM de cada dominada que
 * hiciste en tu vida.
 *
 * Sin peso conocido devuelve null y el ejercicio queda afuera, que es
 * exactamente el comportamiento anterior: mejor no contarlo que inventarlo.
 */
export function cargaEfectiva({ ref, kg, pesoCorporal }) {
  const lastre = Number.parseFloat(kg);
  if (!esBW(ref)) return Number.isFinite(lastre) ? lastre : null;
  const bw = Number.parseFloat(pesoCorporal);
  if (!Number.isFinite(bw)) return null;
  return bw + (Number.isFinite(lastre) ? lastre : 0);
}

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
 * Referencia de kilos de un ejercicio para una semana concreta.
 *
 * `refKg` es la referencia general y `refsByWeek` guarda las excepciones. Hace
 * falta porque la progresion de este tipo de programa no es prescrita sino
 * autorregulada: se mira como fue la semana 3 y se suben las refs para la 4.
 * Sin esto, cambiar la referencia la cambiaba tambien para las semanas ya
 * entrenadas, que es reescribir lo que se pidio hacer.
 *
 * La clave es string ("1".."n" | "DL") porque asi viaja en el schema
 * (`assignment_refs.week`) y asi vuelve del servidor.
 */
export function refFor(ex, week) {
  const porSemana = ex?.refsByWeek;
  if (!porSemana || week === null || week === undefined) return ex?.refKg ?? null;
  const propia = porSemana[String(week)];
  return propia === undefined || propia === "" ? (ex?.refKg ?? null) : propia;
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
