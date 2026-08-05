/**
 * Aplica al Ciclo 2 lo que `programa_tecnicas_ciclo2.md` marca como
 * "Aplicable ya (Sem 3-4)".
 *
 *   node scripts/aplicar-ciclo2-sem34.mjs --dry
 *   node scripts/aplicar-ciclo2-sem34.mjs
 *
 * NO aplica los 8 swaps de la seccion 3: el documento los pone en Ciclo 3, y
 * cinco de ellos son sustituciones de maquina que cortarian series de e1RM a
 * mitad de ciclo. La unica excepcion es la prensa de la sesion C, que el
 * documento da por aplicada y Agustin confirmo el 2026-08-04.
 *
 * Regla de escritura del propio documento: lo que dice `REVISAR` no se
 * inventa — se deja como esta.
 *
 * Idempotente: solo escribe lo que difiere.
 */
import { canonicalizarEmail } from "../lib/email-id.js";

const dry = process.argv.includes("--dry");
const email = process.argv.find((a) => a.includes("@")) || "agustin.lucci@gmail.com";

const { getDb, now, uid } = await import("../lib/db.js");
// La misma normalizacion que usa la app: hay un unico por
// (owner_user_id, name_norm) y dos criterios distintos se pisarian.
const { normalizar } = await import("../lib/catalog.js");
const db = getDb();

/**
 * El programa final de la seccion 5, en el orden que manda.
 * `null` = el documento no lo cambia (o dice REVISAR) y se deja como esta.
 */
const PLAN = {
  A: [
    { n: "Sentadilla pendular", orden: 1, ref: 70, reps: [10, 12] },
    { n: "Press Plano (barra)", orden: 2, ref: 67.5, reps: [8, 10] },
    { n: "Remo T (soporte pect.)", orden: 3, ref: null, reps: [12, 12] },
    { n: "Sillón de cuádriceps", orden: 4, ref: null, reps: [12, 15] },
    { n: "Camilla isquios", orden: 5, ref: null, reps: [12, 15] },
    { n: "Vuelos laterales (DB)", orden: 6, ref: null, reps: [12, 15] },
    { n: "Ext. tríceps overhead (DB)", orden: 7, ref: null, reps: [10, 12] },
    { n: "Curl sentado (DB)", orden: 8, ref: null, reps: [10, 12] },
    // ISO-EST: pausa de 2-3" en la posicion alargada, que en gemelos es abajo
    // — el segundo digito del tempo.
    { n: "Gemelo sentado", orden: 9, ref: 50, reps: [12, 15], tempo: "2-3-1-0" },
    { n: "Shrugs DB", orden: 10, ref: null, reps: [8, 12] },
    { n: "Curl sentado brazo I (DB)", orden: 11, ref: null, reps: [10, 12] },
    { n: "Ext. overhead brazo I (DB)", orden: 12, ref: 25, reps: [10, 12] },
    { n: "Extensión lumbar", orden: 13, ref: 35, reps: [12, 12] },
  ],
  B: [
    { n: "Prensa 45°", orden: 1, ref: null, reps: [8, 10] },
    { n: "Dominadas", orden: 2, ref: null, reps: [6, 8] },
    { n: "Press inclinado (DB)", orden: 3, ref: 27.5, reps: [8, 10] },
    { n: "Camilla isquios", orden: 4, ref: null, reps: [10, 12] },
    { n: "Vuelos posteriores", orden: 5, ref: null, reps: [12, 15] },
    { n: "Face pulls", orden: 6, ref: 55, reps: [15, 20] },
    { n: "Caminata granjero", orden: 7, ref: "35-40kg/m", reps: [25, 30] },
    { n: "Gemelo prensa 45", orden: 8, ref: 190, reps: [8, 10] },
    { n: "Ext. tríceps (polea)", orden: 9, ref: null, reps: [10, 12] },
    { n: "Curl bíceps (polea)", orden: 10, ref: null, reps: [10, 12] },
  ],
  C: [
    // C1 se resuelve aparte: es una sustitucion, no una edicion.
    { n: "Peso Muerto Trap Bar", orden: 2, ref: 120, reps: [5, 6] },
    { n: "Press Plano (pesado)", orden: 3, ref: null, reps: [4, 6] },
    { n: "Remo T (prono)", orden: 4, ref: null, reps: [10, 12] },
    { n: "Hip Thrust", orden: 5, ref: null, reps: [8, 10] },
    { n: "Press máquina hombros", orden: 6, ref: null, reps: [6, 8] },
    { n: "Apertura máquina", orden: 7, ref: null, reps: [12, 15] },
    { n: "Press francés", orden: 8, ref: 35, reps: [8, 10] },
    { n: "Curl DB", orden: 9, ref: 17.5, reps: [10, 12] },
    { n: "Extensión lumbar", orden: 10, ref: null, reps: [12, 15] },
  ],
};

/** Notas que el documento agrega como indicacion de ejecucion. */
const NOTAS = {
  "Gemelo prensa 45": "Rodilla bloqueada (2026-08: sesga al gastrocnemio).",
  "Gemelo sentado": "ISO-EST: pausa de 2-3\" abajo, en la posición alargada, en cada rep.",
  "Shrugs DB": "8-12 reps con pausa de 1-2\" arriba. Con straps.",
};

/** La sustitucion de la sesion C: otra maquina, no otro nombre. */
const SUSTITUCION = {
  sesion: "C",
  viejo: "Prensa horizontal",
  nuevo: "Prensa 45° pesada",
  orden: 1,
  sets: 4,
  ref: 145,
  reps: [6, 8],
};

const u = await db.execute({
  sql: "SELECT id FROM users WHERE email_canon = ? OR email = ?",
  args: [canonicalizarEmail(email), email],
});
if (!u.rows[0]) { console.error(`no hay usuario para ${email}`); process.exit(1); }
const userId = u.rows[0].id;

const p = await db.execute({
  sql: `SELECT id, name FROM programs
        WHERE owner_user_id = ? AND name LIKE '%Ciclo 2%' AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1`,
  args: [userId],
});
if (!p.rows[0]) { console.error("no encontre el Ciclo 2"); process.exit(1); }
const programa = p.rows[0];

const ex = await db.execute({
  sql: `SELECT id, session_code, order_idx, name, sets, ref_kg, reps_min, reps_max, tempo, description
        FROM program_exercises WHERE program_id = ? AND deleted_at IS NULL`,
  args: [programa.id],
});
const buscar = (sesion, nombre) =>
  ex.rows.filter((e) => e.session_code === sesion && e.name === nombre);

console.log(`programa: ${programa.name}  (${programa.id})\n`);

const stmts = [];
const ts = now();
let cambios = 0;
/** Orden final de cada fila. Las que el documento no menciona conservan el suyo. */
const ordenFinal = new Map(ex.rows.map((e) => [e.id, e.order_idx]));

for (const [sesion, filas] of Object.entries(PLAN)) {
  for (const f of filas) {
    const encontrados = buscar(sesion, f.n);
    if (!encontrados.length) { console.log(`  NO ESTA   ${sesion} · ${f.n}`); continue; }
    if (encontrados.length > 1) { console.log(`  AMBIGUO   ${sesion} · ${f.n} (${encontrados.length} filas)`); continue; }
    const e = encontrados[0];

    const campos = [];
    if (e.order_idx !== f.orden) {
      ordenFinal.set(e.id, f.orden);
      campos.push([null, null, `orden ${e.order_idx}→${f.orden}`]);
    }
    if (f.ref !== null && String(e.ref_kg) !== String(f.ref)) {
      campos.push(["ref_kg", String(f.ref), `ref ${e.ref_kg ?? "—"}→${f.ref}`]);
    }
    if (f.reps && (e.reps_min !== f.reps[0] || e.reps_max !== f.reps[1])) {
      campos.push(["reps_min", f.reps[0], `reps ${e.reps_min}-${e.reps_max}→${f.reps[0]}-${f.reps[1]}`]);
      campos.push(["reps_max", f.reps[1], null]);
    }
    if (f.tempo && e.tempo !== f.tempo) campos.push(["tempo", f.tempo, `tempo ${e.tempo}→${f.tempo}`]);

    const nota = NOTAS[f.n];
    if (nota && !(e.description || "").includes(nota)) {
      const texto = e.description ? `${e.description}\n${nota}` : nota;
      campos.push(["description", texto, "+ nota"]);
    }

    if (!campos.length) continue;
    const detalle = campos.map((c) => c[2]).filter(Boolean).join(" · ");
    console.log(`  ${sesion} · ${String(f.n).padEnd(28)} ${detalle}`);
    cambios++;
    for (const [col, val] of campos) {
      if (!col) continue;   // el orden se resuelve aparte, en dos pasadas
      stmts.push({
        sql: `UPDATE program_exercises SET ${col} = ?, updated_at = ? WHERE id = ?`,
        args: [val, ts, e.id],
      });
    }
  }
}

/* ---------- la sustitucion ---------- */

const viejos = buscar(SUSTITUCION.sesion, SUSTITUCION.viejo);
const yaEsta = buscar(SUSTITUCION.sesion, SUSTITUCION.nuevo);
if (yaEsta.length) {
  console.log(`\n  =  ${SUSTITUCION.nuevo} ya existe`);
} else if (!viejos.length) {
  console.log(`\n  NO ESTA  ${SUSTITUCION.viejo} en la sesion ${SUSTITUCION.sesion}`);
} else {
  const viejo = viejos[0];
  const series = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM set_logs WHERE program_exercise_id = ? AND deleted_at IS NULL",
    args: [viejo.id],
  });
  const n = Number(series.rows[0].n);
  console.log(`\n  SUSTITUCION  ${SUSTITUCION.viejo} → ${SUSTITUCION.nuevo}`);
  console.log(`    el viejo tenia ${n} series registradas y SALE del programa;`);
  console.log("    sus series y su e1RM quedan con el, sin encadenarse con el nuevo.");
  cambios++;

  // Es una maquina distinta: id nuevo. Encadenar el e1RM de las dos seria
  // mezclar dos cosas — la misma regla que el programa escribio para la
  // pendular contra el belt squat.
  //
  // DELETE duro, igual que `saveProgram`: con soft delete la fila sigue
  // ocupando su `order_idx` y choca contra la nueva por el UNIQUE. El historial
  // sobrevive igual — `set_logs` guarda `exercise_name` y su FK es ON DELETE
  // SET NULL (verificado en verify-schema).
  const nuevoId = `${userId}~${uid()}`;
  ordenFinal.delete(viejo.id);

  // El ejercicio tiene que existir en el CATALOGO: todas las filas del programa
  // apuntan a `exercises.id`, y una con NULL pierde la identidad del ejercicio
  // entre dispositivos — justo lo que arreglo la v04. Va como ejercicio del
  // USUARIO y no como `base-*`: los base son universales y agregar uno ahi se lo
  // instala a todo el mundo.
  const catalogoId = `${userId}~ex-prensa-45-pesada`;
  stmts.push({
    sql: `INSERT INTO exercises
            (id, coach_id, owner_user_id, name, name_norm, muscle_group, unit, is_base, created_at, updated_at)
          VALUES (?, NULL, ?, ?, ?, ?, 'reps', 0, ?, ?)
          ON CONFLICT (id) DO UPDATE SET
            name = excluded.name, name_norm = excluded.name_norm,
            updated_at = excluded.updated_at, deleted_at = NULL`,
    args: [catalogoId, userId, SUSTITUCION.nuevo, normalizar(SUSTITUCION.nuevo), "Cuádriceps", ts, ts],
  });
  stmts.push({ sql: "DELETE FROM program_exercises WHERE id = ?", args: [viejo.id] });
  stmts.push({
    sql: `INSERT INTO program_exercises
            (id, program_id, session_code, order_idx, name, muscle_group, sets, ref_kg,
             reps_min, reps_max, rep_unit, tempo, rest_sec, rir_target, superset_with,
             technique, description, exercise_id, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reps', ?, ?, ?, NULL, NULL, ?, ?, ?)`,
    args: [
      nuevoId, programa.id, SUSTITUCION.sesion, SUSTITUCION.orden, SUSTITUCION.nuevo,
      "Cuádriceps", SUSTITUCION.sets, String(SUSTITUCION.ref),
      SUSTITUCION.reps[0], SUSTITUCION.reps[1], viejo.tempo, 180, "1-2",
      `Sustituye a ${SUSTITUCION.viejo}. Su e1RM arranca como serie nueva: es otra máquina, no más fuerza.`,
      catalogoId, ts,
    ],
  });
}

if (!cambios) { console.log("\nnada que cambiar"); process.exit(0); }
if (dry) { console.log(`\n--dry: no se escribio nada (${cambios} cambio/s)`); process.exit(0); }

// El orden, en dos pasadas. `UNIQUE (program_id, session_code, order_idx)` se
// verifica sentencia por sentencia, asi que mover una fila al lugar que otra
// todavia ocupa falla — aunque al final del lote no quede ninguna colision.
const previas = [];
for (const e of ex.rows) {
  if (!ordenFinal.has(e.id)) continue;
  previas.push({
    sql: "UPDATE program_exercises SET order_idx = ? WHERE id = ?",
    args: [e.order_idx + 100, e.id],
  });
}
const finales = [];
for (const [id, orden] of ordenFinal) {
  finales.push({
    sql: "UPDATE program_exercises SET order_idx = ?, updated_at = ? WHERE id = ?",
    args: [orden, ts, id],
  });
}
stmts.unshift(...previas);
stmts.push(...finales);

// El programa queda marcado como editado AHORA: si no, el telefono con una
// copia mas nueva gana el merge y deshace todo esto al sincronizar.
stmts.push({ sql: "UPDATE programs SET updated_at = ? WHERE id = ?", args: [ts, programa.id] });
await db.batch(stmts, "write");
console.log(`\nescrito: ${cambios} cambio(s), ${stmts.length} sentencia(s)`);
