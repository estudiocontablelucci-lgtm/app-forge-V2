/**
 * El `.md` manda y el `.mjs` es su transcripcion. Esto comprueba que digan lo mismo.
 *
 *     npm run verify:programa
 *
 * Solo LEE. No corrige nada: cual de los dos esta bien es una decision, no algo
 * que un script pueda deducir.
 *
 * ======================== POR QUE ========================
 *
 * El `.mjs` es lo que termina en la app, y se escribe a mano copiando del `.md`.
 * Una discrepancia significa que **el telefono prescribe algo que el documento
 * no dice**, y no hay forma de notarlo entrenando: 3 series donde el papel dice
 * 4 se ve perfectamente normal en la pantalla.
 *
 * Ademas se comprueba que el `.md` no se contradiga a SI MISMO. Ya paso: el
 * 08/08/2026 el encabezado de una sesion decia "29 series" mientras su propia
 * tabla listaba 30, y el titular decia 110 donde las tablas sumaban 111. Los
 * numeros de encabezado se escriben a mano y envejecen en cada revision.
 */
import { readFileSync } from "node:fs";
import { cargarProgramaVigente, PROGRAMA_MD } from "./rutas.mjs";

/*
 * Con `--contra <archivo.json>` se compara el `.md` contra LO QUE ESTA EN LA
 * APP —el programa tal cual lo devuelve el servidor— en vez de contra el
 * `.mjs`. Son eslabones distintos de la misma cadena y no se implican:
 *
 *     .md  →  .mjs  →  .xlsx  →  wizard  →  localStorage  →  servidor
 *
 * Que el `.mjs` este bien no dice nada de lo que quedo guardado. Y es lo
 * guardado lo que va a leer el telefono parado al lado de la maquina.
 */
const iContra = process.argv.indexOf("--contra");
const desdeApp = iContra > -1 ? JSON.parse(readFileSync(process.argv[iContra + 1], "utf8")) : null;

const vigente = await cargarProgramaVigente();
const SESIONES = desdeApp ? desdeApp.sessions : vigente.SESIONES;
const EJERCICIOS = desdeApp ? desdeApp.exercises : vigente.EJERCICIOS;
const FUENTE = desdeApp ? "la app" : "el .mjs";
const md = readFileSync(PROGRAMA_MD, "utf8");

const problemas = [];
const avisos = [];

/** Nombre comparable: sin negritas, sin acentos, sin dobles espacios. */
const norm = (s) => String(s || "")
  .replace(/\*\*/g, "").replace(/`/g, "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const num = (s) => {
  const m = String(s || "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/* ============================ parseo del .md ============================ */

const lineas = md.split(/\r?\n/);
const sesionesMd = [];
let actual = null;

for (const linea of lineas) {
  // ### Sesión C — Intensidad & Fuerza · LUNES · RIR 1-2 · 7 ejercicios / 22 series
  const cab = linea.match(/^###\s+Sesi[oó]n\s+([A-Z])\s*—\s*(.+)$/);
  if (cab) {
    const resto = cab[2];
    actual = {
      id: cab[1],
      titulo: resto,
      declaraEjercicios: num((resto.match(/(\d+)\s*ejercicios/) || [])[1]),
      declaraSeries: num((resto.match(/(\d+)\s*series/) || [])[1]),
      filas: [],
    };
    sesionesMd.push(actual);
    continue;
  }
  if (!actual) continue;
  // Filas de la tabla: la primera celda es el numero de orden.
  const fila = linea.match(/^\|\s*(\d+)\s*\|(.+)\|\s*$/);
  if (!fila) continue;
  const celdas = fila[2].split("|").map((c) => c.trim());
  // La columna Tecnica es la ULTIMA, y su posicion cambia entre sesiones: A y B
  // llevan Tempo y C y D no. Por eso se toma desde el final y no por indice.
  actual.filas.push({
    orden: Number(fila[1]), nombre: celdas[0], series: num(celdas[1]), ref: celdas[2], reps: celdas[3],
    tecnica: celdas[celdas.length - 1] || "",
  });
}

/* ============================ el .md contra si mismo ============================ */

console.log("el .md contra si mismo\n");
for (const s of sesionesMd) {
  const reales = s.filas.length;
  const series = s.filas.reduce((n, f) => n + (f.series || 0), 0);
  if (s.declaraEjercicios !== reales) {
    problemas.push(`Sesion ${s.id}: el encabezado dice ${s.declaraEjercicios} ejercicios y la tabla lista ${reales}`);
  }
  if (s.declaraSeries !== series) {
    problemas.push(`Sesion ${s.id}: el encabezado dice ${s.declaraSeries} series y su tabla suma ${series}`);
  }
  console.log(`  ${s.id}: ${reales} ejercicios · ${series} series`);
}

const totalMd = sesionesMd.reduce((n, s) => n + s.filas.reduce((m, f) => m + (f.series || 0), 0), 0);
// "## 5. Volumen — 114 series semanales"
const titular = num((md.match(/##\s*\d+\.\s*Volumen\s*—\s*(\d+)\s*series/) || [])[1]);
if (titular !== null && titular !== totalMd) {
  problemas.push(`El titulo de Volumen dice ${titular} series y las cuatro tablas suman ${totalMd}`);
}
console.log(`  total en tablas: ${totalMd}${titular !== null ? ` · titular: ${titular}` : ""}`);

/* ============================ el .md contra el .mjs ============================ */

console.log("\nel .md contra el .mjs (lo que lee la app)\n");

const idsMd = sesionesMd.map((s) => s.id).sort().join(",");
const idsJs = SESIONES.map((s) => s.id).sort().join(",");
if (idsMd !== idsJs) problemas.push(`sesiones distintas: .md tiene ${idsMd} y ${FUENTE} ${idsJs}`);

for (const s of sesionesMd) {
  const propios = EJERCICIOS.filter((e) => e.session === s.id).sort((a, b) => a.order - b.order);
  if (propios.length !== s.filas.length) {
    problemas.push(`Sesion ${s.id}: ${s.filas.length} ejercicios en el .md y ${propios.length} en ${FUENTE}`);
  }
  const n = Math.min(propios.length, s.filas.length);
  for (let i = 0; i < n; i++) {
    const f = s.filas[i], e = propios[i];
    const donde = `Sesion ${s.id} #${f.orden}`;
    if (norm(f.nombre) !== norm(e.name)) {
      problemas.push(`${donde}: .md "${f.nombre.replace(/\*\*/g, "")}" · .mjs "${e.name}"`);
      continue;   // si no es el mismo ejercicio, comparar sus numeros no dice nada
    }
    if (f.series !== e.sets) problemas.push(`${donde} "${e.name}": ${f.series} series en el .md, ${e.sets} en ${FUENTE}`);

    // Ref: `REVISAR` significa sin numero. "REVISAR (BW)" o "REVISAR (>=30)"
    // llevan una pista y en el .mjs pueden quedar como null o como texto.
    const esRevisar = /REVISAR/i.test(f.ref || "");
    const refMd = esRevisar ? null : num(f.ref);
    const refJs = typeof e.refKg === "number" ? e.refKg : null;
    if (!esRevisar && refMd !== null && refMd !== refJs) {
      problemas.push(`${donde} "${e.name}": ref ${refMd} en el .md, ${JSON.stringify(e.refKg)} en ${FUENTE}`);
    }
    if (esRevisar && refJs !== null) {
      avisos.push(`${donde} "${e.name}": el .md dice REVISAR y el .mjs ya tiene ref ${refJs}`);
    }

    // Tecnicas. Son lo que MENOS se nota que falta: un dropset ausente se ve
    // como un ejercicio normal, y nadie descubre entrenando que le falta la
    // bajada. `DS` y `ISO-EST` conviven en el papel; la app admite una sola,
    // asi que se acepta que lleve cualquiera de las dos prescritas.
    const tecMd = new Set();
    if (/\bDS\b/.test(f.tecnica)) tecMd.add("dropset");
    if (/ISO-EST/i.test(f.tecnica)) tecMd.add("isoest");
    const tecApp = e.technique ? (typeof e.technique === "string" ? e.technique : e.technique.tipo) : null;
    if (tecMd.size && !tecApp) {
      problemas.push(`${donde} "${e.name}": el .md prescribe ${[...tecMd].join(" + ")} y en ${FUENTE} no hay tecnica`);
    } else if (!tecMd.size && tecApp) {
      problemas.push(`${donde} "${e.name}": ${FUENTE} tiene ${tecApp} y el .md no prescribe ninguna`);
    } else if (tecApp && !tecMd.has(tecApp)) {
      problemas.push(`${donde} "${e.name}": el .md prescribe ${[...tecMd].join(" + ")} y ${FUENTE} tiene ${tecApp}`);
    } else if (tecMd.size > 1) {
      avisos.push(`${donde} "${e.name}": el .md prescribe ${[...tecMd].join(" + ")}; la app solo puede llevar una (${tecApp})`);
    }

    // Superserie. En el .md es `SS:<#>` apuntando al ORDEN del par dentro de la
    // sesion; en la app es un id. Se compara contra quien quedo emparejado.
    const ss = f.tecnica.match(/SS:\s*(\d+)/);
    const parApp = e.superset ? propios.find((x) => x.id === e.superset) : null;
    if (ss && !parApp) {
      problemas.push(`${donde} "${e.name}": el .md lo emparejo con el #${ss[1]} y en ${FUENTE} no tiene superserie`);
    } else if (!ss && parApp) {
      problemas.push(`${donde} "${e.name}": ${FUENTE} lo emparejo con "${parApp.name}" y el .md no marca superserie`);
    } else if (ss && parApp && parApp.order !== Number(ss[1])) {
      problemas.push(`${donde} "${e.name}": el .md dice SS:${ss[1]} y en ${FUENTE} el par es el #${parApp.order} ("${parApp.name}")`);
    }

    const r = String(f.reps || "").match(/(\d+)\s*-\s*(\d+)/) || String(f.reps || "").match(/^(\d+)$/);
    if (r) {
      const min = Number(r[1]), max = Number(r[2] ?? r[1]);
      if (min !== e.repsMin || max !== e.repsMax) {
        problemas.push(`${donde} "${e.name}": reps ${min}-${max} en el .md, ${e.repsMin}-${e.repsMax} en ${FUENTE}`);
      }
    }
  }
}

const totalJs = EJERCICIOS.reduce((n, e) => n + e.sets, 0);
if (totalJs !== totalMd) problemas.push(`series totales: ${totalMd} en el .md, ${totalJs} en ${FUENTE}`);
console.log(`  ${EJERCICIOS.length} ejercicios · ${totalJs} series en ${FUENTE}`);

/* ============================ cierre ============================ */

if (avisos.length) {
  console.log(`\navisos (${avisos.length}) — no son errores, pero conviene mirarlos\n`);
  for (const a of avisos) console.log(`  · ${a}`);
}

if (problemas.length) {
  console.error(`\nDISCREPANCIAS: ${problemas.length}\n`);
  for (const p of problemas) console.error(`  - ${p}`);
  console.error("\nManda el .md. Corregir a mano el que este mal — no lo decide un script.");
  process.exit(1);
}
console.log("\nOK  el .md y el .mjs dicen lo mismo, y el .md no se contradice");
