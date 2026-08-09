/**
 * Donde viven los datos del atleta, que NO es este repo.
 *
 * Este repo es PUBLICO. El programa vigente lleva refs, restricciones medicas y
 * notas de lesion: dato sensible bajo la Ley 25.326. Un `.gitignore` es una
 * convencion, no una proteccion — un `git add -f` distraido publica para
 * siempre. Asi que el repo guarda la RUTA y nunca el contenido.
 *
 * Mismo patron que `Ecosistema/certificaciones-ingresos`: codigo versionado
 * aca, datos del titular en la carpeta personal. Y la ruta va ESCRITA, nunca
 * derivada de `__dirname` — derivarla de donde esta el script es lo que rompio
 * aquel proyecto al sacarlo de OneDrive.
 *
 * Si alguna vez cambia de lugar, se cambia aca y en ningun otro archivo.
 */
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const CARPETA_SALUD =
  "C:/Users/agust/OneDrive/Documentos/Organizacion Personal/Salud/Sistema cronobiologico/Claude";

export const PROGRAMA_VIGENTE = `${CARPETA_SALUD}/programa/programa-vigente.mjs`;

/**
 * Importa el programa vigente, o explica que falta.
 *
 * El mensaje importa: sin el, un `ERR_MODULE_NOT_FOUND` con una ruta de
 * OneDrive parece un bug del repo y no un archivo que no esta donde se cree.
 */
export async function cargarProgramaVigente() {
  if (!existsSync(PROGRAMA_VIGENTE)) {
    throw new Error(
      `No esta el programa vigente en:\n  ${PROGRAMA_VIGENTE}\n\n` +
      "Es la transcripcion de `programa/programa-vigente.md` a la forma que lee la app.\n" +
      "Vive afuera del repo a proposito (ver el encabezado de scripts/rutas.mjs).\n" +
      "Si la carpeta de Salud se movio, la ruta se corrige en scripts/rutas.mjs."
    );
  }
  return import(pathToFileURL(PROGRAMA_VIGENTE).href);
}
