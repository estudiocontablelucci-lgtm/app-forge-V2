"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginForm({ hasGoogle, hasEmail, checkMail }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    const r = await signIn("email", { email: email.trim(), redirect: false });
    setSending(false);
    if (r?.error) setError("No pudimos enviar el mail. Probá de nuevo en un minuto.");
    else setSent(true);
  };

  if (sent || checkMail) {
    return (
      <div className="card">
        <h1>Revisá tu correo</h1>
        <p className="muted">
          Te mandamos un link de acceso{email ? ` a ${email}` : ""}. Vence en 15 minutos
          y sirve una sola vez.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>FORGE</h1>
      <p className="muted">Entrá para sincronizar tus entrenamientos entre dispositivos.</p>

      {hasGoogle && (
        <button className="btn google" onClick={() => signIn("google", { callbackUrl: "/" })}>
          Continuar con Google
        </button>
      )}

      {hasGoogle && hasEmail && <div className="sep"><span>o</span></div>}

      {hasEmail && (
        <form onSubmit={submit}>
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="btn primary" type="submit" disabled={sending}>
            {sending ? "Enviando…" : "Enviarme un link de acceso"}
          </button>
        </form>
      )}

      {!hasGoogle && !hasEmail && (
        <p className="muted">
          No hay ningún método de acceso configurado. Faltan las variables de entorno
          de Google o de Resend.
        </p>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
