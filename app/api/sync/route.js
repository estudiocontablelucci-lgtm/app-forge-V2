/**
 * Sincronizacion entre el localStorage del cliente y Turso.
 *
 *   POST /api/sync   push de una sesion terminada (+ su programa y el catalogo)
 *   GET  /api/sync   pull de programas e historial
 *
 * Modelo elegido para la fase 4: el cliente sigue siendo la fuente de verdad
 * mientras entrena — la app se usa en el subsuelo de un gimnasio y no puede
 * depender de la red para registrar una serie. El servidor recibe la sesion ya
 * cerrada. Conflicto real casi imposible: nadie registra la misma serie desde
 * dos telefonos a la vez.
 *
 * La logica vive en lib/sync/service.js; aca solo se resuelve la sesion.
 */
import { getServerSession } from "@/lib/auth/nextauth-interop";
import { authOptions } from "@/lib/auth/options";
import { pushForUser, pullForUser, pushProgramForUser, pushCatalogForUser } from "@/lib/sync/service.js";

async function requireUser() {
  const session = await getServerSession(authOptions);
  return session?.user?.id || null;
}

export async function POST(request) {
  const userId = await requireUser();
  if (!userId) return Response.json({ error: "no autenticado" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body invalido" }, { status: 400 });
  }

  const { program, entry, catalog } = body || {};
  if (!program?.id && !catalog?.length) {
    return Response.json({ error: "falta el program" }, { status: 400 });
  }

  try {
    // El catalogo va PRIMERO: los ejercicios del programa lo referencian, asi
    // que sus filas tienen que existir antes.
    if (catalog?.length) await pushCatalogForUser(userId, catalog);
    if (!program?.id) return Response.json({ ok: true, soloCatalogo: true });
    // Sin `entry` es solo el programa: lo usa el sync para que un programa
    // recien creado exista del lado del servidor sin esperar a que se entrene.
    if (!entry?.session) {
      const r = await pushProgramForUser(userId, program);
      return Response.json({ ok: r.ok, soloPrograma: true, motivo: r.motivo || null });
    }
    const r = await pushForUser(userId, { program, entry });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    console.error("[sync] push fallo:", e);
    return Response.json({ error: "no se pudo guardar" }, { status: 500 });
  }
}

export async function GET() {
  const userId = await requireUser();
  if (!userId) return Response.json({ error: "no autenticado" }, { status: 401 });

  try {
    return Response.json(await pullForUser(userId));
  } catch (e) {
    console.error("[sync] pull fallo:", e);
    return Response.json({ error: "no se pudo leer" }, { status: 500 });
  }
}
