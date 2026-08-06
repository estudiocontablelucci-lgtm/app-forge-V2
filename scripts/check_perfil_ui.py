"""
El Perfil, con una sesion real.

    python scripts/check_perfil_ui.py --base http://localhost:3008 --cookies demo.json

Contra `next start` con la base de demo:

    DATABASE_URL=file:db/demo.db node scripts/seed-demo-coach.mjs > demo.json
    DATABASE_URL=file:db/demo.db npx next start -p 3008

======================== QUE PRUEBA Y POR QUE ========================

1. Titulo y explicacion de cada preferencia en RENGLONES distintos.
   Eran dos <span> sueltos —o sea, en linea— y en pantalla se leia
   "Cronómetro de descansoArranca solo al cerrar cada serie". El check no mira
   el CSS: compara la posicion en pantalla de los dos, que es lo que se rompio.

2. Las secciones arrancan PLEGADAS y con un resumen legible sin abrirlas.
   Plegar la de conexion sin resumen esconderia el unico diagnostico que hay
   para "no abre sin señal" en un telefono sin devtools.

3. El orden: Perfil primero, despues la puerta al entrenador, despues las
   secciones de configuracion.

4. "Entrenar a otros" se ve. Era un enlace gris al fondo de la pantalla.
"""
import argparse
import json
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
    ap.add_argument("--cookies", required=True)
    ap.add_argument("--quien", default="ana")
    args = ap.parse_args()
    base = args.base.rstrip("/")

    with sync_playwright() as p:
        nav = p.chromium.launch()
        ctx = nav.new_context(viewport={"width": 390, "height": 900})
        tok = json.load(open(args.cookies, encoding="utf-8"))["cookies"][args.quien]
        ctx.add_cookies([{"name": "next-auth.session-token", "value": tok,
                          "domain": urlparse(base).hostname, "path": "/",
                          "httpOnly": True, "sameSite": "Lax"}])
        pg = ctx.new_page()
        errores: list[str] = []
        pg.on("pageerror", lambda e: errores.append(str(e)))

        pg.goto(base, wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(3000)

        print("\nabrir el Perfil")
        pg.locator("[class*=acct]").first.click()
        pg.wait_for_timeout(2500)
        check("el Perfil abrio", "Perfil" in pg.inner_text("body"), "no se llego a la pantalla")

        print("\nel orden de la pantalla")
        # Por posicion vertical real, no por orden en el DOM: lo que importa es
        # en que orden se ven.
        def y(sel):
            c = pg.locator(sel).first
            if not pg.locator(sel).count():
                return None
            caja = c.bounding_box()
            return caja["y"] if caja else None

        y_perfil, y_puerta, y_sec = y(".prof-head"), y("a.puerta"), y(".sec")
        check("Perfil va primero", y_perfil is not None and y_puerta is not None and y_perfil < y_puerta,
              f"perfil en {y_perfil}, puerta en {y_puerta}")
        check("y las secciones despues", y_sec is not None and y_puerta < y_sec,
              f"puerta en {y_puerta}, primera seccion en {y_sec}")

        print("\nlas secciones plegables")
        n = pg.locator(".sec").count()
        check("hay secciones plegables", n >= 2, f"solo {n}")
        # Los tres de abajo solo significan algo si hay secciones: sin ellas
        # darian "ok" por vacio, que es la forma mas facil de tener una suite
        # verde que no mira nada.
        if n:
            check("arrancan plegadas", pg.locator(".sec-cuerpo").count() == 0,
                  "alguna arranca abierta y la pantalla vuelve a ser un rollo")
            titulos = [pg.locator(".sec-t").nth(i).inner_text() for i in range(n)]
            check("una se llama Configuración", any("onfiguraci" in t for t in titulos), str(titulos))
            # El resumen es lo que evita que plegar signifique esconder.
            resumenes = [pg.locator(".sec-r").nth(i).inner_text() for i in range(pg.locator(".sec-r").count())]
            check("cada una dice su estado sin abrirla", len(resumenes) == n and all(r.strip() for r in resumenes),
                  str(resumenes))
            check("el estado de la conexión se lee plegado",
                  any("conexión" in r.lower() for r in resumenes), str(resumenes))

        print("\nla puerta al entrenador")
        check("existe y se ve", pg.locator("a.puerta").count() > 0,
              "volvio a ser un enlace suelto")
        if pg.locator("a.puerta").count():
            caja = pg.locator("a.puerta").first.bounding_box()
            # Un enlace de texto mide ~20px de alto; una tarjeta, mas de 50.
            check("tiene peso visual, no es un renglon de texto",
                  caja and caja["height"] > 45, f"mide {caja['height'] if caja else '?'}px de alto")

        print("\nel texto de las preferencias")
        # Si hay secciones hay que abrirlas; si no, las preferencias ya estan a
        # la vista. Este bloque tiene que correr en los dos casos: es el que
        # mira el sintoma reportado ("Cronómetro de descansoArranca solo…") y
        # saltearlo cuando no hay secciones dejaria el bug sin vigilancia.
        if n:
            pg.locator(".sec-head").first.click()
            pg.wait_for_timeout(600)
        n_pref = pg.locator(".pref").count()
        check("las preferencias estan a la vista", n_pref > 0, "no aparecio ninguna preferencia")

        pegados = []
        for i in range(n_pref):
            t = pg.locator(".pref-t").nth(i)
            d = pg.locator(".pref-d").nth(i)
            ct, cd = t.bounding_box(), d.bounding_box()
            if not ct or not cd:
                continue
            # El detalle tiene que empezar DEBAJO del titulo. En linea, los dos
            # comparten renglon y arrancan a la misma altura.
            if cd["y"] < ct["y"] + ct["height"] - 1:
                pegados.append(f"{t.inner_text()[:28]}… (titulo y={ct['y']}, detalle y={cd['y']})")
        check("cada preferencia tiene su título y su explicación en renglones distintos",
              not pegados, "; ".join(pegados))

        if n:
            print("\nplegar y desplegar")
            pg.locator(".sec-head").first.click()
            pg.wait_for_timeout(500)
            check("se vuelve a plegar", pg.locator(".pref").count() == 0,
                  "tocar el encabezado no la cerro")

        check("sin errores de JavaScript", not errores, "; ".join(errores[:3]))
        nav.close()

    print()
    if fallas:
        print(f"{len(fallas)} FALLAS\n")
        return 1
    print("todo OK\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
