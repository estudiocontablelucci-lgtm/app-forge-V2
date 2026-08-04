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

  /**
   * Estado del modo offline, en palabras.
   *
   * Existe porque diagnosticar esto en un telefono es imposible sin devtools, y
   * "no abre sin conexion" puede ser tres cosas distintas: que no haya service
   * worker, que haya uno viejo esperando, o que este activo pero sin archivos
   * guardados. Cada una se arregla distinto.
   */
  const [offline, setOffline] = useState(null);
  useEffect(() => {
    let vigente = true;
    (async () => {
      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
        if (vigente) setOffline({ estado: "no-soportado" });
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      let archivos = 0;
      try {
        for (const n of await caches.keys()) archivos += (await (await caches.open(n)).keys()).length;
      } catch { /* sin permiso de cache */ }
      if (!vigente) return;
      setOffline({
        estado: !reg ? "sin-registrar" : reg.waiting ? "esperando" : reg.active ? "listo" : "instalando",
        archivos,
        instalada: window.matchMedia?.("(display-mode: standalone)")?.matches || false,
      });
    })();
    return () => { vigente = false; };
  }, []);

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

          <div className="card">
            <div className="flabel">Modo sin conexión</div>
            {!offline && <p className="fhint">Revisando…</p>}
            {offline?.estado === "no-soportado" && (
              <p className="fhint">Este navegador no lo soporta. Probá con Chrome o Safari.</p>
            )}
            {offline?.estado === "sin-registrar" && (
              <p className="fhint">No está activo. Abrí la app con conexión y volvé a entrar acá.</p>
            )}
            {offline?.estado === "instalando" && <p className="fhint">Preparándose…</p>}
            {offline?.estado === "esperando" && (
              <p className="fhint">
                Hay una versión nueva esperando. <strong>Cerrá la app del todo</strong> (sacala de las
                apps recientes) y volvé a abrirla con conexión para que tome el control.
                {" "}Archivos guardados: {offline.archivos}.
              </p>
            )}
            {offline?.estado === "listo" && (
              <p className="fhint">
                {offline.archivos > 5
                  ? <>Listo: <strong>{offline.archivos} archivos guardados</strong>. La app abre sin conexión.</>
                  : <>Activo pero con solo {offline.archivos} archivos. Abrí la app con conexión una vez más
                     para que termine de guardar lo que falta.</>}
                {offline.instalada ? " Estás usando la app instalada." : " Estás en el navegador, no en la app instalada."}
              </p>
            )}
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
