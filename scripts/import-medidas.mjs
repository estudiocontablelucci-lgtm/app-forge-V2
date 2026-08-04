/**
 * Importa las medidas corporales desde la planilla original.
 *
 *   node scripts/import-medidas.mjs <email> <archivo.xlsx> [--altura 174]
 *   node scripts/import-medidas.mjs <email> <archivo.xlsx> --altura 174 --aplicar
 *
 * La altura no esta en la planilla como columna: se deduce de sus propias
 * derivadas (IMC y cintura/altura). Si las dos coinciden, se usa; si no, hay
 * que pasarla con --altura, porque sin ella no hay IMC ni FFMI.
 *
 * Solo se importan las columnas MEDIDAS. Las derivadas de la planilla (IMC,
 * FFMI, deltas) no se copian: las calcula `lib/medidas.js` y guardar las dos
 * seria tener el mismo numero en dos lados esperando a que discrepen.
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

const args = process.argv.slice(2);
const [email, archivo] = args.filter((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--altura");
const aplicar = args.includes("--aplicar");
const alturaArg = args.includes("--altura") ? parseFloat(args[args.indexOf("--altura") + 1]) : null;

if (!email || !archivo) {
  console.error("uso: node scripts/import-medidas.mjs <email> <archivo.xlsx> [--altura 174] [--aplicar]");
  process.exit(1);
}

/** Columna de la planilla -> campo de `lib/medidas.js`. */
const MAPA = {
  "Peso (kg)": "peso",
  "% Grasa corporal": "grasaPct",
  "Masa grasa (kg)": "masaGrasa",
  "Masa muscular esquelética (kg)": "masaMuscular",
  "Agua corporal total (kg)": "agua",
  "BMR (kcal)": "bmr",
  "Cuello": "cuello",
  "Pecho": "pecho",
  "Cintura (ombligo)": "cintura",
  "Cadera": "cadera",
  "Brazo D relajado": "brazoDRelajado",
  "Brazo D contraído": "brazoDContraido",
  "Brazo I relajado": "brazoIRelajado",
  "Brazo I contraído": "brazoIContraido",
  "Antebrazo D": "antebrazoD",
  "Antebrazo I": "antebrazoI",
  "Muslo D": "musloD",
  "Muslo I": "musloI",
  "Pantorrilla D": "pantorrillaD",
  "Pantorrilla I": "pantorrillaI",
  "Muñeca (cm)": "muneca",
  "Tobillo (cm)": "tobillo",
  "Hombros biacromial (cm)": "hombrosBiacromial",
  "Hombros circunferencia (cm)": "hombrosCircunf",
};

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  const pct = s.endsWith("%");
  const n = parseFloat((pct ? s.slice(0, -1) : s).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** "29/5/2026" o "06/07/2026" -> "2026-05-29". Dia primero, como en es-AR. */
function aFecha(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = String(v || "").trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// `cellDates` + valores CRUDOS: con los formateados, `0.4770114943` llega
// redondeado a `0.48` y la altura deducida sale 173 en vez de 174.
const wb = XLSX.read(readFileSync(archivo), { type: "buffer", cellDates: true });
const hoja = wb.SheetNames.find((n) => n.toLowerCase().includes("medidas"));
if (!hoja) { console.error(`No hay hoja de medidas. Hojas: ${wb.SheetNames.join(", ")}`); process.exit(1); }

const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: "", raw: true });
const cab = filas.findIndex((f) => String(f[0]).trim().toLowerCase().startsWith("fecha"));
if (cab === -1) { console.error("No encontre la fila de encabezados (la que empieza con 'Fecha')."); process.exit(1); }

const cols = filas[cab].map((c) => String(c).trim());
const idx = {};
for (const [titulo, campo] of Object.entries(MAPA)) {
  const i = cols.indexOf(titulo);
  if (i >= 0) idx[campo] = i;
}
const iNota = cols.indexOf("Notas");
const iIMC = cols.indexOf("IMC");
const iCA = cols.indexOf("Cintura/altura");

console.log(`hoja "${hoja}" · ${Object.keys(idx).length} de ${Object.keys(MAPA).length} columnas reconocidas`);

const tomas = [];
for (let i = cab + 1; i < filas.length; i++) {
  const f = filas[i];
  const fecha = aFecha(f[0]);
  if (!fecha) continue;

  const valores = {};
  for (const [campo, j] of Object.entries(idx)) {
    let v = num(f[j]);
    if (v === null) continue;
    // Una celda con formato de porcentaje llega como fraccion (0.126). Nadie
    // tiene 0.126% de grasa corporal ni 12600%: el umbral es inequivoco.
    if (campo === "grasaPct" && v > 0 && v < 1) v = Math.round(v * 1000) / 10;
    valores[campo] = v;
  }
  if (!Object.keys(valores).length) continue;

  // La altura sale de las derivadas de la propia planilla. Dos caminos
  // independientes: si coinciden, el numero es confiable.
  let altura = alturaArg;
  if (!altura) {
    const imc = num(f[iIMC]), ca = num(f[iCA]);
    const porImc = imc && valores.peso ? Math.sqrt(valores.peso / imc) * 100 : null;
    const porCA = ca && valores.cintura ? valores.cintura / ca : null;
    if (porImc && porCA && Math.abs(porImc - porCA) < 1.5) altura = Math.round((porImc + porCA) / 2);
    else altura = porImc ? Math.round(porImc) : porCA ? Math.round(porCA) : null;
  }
  if (altura) valores.altura = altura;

  tomas.push({ fecha, valores, nota: (String(f[iNota] || "").trim() || null) });
}

if (!tomas.length) { console.error("No se reconocio ninguna toma."); process.exit(1); }

const { derivadas } = await import("../lib/medidas.js");
for (const t of tomas) {
  const d = derivadas(t.valores);
  console.log(`\n  ${t.fecha} · ${Object.keys(t.valores).length} datos${t.nota ? ` · ${t.nota}` : ""}`);
  console.log(`     peso ${t.valores.peso ?? "—"} · altura ${t.valores.altura ?? "FALTA"} · IMC ${d.imc ?? "—"} · FFMI ${d.ffmi ?? "—"}`);
}

if (!tomas.some((t) => t.valores.altura)) {
  console.error("\nNo pude deducir la altura. Pasala con --altura <cm>: sin ella no hay IMC ni FFMI.");
  process.exit(1);
}

if (!aplicar) { console.log("\nNada escrito. Correr con --aplicar."); process.exit(0); }

const { findByEmail } = await import("../lib/repo/users.js");
const { guardar, listar } = await import("../lib/repo/medidas.js");

const u = await findByEmail(email);
if (!u) { console.error(`No existe una cuenta con el email ${email}`); process.exit(1); }

const antes = new Set((await listar(u.id)).map((t) => t.fecha));
let nuevas = 0, pisadas = 0;
for (const t of tomas) {
  await guardar({ athleteId: u.id, fecha: t.fecha, valores: t.valores, nota: t.nota });
  if (antes.has(t.fecha)) pisadas++; else nuevas++;
}

console.log(`\n${nuevas} toma(s) nueva(s), ${pisadas} actualizada(s), en la cuenta de ${u.displayName || u.email}.`);
