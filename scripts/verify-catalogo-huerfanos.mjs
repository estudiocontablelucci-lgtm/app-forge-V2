/**
 * Referencias al catalogo que no existen, y el push que fallaba para siempre.
 *
 *     node scripts/verify-catalogo-huerfanos.mjs
 *
 * `program_exercises.exercise_id` es una FK a `exercises`. Un solo ejercicio
 * apuntando a una entrada que no esta hace fallar el INSERT del PROGRAMA
 * ENTERO con `FOREIGN KEY constraint failed` — y como el push se reintenta en
 * cada sincronizacion, falla siempre igual.
 *
 * Paso en produccion el 2026-08-09: 16 de 36 ejercicios apuntaban a entradas
 * inexistentes, el programa no subio nunca, y la app decia "Sincronizado · 4
 * programas" sin mencionar el que faltaba. Se descubrio leyendo los logs del
 * servidor; en un telefono no hay logs.
 */
import assert from "node:assert/strict";

const { sinReferenciasHuerfanas, absorberDeProgramas } = await import("../lib/catalog.js");

let ok = 0, fallos = 0;
function check(nombre, fn) {
  try { fn(); console.log(`  ok  ${nombre}`); ok++; }
  catch (e) { console.log(`  FALLA  ${nombre}\n         ${e.message}`); fallos++; }
}
function titulo(t) { console.log(`\n${t}\n`); }

const CAT = [
  { id: "base-press-plano", name: "Press plano", group: "Pecho", unit: "reps", base: true },
  { id: "ex-curl-martillo-9k2x", name: "Curl martillo", group: "Biceps", unit: "reps", base: false },
];

const prog = (exercises) => [{ id: "p1", name: "P", exercises }];

titulo("Una referencia que existe no se toca");

check("la deja igual y no cuenta nada", () => {
  const p = prog([{ id: "e1", name: "Press plano", exerciseId: "base-press-plano" }]);
  const r = sinReferenciasHuerfanas(p, CAT);
  assert.equal(r.programs[0].exercises[0].exerciseId, "base-press-plano");
  assert.equal(r.sueltas, 0);
  assert.equal(r.repuntadas, 0);
  assert.equal(r.programs[0], p[0], "reescribio un programa que no hacia falta tocar");
});

check("un ejercicio sin referencia tampoco", () => {
  const p = prog([{ id: "e1", name: "Lo que sea", exerciseId: null }]);
  const r = sinReferenciasHuerfanas(p, CAT);
  assert.equal(r.programs[0].exercises[0].exerciseId, null);
  assert.equal(r.sueltas, 0);
});

titulo("El id esta mal pero el ejercicio existe: se repunta");

check("apunta a la entrada que ya tiene ese nombre", () => {
  // El caso que importa: el ejercicio ESTA en el catalogo, con otro id. Soltar
  // la referencia perderia el vinculo con su historial sin necesidad.
  const p = prog([{ id: "e1", name: "Curl martillo", exerciseId: "ex-curl-martillo-VIEJO" }]);
  const r = sinReferenciasHuerfanas(p, CAT);
  assert.equal(r.programs[0].exercises[0].exerciseId, "ex-curl-martillo-9k2x");
  assert.equal(r.repuntadas, 1);
  assert.equal(r.sueltas, 0);
});

check("compara por nombre normalizado, no letra a letra", () => {
  const p = prog([{ id: "e1", name: "  CURL MARTILLO ", exerciseId: "no-existe" }]);
  const r = sinReferenciasHuerfanas(p, CAT);
  assert.equal(r.programs[0].exercises[0].exerciseId, "ex-curl-martillo-9k2x");
});

titulo("No hay a quien apuntar: se suelta, no se bloquea el push");

check("la referencia rota se va a null", () => {
  const p = prog([{ id: "e1", name: "Press inclinado (máquina/barra)", exerciseId: "ex-press-inclinado-maquina-barra" }]);
  const r = sinReferenciasHuerfanas(p, CAT);
  assert.equal(r.programs[0].exercises[0].exerciseId, null);
  assert.equal(r.sueltas, 1);
});

check("el resto del ejercicio sobrevive intacto", () => {
  const ex = { id: "e1", name: "X", group: "Pecho", sets: 3, refKg: 60, exerciseId: "fantasma", technique: { tipo: "dropset", pasos: 2 } };
  const r = sinReferenciasHuerfanas(prog([ex]), CAT);
  const v = r.programs[0].exercises[0];
  assert.equal(v.exerciseId, null);
  assert.deepEqual({ ...v, exerciseId: "fantasma" }, ex, "se perdio algo mas que la referencia");
});

titulo("El caso real: 16 de 36 huerfanos");

check("ninguna referencia sobreviviente apunta afuera del catalogo", () => {
  const ids = new Set(CAT.map((c) => c.id));
  const ejercicios = Array.from({ length: 36 }, (_, i) => ({
    id: `e${i}`,
    name: i % 2 ? `Inventado ${i}` : "Press plano",
    exerciseId: i % 2 ? `ex-inventado-${i}` : "base-press-plano",
  }));
  const r = sinReferenciasHuerfanas(prog(ejercicios), CAT);
  const malas = r.programs[0].exercises.filter((e) => e.exerciseId && !ids.has(e.exerciseId));
  assert.equal(malas.length, 0, `quedaron ${malas.length} referencias colgando`);
  assert.equal(r.sueltas, 18);
});

titulo("Primero absorber, despues limpiar");

check("absorber CREA las entradas y entonces no hay nada que soltar", () => {
  // El orden importa: `absorberDeProgramas` da de alta lo que falta, y recien
  // lo que ni asi se pudo resolver se suelta. Al reves se perderian referencias
  // que se podian salvar.
  const p = prog([{ id: "e1", name: "Ejercicio nuevo", group: "Pecho", unit: "reps", exerciseId: "ex-ejercicio-nuevo" }]);
  const catConNuevo = absorberDeProgramas(CAT, p);
  assert.equal(catConNuevo.length, CAT.length + 1);
  const r = sinReferenciasHuerfanas(p, catConNuevo);
  assert.equal(r.sueltas, 0);
  assert.equal(r.programs[0].exercises[0].exerciseId, "ex-ejercicio-nuevo");
});

check("lo que absorber NO puede resolver, se suelta", () => {
  // `absorberDeProgramas` se niega a duplicar un nombre que ya existe con otro
  // id, asi que ahi la referencia sigue rota y hay que repuntarla o soltarla.
  const p = prog([{ id: "e1", name: "Curl martillo", exerciseId: "id-que-no-existe" }]);
  const cat2 = absorberDeProgramas(CAT, p);
  assert.equal(cat2.length, CAT.length, "duplico un nombre que ya estaba");
  const r = sinReferenciasHuerfanas(p, cat2);
  assert.equal(r.programs[0].exercises[0].exerciseId, "ex-curl-martillo-9k2x");
});

console.log(`\n${ok} checks OK${fallos ? `  ·  ${fallos} FALLAN` : ""}`);
process.exit(fallos ? 1 : 0);
