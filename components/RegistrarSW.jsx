"use client";

import { useEffect } from "react";

/**
 * Registra el service worker.
 *
 * En DESARROLLO no se registra salvo que se pida con `?sw=1`. Un service worker
 * en dev sirve assets cacheados de un build anterior y produce el sintoma mas
 * desorientador que tiene este proyecto: la app compila, responde 200 y muestra
 * una version que ya no existe. Vale para cualquier app en el mismo puerto: los
 * service workers son por ORIGEN, no por proyecto.
 *
 * Para probarlo de verdad conviene `npm run build && npm start`, que es lo que
 * corre en produccion.
 */
export default function RegistrarSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const enDev = process.env.NODE_ENV !== "production";
    const forzado = new URLSearchParams(window.location.search).has("sw");
    if (enDev && !forzado) {
      // Si quedo uno registrado de una prueba anterior, se saca: es la causa
      // de "cambie el codigo y la pantalla sigue igual".
      navigator.serviceWorker.getRegistrations()
        .then((rs) => rs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    // Despues de `load`: registrar durante la carga compite por ancho de banda
    // con lo que la pantalla necesita para dibujarse.
    const registrar = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") registrar();
    else {
      window.addEventListener("load", registrar, { once: true });
      return () => window.removeEventListener("load", registrar);
    }
  }, []);

  return null;
}
