"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { despertarAudio, beepYa, estadoNotificacion, pedirPermisoNotificacion } from "@/lib/aviso";
import { PREFS_DEFAULT } from "@/lib/descanso";

/** Una preferencia: titulo, explicacion de que hace, y el interruptor. */
function Pref({ id, titulo, detalle, valor, onChange, deshabilitado = false }) {
  return (
    <div className={`pref ${valor ? "" : "off"}`}>
      <label className="pref-txt" htmlFor={id}>
        <span className="pref-t">{titulo}</span>
        <span className="pref-d">{detalle}</span>
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={valor}
        aria-label={titulo}
        disabled={deshabilitado}
        className={`sw ${valor ? "on" : ""}`}
        onClick={() => onChange(!valor)}
      />
    </div>
  );
}

/**
 * Perfil: datos de la cuenta y lo poco que el usuario puede editar de si mismo.
 *
 * El peso corporal no es decorativo — es lo que permite calcular e1RM en los
 * ejercicios con `refKg: "BW"` (dominadas, fondos), que hoy quedan fuera del
 * progreso porque no hay con que multiplicar.
 */
export default function ProfileScreen({ onClose, syncState, onSync, syncing, perfilLocal, hayRed = true, prefs = PREFS_DEFAULT, onPrefs = () => {} }) {
  const { data: session } = useSession();
  const [user, setUser] = useState(null);
  const [nombre, setNombre] = useState("");
  const [peso, setPeso] = useState("");
  const [estado, setEstado] = useState("cargando"); // cargando | listo | guardando | error
  const [error, setError] = useState(null);
  /**
   * El permiso de notificaciones es del NAVEGADOR, no de la app: la
   * preferencia puede decir que si y el permiso estar revocado desde los
   * ajustes del sitio. Se lee en el cliente y no en el estado inicial porque
   * `Notification` no existe durante el render del servidor.
   */
  const [permisoNotif, setPermisoNotif] = useState("default");
  useEffect(() => { setPermisoNotif(estadoNotificacion()); }, []);

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
  }, [perfilLocal]);

  useEffect(() => {
    let vigente = true;
    (async () => {
      // Con reloj. Sin senal este pedido no falla rapido, y mientras colgaba la
      // pantalla seguia mostrando el estado anterior: el Perfil afirmaba "con
      // conexión" con el telefono en modo avion.
      const corte = new AbortController();
      const reloj = setTimeout(() => corte.abort(), 2500);
      try {
        const r = await fetch("/api/profile", { signal: corte.signal });
        if (!r.ok) throw new Error(String(r.status));
        const { user } = await r.json();
        if (!vigente) return;
        setUser(user);
        setNombre(user.displayName || "");
        setPeso(user.bodyWeightKg == null ? "" : String(user.bodyWeightKg));
        setEstado("listo");
      } catch {
        // Sin red el perfil no se puede pedir, pero eso no es una pantalla
        // vacia: se muestra lo ultimo que se supo y se avisa que esta viejo.
        if (!vigente) return;
        // Si el padre todavia no lo tiene en memoria, se lee del disco: en la
        // primera apertura sin red el perfil salia vacio y recien aparecia al
        // segundo intento.
        let local = perfilLocal;
        if (!local) {
          try { local = JSON.parse(localStorage.getItem("forge-v2") || "{}").perfilLocal || null; } catch { local = null; }
        }
        const perfilLocalEfectivo = local;
        if (perfilLocalEfectivo) {
          setUser({ displayName: perfilLocalEfectivo.name, email: perfilLocalEfectivo.email, role: null, bodyWeightKg: null });
          setNombre(perfilLocalEfectivo.name || "");
          setEstado("sin-red");
        } else {
          setEstado("error");
        }
      } finally {
        clearTimeout(reloj);
      }
    })();
    return () => { vigente = false; };
  }, [perfilLocal]);

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

      {estado === "sin-red" && (
        <div className="vacio-card">
          <p className="vacio-t">Sin conexión</p>
          <p className="vacio-p">
            Esto es lo último que sabemos de tu cuenta. Los cambios de nombre o peso
            necesitan conexión; el resto de la app funciona igual.
          </p>
        </div>
      )}

      {/* El estado del modo offline va FUERA del bloque que depende del
          servidor: estaba adentro, asi que la unica pantalla que explica por que
          la app no anda sin conexion solo aparecia CON conexion. */}
      <div className="card">
        {/* El titulo describe una CAPACIDAD, no el estado de la conexion. Decia
            "Modo sin conexión: listo" y se leia como "estás sin conexión": con
            la red ya de vuelta, la app parecia trabada. El estado real va
            primero y aparte. */}
        <div className="flabel">Conexión</div>
        {/* Con la evidencia propia incluida: si el pedido de esta misma pantalla
            fallo por falta de red, decir "con conexión" seria contradecirse. */}
        <p className="fhint" style={{ marginBottom: 12 }}>
          Ahora mismo: <strong>{hayRed && estado !== "sin-red" ? "con conexión" : "sin conexión"}</strong>.
          {hayRed && estado !== "sin-red"
            ? " Todo se sincroniza normalmente."
            : " Podés entrenar igual; se sube cuando vuelva."}
        </p>

        <div className="flabel">Funciona sin conexión</div>
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
              ? <>Preparado — <strong>{offline.archivos} archivos guardados</strong>. Si te quedás sin señal, la app abre igual.</>
              : <>Preparándose: solo {offline.archivos} archivos. Abrí la app con conexión una vez más
                 para que termine de guardar lo que falta.</>}
            {offline.instalada ? " Estás usando la app instalada." : " Estás en el navegador, no en la app instalada."}
          </p>
        )}
      </div>

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

          {/* Las preferencias van ARRIBA de la sincronizacion y de la puerta
              al entrenador: son de las pocas cosas de esta pantalla que se
              tocan mas de una vez, y estaban en ninguna parte. */}
          <div className="card">
            <div className="flabel">Descanso entre series</div>
            <p className="fhint" style={{ marginBottom: 6 }}>
              El cronómetro arranca al cargar las repeticiones de la última serie del bloque.
              Sigue corriendo aunque cambies de pestaña o salgas de la app.
            </p>

            <Pref
              id="pref-descanso"
              titulo="Cronómetro de descanso"
              detalle="Arranca solo al cerrar cada serie. Apagado, no aparece nunca."
              valor={prefs.descanso}
              onChange={(v) => onPrefs({ descanso: v })}
            />

            <Pref
              id="pref-sonido"
              titulo="Sonido al terminar"
              detalle="Tres pulsos. Es lo único que se escucha con el teléfono en el bolsillo y la pantalla apagada."
              valor={prefs.sonido}
              deshabilitado={!prefs.descanso}
              onChange={async (v) => {
                onPrefs({ sonido: v });
                // Se prueba en el momento: el navegador solo deja empezar a
                // sonar desde un gesto, y este toque ES el gesto. Sin esto, la
                // primera vez que hiciera falta el audio no iba a estar listo.
                if (v && await despertarAudio()) beepYa();
              }}
            />

            <Pref
              id="pref-vibracion"
              titulo="Vibración"
              detalle="Solo funciona con la app abierta en pantalla; el sistema no vibra por una app dormida."
              valor={prefs.vibracion}
              deshabilitado={!prefs.descanso}
              onChange={(v) => {
                onPrefs({ vibracion: v });
                if (v) { try { navigator.vibrate?.([120]); } catch { /* sin motor */ } }
              }}
            />

            <Pref
              id="pref-notif"
              titulo="Notificación del sistema"
              detalle={
                permisoNotif === "denied"
                  ? "Bloqueada en este navegador. Se habilita desde los ajustes del sitio, no desde acá."
                  : "Un aviso en la barra cuando el descanso termina y no estás mirando la app."
              }
              valor={prefs.notificacion && permisoNotif === "granted"}
              deshabilitado={!prefs.descanso || permisoNotif === "denied" || permisoNotif === "no-soportado"}
              onChange={async (v) => {
                if (!v) { onPrefs({ notificacion: false }); return; }
                // El permiso se pide ACA y no al abrir la app: un pedido que
                // aparece sin que nadie lo haya buscado se rechaza de un dedo,
                // y un "denied" no se puede volver a preguntar nunca mas.
                const r = await pedirPermisoNotificacion();
                setPermisoNotif(r);
                onPrefs({ notificacion: r === "granted" });
              }}
            />

            {permisoNotif === "default" && prefs.descanso && (
              <p className="fhint">Al activarla, el navegador va a pedirte permiso una vez.</p>
            )}
          </div>

          <div className="card">
            <div className="flabel">Ayudas en pantalla</div>
            <Pref
              id="pref-ayudas"
              titulo="Mostrar las ayudas"
              detalle="Los botones con “?” que explican el semáforo, el e1RM, el RIR y el tonelaje. Apagalos cuando ya no los necesites."
              valor={prefs.ayudas}
              onChange={(v) => onPrefs({ ayudas: v })}
            />
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

      {!user && <button className="btn-primary" onClick={onClose}>Volver a entrenar</button>}
    </div>
  );
}
