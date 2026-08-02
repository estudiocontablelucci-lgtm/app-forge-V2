/**
 * Asignar un programa a un alumno y calibrar sus kilos.
 *
 *   GET  /api/coach/asignar?alumno=ID   programas del coach + lo asignado + refs
 *   POST /api/coach/asignar             asignar (body: { alumno, programa })
 *   PUT  /api/coach/asignar             fijar una ref (body: { asignacion, ejercicio, refKg, semana })
 *
 * Las referencias son POR ALUMNO. Es la razon de ser de `assignment_refs`: el
 * entrenador escribe la plantilla una vez y calibra los kilos de cada uno sin
 * tocarla ni pisarle la carga a nadie.
 */
import { getServerSession } from "@/lib/auth/nextauth-interop";
import { authOptions } from "@/lib/auth/options";
import { getCoachDe, puedeVer } from "@/lib/repo/coaching.js";
import { listByOwner, getProgram, duplicarPrograma } from "@/lib/repo/programs.js";
import {
  asignarPrograma, programasAsignados, asignacionDeMiAlumno, asignacionesDeMisProgramas,
  ensureAssignment, resolveRefs, setRef,
} from "@/lib/repo/training.js";
import { scope, unscopeProgram } from "@/lib/sync/ids.js";

async function contexto() {
  const s = await getServerSession(authOptions);
  if (!s?.user?.id) return { error: Response.json({ error: "no autenticado" }, { status: 401 }) };
  const coach = await getCoachDe(s.user.id);
  if (!coach) return { error: Response.json({ error: "no tenés alumnos todavía" }, { status: 404 }) };
  return { user: s.user, coach };
}

export async function GET(request) {
  const ctx = await contexto();
  if (ctx.error) return ctx.error;

  const alumno = new URL(request.url).searchParams.get("alumno");
  if (!alumno) return Response.json({ error: "falta el alumno" }, { status: 400 });
  if (!(await puedeVer({ coachId: ctx.coach.id, athleteId: alumno }))) {
    return Response.json({ error: "no es tu alumno" }, { status: 403 });
  }

  const [propios, repartidos] = await Promise.all([
    listByOwner(ctx.user.id),
    asignacionesDeMisProgramas(ctx.user.id),
  ]);
  // A quien mas le toca cada programa. Es lo que permite avisar antes de
  // asignar que ese ya lo esta entrenando otra persona, y ofrecer duplicar.
  const programas = propios.map((p) => ({ ...p, asignadoA: repartidos[p.id] || [] }));

  const asignado = await asignacionDeMiAlumno({ athleteId: alumno, coachUserId: ctx.user.id });

  let detalle = null;
  if (asignado) {
    const completo = await getProgram(asignado.programId);
    const refs = await resolveRefs(asignado.assignmentId, "*");
    // Las refs se guardan contra el id prefijado; el programa se devuelve sin
    // prefijo. Se alinean las claves o la UI no encuentra ninguna.
    const prefijo = `${ctx.user.id}~`;
    const refsUI = Object.fromEntries(
      Object.entries(refs).map(([k, v]) => [k.startsWith(prefijo) ? k.slice(prefijo.length) : k, v]),
    );
    detalle = {
      assignmentId: asignado.assignmentId,
      // Se devuelven con los ids del entrenador, que son los que el coach ve
      // en su propia app.
      ...unscopeProgram(ctx.user.id, completo),
      refsDelAlumno: refsUI,
    };
  }

  return Response.json({ programas, asignado: detalle });
}

export async function POST(request) {
  const ctx = await contexto();
  if (ctx.error) return ctx.error;

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "body invalido" }, { status: 400 }); }
  const { alumno, programa, duplicar = false, nombre } = body || {};
  if (!alumno || !programa) return Response.json({ error: "faltan alumno o programa" }, { status: 400 });

  // Duplicar y asignar es un solo movimiento: asignar el mismo programa a dos
  // alumnos los deja compartiendo la prescripcion, y adaptarsela a uno se la
  // cambia al otro sin aviso.
  let programId = programa;
  if (duplicar) {
    const copia = await duplicarPrograma({ programId: programa, ownerUserId: ctx.user.id, nombre });
    if (!copia.ok) return Response.json({ error: "Ese programa no es tuyo." }, { status: 400 });
    programId = copia.programa.id;
  }

  const r = await asignarPrograma({
    programId, athleteId: alumno,
    coachUserId: ctx.user.id, coachId: ctx.coach.id,
  });
  if (!r.ok) {
    const mensajes = {
      "programa-ajeno": "Ese programa no es tuyo.",
      "no-es-alumno": "Esa persona no es tu alumno.",
    };
    return Response.json({ error: mensajes[r.motivo] || "No se pudo asignar." }, { status: 400 });
  }
  return Response.json({ ok: true, assignmentId: r.assignmentId });
}

export async function PUT(request) {
  const ctx = await contexto();
  if (ctx.error) return ctx.error;

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "body invalido" }, { status: 400 }); }
  const { alumno, ejercicio, refKg, semana = "*" } = body || {};
  if (!alumno || !ejercicio) return Response.json({ error: "faltan datos" }, { status: 400 });
  if (!(await puedeVer({ coachId: ctx.coach.id, athleteId: alumno }))) {
    return Response.json({ error: "no es tu alumno" }, { status: 403 });
  }

  const asignados = await programasAsignados(alumno);
  if (!asignados.length) return Response.json({ error: "ese alumno no tiene programa asignado" }, { status: 400 });

  const assignmentId = await ensureAssignment({ programId: asignados[0].programId, athleteId: alumno });
  // El GET devuelve los ids sin el prefijo del coach, que es como los ve en su
  // propia app; en la base estan prefijados. Sin volver a ponerselo, la
  // referencia se guarda contra un id que no existe y el alumno no la recibe.
  // `scope` no hace nada si ya viene prefijado, asi que sirve para ambos casos.
  await setRef({ assignmentId, programExerciseId: scope(ctx.user.id, ejercicio), week: semana, refKg });
  return Response.json({ ok: true });
}
