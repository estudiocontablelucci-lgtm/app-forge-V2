/**
 * Perfil del usuario.
 *
 *   GET   /api/profile   datos de la cuenta
 *   PATCH /api/profile   editar el nombre
 *
 * El email no se edita: es la identidad con la que entra (clave natural en
 * `users`). Cambiarlo seria crear otra cuenta, no editar esta.
 * La foto viene del proveedor OAuth y tampoco se edita a mano.
 *
 * El PESO tampoco, y es lo unico que se saco de aca: se carga con las medidas,
 * que llevan FECHA, porque de ahi sale la carga de dominadas y fondos. Un
 * numero suelto sin fecha reescribia hacia atras el e1RM de cada serie ya
 * registrada cada vez que la balanza cambiaba. La columna `users.body_weight_kg`
 * queda sin uso: las migraciones aplicadas no se editan.
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

  // `bodyWeightKg` ya no se acepta: el peso se carga con las medidas, que llevan
  // fecha, y desde ahi alimenta el e1RM de los ejercicios a peso corporal. Un
  // cliente viejo —una PWA cacheada que todavia mande el campo— no rompe: se
  // ignora en silencio, que es lo correcto para un campo que dejo de existir.

  try {
    const user = await updateProfile(id, cambios);
    return Response.json({ user });
  } catch (e) {
    console.error("[profile] update fallo:", e);
    return Response.json({ error: "no se pudo guardar" }, { status: 500 });
  }
}
