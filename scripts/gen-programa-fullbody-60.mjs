/**
 * Programa "Fullbody 3x · fuerza y equilibrio 60'".
 *
 *   node scripts/gen-programa-fullbody-60.mjs                  # .xlsx para el wizard
 *   node scripts/gen-programa-fullbody-60.mjs --cuenta <email> # lo carga en esa cuenta
 *
 * Para quien: adulto mayor que arranca a entrenar contra la sarcopenia, con
 * antecedente de CIRUGIA CERVICAL ya dada de alta. Tres dias, una hora tope.
 *
 * La seleccion de ejercicios no es generica: esta condicionada por el cuello.
 * Todo lo que aparece abajo evita cuatro cosas, y por eso faltan ejercicios que
 * en cualquier otro programa serian obvios:
 *
 *   1. Carga axial sobre la columna — no hay sentadilla con barra ni press
 *      militar de pie. Lo que baja por la barra pasa por las cervicales.
 *   2. Trabajo por encima de la cabeza — el press overhead mete extension de
 *      cuello bajo carga. Se reemplaza por press inclinado.
 *   3. Flexion/extension cervical repetida — no hay abdominales clasicos ni
 *      nada en prono con la cabeza levantada. El core se entrena en anti-
 *      rotacion, que es como se usa de verdad.
 *   4. Traccion del cuello — sin dominadas ni colgarse de la barra.
 *
 * Y agrega dos cosas que en un programa de hipertrofia no estarian:
 *
 *   - POTENCIA (sesion C). La velocidad de produccion de fuerza se pierde antes
 *     que la fuerza maxima y es la que evita las caidas. Es sentarse y pararse
 *     rapido, sin carga: el gesto que predice independencia funcional.
 *   - EQUILIBRIO Y AGARRE. La marcha en tandem entrena lo primero; la caminata
 *     granjero, lo segundo — la fuerza de agarre es marcador de sarcopenia.
 *
 * Progresion: la sarcopenia se revierte con carga PROGRESIVA, no con repetir
 * el mismo peso. Semana 1 es de calibracion (RIR 4, encontrar los kilos),
 * semanas 2-4 suben. Todas las refs arrancan vacias a proposito.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const SESSIONS = [
  { id: "A", name: "Empuje y tracción" },
  { id: "B", name: "Bisagra y equilibrio" },
  { id: "C", name: "Potencia y accesorios" },
];

export const PROGRAMA = {
  name: "Fullbody 3x · fuerza y equilibrio 60'",
  weeks: 4,
  hasDeload: true,
  // Deload quitando series y no repeticiones: a esta edad conviene seguir
  // practicando el movimiento completo, con menos volumen.
  deload: { pct: 40, method: "sets", minSets: 2 },
};

const ex = (o) => ({
  tempo: "3-1-1-0", rir: "3", superset: null, unit: "reps", refKg: null, description: "", ...o,
});

export const EJERCICIOS = [
  /* ---------- A · Empuje y tracción ---------- */
  ex({
    session: "A", order: 1, name: "Prensa horizontal", group: "Cuádriceps",
    sets: 3, repsMin: 10, repsMax: 12, rest: 120, rir: "3",
    description:
      "Respaldo alto, cabeza apoyada y en línea con la espalda. NO empujar con la nuca contra el respaldo — es el error más común y carga justo lo operado. " +
      "Exhalar al empujar: nada de aguantar el aire (sube la presión arterial y tensiona el cuello). " +
      "Semana 1 es para encontrar el peso: buscar un kilaje que deje 4 reps en reserva y anotarlo.",
  }),
  ex({
    session: "A", order: 2, name: "Remo sentado (agarre neutro)", group: "Espalda",
    sets: 3, repsMin: 10, repsMax: 12, rest: 90, rir: "3",
    description:
      "El ejercicio más importante del programa para ella. Fortalece lo que sostiene la cabeza y contrarresta la postura de cuello adelantado, que es la que le va a molestar. " +
      "Pecho apoyado, mirada al frente, y NO adelantar la cabeza al tirar. Llevar los codos hacia atrás pegados al cuerpo.",
  }),
  ex({
    session: "A", order: 3, name: "Press pecho en máquina (sentado)", group: "Pecho",
    sets: 3, repsMin: 10, repsMax: 12, rest: 90, rir: "3",
    description:
      "En máquina y sentada, no en banco plano: acostarse y levantarse del banco con mancuernas le carga el cuello más que el ejercicio en sí. " +
      "Respaldo vertical, cabeza apoyada. No bajar más allá de donde los hombros queden cómodos.",
  }),
  ex({
    session: "A", order: 4, name: "Puente de glúteo", group: "Isquios",
    sets: 3, repsMin: 12, repsMax: 15, rest: 60, rir: "3",
    description:
      "Apoyar los OMÓPLATOS en el banco, nunca la cabeza ni el cuello. Si se usa barra, con almohadilla y liviana; si molesta, sin carga: el peso corporal alcanza para empezar. " +
      "Subir hasta alinear cadera con rodillas y hombros, sin arquear la zona lumbar.",
  }),
  ex({
    session: "A", order: 5, name: "Gemelo sentado", group: "Gemelos",
    sets: 2, repsMin: 15, repsMax: 20, rest: 60, rir: "2",
    description:
      "Sentada, así no hay carga en la columna. El tríceps sural es de los primeros en perder masa y es el que frena una pérdida de equilibrio hacia adelante.",
  }),
  ex({
    session: "A", order: 6, name: "Pallof press (anti-rotación)", group: "Core",
    sets: 2, repsMin: 10, repsMax: 12, rest: 60, rir: "2",
    description:
      "Core SIN flexionar el cuello. Reemplaza a los abdominales clásicos, que son flexión cervical repetida contra resistencia — exactamente lo que no puede hacer. " +
      "De pie, de costado a la polea, estirar los brazos al frente y resistir la rotación. 10-12 por lado.",
  }),

  /* ---------- B · Bisagra y equilibrio ---------- */
  ex({
    session: "B", order: 1, name: "Sentadilla a cajón (con apoyo)", group: "Cuádriceps",
    sets: 3, repsMin: 8, repsMax: 10, rest: 120, rir: "3",
    description:
      "Sentarse y levantarse de un banco alto. Es el gesto que mejor predice independencia funcional a los 68 y el que primero se pierde. " +
      "Sin peso hasta que salgan 10 limpias; después con mancuernas AL COSTADO (nunca barra sobre los hombros: eso es carga axial). " +
      "Bajar controlada en 3 segundos, tocar el banco sin desplomarse.",
  }),
  ex({
    session: "B", order: 2, name: "Jalón al pecho (agarre neutro)", group: "Espalda",
    sets: 3, repsMin: 10, repsMax: 12, rest: 90, rir: "3",
    description:
      "AL FRENTE SIEMPRE, nunca tras la nuca — el jalón tras nuca está contraindicado con antecedente cervical, sin excepción. " +
      "Tirar sin echar la cabeza hacia atrás para acompañar. Si aparece hormigueo en brazos o manos, cortar la serie y avisar.",
  }),
  ex({
    session: "B", order: 3, name: "Peso muerto rumano (DB, rango corto)", group: "Isquios",
    sets: 3, repsMin: 10, repsMax: 12, rest: 90, rir: "3-4",
    description:
      "Con mancuernas y rango corto: bajar solo hasta media canilla, nunca al piso. No hay peso muerto convencional en este programa. " +
      "Espalda neutra y mirada al piso a dos metros — mirar al espejo al frente obliga a extender el cuello justo cuando la espalda está horizontal.",
  }),
  ex({
    session: "B", order: 4, name: "Press inclinado (DB)", group: "Pecho",
    sets: 3, repsMin: 10, repsMax: 12, rest: 90, rir: "3",
    description:
      "Banco a 45°, NO press por encima de la cabeza. El overhead mete extensión de cuello bajo carga; el inclinado entrena casi lo mismo sin eso. " +
      "Mancuernas y no barra: permite que cada hombro busque su recorrido.",
  }),
  ex({
    session: "B", order: 5, name: "Marcha en tándem (talón-punta)", group: "Core",
    sets: 3, repsMin: 20, repsMax: 30, rest: 45, rir: "2", unit: "pasos",
    description:
      "Equilibrio: caminar en línea recta apoyando el talón contra la punta del otro pie. Con una mano cerca de la pared las primeras semanas. " +
      "No es relleno — el entrenamiento de fuerza solo no baja las caídas, la fuerza más el equilibrio sí.",
  }),
  ex({
    session: "B", order: 6, name: "Caminata granjero", group: "Core",
    sets: 2, repsMin: 20, repsMax: 30, rest: 60, rir: "2", unit: "pasos",
    description:
      "Mancuernas livianas al costado, 20-30 pasos. La fuerza de agarre es uno de los marcadores de sarcopenia y se entrena así. " +
      "Hombros abajo y relajados, sin encogerlos hacia las orejas. Si aparece hormigueo en las manos, bajar el peso.",
  }),

  /* ---------- C · Potencia y accesorios ---------- */
  ex({
    session: "C", order: 1, name: "Sentarse y pararse rápido (potencia)", group: "Cuádriceps",
    sets: 3, repsMin: 6, repsMax: 8, rest: 120, rir: "4", tempo: "3-0-1-0",
    description:
      "SUBIR RÁPIDO, bajar lento en 3 segundos. La intención de velocidad es el estímulo, no el peso. " +
      "La potencia (fuerza por velocidad) se pierde antes que la fuerza máxima y es la que evita que una pérdida de equilibrio termine en caída. " +
      "Sin carga hasta que el gesto salga limpio y sin dolor. Parar la serie apenas la subida se pone lenta: es potencia, no resistencia.",
  }),
  ex({
    session: "C", order: 2, name: "Sillón de cuádriceps", group: "Cuádriceps",
    sets: 3, repsMin: 12, repsMax: 15, rest: 90, rir: "3",
    description: "Cero carga sobre la columna. Volumen de cuádriceps sin exigirle nada al cuello ni al equilibrio.",
  }),
  ex({
    session: "C", order: 3, name: "Camilla isquios (sentada)", group: "Isquios",
    sets: 3, repsMin: 12, repsMax: 15, rest: 90, rir: "3",
    description:
      "En la versión SENTADA, no en prono. Acostarse boca abajo obliga a extender el cuello durante toda la serie.",
  }),
  ex({
    session: "C", order: 4, name: "Remo con mancuerna (pecho apoyado)", group: "Espalda",
    sets: 3, repsMin: 10, repsMax: 12, rest: 90, rir: "3",
    description:
      "Banco inclinado a 30°, pecho apoyado, la frente puede descansar en el banco. Así el cuello no sostiene el peso de la cabeza durante la serie. " +
      "Segunda dosis semanal de tracción: la espalda alta es lo que más se descuida y lo que más le va a servir.",
  }),
  ex({
    session: "C", order: 5, name: "Curl sentado (DB)", group: "Bíceps",
    sets: 2, repsMin: 12, repsMax: 15, rest: 60, rir: "2",
    description: "Sentada con respaldo. Sin balanceo del cuerpo para levantar el peso.",
  }),
  ex({
    session: "C", order: 6, name: "Ext. tríceps (polea)", group: "Tríceps",
    sets: 2, repsMin: 12, repsMax: 15, rest: 60, rir: "2",
    description:
      "En polea y hacia abajo, no overhead. La versión por encima de la cabeza está fuera por el cuello.",
  }),
];

/* ---------- salida ---------- */

const HEADER = ["Sesion", "Orden", "Ejercicio", "Grupo muscular", "Series", "Reps min", "Reps max", "Ref KG", "Tempo", "Descanso", "RIR", "Superserie", "Unidad", "Descripcion"];

function generarXlsx() {
  const rows = EJERCICIOS.map((e) => [
    e.session, e.order, e.name, e.group, e.sets, e.repsMin, e.repsMax,
    e.refKg ?? "", e.tempo, e.rest, e.rir, "", e.unit, e.description,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([HEADER, ...rows]);
  ws["!cols"] = [
    { wch: 7 }, { wch: 6 }, { wch: 34 }, { wch: 14 }, { wch: 7 }, { wch: 9 },
    { wch: 9 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 12 },
    { wch: 8 }, { wch: 110 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Programa");

  mkdirSync(resolve(root, "data"), { recursive: true });
  const salida = resolve(root, "data/forge-fullbody-3x-60min.xlsx");
  writeFileSync(salida, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  return salida;
}

async function cargarEnCuenta(email) {
  const { findByEmail } = await import("../lib/repo/users.js");
  const { saveProgram } = await import("../lib/repo/programs.js");
  const { scopeProgram } = await import("../lib/sync/ids.js");
  const { uid } = await import("../lib/db.js");

  const user = await findByEmail(email);
  if (!user) throw new Error(`No existe una cuenta con el email ${email}`);

  // Ids prefijados con el dueno, como cualquier programa que sube su cliente:
  // pelados, el pull se los daria asi y el push siguiente los duplicaria.
  const local = {
    ...PROGRAMA,
    id: `fullbody60-${uid()}`,
    status: "active",
    sessions: SESSIONS,
    exercises: EJERCICIOS.map((e) => ({ ...e, id: uid() })),
  };
  const guardado = await saveProgram(user.id, scopeProgram(user.id, local));
  return { user, programa: guardado };
}

const args = process.argv.slice(2);
const iCuenta = args.indexOf("--cuenta");

if (iCuenta !== -1) {
  const email = args[iCuenta + 1];
  if (!email) { console.error("Falta el email: --cuenta <email>"); process.exit(1); }
  const { user, programa } = await cargarEnCuenta(email);
  console.log(`Cargado en la cuenta de ${user.displayName || user.email} (${user.id})`);
  console.log(`  programa   ${programa.id}`);
  console.log(`  nombre     ${programa.name}`);
  console.log(`  sesiones   ${programa.sessions.map((s) => s.id).join(", ")}`);
  console.log(`  ejercicios ${programa.exercises.length}`);
  console.log("\nAparece en la pestana Programa al sincronizar desde la app.");
} else {
  const salida = generarXlsx();
  console.log(`${EJERCICIOS.length} ejercicios en ${SESSIONS.length} sesiones -> ${salida}`);
  console.log("Importar desde Programa -> Importar Excel. Para cargarlo directo en una cuenta:");
  console.log("  node scripts/gen-programa-fullbody-60.mjs --cuenta <email>");
}
