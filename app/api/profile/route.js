/**
 * Perfil del usuario.
 *
 *   GET   /api/profile   datos de la cuenta
 *   PATCH /api/profile   editar nombre y peso corporal
 *
 * El email no se edita: es la identidad con la que entra (clave natural en
 * `users`). Cambiarlo seria crear otra cuenta, no editar esta.
 * La foto viene del proveedor OAuth y tampoco se edita a mano.
 */
import { getServerSession } from "@/lib/auth/nextauth-interop";
import { authOptions } from "@/lib/auth/options";
import { findById, updateProfile } from "@/lib/repo/users.js";

async function requireUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id || null;
}

export async function GET() {
  const id = await requireUserId();
  if (!id) return Response.json({ error: "no autenticado" }, { status: 401 });

  const user = await findById(id);
  if (!user) return Response.json({ error: "no encontrado" }, { status: 404 });
  return Response.json({ user });
}

export async function PATCH(request) {
  const id = await requireUserId();
  if (!id) return Response.json({ error: "no autenticado" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body invalido" }, { status: 400 });
  }

  const cambios = {};

  if (body.displayName !== undefined) {
    const nombre = String(body.displayName).trim();
    if (!nombre) return Response.json({ error: "el nombre no puede quedar vacio" }, { status: 400 });
    if (nombre.length > 80) return Response.json({ error: "nombre demasiado largo" }, { status: 400 });
    cambios.displayName = nombre;
  }

  if (body.bodyWeightKg !== undefined) {
    if (body.bodyWeightKg === null || body.bodyWeightKg === "") {
      cambios.bodyWeightKg = null;
    } else {
      const kg = Number(body.bodyWeightKg);
      // Rango amplio a proposito: no es validacion medica, es atajar el dedazo
      // (poner 700 en vez de 70) que despues ensucia el e1RM de los BW.
      if (!Number.isFinite(kg) || kg <= 0 || kg > 400) {
        return Response.json({ error: "peso fuera de rango" }, { status: 400 });
      }
      cambios.bodyWeightKg = kg;
    }
  }

  try {
    const user = await updateProfile(id, cambios);
    return Response.json({ user });
  } catch (e) {
    console.error("[profile] update fallo:", e);
    return Response.json({ error: "no se pudo guardar" }, { status: 500 });
  }
}
