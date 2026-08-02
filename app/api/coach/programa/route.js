/**
 * Para quien es un programa.
 *
 *   PATCH /api/coach/programa   body: { programa, paraAlumnos }
 *
 * Hasta ahora la unica forma de que un programa dejara de estar mezclado con la
 * rutina propia del entrenador era asignarselo a alguien. Eso llega tarde: uno
 * lo escribe para un alumno antes de tener a quien darselo.
 */
import { getServerSession } from "@/lib/auth/nextauth-interop";
import { authOptions } from "@/lib/auth/options";
import { getCoachDe } from "@/lib/repo/coaching.js";
import { marcarParaAlumnos } from "@/lib/repo/programs.js";
import { scope } from "@/lib/sync/ids.js";

export async function PATCH(request) {
  const s = await getServerSession(authOptions);
  if (!s?.user?.id) return Response.json({ error: "no autenticado" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "body invalido" }, { status: 400 }); }
  const { programa, paraAlumnos } = body || {};
  if (!programa) return Response.json({ error: "falta el programa" }, { status: 400 });

  const coach = await getCoachDe(s.user.id);
  if (paraAlumnos && !coach) {
    return Response.json({
      error: "Todavía no tenés espacio de entrenador. Invitá a tu primer alumno y volvé a marcarlo.",
    }, { status: 400 });
  }

  // El cliente manda su id local; en la base estan prefijados.
  const r = await marcarParaAlumnos({
    programId: scope(s.user.id, programa),
    ownerUserId: s.user.id,
    coachId: coach?.id || null,
    para: Boolean(paraAlumnos),
  });

  if (!r.ok) {
    const mensajes = {
      "esta-asignado": "Ese programa lo está entrenando un alumno. Sacáselo primero.",
      "programa-ajeno": "Ese programa no está en el servidor todavía. Sincronizá y probá de nuevo.",
    };
    return Response.json({ error: mensajes[r.motivo] || "No se pudo cambiar." }, { status: 400 });
  }
  return Response.json({ ok: true });
}
