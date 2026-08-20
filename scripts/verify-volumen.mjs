/**
 * Series semanales por grupo: el plan, lo hecho, y la diferencia.
 *
 * Los tres casos que justifican que esto exista como modulo aparte y no como
 * una cuenta adentro de una pantalla:
 *
 *   - Contar por `done` cuenta series que NADIE hizo. `done` se marca con kg O
 *     reps, y el campo de kilos se prellena con la ref al enfocarlo: tocar el
 *     input alcanzaria. Se cuenta por REPS.
 *   - En el deload el plan son las series REDUCIDAS. Contra las de una semana
 *     normal, la descarga se leeria como incumplimiento.
 *   - Un ejercicio retirado del programa conserva sus series: descartarlas
 *     bajaria el volumen de una semana ya entrenada.
 */
import assert from "node:assert/strict";
import {
  planificado, real, porGrupo, totales, grupoDe, ultimaSemanaConDatos, SIN_GRUPO,
} from "../lib/volumen.js";
import { keyOf } from "../lib/formulas.js";

let ok = 0;
const check = (nombre, fn) => {
  try { fn(); ok++; console.log(`  ok  ${nombre}`); }
  catch (e) { console.error(`  FALLA  ${nombre}\n        ${e.message}`); process.exitCode = 1; }
};

const ex = (id, group, sets, extra = {}) => ({ id, group, sets, session: "A", ...extra });
const S = (kg, reps) => ({ kg: String(kg), reps: String(reps), done: true });

// El default del repo: -40% por series con piso de 2.
const DELOAD = { pct: 40, method: "series", minSets: 2 };

const PROGRAMA = [
  ex("e1", "Cuádriceps", 4), ex("e2", "Cuádriceps", 3),
  ex("e3", "Pecho", 4), ex("e4", "Espalda", 5),
  ex("e5", "Gemelos", 2),
];
const buscar = (id) => PROGRAMA.find((e) => e.id === id) || null;

console.log("\nSeries semanales por grupo — el plan, lo hecho y lo que falta\n");

/* ---------- el plan ---------- */

check("suma las series del programa entero por grupo", () => {
  assert.deepEqual(planificado(PROGRAMA, 2, DELOAD),
    { "Cuádriceps": 7, "Pecho": 4, "Espalda": 5, "Gemelos": 2 });
});

check("la unidad es la SEMANA: cuenta todas las sesiones", () => {
  const dosDias = [ex("a", "Pecho", 4, { session: "A" }), ex("b", "Pecho", 3, { session: "B" })];
  assert.equal(planificado(dosDias, 1, DELOAD)["Pecho"], 7);
});

check("en el deload el plan son las series REDUCIDAS", () => {
  // 4 -> 2, 3 -> 2 (el piso), 5 -> 3, 2 -> 2 (el piso no puede subirlo)
  const dl = planificado(PROGRAMA, "DL", DELOAD);
  assert.deepEqual(dl, { "Cuádriceps": 4, "Pecho": 2, "Espalda": 3, "Gemelos": 2 });
  // Contra las de una semana normal, la descarga se leeria como incumplimiento.
  assert.ok(dl["Espalda"] < planificado(PROGRAMA, 2, DELOAD)["Espalda"]);
});

check("un ejercicio sin grupo se agrupa aparte, no se descarta", () => {
  assert.equal(grupoDe({ group: "" }), SIN_GRUPO);
  assert.equal(grupoDe({}), SIN_GRUPO);
  assert.equal(planificado([ex("x", null, 3)], 1, DELOAD)[SIN_GRUPO], 3);
});

/* ---------- lo hecho ---------- */

check("cuenta las series con REPS, no las marcadas done", () => {
  const logs = {
    [keyOf(1, "e1", 1)]: S(140, 10),
    [keyOf(1, "e1", 2)]: S(140, 9),
    // Se toco el campo de kilos y el prefill escribio la ref: `done` quedo en
    // true sin que se hiciera la serie. No cuenta.
    [keyOf(1, "e1", 3)]: { kg: "140", reps: "", done: true },
    [keyOf(1, "e3", 1)]: S(80, 8),
  };
  assert.deepEqual(real(logs, 1, buscar), { "Cuádriceps": 2, "Pecho": 1 });
});

check("solo la semana que se pide", () => {
  const logs = { [keyOf(1, "e1", 1)]: S(140, 10), [keyOf(2, "e1", 1)]: S(145, 10) };
  assert.deepEqual(real(logs, 1, buscar), { "Cuádriceps": 1 });
  assert.deepEqual(real(logs, 2, buscar), { "Cuádriceps": 1 });
  assert.deepEqual(real(logs, 3, buscar), {});
});

check("un ejercicio RETIRADO conserva sus series", () => {
  // Salio del programa al sustituirlo, pero se entreno igual: descartarlo
  // bajaria el volumen de una semana ya cerrada.
  const logs = { [keyOf(1, "viejo", 1)]: S(100, 10), [keyOf(1, "viejo", 2)]: S(100, 9) };
  const conRetirados = (id) => buscar(id) || (id === "viejo" ? ex("viejo", "Pecho", 3) : null);
  assert.deepEqual(real(logs, 1, conRetirados), { "Pecho": 2 });
  assert.deepEqual(real(logs, 1, buscar), {});   // sin resolverlo, se pierde
});

check("los escalones del dropset no son series aparte", () => {
  // Viven DENTRO de la serie: `pasos` no genera claves propias en `logs`, asi
  // que una serie con dos escalones sigue siendo una.
  const logs = { [keyOf(1, "e5", 1)]: { ...S(50, 15), pasos: [S(40, 10), S(30, 8)] } };
  assert.deepEqual(real(logs, 1, buscar), { "Gemelos": 1 });
});

check("un ejercicio en PASOS cuenta como serie", () => {
  // No da tonelaje —no hay kilos que multiplicar— pero es trabajo igual.
  const conPasos = (id) => (id === "cam" ? ex("cam", "Core", 3, { unit: "pasos" }) : buscar(id));
  assert.deepEqual(real({ [keyOf(1, "cam", 1)]: { reps: "40", done: true } }, 1, conPasos),
    { "Core": 1 });
});

check("una clave rara no rompe el conteo", () => {
  assert.deepEqual(real({ "basura": S(10, 10) }, 1, buscar), {});
  assert.deepEqual(real({}, 1, buscar), {});
  assert.deepEqual(real(null, 1, buscar), {});
});

/* ---------- las dos juntas ---------- */

check("ordena por PLAN, que es donde esta puesto el volumen", () => {
  const filas = porGrupo(PROGRAMA, {}, 2, DELOAD, buscar);
  assert.deepEqual(filas.map((f) => f.grupo),
    ["Cuádriceps", "Espalda", "Pecho", "Gemelos"]);
  // Alfabetico pondria Cuadriceps (7) despues de... nada, pero Gemelos (2)
  // antes de Pecho (4), que es justo lo que no se quiere.
});

check("la diferencia entre plan y real queda a la vista", () => {
  const logs = {};
  for (let n = 1; n <= 4; n++) logs[keyOf(2, "e4", n)] = S(60, 10);   // 4 de 5 en espalda
  const filas = porGrupo(PROGRAMA, logs, 2, DELOAD, buscar);
  const espalda = filas.find((f) => f.grupo === "Espalda");
  assert.deepEqual(espalda, { grupo: "Espalda", plan: 5, real: 4 });
  const cuads = filas.find((f) => f.grupo === "Cuádriceps");
  assert.deepEqual(cuads, { grupo: "Cuádriceps", plan: 7, real: 0 });
});

check("un grupo con series y CERO plan entra igual, y ultimo", () => {
  // Es lo que pasa con un ejercicio retirado: esconderlo haria que el total de
  // la tabla no cierre con el de la semana.
  const conRetirados = (id) => buscar(id) || (id === "viejo" ? ex("viejo", "Trapecio", 0) : null);
  const filas = porGrupo(PROGRAMA, { [keyOf(2, "viejo", 1)]: S(40, 12) }, 2, DELOAD, conRetirados);
  assert.equal(filas[filas.length - 1].grupo, "Trapecio");
  assert.deepEqual(filas[filas.length - 1], { grupo: "Trapecio", plan: 0, real: 1 });
  assert.equal(totales(filas).real, 1);
});

check("los totales suman las dos columnas", () => {
  const logs = { [keyOf(2, "e1", 1)]: S(140, 10), [keyOf(2, "e3", 1)]: S(80, 8) };
  assert.deepEqual(totales(porGrupo(PROGRAMA, logs, 2, DELOAD, buscar)), { plan: 18, real: 2 });
  assert.deepEqual(totales([]), { plan: 0, real: 0 });
});

/* ---------- que semana mostrar ---------- */

check("la ultima semana con series registradas, no la ultima del programa", () => {
  const weeks = [1, 2, 3, 4, "DL"];
  const logs = { [keyOf(1, "e1", 1)]: S(140, 10), [keyOf(2, "e1", 1)]: S(145, 10) };
  assert.equal(ultimaSemanaConDatos(logs, weeks), 2);
});

check("el deload cuenta como semana con datos", () => {
  // A diferencia de una comparacion de progreso: ver que en la descarga se
  // hicieron 6 series de pecho en vez de 10 es exactamente lo que hay que ver.
  const weeks = [1, 2, 3, 4, "DL"];
  const logs = { [keyOf(1, "e1", 1)]: S(140, 10), [keyOf("DL", "e1", 1)]: S(90, 10) };
  assert.equal(ultimaSemanaConDatos(logs, weeks), "DL");
});

check("sin nada registrado no hay semana que mostrar", () => {
  assert.equal(ultimaSemanaConDatos({}, [1, 2, 3]), null);
  // Una serie a medio cargar tampoco alcanza.
  assert.equal(ultimaSemanaConDatos({ [keyOf(1, "e1", 1)]: { kg: "140", done: true } }, [1, 2]), null);
});

console.log(`\n${ok} checks OK\n`);
