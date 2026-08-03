/**
 * Cliente de sincronizacion. Todo lo que llama a /api/sync pasa por aca.
 *
 * Ninguna de estas funciones tira excepcion: la sincronizacion es un extra
 * sobre una app que funciona offline. Si falla la red en el gimnasio, el
 * entrenamiento se registro igual en localStorage y no tiene que romperse
 * nada en pantalla — devuelven `{ ok: false, motivo }` y el que llama decide.
 */

export async function pushSession({ program, entry, catalog }) {
  try {
    const r = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ program, entry, catalog }),
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
export async function pushProgram(program, catalog) {
  try {
    const r = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ program, catalog }),
    });
    if (r.status === 401) return { ok: false, motivo: "sin-sesion" };
    if (!r.ok) return { ok: false, motivo: `http-${r.status}` };
    return { ok: true };
  } catch {
    return { ok: false, motivo: "sin-red" };
  }
}

/** Avisa al servidor que estos programas se borraron. */
export async function pushBorrados(ids) {
  if (!ids?.length) return { ok: true };
  try {
    const r = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ borrados: ids }),
    });
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
 * Catalogo: se agrega lo que falta y se corrigen los nombres de lo propio.
 *
 * No se borra nada de lo local. Un ejercicio que se cargo en este dispositivo y
 * todavia no subio no puede desaparecer porque el servidor no lo conozca — es
 * exactamente el caso de haberlo creado sin señal en el gimnasio.
 */
export function mergeCatalog(local, remoto) {
  const porId = new Map((local || []).map((c) => [c.id, c]));
  for (const r of remoto || []) {
    const actual = porId.get(r.id);
    // El nombre del servidor gana: corregirlo en un lugar tiene que propagarse.
    // Las entradas base no se tocan, son de solo lectura.
    if (!actual || !actual.base) porId.set(r.id, { ...actual, ...r });
  }
  return [...porId.values()];
}

/** Fecha de edicion comparable. El cliente usa ms y el servidor ISO. */
const editadoEn = (p) => {
  const v = p?.updatedAt ?? p?.createdAt ?? 0;
  const t = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) ? t : 0;
};

/**
 * Programas: gana el mas nuevo, con dos excepciones que importan.
 *
 * Un programa ASIGNADO se reemplaza siempre. El alumno no puede haberlo tocado,
 * asi que no hay nada que proteger, y no reemplazarlo significaba que una
 * correccion del entrenador no llegaba nunca al telefono.
 *
 * Un programa PROPIO se resuelve por fecha de edicion. Antes lo local ganaba
 * siempre, para no pisar algo que el usuario pudiera estar editando durante el
 * pull. Esa proteccion sigue —lo que se acaba de tocar es siempre lo mas
 * nuevo— pero la regla absoluta tenia un costo peor que el problema: el
 * dispositivo desactualizado no solo se perdia el cambio, ademas volvia a subir
 * su copia vieja y lo DESHACIA en el servidor. Borrar un ejercicio en el celular
 * y sincronizar desde la compu lo hacia reaparecer.
 *
 * `borrados` son los programas que se eliminaron en este dispositivo y todavia
 * no se subieron: no pueden volver a entrar por el pull.
 */
export function mergePrograms(local, remoto, borrados = {}) {
  const porId = new Map(local.map((p) => [p.id, p]));
  for (const r of remoto) {
    if (borrados[r.id]) continue;
    const actual = porId.get(r.id);
    if (!actual || actual.readOnly || r.readOnly) { porId.set(r.id, r); continue; }
    if (editadoEn(r) > editadoEn(actual)) porId.set(r.id, r);
  }
  return [...porId.values()];
}

/**
 * Lapidas de borrado que ya se aplicaron del otro lado.
 *
 * Se sueltan cuando el servidor deja de devolver ese programa: a partir de ahi
 * la lapida no cumple ninguna funcion y guardarla para siempre haria que el
 * localStorage crezca sin techo.
 */
export function limpiarBorrados(borrados, remoto) {
  const vivos = new Set((remoto || []).map((p) => p.id));
  return Object.fromEntries(Object.entries(borrados || {}).filter(([id]) => vivos.has(id)));
}
