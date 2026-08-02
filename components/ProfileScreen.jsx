"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";

/**
 * Perfil: datos de la cuenta y lo poco que el usuario puede editar de si mismo.
 *
 * El peso corporal no es decorativo — es lo que permite calcular e1RM en los
 * ejercicios con `refKg: "BW"` (dominadas, fondos), que hoy quedan fuera del
 * progreso porque no hay con que multiplicar.
 */
export default function ProfileScreen({ onClose, syncState, onSync, syncing }) {
  const { data: session } = useSession();
  const [user, setUser] = useState(null);
  const [nombre, setNombre] = useState("");
  const [peso, setPeso] = useState("");
  const [estado, setEstado] = useState("cargando"); // cargando | listo | guardando | error
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const r = await fetch("/api/profile");
        if (!r.ok) throw new Error(String(r.status));
        const { user } = await r.json();
        if (!vigente) return;
        setUser(user);
        setNombre(user.displayName || "");
        setPeso(user.bodyWeightKg == null ? "" : String(user.bodyWeightKg));
        setEstado("listo");
      } catch {
        if (vigente) setEstado("error");
      }
    })();
    return () => { vigente = false; };
  }, []);

  const guardar = async () => {
    setEstado("guardando");
    setError(null);
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: nombre, bodyWeightKg: peso === "" ? null : peso }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "no se pudo guardar"); setEstado("listo"); return; }
      setUser(data.user);
      setEstado("listo");
    } catch {
      setError("sin conexion");
      setEstado("listo");
    }
  };

  const sucio = user && (nombre !== (user.displayName || "") ||
    peso !== (user.bodyWeightKg == null ? "" : String(user.bodyWeightKg)));

  return (
    <div className="screen">
      {/* Salir del perfil es lo que mas se hace acá y estaba al fondo de todo,
          debajo de "Cerrar sesión" y con el mismo peso visual. Va arriba, es lo
          primero que se ve y no se parece a cerrar sesión. */}
      <button className="volver-top" onClick={onClose}>
        <span aria-hidden="true">←</span> Volver a entrenar
      </button>

      <header className="top">
        <div className="brand">FORGE</div>
        <h1>Perfil</h1>
        <p className="sub">{session?.user?.email}</p>
      </header>

      {estado === "error" && (
        <div className="card">
          <p className="muted">No pudimos cargar tu perfil. Revisá la conexión.</p>
        </div>
      )}

      {user && (
        <>
          <div className="card prof-head">
            {session?.user?.image
              ? <img className="prof-img" src={session.user.image} alt="" referrerPolicy="no-referrer" />
              : <span className="prof-ini">{(user.displayName || "?").charAt(0).toUpperCase()}</span>}
            <div>
              <div className="prof-name">{user.displayName}</div>
              <div className="prof-role">{user.role === "coach" ? "Entrenador" : user.role === "both" ? "Entrenador y atleta" : "Atleta"}</div>
            </div>
          </div>

          <div className="card">
            <label className="flabel">Nombre</label>
            <input className="finput" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} />

            <label className="flabel">Peso corporal (kg)</label>
            <input className="finput mono" inputMode="decimal" placeholder="—"
              value={peso} onChange={(e) => setPeso(e.target.value)} />
            <p className="fhint">Se usa para el e1RM de los ejercicios con peso corporal.</p>

            {error && <p className="ferror">{error}</p>}

            <button className="btn-primary" disabled={!sucio || estado === "guardando"} onClick={guardar}>
              {estado === "guardando" ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>

          <div className="card">
            <div className="flabel">Sincronización</div>
            <p className="fhint">{syncState || "Los entrenamientos se suben al terminar cada sesión."}</p>
            {onSync && (
              <button className="btn-secondary" onClick={onSync} disabled={syncing}>
                {syncing ? "Sincronizando…" : "Sincronizar ahora"}
              </button>
            )}
            <p className="fhint">
              Baja lo que esté en la nube y sube las sesiones que hayan quedado
              en el teléfono por falta de señal.
            </p>
          </div>

          {/* Un enlace, no una seccion. Entrenar a otros dejo de vivir adentro
              del Perfil: tiene pantalla propia, con ancho de escritorio y un
              selector de alumno. Aca queda solo la puerta, porque para invitar
              al primero hace falta poder llegar. */}
          <a className="btn-ghost" href="/entrenador">Entrenar a otros →</a>

          <button className="btn-primary" onClick={onClose} style={{ marginTop: 20 }}>Volver a entrenar</button>
          <button className="btn-salir" onClick={() => signOut({ callbackUrl: "/" })}>Cerrar sesión</button>
        </>
      )}

      {!user && <button className="btn-ghost" onClick={onClose}>Volver</button>}
    </div>
  );
}
