/**
 * Medidas corporales del usuario.
 *
 *   GET    /api/medidas              las tomas propias
 *   GET    /api/medidas?alumno=ID    las de un alumno (solo su entrenador)
 *   POST   /api/medidas              alta o correccion de una toma
 *   DELETE /api/medidas?id=ID        baja de una toma propia
 *
 * Van directo contra el servidor y no por `/api/sync`: no se registran en el
 * gimnasio sin señal, se cargan sentado despues de medirse, y el entrenador
 * tiene que poder verlas sin que el alumno abra la app.
 */
import { getServerSession } from "@/lib/auth/nextauth-interop";
import { authOptions } from "@/lib/auth/options";
import { getCoachDe, puedeVer } from "@/lib/repo/coaching.js";
import { listar, guardar, borrar } from "@/lib/repo/medidas.js";

async function sesion() {
  const s = await getServerSession(authOptions);
  return s?.user?.id ? s.user : null;
}

export async function GET(request) {
  const user = await sesion();
  if (!user) return Response.json({ error: "no autenticado" }, { status: 401 });

  const alumno = new URL(request.url).searchParams.get("alumno");
  if (alumno && alumno !== user.id) {
    // Son datos de salud de otra persona: se comprueba el vinculo vigente, no
    // alcanza con conocer el id.
    const coach = await getCoachDe(user.id);
    if (!coach || !(await puedeVer({ coachId: coach.id, athleteId: alumno }))) {
      return Response.json({ error: "no es tu alumno" }, { status: 403 });
    }
    return Response.json({ medidas: await listar(alumno) });
  }

  return Response.json({ medidas: await listar(user.id) });
}

export async function POST(request) {
  const user = await sesion();
  if (!user) return Response.json({ error: "no autenticado" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "body invalido" }, { status: 400 }); }
  const { fecha, valores, nota } = body || {};
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
    return Response.json({ error: "falta la fecha (AAAA-MM-DD)" }, { status: 400 });
  }
  if (!valores || !Object.keys(valores).length) {
    return Response.json({ error: "no hay ninguna medida cargada" }, { status: 400 });
  }

  // Siempre sobre uno mismo: un entrenador no carga las medidas de su alumno,
  // las mide el alumno. Si algun dia hace falta, es una decision aparte.
  const toma = await guardar({ athleteId: user.id, fecha, valores, nota: nota || null });
  return Response.json({ ok: true, toma });
}

export async function DELETE(request) {
  const user = await sesion();
  if (!user) return Response.json({ error: "no autenticado" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "falta el id" }, { status: 400 });

  const ok = await borrar({ athleteId: user.id, id });
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
