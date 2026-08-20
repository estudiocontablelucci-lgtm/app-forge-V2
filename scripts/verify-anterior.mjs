/**
 * La vez pasada: contra las dos formas de mentir.
 *
 * Lo que se verifica no es que encuentre la semana anterior. Es que encuentre
 * la ultima semana CON DATOS y que sea UNA SOLA para todo el ejercicio — las
 * dos cosas que la version que ya existia en `ForgeApp.jsx` hacia mal.
 *
 * Por eso abajo esta `viejo()`, que reproduce esa version. Cada caso que
 * importa se corre contra las dos: si el nuevo diera lo mismo que el viejo, el
 * check no estaria probando nada.
 */
import assert from "node:assert/strict";
import { semanasAtras, anteriorDe, e1rmDe, hecha, MAX_SERIES } from "../lib/anterior.js";
import { keyOf, brzycki } from "../lib/formulas.js";

let ok = 0;
const check = (nombre, fn) => {
  try { fn(); ok++; console.log(`  ok  ${nombre}`); }
  catch (e) { console.error(`  FALLA  ${nombre}\n        ${e.message}`); process.exitCode = 1; }
};

/**
 * La version anterior, tal cual estaba: la semana LITERAL de antes, y el deload
 * comparando contra un 4 escrito a mano.
 *
 *     const pw = week === "DL" ? 4 : week - 1;
 */
function viejo(logs, exId, week, nSets = 4) {
  const pw = week === "DL" ? 4 : week - 1;
  if (!pw || pw < 1) return null;
  const series = {};
  let hay = false;
  for (let n = 1; n <= nSets; n++) {
    const l = logs[keyOf(pw, exId, n)];
    if (!l?.done) continue;
    series[n] = l; hay = true;
  }
  return hay ? { week: pw, series } : null;
}

/** Un log de una serie hecha. */
const S = (kg, reps, rir) => ({ kg: String(kg), reps: String(reps), rir: String(rir), done: true });

const W4 = [1, 2, 3, 4, "DL"];
const W6 = [1, 2, 3, 4, 5, 6, "DL"];

console.log("\nLa vez pasada — la ultima semana CON DATOS, y una sola\n");

/* ---------- el orden de busqueda ---------- */

check("mira hacia atras, de la mas reciente a la mas vieja", () => {
  assert.deepEqual(semanasAtras(3, W4), [2, 1]);
  assert.deepEqual(semanasAtras(4, W4), [3, 2, 1]);
});

check("la primera semana no tiene con que comparar", () => {
  assert.deepEqual(semanasAtras(1, W4), []);
});

check("el deload se compara contra la ultima semana NORMAL", () => {
  assert.deepEqual(semanasAtras("DL", W4), [4, 3, 2, 1]);
  assert.deepEqual(semanasAtras("DL", W6), [6, 5, 4, 3, 2, 1]);
});

check("el deload nunca es FUENTE de comparacion", () => {
  // Es -40% a proposito: comparar contra el diria que todo el mundo mejoro.
  assert.equal(semanasAtras(3, W4).includes("DL"), false);
  assert.equal(semanasAtras("DL", W4).includes("DL"), false);
  const soloDL = { [keyOf("DL", "ex1", 1)]: S(84, 10, 2) };
  assert.equal(anteriorDe(soloDL, "ex1", 2, W4), null);
});

/* ---------- lo que el viejo hacia mal ---------- */

check("BUG 1: salta la semana en que no se entreno ese ejercicio", () => {
  // Entrando el ejercicio en la Sem 1, ausente en la 2, entrenando la 3.
  const logs = { [keyOf(1, "ex1", 1)]: S(140, 8, 2) };

  assert.equal(viejo(logs, "ex1", 3), null);          // miraba la 2 y se rendia
  const a = anteriorDe(logs, "ex1", 3, W4);
  assert.equal(a.week, 1);
  assert.equal(a.series[1].kg, "140");
});

check("BUG 2: el deload de un programa de 6 semanas no compara contra la 4", () => {
  const logs = { [keyOf(6, "ex1", 1)]: S(150, 6, 1) };

  assert.equal(viejo(logs, "ex1", "DL"), null);       // el `4` escrito a mano
  assert.equal(anteriorDe(logs, "ex1", "DL", W6).week, 6);
});

check("con la semana literal a mano, los dos coinciden", () => {
  // El caso facil tiene que dar igual: si el nuevo cambiara aca, seria otro bug.
  const logs = { [keyOf(2, "ex1", 1)]: S(140, 8, 2) };
  assert.equal(viejo(logs, "ex1", 3).week, 2);
  assert.equal(anteriorDe(logs, "ex1", 3, W4).week, 2);
});

/* ---------- una sola semana para todo el ejercicio ---------- */

check("NO mezcla semanas: la mas reciente manda, aunque tenga menos series", () => {
  const logs = {
    [keyOf(1, "ex1", 1)]: S(130, 10, 2), [keyOf(1, "ex1", 2)]: S(130, 9, 2),
    [keyOf(1, "ex1", 3)]: S(130, 8, 1), [keyOf(1, "ex1", 4)]: S(130, 7, 0),
    [keyOf(2, "ex1", 1)]: S(140, 8, 2),
  };
  const a = anteriorDe(logs, "ex1", 3, W4);
  assert.equal(a.week, 2);
  assert.equal(Object.keys(a.series).length, 1);
  // La S2 de hoy no tiene comparacion, y eso es la verdad. Traerla de la Sem 1
  // pondria dos dias distintos en la misma pantalla sin decirlo.
  assert.equal(a.series[2], undefined);
});

check("recupera series que el programa ya no tiene", () => {
  // El programa tenia 5 series y hoy tiene 3: las dos que sobran se entrenaron.
  const logs = {};
  for (let n = 1; n <= 5; n++) logs[keyOf(2, "ex1", n)] = S(100, 10, 2);
  const a = anteriorDe(logs, "ex1", 3, W4);
  assert.equal(Object.keys(a.series).length, 5);
  assert.ok(MAX_SERIES >= 5);
});

/* ---------- que cuenta como serie hecha ---------- */

check("sin REPS no hay serie, aunque diga done y tenga kilos", () => {
  assert.equal(hecha({ kg: "140", reps: "", done: true }), false);
  assert.equal(hecha({ kg: "140", reps: "0", done: true }), false);
  assert.equal(hecha({ kg: "140", reps: "8" }), true);   // sin `done`: se hizo igual
  assert.equal(hecha(undefined), false);
  assert.equal(anteriorDe({ [keyOf(2, "ex1", 1)]: { kg: "140", done: true } }, "ex1", 3, W4), null);
});

check("sin nada que mostrar devuelve null, no un objeto vacio", () => {
  assert.equal(anteriorDe({}, "ex1", 3, W4), null);
  assert.equal(anteriorDe({}, null, 3, W4), null);
  assert.equal(anteriorDe({}, "ex1", 3, []), null);
});

/* ---------- el e1RM de esa semana ---------- */

check("toma la mejor serie de la semana anterior", () => {
  const logs = {
    [keyOf(2, "ex1", 1)]: S(140, 8, 2),
    [keyOf(2, "ex1", 2)]: S(140, 10, 1),   // esta da mas
    [keyOf(2, "ex1", 3)]: S(120, 6, 3),
  };
  const a = anteriorDe(logs, "ex1", 3, W4);
  assert.equal(e1rmDe(a, brzycki), Math.round(brzycki(140, 10)));
});

check("una serie sin kilos no rompe el e1RM, se saltea", () => {
  const logs = {
    [keyOf(2, "ex1", 1)]: S(140, 8, 2),
    [keyOf(2, "ex1", 2)]: { kg: "", reps: "12", rir: "1", done: true },  // dominadas sin lastre
  };
  assert.equal(e1rmDe(anteriorDe(logs, "ex1", 3, W4), brzycki), Math.round(brzycki(140, 8)));
});

check("sin nada, el e1RM es null y no cero", () => {
  assert.equal(e1rmDe(null, brzycki), null);
  assert.equal(e1rmDe({ series: {} }, brzycki), null);
  // La formula entra por parametro: este modulo no elige cual se usa.
  assert.equal(e1rmDe({ series: { 1: { kg: "100", reps: "10" } } }, null), null);
});

console.log(`\n${ok} checks OK\n`);
