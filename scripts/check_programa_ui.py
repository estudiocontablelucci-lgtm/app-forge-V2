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

  4. Un ejercicio no se podia mover de dia ni reordenar: el modelo tiene
     `session` y `order` y el import los usa, pero el editor no los preguntaba.
     El unico camino era reimportar el Excel.

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
    # e1 y e2 van en superserie: mudar uno de dia tiene que soltarla.
    exercises=[ex(1, "A", 1, "Prensa 45", "Piernas", refKg=140, superset="e2"),
               ex(2, "A", 2, "Curl femoral", "Isquios", superset="e1"),
               ex(4, "A", 3, "Gemelo de pie", "Gemelos"),
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

# El que le escribiste a un alumno: abrirlo para revisarlo no puede cambiarte
# la rutina a vos.
DE_ALUMNOS = dict(
    id="p3", name="Recomposición — Julia", weeks=8, hasDeload=True, paraAlumnos=True,
    sessions=[{"id": "A", "name": "Torso"}],
    exercises=[ex(30, "A", 1, "Press banca", "Pecho"), ex(31, "A", 2, "Remo", "Espalda")],
    status="active", createdAt=1_745_000_000_000)

# Series registradas del gemelo: mudarlo de dia NO es sustituirlo, asi que
# conserva su id y estas series se van con el.
LOGS = {"1|e4|1": {"kg": 40, "reps": 12, "rir": "2", "done": True}}

ESTADO = dict(programs=[MIO, ASIGNADO, DE_ALUMNOS], logs=LOGS, history=[], borrados={},
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
        check("y TAMPOCO editar los dias", pg.locator(".prog-dias-btn").count() == 0,
              "el editor de sesiones renombra y BORRA sesiones con sus ejercicios")
        # Lo que un programa asignado SI tiene que dejar hacer.
        check("pero si deja entrenarlo desde aca", pg.locator(".prog-entrenar-btn").count() == 1,
              "habia que ir a Entrenar y volver a elegir el mismo dia")

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
        print("\nabrir un programa NO lo activa")
        abrir("p1")

        def activo():
            return pg.evaluate("() => JSON.parse(localStorage.getItem('forge-v2')).activeProgramId")

        pg.locator(".prog-switch-btn").click()      # a la lista
        pg.wait_for_timeout(800)
        # La tarjeta del programa que le escribi a un alumno.
        pg.get_by_text("Recomposición — Julia").click()
        pg.wait_for_timeout(1000)
        texto = pg.inner_text("body")
        check("abre el que se toco", "Recomposición — Julia" in texto)
        check("y el que se entrena sigue siendo el otro", activo() == "p1",
              f"el activo paso a ser {activo()!r} por haberlo mirado")
        check("la pantalla dice que solo lo esta revisando",
              "Lo estás revisando" in texto and "Mi programa" in texto,
              "nada distingue revisar de haberse cambiado de rutina")
        check("y dice que es para alumnos", "para tus alumnos" in texto, texto[:200])
        check("no ofrece entrenar el dia", pg.locator(".prog-entrenar-btn").count() == 0,
              "entrenar un dia de otro programa seria cambiarse de programa sin decirlo")
        boton = pg.locator(".prog-activar-btn")
        check("ofrece activarlo, con nombre", boton.inner_text().strip() == "Entrenarlo yo",
              f"dice {boton.inner_text()!r}")

        print("\neditar el que se revisa edita a ESE")
        pg.locator(".prow").first.click()
        pg.wait_for_timeout(800)
        pg.locator(".ed-donde select").nth(1).select_option(value="")   # primero del dia
        pg.wait_for_timeout(300)
        pg.locator(".sheetactions .save").click()
        pg.wait_for_timeout(1000)
        ordenes = pg.evaluate(
            "() => Object.fromEntries(JSON.parse(localStorage.getItem('forge-v2')).programs"
            ".flatMap(p => p.exercises.map(e => [p.id + ':' + e.id, e.order])))")
        check("el cambio entro en el programa que se veia", ordenes.get("p3:e30") == 1,
              f"ordenes: {ordenes}")
        check("y no toco el activo",
              ordenes.get("p1:e1") == 1 and ordenes.get("p1:e4") == 3,
              f"ordenes: {ordenes}")

        print("\nactivarlo es un acto aparte")
        boton.click()
        pg.wait_for_timeout(1000)
        check("recien ahi cambia el que se entrena", activo() == "p3", f"el activo es {activo()!r}")
        check("y la app lo dice", "Ahora entrenás" in pg.inner_text("body"),
              "cambiar de programa cambia Entrenar, Historial y Progreso sin avisar")
        check("ya no dice que lo esta revisando", "Lo estás revisando" not in pg.inner_text("body"))

        print("\nel atras vuelve a la lista, no a Entrenar")
        pg.go_back()
        pg.wait_for_timeout(1000)
        check("vuelve a la lista de programas", pg.locator(".prog-list").count() > 0,
              f"quedo en: {pg.inner_text('body')[:120]!r}")
        activa = [i for i in range(pg.locator(".tabbar button").count())
                  if "on" in (pg.locator(".tabbar button").nth(i).get_attribute("class") or "")]
        check("sin cambiar de pestaña", activa == [0], f"la pestaña activa es {activa}")
        pg.go_back()
        pg.wait_for_timeout(1000)
        activa = [i for i in range(pg.locator(".tabbar button").count())
                  if "on" in (pg.locator(".tabbar button").nth(i).get_attribute("class") or "")]
        check("y recien el siguiente atras va a Entrenar", activa == [1], f"la pestaña activa es {activa}")

        # ---------------------------------------------------------------
        print("\nlo que la fila y los chips cuentan")
        abrir("p1")
        chips = [pg.locator(".weekchips .chip").nth(i).inner_text()
                 for i in range(pg.locator(".weekchips .chip").count())]
        check("cada dia dice cuantos ejercicios tiene", chips == ["Día A3", "Día B1"],
              f"los chips dicen {chips}")
        fila = pg.locator(".prow").first.inner_text()
        check("la fila del ejercicio muestra el RIR", "RIR 2" in fila, f"la fila dice {fila!r}")
        check("y el descanso", "D 2'" in fila, f"la fila dice {fila!r}")

        print("\nentrenar el dia que se esta mirando")
        pg.locator(".weekchips .chip").nth(1).click()   # Día B: sin series cargadas
        pg.wait_for_timeout(700)
        boton = pg.locator(".prog-entrenar-btn")
        check("el boton nombra el dia", boton.inner_text().strip() == "Entrenar Día B",
              f"dice {boton.inner_text()!r}")
        boton.click()
        pg.wait_for_timeout(1200)
        activa = [i for i in range(pg.locator(".tabbar button").count())
                  if "on" in (pg.locator(".tabbar button").nth(i).get_attribute("class") or "")]
        check("lleva a Entrenar", activa == [1], f"la pestaña activa es {activa}")
        check("y arranca la sesion, no la lista de dias",
              "te sentís hoy" in pg.inner_text("body"),
              "cayo en el selector de sesion: hay que volver a elegir el mismo dia")

        print("\nun dia vacio lo dice")
        abrir("p1")
        pg.locator(".prog-dias-btn").click()
        pg.wait_for_timeout(600)
        pg.locator(".addbtn").last.click()          # agrega el día C, vacío
        pg.wait_for_timeout(500)
        pg.locator(".sheethead .x").click()
        pg.wait_for_timeout(600)
        pg.locator(".weekchips .chip").nth(2).click()
        pg.wait_for_timeout(700)
        check("un dia sin ejercicios lo explica", "Este día está vacío" in pg.inner_text("body"),
              "la lista queda vacia y no dice nada")
        check("y no ofrece entrenarlo", pg.locator(".prog-entrenar-btn").count() == 0,
              "entrar a entrenar un dia sin ejercicios no lleva a ningun lado")

        # ---------------------------------------------------------------
        print("\nmover un ejercicio de dia")
        abrir("p1")

        def ejercicios(pid="p1"):
            return pg.evaluate(
                "id => JSON.parse(localStorage.getItem('forge-v2')).programs"
                ".find(p => p.id === id).exercises", pid)

        def filas():
            return [pg.locator(".prow .pname").nth(i).inner_text().split("\n")[0]
                    for i in range(pg.locator(".prow").count())]

        pg.locator(".prow").nth(2).click()   # "Gemelo de pie", 3ro del día A
        pg.wait_for_timeout(800)
        # Por `.ed-donde` y no por indice: el editor tiene cinco selects y el de
        # Unidad ocupaba este lugar, asi que un `select` a secas pasaba tambien
        # con la pantalla vieja.
        dia = pg.locator(".ed-donde select").first
        opciones = dia.locator("option").all_inner_texts() if dia.count() else []
        check("el editor pregunta el dia", opciones == ["Día A", "Día B"],
              f"sin esto, mover de dia solo se puede reimportando el Excel — vi {opciones}")
        posicion = pg.locator(".ed-donde select").nth(1)
        check("y la posicion dentro del dia",
              posicion.locator("option").all_inner_texts()[:1] == ["— primero del día —"],
              "sin esto, un ejercicio nuevo entra siempre ultimo y ahi se queda")
        dia.select_option(label="Día B")
        pg.wait_for_timeout(400)
        pg.locator(".sheetactions .save").click()
        pg.wait_for_timeout(1200)

        exs = {e["id"]: e for e in ejercicios()}
        check("el ejercicio cambio de dia", exs["e4"]["session"] == "B",
              f"quedo en {exs['e4']['session']}")
        check("conservando su id (no es una sustitucion)", "e4" in exs)
        logs = pg.evaluate("() => JSON.parse(localStorage.getItem('forge-v2')).logs")
        check("y sus series registradas", "1|e4|1" in logs, f"los logs quedaron: {list(logs)}")
        check("cae al final del dia nuevo", exs["e4"]["order"] == 2,
              f"quedo en la posicion {exs['e4']['order']}")
        check("el dia que dejo queda numerado 1..n",
              sorted(e["order"] for e in exs.values() if e["session"] == "A") == [1, 2],
              str({e["name"]: e["order"] for e in exs.values() if e["session"] == "A"}))
        check("y la app avisa a donde se fue", "pasó a Día B" in pg.inner_text("body"),
              "el ejercicio desaparece de la pantalla sin explicacion")

        print("\nmudarse de dia suelta la superserie")
        pg.locator(".weekchips .chip").nth(0).click()   # Día A
        pg.wait_for_timeout(700)
        pg.locator(".prow").nth(0).click()              # Prensa 45, en superserie con Curl
        pg.wait_for_timeout(800)
        pg.locator(".ed-donde select").first.select_option(label="Día B")
        pg.wait_for_timeout(400)
        pg.locator(".sheetactions .save").click()
        pg.wait_for_timeout(1200)
        exs = {e["id"]: e for e in ejercicios()}
        check("el que se fue no sigue apuntando al que quedo", not exs["e1"]["superset"],
              f"apunta a {exs['e1']['superset']}")
        check("ni el que quedo al que se fue", not exs["e2"]["superset"],
              f"apunta a {exs['e2']['superset']} — una superserie con otro dia no significa nada")

        print("\nreordenar dentro del dia")
        pg.locator(".weekchips .chip").nth(1).click()   # Día B
        pg.wait_for_timeout(700)
        antes = filas()
        check("el dia B tiene tres", len(antes) == 3, str(antes))
        pg.locator(".prow").nth(2).click()              # el ultimo
        pg.wait_for_timeout(800)
        pg.locator(".ed-donde select").nth(1).select_option(value="")   # primero del dia
        pg.wait_for_timeout(400)
        pg.locator(".sheetactions .save").click()
        pg.wait_for_timeout(1200)
        despues = filas()
        check("el ultimo pasa a ser el primero", despues[0] == antes[2],
              f"antes {antes} → ahora {despues}")
        check("y los demas mantienen su orden relativo", despues[1:] == antes[:2],
              f"antes {antes} → ahora {despues}")

        # ---------------------------------------------------------------
        print("\nborrar una sesion del programa propio")
        abrir("p1")
        check("el programa propio SI deja editar los dias", pg.locator(".prog-dias-btn").count() == 1,
              "se oculto de mas: en un programa propio las sesiones se editan")
        pg.locator(".prog-dias-btn").click()
        pg.wait_for_timeout(700)
        pg.locator(".sess-del").first.click()   # "Día A" tiene 3 ejercicios
        pg.wait_for_timeout(700)

        confirms = pg.evaluate("() => window.__confirms")
        check("no usa la caja del sistema", confirms == [], f"llamo a window.confirm: {confirms}")
        caja = pg.locator(".confirm-box")
        check("pregunta con la caja de la app", caja.count() > 0)
        txt = caja.inner_text() if caja.count() else ""
        check("y dice que se lleva puesto", "3 ejercicio" in txt, f"la caja dice: {txt!r}")

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
        # `ejercicios` es el conteo del programa entero: de los 4 tienen que
        # quedar los del dia B, que es uno solo.

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
