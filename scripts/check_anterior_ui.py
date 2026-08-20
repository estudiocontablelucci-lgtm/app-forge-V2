"""
La vez pasada, en un navegador de verdad.

    python scripts/check_anterior_ui.py --base http://localhost:3000

Lo que cubre no es que el numero aparezca: es que aparezca EL numero correcto y
que **no toque el prellenado**. Son cuatro cosas y las cuatro fallaban o no
existian antes de `lib/anterior.js`:

  1. La serie de la vez pasada se MUESTRA bajo su columna. El dato estaba
     guardado en `logs` desde el primer dia y Entrenar solo mostraba la
     prescripcion (`Ref: 140kg × 8-10`), asi que se decidia de memoria.

  2. **El prellenado sigue saliendo del PROGRAMA.** Es la restriccion del
     hallazgo: FORGE es un programa EJECUTADO, no un log. Si el campo se llenara
     con lo de la vez pasada, el mesociclo derivaria solo a repetir carga y el
     deload —que es -40% a proposito— quedaria anulado sin que nadie lo note.
     Este es el check que protege esa decision, y por eso entra en el deload:
     ahi los dos numeros son distintos y confundirlos se ve.

  3. Salta la semana en que ese ejercicio no se entreno. La version anterior
     miraba `week - 1` y se rendia.

  4. El deload compara contra la ultima semana NORMAL del programa. La version
     anterior tenia un `4` escrito a mano, asi que en un programa de 6 semanas
     miraba la 4 y no encontraba nada.

El programa sembrado tiene 6 semanas a proposito: con 4 el `4` hardcodeado
acertaba por casualidad y el caso no probaba nada.
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


def ex(i, order, name, group, **kw):
    fila = dict(id=f"e{i}", session="A", order=order, name=name, group=group,
                sets=3, refKg=100, repsMin=8, repsMax=12, tempo="2-0-1-0",
                rest=120, rir="2", superset=None, technique=None, unit="reps",
                description="")
    fila.update(kw)
    return fila


# Seis semanas: con cuatro, el `4` escrito a mano de la version vieja acertaba
# de casualidad y el caso del deload no probaria nada.
PROGRAMA = dict(
    id="p1", name="Ciclo de prueba", weeks=6, hasDeload=True,
    sessions=[{"id": "A", "name": "Día A"}],
    exercises=[
        ex(1, 1, "Prensa 45", "Cuádriceps", refKg=140),
        ex(2, 2, "Press plano", "Pecho", refKg=80),
        ex(3, 3, "Dominadas", "Espalda", refKg="BW", repsMin=6, repsMax=10),
    ],
    status="active", createdAt=1_740_000_000_000)


def S(kg, reps, rir):
    return {"kg": str(kg), "reps": str(reps), "rir": str(rir), "done": True}


LOGS = {
    # e1: entrenado en la Sem 1 y NO en la 2. Entrenando la 3, la comparacion
    # tiene que salir de la Sem 1 — la version vieja miraba la 2 y no mostraba nada.
    "1|e1|1": S(130, 10, 2), "1|e1|2": S(130, 9, 2), "1|e1|3": S(130, 8, 1),
    # e2: entrenado en las dos. Gana la mas reciente, y NO se mezclan: en la
    # Sem 2 solo hay una serie, asi que la S2 y la S3 de hoy no tienen con que
    # compararse aunque la Sem 1 las tenga.
    "1|e2|1": S(70, 12, 3), "1|e2|2": S(70, 11, 2), "1|e2|3": S(70, 10, 2),
    "2|e2|1": S(75, 10, 2),
    # e3: dominadas. El campo de kilos es el LASTRE y quedo vacio: es peso
    # corporal solo, no un dato que falta.
    "2|e3|1": {"kg": "", "reps": "9", "rir": "1", "done": True},
    # Sem 6: la ultima semana NORMAL. Es contra esta que compara el deload.
    "6|e1|1": S(155, 6, 1),
}

ESTADO = dict(programs=[PROGRAMA], activeProgramId="p1", logs=LOGS, history=[], borrados={},
              prefs={"ayudas": True, "cronometro": False, "sonido": False,
                     "vibracion": False, "notificacion": False})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    args = ap.parse_args()
    base = args.base.rstrip("/")

    with sync_playwright() as p:
        nav = p.chromium.launch()
        ctx = nav.new_context(viewport={"width": 390, "height": 900})
        pg = ctx.new_page()
        errores: list[str] = []
        pg.on("pageerror", lambda e: errores.append(str(e)))
        pg.add_init_script(
            "document.addEventListener('DOMContentLoaded', () => {"
            "  const s = document.createElement('style');"
            "  s.textContent = 'nextjs-portal{display:none!important}';"
            "  document.head.appendChild(s); });")

        def abrir_semana(etiqueta: str) -> None:
            """Siembra, entra a Entrenar, elige la semana y abre el dia."""
            pg.goto(base, wait_until="networkidle", timeout=60000)
            pg.evaluate("s => localStorage.setItem('forge-v2', JSON.stringify(s))", ESTADO)
            pg.goto(base, wait_until="networkidle", timeout=60000)
            pg.wait_for_timeout(2500)
            # Las pestañas se tocan por indice: "Cómo llegaste a entrenar"
            # contiene "entrenar" y eso ya rompio otras suites.
            pg.locator(".tabbar button").nth(1).click()
            pg.wait_for_timeout(600)
            # El chip dice "S3", no "Sem 3", y puede traer pegado un badge de
            # estado ("✓" o "1/3"): comparar el texto entero no encuentra nada.
            chips = pg.locator(".weekchips .chip")
            encontrado = False
            for i in range(chips.count()):
                if chips.nth(i).inner_text().split()[0].strip() == etiqueta:
                    chips.nth(i).click()
                    encontrado = True
                    break
            if not encontrado:
                textos = [c.strip() for c in chips.all_inner_texts()]
                raise AssertionError(f"no hay chip de semana '{etiqueta}' entre {textos}")
            pg.wait_for_timeout(500)
            pg.locator(".scard").first.click()
            pg.wait_for_timeout(600)
            if pg.locator(".reentry-btn").count() > 0:
                pg.locator(".reentry-btn").first.click()
                pg.wait_for_timeout(600)
            # Health check: se puede empezar sin responder nada.
            if pg.locator(".navbtn.pri").count() > 0 and pg.locator(".hc-pill").count() > 0:
                pg.locator(".navbtn.pri").first.click()
                pg.wait_for_timeout(900)

        def siguiente() -> None:
            """Entrenar muestra UN bloque por vez. Se avanza con el boton, no
            con los puntos de arriba: son de 8px y el click no siempre entra."""
            pg.locator(".navbtn.pri").first.click()
            pg.wait_for_timeout(700)

        def tarjeta(nombre: str):
            return pg.locator(".excard").filter(has=pg.locator("h2", has_text=nombre)).first

        def antes_de(card, i: int) -> list[str] | None:
            """Los cuatro textos de la linea `.antes` de la serie i (0-based)."""
            fila = card.locator(".antes").nth(i)
            if fila.count() == 0:
                return None
            return [s.strip() for s in fila.locator("span").all_inner_texts()]

        # ---------------------------------------------------------------
        print("\nSemana 3 — la ultima semana CON DATOS, no la literal anterior")
        abrir_semana("S3")
        check("la sesion abrio", pg.locator(".excard").count() > 0,
              "no se llego a la pantalla de entrenamiento")

        prensa = tarjeta("Prensa")
        # BUG 1: e1 no se entreno en la Sem 2. La version vieja miraba la 2 y
        # devolvia null, asi que no dibujaba nada.
        fila = antes_de(prensa, 0)
        check("salta la semana sin datos y muestra la Sem 1",
              fila is not None and fila[1] == "130" and fila[2] == "10",
              f"la linea dice {fila}")
        check("la cabecera dice DE CUANDO es, escrito y no en un title",
              "Sem 1" in prensa.locator(".pv-mini").inner_text()
              if prensa.locator(".pv-mini").count() else False,
              prensa.locator(".pv-mini").inner_text() if prensa.locator(".pv-mini").count() else "no hay cabecera")

        print("\nel prellenado NO sale de la vez pasada")
        kg = prensa.locator(".setrow").first.locator("input").first
        kg.click()
        pg.wait_for_timeout(400)
        v = kg.input_value().strip()
        check("al enfocar, el campo se llena con la REF del programa",
              v == "140", f"el campo quedo en '{v}' (la ref es 140)")
        check("y NO con lo que se hizo la vez pasada",
              v != "130", "el campo tomo los 130 kg de la Sem 1")

        print("\nlos otros ejercicios del dia")
        siguiente()
        press = tarjeta("Press plano")
        check("gana la semana mas reciente (Sem 2, no Sem 1)",
              (antes_de(press, 0) or [None, None])[1] == "75",
              f"la S1 dice {antes_de(press, 0)}")
        check("y NO mezcla semanas: la S2 no tiene comparacion",
              antes_de(press, 1) is None,
              f"la S2 trajo {antes_de(press, 1)} de otra semana")

        siguiente()
        domi = tarjeta("Dominadas")
        # El campo es el LASTRE: un vacio ahi es peso corporal solo, no un hueco.
        check("en dominadas el lastre vacio se lee BW, no un guion",
              (antes_de(domi, 0) or [None, None])[1] == "BW",
              f"la linea dice {antes_de(domi, 0)}")

        # ---------------------------------------------------------------
        print("\nSemana 1 — no hay con que comparar")
        abrir_semana("S1")
        check("sin semanas atras no se dibuja la linea",
              tarjeta("Prensa").locator(".antes").count() == 0,
              "aparecio una comparacion en la primera semana")

        # ---------------------------------------------------------------
        print("\nDeload — compara contra la ultima semana NORMAL")
        abrir_semana("Deload")
        prensa = tarjeta("Prensa")
        fila = antes_de(prensa, 0)
        # BUG 2: `week === "DL" ? 4` miraba la Sem 4 de un programa de 6.
        check("en un programa de 6 semanas mira la 6, no la 4",
              fila is not None and fila[1] == "155",
              f"la linea dice {fila}")
        check("la cabecera lo dice",
              "Sem 6" in prensa.locator(".pv-mini").inner_text()
              if prensa.locator(".pv-mini").count() else False,
              prensa.locator(".pv-mini").inner_text() if prensa.locator(".pv-mini").count() else "no hay cabecera")

        # En el deload la ref BAJA (-40% por series es el default, pero el
        # metodo puede tocar los kilos): lo que importa es que el campo no se
        # llene con los 155 de la Sem 6. Ahi confundir la referencia con el
        # prellenado se ve a simple vista.
        kg = prensa.locator(".setrow").first.locator("input").first
        kg.click()
        pg.wait_for_timeout(400)
        v = kg.input_value().strip()
        check("y el campo del deload no toma los kilos de la Sem 6",
              v != "155", f"el campo quedo en '{v}'")

        check("sin errores de JavaScript", not errores, "; ".join(errores[:3]))

        ctx.close()
        nav.close()

    print()
    if fallas:
        print(f"{len(fallas)} FALLAS\n")
        return 1
    print("todo OK\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
