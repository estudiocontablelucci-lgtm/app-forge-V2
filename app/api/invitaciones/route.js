/**
 * Invitaciones dirigidas al usuario que esta logueado.
 *
 *   GET  /api/invitaciones   las que estan pendientes para su email
 *   POST /api/invitaciones   aceptar una (body: { token })
 *
 * Aceptar registra el consentimiento de datos de salud en el mismo movimiento:
 * desde ahi el entrenador ve notas y lesiones, que son dato sensible.
 */
import { getServerSession } from "@/lib/auth/nextauth-interop";
import { authOptions } from "@/lib/auth/options";
import { invitacionesPara, aceptarInvitacion } from "@/lib/repo/coaching.js";

async function sesion() {
  const s = await getServerSession(authOptions);
  return s?.user?.id ? s.user : null;
}

export async function GET() {
  const user = await sesion();
  if (!user) return Response.json({ error: "no autenticado" }, { status: 401 });
  return Response.json({ invitaciones: await invitacionesPara(user.email) });
}

export async function POST(request) {
  const user = await sesion();
  if (!user) return Response.json({ error: "no autenticado" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "body invalido" }, { status: 400 }); }
  if (!body?.token) return Response.json({ error: "falta el token" }, { status: 400 });

  const r = await aceptarInvitacion({ token: body.token, userId: user.id, email: user.email });
  if (!r.ok) {
    const mensajes = {
      "no-existe": "Esa invitación no existe.",
      "ya-usada": "Esa invitación ya fue usada.",
      vencida: "La invitación venció. Pedile a tu entrenador que te mande una nueva.",
      "otro-email": "Esa invitación es para otra dirección de correo.",
    };
    return Response.json({ error: mensajes[r.motivo] || "No se pudo aceptar.", motivo: r.motivo }, { status: 400 });
  }
  return Response.json({ ok: true, coachId: r.coachId });
}
