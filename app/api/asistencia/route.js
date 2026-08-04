/**
 * Asistencia al gimnasio.
 *
 *   GET    /api/asistencia              meses propios (calculados + cargados)
 *   GET    /api/asistencia?alumno=ID    los de un alumno (solo su entrenador)
 *   POST   /api/asistencia              cargar o corregir un mes
 *   DELETE /api/asistencia?mes=AAAA-MM  volver ese mes al calculo automatico
 *
 * El GET devuelve las dos fuentes por separado ademas de la combinacion, para
 * que la pantalla pueda decir cual mes es dato de la app y cual lo cargo una
 * persona. Un numero sin su procedencia no se puede discutir.
 */
import { getServerSession } from "@/lib/auth/nextauth-interop";
import { authOptions } from "@/lib/auth/options";
import { getCoachDe, puedeVer } from "@/lib/repo/coaching.js";
import { listHistory } from "@/lib/repo/training.js";
import { listar, guardar, borrar } from "@/lib/repo/asistencia.js";
import { mesesDesdeHistorial, combinar } from "@/lib/asistencia.js";

async function sesion() {
  const s = await getServerSession(authOptions);
  return s?.user?.id ? s.user : null;
}

async function datosDe(athleteId) {
  const [sesiones, manuales] = await Promise.all([listHistory(athleteId, { limit: 1000 }), listar(athleteId)]);
  const calculado = mesesDesdeHistorial(sesiones.map((s) => ({ date: s.date })));
  const manual = Object.fromEntries(manuales.map((m) => [m.mes, m.dias]));
  return { meses: combinar(calculado, manual), calculado, manual: manuales };
}

export async function GET(request) {
  const user = await sesion();
  if (!user) return Response.json({ error: "no autenticado" }, { status: 401 });

  const alumno = new URL(request.url).searchParams.get("alumno");
  if (alumno && alumno !== user.id) {
    const coach = await getCoachDe(user.id);
    if (!coach || !(await puedeVer({ coachId: coach.id, athleteId: alumno }))) {
      return Response.json({ error: "no es tu alumno" }, { status: 403 });
    }
    return Response.json(await datosDe(alumno));
  }
  return Response.json(await datosDe(user.id));
}

export async function POST(request) {
  const user = await sesion();
  if (!user) return Response.json({ error: "no autenticado" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "body invalido" }, { status: 400 }); }

  // Acepta uno o varios: cargar dos anios de golpe no puede ser veinticuatro
  // idas y vueltas.
  const filas = Array.isArray(body?.meses) ? body.meses : [body];
  const errores = [];
  for (const f of filas) {
    const r = await guardar({
      athleteId: user.id, mes: f?.mes, dias: f?.dias,
      origen: f?.origen === "import" ? "import" : "manual", nota: f?.nota || null,
    });
    if (!r.ok) errores.push(`${f?.mes}: ${r.motivo}`);
  }

  if (errores.length) {
    const mensajes = { "mes-invalido": "El mes tiene que ser AAAA-MM.", "dias-invalidos": "Los días tienen que estar entre 0 y 31." };
    const primero = errores[0].split(": ")[1];
    return Response.json({ error: mensajes[primero] || errores.join("; "), errores }, { status: 400 });
  }
  return Response.json({ ok: true, ...(await datosDe(user.id)) });
}

export async function DELETE(request) {
  const user = await sesion();
  if (!user) return Response.json({ error: "no autenticado" }, { status: 401 });

  const mes = new URL(request.url).searchParams.get("mes");
  if (!mes) return Response.json({ error: "falta el mes" }, { status: 400 });

  await borrar({ athleteId: user.id, mes });
  return Response.json({ ok: true, ...(await datosDe(user.id)) });
}
