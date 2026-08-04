/**
 * Verifica el Δ de ciclo del e1RM.
 *
 *   node scripts/verify-progreso.mjs
 *
 * Los casos salen de datos reales: un ejercicio que entra tarde al programa,
 * una semana salteada, el deload, y la semana que se esta entrenando ahora.
 * Todos ellos, mal resueltos, muestran un retroceso donde no lo hay.
 */
import { deltaE1rm, resumenCiclo, bienestar, correlacion, fuerzaCorrelacion } from "../lib/progreso.js";

const fallas = [];
const check = (label, fn) => {
  try {
    const r = fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

console.log("\ndelta de ciclo");

check("Δ y Δ% entre la primera y la ultima semana", () => {
  // Press banca real: 80 en la semana 1, 90 en la 2.
  const d = deltaE1rm({ 1: 80, 2: 90 });
  if (d.delta !== 10) return `Δ ${d.delta}`;
  if (d.pct !== 12.5) return `Δ% ${d.pct}, esperaba 12.5`;
  return true;
});

check("el mismo Δ pesa distinto segun de donde parte", () => {
  // 7 kg sobre un press de 80 no es lo mismo que sobre un curl de 18.
  const press = deltaE1rm({ 1: 80, 2: 87 });
  const curl = deltaE1rm({ 1: 18, 2: 25 });
  if (press.delta !== curl.delta) return "los Δ absolutos deberian ser iguales";
  if (!(curl.pct > press.pct * 3)) return `${curl.pct}% vs ${press.pct}%: el % no esta diferenciando`;
  return true;
});

check("un ejercicio que entro tarde NO retrocede", () => {
  // Sin datos en la semana 1: empezo despues, no bajo.
  const d = deltaE1rm({ 2: 60, 3: 65 });
  if (d.delta !== 5) return `Δ ${d.delta}`;
  if (d.desde !== "2") return `arranco en la semana ${d.desde}`;
  return true;
});

check("una semana salteada en el medio no cuenta como caida", () => {
  const d = deltaE1rm({ 1: 100, 3: 110 });
  if (d.delta !== 10) return `Δ ${d.delta}`;
  if (d.semanas !== 2) return `conto ${d.semanas} semanas`;
  return true;
});

check("el deload queda FUERA del calculo", () => {
  // Es una semana de menos volumen a proposito: medir contra ella diria que
  // todo el mundo empeora al final del ciclo.
  const d = deltaE1rm({ 1: 100, 4: 115, DL: 80 });
  if (d.delta !== 15) return `Δ ${d.delta}, el deload se colo en el calculo`;
  if (d.hasta !== "4") return `termino en ${d.hasta}`;
  return true;
});

check("con una sola semana no hay Δ", () => {
  const d = deltaE1rm({ 2: 90 });
  if (d.delta !== null) return `invento un Δ de ${d.delta}`;
  return true;
});

check("sin datos tampoco", () => {
  const d = deltaE1rm({});
  if (d.delta !== null || d.provisional) return JSON.stringify(d);
  return true;
});

check("los ceros no arrastran el Δ hacia arriba", () => {
  // Una semana en cero no es un e1RM de cero, es una semana sin ese ejercicio.
  const d = deltaE1rm({ 1: 0, 2: 80, 3: 85 });
  if (d.primera !== 80) return `arranco en ${d.primera}`;
  if (d.delta !== 5) return `Δ ${d.delta}`;
  return true;
});

console.log("\nsemana en curso");

check("marca provisional si la ultima semana es la que se entrena ahora", () => {
  // Puede faltar la serie pesada: un Δ negativo ahi es una foto a mitad de
  // camino, no un retroceso.
  const d = deltaE1rm({ 1: 100, 2: 105, 3: 95 }, { semanaEnCurso: 3 });
  if (!d.provisional) return "no lo marco como provisional";
  if (d.delta !== -5) return `Δ ${d.delta}`;
  return true;
});

check("no lo marca si la semana en curso todavia no tiene datos", () => {
  const d = deltaE1rm({ 1: 100, 2: 110 }, { semanaEnCurso: 3 });
  if (d.provisional) return "marco provisional un Δ entre semanas cerradas";
  return true;
});

check("la semana en curso se compara como texto o como numero", () => {
  const a = deltaE1rm({ 1: 100, 3: 95 }, { semanaEnCurso: "3" });
  const b = deltaE1rm({ 1: 100, 3: 95 }, { semanaEnCurso: 3 });
  if (!a.provisional || !b.provisional) return "el tipo del numero de semana cambia el resultado";
  return true;
});

console.log("\nresumen del ciclo");

check("cuenta cuantos suben y cuantos bajan", () => {
  const r = resumenCiclo([
    deltaE1rm({ 1: 80, 2: 90 }),
    deltaE1rm({ 1: 60, 2: 65 }),
    deltaE1rm({ 1: 100, 2: 95 }),
    deltaE1rm({ 1: 50, 2: 50 }),
    deltaE1rm({ 2: 40 }),
  ]);
  if (r.suben !== 2) return `suben ${r.suben}`;
  if (r.bajan !== 1) return `bajan ${r.bajan}`;
  if (r.iguales !== 1) return `iguales ${r.iguales}`;
  if (r.total !== 4) return `total ${r.total}: el que no tiene Δ no deberia contar`;
  return true;
});

check("los provisionales se cuentan aparte", () => {
  const r = resumenCiclo([
    deltaE1rm({ 1: 80, 2: 90 }),
    deltaE1rm({ 1: 100, 3: 95 }, { semanaEnCurso: 3 }),
  ]);
  if (r.provisionales !== 1) return `provisionales ${r.provisionales}`;
  if (r.bajan !== 1) return "igual tiene que contarse en su categoria";
  return true;
});

check("sin filas no inventa un resumen", () => {
  const r = resumenCiclo([]);
  if (r.total !== 0 || r.suben !== 0) return JSON.stringify(r);
  return true;
});

console.log("\nbienestar");

const SESIONES = [
  { date: 1, week: "1", session: "A", health: { sleep: 5, stress: 1, energy: 5 } },
  { date: 2, week: "1", session: "B", health: { sleep: 2, stress: 5, energy: 2 } },
  { date: 3, week: "2", session: "A", health: { sleep: 4, stress: 2, energy: 4 } },
  { date: 4, week: "2", session: "B", health: { sleep: 3, stress: 4, energy: 3 } },
  { date: 5, week: "3", session: "A", health: { sleep: 5, stress: 1, energy: 5 } },
];
const TON = { 1: 9000, 2: 5000, 3: 8000, 4: 6500, 5: 9500 };

check("promedia los tres indicadores", () => {
  const b = bienestar(SESIONES, (h) => TON[h.date]);
  if (b.promedios.sleep !== 3.8) return `sueño ${b.promedios.sleep}`;
  if (b.promedios.stress !== 2.6) return `estres ${b.promedios.stress}`;
  return true;
});

check("el estres correlaciona AL REVES que sueño y energia", () => {
  // 5 es mucho estres: si se comparara de frente, la conclusion seria la
  // contraria a la real.
  const b = bienestar(SESIONES, (h) => TON[h.date]);
  if (!(b.contraTonelaje.sleep > 0.8)) return `sueño vs tonelaje ${b.contraTonelaje.sleep}`;
  if (!(b.contraTonelaje.stress < -0.8)) return `estres vs tonelaje ${b.contraTonelaje.stress}`;
  return true;
});

check("sin variacion NO hay correlacion", () => {
  // Contestar 4 de sueño todos los dias no dice nada del rendimiento, y
  // dividir por cero diria que si.
  const iguales = SESIONES.map((s) => ({ ...s, health: { ...s.health, sleep: 4 } }));
  const b = bienestar(iguales, (h) => TON[h.date]);
  if (b.contraTonelaje.sleep !== null) return `dio ${b.contraTonelaje.sleep}`;
  return true;
});

check("con pocas sesiones no arriesga una conclusion", () => {
  if (correlacion([1, 2, 3], [1, 2, 3]) !== null) return "correlaciono con 3 puntos";
  if (correlacion([1, 2, 3, 4], [1, 2, 3, 4]) !== 1) return "con 4 deberia poder";
  return true;
});

check("una relacion debil se describe como tal", () => {
  if (fuerzaCorrelacion(0.15) !== "sin relación clara") return fuerzaCorrelacion(0.15);
  if (fuerzaCorrelacion(-0.85) !== "relación inversa fuerte") return fuerzaCorrelacion(-0.85);
  if (fuerzaCorrelacion(null) !== null) return "invento una descripcion sin datos";
  return true;
});

check("las sesiones sin health check no rompen la serie", () => {
  const b = bienestar([...SESIONES, { date: 6, week: "3", session: "B" }], (h) => TON[h.date] ?? null);
  if (b.sesiones.length !== 5) return `${b.sesiones.length} sesiones`;
  return true;
});

check("la serie sale ordenada por fecha", () => {
  const desordenadas = [...SESIONES].reverse();
  const b = bienestar(desordenadas, () => null);
  if (b.sesiones[0].fecha !== 1) return "no ordeno";
  return true;
});

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length} verificacion(es):`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK  progreso: el Δ del ciclo no confunde empezar tarde con retroceder");
