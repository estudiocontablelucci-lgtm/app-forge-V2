/**
 * Volver a importar un programa que ya existe, sin duplicarlo ni cortar el
 * historial.
 *
 *     node scripts/verify-importar.mjs
 *
 * Lo que se prueba no es que los campos se copien: es que **el id sobreviva**.
 * Los logs son `week|exId|setN`, asi que un id nuevo equivale a perder lo
 * registrado de ese ejercicio. Y que un ejercicio SUSTITUIDO reciba id nuevo,
 * que es la otra mitad de la misma regla: encadenar el e1RM de dos maquinas
 * distintas porque ocupan el mismo renglon es peor que empezar de cero.
 */
import assert from "node:assert/strict";

const { fusionarPrograma, candidatoAActualizar } = await import("../lib/importar.js");

let ok = 0, fallos = 0;
function check(nombre, fn) {
  try { fn(); console.log(`  ok  ${nombre}`); ok++; }
  catch (e) { console.log(`  FALLA  ${nombre}\n         ${e.message}`); fallos++; }
}
function titulo(t) { console.log(`\n${t}\n`); }

const ex = (o) => ({ session: "A", sets: 3, unit: "reps", superset: null, technique: null, ...o });

const EXISTENTE = {
  id: "p1", name: "Ciclo 3", weeks: 4, hasDeload: true, createdAt: 1000,
  sessions: [{ id: "A", name: "Vieja" }],
  exercises: [
    ex({ id: "viejo-1", name: "Press plano", refKg: 60, exerciseId: "base-press", refsByWeek: { 2: 65 } }),
    ex({ id: "viejo-2", name: "Remo T", refKg: 40, exerciseId: "base-remo" }),
    ex({ id: "viejo-3", name: "Curl viejo", refKg: 12, exerciseId: "ex-curl-viejo" }),
  ],
};

titulo("Lo que ya estaba conserva su IDENTIDAD");

check("un ejercicio con el mismo nombre conserva su id", () => {
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3", sessions: [{ id: "A", name: "Nueva" }],
    exercises: [ex({ id: "tmp-1", name: "Press plano", refKg: 70 })],
  });
  assert.equal(r.program.exercises[0].id, "viejo-1", "id nuevo: los logs quedan huerfanos");
  assert.equal(r.conservados, 1);
});

check("pero la PRESCRIPCION viene del archivo", () => {
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3", sessions: EXISTENTE.sessions,
    exercises: [ex({ id: "tmp-1", name: "Press plano", refKg: 70, repsMin: 4, repsMax: 6, rest: 180 })],
  });
  const v = r.program.exercises[0];
  assert.equal(v.refKg, 70);
  assert.equal(v.repsMin, 4);
  assert.equal(v.rest, 180);
});

check("las refs POR SEMANA sobreviven: son un hecho, no una prescripcion", () => {
  // Subir la ref a mitad de ciclo no puede cambiar las semanas ya entrenadas.
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3", sessions: EXISTENTE.sessions,
    exercises: [ex({ id: "tmp-1", name: "Press plano", refKg: 75 })],
  });
  assert.deepEqual(r.program.exercises[0].refsByWeek, { 2: 65 });
});

check("y no se inventa refsByWeek donde no habia", () => {
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3", sessions: EXISTENTE.sessions,
    exercises: [ex({ id: "tmp-2", name: "Remo T", refKg: 45 })],
  });
  assert.ok(!("refsByWeek" in r.program.exercises[0]), "aparecio un refsByWeek de la nada");
});

check("conserva el lugar en el catalogo si el archivo no trae uno", () => {
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3", sessions: EXISTENTE.sessions,
    exercises: [ex({ id: "tmp-1", name: "Press plano" })],
  });
  assert.equal(r.program.exercises[0].exerciseId, "base-press");
});

titulo("Un nombre distinto es una SUSTITUCION, no una edicion");

check("recibe id NUEVO, para no encadenar el e1RM de otra maquina", () => {
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3", sessions: EXISTENTE.sessions,
    exercises: [ex({ id: "tmp-9", name: "Press inclinado (máquina)", refKg: 50 })],
  });
  assert.equal(r.program.exercises[0].id, "tmp-9", "reuso un id de otro ejercicio");
  assert.equal(r.conservados, 0);
  assert.equal(r.nuevos, 1);
});

check("el que ya no esta se informa por nombre", () => {
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3", sessions: EXISTENTE.sessions,
    exercises: [ex({ id: "tmp-1", name: "Press plano" })],
  });
  assert.deepEqual(r.quitados.sort(), ["Curl viejo", "Remo T"]);
});

titulo("Mudarse de DIA no es una sustitucion");

check("un ejercicio que cambia de sesion CONSERVA su id", () => {
  // La revision del 09/08/2026 mudo face pulls de B a D, y pullover y apertura
  // de C a D. Es la misma maquina, el mismo patron y la misma longitud: el
  // e1RM tiene que seguir encadenando. Atar la identidad a la sesion habria
  // cortado la cadena de tres ejercicios en silencio.
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3", sessions: [{ id: "D", name: "D" }],
    exercises: [ex({ id: "tmp-1", session: "D", name: "Press plano", refKg: 72 })],
  });
  assert.equal(r.program.exercises[0].id, "viejo-1", "le dio id nuevo: se corta el e1RM");
  assert.equal(r.program.exercises[0].session, "D");
  assert.equal(r.conservados, 1);
  assert.deepEqual(r.mudados, [{ name: "Press plano", de: "A", a: "D" }]);
});

check("y se lleva sus refs por semana a la sesion nueva", () => {
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3", sessions: [{ id: "D", name: "D" }],
    exercises: [ex({ id: "tmp-1", session: "D", name: "Press plano" })],
  });
  assert.deepEqual(r.program.exercises[0].refsByWeek, { 2: 65 });
});

check("con HOMONIMOS en varias sesiones NO se adivina", () => {
  // "Camilla isquios" estuvo en A y en B a la vez. Si el nombre se repite, cual
  // se mudo a cual es una adivinanza, y errarle mezcla el historial de dos dias.
  const conDobles = {
    ...EXISTENTE,
    exercises: [
      ex({ id: "v-a", session: "A", name: "Camilla isquios", refKg: 50 }),
      ex({ id: "v-b", session: "B", name: "Camilla isquios", refKg: 50 }),
    ],
  };
  const r = fusionarPrograma(conDobles, {
    name: "Ciclo 3", sessions: [{ id: "D", name: "D" }],
    exercises: [ex({ id: "tmp-x", session: "D", name: "Camilla isquios" })],
  });
  assert.equal(r.program.exercises[0].id, "tmp-x", "adivino de cual de los dos venia");
  assert.equal(r.mudados.length, 0);
});

check("pero si sigue en su sesion, empareja ahi aunque haya homonimo", () => {
  const conDobles = {
    ...EXISTENTE,
    exercises: [
      ex({ id: "v-a", session: "A", name: "Camilla isquios" }),
      ex({ id: "v-b", session: "B", name: "Camilla isquios" }),
    ],
  };
  const r = fusionarPrograma(conDobles, {
    name: "Ciclo 3", sessions: [{ id: "A", name: "A" }, { id: "B", name: "B" }],
    exercises: [
      ex({ id: "t1", session: "B", name: "Camilla isquios" }),
      ex({ id: "t2", session: "A", name: "Camilla isquios" }),
    ],
  });
  assert.equal(r.program.exercises[0].id, "v-b", "emparejo con el de la otra sesion");
  assert.equal(r.program.exercises[1].id, "v-a");
  assert.equal(r.conservados, 2);
});

check("un viejo no se empareja dos veces", () => {
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3", sessions: [{ id: "A", name: "A" }],
    exercises: [
      ex({ id: "t1", name: "Press plano" }),
      ex({ id: "t2", name: "Press plano" }),
    ],
  });
  const ids = r.program.exercises.map((e) => e.id);
  assert.equal(ids[0], "viejo-1");
  assert.equal(ids[1], "t2", "reuso el mismo id viejo en dos ejercicios");
  assert.equal(new Set(ids).size, 2, "quedaron dos ejercicios con el mismo id");
});

check("empareja por nombre normalizado, no letra a letra", () => {
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3", sessions: EXISTENTE.sessions,
    exercises: [ex({ id: "tmp-1", name: "  PRESS  PLANO " })],
  });
  assert.equal(r.program.exercises[0].id, "viejo-1");
});

titulo("Las superseries se remapean a los ids que quedaron");

check("un par entre uno conservado y uno nuevo sigue apuntandose", () => {
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3", sessions: EXISTENTE.sessions,
    exercises: [
      ex({ id: "tmp-a", name: "Press plano", superset: "tmp-b" }),
      ex({ id: "tmp-b", name: "Ejercicio nuevo", superset: "tmp-a" }),
    ],
  });
  const [a, b] = r.program.exercises;
  assert.equal(a.id, "viejo-1");
  assert.equal(a.superset, b.id, "la superserie quedo apuntando a un id que ya no existe");
  assert.equal(b.superset, a.id);
});

check("un superset que apunta afuera se suelta en vez de mentir", () => {
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3", sessions: EXISTENTE.sessions,
    exercises: [ex({ id: "tmp-a", name: "Press plano", superset: "tmp-que-no-vino" })],
  });
  assert.equal(r.program.exercises[0].superset, null);
});

titulo("El programa sigue siendo EL MISMO programa");

check("conserva id y createdAt, y sella updatedAt", () => {
  const r = fusionarPrograma(EXISTENTE, {
    name: "Ciclo 3 renombrado", sessions: EXISTENTE.sessions,
    exercises: [ex({ id: "t", name: "Press plano" })],
  });
  assert.equal(r.program.id, "p1", "cambio de id: seria un programa nuevo");
  assert.equal(r.program.createdAt, 1000);
  assert.equal(r.program.name, "Ciclo 3 renombrado");
  assert.ok(r.program.updatedAt > 0, "sin updatedAt el otro dispositivo gana el merge");
});

titulo("A quien actualizar");

check("encuentra el programa por nombre normalizado", () => {
  const progs = [{ id: "x", name: "otro" }, { id: "y", name: "  CICLO 3 " }];
  assert.equal(candidatoAActualizar(progs, "Ciclo 3")?.id, "y");
});

check("entre homonimos gana el editado mas recientemente", () => {
  const progs = [
    { id: "viejo", name: "Ciclo 3", updatedAt: "2026-01-01T00:00:00Z" },
    { id: "nuevo", name: "Ciclo 3", updatedAt: "2026-08-01T00:00:00Z" },
  ];
  assert.equal(candidatoAActualizar(progs, "Ciclo 3").id, "nuevo");
});

check("no ofrece actualizar el programa de un entrenador", () => {
  // Un programa asignado no se edita: la prescripcion es de quien entrena.
  const progs = [{ id: "a", name: "Ciclo 3", readOnly: true }];
  assert.equal(candidatoAActualizar(progs, "Ciclo 3"), null);
});

check("sin homonimo devuelve null y el import crea uno nuevo", () => {
  assert.equal(candidatoAActualizar([{ id: "a", name: "Otra cosa" }], "Ciclo 3"), null);
  assert.equal(candidatoAActualizar([], ""), null);
});

console.log(`\n${ok} checks OK${fallos ? `  ·  ${fallos} FALLAN` : ""}`);
process.exit(fallos ? 1 : 0);
