"""
La pantalla Programa en un navegador de verdad: lo que un programa ASIGNADO deja
tocar, lo que la ficha de un ejercicio contesta, y con que se pregunta antes de
borrar.

    python scripts/check_programa_ui.py --base http://localhost:3000

Sin cuenta ni base: siembra el localStorage y recarga. Los tres casos que cubre
son los tres que estaban mal:

  1. Un programa de solo lectura ocultaba "+ Agregar ejercicio" y "Editar
     programa" pero dejaba el lapiz de sesiones, que ademas de renombrar BORRA
     la sesion con sus ejercicios. Los logs son `week|exId|setN`: las series ya
     registradas quedaban colgando de ejercicios inexistentes, y eso no lo
     deshace el pull que reemplaza el programa asignado.

  2. La ficha de descripcion dibujaba solo `description`. En un programa
     asignado esa ficha es lo UNICO que devuelve tocar una fila, asi que los
     ejercicios sin nota —la mayoria— abrian una caja muda.

  3. Borrar sesion y borrar programa preguntaban con `window.confirm`, la caja
     del SISTEMA operativo: bloquea la app y en una PWA instalada delata que
     abajo hay un navegador. La app ya evita eso para los avisos.

El 3 se verifica interceptando `window.confirm`: si la app lo llama, se sabe.
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


def ex(i, sess, order, name, group, **kw):
    fila = dict(id=f"e{i}", session=sess, order=order, name=name, group=group,
                sets=3, refKg=60, repsMin=8, repsMax=12, tempo="2-0-1-0",
                rest=120, rir="2", superset=None, technique=None, unit="reps",
                description="")
    fila.update(kw)
    return fila


MIO = dict(
    id="p1", name="Mi programa", weeks=4, hasDeload=True,
    sessions=[{"id": "A", "name": "Día A"}, {"id": "B", "name": "Día B"}],
    exercises=[ex(1, "A", 1, "Prensa 45", "Piernas", refKg=140),
               ex(2, "A", 2, "Curl femoral", "Isquios"),
               ex(3, "B", 1, "Press banca", "Pecho")],
    status="active", createdAt=1_740_000_000_000)

ASIGNADO = dict(
    id="p2", name="Plan de Martín", weeks=5, hasDeload=True,
    readOnly=True, coachName="Martín Sosa", assignmentId="a1",
    sessions=[{"id": "A", "name": "Día 1"}, {"id": "B", "name": "Día 2"}],
    exercises=[ex(10, "A", 1, "Press banca", "Pecho", refKg=70, rir="1",
                  description="Retracción escapular, pies firmes."),
               # El que abria la caja muda: sin una linea de nota.
               ex(11, "A", 2, "Remo con barra", "Espalda", refKg=55),
               ex(12, "A", 3, "Gemelo sentado", "Gemelos", refKg=50, repsMin=15, repsMax=20,
                  technique={"tipo": "dropset", "pasos": 2, "aplica": "ultima"})],
    status="active", createdAt=1_748_000_000_000)

ESTADO = dict(programs=[MIO, ASIGNADO], logs={}, history=[], borrados={},
              prefs={"ayudas": True, "cronometro": True, "sonido": True,
                     "vibracion": True, "notificacion": False})


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
        # En dev el overlay de Next tapa la pagina entera para el mouse.
        pg.add_init_script(
            "document.addEventListener('DOMContentLoaded', () => {"
            "  const s = document.createElement('style');"
            "  s.textContent = 'nextjs-portal{display:none!important}';"
            "  document.head.appendChild(s); });")
        # Si la app llama a `window.confirm`, queda anotado. Devuelve False para
        # que un borrado que dependa de el NO ocurra y se note dos veces.
        pg.add_init_script(
            "window.__confirms = []; window.confirm = (m) => { window.__confirms.push(m); return false; };")

        def abrir(program_id: str) -> None:
            estado = dict(ESTADO, activeProgramId=program_id)
            pg.goto(base, wait_until="networkidle", timeout=60000)
            pg.evaluate("s => localStorage.setItem('forge-v2', JSON.stringify(s))", estado)
            pg.goto(base, wait_until="networkidle", timeout=60000)
            pg.wait_for_timeout(2500)
            pg.locator(".tabbar button").nth(0).click()
            pg.wait_for_timeout(1200)

        # ---------------------------------------------------------------
        print("\nun programa asignado por un entrenador")
        abrir("p2")
        texto = pg.inner_text("body")
        check("es el programa del entrenador", "Martín Sosa" in texto, f"vi: {texto[:120]}")
        check("no ofrece agregar ejercicios", "Agregar ejercicio" not in texto)
        check("no ofrece editar el programa", "Editar programa" not in texto)
        check("y TAMPOCO el lapiz de sesiones", pg.locator(".chip-edit").count() == 0,
              "el editor de sesiones renombra y BORRA sesiones con sus ejercicios")

        # ---------------------------------------------------------------
        print("\nla ficha de un ejercicio asignado")
        pg.locator(".prow").nth(1).click()   # "Remo con barra": sin nota
        pg.wait_for_timeout(900)
        caja = pg.locator(".desc-modal")
        check("abre", caja.count() > 0)
        ficha = caja.inner_text() if caja.count() else ""
        check("dice la prescripcion aunque no haya nota", "3 × 8-12 reps" in ficha,
              f"la caja dice: {ficha!r}")
        check("y la carga de referencia", "55 kg" in ficha, f"la caja dice: {ficha!r}")
        check("y el RIR y el descanso", "RIR 2" in ficha and "descanso 2'" in ficha,
              f"la caja dice: {ficha!r}")
        pg.locator(".desc-modal .confirm-ok").click()
        pg.wait_for_timeout(500)

        pg.locator(".prow").nth(2).click()   # gemelo: con dropset
        pg.wait_for_timeout(900)
        ficha = pg.locator(".desc-modal").inner_text()
        # El chip va en mayusculas por CSS, asi que el nombre se busca sin caso.
        check("un ejercicio con tecnica la explica",
              "dropset" in ficha.lower() and "bajá el peso" in ficha,
              f"la caja dice: {ficha!r}")
        pg.locator(".desc-modal .confirm-ok").click()
        pg.wait_for_timeout(500)

        pg.locator(".prow").nth(0).click()   # press banca: con nota
        pg.wait_for_timeout(900)
        ficha = pg.locator(".desc-modal").inner_text()
        check("y con nota, siguen estando las dos cosas",
              "Retracción escapular" in ficha and "3 × 8-12 reps" in ficha,
              f"la caja dice: {ficha!r}")
        pg.locator(".desc-modal .confirm-ok").click()
        pg.wait_for_timeout(500)

        # ---------------------------------------------------------------
        print("\nborrar una sesion del programa propio")
        abrir("p1")
        check("el programa propio SI tiene el lapiz", pg.locator(".chip-edit").count() == 1,
              "se oculto de mas: en un programa propio las sesiones se editan")
        pg.locator(".chip-edit").click()
        pg.wait_for_timeout(700)
        pg.locator(".sess-del").first.click()   # "Día A" tiene 2 ejercicios
        pg.wait_for_timeout(700)

        confirms = pg.evaluate("() => window.__confirms")
        check("no usa la caja del sistema", confirms == [], f"llamo a window.confirm: {confirms}")
        caja = pg.locator(".confirm-box")
        check("pregunta con la caja de la app", caja.count() > 0)
        txt = caja.inner_text() if caja.count() else ""
        check("y dice que se lleva puesto", "2 ejercicio" in txt, f"la caja dice: {txt!r}")

        pg.locator(".confirm-cancel").click()
        pg.wait_for_timeout(800)
        quedan = pg.evaluate(
            "() => JSON.parse(localStorage.getItem('forge-v2')).programs.find(p => p.id === 'p1').sessions.length")
        check("cancelar no borra nada", quedan == 2, f"quedaron {quedan} sesiones de 2")

        pg.locator(".sess-del").first.click()
        pg.wait_for_timeout(600)
        # El atras del telefono tiene que cancelar la caja, no lo de abajo.
        pg.go_back()
        pg.wait_for_timeout(900)
        check("el atras cancela la confirmacion", pg.locator(".confirm-box").count() == 0,
              "la caja sigue abierta")
        check("y deja el editor de sesiones abierto", pg.locator(".sess-list").count() > 0,
              "el atras cerro lo de abajo en vez de la caja")

        pg.locator(".sess-del").first.click()
        pg.wait_for_timeout(600)
        pg.locator(".confirm-del").click()
        pg.wait_for_timeout(1000)
        quedan = pg.evaluate(
            "() => JSON.parse(localStorage.getItem('forge-v2')).programs.find(p => p.id === 'p1').sessions.length")
        ejercicios = pg.evaluate(
            "() => JSON.parse(localStorage.getItem('forge-v2')).programs.find(p => p.id === 'p1').exercises.length")
        check("confirmar SI borra la sesion", quedan == 1, f"quedaron {quedan} sesiones")
        check("y sus ejercicios", ejercicios == 1, f"quedaron {ejercicios} ejercicios de 1")

        for e in errores:
            check("sin errores de pagina", False, e[:200])

        nav.close()

    print()
    if fallas:
        print(f"FALLO  {len(fallas)} check(s)")
        for f in fallas:
            print(f"  - {f}")
        return 1
    print("OK  la pantalla Programa se comporta como dice")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
