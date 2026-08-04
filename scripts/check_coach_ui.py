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
        # Salir del perfil es lo que mas se hace ahi y estaba al fondo, con el
        # mismo peso visual que cerrar sesion.
        check("hay un boton visible para volver a entrenar",
              a2.get_by_text("Volver a entrenar").first.is_visible())
        volver_y = a2.evaluate("document.querySelector('.volver-top')?.getBoundingClientRect().top ?? 9999")
        salir_y = a2.evaluate("[...document.querySelectorAll('button')].find(b => b.innerText.includes('Cerrar sesión'))?.getBoundingClientRect().top ?? 0")
        check("volver esta ARRIBA de cerrar sesion", volver_y < salir_y, f"volver {volver_y} vs salir {salir_y}")

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
        # Una semana que todavia no entreno: sobre una ya entrenada la app abre
        # el dialogo de re-entrenamiento en vez del health check, que es lo
        # correcto pero no es el camino que se quiere probar aca.
        a.get_by_text("S4", exact=True).first.click()
        a.wait_for_timeout(400)
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

        # ---------- adaptar el programa sin salir de la seccion ----------
        print("\neditor de programa")
        pagina.get_by_text("Adaptarle el programa").first.click()
        pagina.wait_for_timeout(2500)

        check("el editor abre con los ejercicios del programa",
              pagina.locator(".ed-fila").count() > 0,
              f"{pagina.locator('.ed-fila').count()} filas")
        check("hay selector de sesion", pagina.locator(".ed-sesiones .cbtn").count() >= 3,
              f"{pagina.locator('.ed-sesiones .cbtn').count()} sesiones")
        check("marca cuales ejercicios ya entreno",
              pagina.locator(".ed-entrenado").count() > 0,
              "ningun ejercicio marcado como ya entrenado")
        check("guardar arranca deshabilitado", pagina.get_by_text("Guardar").first.is_disabled())

        # Cambiar las series del primer ejercicio y guardar. El valor nuevo se
        # deriva del actual: la suite se corre muchas veces sobre la misma base
        # y escribir un numero fijo no cambiaria nada la segunda vez.
        series = pagina.locator(".ed-fila").first.locator(".ed-campos input").first
        objetivo = (int(series.input_value() or 3) % 6) + 2
        series.fill(str(objetivo))
        pagina.wait_for_timeout(300)
        check("al editar, guardar se habilita", not pagina.get_by_text("Guardar").first.is_disabled())

        pagina.get_by_text("Guardar").first.click()
        pagina.wait_for_timeout(2500)
        check("guarda sin error", pagina.locator(".cerror").count() == 0,
              pagina.locator(".cerror").first.inner_text() if pagina.locator(".cerror").count() else "")

        # Y llego al servidor, que es lo unico que importa.
        despues = ctx.request.get(f"{base}/api/coach/programa?programa=hip4").json()
        primero = despues["programa"]["exercises"][0]
        check("el cambio esta en el servidor", primero["sets"] == objetivo,
              f"series={primero['sets']}, esperaba {objetivo}")

        # Agregar un ejercicio que NO esta en el catalogo: se crea al vuelo.
        pagina.get_by_text("+ Agregar ejercicio").first.click()
        pagina.wait_for_timeout(400)
        nueva = pagina.locator(".ed-fila").last
        nueva.locator(".ed-ex").fill("Ejercicio inventado para el test")
        nueva.locator(".ed-ex").blur()
        pagina.wait_for_timeout(400)
        pagina.get_by_text("Guardar").first.click()
        pagina.wait_for_timeout(2500)

        conNuevo = ctx.request.get(f"{base}/api/coach/programa?programa=hip4").json()
        check("un ejercicio nuevo se crea en el catalogo al tipearlo",
              any(e["name"] == "Ejercicio inventado para el test" for e in conNuevo["programa"]["exercises"]),
              "no quedo guardado")
        check("y queda en el catalogo, reutilizable",
              any(c["name"] == "Ejercicio inventado para el test" for c in conNuevo["catalog"]),
              "no entro al catalogo")

        pagina.get_by_text("Cerrar").first.click()
        pagina.wait_for_timeout(1500)
        check("cerrar el editor vuelve a la ficha", "Adherencia" in pagina.inner_text("body").replace("ADHERENCIA", "Adherencia"))

        # ---------- lo que corrige el entrenador tiene que llegar ----------
        # El bug que esto cubre no daba error en ningun lado: el coach editaba,
        # subia, la alumna sincronizaba y seguia entrenando la version vieja.
        print("\nla correccion del entrenador llega al telefono de la alumna")

        antes = ctx3.request.get(f"{base}/api/sync").json()
        suyo = next((p for p in antes["programs"] if p.get("readOnly")), None)
        check("la alumna tiene un programa asignado", suyo is not None)

        if suyo:
            n_antes = len(suyo["exercises"])
            # El coach le saca un ejercicio y le cambia el nombre al programa.
            recortado = {**suyo, "readOnly": False,
                         "name": "Hipertrofia 4 sem (corregido)",
                         "exercises": suyo["exercises"][:-1]}
            r = ctx.request.post(f"{base}/api/sync", data={"program": recortado})
            check("el coach sube la correccion", r.status == 200, f"status {r.status}")

            despues = ctx3.request.get(f"{base}/api/sync").json()
            ahora = next((p for p in despues["programs"] if p["id"] == suyo["id"]), None)
            check("el servidor ya devuelve el programa corregido",
                  ahora and ahora["name"].endswith("(corregido)"), str(ahora and ahora["name"]))
            check("el ejercicio que saco el coach ya no viene",
                  ahora and len(ahora["exercises"]) == n_antes - 1,
                  f"{ahora and len(ahora['exercises'])} ejercicios, esperaba {n_antes - 1}")

            # Y lo que importa: que el cliente NO se quede con el viejo al mergear.
            fusionado = a.evaluate(
                """([local, remoto]) => {
                    const porId = new Map(local.map(p => [p.id, p]));
                    for (const r of remoto) {
                      const actual = porId.get(r.id);
                      if (!actual || actual.readOnly || r.readOnly) porId.set(r.id, r);
                    }
                    return [...porId.values()];
                }""",
                [[{**suyo}], [ahora]],
            )
            merged = next((p for p in fusionado if p["id"] == suyo["id"]), None)
            check("al fusionar, la alumna se queda con la version del entrenador",
                  merged and merged["name"].endswith("(corregido)"),
                  "se quedo con la version vieja")

        # ---------- una cuenta nueva no ve el programa de nadie ----------
        print("\ncuenta nueva")
        ctx6 = navegador.new_context(viewport=CELULAR)
        n, err_n, con_n = abrir(ctx6, f"{base}/")
        check("la app abre sin sesion y sin errores", not err_n and not con_n, f"{err_n or con_n}")
        texto_n = n.inner_text("body")
        check("NO aparece el programa de otra persona",
              "Mesociclo DUP" not in texto_n and "Ciclo 2" not in texto_n,
              "una instalacion nueva sigue trayendo el programa de Agustin")
        check("dice que no hay ningun programa todavia",
              "Todavía no tenés ningún programa" in texto_n or "Primero necesitás un programa" in texto_n,
              texto_n[:220])

        # Por el boton del cartel y no por la tabbar: es el camino que la app le
        # propone, y ademas el indicador de dev de Next tapa la esquina inferior
        # izquierda, que es justo donde cae la pestaña Programa.
        n.get_by_text("Ir a Programa").first.click()
        n.wait_for_timeout(800)
        prog_n = n.inner_text("body")
        check("ofrece armar uno, uno basico, o importar",
              "Crear programa" in prog_n and "básico" in prog_n and "Importar Excel" in prog_n,
              prog_n[:220])

        n.get_by_text("Fullbody 3x básico").first.click()
        n.wait_for_timeout(900)
        check("cargar el basico deja un programa usable",
              "Fullbody 3x · básico" in n.inner_text("body"), n.inner_text("body")[:200])

        # ---------- dos dispositivos del MISMO usuario ----------
        # El bug no era solo que el cambio no llegara: el dispositivo viejo
        # volvia a subir su copia y DESHACIA lo que se acababa de editar.
        print("\ndos dispositivos, un usuario")

        d1 = navegador.new_context(viewport=CELULAR)
        sesion(d1, cookies["beto"], base)

        # La suite corre muchas veces sobre la misma base: se limpia lo que Beto
        # tenga de corridas anteriores para que la seccion arranque siempre igual.
        previos = [p["id"] for p in d1.request.get(f"{base}/api/sync").json()["programs"]
                   if not p.get("readOnly")]
        if previos:
            d1.request.post(f"{base}/api/sync", data={"borrados": previos})

        p1, err1, _ = abrir(d1, f"{base}/")
        check("el primer dispositivo abre limpio", not err1, str(err1))

        # Beto no tiene programa: carga el basico en el dispositivo 1.
        p1.get_by_text("Ir a Programa").first.click()
        p1.wait_for_timeout(700)
        p1.get_by_text("Fullbody 3x básico").first.click()
        p1.wait_for_timeout(1200)
        check("el dispositivo 1 tiene el programa", "Fullbody 3x · básico" in p1.inner_text("body"))

        # Sincroniza para subirlo.
        p1.locator(".acct").first.click()
        p1.wait_for_timeout(1200)
        p1.get_by_text("Sincronizar ahora").first.click()
        p1.wait_for_timeout(3000)

        subidos = d1.request.get(f"{base}/api/sync").json()["programs"]
        check("el programa llego al servidor", any(p["name"] == "Fullbody 3x · básico" for p in subidos),
              f"{[p['name'] for p in subidos]}")

        prog = next(p for p in subidos if p["name"] == "Fullbody 3x · básico")
        nEjercicios = len(prog["exercises"])

        # El dispositivo 2 baja esa version.
        d2 = navegador.new_context(viewport=CELULAR)
        sesion(d2, cookies["beto"], base)
        p2, _, _ = abrir(d2, f"{base}/")
        p2.wait_for_timeout(2500)
        check("el dispositivo 2 lo recibe", "Fullbody 3x · básico" in p2.inner_text("body"))

        # El dispositivo 1 borra un ejercicio y sube. (Se hace por API: lo que se
        # esta probando es la resolucion del conflicto, no el editor.)
        recortado = {**prog, "exercises": prog["exercises"][:-1],
                     "updatedAt": "2030-01-01T10:00:00.000Z"}
        d1.request.post(f"{base}/api/sync", data={"program": recortado})
        tras = next(p for p in d1.request.get(f"{base}/api/sync").json()["programs"] if p["id"] == prog["id"])
        check("el borrado quedo en el servidor", len(tras["exercises"]) == nEjercicios - 1,
              f"{len(tras['exercises'])} ejercicios")

        # Y ahora lo que rompia: el dispositivo 2, con su copia vieja, sincroniza.
        p2.locator(".acct").first.click()
        p2.wait_for_timeout(1200)
        p2.get_by_text("Sincronizar ahora").first.click()
        p2.wait_for_timeout(3500)

        final = next(p for p in d2.request.get(f"{base}/api/sync").json()["programs"] if p["id"] == prog["id"])
        check("el dispositivo desactualizado NO resucita el ejercicio borrado",
              len(final["exercises"]) == nEjercicios - 1,
              f"volvieron a {len(final['exercises'])} ejercicios: la copia vieja piso la nueva")

        # ---------- borrar el ultimo programa no rompe la app ----------
        print("\nborrar programas")
        p1.get_by_text("Volver a entrenar").first.click()
        p1.wait_for_timeout(800)
        # Ir al detalle del programa y borrarlo.
        p1.on("dialog", lambda d: d.accept())
        p1.locator(".tabbar button").first.click(force=True)
        p1.wait_for_timeout(800)
        if p1.locator(".prog-card").count():
            p1.locator(".prog-card").first.click()
            p1.wait_for_timeout(600)
        editar = p1.get_by_text("Editar programa")
        if editar.count():
            editar.first.click()
            p1.wait_for_timeout(600)
            p1.get_by_text("Eliminar programa").first.click()
            p1.wait_for_timeout(1500)

        check("borrar el ultimo programa no rompe la app",
              "Todavía no tenés ningún programa" in p1.inner_text("body"),
              p1.inner_text("body")[:200])

        p1.get_by_text("Buscar mi programa").first.click()
        p1.wait_for_timeout(3500)
        check("y el borrado no vuelve al sincronizar",
              "Fullbody 3x · básico" not in p1.inner_text("body"),
              "el programa borrado reaparecio")

        # ---------- historial y progreso de quien NO creo sus programas ----------
        # `activeProgramId` quedaba en null cuando los programas llegaban por
        # sincronizacion en vez de crearse a mano. `activeProgram` caia a
        # programs[0] y la pantalla se veia bien, pero todo lo que compara
        # contra el id miraba a nadie: el Historial mostraba cero sesiones.
        print("\nprogramas que llegaron por sync")
        d3 = navegador.new_context(viewport=CELULAR)
        sesion(d3, cookies["ana"], base)
        pa, err_a, _ = abrir(d3, f"{base}/")
        pa.wait_for_timeout(2500)
        check("la app abre sin errores", not err_a, str(err_a))

        activo = pa.evaluate("""() => {
            const s = JSON.parse(localStorage.getItem('forge-v2') || '{}');
            return { id: s.activeProgramId, n: (s.programs || []).length, hist: (s.history || []).length };
        }""")
        check("hay un programa activo elegido", activo["id"] is not None,
              f"activeProgramId={activo['id']} con {activo['n']} programas")

        pa.get_by_text("Historial").first.click()
        pa.wait_for_timeout(1200)
        hist = pa.inner_text("body")
        check("el Historial muestra las sesiones sincronizadas",
              "sesiones registradas" in hist and "0 sesiones" not in hist,
              f"{activo['hist']} sesiones en local pero la pantalla dice: {hist[:120]}")

        pa.get_by_text("Progreso").first.click()
        pa.wait_for_timeout(1200)
        prog_txt = pa.inner_text("body")
        check("Progreso separa la semana en curso de las cerradas",
              "en curso" in prog_txt.lower(), "no avisa que hay una semana a medias")
        check("hay tonelaje por grupo muscular",
              "grupo muscular" in prog_txt.lower(), "falta el desglose por grupo")

        # El Δ del ciclo: sin el, cuatro numeros por fila no responden "voy bien?".
        deltas = pa.evaluate("[...document.querySelectorAll('.e1delta')].map(x => x.innerText.trim())")
        check("la tabla de e1RM trae el Δ del ciclo", any(d and d != "·" for d in deltas),
              f"{deltas[:4]}")
        check("y el Δ% al lado del absoluto", any("%" in (d or "") for d in deltas), f"{deltas[:4]}")
        check("resume cuantos ejercicios subieron",
              "subieron en el ciclo" in prog_txt or "subió en el ciclo" in prog_txt,
              "falta el resumen del ciclo")
        # Entrenar: la semana por defecto y el estado de cada chip. Arrancar
        # siempre en la 1 es un riesgo real: se registra encima de lo ya hecho.
        pa.get_by_text("Entrenar").first.click()
        pa.wait_for_timeout(1000)
        chips = pa.evaluate("[...document.querySelectorAll('.weekchips .chip')].map(c => ({cls: c.className, txt: c.innerText.trim()}))")
        activo = next((c for c in chips if " on" in c["cls"] or c["cls"].endswith("on")), None)
        check("hay una semana seleccionada al abrir", activo is not None, str(chips))
        # Lo que importa no es cual, es que NO sea una ya terminada: ahi es
        # donde se registra encima de lo que ya se entreno.
        check("la semana elegida no es una ya terminada",
              activo and "hecha" not in activo["cls"], str(activo))
        check("una semana completa se distingue", any("hecha" in c["cls"] for c in chips),
              f"ningun chip marcado como completo: {[c['cls'] for c in chips]}")

        pa.get_by_text("Progreso").first.click()
        pa.wait_for_timeout(1000)

        # Grupo muscular: selector, no doce mini-graficos apilados.
        check("el tonelaje por grupo se compara entre grupos", pa.locator(".ghrow").count() > 1,
              f"{pa.locator('.ghrow').count()} filas de grupo")
        if pa.locator(".ghrow").count():
            pa.locator(".ghrow").first.click()
            pa.wait_for_timeout(600)
            check("al elegir un grupo se ve su evolucion semanal", pa.locator(".gsem-col").count() >= 4,
                  f"{pa.locator('.gsem-col').count()} columnas")

        # Los nombres largos no pueden desaparecer detras de puntos suspensivos.
        cortados = pa.evaluate(
            "[...document.querySelectorAll('.e1name > .txt')].filter(x => x.scrollHeight > x.clientHeight + 2).length")
        check("los nombres de ejercicio entran en dos lineas", cortados == 0,
              f"{cortados} nombres siguen cortados")

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
