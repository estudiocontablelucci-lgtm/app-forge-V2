"""
Recorre la seccion de entrenador en un navegador headless, como los dos usuarios.

    python scripts/check_coach_ui.py --base http://localhost:3003 --cookies demo.json

`demo.json` es la salida de `seed-demo-coach.mjs`: de ahi salen las cookies de
sesion de cada persona. Sin dos sesiones no se puede recorrer un flujo de dos
personas, y esta fase ya tuvo tres bugs que solo se veian en pantalla.

Verifica que la ficha traiga DATOS y no solo que la pagina cargue: una ficha
vacia es exactamente como se ve el bug de ids mal traducidos.

Sale con 1 si algo falla, asi que sirve para verificar y no solo para mirar.
"""
import argparse
import json
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ESCRITORIO = {"width": 1440, "height": 900}
CELULAR = {"width": 390, "height": 844}

fallas: list[str] = []


def check(label: str, ok: bool, detalle: str = "") -> None:
    print(f"  {'ok ' if ok else 'FALLA'}  {label}{'' if ok else f' — {detalle}'}")
    if not ok:
        fallas.append(f"{label}: {detalle}")


def sesion(ctx, token: str, base: str):
    host = urlparse(base).hostname
    ctx.add_cookies([{
        "name": "next-auth.session-token",
        "value": token,
        "domain": host,
        "path": "/",
        "httpOnly": True,
        "sameSite": "Lax",
    }])


def abrir(ctx, url: str):
    pagina = ctx.new_page()
    errores: list[str] = []
    consola: list[str] = []
    pagina.on("pageerror", lambda e: errores.append(str(e)))
    pagina.on("console", lambda m: consola.append(m.text) if m.type == "error" else None)
    pagina.goto(url, wait_until="networkidle", timeout=30000)
    pagina.wait_for_timeout(1500)
    return pagina, errores, consola


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--cookies", required=True, help="salida json de seed-demo-coach.mjs")
    ap.add_argument("--shots", default="")
    args = ap.parse_args()

    datos = json.loads(open(args.cookies, encoding="utf-8").read())
    cookies = datos["cookies"]
    base = args.base.rstrip("/")

    with sync_playwright() as p:
        navegador = p.chromium.launch()

        # ---------- entrenador, escritorio ----------
        print("\nentrenador — escritorio 1440x900")
        ctx = navegador.new_context(viewport=ESCRITORIO)
        sesion(ctx, cookies["coach"], base)
        pagina, errores, consola = abrir(ctx, f"{base}/entrenador")

        check("la ruta hidrata sin errores", not errores and not consola, f"{errores or consola}")
        texto = pagina.inner_text("body")
        check("aparecen los dos alumnos", "Ana Torres" in texto and "Beto Ramirez" in texto, texto[:200])

        # El ancho es la razon de que esta seccion exista aparte de la del atleta.
        ancho = pagina.evaluate("document.querySelector('.coach-layout')?.getBoundingClientRect().width || 0")
        check("aprovecha el ancho en escritorio (no queda en 430px)", ancho > 900, f"ancho {ancho}")
        cols = pagina.evaluate(
            "getComputedStyle(document.querySelector('.coach-layout')).gridTemplateColumns"
        )
        check("dos columnas en escritorio", len(cols.split()) == 2, cols)
        check("la lista y la ficha conviven",
              pagina.locator(".coach-side").is_visible() and pagina.locator(".coach-main").is_visible())

        # ---------- ficha con datos ----------
        print("\nficha de Ana")
        pagina.get_by_text("Ana Torres").first.click()
        pagina.wait_for_timeout(2500)
        ficha = pagina.inner_text("body")

        check("muestra el programa asignado", "Hipertrofia 4 sem" in ficha, ficha[:300])

        # Los rotulos van en mayuscula por CSS y inner_text devuelve lo
        # RENDERIZADO, no el markup: se compara sin distinguir caja. Y se mira
        # el valor de cada tarjeta, no el titulo — un rotulo sin numero abajo es
        # justo el bug que se esta buscando.
        def tarjeta(rotulo: str) -> str:
            return pagina.evaluate(
                """(r) => {
                    const t = [...document.querySelectorAll('.mtile')]
                        .find(x => x.querySelector('.mlabel')?.innerText.toUpperCase().includes(r));
                    return t ? t.querySelector('.mval')?.innerText.trim() : null;
                }""",
                rotulo.upper(),
            )

        semana = tarjeta("Semana en curso")
        check("la semana en curso sale de lo entrenado", semana == "2 de 4", f"dio {semana!r}, esperaba '2 de 4'")

        # El seed deja 3 sesiones dentro de la ventana (hace 5, 3 y 1 dias) y 2
        # afuera (hace 12 y 10): si contara todo el ciclo diria "5 de 3".
        ad = tarjeta("Adherencia")
        check("adherencia: cuenta la ventana de 7 dias, no el ciclo entero", ad == "3 de 3", f"dio {ad!r}")

        ultimo = tarjeta("Último entrenamiento")
        check("el ultimo entrenamiento fue ayer", ultimo == "ayer", f"dio {ultimo!r}")
        check("trae las notas del alumno", "molestia en el hombro" in ficha, "no llego la nota de la semana 2")
        check("avisa la carga mal calibrada por RIR", "Carga a revisar" in ficha and "Press militar" in ficha,
              "no salio la alerta del press militar (RIR 0 sobre objetivo 2)")
        check("dice que el militar quedo pesado", "pesado" in ficha, "el sentido del desvio salio al reves")
        check("muestra tonelaje", "Tonelaje por semana" in ficha)

        # El bug que ya mordio dos veces: la tabla existe pero todo en cero.
        check("la tabla de e1RM tiene numeros, no esta vacia", "Press banca" in ficha and "e1RM por ejercicio" in ficha)
        filas = pagina.evaluate(
            "[...document.querySelectorAll('.ctabla tbody tr')].map(r => r.innerText)"
        )
        con_numeros = [f for f in filas if any(c.isdigit() for c in f)]
        check("los e1RM no quedaron todos vacios", len(con_numeros) >= 3,
              f"{len(con_numeros)} filas con datos de {len(filas)} — ids mal traducidos?")

        check("NO hay lista de calibracion de kilos", "Kilos de" not in ficha,
              "la ficha volvio a ser una lista de kilos")
        check("ofrece duplicar y asignar", "Asignación" in ficha)

        if args.shots:
            pagina.screenshot(path=f"{args.shots}/coach-escritorio.png", full_page=True)

        # ---------- entrenador, celular ----------
        print("\nentrenador — celular 390x844")
        ctx2 = navegador.new_context(viewport=CELULAR)
        sesion(ctx2, cookies["coach"], base)
        m, errores_m, consola_m = abrir(ctx2, f"{base}/entrenador")
        check("hidrata en celular", not errores_m and not consola_m, f"{errores_m or consola_m}")

        cols_m = m.evaluate("getComputedStyle(document.querySelector('.coach-layout')).gridTemplateColumns")
        check("una sola columna en el celular", len(cols_m.split()) == 1, cols_m)
        check("con la lista visible, la ficha esta oculta", not m.locator(".coach-main").is_visible())

        m.get_by_text("Ana Torres").first.click()
        m.wait_for_timeout(2500)
        check("al elegir alumno se ve la ficha y se esconde la lista",
              m.locator(".coach-main").is_visible() and not m.locator(".coach-side").is_visible())
        check("hay como volver a la lista", m.get_by_text("← Alumnos").is_visible())

        ancho_body = m.evaluate("document.documentElement.scrollWidth")
        check("no desborda a lo ancho en el celular", ancho_body <= 390 + 1, f"scrollWidth {ancho_body}")

        if args.shots:
            m.screenshot(path=f"{args.shots}/coach-celular.png", full_page=True)

        # ---------- la app del atleta no se toco ----------
        print("\natleta — la app sigue siendo la misma")
        ctx3 = navegador.new_context(viewport=CELULAR)
        sesion(ctx3, cookies["ana"], base)
        a, errores_a, consola_a = abrir(ctx3, f"{base}/")
        check("la app del atleta hidrata", not errores_a and not consola_a, f"{errores_a or consola_a}")
        cuerpo = a.inner_text("body")
        check("sigue estando Entrenar", "Entrenar" in cuerpo)

        ancho_phone = a.evaluate("document.querySelector('.phone')?.getBoundingClientRect().width || 0")
        check("el atleta sigue clavado a 430px o menos", 0 < ancho_phone <= 430, f"ancho {ancho_phone}")

        # En escritorio la app del atleta tampoco cambia: sigue centrada a 430.
        ctx4 = navegador.new_context(viewport=ESCRITORIO)
        sesion(ctx4, cookies["ana"], base)
        a2, _, _ = abrir(ctx4, f"{base}/")
        ancho_phone2 = a2.evaluate("document.querySelector('.phone')?.getBoundingClientRect().width || 0")
        check("en escritorio el atleta tampoco se estira", ancho_phone2 == 430, f"ancho {ancho_phone2}")

        # ---------- el perfil volvio a ser el perfil ----------
        print("\nperfil del atleta")
        a2.locator(".acct").first.click()
        a2.wait_for_timeout(1200)
        # Los rotulos del perfil tambien van en mayuscula por CSS (.flabel).
        perfil = a2.inner_text("body")
        alta = perfil.upper()
        check("el perfil tiene nombre y peso corporal", "PESO CORPORAL" in alta and "NOMBRE" in alta)
        check("el perfil tiene sincronizacion", "SINCRONIZACIÓN" in alta)
        check("el perfil tiene cerrar sesion", "Cerrar sesión" in perfil)
        check("la seccion de entrenador ya NO vive adentro del perfil",
              "Invitar alumno" not in perfil and "Abrir mi espacio" not in perfil,
              "el espacio de entrenador sigue embebido en el perfil")
        check("el perfil deja llegar a la seccion de entrenador",
              a2.get_by_text("Entrenar a otros").is_visible())

        a2.get_by_text("Entrenar a otros").first.click()
        a2.wait_for_timeout(2500)
        check("desde el perfil se llega a /entrenador", "/entrenador" in a2.url, a2.url)

        # ---------- la nota: del atleta al entrenador ----------
        # Es el unico canal de vuelta del alumno y estrena plumbing en las tres
        # capas (input -> /api/sync -> session_logs.note -> ficha). Se recorre
        # entero: primero que el campo exista donde el atleta lo va a usar, y
        # despues que lo escrito llegue a la pantalla del entrenador.
        print("\nnota del alumno")

        a.get_by_text("Entrenar").first.click()
        a.wait_for_timeout(600)
        a.locator(".scard").first.click()
        a.wait_for_timeout(600)
        empezar = a.get_by_text("Empezar")
        if empezar.count():
            empezar.first.click()
            a.wait_for_timeout(600)
        a.locator(".finish-btn").first.click()
        a.wait_for_timeout(600)
        check("al terminar la sesion el atleta puede dejar una nota",
              a.locator(".note-input").is_visible(), "no aparecio el campo de nota al cerrar")
        etiqueta = a.locator(".note-input").get_attribute("placeholder") or ""
        check("la nota se ofrece como mensaje, no como campo suelto",
              "opcional" in etiqueta.lower(), f"placeholder {etiqueta!r}")

        # Ahora el camino de servidor completo, con una sesion de verdad.
        TEXTO = "Probando el canal de notas desde el celular."
        envio = ctx3.request.post(f"{base}/api/sync", data={
            "program": {
                "id": "checkui", "name": "Check UI", "weeks": 4, "hasDeload": False,
                "sessions": [{"id": "A", "name": "Torso"}],
                "exercises": [{"id": "x1", "session": "A", "order": 1, "name": "Press banca",
                               "sets": 1, "repsMin": 8, "repsMax": 10, "rir": "2-3", "unit": "reps"}],
            },
            "entry": {
                "programId": "checkui", "week": "1", "session": "A", "sessionName": "Torso",
                "date": 0, "duration": 40, "health": {"sleep": 4, "stress": 2, "energy": 4},
                "note": TEXTO,
                "exercises": [{"id": "x1", "name": "Press banca",
                               "sets": [{"setN": 1, "kg": 60, "reps": 9, "rir": 2}]}],
            },
        })
        check("la sesion con nota sube por /api/sync", envio.status == 200, f"status {envio.status}")

        # Y vuelve por el pull, para el propio atleta.
        vuelta = ctx3.request.get(f"{base}/api/sync").json()
        subida = next((h for h in vuelta.get("history", []) if h.get("note") == TEXTO), None)
        check("la nota vuelve en el pull del atleta", subida is not None,
              "la nota se perdio entre el push y el pull")

        # ---------- un alumno no entra al espacio de entrenador ----------
        print("\npermisos")
        r = ctx3.request.get(f"{base}/api/coach/alumno?alumno={datos['ana']['id']}")
        check("un atleta sin alumnos no puede leer una ficha", r.status in (403, 404), f"status {r.status}")

        r2 = ctx3.request.get(f"{base}/api/coach")
        cuerpo2 = r2.json()
        check("un atleta no ve alumnos ajenos", not cuerpo2.get("alumnos"), str(cuerpo2)[:200])

        # Beto es alumno del mismo coach, pero no puede espiar a Ana.
        ctx5 = navegador.new_context()
        sesion(ctx5, cookies["beto"], base)
        r3 = ctx5.request.get(f"{base}/api/coach/alumno?alumno={datos['ana']['id']}")
        check("un alumno no puede leer la ficha de otro", r3.status in (401, 403, 404), f"status {r3.status}")

        navegador.close()

    if fallas:
        print(f"\n{len(fallas)} falla(s):")
        for f in fallas:
            print(f"  FALLA  {f}")
        return 1
    print("\ntodo ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
