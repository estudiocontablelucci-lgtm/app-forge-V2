/**
 * El peso corporal como CARGA.
 *
 *   node scripts/verify-bodyweight.mjs
 *
 * En un ejercicio a peso corporal el campo de kilos es el LASTRE, asi que ocho
 * dominadas se registraban como `kg` vacio y valian cero: fuera del tonelaje y
 * sin e1RM. La app decia que no habias movido nada mientras te levantabas
 * ochenta kilos ocho veces.
 *
 * Lo que se verifica no es que la suma de: es que el peso que entra sea el
 * VIGENTE A ESA FECHA. Con un peso unico —el que vivia en el Perfil— bajar tres
 * kilos reescribia hacia atras el e1RM de cada dominada ya registrada, que es
 * exactamente el problema que este cambio vino a resolver.
 */
import { cargaEfectiva, esBW, brzycki } from "../lib/formulas.js";
import { pesoVigente } from "../lib/medidas.js";
import { fichaDeAlumno } from "../lib/coach/metrics.js";

const fallas = [];
const check = (label, fn) => {
  try {
    const r = fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

const TOMAS = [
  { fecha: "2026-06-01", valores: { peso: 84 } },
  { fecha: "2026-07-01", valores: { peso: 82 } },
  { fecha: "2026-08-01", valores: { peso: 80 } },
];

console.log("\nque peso tenia ese dia");

check("toma el vigente, no el ultimo", () => {
  const p = pesoVigente(TOMAS, "2026-07-15");
  return p === 82 ? true : `dio ${p}, esperaba 82 (la del 01-jul)`;
});

check("el mismo dia de la medicion vale esa medicion", () => {
  const p = pesoVigente(TOMAS, "2026-07-01");
  return p === 82 ? true : `dio ${p}`;
});

check("antes de la primera usa la primera, no null", () => {
  // Entrenar antes de haberse medido nunca es lo normal: dejar sin e1RM las
  // primeras semanas seria peor que aproximar con la medicion mas cercana.
  const p = pesoVigente(TOMAS, "2026-05-01");
  return p === 84 ? true : `dio ${p}, esperaba 84`;
});

check("sin ninguna medicion no inventa un peso", () => {
  const p = pesoVigente([], "2026-07-15");
  return p === null ? true : `dio ${p}, esperaba null`;
});

check("una toma sin peso no cuenta", () => {
  const p = pesoVigente([{ fecha: "2026-07-20", valores: { cintura: 85 } }, ...TOMAS], "2026-07-25");
  return p === 82 ? true : `dio ${p}, esperaba 82`;
});

check("acepta la fecha en ms, que es como la guarda el historial", () => {
  const p = pesoVigente(TOMAS, new Date("2026-07-15T10:00:00").getTime());
  return p === 82 ? true : `dio ${p}`;
});

console.log("\nlos kilos que se movieron de verdad");

check("un ejercicio con carga externa no cambia", () => {
  const kg = cargaEfectiva({ ref: 60, kg: "62.5", pesoCorporal: 80 });
  return kg === 62.5 ? true : `dio ${kg}`;
});

check("en uno a peso corporal, el campo de kilos es el LASTRE", () => {
  const kg = cargaEfectiva({ ref: "BW", kg: "10", pesoCorporal: 80 });
  return kg === 90 ? true : `dio ${kg}, esperaba 80 + 10`;
});

check("sin lastre vale el cuerpo entero", () => {
  const kg = cargaEfectiva({ ref: "BW", kg: "", pesoCorporal: 80 });
  return kg === 80 ? true : `dio ${kg}`;
});

check("sin peso conocido queda afuera, como antes", () => {
  const kg = cargaEfectiva({ ref: "BW", kg: "", pesoCorporal: null });
  return kg === null ? true : `dio ${kg}, esperaba null`;
});

check("BW se reconoce como lo escribe la gente", () => {
  if (!esBW("bw") || !esBW(" BW ")) return "no reconoce 'bw' ni con espacios";
  if (esBW("BWX") || esBW(60) || esBW(null)) return "reconoce como BW algo que no lo es";
  return true;
});

check("ocho dominadas dejan de valer cero", () => {
  const kg = cargaEfectiva({ ref: "BW", kg: null, pesoCorporal: 80 });
  const e1 = brzycki(kg, 8);
  return Math.round(e1) === 99 ? true : `e1RM ${e1}, esperaba ~99`;
});

console.log("\nla ficha del entrenador ve lo mismo que el alumno");

const PROGRAMA = {
  weeks: 4,
  sessions: [{ id: "A", name: "Día A" }],
  exercises: [
    { id: "e1", name: "Dominadas", refKg: "BW", rir: "2", unit: "reps" },
    { id: "e2", name: "Remo", refKg: 60, rir: "2", unit: "reps" },
  ],
};
const SESIONES = [
  { week: "1", session: "A", date: "2026-06-10T10:00:00.000Z" },
  { week: "4", session: "A", date: "2026-08-05T10:00:00.000Z" },
];
const SETS = [
  { programExerciseId: "e1", exerciseName: "Dominadas", week: "1", sessionCode: "A", kg: null, reps: 8, rir: 2 },
  { programExerciseId: "e1", exerciseName: "Dominadas", week: "4", sessionCode: "A", kg: null, reps: 8, rir: 2 },
  { programExerciseId: "e2", exerciseName: "Remo", week: "1", sessionCode: "A", kg: 60, reps: 10, rir: 2 },
];

check("sin medidas del alumno, todo sigue como antes", () => {
  const f = fichaDeAlumno({ programa: PROGRAMA, sesiones: SESIONES, sets: SETS });
  const dom = f.e1rm.find((e) => e.id === "e1");
  if (dom) return "calculo un e1RM de dominadas sin saber cuanto pesa";
  const ton = f.tonelaje.find((t) => t.week === "1");
  return ton.kg === 600 ? true : `tonelaje ${ton.kg}, esperaba solo el remo (600)`;
});

check("con medidas, las dominadas entran al tonelaje", () => {
  const f = fichaDeAlumno({ programa: PROGRAMA, sesiones: SESIONES, sets: SETS, medidas: TOMAS });
  const ton = f.tonelaje.find((t) => t.week === "1");
  // 84 kg x 8 dominadas + 60 x 10 del remo.
  return ton.kg === 84 * 8 + 600 ? true : `tonelaje ${ton.kg}, esperaba ${84 * 8 + 600}`;
});

check("y el e1RM de la semana 1 usa el peso de JUNIO", () => {
  const f = fichaDeAlumno({ programa: PROGRAMA, sesiones: SESIONES, sets: SETS, medidas: TOMAS });
  const dom = f.e1rm.find((e) => e.id === "e1");
  const esperado = Math.round(brzycki(84, 8));
  return dom.porSemana["1"] === esperado ? true : `dio ${dom.porSemana["1"]}, esperaba ${esperado}`;
});

check("y el de la semana 4, el de AGOSTO", () => {
  const f = fichaDeAlumno({ programa: PROGRAMA, sesiones: SESIONES, sets: SETS, medidas: TOMAS });
  const dom = f.e1rm.find((e) => e.id === "e1");
  const esperado = Math.round(brzycki(80, 8));
  if (dom.porSemana["4"] !== esperado) return `dio ${dom.porSemana["4"]}, esperaba ${esperado}`;
  // Bajar de peso haciendo las mismas dominadas BAJA el e1RM, y eso es correcto:
  // se movio menos carga. Lo que no puede pasar es que ese numero cambie hacia
  // atras cuando la balanza cambia hoy.
  return dom.porSemana["4"] < dom.porSemana["1"] ? true : "el e1RM no siguio al peso";
});

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length} verificacion(es):`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK  el peso corporal es carga, y es el que se tenia ese dia");
