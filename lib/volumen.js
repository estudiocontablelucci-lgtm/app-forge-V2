/**
 * Series semanales por grupo muscular: lo que el programa PIDE y lo que se HIZO.
 *
 * Es la metrica que gobierna la programacion de hipertrofia —MEV/MRV se miden
 * en series semanales por grupo— y el dato estaba entero desde siempre:
 * `lib/catalog.js` guarda el grupo de cada ejercicio y `npm run gen:programa`
 * ya lo imprimia para cruzarlo contra el documento de Salud. **La app no lo
 * mostraba en ningun lado**: vivia en la salida de un script de terminal.
 *
 * Las dos mitades importan y por separado no dicen lo mismo. El PLAN es una
 * propiedad del programa —se lee antes de entrenar, al revisar si un dia quedo
 * flaco de espalda—. El REAL sale de lo que se registro. Y lo que solo se ve
 * teniendo las dos es la DIFERENCIA: un ejercicio que se saltea siempre hace
 * divergir plan y real, y hoy eso no lo ve nadie. Asi se descubrio que el
 * protocolo ASIM-IZQ nunca se habia ejecutado —0 series en 8 sesiones— pero a
 * mano y meses despues.
 */
import { setsFor } from "./formulas.js";
import { hecha } from "./anterior.js";

/** Un ejercicio sin grupo no se descarta: se agrupa aparte y se ve que falta. */
export const SIN_GRUPO = "Sin grupo";

export const grupoDe = (ex) => {
  const g = String(ex?.group ?? "").trim();
  return g || SIN_GRUPO;
};

/**
 * Lo que el programa pide en esa semana, por grupo.
 *
 * Pasa por `setsFor`, asi que el deload cuenta las series REDUCIDAS. Mostrar
 * las de una semana normal ahi diria que se dejo de cumplir el plan justo en
 * la semana en que bajar es el plan.
 *
 * Cuenta el programa ENTERO —todas las sesiones—: la unidad es la semana.
 */
export function planificado(exercises = [], week, deload) {
  const out = {};
  for (const ex of exercises || []) {
    const n = setsFor(ex, week, deload);
    if (!n || n < 1) continue;
    const g = grupoDe(ex);
    out[g] = (out[g] || 0) + n;
  }
  return out;
}

/**
 * Lo que se hizo en esa semana, por grupo.
 *
 * **Una serie cuenta si tiene REPS**, no si esta marcada `done`. En el estado
 * local `done` se pone con `isDone`, que da true con kg O reps — y como el
 * campo de kilos se PRELLENA con la ref al enfocarlo, tocar el input alcanzaria
 * para sumar una serie que no se hizo. El tonelaje no se infla con eso porque
 * ademas exige reps para multiplicar; un conteo de series, si.
 *
 * `buscarEx` resuelve el id contra el programa y contra los RETIRADOS: un
 * ejercicio sustituido salio del programa pero sus series se hicieron igual, y
 * descartarlas bajaria retroactivamente el volumen de una semana ya entrenada.
 * Mismo criterio que `metrics` en ForgeApp.
 *
 * Los escalones de un dropset NO suman: viven dentro de la serie y contarlos
 * aparte romperia el conteo, igual que rompen el e1RM (CONTEXT.md 2026-08-05).
 * Los ejercicios en `pasos` SI cuentan — no dan tonelaje porque no hay kilos
 * que multiplicar, pero son series de trabajo como cualquier otra.
 */
export function real(logs = {}, week, buscarEx = () => null) {
  const out = {};
  for (const [k, l] of Object.entries(logs || {})) {
    const i = k.indexOf("|");
    if (i < 0) continue;
    if (k.slice(0, i) !== String(week)) continue;
    if (!hecha(l)) continue;
    const ex = buscarEx(k.slice(i + 1, k.lastIndexOf("|")));
    if (!ex) continue;
    const g = grupoDe(ex);
    out[g] = (out[g] || 0) + 1;
  }
  return out;
}

/**
 * Las dos mitades juntas, listas para dibujar.
 *
 * Ordena por PLAN descendente y desempata por real: lo primero que se mira es
 * donde esta puesto el volumen. Alfabetico pondria "Abdominales" arriba de
 * "Espalda" en un programa donde uno tiene 2 series y el otro 18.
 *
 * Un grupo con series hechas y CERO planificadas entra igual (queda ultimo):
 * es lo que pasa con un ejercicio retirado del programa, y esconderlo haria
 * que el total de la tabla no cierre con el total de la semana.
 */
export function porGrupo(exercises, logs, week, deload, buscarEx) {
  const plan = planificado(exercises, week, deload);
  const hizo = real(logs, week, buscarEx);
  const grupos = [...new Set([...Object.keys(plan), ...Object.keys(hizo)])];
  return grupos
    .map((grupo) => ({ grupo, plan: plan[grupo] || 0, real: hizo[grupo] || 0 }))
    .sort((a, b) => b.plan - a.plan || b.real - a.real || a.grupo.localeCompare(b.grupo));
}

/** Totales de una lista de `porGrupo`. */
export function totales(filas = []) {
  return filas.reduce((t, f) => ({ plan: t.plan + f.plan, real: t.real + f.real }),
    { plan: 0, real: 0 });
}

/**
 * La semana que conviene mostrar: la ultima CON SERIES REGISTRADAS.
 *
 * No la semana en curso del selector —eso es donde el usuario esta parado
 * mirando, no donde entreno— ni la primera del programa. Si no se registro
 * nada todavia, devuelve null y la pantalla muestra solo el plan.
 *
 * El deload entra normalmente aca: a diferencia de una comparacion de progreso,
 * ver que en la descarga se hicieron 6 series de pecho en vez de 10 es
 * exactamente lo que hay que ver.
 */
export function ultimaSemanaConDatos(logs = {}, weeks = []) {
  const conDatos = new Set();
  for (const [k, l] of Object.entries(logs || {})) {
    const i = k.indexOf("|");
    if (i > 0 && hecha(l)) conDatos.add(k.slice(0, i));
  }
  for (let i = (weeks || []).length - 1; i >= 0; i--) {
    if (conDatos.has(String(weeks[i]))) return weeks[i];
  }
  return null;
}
