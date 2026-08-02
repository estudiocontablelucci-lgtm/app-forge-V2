/**
 * Verifica el calculo del deload configurable.
 *
 *   node scripts/verify-deload.mjs
 *
 * La regla anterior (`sets - 1`) recortaba entre 25% y 50% segun cuantas series
 * tuviera el ejercicio, y dejaba en 1 serie a los de 2 — entre ellos el
 * protocolo ASIM-IZQ, que corrige asimetria justamente con series de mas.
 */
import { setsFor, repsFor, DELOAD_DEFAULT } from "../lib/formulas.js";

const fallas = [];
const check = (label, fn) => {
  try {
    const r = fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

const ex = (sets, repsMin = 10, repsMax = 12) => ({ sets, repsMin, repsMax });

check("fuera del deload no cambia nada", () => {
  for (const w of [1, 2, 3, 4]) {
    if (setsFor(ex(3), w) !== 3) return `semana ${w} devolvio ${setsFor(ex(3), w)}`;
  }
  const r = repsFor(ex(3), 2);
  if (r.min !== 10 || r.max !== 12) return `reps alteradas fuera de deload: ${JSON.stringify(r)}`;
  return true;
});

check("el default aplica -40% por series", () => {
  if (setsFor(ex(5), "DL") !== 3) return `5 series -> ${setsFor(ex(5), "DL")}, esperaba 3`;
  if (setsFor(ex(4), "DL") !== 2) return `4 series -> ${setsFor(ex(4), "DL")}, esperaba 2`;
  if (setsFor(ex(3), "DL") !== 2) return `3 series -> ${setsFor(ex(3), "DL")}, esperaba 2`;
  return true;
});

check("los ejercicios de 2 series ya no bajan a 1", () => {
  // El caso que motivo el cambio: 6 ejercicios del programa tienen 2 series.
  if (setsFor(ex(2), "DL") !== 2) return `2 series -> ${setsFor(ex(2), "DL")}, esperaba 2`;
  return true;
});

check("el piso no inventa series que el ejercicio no tiene", () => {
  // Un ejercicio de 1 serie no puede "subir" a 2 por el minimo.
  if (setsFor(ex(1), "DL") !== 1) return `1 serie -> ${setsFor(ex(1), "DL")}, esperaba 1`;
  return true;
});

check("el porcentaje es configurable", () => {
  const suave = { pct: 20, method: "sets", minSets: 2 };
  if (setsFor(ex(5), "DL", suave) !== 4) return `5 al 20% -> ${setsFor(ex(5), "DL", suave)}, esperaba 4`;
  const fuerte = { pct: 60, method: "sets", minSets: 1 };
  if (setsFor(ex(5), "DL", fuerte) !== 2) return `5 al 60% -> ${setsFor(ex(5), "DL", fuerte)}, esperaba 2`;
  return true;
});

check("el minimo de series es configurable", () => {
  const conPiso3 = { pct: 40, method: "sets", minSets: 3 };
  if (setsFor(ex(4), "DL", conPiso3) !== 3) return `4 con piso 3 -> ${setsFor(ex(4), "DL", conPiso3)}`;
  return true;
});

check("el metodo por reps deja las series intactas", () => {
  const porReps = { pct: 40, method: "reps", minSets: 2 };
  if (setsFor(ex(3), "DL", porReps) !== 3) return `series ${setsFor(ex(3), "DL", porReps)}, esperaba 3`;
  const r = repsFor(ex(3, 10, 12), "DL", porReps);
  if (r.min !== 6 || r.max !== 7) return `reps ${JSON.stringify(r)}, esperaba 6-7`;
  return true;
});

check("el metodo por series no toca las reps", () => {
  const r = repsFor(ex(3, 10, 12), "DL", DELOAD_DEFAULT);
  if (r.min !== 10 || r.max !== 12) return `reps ${JSON.stringify(r)}, esperaba 10-12`;
  return true;
});

check("las reps nunca bajan de 1", () => {
  const brutal = { pct: 90, method: "reps", minSets: 1 };
  const r = repsFor(ex(3, 2, 3), "DL", brutal);
  if (r.min < 1 || r.max < 1) return `reps ${JSON.stringify(r)}`;
  return true;
});

check("una config parcial completa lo que falta con el default", () => {
  // La UI puede guardar solo el pct; el resto tiene que caer al default.
  if (setsFor(ex(2), "DL", { pct: 50 }) !== 2) return `piso perdido: ${setsFor(ex(2), "DL", { pct: 50 })}`;
  return true;
});

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length} verificacion(es):`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK  deload configurable: porcentaje, metodo y piso de series");
