/**
 * Espacio de entrenador del usuario.
 *
 *   GET    /api/coach   espacio + alumnos + invitaciones pendientes
 *   POST   /api/coach   invitar a un alumno (crea el espacio si es el primero)
 *   DELETE /api/coach   dar de baja a un alumno o revocar una invitacion
 *
 * El coach trabaja online: estas rutas leen y escriben directo en la base, sin
 * pasar por el localStorage que usa el atleta para entrenar sin senal.
 */
import { getServerSession } from "@/lib/auth/nextauth-interop";
import { authOptions } from "@/lib/auth/options";
import { getDb } from "@/lib/db.js";
import {
  getCoachDe, contarAlumnos, invitar, listarAlumnos, darDeBaja, revocarInvitacion,
} from "@/lib/repo/coaching.js";
import { enviarInvitacion } from "@/lib/coach/invite-email.js";

async function sesion() {
  const s = await getServerSession(authOptions);
  return s?.user?.id ? s.user : null;
}

async function invitacionesPendientes(coachId) {
  const r = await getDb().execute({
    sql: `SELECT id, email, created_at, expires_at FROM coach_invites
          WHERE coach_id = ? AND status = 'pending' ORDER BY created_at DESC`,
    args: [coachId],
  });
  return r.rows.map((i) => ({ id: i.id, email: i.email, desde: i.created_at, vence: i.expires_at }));
}

export async function GET() {
  const user = await sesion();
  if (!user) return Response.json({ error: "no autenticado" }, { status: 401 });

  const coach = await getCoachDe(user.id);
  // Sin espacio todavia no es un error: es el estado normal de quien nunca
  // invito a nadie. La UI muestra el alta en vez de una lista vacia.
  if (!coach) return Response.json({ coach: null, alumnos: [], invitaciones: [] });

  const [alumnos, invitaciones, usados] = await Promise.all([
    listarAlumnos(coach.id),
    invitacionesPendientes(coach.id),
    contarAlumnos(coach.id),
  ]);

  return Response.json({ coach: { ...coach, usados }, alumnos, invitaciones });
}

export async function POST(request) {
  const user = await sesion();
  if (!user) return Response.json({ error: "no autenticado" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "body invalido" }, { status: 400 }); }

  const { email, nombreCoach } = body || {};
  const r = await invitar({ ownerUserId: user.id, email, nombreCoach: nombreCoach || user.name });

  if (!r.ok) {
    const mensajes = {
      "email-invalido": "Ese email no parece válido.",
      "ya-es-alumno": "Esa persona ya es tu alumno.",
      "ya-invitado": "Ya hay una invitación pendiente para ese email.",
      "cupo-lleno": `Llegaste al máximo de ${r.maxAthletes} alumnos. Dá de baja a alguno para liberar lugar.`,
    };
    return Response.json({ error: mensajes[r.motivo] || "No se pudo invitar.", motivo: r.motivo }, { status: 400 });
  }

  const mail = await enviarInvitacion({
    para: r.email,
    token: r.token,
    entrenador: user.name,
    espacio: nombreCoach,
  });

  // La invitacion ya existe aunque el mail falle: se avisa para que el
  // entrenador pueda pasar el link a mano en vez de creer que no se invito.
  return Response.json({ ok: true, email: r.email, mailEnviado: mail.ok, motivoMail: mail.motivo || null });
}

export async function DELETE(request) {
  const user = await sesion();
  if (!user) return Response.json({ error: "no autenticado" }, { status: 401 });

  const coach = await getCoachDe(user.id);
  if (!coach) return Response.json({ error: "no tenés espacio de entrenador" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const alumno = searchParams.get("alumno");
  const invitacion = searchParams.get("invitacion");

  if (alumno) {
    await darDeBaja({ coachId: coach.id, athleteId: alumno });
    return Response.json({ ok: true });
  }
  if (invitacion) {
    const hecho = await revocarInvitacion({ coachId: coach.id, invitacionId: invitacion });
    return Response.json({ ok: hecho });
  }
  return Response.json({ error: "falta alumno o invitacion" }, { status: 400 });
}
