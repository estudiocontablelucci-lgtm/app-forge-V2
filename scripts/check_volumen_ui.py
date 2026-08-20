"""
Series por grupo muscular, en un navegador de verdad.

    python scripts/check_volumen_ui.py --base http://localhost:3000

Tres cosas que el verificador de nodo no ve:

  1. **Una serie con kilos y sin reps no cuenta.** Es el caso que obliga a
     contar por REPS y no por `done`: `isDone` marca true con kg O reps, y el
     campo de kilos se PRELLENA con la ref al enfocarlo — con el criterio
     ingenuo, tocar el input sumaba una serie que nadie hizo. Acá se siembra esa
     serie exacta y se comprueba que el numero no se mueve.

  2. Las dos tarjetas que dicen "por grupo" quedan CONTIGUAS. "Tonelaje por
     grupo muscular" ya existia; separadas por Medidas y Asistencia se leen como
     la misma repetida y hay que descifrar cual mirar.

  3. En Programa se muestra SOLO el plan y del programa ENTERO —sumando los dos
     dias—, no del dia que se esta mirando.
"""
import argparse
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

fallas: list[str] = []


def check(label: str, ok: bool, detalle: str = "") -> None:
    print(f"  {'ok ' if ok else 'FALLA'}  {label}{'' if ok else f' — {detalle}'}")
    if not ok:
        fallas.append(f"{label}: {detalle}")


def ex(i, sess, order, name, group, sets, **kw):
    fila = dict(id=f"e{i}", session=sess, order=order, name=name, group=group,
                sets=sets, refKg=60, repsMin=8, repsMax=12, tempo="2-0-1-0",
                rest=120, rir="2", superset=None, technique=None, unit="reps",
                description="")
    fila.update(kw)
    return fila


# Dos dias: el volumen semanal es la suma de los dos, no el del dia visible.
EJERCICIOS = [
    ex(1, "A", 1, "Prensa 45°", "Cuádriceps", 4, refKg=140),
    ex(2, "A", 2, "Press plano", "Pecho", 4, refKg=80),
    ex(3, "A", 3, "Remo T", "Espalda", 4, refKg=55),
    ex(4, "B", 1, "Dominadas", "Espalda", 4, refKg="BW"),
    ex(5, "B", 2, "Vuelos laterales", "Hombros", 4, refKg=10),
    ex(6, "B", 3, "Curl bíceps", "Bíceps", 3, refKg=15),
]
# Espalda 8 · Cuádriceps 4 · Pecho 4 · Hombros 4 · Bíceps 3 = 23 semanales
PLAN = {"Espalda": 8, "Cuádriceps": 4, "Pecho": 4, "Hombros": 4, "Bíceps": 3}

PROGRAMA = dict(
    id="p1", name="Ciclo de prueba", weeks=6, hasDeload=True,
    sessions=[{"id": "A", "name": "Día A"}, {"id": "B", "name": "Día B"}],
    exercises=EJERCICIOS, status="active", createdAt=1_740_000_000_000)


def S(kg, reps):
    return {"kg": str(kg), "reps": str(reps), "rir": "2", "done": True}


# Semana 3: el dia A entero, el B a medias. Bíceps queda en cero.
LOGS = {}
for _id, _n in [("e1", 4), ("e2", 4), ("e3", 4), ("e4", 1), ("e5", 1)]:
    for _s in range(1, _n + 1):
        LOGS[f"3|{_id}|{_s}"] = S(60, 10)
# LA SERIE QUE NO CUENTA: se toco el campo de kilos y el prefill escribio la
# ref. `done` quedo en true y no se hizo nada. Con el criterio ingenuo, Bíceps
# diria 1/3 en vez de 0/3.
LOGS["3|e6|1"] = {"kg": "15", "reps": "", "rir": "", "done": True}

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

        pg.goto(base, wait_until="networkidle", timeout=60000)
        pg.evaluate("s => localStorage.setItem('forge-v2', JSON.stringify(s))", ESTADO)
        pg.goto(base, wait_until="networkidle", timeout=60000)
        pg.wait_for_timeout(2500)

        def filas(scope) -> dict[str, str]:
            """{grupo: valor} de las filas de una tarjeta de volumen."""
            out = {}
            for f in scope.locator(".volrow").all():
                spans = f.locator("span").all_inner_texts()
                if len(spans) >= 2:
                    out[spans[0].strip()] = spans[-1].strip()
            return out

        # ---------------------------------------------------------------
        print("\nPrograma — el plan, y del programa ENTERO")
        pg.locator(".tabbar button").nth(0).click()
        pg.wait_for_timeout(1200)
        card = pg.locator(".prog-volumen")
        check("la tarjeta esta", card.count() > 0, "no se dibujo el volumen en Programa")
        if card.count():
            f = filas(card)
            check("suma los dos dias, no solo el que se mira",
                  f.get("Espalda") == "8",
                  f"Espalda dice {f.get('Espalda')} (4 en el día A + 4 en el B)")
            check("son las series planificadas, sin barra de lo hecho",
                  card.locator(".volreal").count() == 0,
                  "aparecio la barra de lo hecho en la pantalla de la prescripcion")
            check("ordena por volumen, no alfabetico",
                  list(f.keys())[0] == "Espalda",
                  f"el orden es {list(f.keys())}")
            check("el total es la suma semanal",
                  "23" in card.locator(".fhint").last.inner_text(),
                  card.locator(".fhint").last.inner_text())

        # ---------------------------------------------------------------
        print("\nProgreso — el plan contra lo hecho")
        pg.locator(".tabbar button").nth(3).click()
        pg.wait_for_timeout(1500)
        card = pg.locator(".card").filter(
            has=pg.locator(".cardtitle", has_text="Series por grupo")).first
        check("la tarjeta esta", card.count() > 0, "no se dibujo el volumen en Progreso")
        if card.count():
            check("dice de que semana habla",
                  "SEM 3" in card.locator(".cardtitle").inner_text().upper(),
                  card.locator(".cardtitle").inner_text())
            f = filas(card)
            check("un grupo a medias muestra los dos numeros",
                  f.get("Espalda") == "5/8", f"Espalda dice {f.get('Espalda')}")
            check("un grupo completo tambien",
                  f.get("Cuádriceps") == "4/4", f"Cuádriceps dice {f.get('Cuádriceps')}")

            # EL CASO: kg cargado por el prefill, sin reps. No se hizo nada.
            check("una serie con kilos y SIN REPS no cuenta",
                  f.get("Bíceps") == "0/3",
                  f"Bíceps dice {f.get('Bíceps')} — el prefill del campo de kg sumo una serie")

            check("el total tampoco la cuenta",
                  "14" in card.locator(".fhint").last.inner_text(),
                  card.locator(".fhint").last.inner_text())

        print("\nlas dos tarjetas 'por grupo' van juntas")
        titulos = [t.strip().upper() for t in pg.locator(".cardtitle").all_inner_texts()]
        try:
            i = next(n for n, t in enumerate(titulos) if t.startswith("SERIES POR GRUPO"))
            j = next(n for n, t in enumerate(titulos) if t.startswith("TONELAJE POR GRUPO"))
            check("una al lado de la otra", j == i + 1,
                  f"hay {j - i - 1} tarjeta(s) en el medio: {titulos[i + 1:j]}")
            check("y las series van primero, que son las unicas con vara", i < j,
                  "el tonelaje por grupo quedo arriba")
        except StopIteration:
            check("las dos tarjetas existen", False, f"titulos: {titulos}")

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
