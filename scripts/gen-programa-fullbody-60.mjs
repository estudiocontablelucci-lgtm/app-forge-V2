/**
 * Programa "Fullbody 3x · fuerza y equilibrio 60'".
 *
 *   node scripts/gen-programa-fullbody-60.mjs                  # .xlsx para el wizard
 *   node scripts/gen-programa-fullbody-60.mjs --cuenta <email> # lo carga en esa cuenta
 *
 * Para quien: mujer de 68 que arranca a entrenar contra la sarcopenia, operada
 * hace muchos anios de una ARTROSIS CERVICAL que deformo las vertebras y
 * comprimia la medula. Sin secuelas. Tres dias, una hora tope.
 *
 * Que la compresion haya sido MEDULAR y no de una raiz es lo que ordena todo lo
 * de abajo. El canal quedo territorio comprometido de por vida aunque no queden
 * sintomas, asi que la consigna no es solo "no cargar el cuello" sino tampoco
 * moverlo rapido ni llevarlo a rango final. Por eso faltan ejercicios que en
 * cualquier otro programa serian obvios:
 *
 *   1. Carga axial sobre la columna — no hay sentadilla con barra ni press
 *      militar de pie. Lo que baja por la barra pasa por las cervicales.
 *   2. Trabajo por encima de la cabeza — el press overhead mete extension de
 *      cuello bajo carga, y la extension es la posicion que mas cierra el canal.
 *   3. Flexion/extension cervical repetida — no hay abdominales clasicos ni
 *      nada en prono con la cabeza levantada. El core se entrena en anti-
 *      rotacion, que es como se usa de verdad.
 *   4. Traccion del cuello — sin dominadas ni colgarse de la barra.
 *   5. NADA BRUSCO. Todos los tempos son controlados y la potencia se entrena
 *      sentada con la cabeza apoyada, no de pie con el tronco en movimiento.
 *
 * Y agrega dos cosas que en un programa de hipertrofia no estarian:
 *
 *   - POTENCIA (sesion C), pero en maquina. La velocidad de produccion de fuerza
 *     se pierde antes que la fuerza maxima y es la que evita que un tropezon
 *     termine en caida. La version clasica —pararse rapido de una silla— queda
 *     descartada: acelera la cabeza. Se entrena empujando rapido en la prensa,
 *     con espalda y nuca apoyadas.
 *   - EQUILIBRIO Y AGARRE. La marcha en tandem entrena lo primero (SIEMPRE con
 *     la mano en la baranda: una caida con ese antecedente no es una caida
 *     cualquiera); la caminata granjero, lo segundo — la fuerza de agarre es
 *     marcador de sarcopenia.
 *
 * SEnALES PARA PARAR Y CONSULTAR, no negociables: hormigueo o adormecimiento en
 * manos o brazos, torpeza para manipular objetos chicos (abotonarse, agarrar
 * monedas), o cambios en la forma de caminar. Son los signos con los que se
 * manifiesta una compresion medular y no son "agujetas".
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
      "REGLA DE TODA LA RUTINA, y este es el primer ejercicio así que va acá: el cuello se mueve despacio y nunca a rango final. Nada de mirar al techo ni girar rápido la cabeza, ni siquiera entre series. " +
      "Respaldo alto, cabeza apoyada y en línea con la espalda. NO empujar con la nuca contra el respaldo — es el error más común y carga justo lo operado. " +
      "Exhalar al empujar: nada de aguantar el aire (sube la presión arterial y tensiona el cuello). " +
      "Semana 1 es para encontrar el peso: buscar un kilaje que deje 4 reps en reserva y anotarlo. " +
      "Si aparece hormigueo en manos o brazos, torpeza para agarrar cosas chicas o cambios al caminar: parar y consultar al médico. No son agujetas.",
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
    session: "A", order: 4, name: "Puente de glúteo (en el piso)", group: "Isquios",
    sets: 3, repsMin: 12, repsMax: 15, rest: 60, rir: "3",
    description:
      "EN EL PISO, no en banco. La versión de banco apoya los omóplatos y deja la cabeza colgando: eso es extensión de cuello sostenida con el tronco cargado, justo lo que hay que evitar. En el piso la cabeza queda apoyada y neutra las tres series. " +
      "Subir hasta alinear cadera con rodillas y hombros, sin arquear la zona lumbar y sin empujar con la nuca contra el piso. Carga: peso corporal, y más adelante un disco sobre la cadera.",
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
    session: "B", order: 3, name: "Extensión de cadera en polea (de pie)", group: "Isquios",
    sets: 3, repsMin: 12, repsMax: 15, rest: 90, rir: "3",
    description:
      "Reemplaza al peso muerto rumano a propósito. El rumano deja el tronco horizontal y la cabeza en voladizo: sostenerla ahí durante 12 repeticiones es carga sostenida sobre lo operado, aunque el peso esté en las manos. " +
      "Acá el tronco queda VERTICAL y el cuello neutro toda la serie. De pie, tomada del soporte, llevar la pierna hacia atrás desde la cadera sin arquear la lumbar. 12-15 por pierna.",
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
      "Equilibrio: caminar en línea recta apoyando el talón contra la punta del otro pie. SIEMPRE con una mano en la baranda o la pared, no solo las primeras semanas — una caída con su antecedente cervical no es una caída cualquiera. " +
      "Mirada al frente y fija: nada de girar la cabeza mientras camina, que es la progresión habitual de este ejercicio y acá queda descartada. " +
      "No es relleno — la fuerza sola no baja las caídas, la fuerza más el equilibrio sí.",
  }),
  ex({
    session: "B", order: 6, name: "Caminata granjero", group: "Core",
    sets: 2, repsMin: 20, repsMax: 30, rest: 60, rir: "2", unit: "pasos",
    description:
      "Mancuernas livianas al costado, 20-30 pasos en línea recta y con el camino despejado. La fuerza de agarre es uno de los marcadores de sarcopenia y se entrena así. " +
      "Hombros abajo y relajados, sin encogerlos hacia las orejas. Sin giros de cabeza mientras camina cargada, y sin apurar el paso. " +
      "Si aparece hormigueo o adormecimiento en las manos, soltar el peso y avisar: con su antecedente eso no se deja pasar.",
  }),

  /* ---------- C · Potencia y accesorios ---------- */
  ex({
    session: "C", order: 1, name: "Prensa horizontal (potencia)", group: "Cuádriceps",
    sets: 3, repsMin: 6, repsMax: 8, rest: 120, rir: "4", tempo: "3-0-1-0",
    description:
      "EMPUJAR RÁPIDO, volver lento en 3 segundos. La intención de velocidad es el estímulo, no el peso: carga liviana (más o menos la mitad de lo que usa en la sesión A). " +
      "La potencia se pierde antes que la fuerza máxima y es la que evita que un tropezón termine en caída. " +
      "Va en máquina y NO parándose rápido de una silla, que es la versión clásica: pararse rápido acelera la cabeza, y con su antecedente eso es justo lo que no queremos. Acá la espalda y la nuca quedan apoyadas todo el tiempo. " +
      "Parar la serie apenas el empuje se pone lento: es potencia, no resistencia. Sin trabar las rodillas al final.",
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
