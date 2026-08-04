/**
 * Importa la asistencia mensual desde la planilla original.
 *
 *   node scripts/import-asistencia.mjs <email> <archivo.xlsx>          # informa
 *   node scripts/import-asistencia.mjs <email> <archivo.xlsx> --aplicar
 *
 * Los meses anteriores a la app solo existen en la planilla. Sin ellos el
 * grafico arranca vacio y tarda dos anios en volverse util — justo el periodo
 * con el que hay que comparar.
 *
 * Se marcan con `source = 'import'` para poder distinguirlos despues de lo que
 * cargo una persona a mano y de lo que calculo la app.
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

const [email, archivo] = process.argv.slice(2);
const aplicar = process.argv.includes("--aplicar");
if (!email || !archivo) {
  console.error("uso: node scripts/import-asistencia.mjs <email> <archivo.xlsx> [--aplicar]");
  process.exit(1);
}

const MESES = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, oct: 10, nov: 11, dic: 12, dec: 12 };

/** "Aug-24" / "ago-24" -> "2024-08". Tambien acepta un serial de Excel. */
function aMes(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();

  const m = s.match(/^([A-Za-zÁ-úá-ú]{3})[-/\s]?(\d{2,4})$/);
  if (m) {
    const mes = MESES[m[1].toLowerCase()];
    if (!mes) return null;
    const a = Number(m[2]);
    return `${a < 100 ? 2000 + a : a}-${String(mes).padStart(2, "0")}`;
  }

  // Serial de Excel: dias desde 1899-12-30.
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

const wb = XLSX.read(readFileSync(archivo), { type: "buffer" });
const hoja = wb.SheetNames.find((n) => n.toLowerCase().includes("asistencia"));
if (!hoja) { console.error(`El archivo no tiene una hoja de asistencia. Hojas: ${wb.SheetNames.join(", ")}`); process.exit(1); }

const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: "", raw: false });

const meses = [];
for (const f of filas) {
  const mes = aMes(f[0]);
  const dias = parseInt(f[1], 10);
  // "Total" y "Promedio" al pie no son meses: caen solos porque no parsean.
  if (!mes || !Number.isFinite(dias) || dias < 0 || dias > 31) continue;
  meses.push({ mes, dias });
}

if (!meses.length) { console.error("No se reconocio ningun mes en la hoja."); process.exit(1); }

const total = meses.reduce((a, b) => a + b.dias, 0);
console.log(`hoja "${hoja}" · ${meses.length} meses · ${total} dias · promedio ${Math.round((total / meses.length) * 100) / 100}`);
console.log(`  desde ${meses[0].mes} hasta ${meses[meses.length - 1].mes}`);

if (!aplicar) {
  for (const m of meses) console.log(`  ${m.mes}  ${String(m.dias).padStart(2)} dias`);
  console.log("\nNada escrito. Correr con --aplicar.");
  process.exit(0);
}

const { findByEmail } = await import("../lib/repo/users.js");
const { guardar, mapa } = await import("../lib/repo/asistencia.js");

const u = await findByEmail(email);
if (!u) { console.error(`No existe una cuenta con el email ${email}`); process.exit(1); }

const antes = await mapa(u.id);
let nuevos = 0, pisados = 0;
for (const m of meses) {
  const r = await guardar({ athleteId: u.id, mes: m.mes, dias: m.dias, origen: "import" });
  if (!r.ok) { console.error(`  ! ${m.mes}: ${r.motivo}`); continue; }
  if (m.mes in antes) pisados++; else nuevos++;
}

console.log(`\n${nuevos} mes(es) nuevo(s), ${pisados} actualizado(s), en la cuenta de ${u.displayName || u.email}.`);
