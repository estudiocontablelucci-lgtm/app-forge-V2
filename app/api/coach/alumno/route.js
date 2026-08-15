/**
 * Ficha de seguimiento de un alumno.
 *
 *   GET /api/coach/alumno?alumno=ID
 *
 * Devuelve como le esta yendo, no con que kilos entrena: programa y semana en
 * curso, adherencia, ultimo entrenamiento, e1RM, tonelaje, las notas que dejo y
 * los ejercicios donde el RIR reportado se aparta del objetivo.
 *
 * Los ids viajan SIN el prefijo del entrenador, que es como los ve en su propia
 * app. La base los tiene prefijados: alinear las dos puntas es todo el trabajo
 * delicado de esta ruta — un id mal traducido no tira error, muestra la ficha
 * vacia como si el alumno no hubiera entrenado nunca.
 */
import { getServerSession } from "@/lib/auth/nextauth-interop";
import { authOptions } from "@/lib/auth/options";
import { getCoachDe, puedeVer, marcarNotasVistas } from "@/lib/repo/coaching.js";
import { getProgram } from "@/lib/repo/programs.js";
import { asignacionDeMiAlumno, loQueEntreno } from "@/lib/repo/training.js";
import { unscope, unscopeProgram } from "@/lib/sync/ids.js";
import { fichaDeAlumno } from "@/lib/coach/metrics.js";

export async function GET(request) {
  const s = await getServerSession(authOptions);
  if (!s?.user?.id) return Response.json({ error: "no autenticado" }, { status: 401 });

  const coach = await getCoachDe(s.user.id);
  if (!coach) return Response.json({ error: "no tenés alumnos todavía" }, { status: 404 });

  const alumno = new URL(request.url).searchParams.get("alumno");
  if (!alumno) return Response.json({ error: "falta el alumno" }, { status: 400 });
  if (!(await puedeVer({ coachId: coach.id, athleteId: alumno }))) {
    return Response.json({ error: "no es tu alumno" }, { status: 403 });
  }

  const asignacion = await asignacionDeMiAlumno({ athleteId: alumno, coachUserId: s.user.id });
  if (!asignacion) {
    // Sin programa asignado no hay nada que medir todavia, y no es un error:
    // es el estado normal del alumno que recien acepto la invitacion.
    return Response.json({ programa: null, ficha: null });
  }

  const completo = await getProgram(asignacion.programId);
  if (!completo) return Response.json({ programa: null, ficha: null });

  const programa = unscopeProgram(s.user.id, completo);
  const { sesiones, sets } = await loQueEntreno(asignacion.assignmentId);

  const ficha = fichaDeAlumno({
    programa,
    sesiones,
    // Las series apuntan al ejercicio con el id prefijado del coach (el alumno
    // no lo vuelve a prefijar). Sin sacarle el prefijo no matchean con los
    // ejercicios del programa y toda la ficha queda en cero.
    sets: sets.map((x) => ({ ...x, programExerciseId: unscope(s.user.id, x.programExerciseId) })),
  });

  // Abrir la ficha es leer sus notas: estan ahi abajo. Va sin await —si falla,
  // la ficha se muestra igual y el punto de "nota nueva" se apaga la proxima.
  marcarNotasVistas({ coachId: coach.id, athleteId: alumno }).catch(() => {});

  return Response.json({
    programa: {
      id: programa.id,
      name: programa.name,
      weeks: programa.weeks,
      hasDeload: programa.hasDeload,
      sessions: programa.sessions,
      exercises: programa.exercises.length,
    },
    ficha,
  });
}
