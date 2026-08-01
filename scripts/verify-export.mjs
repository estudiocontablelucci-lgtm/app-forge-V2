/**
 * Verifica el export del historial contra un historial sintetico.
 *
 *   node scripts/verify-export.mjs
 *
 * Reusa exportHistory() REAL de ForgeApp.jsx inyectandole sus dependencias,
 * escribe el .xlsx en data/ y lo vuelve a leer para chequear filas y totales.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(resolve(root, "components/ForgeApp.jsx"), "utf8");

const from = src.indexOf("/* ---------- Excel export: historial ---------- */");
const to = src.indexOf("function ImportWizard");
if (from === -1 || to === -1) throw new Error("No se encontro exportHistory en ForgeApp.jsx");

const isNum = (v) => typeof v === "number" && !isNaN(v);
const brzycki = (kg, reps) => (reps > 0 && reps < 37 ? (kg * 36) / (37 - reps) : null);
const round1 = (v) => Math.round(v * 10) / 10;
const SEM_LABELS = { green: "Subir peso", yellow: "Mantener", red: "Revisar", gray: "" };

const exportHistory = new Function(
  "XLSX", "isNum", "brzycki", "round1", "SEM_LABELS",
  `${src.slice(from, to)}; return exportHistory;`,
)(XLSX, isNum, brzycki, round1, SEM_LABELS);

// Historial sintetico: 2 sesiones, una con BW y RIR vacio, otra deload.
const history = [
  {
    id: "h1", programId: "p", week: 1, session: "A", sessionName: "Volumen & Tempo",
    date: new Date(2026, 6, 20, 18, 30).getTime(), duration: 95,
    health: { sleep: 2, stress: 4, energy: 3 },
    exercises: [
      { id: "a2", name: "Press Plano (barra)", group: "Pecho", sem: "green", sets: [
        { setN: 1, kg: 65, reps: 10, rir: 2 }, { setN: 2, kg: 65, reps: 9, rir: 1 },
      ] },
      { id: "b2", name: "Dominadas", group: "Espalda", sem: "yellow", sets: [
        { setN: 1, kg: null, reps: 8, rir: null },
      ] },
      { id: "x9", name: "Sin series", group: "Core", sem: "gray", sets: [] },
    ],
  },
  {
    id: "h2", programId: "p", week: "DL", session: "C", sessionName: "Intensidad & Fuerza",
    date: new Date(2026, 6, 27, 9, 15).getTime(), duration: 60, health: null,
    exercises: [
      { id: "c4", name: "Peso Muerto Trap Bar", group: "Isquios", sem: "red", sets: [
        { setN: 1, kg: 115, reps: 6, rir: 2 },
      ] },
    ],
  },
];

mkdirSync(resolve(root, "data"), { recursive: true });
process.chdir(resolve(root, "data"));
exportHistory(history, "Mesociclo DUP · Ciclo 2");

const name = `forge-historial-mesociclo-dup-ciclo-2-${new Date().toISOString().slice(0, 10)}.xlsx`;
const wb = XLSX.read(readFileSync(name), { type: "buffer" });
const ses = XLSX.utils.sheet_to_json(wb.Sheets["Sesiones"]);
const ser = XLSX.utils.sheet_to_json(wb.Sheets["Series"], { defval: "" });

const fallas = [];
const eq = (label, got, want) => { if (String(got) !== String(want)) fallas.push(`${label}: esperado ${want}, obtuvo ${got}`); };

eq("hojas", wb.SheetNames.join(","), "Sesiones,Series");
eq("filas Sesiones", ses.length, 2);
eq("filas Series", ser.length, 4); // 2 + 1 + 1; el ejercicio sin series no aporta filas
// Sesion 1: tonelaje 65*10 + 65*9 = 1235. Dominadas BW no suma (kg null).
eq("tonelaje s1", ses[0]["Tonelaje (kg)"], 1235);
eq("series s1", ses[0]["Series"], 3);
eq("ejercicios s1 (excluye el vacio)", ses[0]["Ejercicios"], 2);
eq("sueno s1", ses[0]["Sueno"], 2);
eq("orden cronologico", ses[0]["Fecha"] < ses[1]["Fecha"], true);
eq("semana deload cruda", ses[1]["Semana"], "DL");
eq("health nulo queda vacio", ses[1]["Sueno"] ?? "", "");
// Series: BW y RIR vacio
const bw = ser.find((r) => r["Ejercicio"] === "Dominadas");
eq("kg BW", bw["KG"], "BW");
eq("RIR vacio", bw["RIR"], "");
eq("semaforo traducido", bw["Semaforo"], "Mantener");
// e1RM Brzycki 65x10 = 65*36/27 = 86.7
eq("e1RM", ser[0]["e1RM"], 86.7);

console.log(`${name}`);
console.log(`  Sesiones: ${ses.length} filas | Series: ${ser.length} filas`);
if (fallas.length) {
  console.error(`\nFALLA — ${fallas.length}:`);
  for (const f of fallas) console.error(`  ${f}`);
  process.exit(1);
}
console.log("OK  export correcto (tonelaje, e1RM, BW, health nulo, deload, semaforo)");
