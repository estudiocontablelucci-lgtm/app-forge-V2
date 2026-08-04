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

    /**
     * Le dice al service worker que archivos hicieron falta para dibujar esto.
     *
     * Sin este paso la app instalada arrancaba con el HTML cacheado y sin nada
     * de JavaScript: en la PRIMERA visita el service worker se activa despues
     * de que la pagina ya pidio sus scripts, asi que no los ve pasar y no los
     * guarda. Y la primera visita es justo cuando la persona instala la app.
     *
     * La lista sale de lo que el navegador REALMENTE pidio, no de una lista
     * escrita a mano que se desactualiza en el proximo build.
     */
    const avisarLoUsado = async () => {
      const urls = performance.getEntriesByType("resource")
        .map((r) => r.name)
        .filter((n) => /\/_next\/static\/.+\.(?:js|css)$/.test(n)
          || /fonts\.(?:googleapis|gstatic)\.com/.test(n));
      if (!urls.length) return;

      const msg = { tipo: "precache", urls: [...new Set(urls)] };
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;

      // Al que manda hoy Y al que va a mandar mañana.
      //
      // Sin `skipWaiting`, una version nueva queda ESPERANDO a que se cierren
      // las pestañas. Si solo se le avisara al que controla, el que espera se
      // activaria con el cache vacio y la primera apertura sin red seria en
      // blanco — que es exactamente como quedo la app ya instalada al recibir
      // este arreglo. Los dos comparten el mismo cache, asi que el que espera
      // puede dejarlo listo ANTES de tomar el control.
      reg.active?.postMessage(msg);
      reg.waiting?.postMessage(msg);
      const instalando = reg.installing;
      if (instalando) {
        instalando.addEventListener("statechange", function alCambiar() {
          if (this.state === "installed") this.postMessage(msg);
        });
      }
    };

    const registrar = () => navigator.serviceWorker.register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      // Un respiro para los chunks que Next pide despues del `load`.
      .then(() => new Promise((r) => setTimeout(r, 1500)))
      .then(avisarLoUsado)
      .catch(() => {});
    if (document.readyState === "complete") registrar();
    else {
      window.addEventListener("load", registrar, { once: true });
      return () => window.removeEventListener("load", registrar);
    }
  }, []);

  return null;
}
