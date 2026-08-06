/**
 * El descanso, contra el reloj.
 *
 * Lo que se verifica no es que la cuenta baje: es que NO DEPENDA de que alguien
 * la baje. Cada caso le pasa un `ahora` distinto, que es la forma de simular en
 * un test lo que en el telefono pasa solo — la pagina congelada, la app cerrada,
 * el sistema durmiendo el proceso.
 *
 * El bug que motivo esto pasaba todos los tests anteriores porque no habia
 * ninguno: `remaining` se restaba adentro de un `setInterval` y no habia nada
 * puro que probar. Esa es la mitad del arreglo.
 */
import assert from "node:assert/strict";
import {
  crearDescanso, restante, vencido, avance, restaurarDescanso,
  PREFS_DEFAULT, normalizarPrefs,
} from "../lib/descanso.js";

let ok = 0;
const check = (nombre, fn) => {
  try { fn(); ok++; console.log(`  ok  ${nombre}`); }
  catch (e) { console.error(`  FALLA  ${nombre}\n        ${e.message}`); process.exitCode = 1; }
};

const T0 = 1_700_000_000_000;   // un instante fijo: nada aca puede depender de la hora real

console.log("\nDescanso — el vencimiento manda\n");

check("un descanso de 120s vence 120s despues", () => {
  const d = crearDescanso(120, T0);
  assert.equal(d.total, 120);
  assert.equal(d.fin, T0 + 120_000);
});

check("sin segundos no hay descanso", () => {
  assert.equal(crearDescanso(0, T0), null);
  assert.equal(crearDescanso(null, T0), null);
  assert.equal(crearDescanso("no es un numero", T0), null);
});

check("lo que queda se deriva del reloj, no de cuantas veces se miro", () => {
  const d = crearDescanso(120, T0);
  assert.equal(restante(d, T0), 120);
  assert.equal(restante(d, T0 + 1_000), 119);
  // Nadie miro durante 90 segundos. El numero es el mismo que si se hubiera
  // mirado noventa veces: ESTE es el bug que se arregla.
  assert.equal(restante(d, T0 + 91_000), 29);
});

check("la app dormida 3 minutos vuelve con el descanso vencido, no atrasado", () => {
  const d = crearDescanso(120, T0);
  assert.equal(restante(d, T0 + 180_000), 0);
  assert.equal(vencido(d, T0 + 180_000), true);
  // Con la version vieja, tres minutos sin ticks dejaban `remaining` en 120:
  // la barra volvia marcando el descanso entero por delante.
});

check("vencido es <= 0, no < 0", () => {
  const d = crearDescanso(60, T0);
  assert.equal(vencido(d, T0 + 59_999), false);
  assert.equal(vencido(d, T0 + 60_000), true);
});

check("redondea hacia arriba: 0 significa vencido y no 'casi'", () => {
  const d = crearDescanso(60, T0);
  assert.equal(restante(d, T0 + 59_500), 1);   // medio segundo todavia es 1
  assert.equal(restante(d, T0 + 60_000), 0);
});

check("sin descanso no queda nada", () => {
  assert.equal(restante(null, T0), 0);
  assert.equal(vencido(null, T0), false);
  assert.equal(avance(null, T0), 0);
});

check("la barra va de 0 a 1 y no se pasa", () => {
  const d = crearDescanso(100, T0);
  assert.equal(avance(d, T0), 0);
  assert.equal(avance(d, T0 + 50_000), 0.5);
  assert.equal(avance(d, T0 + 100_000), 1);
  assert.equal(avance(d, T0 + 999_000), 1);   // vencido hace rato: llena, no rota
});

console.log("\nDescanso — sobrevivir a que el sistema mate la app\n");

check("uno todavia corriendo se restaura", () => {
  const d = crearDescanso(120, T0);
  const vuelto = restaurarDescanso(d, T0 + 30_000);
  assert.deepEqual(vuelto, d);
  assert.equal(restante(vuelto, T0 + 30_000), 90);
});

check("uno recien vencido se restaura: todavia dice algo", () => {
  const d = crearDescanso(120, T0);
  assert.notEqual(restaurarDescanso(d, T0 + 130_000), null);
});

check("el de anteayer NO se restaura", () => {
  const d = crearDescanso(120, T0);
  // Abrir la app al otro dia y que cante "A LA BARRA" es peor que no restaurar.
  assert.equal(restaurarDescanso(d, T0 + 48 * 3600 * 1000), null);
});

check("basura guardada no rompe el arranque", () => {
  assert.equal(restaurarDescanso(null, T0), null);
  assert.equal(restaurarDescanso({}, T0), null);
  assert.equal(restaurarDescanso({ fin: "manana", total: 60 }, T0), null);
  assert.equal(restaurarDescanso({ fin: T0 + 1000 }, T0), null);   // sin total no hay barra
});

console.log("\nPreferencias\n");

check("un localStorage sin prefs cae en los defaults", () => {
  assert.deepEqual(normalizarPrefs(null), PREFS_DEFAULT);
  assert.deepEqual(normalizarPrefs(undefined), PREFS_DEFAULT);
  assert.deepEqual(normalizarPrefs("cualquier cosa"), PREFS_DEFAULT);
});

check("la notificacion arranca APAGADA", () => {
  // Pedir permiso de notificaciones sin que nadie lo haya buscado se rechaza de
  // un dedo, y un "denied" no se puede volver a preguntar nunca mas.
  assert.equal(PREFS_DEFAULT.notificacion, false);
  assert.equal(PREFS_DEFAULT.descanso, true);
  assert.equal(PREFS_DEFAULT.ayudas, true);
});

check("una pref guardada gana sobre el default, y solo si es booleana", () => {
  assert.equal(normalizarPrefs({ sonido: false }).sonido, false);
  assert.equal(normalizarPrefs({ sonido: false }).descanso, true);   // el resto intacto
  assert.equal(normalizarPrefs({ sonido: "si" }).sonido, true);      // basura -> default
  assert.equal(normalizarPrefs({ inventada: true }).inventada, undefined);
});

console.log(`\n${ok} checks OK\n`);
