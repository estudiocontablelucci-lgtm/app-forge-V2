"""
Verifica el dropset en un navegador de verdad.

    python scripts/check_tecnicas_ui.py --base http://localhost:3008 --cookies demo.json

Lo que se prueba no es que exista un campo: es que en el gimnasio se vea la
diferencia entre "andá al otro ejercicio" (superserie, teal, entre tarjetas) y
"bajá el peso y seguí" (dropset, violeta, adentro de la tarjeta). Y sobre todo
que el descanso NO arranque entre escalones, que es donde la tecnica se
arruina sola.

Contra `next start`, no contra `next dev`.
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
    ap.add_argument("--shots", default="")
    args = ap.parse_args()
    base = args.base.rstrip("/")
    host = urlparse(base).hostname

    with sync_playwright() as p:
        nav = p.chromium.launch()
        ctx = nav.new_context(viewport={"width": 390, "height": 900})
        tok = json.load(open(args.cookies, encoding="utf-8"))["cookies"]["ana"]
        ctx.add_cookies([{"name": "next-auth.session-token", "value": tok,
                          "domain": host, "path": "/", "httpOnly": True, "sameSite": "Lax"}])
        pg = ctx.new_page()
        errores: list[str] = []
        pg.on("pageerror", lambda e: errores.append(str(e)))

        pg.goto(base, wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(3500)

        print("\nel programa")
        # Las pestañas se tocan por indice: "Cómo llegaste a entrenar" contiene
        # "entrenar" y get_by_text ya rompio tres suites por eso.
        pg.locator(".tabbar button").nth(0).click()
        pg.wait_for_timeout(1500)
        texto = pg.inner_text("body")
        check("el programa muestra la tecnica", "DROPSET" in texto.upper(),
              "un ejercicio con dropset se ve igual que uno sin: nadie sabe que hay que hacer")
        check("y la marca en la fila del ejercicio", pg.locator(".prow.con-tec").count() > 0,
              "la fila no lleva el borde de color")

        print("\nen Entrenar")
        pg.locator(".tabbar button").nth(1).click()
        pg.wait_for_timeout(1200)
        # La sesion se elige con su tarjeta (`.scard`), no con un chip: los
        # chips son las SEMANAS. La A es la que tiene el ejercicio con dropset.
        pg.locator(".scard").first.click()
        pg.wait_for_timeout(1200)

        # La demo ya trae esa sesion a medio hacer, asi que la app pregunta
        # antes de abrirla, y despues viene el health check. Dos pantallas antes
        # de ver un solo ejercicio.
        if "Ya registraste" in pg.inner_text("body"):
            pg.get_by_role("button", name="Empezar de cero").first.click()
            pg.wait_for_timeout(1200)
        if "Cómo te sentís" in pg.inner_text("body") or "Como te sentís" in pg.inner_text("body"):
            pg.locator(".navbtn.pri").first.click()
            pg.wait_for_timeout(1500)

        # Entrenar muestra UN bloque por vez, asi que hay que caminar hasta el
        # ejercicio que lleva la tecnica en vez de esperarlo en la primera
        # pantalla.
        tarjetas = pg.locator(".excard.con-tec")
        for _ in range(8):
            if tarjetas.count():
                break
            pri = pg.locator(".navbtn.pri")
            if not pri.count() or "Siguiente" not in pri.first.inner_text():
                break
            pri.first.click()
            pg.wait_for_timeout(700)

        check("la tarjeta del ejercicio lleva la marca", tarjetas.count() > 0,
              "sin borde violeta no se distingue de un ejercicio normal")
        check("y dice como se ejecuta", "sin descansar" in pg.inner_text("body").lower(),
              "el chip solo no alcanza: hay que decir que hacer")

        print("\nlos escalones")
        # Los escalones aparecen recien cuando la serie principal tiene reps.
        check("no aparecen antes de tiempo", pg.locator(".setrow.paso").count() == 0,
              "los escalones estan abiertos sin haber registrado la serie")

        card = tarjetas.first
        filas = card.locator(".setrow")
        total = filas.count()
        # La ULTIMA serie es la que lleva el dropset.
        ultima = filas.nth(total - 1)
        ultima.locator("input").nth(0).fill("30")
        ultima.locator("input").nth(1).fill("8")
        pg.wait_for_timeout(1200)

        pasos = card.locator(".setrow.paso")
        check("aparecen al cerrar la ultima serie", pasos.count() == 2,
              f"aparecieron {pasos.count()}, esperaba 2")

        print("\nel descanso NO arranca entre escalones")
        # Entre escalones no hay descanso: ese es el punto de la tecnica. Si el
        # timer arrancara aca, sonaria justo cuando hay que bajar el peso.
        check("con la serie principal cerrada, todavia no", pg.locator(".timerbar").count() == 0,
              "el timer arranco antes del ultimo escalon")

        pasos.nth(0).locator("input").nth(0).fill("20")
        pasos.nth(0).locator("input").nth(1).fill("6")
        pg.wait_for_timeout(900)
        check("con un escalon de dos, tampoco", pg.locator(".timerbar").count() == 0,
              "el timer arranco con un escalon pendiente")

        pasos.nth(1).locator("input").nth(0).fill("12")
        pasos.nth(1).locator("input").nth(1).fill("5")
        pg.wait_for_timeout(1200)
        check("y arranca recien con el ultimo", pg.locator(".timerbar").count() > 0,
              "cerrado el dropset entero, el descanso no arranco")

        print("\nlas cuentas")
        e1 = card.locator(".e1rmnow").inner_text() if card.locator(".e1rmnow").count() else ""
        check("el e1RM del ejercicio sigue saliendo", "e1RM" in e1, e1 or "sin e1RM al pie")

        check("la app no tiro errores", not errores, str(errores[:2]))

        if args.shots:
            pg.screenshot(path=f"{args.shots}/tecnicas.png", full_page=True)

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
