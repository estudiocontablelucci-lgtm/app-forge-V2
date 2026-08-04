"""
Verifica que la app sea instalable y ABRA SIN RED.

    python scripts/check_pwa.py --base http://localhost:3008 --cookies demo.json

Se corre contra `next start`, no contra `next dev`: el service worker solo se
registra en produccion, y probar el modo offline contra el servidor de
desarrollo verificaria otra cosa.

Lo que se prueba no es que exista un service worker, es que el telefono abra la
app en el subsuelo de un gimnasio. Por eso el nucleo del test es cortar la red
DE VERDAD (`context.set_offline`) y recargar.
"""
import argparse
import json
import re
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

fallas: list[str] = []


def check(label: str, ok: bool, detalle: str = "") -> None:
    print(f"  {'ok ' if ok else 'FALLA'}  {label}{'' if ok else f' — {detalle}'}")
    if not ok:
        fallas.append(f"{label}: {detalle}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3008")
    ap.add_argument("--cookies", default="")
    ap.add_argument("--shots", default="")
    args = ap.parse_args()
    base = args.base.rstrip("/")
    host = urlparse(base).hostname

    with sync_playwright() as p:
        nav = p.chromium.launch()
        ctx = nav.new_context(viewport={"width": 390, "height": 844})

        if args.cookies:
            tok = json.load(open(args.cookies, encoding="utf-8"))["cookies"]["ana"]
            ctx.add_cookies([{"name": "next-auth.session-token", "value": tok,
                              "domain": host, "path": "/", "httpOnly": True, "sameSite": "Lax"}])

        pg = ctx.new_page()
        errores: list[str] = []
        pg.on("pageerror", lambda e: errores.append(str(e)))

        print("\nmanifest e iconos")
        r = ctx.request.get(f"{base}/manifest.webmanifest")
        check("el manifest se sirve", r.status == 200, f"status {r.status}")
        man = r.json() if r.status == 200 else {}
        check("es instalable (nombre, start_url, display)",
              man.get("name") and man.get("start_url") and man.get("display") == "standalone",
              str(man)[:150])
        check("tiene icono de 512", any(i.get("sizes") == "512x512" for i in man.get("icons", [])))
        check("tiene icono maskable",
              any("maskable" in (i.get("purpose") or "") for i in man.get("icons", [])),
              "sin maskable, Android recorta el rayo")
        for icono in ["/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png"]:
            ri = ctx.request.get(base + icono)
            check(f"existe {icono}", ri.status == 200 and int(ri.headers.get("content-length", "0")) > 500,
                  f"status {ri.status}")

        print("\nservice worker")
        rs = ctx.request.get(f"{base}/sw.js")
        check("el service worker se sirve", rs.status == 200, f"status {rs.status}")
        cuerpo = rs.text() if rs.status == 200 else ""
        # Se sacan los comentarios antes de buscar: el propio service worker
        # explica por que NO usa skipWaiting, y buscar la palabra suelta
        # encontraba justamente esa explicacion.
        codigo = re.sub(r"/\*.*?\*/", "", cuerpo, flags=re.S)
        codigo = re.sub(r"//.*", "", codigo)
        # Regla 4: tomar el control de una pestaña abierta puede tumbar una
        # sesion a mitad de una serie.
        check("NO llama a skipWaiting", "skipWaiting" not in codigo,
              "tomaria el control de una pestaña abierta a mitad de entrenamiento")

        pg.goto(base, wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(1000)
        # El registro espera al `load`, y activarse lleva un momento mas.
        pg.wait_for_function("navigator.serviceWorker.controller !== null", timeout=20000)
        check("queda registrado y controlando la pagina", True)
        check("la app carga sin errores", not errores, str(errores))

        # Se pasa por la seccion de entrenador CON red, para que quede cacheada
        # bajo su propia url y el test de mas abajo signifique algo.
        pg.goto(f"{base}/entrenador", wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(2500)
        pg.goto(base, wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(2000)

        print("\nla API nunca se cachea")
        # Una respuesta de sesion servida de cache es la app mintiendo sobre
        # quien sos.
        enCache = pg.evaluate("""async () => {
            const nombres = await caches.keys();
            const urls = [];
            for (const n of nombres) {
              const c = await caches.open(n);
              for (const k of await c.keys()) urls.push(k.url);
            }
            return urls;
        }""")
        check("no hay ninguna respuesta de /api/ guardada",
              not any("/api/" in u for u in enCache),
              str([u for u in enCache if "/api/" in u][:3]))
        # Contar. El check anterior aceptaba "hay algo estatico" y pasaba con
        # cero chunks de JavaScript, que es exactamente como quedaba la app
        # instalada: HTML cacheado y ni una linea de codigo.
        chunks = [u for u in enCache if "/_next/static/" in u and u.endswith(".js")]
        pedidos = pg.evaluate("""performance.getEntriesByType('resource')
            .map(r => r.name).filter(n => n.includes('/_next/static/') && n.endsWith('.js')).length""")
        check("los scripts de la app quedan cacheados", len(chunks) >= max(1, pedidos - 1),
              f"{len(chunks)} en cache y la pagina pidio {pedidos}: sin ellos abre el cascaron y nada mas")

        print("\nSIN RED")
        # El caso real: el telefono en el subsuelo del gimnasio.
        ctx.set_offline(True)
        errores.clear()
        pg.reload(wait_until="domcontentloaded", timeout=30000)
        pg.wait_for_timeout(3000)

        texto = pg.inner_text("body")
        check("la app abre sin red", "Entrenar" in texto, texto[:200])

        # Que aparezca "Entrenar" NO alcanza: Next pre-renderiza `/` como HTML
        # estatico, asi que ese texto esta en el shell cacheado aunque el
        # JavaScript no cargue nunca. La app instalada se quedaba en el splash y
        # este test pasaba igual. Lo unico que prueba que React esta vivo es que
        # la app REACCIONE.
        pg.locator(".tabbar button").nth(3).click()
        pg.wait_for_timeout(1200)
        check("la app RESPONDE sin red (React hidrato)",
              "e1RM" in pg.inner_text("body"),
              "el HTML esta cacheado pero el JavaScript no: cascaron muerto")
        pg.locator(".tabbar button").nth(1).click()
        pg.wait_for_timeout(1000)
        texto = pg.inner_text("body")
        check("y sin pantalla de error", "Application error" not in texto and "sin conexión a internet" not in texto.lower(),
              texto[:200])
        check("los programas locales siguen estando",
              pg.locator(".scard").count() > 0 or "Todavía no tenés ningún programa" in texto,
              "no se ve ni el programa ni el estado vacio")
        # Sin red no se puede confirmar la sesion, pero decir "Entrar" es
        # afirmar que no tenes cuenta, que es otra cosa.
        if args.cookies:
            check("no dice 'Entrar' teniendo cuenta", "Entrar" not in texto.replace("Entrenar", ""),
                  "la app se declara deslogueada solo porque no hay red")
            # El boton de cuenta no se dibujaba hasta que next-auth resolviera,
            # y sin red esa consulta se cuelga: desaparecia hasta minimizar la
            # app y volver.
            check("el botón de cuenta aparece igual", pg.locator(".acct").count() > 0,
                  "no hay boton de cuenta: espera una sesion que sin red no llega")

            # Y el Perfil tiene que abrir y decir la verdad sobre la conexion.
            pg.locator(".acct").first.click()
            pg.wait_for_timeout(2500)
            perfil = pg.inner_text("body")
            # `.flabel` va en mayuscula por CSS y inner_text devuelve lo
            # RENDERIZADO. Es la tercera vez que este detalle cuesta una corrida.
            check("el Perfil abre sin red", "CONEXIÓN" in perfil.upper(), perfil[:150])
            check("y dice que NO hay conexión", "sin conexión" in perfil.lower(),
                  "con la red cortada afirma que hay conexion")
            pg.go_back()
            pg.wait_for_timeout(1200)

        if args.shots:
            pg.screenshot(path=f"{args.shots}/pwa-offline.png")

        # La ruta del entrenador es otra pagina, no una pantalla de la SPA. Si
        # se visito con red, tiene que volver ELLA y no el shell del atleta: con
        # la direccion /entrenador en la barra y la app del atleta dibujada, el
        # error no se nota.
        pg.goto(f"{base}/entrenador", wait_until="domcontentloaded", timeout=30000)
        pg.wait_for_timeout(2500)
        check("una ruta ya visitada vuelve ELLA sin red", "Entrenador" in pg.inner_text("body"),
              pg.inner_text("body")[:150])

        print("\nla app se entera de que hay red, sin reiniciarla")
        # El pull automatico corre UNA vez al abrir. Si esa vez no habia señal
        # nadie lo reintentaba: la app se quedaba con lo local hasta reiniciar
        # del todo, aunque la conexion hubiera vuelto hacia rato.
        pg.goto(base, wait_until="domcontentloaded", timeout=30000)
        pg.wait_for_timeout(2500)
        check("sin red lo dice en pantalla", "Sin conexión" in pg.inner_text("body"),
              "no hay ningun indicador de que falta la red")

        ctx.set_offline(False)
        pg.wait_for_timeout(4000)
        check("al volver la red el aviso se va solo",
              "Sin conexión" not in pg.inner_text("body"),
              "sigue diciendo que no hay red con la red de vuelta")

        print("\nvuelve la red")
        ctx.set_offline(False)
        pg.goto(base, wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(2500)
        check("vuelve a funcionar normal", "Entrenar" in pg.inner_text("body"))
        # Regla 1: la navegacion es red-primero, asi que un deploy nuevo entra
        # sin esperar a que caduque nada.
        fresco = pg.evaluate("performance.getEntriesByType('navigation')[0]?.transferSize ?? 0")
        check("la navegacion fue a la red, no al cache", fresco > 0,
              "transferSize 0: sirvio el shell cacheado teniendo red")

        print("\nla red que no falla, solo CUELGA (el caso del telefono)")
        # `set_offline` hace fallar los pedidos al instante; el telefono sin
        # senal hace otra cosa: los deja colgados, y `navigator.onLine` sigue
        # diciendo que hay wifi. Ese es el caso que dejaba a la app afirmando
        # "con conexión" un rato largo. Se simula tomando las rutas de /api/ y
        # no contestandolas nunca.
        colgados: list = []
        ctx.route("**/api/**", lambda route: colgados.append(route))
        pg.goto(base, wait_until="domcontentloaded", timeout=30000)
        pg.wait_for_timeout(6000)
        texto = pg.inner_text("body")
        check("con la red colgada la app lo dice igual", "Sin conexión" in texto,
              "sigue afirmando que hay conexion porque nadie pregunto, solo espero")

        if args.cookies:
            pg.locator(".acct").first.click()
            pg.wait_for_timeout(5000)
            perfil = pg.inner_text("body")
            check("y el Perfil no dice lo contrario", "sin conexión" in perfil.lower(),
                  perfil[:200])
            pg.go_back()
            pg.wait_for_timeout(1000)

        # Los pedidos retenidos hay que soltarlos ANTES de cerrar el navegador:
        # si quedan pendientes, Playwright llena la salida de TargetClosedError
        # y una corrida en verde parece rota.
        for r in colgados:
            try:
                r.abort()
            except Exception:
                pass
        colgados.clear()
        ctx.unroute("**/api/**")
        pg.goto("about:blank")

        nav.close()

    if fallas:
        print(f"\n{len(fallas)} falla(s):")
        for f in fallas:
            print(f"  FALLA  {f}")
        return 1
    print("\ntodo ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
