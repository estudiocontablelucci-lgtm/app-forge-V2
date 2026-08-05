"""
Verifica que el boton ATRAS del telefono cierre lo superpuesto antes de mover la
app de abajo.

    python scripts/check_atras_ui.py --base http://localhost:3008 --cookies demo.json

Una PWA instalada no tiene barra de navegacion: el unico atras es el del
sistema. El sintoma que motivo esto es engañoso — la caja de descripcion se
quedaba abierta y la app DE ATRAS se iba a Entrenar, asi que el gesto parecia no
hacer nada cuando en realidad hacia de mas.

`go_back()` de Playwright dispara el mismo `popstate` que el boton del sistema.
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
    args = ap.parse_args()
    base = args.base.rstrip("/")

    with sync_playwright() as p:
        nav = p.chromium.launch()
        ctx = nav.new_context(viewport={"width": 390, "height": 900})
        tok = json.load(open(args.cookies, encoding="utf-8"))["cookies"]["ana"]
        ctx.add_cookies([{"name": "next-auth.session-token", "value": tok,
                          "domain": urlparse(base).hostname, "path": "/", "httpOnly": True, "sameSite": "Lax"}])
        pg = ctx.new_page()
        pg.goto(base, wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(3500)

        def pestaña():
            """Cual pestaña esta activa, por el boton marcado en la tabbar."""
            for i in range(pg.locator(".tabbar button").count()):
                if "on" in (pg.locator(".tabbar button").nth(i).get_attribute("class") or ""):
                    return i
            return -1

        print("\ndesde Programa")
        pg.locator(".tabbar button").nth(0).click()
        pg.wait_for_timeout(1500)

        # Un ejercicio con descripcion: el badge "i" solo aparece si la tiene.
        conNota = pg.locator(".prow", has=pg.locator(".desc-hint-sm"))
        if not conNota.count():
            check("hay algun ejercicio con descripcion", False, "la demo no tiene ninguno")
            nav.close()
            return 1
        conNota.first.click()
        pg.wait_for_timeout(1000)
        check("la ficha de descripcion abre", pg.locator(".desc-modal").count() > 0)

        antes = pestaña()
        pg.go_back()
        pg.wait_for_timeout(1200)
        check("el atras CIERRA la ficha", pg.locator(".desc-modal").count() == 0,
              "la caja sigue abierta")
        check("y no mueve la app de atras", pestaña() == antes,
              f"paso de la pestaña {antes} a la {pestaña()}: el gesto hizo de mas")

        print("\ndesde Entrenar, a mitad de la sesion")
        pg.locator(".tabbar button").nth(1).click()
        pg.wait_for_timeout(1200)
        pg.locator(".scard").first.click()
        pg.wait_for_timeout(1200)
        if "Ya registraste" in pg.inner_text("body"):
            pg.get_by_role("button", name="Empezar de cero").first.click()
            pg.wait_for_timeout(1200)
        if "sentís" in pg.inner_text("body"):
            pg.locator(".navbtn.pri").first.click()
            pg.wait_for_timeout(1500)

        # Caminar hasta un ejercicio que tenga descripcion.
        abierto = False
        for _ in range(8):
            titulo = pg.locator(".excard h2.has-desc")
            if titulo.count():
                titulo.first.click()
                pg.wait_for_timeout(900)
                abierto = pg.locator(".desc-modal").count() > 0
                break
            pri = pg.locator(".navbtn.pri")
            if not pri.count() or "Siguiente" not in pri.first.inner_text():
                break
            pri.first.click()
            pg.wait_for_timeout(600)

        check("la ficha abre durante el entrenamiento", abierto,
              "no encontre un ejercicio con descripcion en la sesion")
        if abierto:
            pg.go_back()
            pg.wait_for_timeout(1200)
            check("el atras la cierra", pg.locator(".desc-modal").count() == 0)
            # Y la sesion sigue viva: cerrar la ficha no puede sacar del
            # entrenamiento, que es lo que se pierde por un gesto reflejo.
            check("y la sesion sigue abierta", pg.locator(".excard").count() > 0,
                  "salio del entrenamiento")

            # El siguiente atras SI toca la sesion, y pregunta antes.
            pg.go_back()
            pg.wait_for_timeout(1200)
            check("recien el siguiente atras pregunta si salir",
                  "Salir sin guardar" in pg.inner_text("body"),
                  "no pidio confirmacion")
            pg.go_back()
            pg.wait_for_timeout(1000)
            check("y ese atras cierra la pregunta, no la app",
                  "Salir sin guardar" not in pg.inner_text("body") and pg.locator(".excard").count() > 0,
                  "la confirmacion no se cerro o se perdio la sesion")

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
