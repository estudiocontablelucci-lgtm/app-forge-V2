/**
 * Tecnicas de ejecucion: la fuente unica, como `formulas.js`.
 *
 * Existe porque hay DOS ejes distintos que la app venia mezclando:
 *
 * - Lo que AGRUPA ejercicios (superserie, tri-set) es una relacion entre filas
 *   y se modela con una FK: `superset_with`. Ya existia.
 * - Lo que pasa ADENTRO de una serie (dropset y familia) no tiene a quien
 *   apuntar: es un nivel mas de registro. Eso es lo que agrega este modulo.
 *
 * Confundirlos lleva a modelar el dropset como ejercicios sueltos, que es
 * justo lo que encadena el e1RM de dos cosas distintas.
 *
 * La columna `program_exercises.technique` existe desde la v01 y el repo ya la
 * lee y la escribe — nunca la escribio nadie. Guarda JSON:
 *
 *     { "tipo": "dropset", "pasos": 2, "aplica": "ultima" }
 *
 * Tolera tambien el string suelto ('DS') que anticipaba el comentario de la
 * v01, para que una base vieja no quede ilegible.
 */

/**
 * Como se DIBUJA cada familia. El color codifica de que clase de cosa se
 * trata; cual es exactamente lo dice el chip con el nombre.
 *
 * Ninguno de estos colores puede salir de la familia del semaforo (verde
 * #34C759 / amarillo #FF9500 / rojo #FF3B30): el semaforo dice COMO TE FUE y la
 * tecnica dice COMO SE HACE. En el gimnasio eso se lee de reojo, y un naranja
 * de estructura al lado de un amarillo de rendimiento es una trampa.
 */
export const FAMILIAS = {
  agrupa: {
    id: "agrupa",
    nombre: "Agrupa ejercicios",
    color: "#0E8F9E",   // teal — borde izquierdo del bloque
    tinta: "#0A6F7B",   // texto del rotulo
    fondo: "#E8F6F8",
  },
  intraserie: {
    id: "intraserie",
    nombre: "Adentro de la serie",
    color: "#7A3FD4",   // violeta
    tinta: "#5E2BAA",
    fondo: "#F3EDFC",
  },
};

/**
 * Las tecnicas intraserie. Agregar una es agregar una entrada aca: la UI, el
 * import de Excel y el registro salen todos de esta tabla.
 *
 * `pasos` es cuantos escalones EXTRA pide registrar despues de la serie
 * principal. `aplica` es el valor por defecto: casi siempre solo la ultima
 * serie del ejercicio.
 */
export const TECNICAS = {
  dropset: {
    id: "dropset",
    nombre: "Dropset",
    abrev: "DS",
    familia: "intraserie",
    pasos: 2,
    aplica: "ultima",
    // Lo que el atleta necesita leer en el momento, no la definicion de manual.
    ayuda: "Al terminar la serie, bajá el peso sin descansar y seguí hasta el fallo. Registrá cada bajada.",
    // Alias para el import de Excel. Sin esto, "drop set" y "DS" entrarian como
    // texto libre y no podrian pintar nada.
    alias: ["dropset", "drop set", "drop-set", "ds", "dropsets", "serie descendente"],
  },
  isoest: {
    id: "isoest",
    nombre: "Isométrica en estiramiento",
    abrev: "ISO-EST",
    familia: "intraserie",
    // CERO escalones, y no es un descuido. Es lo que la distingue del dropset:
    // pasa adentro de la serie pero no agrega nada que registrar. Con `pasos`
    // en 1 o mas, `serieCerrada()` esperaria escalones que nadie va a cargar y
    // el descanso no arrancaria nunca — el timer quedaria colgado en el unico
    // ejercicio donde esta prescripta.
    pasos: 0,
    aplica: "ultima",
    ayuda: "En la última repetición, aguantá abajo —con el músculo estirado— 15-30 segundos antes de soltar.",
    alias: ["isoest", "iso-est", "iso est", "isometrica", "isométrica", "isometrica en estiramiento", "iso"],
  },
};

/** Como se guarda en `program_exercises.technique`. */
export function tecnicaToDb(t) {
  if (!t || !t.tipo) return null;
  return JSON.stringify({ tipo: t.tipo, pasos: t.pasos, aplica: t.aplica });
}

/**
 * Lo que viene de la base, normalizado.
 *
 * Devuelve `null` si la tecnica no existe en `TECNICAS`: una base con un tipo
 * desconocido tiene que dibujarse como un ejercicio normal, no romperse ni
 * pintarse de un color que nadie sabe ejecutar.
 */
export function tecnicaFromDb(v) {
  if (!v) return null;
  let crudo = v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    if (s.startsWith("{")) {
      try { crudo = JSON.parse(s); } catch { return null; }
    } else {
      // El string suelto de la v01: 'DS'.
      crudo = { tipo: porAlias(s) };
    }
  }
  return normalizar(crudo);
}

/** Rellena los valores por defecto de la tecnica y descarta lo desconocido. */
export function normalizar(t) {
  if (!t || typeof t !== "object") return null;
  const def = TECNICAS[t.tipo];
  if (!def) return null;
  // Una tecnica SIN escalones (`pasos: 0`) no negocia: no los tiene por
  // definicion, y dejar que un valor guardado le meta uno la convertiria en un
  // dropset que ademas frenaria el descanso. El piso de 1 vale solo para las
  // que si registran escalones.
  const piso = def.pasos === 0 ? 0 : 1;
  const techo = def.pasos === 0 ? 0 : 5;
  const pedido = Number(t.pasos);
  const pasos = Number.isFinite(pedido) ? Math.max(piso, Math.min(techo, pedido)) : def.pasos;
  return { tipo: def.id, pasos, aplica: t.aplica === "todas" ? "todas" : def.aplica };
}

/** Busca una tecnica por como la escribio una persona (Excel, texto libre). */
export function porAlias(txt) {
  const s = String(txt || "").trim().toLowerCase();
  if (!s) return null;
  for (const def of Object.values(TECNICAS)) {
    if (def.id === s || def.abrev.toLowerCase() === s || def.alias.includes(s)) return def.id;
  }
  return null;
}

/** La definicion completa de la tecnica de un ejercicio, o null. */
export function defDe(ex) {
  const t = ex?.technique;
  const n = typeof t === "string" ? tecnicaFromDb(t) : normalizar(t);
  return n ? { ...TECNICAS[n.tipo], ...n } : null;
}

/** Familia visual de un ejercicio: lo intraserie gana sobre la agrupacion. */
export function familiaDe(ex, enBloque) {
  if (defDe(ex)) return FAMILIAS.intraserie;
  if (enBloque) return FAMILIAS.agrupa;
  return null;
}

/**
 * Cuantos escalones extra pide la serie `n` de este ejercicio.
 *
 * `aplica: "ultima"` es el caso normal: un dropset en todas las series de un
 * ejercicio es otra cosa (y bastante mas dura) que un dropset de cierre.
 */
export function pasosDe(ex, n, totalSets) {
  const def = defDe(ex);
  if (!def) return 0;
  if (def.aplica === "todas") return def.pasos;
  return n === totalSets ? def.pasos : 0;
}

/**
 * Los escalones registrados de una serie, siempre como array.
 *
 * `logs` guarda lo que sale de un input, asi que aca todo es string o vacio.
 */
export function pasosDeLog(log) {
  return Array.isArray(log?.pasos) ? log.pasos : [];
}

/** Un escalon cuenta como registrado cuando tiene reps, igual que una serie. */
export function pasoHecho(p) {
  return !!p && String(p.reps ?? "").trim() !== "";
}

/**
 * La serie esta CERRADA (y recien ahi arranca el descanso).
 *
 * Entre escalones de un dropset no hay descanso — ese es el punto de la
 * tecnica. Si el timer arrancara al cerrar la serie principal, sonaria
 * justo cuando hay que bajar el peso y seguir.
 */
export function serieCerrada(ex, n, totalSets, log) {
  const faltan = pasosDe(ex, n, totalSets);
  if (!faltan) return true;
  const ps = pasosDeLog(log);
  for (let i = 0; i < faltan; i++) if (!pasoHecho(ps[i])) return false;
  return true;
}
