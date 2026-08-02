/**
 * Verifica que el .xlsx generado vuelva a entrar por el wizard sin perder datos.
 *
 *   node scripts/verify-import.mjs
 *
 * Reusa los helpers de import REALES de ForgeApp.jsx (no una copia) evaluando el
 * bloque "Excel import helpers", que es codigo puro sin dependencias de React.
 * Compara campo por campo contra el SEED y sale con codigo 1 si algo no coincide.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(resolve(root, "components/ForgeApp.jsx"), "utf8");

// Bloque de helpers de import tal cual esta en el fuente.
const from = src.indexOf("/* ---------- Excel import helpers ---------- */");
const to = src.indexOf("function ImportWizard");
if (from === -1 || to === -1) throw new Error("No se encontro el bloque de helpers de import en ForgeApp.jsx");
const helpers = new Function("XLSX", "uid", `${src.slice(from, to)}; return { matchColumn, parseExcelData };`)(
  XLSX,
  () => Math.random().toString(36).slice(2, 9),
);

// Se importa el modulo en vez de extraerlo del fuente: cuando el SEED salio
// de ForgeApp.jsx, la extraccion por texto no fallo — agarro el primer array
// que encontro y comparo contra el equivocado.
const { SEED } = await import("../lib/seed-ciclo2.js");
// XLSX.readFile no esta disponible en el build ESM (fs no viene bindeado): leer el buffer.
const wb = XLSX.read(readFileSync(resolve(root, "data/forge-ciclo2-gabriel.xlsx")), { type: "buffer" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

// Mismo auto-mapeo que hace el wizard al soltar el archivo.
const mapping = {};
for (const h of Object.keys(rows[0])) {
  const field = helpers.matchColumn(h);
  if (field && !(field in mapping)) mapping[field] = h;
}
console.log(`mapeo automatico: ${Object.keys(mapping).length}/14 columnas`);
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
