# E4 — Sección de entrenador

Punto de partida para la próxima sesión. Todo lo de abajo está decidido; lo que
falta es construirlo.

---

## Qué existe hoy

Las etapas E1 a E3 de la fase 5 están hechas, verificadas y en producción:

- **Schema v03** aplicado en local y en Turso: `exercises` (catálogo con dueño) y
  `coach_invites`.
- **`lib/repo/coaching.js`** — invitar, aceptar, listar alumnos, dar de baja.
  14 checks en `scripts/verify-coaching.mjs`.
- **`lib/repo/training.js`** — `asignarPrograma`, `programasAsignados`,
  `asignacionesDeMisProgramas`, `resolveRefs`, `setRef`.
- **API**: `/api/coach` (espacio, invitar, baja), `/api/coach/asignar`
  (asignar y calibrar), `/api/invitaciones` (ver y aceptar).
- **UI**: `CoachScreen` y `AlumnoDetalle`, hoy **dentro del modal de Perfil**.
- El alumno recibe el programa asignado en modo lectura, con el nombre de quien
  se lo prescribió, y no puede editarlo.

## Qué hay que hacer

### 1. Sacar la sección de entrenador del Perfil

Sección propia con selector de alumno. El Perfil vuelve a ser lo que era: nombre,
peso corporal, sincronización y cerrar sesión.

**Responsive real**: una columna en el celular, aprovechando el ancho en la
computadora. Ojo — la app del **atleta** sigue siendo mobile-first a 430px y no
se toca. La del entrenador es otra cosa y se diseña aparte.

### 2. Ficha del alumno: métricas, no calibración

Sacar la lista de kilos por ejercicio. En su lugar, **cómo le está yendo**:

- Programa asignado y en qué semana va.
- **Adherencia**: sesiones completadas contra programadas en los últimos 7 días.
- Último entrenamiento (cuándo, cuál, cuánto duró).
- e1RM por ejercicio y tonelaje semanal — lo mismo que ve el atleta en Progreso.
- **Notas de sesión del alumno** (`session_logs.note`): es el canal de feedback
  asincrónico. El alumno no edita la prescripción pero sí deja comentarios.
- **Alerta de RIR**: si el RIR reportado promedio se desvía más de 1 punto del
  objetivo, la carga está mal calibrada. Sale de `rutina_gym.md` y de
  `forge-arquitectura.md` §7.4.

### 3. Flujo de asignación: duplicar y adaptar

El entrenador duplica un programa, lo adapta y lo asigna. Ese es el camino
principal; hoy funciona pero está repartido entre dos pantallas.

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
ni siquiera en comentarios.

---

## Cómo verificar

```bash
npm run verify          # 5 suites, ~60 checks, sin navegador
npm run verify:ui       # headless, necesita la app levantada
```

Para probar flujos de dos usuarios sin ensuciar producción: levantar el server
con `DATABASE_URL=file:db/local.db` y generar sesiones firmando un JWT con
`NEXTAUTH_SECRET`. Hay scripts de referencia en el scratchpad de la sesión del
2026-08-02.
