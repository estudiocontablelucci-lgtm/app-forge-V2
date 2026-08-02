/**
 * Verifica el catalogo de ejercicios y su migracion.
 *
 *   node scripts/verify-catalog.mjs
 *
 * Lo que importa: la migracion corre sobre programas reales con 33 ejercicios y
 * no puede perder ninguno ni inventar duplicados.
 */
import { migrarACatalogo, resolverEjercicios, agregarAlCatalogo, normalizar, tieneSeriesRegistradas, absorberDeProgramas, CATALOGO_BASE } from "../lib/catalog.js";

// El SEED real, importado del modulo donde vive. Antes se extraia del texto de
// ForgeApp.jsx; cuando el SEED se mudo, esa extraccion se rompio de tres formas
// distintas en tres scripts, y una de ellas fallo en silencio.
const { SEED } = await import("../lib/seed-ciclo2.js");

const fallas = [];
const check = (label, fn) => {
  try {
    const r = fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

const programaSeed = () => [{ id: "p1", name: "Ciclo 2", exercises: SEED.map((e) => ({ ...e })) }];

check("la migracion no pierde ni duplica ejercicios del programa", () => {
  const { programs } = migrarACatalogo(programaSeed());
  const ex = programs[0].exercises;
  if (ex.length !== SEED.length) return `${ex.length} ejercicios, el SEED tiene ${SEED.length}`;
  const sinRef = ex.filter((e) => !e.exerciseId);
  if (sinRef.length) return `${sinRef.length} quedaron sin exerciseId`;
  const ids = new Set(ex.map((e) => e.id));
  if (ids.size !== SEED.length) return "se perdieron ids de ejercicios del programa";
  return true;
});

check("los nombres sobreviven al round-trip por el catalogo", () => {
  const { programs, catalog } = migrarACatalogo(programaSeed());
  const resueltos = resolverEjercicios(programs[0].exercises, catalog);
  for (const [i, e] of resueltos.entries()) {
    if (e.name !== SEED[i].name) return `"${SEED[i].name}" volvio como "${e.name}"`;
  }
  return true;
});

check("dos grafias del mismo ejercicio caen en la misma entrada", () => {
  const progs = [{ id: "p1", exercises: [
    { id: "a", name: "Prensa 45°", sets: 3 },
    { id: "b", name: "prensa 45", sets: 3 },
    { id: "c", name: "PRENSA  45°", sets: 3 },
  ] }];
  const { programs, catalog } = migrarACatalogo(progs);
  const refs = new Set(programs[0].exercises.map((e) => e.exerciseId));
  if (refs.size !== 1) return `${refs.size} entradas distintas, esperaba 1`;
  const cuantas = catalog.filter((c) => normalizar(c.name) === "prensa 45").length;
  if (cuantas !== 1) return `${cuantas} entradas "prensa 45" en el catalogo`;
  return true;
});

check("un ejercicio que no esta en el catalogo base se agrega como propio", () => {
  const progs = [{ id: "p1", exercises: [{ id: "x", name: "Jalon con soga invertido", group: "Espalda", sets: 3 }] }];
  const { catalog, programs } = migrarACatalogo(progs);
  const nuevo = catalog.find((c) => normalizar(c.name) === "jalon con soga invertido");
  if (!nuevo) return "no lo agrego al catalogo";
  if (nuevo.base) return "lo marco como base y deberia ser propio";
  if (programs[0].exercises[0].exerciseId !== nuevo.id) return "el programa no apunta al nuevo";
  return true;
});

check("los del catalogo base quedan marcados como base", () => {
  const { catalog } = migrarACatalogo(programaSeed());
  const press = catalog.find((c) => normalizar(c.name) === "press plano barra");
  if (!press) return "no encontre 'Press Plano (barra)' en el catalogo";
  if (!press.base) return "deberia venir del catalogo base";
  return true;
});

check("la migracion es idempotente", () => {
  const una = migrarACatalogo(programaSeed());
  const dos = migrarACatalogo(una.programs, una.catalog);
  if (dos.catalog.length !== una.catalog.length) {
    return `el catalogo paso de ${una.catalog.length} a ${dos.catalog.length}`;
  }
  const iguales = dos.programs[0].exercises.every((e, i) => e.exerciseId === una.programs[0].exercises[i].exerciseId);
  if (!iguales) return "las referencias cambiaron en la segunda pasada";
  return true;
});

check("resolverEjercicios respeta programas viejos sin exerciseId", () => {
  const viejos = [{ id: "z", name: "Ejercicio sin migrar", sets: 3 }];
  const r = resolverEjercicios(viejos, CATALOGO_BASE);
  if (r[0].name !== "Ejercicio sin migrar") return `perdio el nombre: ${r[0].name}`;
  return true;
});

check("corregir el nombre en el catalogo se propaga al programa", () => {
  const { programs, catalog } = migrarACatalogo([{ id: "p1", exercises: [{ id: "a", name: "Prensa horizonal", sets: 3 }] }]);
  const corregido = catalog.map((c) => (normalizar(c.name) === "prensa horizonal" ? { ...c, name: "Prensa horizontal" } : c));
  const r = resolverEjercicios(programs[0].exercises, corregido);
  if (r[0].name !== "Prensa horizontal") return `el programa sigue viendo "${r[0].name}"`;
  return true;
});

check("agregarAlCatalogo reusa la entrada si el nombre ya existe", () => {
  const { catalog } = migrarACatalogo(programaSeed());
  const antes = catalog.length;
  const { catalog: despues, entrada } = agregarAlCatalogo(catalog, { name: "press plano (BARRA)" });
  if (despues.length !== antes) return `agrego una entrada duplicada (${antes} -> ${despues.length})`;
  if (normalizar(entrada.name) !== "press plano barra") return `devolvio ${entrada.name}`;
  return true;
});

check("agregarAlCatalogo ignora nombres vacios", () => {
  const { catalog, entrada } = agregarAlCatalogo(CATALOGO_BASE, { name: "   " });
  if (entrada !== null) return "creo una entrada con nombre vacio";
  if (catalog.length !== CATALOGO_BASE.length) return "modifico el catalogo igual";
  return true;
});

/* ---------- absorber lo que llega del sync ---------- */

check("los ejercicios que llegan del servidor entran al catalogo", () => {
  // Un dispositivo nuevo: catalogo recien migrado del SEED, y por el pull llega
  // un programa con un ejercicio que aca no existe.
  const local = migrarACatalogo(programaSeed());
  const remoto = [{ id: "p9", exercises: [
    { id: "r1", exerciseId: "ex-jalon-al-pecho", name: "Jalón al pecho", group: "Espalda", sets: 3 },
  ] }];

  const absorbido = absorberDeProgramas(local.catalog, remoto);
  const encontrado = absorbido.find((c) => normalizar(c.name) === "jalon al pecho");
  if (!encontrado) return "el ejercicio remoto no entro al catalogo";
  // Y no se pierde nada de lo que ya habia.
  if (absorbido.length < local.catalog.length) {
    return `el catalogo encogio de ${local.catalog.length} a ${absorbido.length}`;
  }
  return true;
});

check("absorber dos veces lo mismo no duplica", () => {
  const local = migrarACatalogo(programaSeed());
  const remoto = [{ id: "p9", exercises: [{ id: "r1", exerciseId: "ex-jalon-al-pecho", name: "Jalón al pecho", sets: 3 }] }];
  const una = absorberDeProgramas(local.catalog, remoto);
  const dos = absorberDeProgramas(una, remoto);
  if (dos.length !== una.length) return `${una.length} -> ${dos.length}`;
  return true;
});

/* ---------- deteccion de series registradas ---------- */

const historialCon = (exId) => [{
  id: "h1", week: 1, session: "A",
  exercises: [{ id: exId, name: "X", sets: [{ setN: 1, kg: 60, reps: 10 }] }],
}];

check("detecta series del dispositivo actual", () => {
  if (!tieneSeriesRegistradas("a1", { "1|a1|1": { done: true } }, [])) return "no las vio en logs";
  return true;
});

check("detecta series que solo estan en el historial sincronizado", () => {
  // El caso real: se entreno en el celular y se edita el programa en la compu,
  // donde `logs` esta vacio pero el historial llego por el pull.
  if (!tieneSeriesRegistradas("a1", {}, historialCon("a1"))) return "no las vio en el historial";
  return true;
});

check("no confunde ejercicios distintos", () => {
  if (tieneSeriesRegistradas("a2", { "1|a1|1": { done: true } }, historialCon("a1"))) {
    return "marco series de otro ejercicio";
  }
  return true;
});

check("una sesion sin series no cuenta", () => {
  const vacia = [{ id: "h1", exercises: [{ id: "a1", name: "X", sets: [] }] }];
  if (tieneSeriesRegistradas("a1", {}, vacia)) return "conto una sesion sin series";
  if (tieneSeriesRegistradas("a1", {}, [])) return "conto con historial vacio";
  return true;
});

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length} verificacion(es):`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\nOK  catalogo: migracion de ${SEED.length} ejercicios, deduplicacion e idempotencia`);
