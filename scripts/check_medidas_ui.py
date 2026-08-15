"""
La evolucion de las medidas en Progreso, en un navegador de verdad.

    python scripts/check_medidas_ui.py --base http://localhost:3007 --cookies demo.json

El peso vivia en el Perfil como UN numero sin fecha: al corregirlo no quedaba
rastro del anterior, asi que no habia evolucion posible — y `body_measurements`
guarda una toma por fecha desde el primer dia. El historial existia y no habia
donde verlo.

Necesita una cuenta con sesion porque las medidas van contra el servidor y no
por el localStorage: se cargan sentado despues de medirse, no en el gimnasio.
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
    ap.add_argument("--base", default="http://localhost:3007")
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
        pg.add_init_script(
            "document.addEventListener('DOMContentLoaded', () => {"
            "  const s = document.createElement('style');"
            "  s.textContent = 'nextjs-portal{display:none!important}';"
            "  document.head.appendChild(s); });")

        # domcontentloaded y no networkidle: la app consulta la sesion y
        # el ping cada tanto, asi que la red nunca queda del todo quieta.
        pg.goto(base, wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_selector(".tabbar", timeout=60000)
        pg.wait_for_timeout(2500)

        # Tres tomas con dos meses de diferencia: una sola no dibuja nada, y esa
        # es justamente la unica situacion en la que el grafico no debe aparecer.
        for fecha, peso, grasa, cintura in [("2026-06-01", 84.2, 18.4, 88.0),
                                            ("2026-07-01", 83.0, 17.6, 86.5),
                                            ("2026-08-01", 82.1, 16.9, 85.2)]:
            r = pg.request.post(f"{base}/api/medidas", data={
                "fecha": fecha,
                "valores": {"peso": peso, "grasaPct": grasa, "cintura": cintura, "altura": 178},
                "nota": "",
            })
            if not r.ok:
                check("sembrar medidas", False, f"{r.status} {r.text()[:120]}")
                nav.close()
                return 1

        pg.reload(wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_selector(".tabbar", timeout=60000)
        pg.wait_for_timeout(2500)

        print("\nProgreso muestra la evolucion")
        pg.locator(".tabbar button").nth(3).click()
        pg.wait_for_timeout(2000)
        check("el grafico esta en Progreso, no escondido tras el boton",
              pg.locator(".evo-svg").count() == 1,
              "no hay grafico de evolucion en la pestaña Progreso")
        pie = pg.locator(".evo-pie").inner_text().replace("\n", " ") if pg.locator(".evo-pie").count() else ""
        check("dice de cuanto a cuanto", "84.2kg" in pie and "82.1kg" in pie, f"el pie dice {pie!r}")
        check("y cuanto cambio", "-2.1kg" in pie and "3 mediciones" in pie, f"el pie dice {pie!r}")
        check("un punto por medicion", pg.locator(".evo-svg circle").count() == 3,
              f"{pg.locator('.evo-svg circle').count()} puntos para 3 tomas")

        print("\nuna metrica por vez")
        chips = [pg.locator(".evo").locator("xpath=preceding-sibling::div[1]").locator(".chip").nth(i).inner_text()
                 for i in range(pg.locator(".evo").locator("xpath=preceding-sibling::div[1]").locator(".chip").count())]
        check("ofrece solo las que tienen datos", "Peso" in chips and "% Grasa" in chips and "Cintura" in chips,
              f"los chips dicen {chips}")
        check("no ofrece las que no se cargaron", "FFMI" not in chips or "Masa magra" in chips,
              f"los chips dicen {chips}")
        pg.get_by_role("button", name="% Grasa").click()
        pg.wait_for_timeout(600)
        pie = pg.locator(".evo-pie").inner_text().replace("\n", " ")
        check("cambiar de metrica cambia la serie", "18.4%" in pie and "16.9%" in pie, f"el pie dice {pie!r}")
        # Bajar la grasa es mejorar; bajar el peso, DEPENDE. El color dice "fue
        # para donde queria ir", y sobre el peso la app no opina: en una
        # recomposicion ese mismo -2 kg es exactamente el plan.
        clase = pg.locator(".evo-delta").get_attribute("class") or ""
        check("bajar la grasa se lee como mejora", "up" in clase, f"la clase es {clase!r}")
        pg.get_by_role("button", name="Peso").click()
        pg.wait_for_timeout(600)
        clase = pg.locator(".evo-delta").get_attribute("class") or ""
        check("pero sobre el peso la app no opina",
              "up" not in clase and "dn" not in clase,
              f"pinta el cambio de peso como bueno o malo: {clase!r}")

        print("\nel peso salio del Perfil")
        pg.locator(".acct").click()
        pg.wait_for_timeout(1500)
        perfil = pg.inner_text("body")
        check("el Perfil ya no tiene un campo de peso editable",
              pg.locator("input.finput.mono").count() == 0,
              "sigue habiendo un input de peso suelto")
        check("pero muestra el ultimo, con su fecha",
              "82.1 kg" in perfil and "2026-08-01" in perfil,
              f"el perfil dice: {perfil[:200]!r}")
        check("y lleva a las medidas", pg.locator(".cbtn-chico").count() == 1,
              "no hay como llegar a cargarlo")

        for e in errores:
            check("sin errores de pagina", False, e[:200])
        nav.close()

    print()
    if fallas:
        print(f"FALLO  {len(fallas)} check(s)")
        for f in fallas:
            print(f"  - {f}")
        return 1
    print("OK  el peso tiene historial y se ve donde se pregunta por el")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
