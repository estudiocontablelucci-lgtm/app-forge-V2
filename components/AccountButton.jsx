"use client";

import { useSession } from "next-auth/react";

/**
 * Punto de entrada a la cuenta, fijo arriba a la derecha.
 *
 * Vive fuera de los <header> de cada pantalla a proposito: hay siete headers
 * distintos en la app y meterlo en cada uno seria repetirlo siete veces.
 */
export default function AccountButton({ onOpenProfile, perfilLocal }) {
  const { data: session, status } = useSession();

  // Mientras resuelve no se muestra nada: un boton "Entrar" que parpadea y se
  // convierte en avatar medio segundo despues queda peor que aparecer una vez.
  if (status === "loading") return null;

  // Sin red, `/api/auth/session` falla y next-auth responde "no autenticado".
  // Mostrar "Entrar" ahi es afirmar algo falso: la persona tiene cuenta, lo que
  // no hay es forma de confirmarlo ahora. Se usa el ultimo perfil conocido.
  const user = session?.user || perfilLocal || null;

  if (!user) {
    return (
      <a className="acct acct-in" href="/login">Entrar</a>
    );
  }

  const { name, image, email } = user;
  const inicial = (name || email || "?").trim().charAt(0).toUpperCase();

  return (
    <button className="acct" onClick={onOpenProfile} aria-label="Perfil">
      {image
        ? <img className="acct-img" src={image} alt="" referrerPolicy="no-referrer" />
        : <span className="acct-ini">{inicial}</span>}
    </button>
  );
}
