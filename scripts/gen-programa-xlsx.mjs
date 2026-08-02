/**
 * Genera un .xlsx del programa SEED con el formato exacto de la plantilla de
 * import de FORGE, para cargar el programa real en un navegador que ya tiene
 * localStorage (donde el SEED nuevo no se aplica: migrateState conserva lo viejo).
 *
 *   node scripts/gen-programa-xlsx.mjs
 *
 * Lee el SEED de lib/seed-ciclo2.js, que es donde vive desde que las cuentas
 * nuevas dejaron de arrancar con el programa de otra persona.
 * Salida: data/ (gitignored — son datos personales del atleta, no van al repo publico).
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { SEED, SESIONES_CICLO2: SESSIONS } = await import("../lib/seed-ciclo2.js");

const byId = new Map(SEED.map((e) => [e.id, e]));
const HEADER = ["Sesion", "Orden", "Ejercicio", "Grupo muscular", "Series", "Reps min", "Reps max", "Ref KG", "Tempo", "Descanso", "RIR", "Superserie", "Unidad", "Descripcion"];

// El wizard resuelve la superserie por NOMBRE dentro de la misma sesion, no por id.
const rows = [...SEED]
  .sort((a, b) => (a.session < b.session ? -1 : a.session > b.session ? 1 : a.order - b.order))
  .map((e) => [
    e.session,
    e.order,
    e.name,
    e.group,
    e.sets,
    e.repsMin,
    e.repsMax,
    e.refKg ?? "",
    e.tempo,
    e.rest,
    e.rir,
    e.superset ? (byId.get(e.superset)?.name ?? "") : "",
    e.unit,
    e.description,
  ]);

const ws = XLSX.utils.aoa_to_sheet([HEADER, ...rows]);
ws["!cols"] = [{ wch: 8 }, { wch: 6 }, { wch: 26 }, { wch: 16 }, { wch: 7 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 26 }, { wch: 8 }, { wch: 60 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Programa");

mkdirSync(resolve(root, "data"), { recursive: true });
const out = resolve(root, "data/forge-ciclo2-gabriel.xlsx");
XLSX.writeFile(wb, out);

const perSession = SESSIONS.map((s) => `${s.id}: ${SEED.filter((e) => e.session === s.id).length}`).join(" · ");
const sinRef = SEED.filter((e) => e.refKg === null).map((e) => e.name);
console.log(`OK  ${out}`);
console.log(`    ${rows.length} ejercicios (${perSession})`);
console.log(`    superseries: ${SEED.filter((e) => e.superset).length / 2} pares`);
console.log(`    sin ref (REVISAR en la 1a sesion): ${sinRef.join(", ")}`);
