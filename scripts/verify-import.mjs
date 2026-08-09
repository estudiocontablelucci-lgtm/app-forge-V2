/**
 * Verifica que el .xlsx generado vuelva a entrar por el wizard sin perder datos.
 *
 *   node scripts/verify-import.mjs
 *
 * Reusa los helpers de import REALES de ForgeApp.jsx (no una copia) evaluando el
 * bloque "Excel import helpers", que es codigo puro sin dependencias de React.
 * Compara campo por campo contra el SEED y sale con codigo 1 si algo no coincide.
 */
import * as XLSX from "xlsx";
import { cargarHelpers, mapear, filasDe } from "./import-helpers.mjs";

const helpers = cargarHelpers();

// Se importa el modulo en vez de extraerlo del fuente: cuando el SEED salio
// de ForgeApp.jsx, la extraccion por texto no fallo — agarro el primer array
// que encontro y comparo contra el equivocado.
const { SEED } = await import("../lib/seed-ciclo2.js");

// El .xlsx se arma ACA, en memoria, y no se lee de `data/`. Esa carpeta esta
// gitignoreada: la suite dependia de haber corrido `gen:programa` antes, asi
// que en un clon nuevo fallaba por un archivo que falta y no por un bug.
const byId = new Map(SEED.map((e) => [e.id, e]));
const HEADER = ["Sesion", "Orden", "Ejercicio", "Grupo muscular", "Series", "Reps min", "Reps max", "Ref KG", "Tempo", "Descanso", "RIR", "Superserie", "Unidad", "Descripcion"];
const aoa = [...SEED]
  .sort((a, b) => (a.session < b.session ? -1 : a.session > b.session ? 1 : a.order - b.order))
  .map((e) => [e.session, e.order, e.name, e.group, e.sets, e.repsMin, e.repsMax, e.refKg ?? "", e.tempo, e.rest, e.rir, e.superset ? (byId.get(e.superset)?.name ?? "") : "", e.unit, e.description]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...aoa]), "Programa");
const rows = filasDe(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

const mapping = mapear(helpers, rows);
console.log(`mapeo automatico: ${Object.keys(mapping).length}/${HEADER.length} columnas`);
const sinMapear = Object.keys(rows[0]).filter((h) => !Object.values(mapping).includes(h));
if (sinMapear.length) console.log(`  columnas sin mapear: ${sinMapear.join(", ")}`);

const { exercises, sessions } = helpers.parseExcelData(rows, mapping);
const seedById = new Map(SEED.map((e) => [e.id, e]));
const impByKey = new Map(exercises.map((e) => [`${e.session}|${e.name}`, e]));

const CAMPOS = ["session", "order", "name", "group", "sets", "refKg", "repsMin", "repsMax", "tempo", "rest", "rir", "unit", "description"];
const fallas = [];

for (const orig of SEED) {
  const imp = impByKey.get(`${orig.session}|${orig.name}`);
  if (!imp) { fallas.push(`${orig.name}: no aparece en el import`); continue; }
  for (const c of CAMPOS) {
    if (String(orig[c] ?? "") !== String(imp[c] ?? "")) {
      fallas.push(`${orig.name} · ${c}: esperado ${JSON.stringify(orig[c])}, importado ${JSON.stringify(imp[c])}`);
    }
  }
  // La superserie viaja por nombre y se re-resuelve a un id nuevo: comparar el partner.
  const origPartner = orig.superset ? seedById.get(orig.superset)?.name : null;
  const impPartner = imp.superset ? exercises.find((e) => e.id === imp.superset)?.name : null;
  if ((origPartner ?? null) !== (impPartner ?? null)) {
    fallas.push(`${orig.name} · superserie: esperado ${JSON.stringify(origPartner)}, importado ${JSON.stringify(impPartner)}`);
  }
}

console.log(`sesiones: ${sessions.map((s) => s.id).join(", ")} | ejercicios: ${exercises.length}/${SEED.length}`);
if (fallas.length) {
  console.error(`\nFALLA — ${fallas.length} diferencia(s):`);
  for (const f of fallas) console.error(`  ${f}`);
  process.exit(1);
}
console.log("OK  round-trip sin perdida en los 13 campos + superseries");
