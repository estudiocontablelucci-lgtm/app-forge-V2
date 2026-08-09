/**
 * El aviso de fin de descanso — que suene, y que suene UNA vez.
 *
 *     node scripts/verify-aviso.mjs
 *
 * `lib/aviso.js` no tenia una sola verificacion. Es el modulo del que depende
 * lo unico que la app hace cuando nadie la esta mirando, y el unico canal que
 * viene prendido por defecto (la notificacion arranca apagada). Que no sonara
 * en el gimnasio no lo detecto nada.
 *
 * El grafo de audio se reemplaza por un doble que registra cada oscilador
 * creado. Lo que se mira es cuantos pulsos audibles salieron y cuando: el tono
 * de sosten es de 30 Hz y los pulsos del beep de 880/1175, asi que se
 * distinguen por frecuencia sin tener que escuchar nada.
 */
import assert from "node:assert/strict";

/* ============================ el doble del grafo ============================ */

const sonados = [];   // { freq, t }  — t es "ya" cuando se arranco sin hora

class FakeParam {
  constructor(v) { this.value = v; }
  setValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
}
class FakeGain {
  constructor() { this.gain = new FakeParam(0); }
  connect(x) { return x; }
  disconnect() {}
}
class FakeOsc {
  constructor() { this.type = "sine"; this.frequency = new FakeParam(0); }
  connect(x) { return x; }
  disconnect() {}
  start(t) { this.hora = t; sonados.push({ freq: this.frequency.value, t: t === undefined ? "ya" : t }); }
  stop() { this.parado = true; }
}

/** Un solo contexto para todo el archivo: `aviso.js` lo cachea a nivel modulo. */
const ctx = {
  state: "suspended",
  currentTime: 0,
  destination: {},
  resumeFalla: false,
  createOscillator: () => new FakeOsc(),
  createGain: () => new FakeGain(),
  resume() {
    if (this.resumeFalla) return Promise.reject(new Error("bloqueado"));
    this.state = "running";
    return Promise.resolve();
  },
};

globalThis.window = { AudioContext: function () { return ctx; } };
globalThis.document = { hidden: false };

const { despertarAudio, agendarBeep, cancelarBeep, beepPendiente, beepArmado, audioVivo, sonarAhora } =
  await import("../lib/aviso.js");

/* ================================ helpers ================================ */

const PULSO = (f) => f === 880 || f === 1175;
const pulsos = () => sonados.filter((s) => PULSO(s.freq));
const sosten = () => sonados.filter((s) => s.freq === 30);

let ok = 0, fallos = 0;
function check(nombre, fn) {
  try { fn(); console.log(`  ok  ${nombre}`); ok++; }
  catch (e) { console.log(`  FALLA  ${nombre}\n         ${e.message}`); fallos++; }
}
function titulo(t) { console.log(`\n${t}\n`); }

/** Deja el modulo y el registro como recien arrancados. */
function reset({ state = "running", resumeFalla = false, currentTime = 0 } = {}) {
  cancelarBeep();
  sonados.length = 0;
  ctx.state = state;
  ctx.resumeFalla = resumeFalla;
  ctx.currentTime = currentTime;
}

/* ================================ los casos ================================ */

titulo("El camino feliz: se agenda y suena solo");

reset({ state: "suspended" });
const listo = await despertarAudio();
check("despertarAudio resume el contexto y avisa que quedo listo", () => {
  assert.equal(listo, true);
  assert.equal(ctx.state, "running");
});

check("agendarBeep deja los 3 pulsos en el futuro del grafo", () => {
  ctx.currentTime = 10;
  assert.equal(agendarBeep(120), true);
  assert.equal(pulsos().length, 3);
  for (const p of pulsos()) assert.ok(p.t >= 130, `pulso en ${p.t}, esperaba >= 130`);
});

check("y prende el tono de sosten que evita que la pagina se congele", () => {
  assert.equal(sosten().length, 1);
});

check("beepPendiente es cierto mientras el reloj del grafo no llego", () => {
  assert.equal(beepPendiente(), true);
  ctx.currentTime = 131;
  assert.equal(beepPendiente(), false);
});

check("si el agendado ya sono, sonarAhora NO lo repite", () => {
  const antes = pulsos().length;
  sonarAhora({ sonido: true, vibracion: false });
  assert.equal(pulsos().length, antes, "un doble aviso dos decimas despues es peor que uno");
});

titulo("La pagina se congelo: el agendado no llego a salir");

reset();
ctx.currentTime = 10;
agendarBeep(120);
check("sonarAhora lo toca en el momento, porque el grafo quedo atrasado", () => {
  const antes = pulsos().length;          // los 3 agendados, que no van a sonar
  ctx.currentTime = 40;                   // el reloj del grafo se durmio
  assert.equal(beepPendiente(), true);
  sonarAhora({ sonido: true, vibracion: false });
  const nuevos = pulsos().slice(antes);
  assert.equal(nuevos.length, 3, "esperaba 3 pulsos tocados ya");
  // Los tres van espaciados 0,22 s, asi que el ultimo cae en ~40,46.
  for (const p of nuevos) assert.ok(p.t <= 40.5, `pulso en ${p.t}, esperaba ~ahora (40)`);
});

titulo("El audio nunca llego a armarse — el caso del gimnasio");

/*
 * Este es el que fallaba. Si `agendarBeep` no pudo agendar (el contexto no
 * arranco, el navegador bloqueo el audio, otra app se quedo con el foco), no
 * hay nada agendado: `beepPendiente()` da false. Y false significaba las DOS
 * cosas a la vez —"ya sono" y "nunca existio"— asi que el vencimiento se
 * tomaba por avisado y no sonaba nada, ni en ese momento ni despues.
 *
 * Con la notificacion apagada por defecto y la vibracion como unico resto, el
 * descanso terminaba en silencio y sin ninguna senal de que el aviso no estaba
 * armado.
 */

reset({ state: "suspended", resumeFalla: true });
const noListo = await despertarAudio();
check("despertarAudio avisa que NO quedo listo", () => {
  assert.equal(noListo, false);
});

check("agendarBeep se niega y no deja nada agendado", () => {
  assert.equal(agendarBeep(120), false);
  assert.equal(pulsos().length, 0);
  assert.equal(beepPendiente(), false);
});

check("al vencer, sonarAhora IGUAL toca el aviso", () => {
  ctx.state = "running";      // el bloqueo se levanto, o nunca fue el problema
  ctx.resumeFalla = false;
  sonarAhora({ sonido: true, vibracion: false });
  assert.equal(pulsos().length, 3, "el descanso vencio en silencio: no sono nada");
});

titulo("Preguntar si el audio esta vivo NO puede despertarlo");

/*
 * `audioVivo()` existe para que ForgeApp pueda decidir si vale la pena intentar
 * agendar al montar. Tiene que ser una PREGUNTA y no un intento: sin gesto del
 * usuario el navegador deja la promesa de `resume()` pendiente en vez de
 * rechazarla, y un intento colgado que revive despues agenda por duplicado.
 * Usar `despertarAudio()` para averiguarlo fue exactamente ese error.
 */

reset({ state: "suspended" });
check("con el contexto suspendido dice que no, y no lo toca", () => {
  const antes = ctx.state;
  assert.equal(audioVivo(), false);
  assert.equal(ctx.state, antes, "preguntar cambio el estado del contexto");
  assert.equal(sonados.length, 0, "preguntar creo osciladores");
});

check("una vez despierto dice que si", async () => {
  ctx.state = "running";
  assert.equal(audioVivo(), true);
});

check("beepArmado distingue 'nunca se agendo' de 'ya sono'", () => {
  reset();
  assert.equal(beepArmado(), false, "sin agendar nada dijo que estaba armado");
  ctx.currentTime = 10;
  agendarBeep(60);
  assert.equal(beepArmado(), true);
  ctx.currentTime = 100;                      // ya sono
  assert.equal(beepPendiente(), false);
  assert.equal(beepArmado(), true, "seguir armado es lo que evita el doble aviso");
  cancelarBeep();
  assert.equal(beepArmado(), false);
});

titulo("Nunca hubo descanso agendado y el contexto esta limpio");

reset();
check("sonarAhora sin nada previo suena igual", () => {
  sonarAhora({ sonido: true, vibracion: false });
  assert.equal(pulsos().length, 3);
});

check("con el sonido apagado no suena nada", () => {
  reset();
  sonarAhora({ sonido: false, vibracion: false });
  assert.equal(pulsos().length, 0);
});

/* ================================ cierre ================================ */

console.log(`\n${ok} checks OK${fallos ? `  ·  ${fallos} FALLAN` : ""}`);
process.exit(fallos ? 1 : 0);
