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
export function mergeHistory(local, remoto) {
  const clave = (h) => `${h.programId || ""}|${h.week}|${h.session}`;
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
 * Programas: se agregan los que el cliente no tiene. No se pisan los locales,
 * porque el usuario puede estar editando uno mientras corre el pull.
 */
export function mergePrograms(local, remoto) {
  const ids = new Set(local.map((p) => p.id));
  return [...local, ...remoto.filter((p) => !ids.has(p.id))];
}
