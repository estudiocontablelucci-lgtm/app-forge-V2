/**
 * Genera el .xlsx del programa vigente con el formato exacto de la plantilla de
 * import de FORGE, para cargarlo en un navegador que ya tiene localStorage
 * (donde el SEED no se aplica: `migrateState` conserva lo que ya estaba).
 *
 *   npm run gen:programa
 *
 * El programa NO vive en este repo — este repo es publico y ahi hay refs y
 * notas medicas. Se lee de la carpeta de Salud; la ruta esta en `rutas.mjs` y en
 * ningun otro lado. Ver el encabezado de ese archivo.
 *
 * Salida: `data/` (gitignored).
 *
 * ============================ POR QUE VALIDA ============================
 *
 * Porque el archivo de entrada es una TRANSCRIPCION a mano de un `.md`, y los
 * errores de transcripcion son silenciosos: una superserie que apunta a un id
 * que no existe entra al Excel como celda vacia, y el wizard importa un
 * programa que se ve bien y ejecuta otra cosa. Todo lo que se puede comprobar
 * contra si mismo se comprueba antes de escribir nada.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { cargarProgramaVigente, PROGRAMA_VIGENTE } from "./rutas.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { SESIONES, EJERCICIOS, CICLO } = await cargarProgramaVigente();
const { TECNICAS, normalizar } = await import("../lib/tecnicas.js");

const byId = new Map(EJERCICIOS.map((e) => [e.id, e]));

/* ============================ validacion ============================ */

const errores = [];
const ids = new Set();
const sesionesValidas = new Set(SESIONES.map((s) => s.id));

for (const e of EJERCICIOS) {
  const donde = `${e.session}${e.order} "${e.name}"`;
  if (ids.has(e.id)) errores.push(`${donde}: id repetido "${e.id}"`);
  ids.add(e.id);
  if (!sesionesValidas.has(e.session)) errores.push(`${donde}: sesion "${e.session}" no esta en SESIONES`);
  if (!(e.sets > 0)) errores.push(`${donde}: series invalidas (${e.sets})`);
  if (e.repsMin > e.repsMax) errores.push(`${donde}: reps ${e.repsMin}-${e.repsMax} al reves`);
  if (!(e.rest >= 0)) errores.push(`${donde}: descanso invalido (${e.rest})`);

  // La superserie tiene que ser MUTUA y dentro de la misma sesion. El wizard la
  // resuelve por nombre: una que apunte afuera se pierde sin avisar.
  if (e.superset) {
    const par = byId.get(e.superset);
    if (!par) errores.push(`${donde}: superserie con "${e.superset}", que no existe`);
    else if (par.session !== e.session) errores.push(`${donde}: superserie con ${par.session}${par.order}, otra sesion`);
    else if (par.superset !== e.id) errores.push(`${donde}: superserie con ${par.session}${par.order}, que NO le devuelve el par`);
  }

  // Una tecnica que no normaliza entra al Excel y despues al programa como
  // nada: el ejercicio se dibuja normal y nadie se entera de que falta.
  if (e.technique) {
    const n = normalizar(e.technique);
    if (!n) errores.push(`${donde}: tecnica "${e.technique.tipo}" no existe en lib/tecnicas.js`);
    else if (n.pasos !== e.technique.pasos) errores.push(`${donde}: tecnica con ${e.technique.pasos} escalones, la app la deja en ${n.pasos}`);
  }
}

for (const s of SESIONES) {
  const propios = EJERCICIOS.filter((e) => e.session === s.id).map((e) => e.order).sort((a, b) => a - b);
  const esperado = propios.map((_, i) => i + 1);
  if (propios.join(",") !== esperado.join(",")) errores.push(`Sesion ${s.id}: ordenes ${propios.join(",")}, esperaba 1..${propios.length}`);
}

if (errores.length) {
  console.error(`FALLO  ${errores.length} problema(s) en ${PROGRAMA_VIGENTE}\n`);
  for (const x of errores) console.error(`  - ${x}`);
  process.exit(1);
}

/* ============================ el .xlsx ============================ */

const HEADER = ["Sesion", "Orden", "Ejercicio", "Grupo muscular", "Series", "Reps min", "Reps max", "Ref KG", "Tempo", "Descanso", "RIR", "Superserie", "Tecnica", "Unidad", "Descripcion"];

const rows = [...EJERCICIOS]
  .sort((a, b) => (a.session < b.session ? -1 : a.session > b.session ? 1 : a.order - b.order))
  .map((e) => [
    e.session,
    e.order,
    e.name,
    e.group,
    e.sets,
    e.repsMin,
    e.repsMax,
    e.refKg ?? "",
    e.tempo,
    e.rest,
    e.rir,
    // El wizard resuelve la superserie por NOMBRE dentro de la sesion, no por id.
    e.superset ? (byId.get(e.superset)?.name ?? "") : "",
    // La abreviatura, que es uno de los alias que reconoce `porAlias`.
    e.technique ? TECNICAS[e.technique.tipo].abrev : "",
    e.unit,
    e.description,
  ]);

const ws = XLSX.utils.aoa_to_sheet([HEADER, ...rows]);
ws["!cols"] = [{ wch: 8 }, { wch: 6 }, { wch: 34 }, { wch: 14 }, { wch: 7 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 30 }, { wch: 9 }, { wch: 8 }, { wch: 70 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Programa");

mkdirSync(resolve(root, "data"), { recursive: true });
const out = resolve(root, "data/forge-programa-vigente.xlsx");
XLSX.writeFile(wb, out);

/* ============================ round-trip ============================ */

/*
 * Generar el archivo no es la mitad del trabajo: lo que importa es que el
 * wizard lea de vuelta lo mismo que se escribio. Se relee EL ARCHIVO QUE SE
 * ACABA DE ESCRIBIR con los helpers de import reales de `ForgeApp.jsx`, no con
 * una copia. Sin esto, una columna que el auto-mapeo no reconoce se pierde en
 * silencio y el programa importado se ve bien: las tecnicas y las superseries
 * son justamente lo que no se nota que falta hasta estar en el gimnasio.
 */
const { cargarHelpers, mapear, filasDe } = await import("./import-helpers.mjs");
const helpers = cargarHelpers();
const leidas = filasDe(readFileSync(out));
const mapping = mapear(helpers, leidas);

const sinMapear = HEADER.filter((h) => !Object.values(mapping).includes(h));
const { exercises: vuelta, sessions: sesionesVuelta } = helpers.parseExcelData(leidas, mapping);
const porNombre = new Map(vuelta.map((e) => [`${e.session}|${e.name}`, e]));
const idsVuelta = new Map(vuelta.map((e) => [e.id, e]));

const perdidas = [];
if (sinMapear.length) perdidas.push(`columnas que el wizard NO reconoce: ${sinMapear.join(", ")}`);
if (sesionesVuelta.length !== SESIONES.length) perdidas.push(`volvieron ${sesionesVuelta.length} sesiones de ${SESIONES.length}`);

const CAMPOS = ["session", "order", "name", "group", "sets", "refKg", "repsMin", "repsMax", "tempo", "rest", "rir", "unit", "description"];
for (const e of EJERCICIOS) {
  const v = porNombre.get(`${e.session}|${e.name}`);
  if (!v) { perdidas.push(`${e.session}${e.order} "${e.name}": no volvio del import`); continue; }
  for (const c of CAMPOS) {
    if (String(e[c] ?? "") !== String(v[c] ?? "")) perdidas.push(`${e.session}${e.order} · ${c}: escribi ${JSON.stringify(e[c])}, volvio ${JSON.stringify(v[c])}`);
  }
  // La superserie viaja por NOMBRE y se re-resuelve a un id nuevo del lado del
  // wizard: se compara con quien quedo emparejado, no el id.
  const esperado = e.superset ? byId.get(e.superset).name : null;
  const volvio = v.superset ? (idsVuelta.get(v.superset)?.name ?? "(id que no existe)") : null;
  if (esperado !== volvio) perdidas.push(`${e.session}${e.order} · superserie: escribi ${JSON.stringify(esperado)}, volvio ${JSON.stringify(volvio)}`);
  // La tecnica entra por alias: lo que no se reconoce entra como nada.
  const tEsp = e.technique?.tipo ?? null;
  const tVol = v.technique?.tipo ?? null;
  if (tEsp !== tVol) perdidas.push(`${e.session}${e.order} · tecnica: escribi ${JSON.stringify(tEsp)}, volvio ${JSON.stringify(tVol)}`);
  // `tEsp && tVol`, no solo `tEsp`: si la tecnica se perdio en el viaje ya hay
  // una diferencia anotada arriba, y seguir hasta `v.technique.pasos` revienta
  // con un TypeError. Un verificador que crashea en vez de reportar obliga a
  // leer un stack trace para enterarse de algo que ya sabia decir con palabras.
  if (tEsp && tVol && v.technique.pasos !== e.technique.pasos) perdidas.push(`${e.session}${e.order} · tecnica: ${e.technique.pasos} escalones, volvio con ${v.technique.pasos}`);
}

if (perdidas.length) {
  console.error(`FALLO  el .xlsx no sobrevive el round-trip por el wizard — ${perdidas.length} diferencia(s)\n`);
  for (const x of perdidas) console.error(`  - ${x}`);
  process.exit(1);
}

/* ============================ el resumen ============================ */

const total = EJERCICIOS.reduce((n, e) => n + e.sets, 0);
const porSesion = SESIONES.map((s) => {
  const propios = EJERCICIOS.filter((e) => e.session === s.id);
  return `${s.id} ${propios.length} ej / ${propios.reduce((n, e) => n + e.sets, 0)} series`;
}).join("  ·  ");

const porGrupo = {};
for (const e of EJERCICIOS) porGrupo[e.group] = (porGrupo[e.group] || 0) + e.sets;

const revisar = EJERCICIOS.filter((e) => e.refKg === null);
const conTecnica = EJERCICIOS.filter((e) => e.technique);

console.log(`OK  ${out}\n`);
console.log(`    ${EJERCICIOS.length} ejercicios  ·  ${total} series semanales  ·  ciclo de ${CICLO.weeks} semanas${CICLO.hasDeload ? " + deload" : ""}`);
console.log(`    ${porSesion}\n`);
console.log("    series por grupo");
for (const [g, n] of Object.entries(porGrupo).sort((a, b) => b[1] - a[1])) console.log(`      ${String(n).padStart(3)}  ${g}`);
console.log(`\n    superseries: ${EJERCICIOS.filter((e) => e.superset).length / 2} pares`);
console.log(`    tecnicas: ${conTecnica.map((e) => `${e.session}${e.order} ${TECNICAS[e.technique.tipo].abrev}`).join(" · ")}`);
console.log(`    refs en REVISAR: ${revisar.length}  (${revisar.map((e) => `${e.session}${e.order}`).join(" ")})`);
