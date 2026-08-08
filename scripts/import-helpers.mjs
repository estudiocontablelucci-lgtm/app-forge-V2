/**
 * Los helpers de import REALES de `ForgeApp.jsx`, sin React.
 *
 * Se extraen del fuente en vez de copiarse: una copia se desincroniza y el test
 * pasa verificando codigo que ya no es el que corre. El bloque es codigo puro,
 * asi que se evalua tal cual y se le inyectan sus dependencias.
 *
 * LAS DEPENDENCIAS SE INYECTAN TODAS, incluidas las que hoy no se usarian.
 * `parseExcelData` llama a `normalizarTecnica` y `tecnicaPorAlias` solo cuando
 * el archivo trae columna Tecnica; sin inyectarlas, un .xlsx sin esa columna
 * pasaba por el corto-circuito y el test daba verde, y el primero que la
 * trajera reventaba con "normalizarTecnica is not defined" — en el generador,
 * no en el test que existe para atajar esto.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { normalizar as normalizarTecnica, porAlias as tecnicaPorAlias } from "../lib/tecnicas.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function cargarHelpers() {
  const src = readFileSync(resolve(root, "components/ForgeApp.jsx"), "utf8");
  const from = src.indexOf("/* ---------- Excel import helpers ---------- */");
  const to = src.indexOf("function ImportWizard");
  if (from === -1 || to === -1) throw new Error("No se encontro el bloque de helpers de import en ForgeApp.jsx");
  return new Function(
    "XLSX", "uid", "normalizarTecnica", "tecnicaPorAlias",
    `${src.slice(from, to)}; return { matchColumn, parseExcelData };`,
  )(XLSX, () => Math.random().toString(36).slice(2, 9), normalizarTecnica, tecnicaPorAlias);
}

/** El auto-mapeo que hace el wizard al soltar el archivo. */
export function mapear(helpers, rows) {
  const mapping = {};
  for (const h of Object.keys(rows[0])) {
    const field = helpers.matchColumn(h);
    if (field && !(field in mapping)) mapping[field] = h;
  }
  return mapping;
}

/** Las filas de un .xlsx, como las ve el wizard. */
export function filasDe(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}
