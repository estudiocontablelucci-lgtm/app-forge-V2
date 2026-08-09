"""
Un programa que llega con referencias al catalogo de OTRA cuenta.

    python scripts/check_huerfanos_ui.py --base http://localhost:3008 \
        --cookies demo.json

======================== QUE PRUEBA Y POR QUE ========================

`program_exercises.exercise_id` es una FK a `exercises`. Un solo ejercicio
apuntando a una entrada que este usuario no tiene hace fallar el INSERT del
PROGRAMA ENTERO con `FOREIGN KEY constraint failed` — y como el push se
reintenta en cada sincronizacion, **falla siempre igual**.

Paso en produccion el 2026-08-09: un programa con 16 referencias huerfanas no
subio nunca, y la app decia "Sincronizado · 4 programas" sin mencionarlo. Se
descubrio leyendo los logs del servidor; en un telefono no hay logs.

LA CAUSA estaba en el guard de la migracion al cargar:

    const faltaMigrar = programs.some(p => p.exercises.some(e => !e.exerciseId));
    if (state.catalog && !faltaMigrar) return state;

Solo preguntaba si el id FALTA, nunca si APUNTA A ALGO QUE EXISTE. Un programa
que llega de otra cuenta, otro navegador o un respaldo trae sus `exerciseId`
puestos, asi que `faltaMigrar` daba false y el estado se devolvia tal cual —
incoherente, y sin que nada lo reparara nunca.

Se siembra exactamente eso: un programa con `exerciseId` que no existe en el
catalogo de esta cuenta.
"""
import argparse
import json
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

fallas: list[str] = []


def check(label: str, ok: bool, detalle: str = "") -> None:
    print(f"  {'ok  ' if ok else 'FALLA'}  {label}{'' if ok else f' — {detalle}'}")
    if not ok:
        fallas.append(f"{label}: {detalle}")


PROG_ID = "p-huerfanos-check"
# Nombres que no pueden estar en ningun catalogo, para que la reparacion no
# pueda resolverlos "por nombre" y tenga que soltarlos o darlos de alta.
NOMBRES = ["Xilofono bulgaro", "Prensa de antimateria", "Curl de Schrodinger"]

MIRAR = """
(() => {
  const st = JSON.parse(localStorage.getItem('forge-v2')||'{}');
  const p = (st.programs||[]).find(x => x.id === '%s');
  const ids = new Set((st.catalog||[]).map(c => c.id));
  const refs = (p?.exercises||[]).map(e => e.exerciseId ?? null);
  return {
    existe: !!p,
    catalogo: (st.catalog||[]).length,
    huerfanas: refs.filter(r => r && !ids.has(r)),
  };
})()
""" % PROG_ID


def programa() -> dict:
    return {
        "id": PROG_ID, "name": "Con referencias ajenas", "weeks": 4, "hasDeload": True,
        "sessions": [{"id": "A", "name": "A"}],
        "exercises": [
            {"id": f"h{i}", "session": "A", "order": i + 1, "name": n, "group": "Otros",
             "sets": 3, "refKg": 20, "repsMin": 8, "repsMax": 10, "tempo": "", "rest": 90,
             "rir": "2", "superset": None, "technique": None, "unit": "reps",
             "description": "",
             # LA CLAVE: la referencia YA viene puesta, y apunta a un catalogo
             # que esta cuenta no tiene.
             "exerciseId": f"ex-de-otra-cuenta-{i}"}
            for i, n in enumerate(NOMBRES)
        ],
        "status": "active", "createdAt": 0,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3008")
    ap.add_argument("--cookies", required=True)
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

        # Fase 1: la app arranca sola y deja su catalogo, como una instalacion
        # que ya sincronizo. Sembrar sin catalogo probaria otra cosa.
        pg.goto(base, wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(12000)
        previo = pg.evaluate("JSON.parse(localStorage.getItem('forge-v2')||'{}')")
        check("la app tiene catalogo antes de empezar", len(previo.get("catalog") or []) > 0,
              "sin catalogo previo el test no reproduce el caso")

        # Fase 2: se agrega el programa ajeno SIN tocar el catalogo.
        pg.evaluate(
            "(prog) => { const st = JSON.parse(localStorage.getItem('forge-v2')||'{}');"
            " st.programs = [...(st.programs||[]), prog]; st.activeProgramId = prog.id;"
            " localStorage.setItem('forge-v2', JSON.stringify(st)); }", programa())

        print("\nal cargar, ANTES de sincronizar")
        pg.reload(wait_until="networkidle")
        pg.wait_for_timeout(1500)
        alCargar = pg.evaluate(MIRAR)
        check("el programa esta", alCargar["existe"], "se perdio al cargar")
        # Esta es la comprobacion que falla con el guard viejo: la reparacion
        # tiene que pasar al CARGAR, no recien al subir.
        check("no quedan referencias huérfanas", not alCargar["huerfanas"],
              f"{len(alCargar['huerfanas'])} apuntan a nada: {alCargar['huerfanas']}")

        print("\ndespués de sincronizar")
        pg.wait_for_timeout(13000)
        despues = pg.evaluate(MIRAR)
        check("sigue sin huérfanas", not despues["huerfanas"], f"{despues['huerfanas']}")

        d = pg.evaluate("fetch('/api/sync',{cache:'no-store'}).then(r=>r.json())")
        remoto = [x for x in (d.get("programs") or []) if x.get("id", "").endswith(PROG_ID)]
        # Lo que de verdad importa: que HAYA SUBIDO. Con una referencia rota el
        # servidor devuelve 500 y el programa no llega nunca.
        check("el programa llegó al servidor", len(remoto) == 1,
              f"hay {len(remoto)} copias: la FK lo rechazo y el push falla para siempre")
        if remoto:
            check("con sus 3 ejercicios, no menos", len(remoto[0].get("exercises") or []) == 3,
                  f"llegaron {len(remoto[0].get('exercises') or [])}")

        check("sin errores de JavaScript", not errores, "; ".join(errores[:2]))
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
