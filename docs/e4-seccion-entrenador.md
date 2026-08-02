# E4 — Sección de entrenador

**Hecha y mergeada a main el 2026-08-02.** Lo que sigue documenta cómo quedó y
qué decisiones la sostienen. Lo pendiente está al final.

---

## Cómo quedó

- **Ruta propia `/entrenador`** (`components/coach/`), fuera del modal de Perfil.
  Layout de dos columnas arriba de 900px, una columna abajo — en el celular se ve
  la lista **o** la ficha, con "← Alumnos" para volver. La app del atleta sigue
  clavada a 430px y no se tocó.
- **El Perfil volvió a ser el Perfil**: nombre, peso corporal, sincronización y
  cerrar sesión. Queda un enlace "Entrenar a otros →" y nada más: sin él no se
  puede llegar a invitar al primer alumno, y el espacio nace al invitarlo.
- **Ficha del alumno** (`GET /api/coach/alumno`): programa y semana en curso,
  adherencia de 7 días, último entrenamiento, alerta de RIR, notas de sesión,
  tonelaje semanal y tabla de e1RM. **Se sacó la lista de calibración de kilos.**
- **`lib/coach/metrics.js`** — funciones puras, sin base ni sesión. Es lo que
  permite verificar las reglas (adherencia, desvío de RIR) sin levantar nada.
- **Notas de sesión**: `session_logs.note` existía desde v01 y **nadie escribía
  ahí**. Ahora el atleta la deja al cerrar la sesión y viaja por el push/pull.
- **Duplicar y asignar es un solo movimiento** (`POST /api/coach/asignar` con
  `duplicar: true`), que es lo que hace viable "un programa por alumno".

### Dos cosas que decidió la implementación

**El desvío de RIR se mide contra el borde del rango, no contra el punto medio.**
Un objetivo "2-3" cumplido con RIR 3 está en objetivo, no desviado 0.5. Y mira
solo la semana más reciente de ese ejercicio: promediar el ciclo entero diluye
el desvío justo cuando hay que actuar.

**La adherencia es sesiones hechas contra sesiones que tiene una semana del
programa.** No se intenta adivinar en qué días concretos debería haber entrenado
— la app no pide un calendario y fingir que lo sabe daría un número inventado.

---

## Qué existía antes de E4

Las etapas E1 a E3 de la fase 5 están hechas, verificadas y en producción:

- **Schema v03** aplicado en local y en Turso: `exercises` (catálogo con dueño) y
  `coach_invites`.
- **`lib/repo/coaching.js`** — invitar, aceptar, listar alumnos, dar de baja.
  14 checks en `scripts/verify-coaching.mjs`.
- **`lib/repo/training.js`** — `asignarPrograma`, `programasAsignados`,
  `asignacionesDeMisProgramas`, `resolveRefs`, `setRef`.
- **API**: `/api/coach` (espacio, invitar, baja), `/api/coach/asignar`
  (asignar y calibrar), `/api/invitaciones` (ver y aceptar).
- **UI**: `CoachScreen` y `AlumnoDetalle`, dentro del modal de Perfil. **E4 los
  borró**: los reemplazan `components/coach/`.
- El alumno recibe el programa asignado en modo lectura, con el nombre de quien
  se lo prescribió, y no puede editarlo.

## Qué queda pendiente

- **Adaptar el programa se sigue haciendo en la pestaña Programa de la app del
  atleta.** La sección de entrenador asigna y duplica, pero no edita ejercicios;
  para eso todavía hay que cruzar de pantalla. Es lo que falta para que el flujo
  "duplicar → adaptar → asignar" viva en un solo lugar.
- **El catálogo de ejercicios no tiene schema SQL.** Vive solo en el cliente y el
  pull lo mantiene al día con `absorberDeProgramas()`.
- **`health_consents` se registra pero no hay UI que lo pida.** La invitación lo
  graba al aceptarse; falta la pantalla que lo muestre y permita revocarlo.

---

## Decisiones tomadas — no reabrir sin motivo

**Un programa por alumno.** En 1:1 cada alumno tiene el suyo: ejercicios
distintos, series distintas, sustituciones por lesión. Personalizar es el trabajo
del entrenador, no una excepción a una plantilla. `assignment_refs` **no se
elimina** (funciona y está verificado, sirve para compartir una plantilla entre
varios) pero deja de ser el camino principal.

**Los programas se nombran por contenido**, no por alumno: "Hipertrofia 4 sem",
no "Programa Juan". El alumno ve ese nombre en su app.

**El coach trabaja online, el atleta offline.** La sección de entrenador lee del
servidor; no pasa por el localStorage que usa el atleta para entrenar sin señal.

**Sin espacios vacíos**: el espacio de entrenador nace al invitar al primero.

**La baja libera el cupo y no borra nada**: los entrenamientos son del alumno.

---

## Cosas que ya mordieron — no repetirlas

**Los ids llevan el prefijo del usuario que los subió.** Es lo que evita que dos
atletas con el SEED idéntico se pisen. Un id que **ya viene prefijado no se
vuelve a prefijar**: en un programa asignado el id del servidor es el canónico y
los dos lados hablan del mismo ejercicio. Ver `lib/sync/ids.js`.

**Traducir ids entre el coach y el servidor es donde aparecieron los bugs.** El
`GET` devuelve ids sin prefijo (como los ve el coach en su app) y la base los
tiene prefijados. Guardar o buscar con el id equivocado falla **en silencio**,
mostrando "sin referencia" como si estuviera todo bien.

**No correr `npm run build` con `next dev` levantado**: comparten `.next/` y el
manifest de client components queda inconsistente.

**Un puerto, un proyecto**: los service workers son por origen. Otra app en el
mismo puerto le sirve assets cacheados a FORGE.

**La constante `CSS` es un template string**: nada de backticks ni `${` adentro,
ni siquiera en comentarios. La sección de entrenador **no** usa esa constante:
tiene `components/coach/coach.css`, un archivo CSS de verdad, sin esa
restricción — y carga las tipografías por su cuenta, porque el `@import` de la
app del atleta no se monta en `/entrenador`.

**Los `next dev` viejos quedan vivos entre sesiones y comparten `.next/`.** Antes
de buildear: `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` filtrando
por `app-forge-v2`. En agosto había cinco servidores huérfanos de días anteriores,
uno de ellos un `next start -p 3000` contra la base de **producción**.

**Reseedear la base con el server levantado no funciona en Windows.** El cliente
libSQL mantiene el archivo abierto: el `rm` falla en silencio, las migraciones
tiran "table users already exists" y, si llega a borrarse, el server sigue
hablando con el archivo viejo. Parar el server, reseedear, levantar.

**Playwright devuelve el texto RENDERIZADO.** `.mlabel` y `.flabel` tienen
`text-transform: uppercase`, así que `"Peso corporal" in inner_text()` es False.
Comparar sin distinguir caja, o mejor: mirar el **valor** de la tarjeta y no su
rótulo — un rótulo sin número abajo es justo el bug que se está buscando.

---

## Cómo verificar

```bash
npm run verify          # 8 suites, 120 checks, sin navegador
npm run verify:metrics  # solo las metricas de la ficha (29 checks)
npm run verify:ui       # headless generico, necesita la app levantada
```

Para el flujo de dos personas, que es el que importa acá:

```bash
# 1. base de demo con un coach, dos alumnos y un ciclo entrenado.
#    Aborta si DATABASE_URL no es local: nunca contra produccion.
DATABASE_URL=file:db/demo.db node scripts/seed-demo-coach.mjs > demo.json

# 2. levantar CONTRA ESA BASE (la var del shell le gana a .env.local)
DATABASE_URL=file:db/demo.db npx next dev -p 3007

# 3. 40 checks en navegador, como el coach y como la alumna
python scripts/check_coach_ui.py --base http://localhost:3007 \
  --cookies demo.json --shots ./capturas
```

`seed-demo-coach.mjs` emite las cookies de sesión de cada persona firmando un
JWT con `NEXTAUTH_SECRET`, que es lo que evita tener que loguearse a mano dos
veces. Los últimos bugs de esta fase salieron de acá y no de leer el código.

Para probar flujos de dos usuarios sin ensuciar producción: levantar el server
con `DATABASE_URL=file:db/local.db` y generar sesiones firmando un JWT con
`NEXTAUTH_SECRET`. Hay scripts de referencia en el scratchpad de la sesión del
2026-08-02.
