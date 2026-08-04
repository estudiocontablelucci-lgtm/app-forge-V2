/*
 * Service worker de FORGE.
 *
 * Escrito a mano y a proposito. La app ya funcionaba sin señal —el
 * entrenamiento vive en localStorage— y lo unico que faltaba era que ABRIERA
 * sin red. Eso son cien lineas; una libreria de service workers serian
 * cuatrocientos kilobytes y una capa de magia sobre la parte del sistema que
 * mas caro sale equivocarse, porque un service worker sobrevive al deploy que
 * lo rompio.
 *
 * ============================ REGLAS ============================
 *
 * 1. NAVEGACION -> red primero, cache como respaldo, PERO CON RELOJ.
 *    Asi un deploy nuevo se ve enseguida. El respaldo es lo que hace que la
 *    app abra en el subsuelo del gimnasio.
 *
 *    Lo del reloj no es un detalle. Sin señal, `fetch` no falla rapido: el
 *    sistema tarda en darse por vencido, y mientras tanto la app instalada se
 *    queda en el splash. Se veia como "abre en blanco, salgo, vuelvo a entrar y
 *    ahora si" — la segunda vez el service worker ya estaba caliente. Ahora si
 *    el navegador dice que no hay red se va derecho al cache, y si dice que si
 *    pero no contesta en dos segundos, tambien.
 *
 * 2. ESTATICOS (/_next/static, iconos, manifest) -> cache primero.
 *    Next les pone un hash en el nombre: una version nueva es una URL nueva,
 *    asi que servirlos de cache no puede devolver algo viejo.
 *
 *    OJO: interceptar no alcanza. En la PRIMERA visita el service worker se
 *    activa DESPUES de que la pagina ya pidio sus scripts, asi que esos pedidos
 *    no pasan por aca y no quedan guardados. La app instalada arrancaba con el
 *    HTML en cache y sin una sola linea de JavaScript: cargaba el cascaron y se
 *    quedaba en el splash para siempre. Por eso la pagina, cuando termina de
 *    cargar, MANDA la lista de lo que uso (mensaje "precache") y se guarda.
 *
 * 3. /api/** -> NUNCA se cachea. Ni siquiera GET.
 *    Ahi vive la sesion, el historial y los datos de otras personas. Una
 *    respuesta de sesion cacheada es la app mintiendo sobre quien sos.
 *
 * 4. NO se llama a skipWaiting().
 *    La version nueva espera a que se cierren las pestañas. Si tomara el
 *    control de una pestaña abierta, React podria pedir un chunk que la
 *    version nueva ya no tiene — y eso pasaria a mitad de una serie, que es
 *    exactamente el momento en que la app no puede fallar. Un dia de demora en
 *    la actualizacion es barato; perder una sesion registrada no.
 *
 * ESCAPE: si esto rompe algo, se deploya un sw.js cuyo unico contenido sea
 * `self.registration.unregister()`. Los navegadores revalidan el archivo del
 * service worker en cada navegacion, asi que se despublica solo.
 */

const VERSION = "forge-v1";
const CACHE = `${VERSION}-assets`;
const SHELL = "/";
const TOPE = 140;   // entradas antes de podar; son chunks con hash, se acumulan

/** Lo minimo para que la app abra sin red. */
const ESENCIAL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // `reload` evita que el propio cache HTTP devuelva una copia vieja justo
      // en el momento de guardar la version buena.
      Promise.allSettled(ESENCIAL.map((u) => c.add(new Request(u, { cache: "reload" })))),
    ),
  );
  // Sin skipWaiting: ver la regla 4.
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

const esEstatico = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  /\.(?:png|svg|ico|webmanifest|woff2?)$/.test(url.pathname) ||
  url.hostname === "fonts.gstatic.com" ||
  url.hostname === "fonts.googleapis.com";

/** El cache crece con cada deploy: se poda por lo mas viejo cuando pasa el tope. */
async function podar(cache) {
  const claves = await cache.keys();
  if (claves.length <= TOPE) return;
  await Promise.all(claves.slice(0, claves.length - TOPE).map((k) => cache.delete(k)));
}

async function deCacheORed(req) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(req);
  if (guardada) return guardada;

  const res = await fetch(req);
  // Solo se guarda lo que salio bien. Una respuesta parcial o un error
  // cacheado se sirve para siempre, que es peor que no tener cache.
  if (res && res.ok && (res.type === "basic" || res.type === "cors")) {
    cache.put(req, res.clone()).then(() => podar(cache)).catch(() => {});
  }
  return res;
}

/** Lo que haya guardado para esta navegacion. */
async function shellGuardado(cache, req) {
  // `ignoreVary`: Next responde con `Vary: RSC, Next-Router-State-Tree...` y
  // un arranque en frio no manda las mismas cabeceras que la visita que se
  // cacheo. Sin esto el match falla y la app queda en blanco teniendo el HTML
  // guardado. `ignoreSearch` cubre el start_url con parametros.
  const opciones = { ignoreVary: true, ignoreSearch: true };
  return (await cache.match(req, opciones)) || (await cache.match(SHELL, opciones));
}

const ESPERA_RED = 2000;

async function deRedOCache(req) {
  const cache = await caches.open(CACHE);

  // Si el navegador ya sabe que no hay red, no se le pide permiso al reloj.
  if (self.navigator && self.navigator.onLine === false) {
    const guardado = await shellGuardado(cache, req);
    if (guardado) return guardado;
  }

  try {
    // La red compite contra un reloj: pasado el plazo gana lo guardado. Es la
    // diferencia entre abrir en un segundo y quedarse en el splash.
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("tarde")), ESPERA_RED)),
    ]);
    if (res && res.ok) {
      // Bajo SU url y tambien como shell. Sin lo primero, `/entrenador` sin red
      // caia al shell de `/` y se dibujaba la app del atleta con la direccion
      // del entrenador en la barra: peor que un error, porque no se nota.
      cache.put(req, res.clone()).catch(() => {});
      cache.put(SHELL, res.clone()).catch(() => {});
      podar(cache);
    }
    return res;
  } catch {
    // Sin red: la ultima version que se vio, o el shell.
    return (await shellGuardado(cache, req)) || Response.error();
  }
}

/**
 * La pagina avisa que archivos necesito para dibujarse.
 *
 * Es la unica forma confiable de saberlo: los nombres llevan un hash que cambia
 * en cada build, asi que un service worker escrito a mano no puede adivinarlos,
 * y esperar a interceptarlos deja afuera justo los de la primera visita — que
 * es la unica que importa, porque es cuando la persona instala la app.
 */
self.addEventListener("message", (e) => {
  if (e.data?.tipo !== "precache" || !Array.isArray(e.data.urls)) return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(e.data.urls.map(async (u) => {
      try {
        if (await cache.match(u)) return;                 // ya estaba
        const res = await fetch(u, { credentials: "same-origin" });
        if (res.ok) await cache.put(u, res);
      } catch { /* sin red o URL caida: se reintenta en la proxima carga */ }
    }));
    await podar(cache);
  })());
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Regla 3: la API no pasa por aca ni de casualidad.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") { e.respondWith(deRedOCache(request)); return; }
  if (esEstatico(url)) { e.respondWith(deCacheORed(request)); return; }
  // Todo lo demas: red, sin intervenir.
});
