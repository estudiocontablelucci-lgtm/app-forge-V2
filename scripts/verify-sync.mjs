/**
 * Verifica el sync (lib/sync/*) contra una base descartable.
 *
 *   node scripts/verify-sync.mjs
 *
 * El caso que justifica este script: el SEED trae ids FIJOS (`seed-dup-c2`,
 * ejercicios `a1`..`a9`) identicos en toda instalacion. Dos usuarios que
 * sincronizan tienen que quedar aislados igual.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(root, "db/verify-sync.db");
for (const suf of ["", "-journal", "-wal", "-shm"]) { try { rmSync(dbPath + suf); } catch {} }

process.env.DATABASE_URL = `file:${dbPath}`;
delete process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url: process.env.DATABASE_URL });
await db.execute("PRAGMA foreign_keys = ON");
for (const f of readdirSync(resolve(root, "db")).filter((f) => /^v\d+_.*\.sql$/.test(f)).sort()) {
  const stmts = readFileSync(resolve(root, "db", f), "utf8")
    .split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
  await db.batch(stmts, "write");
}

const users = await import("../lib/repo/users.js");
const { pushForUser, pullForUser } = await import("../lib/sync/service.js");
const { mergeHistory, mergePrograms, logsFromHistory, sesionesPendientes } = await import("../lib/sync/client.js");

const fallas = [];
const check = async (label, fn) => {
  try {
    const r = await fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

/* El SEED tal cual lo tiene cualquier instalacion nueva: ids fijos. */
const SEED = () => ({
  id: "seed-dup-c2",
  name: "Mesociclo DUP — Ciclo 2",
  weeks: 4,
  hasDeload: true,
  sessions: [{ id: "A", name: "Volumen & Tempo" }, { id: "B", name: "Intensidad" }],
  exercises: [
    { id: "a1", session: "A", order: 1, name: "Sentadilla pendular", group: "Cuadriceps", sets: 3, refKg: null, repsMin: 8, repsMax: 10, tempo: "3-1-1-0", rest: 150, rir: "2-3", superset: null, unit: "reps", description: "" },
    { id: "a4", session: "A", order: 2, name: "Sillon de cuadriceps", group: "Cuadriceps", sets: 3, refKg: 60, repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 90, rir: "2-3", superset: "a9", unit: "reps", description: "" },
    { id: "a9", session: "A", order: 3, name: "Camilla isquios", group: "Isquios", sets: 3, refKg: 50, repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 90, rir: "2-3", superset: "a4", unit: "reps", description: "" },
  ],
});

const entrada = ({ kg, date }) => ({
  id: "h1", programId: "seed-dup-c2", week: 1, session: "A", sessionName: "Volumen & Tempo",
  date, duration: 62, health: { sleep: 4, stress: 2, energy: 4 },
  exercises: [
    { id: "a4", name: "Sillon de cuadriceps", group: "Cuadriceps", sets: [
      { setN: 1, kg, reps: 10, rir: 2 },
      { setN: 2, kg, reps: 9, rir: 1 },
    ] },
  ],
});

let ana, beto;

await check("dos usuarios con el MISMO seed no se pisan", async () => {
  ana = await users.findOrCreate({ email: "ana@example.com", displayName: "Ana" });
  beto = await users.findOrCreate({ email: "beto@example.com", displayName: "Beto" });

  await pushForUser(ana.id, { program: SEED(), entry: entrada({ kg: 60, date: 1_800_000_000_000 }) });
  await pushForUser(beto.id, { program: SEED(), entry: entrada({ kg: 95, date: 1_800_000_100_000 }) });

  const a = await pullForUser(ana.id);
  const b = await pullForUser(beto.id);

  if (a.programs.length !== 1) return `Ana ve ${a.programs.length} programas`;
  if (b.programs.length !== 1) return `Beto ve ${b.programs.length} programas`;
  if (a.history.length !== 1) return `Ana ve ${a.history.length} sesiones`;
  if (b.history.length !== 1) return `Beto ve ${b.history.length} sesiones`;

  const kgAna = a.history[0].exercises[0].sets[0].kg;
  const kgBeto = b.history[0].exercises[0].sets[0].kg;
  if (kgAna !== 60) return `Ana deberia ver 60kg y ve ${kgAna}`;
  if (kgBeto !== 95) return `Beto deberia ver 95kg y ve ${kgBeto}`;
  return true;
});

await check("el pull devuelve los ids locales, no los del servidor", async () => {
  const a = await pullForUser(ana.id);
  const p = a.programs[0];
  if (p.id !== "seed-dup-c2") return `id de programa: ${p.id}`;
  const ids = p.exercises.map((e) => e.id).sort();
  if (ids.join(",") !== "a1,a4,a9") return `ids de ejercicios: ${ids.join(",")}`;
  if (a.history[0].programId !== "seed-dup-c2") return `programId del historial: ${a.history[0].programId}`;
  if (a.history[0].exercises[0].id !== "a4") return `id de ejercicio en historial: ${a.history[0].exercises[0].id}`;
  return true;
});

await check("la superserie mutua sobrevive al round-trip completo", async () => {
  const a = await pullForUser(ana.id);
  const ex = Object.fromEntries(a.programs[0].exercises.map((e) => [e.id, e.superset]));
  if (ex.a4 !== "a9" || ex.a9 !== "a4") return `vinculos: a4->${ex.a4}, a9->${ex.a9}`;
  if (ex.a1 !== null) return `a1 no deberia tener superserie y tiene ${ex.a1}`;
  return true;
});

await check("reenviar la misma sesion actualiza en vez de duplicar", async () => {
  await pushForUser(ana.id, { program: SEED(), entry: entrada({ kg: 65, date: 1_800_000_200_000 }) });
  const a = await pullForUser(ana.id);
  if (a.history.length !== 1) return `${a.history.length} sesiones, esperaba 1`;
  if (a.history[0].exercises[0].sets[0].kg !== 65) return "no actualizo los kilos";
  if (a.programs.length !== 1) return `${a.programs.length} programas, esperaba 1`;
  return true;
});

await check("el health check y la duracion viajan enteros", async () => {
  const a = await pullForUser(ana.id);
  const h = a.history[0];
  if (h.duration !== 62) return `duracion ${h.duration}`;
  if (h.health?.sleep !== 4 || h.health?.stress !== 2 || h.health?.energy !== 4) {
    return `health ${JSON.stringify(h.health)}`;
  }
  if (h.sessionName !== "Volumen & Tempo") return `sessionName ${h.sessionName}`;
  return true;
});

/* ---------- merge del lado del cliente ---------- */

await check("mergeHistory no pierde lo local ni duplica lo remoto", () => {
  const local = [{ programId: "p1", week: 1, session: "A", date: 100 },
                 { programId: "p1", week: 2, session: "B", date: 200 }];
  const remoto = [{ programId: "p1", week: 1, session: "A", date: 50 },
                  { programId: "p1", week: 3, session: "C", date: 300 }];
  const out = mergeHistory(local, remoto);
  if (out.length !== 3) return `${out.length} entradas, esperaba 3`;
  const s1 = out.find((h) => h.week === 1);
  if (s1.date !== 100) return "el remoto viejo piso al local mas nuevo";
  if (out[0].week !== 3) return "no quedo ordenado por fecha descendente";
  return true;
});

await check("mergeHistory deja ganar al remoto cuando es mas nuevo", () => {
  const out = mergeHistory(
    [{ programId: "p1", week: 1, session: "A", date: 100 }],
    [{ programId: "p1", week: 1, session: "A", date: 999 }],
  );
  if (out.length !== 1) return `${out.length} entradas`;
  if (out[0].date !== 999) return "gano el local siendo mas viejo";
  return true;
});

await check("logsFromHistory reconstruye las series que alimentan el semaforo", async () => {
  // Sin esto un dispositivo nuevo baja el historial y ve Progreso en cero: la
  // pantalla no lee `history`, lee `logs`.
  const { history } = await pullForUser(ana.id);
  const logs = logsFromHistory(history);
  const claves = Object.keys(logs);
  if (!claves.length) return "no reconstruyo ninguna serie";

  const k = "1|a4|1";
  if (!logs[k]) return `falta la clave ${k} — claves: ${claves.slice(0, 3).join(", ")}`;
  if (logs[k].kg !== "65") return `kg deberia ser el string "65" y es ${JSON.stringify(logs[k].kg)}`;
  if (logs[k].reps !== "10") return `reps deberia ser "10" y es ${JSON.stringify(logs[k].reps)}`;
  if (logs[k].done !== true) return "la serie no quedo marcada como hecha";

  // Los valores tienen que ser string: es lo que produce el input y lo que
  // espera el resto del componente.
  const todosString = Object.values(logs).every((l) =>
    typeof l.kg === "string" && typeof l.reps === "string" && typeof l.rir === "string");
  if (!todosString) return "hay valores que no son string";
  return true;
});

await check("sesionesPendientes detecta lo que quedo sin subir", () => {
  // El caso real: entrenaste sin senal, el push fallo y la sesion vive solo en
  // el telefono. El boton "Sincronizar ahora" tiene que encontrarla.
  const local = [
    { programId: "p1", week: 1, session: "A", date: 100 },
    { programId: "p1", week: 3, session: "B", date: 300 },   // no subio
  ];
  const remoto = [{ programId: "p1", week: 1, session: "A", date: 100 }];

  const pend = sesionesPendientes(local, remoto);
  if (pend.length !== 1) return `${pend.length} pendientes, esperaba 1`;
  if (pend[0].week !== 3) return `detecto la semana ${pend[0].week} en vez de la 3`;

  if (sesionesPendientes(local, local).length !== 0) return "marco pendientes cuando esta todo arriba";
  if (sesionesPendientes([], remoto).length !== 0) return "invento pendientes con historial local vacio";

  // Misma semana y sesion en OTRO programa no es la misma sesion.
  const otroPrograma = sesionesPendientes([{ programId: "p2", week: 1, session: "A", date: 1 }], remoto);
  if (otroPrograma.length !== 1) return "confundio dos programas distintos";
  return true;
});

await check("mergePrograms agrega los que faltan sin pisar los locales", () => {
  const local = [{ id: "p1", name: "local" }];
  const remoto = [{ id: "p1", name: "remoto" }, { id: "p2", name: "otro" }];
  const out = mergePrograms(local, remoto);
  if (out.length !== 2) return `${out.length} programas`;
  if (out.find((p) => p.id === "p1").name !== "local") return "piso el programa local";
  return true;
});

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length} verificacion(es):`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK  sync: aislamiento entre usuarios, round-trip de ids y merge del cliente");
