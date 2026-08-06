"""
El cronometro de descanso, en un navegador de verdad.

    python scripts/check_descanso_ui.py --base http://localhost:3008

No necesita cuenta ni base de datos: el descanso es estado del cliente, asi que
la suite se siembra sola escribiendo el localStorage antes de la primera carga.

======================== QUE PRUEBA Y POR QUE ========================

Los dos sintomas reportados son distintos y se rompen por causas distintas:

1. "El cronometro se va cuando cambio de Entrenar a otra seccion."
   Lo mataba una linea en el onClick de la tabbar. Se prueba cambiando de
   pestaña y mirando si la barra sigue ahi.

2. "Deja de contar cuando salgo de la app."
   Ese es el caro. La cuenta regresiva vivia en un setInterval, y un intervalo
   se CONGELA con la pagina. Reproducirlo pide congelar la pagina de verdad —
   `Page.setWebLifecycleState: frozen` por CDP es lo que hace Chrome cuando el
   telefono se bloquea. Cortar la red o dormir el test no reproduce nada.

   Con la version vieja, congelar seis segundos y descongelar devolvia el mismo
   numero de antes: los seis segundos no los conto nadie. Con el vencimiento
   absoluto, el numero baja seis aunque no haya corrido una sola linea de JS.

3. El candado del programa abria un `alert()` del sistema operativo.
   Se prueba escuchando el evento `dialog`: si aparece uno, es el alert viejo.
"""
import argparse
import json
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

fallas: list[str] = []


def check(label: str, ok: bool, detalle: str = "") -> None:
    print(f"  {'ok ' if ok else 'FALLA'}  {label}{'' if ok else f' — {detalle}'}")
    if not ok:
        fallas.append(f"{label}: {detalle}")


# Un programa minimo con UN ejercicio y un descanso largo, para que sobre margen
# durante el congelamiento. `rest` en segundos.
ESTADO = {
    "programs": [{
        "id": "p1", "name": "Prueba", "weeks": 4, "hasDeload": False,
        "sessions": [{"id": "A", "name": "Sesion A"}],
        "exercises": [{
            "id": "e1", "session": "A", "order": 1, "name": "Press banca",
            "group": "Pecho", "sets": 3, "refKg": 60, "repsMin": 8, "repsMax": 12,
            "tempo": "2-0-1-0", "rest": 300, "rir": "2", "superset": None,
            "technique": None, "unit": "reps", "description": "",
        }],
        "status": "active", "createdAt": 0,
    }],
    "activeProgramId": "p1",
    "logs": {},
    "history": [],
}


def segundos(pg) -> int | None:
    """Lo que marca la barra, en segundos. None si no hay barra."""
    if pg.locator(".timerbar").count() == 0:
        return None
    txt = (pg.locator(".timerbar .ttime").inner_text() or "").strip()
    if ":" not in txt:
        return None
    m, s = txt.split(":")
    return int(m) * 60 + int(s)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3008")
    ap.add_argument("--congelar", type=int, default=6, help="segundos de pagina congelada")
    args = ap.parse_args()
    base = args.base.rstrip("/")

    with sync_playwright() as p:
        nav = p.chromium.launch()
        ctx = nav.new_context(viewport={"width": 390, "height": 900})
        pg = ctx.new_page()

        errores: list[str] = []
        dialogos: list[str] = []
        pg.on("pageerror", lambda e: errores.append(str(e)))
        # Si aparece un dialogo del navegador, es el alert() viejo. Se acepta
        # para que el test no se cuelgue, pero queda anotado.
        pg.on("dialog", lambda d: (dialogos.append(d.message), d.accept()))

        # Solo si no hay nada. Este script corre en CADA navegacion, asi que
        # sembrar a lo bruto pisaria el estado en el reload — y justo el reload
        # es lo que prueba que el descanso sobrevive a cerrar la app.
        pg.add_init_script(
            "try { if (!localStorage.getItem('forge-v2')) "
            "localStorage.setItem('forge-v2', JSON.stringify(%s)); } catch (e) {}"
            % json.dumps(ESTADO)
        )
        # El reloj falso se instala ANTES de cargar: despues, la app ya tomo el
        # `Date.now()` de verdad y adelantarlo no le dice nada.
        pg.clock.install()
        pg.goto(base, wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(2500)

        print("\narrancar el descanso")
        # Las pestañas se tocan por indice, nunca por texto: "Cómo llegaste a
        # entrenar" contiene "entrenar" y eso ya rompio otras suites.
        pg.locator(".tabbar button").nth(1).click()
        pg.wait_for_timeout(600)
        pg.locator(".scard").first.click()
        pg.wait_for_timeout(600)
        # Health check: se puede empezar sin responder nada.
        pg.locator(".navbtn.pri").first.click()
        pg.wait_for_timeout(800)

        check("la sesion abrio", pg.locator(".excard").count() > 0,
              "no se llego a la pantalla de entrenamiento")

        # El descanso arranca al escribir las REPS de la serie, no los kilos.
        pg.locator(".setrow").first.locator("input").nth(1).fill("10")
        pg.wait_for_timeout(900)

        t0 = segundos(pg)
        check("el descanso arranco al cargar las reps", t0 is not None and t0 > 250,
              f"la barra marca {t0}")

        # El congelamiento va PRIMERO y sin cambiar de pestaña. Son dos bugs
        # distintos y cada uno tiene que fallar por su cuenta: puesto despues,
        # la barra ya no existia (la mataba el cambio de pestaña) y este bloque
        # medía None contra None en vez de medir el atraso.
        print(f"\ncon la pagina CONGELADA {args.congelar}s (telefono bloqueado)")
        antes = segundos(pg)
        # `Page.setWebLifecycleState: frozen` por CDP NO sirve para esto: en
        # Chromium headless los intervalos siguen corriendo igual, asi que el
        # check pasaba tambien con el bug puesto — confianza falsa, que es peor
        # que no tener check. Lo que si lo reproduce es el reloj de Playwright:
        # `pause_at` deja los temporizadores quietos y `set_system_time`
        # adelanta la hora SIN dispararlos. Eso es exactamente lo que ve la app
        # cuando el telefono se bloquea: el mundo avanzo y nadie ejecuto una
        # linea de JavaScript.
        #
        # Los dos reciben SEGUNDOS, no milisegundos. Pasarle un `Date.now()`
        # crudo lo interpreta como segundos y manda el reloj al año 58.000.
        ahora = pg.evaluate("Date.now()")
        pg.clock.pause_at(ahora / 1000)
        pg.clock.set_system_time((ahora + args.congelar * 1000) / 1000)
        pg.clock.resume()
        pg.wait_for_timeout(900)
        despues = segundos(pg)

        bajo = (antes - despues) if (antes is not None and despues is not None) else None
        check("los segundos congelados SI se contaron",
              bajo is not None and bajo >= args.congelar - 1,
              f"marcaba {antes} y ahora marca {despues}: bajo {bajo}s con la hora "
              f"adelantada {args.congelar}s y los temporizadores quietos. "
              f"La cuenta regresiva se congelo con la pagina")

        print("\ncambiar de pestaña NO lo cancela")
        pg.locator(".tabbar button").nth(2).click()   # Historial
        pg.wait_for_timeout(700)
        check("sigue corriendo desde Historial", segundos(pg) is not None,
              "la barra desaparecio al salir de Entrenar — el bug reportado")

        pg.locator(".tabbar button").nth(3).click()   # Progreso
        pg.wait_for_timeout(700)
        check("y desde Progreso", segundos(pg) is not None,
              "la barra desaparecio al ir a Progreso")

        pg.locator(".tabbar button").nth(1).click()   # de vuelta a Entrenar
        pg.wait_for_timeout(700)
        check("y al volver a Entrenar sigue ahi", segundos(pg) is not None,
              "volver a Entrenar no la recupero")

        print("\nsobrevivir a que se cierre la app")
        antes_reload = segundos(pg)
        pg.reload(wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(2500)
        vuelto = segundos(pg)
        check("el descanso se restaura al reabrir",
              vuelto is not None and abs(antes_reload - vuelto) <= 6,
              f"marcaba {antes_reload} y volvio con {vuelto}")

        print("\nel candado del programa avisa con la forma de la app")
        # Tras el reload la sesion activa se pierde (vive en memoria), asi que
        # hay que volver a abrirla para que el candado tenga sentido.
        pg.locator(".tabbar button").nth(1).click()
        pg.wait_for_timeout(600)
        pg.locator(".scard").first.click()
        pg.wait_for_timeout(600)
        if pg.locator(".reentry-btn").count() > 0:
            pg.locator(".reentry-btn").first.click()   # revisar / editar
            pg.wait_for_timeout(600)
        if pg.locator(".navbtn.pri").count() > 0 and pg.locator(".hc-pill").count() > 0:
            pg.locator(".navbtn.pri").first.click()
            pg.wait_for_timeout(800)

        dialogos.clear()
        pg.locator(".tabbar button").nth(0).click()   # Programa
        pg.wait_for_timeout(700)
        pg.locator(".prow").first.click()
        pg.wait_for_timeout(700)

        check("no abre un alert() del sistema", not dialogos,
              f"aparecio un dialogo del navegador: {dialogos}")
        check("muestra el aviso propio", pg.locator(".toast").count() > 0,
              "no aparecio ningun aviso: el toque quedo sin respuesta")
        if pg.locator(".toast").count() > 0:
            check("y explica por que no se puede editar",
                  "sesión" in pg.locator(".toast").inner_text().lower(),
                  pg.locator(".toast").inner_text())

        print("\nlas ayudas")
        pg.locator(".tabbar button").nth(3).click()   # Progreso
        pg.wait_for_timeout(700)
        n_ayudas = pg.locator(".ayuda-i").count()
        check("Progreso ofrece ayuda", n_ayudas >= 2,
              f"solo {n_ayudas} ayudas: el e1RM y el tonelaje no se explican")
        if n_ayudas:
            check("cerrada no ocupa lugar", pg.locator(".ayuda-txt").count() == 0,
                  "la ayuda arranca abierta y tapa el dato")
            pg.locator(".ayuda-i").first.click()
            pg.wait_for_timeout(400)
            check("y se abre al tocarla", pg.locator(".ayuda-txt").count() > 0,
                  "tocarla no mostro nada")

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
