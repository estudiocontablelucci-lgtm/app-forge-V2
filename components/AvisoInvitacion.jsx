"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

/**
 * Avisa que hay una invitacion esperando.
 *
 * Existe porque el link del mail se pierde facil: se abre en el celular sin
 * sesion, se cierra la pestana, el mail queda enterrado. Si la persona entra a
 * FORGE por su cuenta, la invitacion la esta esperando igual — el vinculo se
 * resuelve por email, no por conservar el link.
 */
export default function AvisoInvitacion() {
  const { status } = useSession();
  const [invitaciones, setInvitaciones] = useState([]);
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let vigente = true;
    (async () => {
      try {
        const r = await fetch("/api/invitaciones");
        if (!r.ok) return;
        const { invitaciones = [] } = await r.json();
        if (vigente) setInvitaciones(invitaciones);
      } catch { /* sin red no se avisa nada */ }
    })();
    return () => { vigente = false; };
  }, [status]);

  if (oculto || !invitaciones.length) return null;
  const inv = invitaciones[0];

  return (
    <div className="invite-banner">
      <div>
        <strong>{inv.coachOwner}</strong> te invitó a entrenar con él.
        {invitaciones.length > 1 && ` (+${invitaciones.length - 1} más)`}
      </div>
      <div className="invite-acciones">
        <a className="invite-ver" href={`/invitacion/${inv.token}`}>Ver invitación</a>
        <button className="invite-x" onClick={() => setOculto(true)} aria-label="Ocultar">×</button>
      </div>
    </div>
  );
}
