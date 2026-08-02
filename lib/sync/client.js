/**
 * Cliente de sincronizacion. Todo lo que llama a /api/sync pasa por aca.
 *
 * Ninguna de estas funciones tira excepcion: la sincronizacion es un extra
 * sobre una app que funciona offline. Si falla la red en el gimnasio, el
 * entrenamiento se registro igual en localStorage y no tiene que romperse
 * nada en pantalla — devuelven `{ ok: false, motivo }` y el que llama decide.
 */

export async function pushSession({ program, entry }) {
  try {
    const r = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ program, entry }),
    });
    if (r.status === 401) return { ok: false, motivo: "sin-sesion" };
    if (!r.ok) return { ok: false, motivo: `http-${r.status}` };
    return { ok: true, data: await r.json() };
  } catch {
    return { ok: false, motivo: "sin-red" };
  }
}

/**
 * Sube un programa sin sesion. Sirve para que uno recien creado exista del lado
 * del servidor y se pueda asignar a un alumno antes de haberlo entrenado.
 */
export async function pushProgram(program) {
  try {
    const r = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ program }),
    });
    if (r.status === 401) return { ok: false, motivo: "sin-sesion" };
    if (!r.ok) return { ok: false, motivo: `http-${r.status}` };
    return { ok: true };
  } catch {
    return { ok: false, motivo: "sin-red" };
  }
}

/** Marca el programa como propio o para alumnos. Vive en el servidor. */
export async function marcarParaAlumnos(programa, paraAlumnos) {
  try {
    const r = await fetch("/api/coach/programa", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programa, paraAlumnos }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: d.error || `http-${r.status}` };
    return { ok: true };
  } catch {
    return { ok: false, error: "Sin conexión: se guardó local, sincronizá para que valga." };
  }
}

export async function pullAll() {
  try {
    const r = await fetch("/api/sync");
    if (r.status === 401) return { ok: false, motivo: "sin-sesion" };
    if (!r.ok) return { ok: false, motivo: `http-${r.status}` };
    return { ok: true, data: await r.json() };
  } catch {
    return { ok: false, motivo: "sin-red" };
  }
}

/**
 * Une el historial remoto con el local sin pisar nada local.
 *
 * Clave de identidad: programa + semana + sesion, que es la misma que usa la
 * app para reemplazar una sesion reentrenada. Ante la misma clave gana el mas
 * reciente por `date` — si entrenaste en el celu y la compu tenia una version
 * vieja de esa sesion, queda la del celu.
 */
/** Identidad de una sesion: la misma que usa la app para reemplazar al reentrenar. */
export const claveSesion = (h) => `${h.programId || ""}|${h.week}|${h.session}`;

/**
 * Sesiones que estan en el telefono y todavia no en la nube.
 *
 * Es el caso del gimnasio sin senal: al terminar de entrenar el push fallo y la
 * sesion quedo solo local. Sin esto habria que volver a registrarla a mano.
 */
export function sesionesPendientes(local, remoto) {
  const enLaNube = new Set(remoto.map(claveSesion));
  return local.filter((h) => !enLaNube.has(claveSesion(h)));
}

export function mergeHistory(local, remoto) {
  const clave = claveSesion;
  const out = new Map();
  for (const h of local) out.set(clave(h), h);
  for (const h of remoto) {
    const k = clave(h);
    const actual = out.get(k);
    if (!actual || (h.date || 0) > (actual.date || 0)) out.set(k, h);
  }
  return [...out.values()].sort((a, b) => (b.date || 0) - (a.date || 0));
}

/**
 * Reconstruye el hash `logs` a partir del historial que vino del servidor.
 *
 * Hace falta porque `history` y `logs` guardan lo mismo con dos propositos
 * distintos: `history` es la sesion cerrada (para el Historial y el export) y
 * `logs` es el registro serie por serie del que dependen el semaforo, la
 * referencia de la semana anterior y toda la pantalla de Progreso. Sin esto, un
 * dispositivo nuevo baja el historial y aun asi ve todo en cero.
 *
 * Los valores van como string a proposito: es lo que produce el input y lo que
 * el resto del componente espera encontrar.
 */
export function logsFromHistory(entries) {
  const out = {};
  const txt = (v) => (v === null || v === undefined ? "" : String(v));
  for (const h of entries) {
    for (const ex of h.exercises || []) {
      for (const s of ex.sets || []) {
        out[`${h.week}|${ex.id}|${s.setN}`] = {
          kg: txt(s.kg), reps: txt(s.reps), rir: txt(s.rir), done: true,
        };
      }
    }
  }
  return out;
}

/**
 * Programas: se agregan los que el cliente no tiene y se REEMPLAZAN los que
 * prescribio un entrenador.
 *
 * La distincion es la que faltaba. Un programa propio no se pisa nunca, porque
 * el usuario puede estar editandolo mientras corre el pull y lo suyo gana. Pero
 * uno asignado es `readOnly`: el alumno no puede haberlo tocado, asi que no hay
 * nada que proteger — y no reemplazarlo significaba que una correccion del
 * entrenador no llegaba NUNCA al telefono del alumno. El coach veia su cambio
 * hecho y el alumno seguia entrenando la version vieja, los dos convencidos de
 * estar mirando lo mismo.
 *
 * Es tambien lo que hace viajar los borrados: un ejercicio que el entrenador
 * saco desaparece porque llega el programa entero, no un delta.
 */
export function mergePrograms(local, remoto) {
  const porId = new Map(local.map((p) => [p.id, p]));
  for (const r of remoto) {
    const actual = porId.get(r.id);
    if (!actual || actual.readOnly || r.readOnly) porId.set(r.id, r);
  }
  return [...porId.values()];
}
