"""
El .xlsx del programa vigente, importado por el wizard de verdad.

    python scripts/check_import_ui.py --base http://localhost:3008 \
        --xlsx data/forge-programa-vigente.xlsx

======================== QUE PRUEBA Y POR QUE ========================

`gen:programa` ya hace un round-trip: relee el archivo con los helpers de
import de `ForgeApp.jsx`. Eso cubre el PARSEO, que es donde se pierden las
columnas. Lo que no cubre es el WIZARD: soltar el archivo, el auto-mapeo real,
las pantallas de confirmacion y lo que finalmente queda guardado.

Entre las dos cosas hay pasos que el round-trip no ve — el wizard resuelve las
superserie por nombre, arma las sesiones y decide semanas y deload— y ahi el
programa puede entrar "bien" y quedar distinto.

Se importa contra una instalacion LIMPIA y sin cuenta: el programa es estado
del cliente hasta que se sincroniza, asi que no hace falta sesion ni base.
"""
import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

fallas: list[str] = []


def check(label: str, ok: bool, detalle: str = "") -> None:
    print(f"  {'ok  ' if ok else 'FALLA'}  {label}{'' if ok else f' — {detalle}'}")
    if not ok:
        fallas.append(f"{label}: {detalle}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3008")
    ap.add_argument("--xlsx", default="data/forge-programa-vigente.xlsx")
    ap.add_argument("--esperado", type=int, default=36, help="ejercicios que tiene que traer")
    args = ap.parse_args()
    base = args.base.rstrip("/")
    xlsx = Path(args.xlsx).resolve()

    if not xlsx.exists():
        print(f"no esta el archivo: {xlsx}")
        return 1

    with sync_playwright() as p:
        nav = p.chromium.launch()
        ctx = nav.new_context(viewport={"width": 390, "height": 900})
        pg = ctx.new_page()
        errores: list[str] = []
        pg.on("pageerror", lambda e: errores.append(str(e)))

        pg.goto(base, wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(2500)

        print("\nabrir el wizard")
        pg.locator(".tabbar button").nth(0).click()
        pg.wait_for_timeout(1200)

        # El input de archivo NO existe hasta abrir el wizard: la pantalla vacia
        # ofrece tres caminos y el de Excel monta el suyo al tocarlo.
        abrir = pg.get_by_role("button", name="Importar Excel")
        if not abrir.count():
            abrir = pg.locator("button", has_text="Importar")
        check("esta la puerta al import", abrir.count() > 0, "no hay boton de importar Excel")
        if abrir.count():
            abrir.first.click()
            pg.wait_for_timeout(1500)

        # El input queda oculto detras del rotulo. Se lo alimenta directo:
        # `set_input_files` no necesita que sea visible.
        entrada = pg.locator("input[type=file]")
        check("hay un input de archivo en Programa", entrada.count() > 0,
              "no se encontro; el wizard cambio de forma")
        if entrada.count() == 0:
            print(pg.inner_text("body")[:600])
            nav.close()
            return 1

        entrada.first.set_input_files(str(xlsx))
        pg.wait_for_timeout(3000)

        print("\nel wizard lee el archivo")
        cuerpo = pg.inner_text("body")
        check("reconoce ejercicios", str(args.esperado) in cuerpo,
              f"no aparece '{args.esperado}' en pantalla: {cuerpo[:300]}")

        # Caminar los pasos del wizard. Los botones se buscan DENTRO del overlay
        # y no en toda la pagina: la pantalla de atras tiene su propio
        # "+ Crear programa", y el overlay se come el click sin dejar avanzar.
        for _ in range(8):
            caja = pg.locator(".overlay")
            if not caja.count():
                break
            botones = caja.first.locator("button")
            avanzo = False
            for i in range(botones.count()):
                b = botones.nth(i)
                try:
                    if not b.is_visible():
                        continue
                    t = b.inner_text().strip().lower()
                except Exception:
                    continue
                # "Vista previa" es un paso del wizard, no un desvio: es como se
                # pasa del mapeo de columnas a la confirmacion.
                if any(k in t for k in ("importar", "confirmar", "siguiente", "crear", "vista previa")):
                    b.click()
                    pg.wait_for_timeout(1800)
                    avanzo = True
                    break
            if not avanzo:
                # Sin esto el fallo llega como "no quedo nada guardado", que no
                # dice en que paso se planto ni con que botones contaba.
                visibles = []
                for i in range(botones.count()):
                    b = botones.nth(i)
                    try:
                        if b.is_visible():
                            visibles.append(b.inner_text().strip()[:40])
                    except Exception:
                        pass
                print(f"       (el wizard se planto; botones a la vista: {visibles})")
                break

        print("\nlo que quedo guardado")
        estado = pg.evaluate("JSON.parse(localStorage.getItem('forge-v2') || '{}')")
        programas = estado.get("programs") or []
        check("quedo un programa guardado", len(programas) > 0,
              "el localStorage no tiene programas: el import no llego a guardar")
        if not programas:
            print(pg.inner_text("body")[:600])
            nav.close()
            return 1

        prog = programas[-1]
        ejercicios = prog.get("exercises") or []
        sesiones = prog.get("sessions") or []

        check(f"entraron los {args.esperado} ejercicios", len(ejercicios) == args.esperado,
              f"entraron {len(ejercicios)}")
        check("entraron las 4 sesiones", len(sesiones) == 4,
              f"entraron {len(sesiones)}: {[s.get('id') for s in sesiones]}")

        # Lo que MAS se ve: el titulo del programa y lo que se toca para elegir
        # que entrenar. Sin columnas propias, el programa se llamaba como el
        # ARCHIVO y las sesiones quedaban "Sesion A" / "Sesion B".
        nombre = prog.get("name") or ""
        check("el programa NO se llama como el archivo",
              "forge-programa" not in nombre.lower() and nombre.strip() != "",
              f"quedo {nombre!r}")
        genericas = [s.get("name") for s in sesiones if str(s.get("name", "")).startswith("Sesion ")]
        check("las sesiones traen su nombre real, no 'Sesion A'", not genericas,
              f"quedaron genericas: {genericas}")
        print(f"       (programa {nombre!r} · sesiones {[s.get('name') for s in sesiones]})")

        series = sum(int(e.get("sets") or 0) for e in ejercicios)
        check("las series suman 111", series == 111, f"suman {series}")

        con_tec = [e for e in ejercicios if e.get("technique")]
        tipos = sorted({(e.get("technique") or {}).get("tipo") for e in con_tec})
        check("sobrevivieron las 4 tecnicas", len(con_tec) == 4,
              f"llegaron {len(con_tec)}: {[e.get('name') for e in con_tec]}")
        check("y son dropset + isoest", tipos == ["dropset", "isoest"],
              f"llegaron {tipos}")

        iso = [e for e in con_tec if (e.get("technique") or {}).get("tipo") == "isoest"]
        check("la isometrica llega con CERO escalones",
              all((e.get("technique") or {}).get("pasos") == 0 for e in iso),
              f"llego con {[(e.get('technique') or {}).get('pasos') for e in iso]}")

        # La superserie viaja por nombre y el wizard la re-resuelve a ids nuevos.
        por_id = {e.get("id"): e for e in ejercicios}
        ss = [e for e in ejercicios if e.get("superset")]
        mutuas = [e for e in ss if (por_id.get(e.get("superset")) or {}).get("superset") == e.get("id")]
        check("entraron los 4 pares de superserie", len(ss) == 8, f"entraron {len(ss)} filas emparejadas")
        check("y cada par se devuelve el par", len(mutuas) == len(ss),
              f"{len(ss) - len(mutuas)} apuntan a alguien que no les responde")

        sin_ref = [e for e in ejercicios if e.get("refKg") in (None, "")]
        print(f"       (refs vacias = REVISAR: {len(sin_ref)})")

        print("\nlo que el .xlsx NO puede traer")
        # La plantilla no tiene columna de semanas ni de deload: el wizard pone
        # lo que pone. Se informa para que se corrija a mano, no se da por bueno.
        check("el ciclo quedo en 4 semanas", prog.get("weeks") == 4,
              f"quedo en {prog.get('weeks')} — hay que corregirlo a mano en Programa")
        check("con deload", bool(prog.get("hasDeload")),
              "quedo sin deload — hay que activarlo a mano en Programa")

        print("\nreimportar el MISMO programa no lo duplica ni parte el historial")
        # Lo que se protege no es la copia: los logs son `week|exId|setN`, asi
        # que un id nuevo equivale a perder lo registrado de ese ejercicio. Se
        # simula haber entrenado escribiendo un log contra un id real.
        primerEx = ejercicios[0]
        pg.evaluate(
            "(exId) => { const st = JSON.parse(localStorage.getItem('forge-v2')||'{}');"
            " st.logs = { ...(st.logs||{}), ['1|' + exId + '|1']: { kg: 60, reps: 8, done: true } };"
            " localStorage.setItem('forge-v2', JSON.stringify(st)); }", primerEx.get("id"))
        pg.reload(wait_until="networkidle")
        pg.wait_for_timeout(2500)

        antesN = len(pg.evaluate("(JSON.parse(localStorage.getItem('forge-v2')||'{}').programs)||[]"))
        pg.locator(".tabbar button").nth(0).click()
        pg.wait_for_timeout(1200)
        lista = pg.get_by_role("button", name="Programas")
        if lista.count():
            lista.first.click()
            pg.wait_for_timeout(900)
        pg.get_by_role("button", name="Importar Excel").first.click()
        pg.wait_for_timeout(1500)
        pg.locator("input[type=file]").first.set_input_files(str(xlsx))
        pg.wait_for_timeout(3000)
        for _ in range(6):
            caja = pg.locator(".overlay")
            if not caja.count():
                break
            b = None
            botones = caja.first.locator("button")
            for i in range(botones.count()):
                cand = botones.nth(i)
                try:
                    if not cand.is_visible():
                        continue
                    t = cand.inner_text().strip().lower()
                except Exception:
                    continue
                # "Actualizar" antes que "Importar": es la opcion que conserva.
                if any(k in t for k in ("vista previa", "actualizar", "importar")):
                    b = cand
                    break
            if b is None:
                break
            b.click()
            pg.wait_for_timeout(2000)

        st2 = pg.evaluate("JSON.parse(localStorage.getItem('forge-v2')||'{}')")
        check("ofrecio actualizar en vez de duplicar", len(st2.get("programs") or []) == antesN,
              f"habia {antesN} programas y quedaron {len(st2.get('programs') or [])}")
        # Se mira el programa ACTIVO, no el viejo. Con el duplicado, el viejo
        # sigue ahi intacto —asi que comprobarlo pasa igual y no prueba nada— y
        # el que la app te muestra es la copia, con ids nuevos: la serie que
        # registraste no aparece por ningun lado.
        activo = [x for x in (st2.get("programs") or []) if x.get("id") == st2.get("activeProgramId")]
        check("el programa activo sigue siendo el de siempre",
              activo and activo[0].get("id") == prog.get("id"),
              f"quedo activo {activo[0].get('id') if activo else None}, no {prog.get('id')}")
        if activo:
            ids2 = {e.get("id") for e in (activo[0].get("exercises") or [])}
            check("y el ejercicio entrenado conserva su id ahí",
                  primerEx.get("id") in ids2,
                  "el ejercicio con series registradas no está en el programa activo: se perdió de la pantalla")
            check("sigue teniendo los 36 ejercicios", len(activo[0].get("exercises") or []) == 36,
                  f"quedaron {len(activo[0].get('exercises') or [])}")

        check("la app no tiro errores", not errores, str(errores[:2]))

        nav.close()

    if fallas:
        print(f"\nFALLO — {len(fallas)}:")
        for f in fallas:
            print(f"  - {f}")
        return 1
    print("\ntodo OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
