"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";

/**
 * Acepta una invitacion de entrenador.
 *
 * Hay tres situaciones y las tres terminan bien:
 *   - sin sesion  -> se ofrece entrar; el token sobrevive en la URL
 *   - con sesion y el email coincide -> se acepta
 *   - con sesion pero otro email -> se avisa, porque el link es nominal
 *
 * El consentimiento se pide aca de forma explicita: al aceptar, el entrenador
 * pasa a ver notas y lesiones, que son dato sensible bajo la Ley 25.326. No
 * puede quedar escondido en la letra chica de un boton que dice "aceptar".
 */
export default function AceptarInvitacion({ token }) {
  const { data: session, status } = useSession();
  const [estado, setEstado] = useState("idle"); // idle | enviando | ok | error
  const [error, setError] = useState(null);
  const [consiente, setConsiente] = useState(false);
  const [invitacion, setInvitacion] = useState(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    (async () => {
      try {
        const r = await fetch("/api/invitaciones");
        if (!r.ok) return;
        const { invitaciones = [] } = await r.json();
        setInvitacion(invitaciones.find((i) => i.token === token) || null);
      } catch { /* se maneja al aceptar */ }
    })();
  }, [status, token]);

  const aceptar = async () => {
    setEstado("enviando");
    setError(null);
    try {
      const r = await fetch("/api/invitaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error); setEstado("error"); return; }
      setEstado("ok");
    } catch {
      setError("Sin conexión.");
      setEstado("error");
    }
  };

  if (status === "loading") return <div className="card"><p className="muted">Un momento…</p></div>;

  if (status !== "authenticated") {
    return (
      <div className="card">
        <h1>Te invitaron a FORGE</h1>
        <p className="muted">
          Entrá con tu cuenta para aceptar la invitación. Tiene que ser la misma dirección
          de correo a la que llegó el mail.
        </p>
        <button className="btn primary" onClick={() => signIn(undefined, { callbackUrl: `/invitacion/${token}` })}>
          Entrar y aceptar
        </button>
      </div>
    );
  }

  if (estado === "ok") {
    return (
      <div className="card">
        <h1>Listo</h1>
        <p className="muted">
          Ya sos alumno. Tu entrenador va a poder ver tus entrenamientos y asignarte una rutina.
        </p>
        <a className="btn primary" href="/">Ir a entrenar</a>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Invitación</h1>
      <p className="muted">
        {invitacion
          ? <><strong>{invitacion.coachOwner}</strong> te invitó a entrenar con él.</>
          : "Revisá los términos antes de aceptar."}
      </p>

      <div className="consent">
        <p className="consent-t">Al aceptar, tu entrenador va a poder ver:</p>
        <ul>
          <li>Tus entrenamientos: series, kilos, repeticiones y RIR.</li>
          <li>Las notas que dejes en cada sesión, incluidas molestias o lesiones.</li>
          <li>Tu peso corporal, si lo cargaste.</li>
        </ul>
        <p className="consent-t">
          Son datos de salud. Podés revocar este permiso en cualquier momento dándote de baja,
          y tu historial sigue siendo tuyo aunque dejes de entrenar con él.
        </p>
      </div>

      <label className="consent-check">
        <input type="checkbox" checked={consiente} onChange={(e) => setConsiente(e.target.checked)} />
        <span>Entiendo y doy mi consentimiento.</span>
      </label>

      {error && <p className="error">{error}</p>}

      <button className="btn primary" disabled={!consiente || estado === "enviando"} onClick={aceptar}>
        {estado === "enviando" ? "Aceptando…" : "Aceptar invitación"}
      </button>
      <p className="muted" style={{ margin: "14px 0 0", fontSize: 13 }}>
        Estás entrando como {session.user.email}.
      </p>
    </div>
  );
}
