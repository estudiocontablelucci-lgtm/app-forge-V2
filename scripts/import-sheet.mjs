/**
 * Importa el historial de la Sheet "Rutina gym" a Turso, una sola vez.
 *
 *   node scripts/import-sheet.mjs                 # muestra el plan, NO escribe
 *   node scripts/import-sheet.mjs --confirm       # escribe
 *   node scripts/import-sheet.mjs --archivo=... --email=...
 *
 * Es un script de migracion, no una feature: el formato es el de la Sheet
 * personal y no le sirve a otro usuario. Por eso no hay wizard en la UI.
 *
 * Reusa `pushForUser` — el mismo camino que usa la app al terminar una sesion —
 * asi que lo que entra por aca queda igual que lo que entra entrenando.
 * Es idempotente: `saveSession` reemplaza por (ciclo, semana, sesion), asi que
 * correrlo dos veces no duplica nada.
 *
 * Lo que la Sheet NO tiene y por lo tanto no se importa: duracion de sesion
 * (no se registra) y health check (la hoja Bienestar esta vacia).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- configuracion ---------- */

const arg = (nombre, def) => {
  const a = process.argv.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3) : def;
};
const CONFIRMAR = process.argv.includes("--confirm");
const ARCHIVO = arg("archivo", `${root}/data/Rutina gym - Claude (TEST CELULAR).xlsx`);
const EMAIL = arg("email", "agustin.lucci@gmail.com");

// Fechas reales de cada sesion, dadas por el atleta. La Sheet no las guarda:
// `Asistencia` solo tiene dias por mes. Si alguna esta mal, se corrige aca.
const FECHAS = {
  "1|A": "2026-07-12",
  "1|B": "2026-07-16",
  "1|C": "2026-07-21",
  "2|A": "2026-07-23",
  "2|B": "2026-07-28",
  "2|C": "2026-07-31",
};

// Se entrena por la tarde: 18:00 hora local (UTC-3) evita que la sesion caiga
// en el dia anterior al convertir a UTC.
const HORA_UTC = "T21:00:00.000Z";

const HOJAS = { "Sem 1": "1", "Sem 2": "2", "Sem 3": "3", "Sem 4": "4", "Deload": "DL" };

/* ---------- parseo ---------- */

const esNum = (v) => v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Busca el ejercicio del programa que corresponde a un nombre de la Sheet.
 *
 * La Sheet escribe el mismo ejercicio con mas detalle: "Dominadas BW" contra
 * "Dominadas", "Face pulls (polea, cuerda)" contra "Face pulls". Se intenta
 * exacto, despues sin el parentesis, y por ultimo por prefijo — pero SOLO si
 * hay una unica coincidencia. Con dos candidatos se prefiere no importar a
 * colgarle las series al ejercicio equivocado.
 */
function buscarEjercicio(indice, nombreSheet) {
  const n = norm(nombreSheet);
  if (indice.has(n)) return { ex: indice.get(n), via: "exacto" };

  const sinParentesis = norm(String(nombreSheet).replace(/\([^)]*\)/g, ""));
  if (indice.has(sinParentesis)) return { ex: indice.get(sinParentesis), via: "sin parentesis" };

  const candidatos = [...indice.entries()].filter(([clave]) =>
    n.startsWith(clave + " ") || sinParentesis.startsWith(clave + " ") || clave.startsWith(n + " "));
  if (candidatos.length === 1) return { ex: candidatos[0][1], via: `prefijo "${candidatos[0][0]}"` };
  if (candidatos.length > 1) return { ambiguo: candidatos.map(([c]) => c) };
  return {};
}

/**
 * Recorre una hoja semanal y devuelve las sesiones con sus series.
 *
 * La hoja es una lista plana donde el significado de cada fila depende de las
 * anteriores: "SESION X" abre una sesion, un texto suelto nombra un ejercicio,
 * "Serie" abre su tabla y las filas numericas son las series. Se lee como una
 * maquina de estados porque no hay columnas que lo digan.
 */
function parsearHoja(ws) {
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  const sesiones = new Map();
  let sesion = null, ejercicio = null, enTabla = false;

  for (const f of filas) {
    const a = String(f[0] ?? "").trim();
    if (!a) continue;

    const mSesion = a.match(/^SESI[ÓO]N\s+([A-C])/i);
    if (mSesion) {
      sesion = mSesion[1].toUpperCase();
      if (!sesiones.has(sesion)) sesiones.set(sesion, { nombre: a.split(/—|-/).slice(1).join("—").trim(), ejercicios: new Map() });
      ejercicio = null; enTabla = false;
      continue;
    }

    if (/^serie$/i.test(a)) { enTabla = true; continue; }

    if (enTabla && esNum(a)) {
      // Serie | KG | REPS | RIR — sin reps la serie no se hizo.
      if (!sesion || !ejercicio || !esNum(f[2])) continue;
      const ex = sesiones.get(sesion).ejercicios;
      if (!ex.has(ejercicio)) ex.set(ejercicio, []);
      ex.get(ejercicio).push({
        setN: Number(a),
        kg: esNum(f[1]) ? Number(f[1]) : null,
        reps: Number(f[2]),
        rir: esNum(f[3]) ? Number(f[3]) : null,
      });
      continue;
    }

    // Encabezados de bloque que no son ejercicios.
    if (/^(ref:|⚡|t:|d:|sem\b|ciclo\b)/i.test(a)) { enTabla = false; continue; }

    ejercicio = a;
    enTabla = false;
  }
  return sesiones;
}

/* ---------- main ---------- */

const env = Object.fromEntries(
  readFileSync(`${root}/.env.local`, "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN;

const { getDb } = await import("../lib/db.js");
const { pushForUser, pullForUser } = await import("../lib/sync/service.js");

const usuario = (await getDb().execute({
  sql: "SELECT id, email FROM users WHERE email = ? AND deleted_at IS NULL",
  args: [EMAIL],
})).rows[0];
if (!usuario) { console.error(`No existe el usuario ${EMAIL}. Entra una vez a la app antes de importar.`); process.exit(1); }

const { programs } = await pullForUser(usuario.id);
if (!programs.length) { console.error("El usuario no tiene programas. Sincroniza uno antes de importar."); process.exit(1); }
const programa = programs[0];

console.log(`archivo:  ${ARCHIVO.split("/").pop()}`);
console.log(`usuario:  ${usuario.email}`);
console.log(`programa: ${programa.name} · ${programa.exercises.length} ejercicios\n`);

// Indice de nombre normalizado -> ejercicio del programa, por sesion.
const porSesion = {};
for (const e of programa.exercises) {
  (porSesion[e.session] ||= new Map()).set(norm(e.name), e);
}

const wb = XLSX.read(readFileSync(ARCHIVO), { type: "buffer" });
const aSubir = [];
const sinMapear = new Set();
const aproximados = [];

for (const [hoja, semana] of Object.entries(HOJAS)) {
  if (!wb.Sheets[hoja]) continue;
  for (const [codigo, datos] of parsearHoja(wb.Sheets[hoja])) {
    const ejercicios = [];
    let series = 0;

    for (const [nombre, sets] of datos.ejercicios) {
      if (!sets.length) continue;
      const indice = porSesion[codigo] || new Map();
      const { ex, via, ambiguo } = buscarEjercicio(indice, nombre);
      if (!ex) {
        sinMapear.add(`${hoja} ${codigo}: ${nombre}` + (ambiguo ? `  (ambiguo: ${ambiguo.join(" / ")})` : ""));
        continue;
      }
      if (via !== "exacto") aproximados.push(`${hoja} ${codigo}: "${nombre}" -> "${ex.name}" (${via})`);
      ejercicios.push({ id: ex.id, name: ex.name, group: ex.group, sets });
      series += sets.length;
    }
    if (!series) continue;

    const fecha = FECHAS[`${semana}|${codigo}`];
    if (!fecha) { console.log(`  ! sin fecha para semana ${semana} sesion ${codigo} — se saltea`); continue; }

    aSubir.push({
      week: semana,
      session: codigo,
      sessionName: datos.nombre || null,
      date: new Date(fecha + HORA_UTC).getTime(),
      duration: null,   // la Sheet no lo registra
      health: null,     // la hoja Bienestar esta vacia
      exercises: ejercicios,
      _series: series,
    });
  }
}

aSubir.sort((a, b) => a.date - b.date);

console.log("sesiones a importar:");
for (const s of aSubir) {
  console.log(`  sem ${s.week} · ${s.session}  ${new Date(s.date).toISOString().slice(0, 10)}  ` +
              `${String(s._series).padStart(3)} series · ${s.exercises.length} ejercicios`);
}
console.log(`\ntotal: ${aSubir.length} sesiones · ${aSubir.reduce((n, s) => n + s._series, 0)} series`);

if (aproximados.length) {
  console.log(`\nnombres resueltos por aproximacion (${aproximados.length}) — revisar que sean correctos:`);
  for (const x of aproximados) console.log(`  · ${x}`);
}

if (sinMapear.size) {
  console.log(`\nejercicios de la Sheet sin equivalente en el programa (${sinMapear.size}) — NO se importan:`);
  for (const x of sinMapear) console.log(`  · ${x}`);
}

if (!CONFIRMAR) {
  console.log("\nEsto fue una simulacion. Para escribir en Turso:  node scripts/import-sheet.mjs --confirm");
  process.exit(0);
}

console.log("\nsubiendo...");
for (const s of aSubir) {
  const { _series, ...entry } = s;
  await pushForUser(usuario.id, { program: programa, entry });
  console.log(`  + sem ${s.week} · ${s.session} (${_series} series)`);
}
console.log("\nlisto. Verifica con: node scripts/import-sheet.mjs   (deberia mostrar el mismo plan)");
