/**
 * El programa, desde la seccion de entrenador.
 *
 *   GET   /api/coach/programa?programa=ID   programa completo + catalogo, para editar
 *   PUT   /api/coach/programa               guardar los cambios
 *   PATCH /api/coach/programa               para quien es (propio / para alumnos)
 *
 * El entrenador trabaja ONLINE: esto escribe directo en la base y no pasa por el
 * localStorage del atleta. Lo que se guarda aca le llega al alumno en su
 * proxima sincronizacion, porque un programa asignado se reemplaza entero.
 *
 * Los ids entran y salen SIN el prefijo del entrenador, que es como los ve en su
 * propia app. En la base van prefijados. Traducirlos mal no rompe nada visible:
 * guarda contra un id que no existe y deja la pantalla como si no hubiera pasado
 * nada. Es donde aparecieron todos los bugs de esta fase.
 */
import { getServerSession } from "@/lib/auth/nextauth-interop";
import { authOptions } from "@/lib/auth/options";
import { getCoachDe } from "@/lib/repo/coaching.js";
import { getProgram, saveProgram, marcarParaAlumnos, esDelUsuario } from "@/lib/repo/programs.js";
import { ejerciciosConSeries } from "@/lib/repo/training.js";
import { listCatalog, saveCatalog } from "@/lib/repo/catalog.js";
import { scope, scopeProgram, unscopeProgram, scopeCatalog, unscopeCatalog } from "@/lib/sync/ids.js";

async function contexto() {
  const s = await getServerSession(authOptions);
  if (!s?.user?.id) return { error: Response.json({ error: "no autenticado" }, { status: 401 }) };
  return { user: s.user, coach: await getCoachDe(s.user.id) };
}

export async function GET(request) {
  const ctx = await contexto();
  if (ctx.error) return ctx.error;

  const local = new URL(request.url).searchParams.get("programa");
  if (!local) return Response.json({ error: "falta el programa" }, { status: 400 });

  const programId = scope(ctx.user.id, local);
  if (!(await esDelUsuario(programId, ctx.user.id))) {
    return Response.json({ error: "Ese programa no es tuyo." }, { status: 403 });
  }

  const completo = await getProgram(programId);
  if (!completo) return Response.json({ error: "Ese programa no está en el servidor." }, { status: 404 });

  const conSeries = await ejerciciosConSeries(programId);
  const programa = unscopeProgram(ctx.user.id, completo);

  return Response.json({
    programa: {
      ...programa,
      // Por ejercicio: si alguien ya lo entreno. Cambiarle el ejercicio a una
      // fila con series es una SUSTITUCION, no una correccion de nombre.
      exercises: programa.exercises.map((e, i) => ({
        ...e,
        tieneSeries: conSeries.has(completo.exercises[i].id),
      })),
    },
    catalog: unscopeCatalog(ctx.user.id, await listCatalog(ctx.user.id)),
  });
}

export async function PUT(request) {
  const ctx = await contexto();
  if (ctx.error) return ctx.error;

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "body invalido" }, { status: 400 }); }
  const { programa, catalog } = body || {};
  if (!programa?.id) return Response.json({ error: "falta el programa" }, { status: 400 });

  const programId = scope(ctx.user.id, programa.id);
  if (!(await esDelUsuario(programId, ctx.user.id))) {
    return Response.json({ error: "Ese programa no es tuyo." }, { status: 403 });
  }
  if (!programa.exercises?.length) {
    return Response.json({ error: "El programa tiene que tener al menos un ejercicio." }, { status: 400 });
  }
  if (!programa.sessions?.length) {
    return Response.json({ error: "El programa tiene que tener al menos una sesión." }, { status: 400 });
  }

  // Los ejercicios nuevos del catalogo van PRIMERO: el programa los referencia
  // y sus filas tienen que existir antes.
  if (catalog?.length) await saveCatalog(ctx.user.id, scopeCatalog(ctx.user.id, catalog));

  // El orden se renumera del lado del servidor: `UNIQUE (program_id,
  // session_code, order_idx)` no perdona dos ejercicios en el mismo lugar, y la
  // UI puede mandar huecos despues de borrar uno.
  const porSesion = {};
  const exercises = programa.exercises.map((e) => {
    porSesion[e.session] = (porSesion[e.session] || 0) + 1;
    return { ...e, order: porSesion[e.session] };
  });

  await saveProgram(ctx.user.id, scopeProgram(ctx.user.id, { ...programa, id: programId, exercises }));

  const guardado = await getProgram(programId);
  return Response.json({ ok: true, programa: unscopeProgram(ctx.user.id, guardado) });
}

export async function PATCH(request) {
  const ctx = await contexto();
  if (ctx.error) return ctx.error;

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "body invalido" }, { status: 400 }); }
  const { programa, paraAlumnos } = body || {};
  if (!programa) return Response.json({ error: "falta el programa" }, { status: 400 });

  if (paraAlumnos && !ctx.coach) {
    return Response.json({
      error: "Todavía no tenés espacio de entrenador. Invitá a tu primer alumno y volvé a marcarlo.",
    }, { status: 400 });
  }

  const r = await marcarParaAlumnos({
    programId: scope(ctx.user.id, programa),
    ownerUserId: ctx.user.id,
    coachId: ctx.coach?.id || null,
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
