# FORGE — Gym Training Tracker

App de tracking de entrenamiento para gimnasio. Reemplaza el sistema de Google Sheets con una interfaz mobile-first optimizada para usar en el gym.

## Live

Pendiente de conectar a Vercel. La URL de GitHub Pages
(`estudiocontablelucci-lgtm.github.io/app-forge-V2/`) quedo congelada en la fase 3:
GitHub Pages solo sirve archivos estaticos y no puede correr NextAuth ni la API de sync.

> El deploy sale de `main`. Una rama feature commiteada **no** esta en produccion
> hasta que se mergea y se pushea a `main`.

## Stack

- Next.js 15 (App Router) + React 19, JSX sin TypeScript
- CSS embebido como template string — sin build de estilos aparte
- localStorage (`forge-v2`) con migracion automatica v1 -> v2
- `xlsx` (SheetJS) para import/export client-side
- Turso / libSQL para la persistencia real — schema aplicado, capa de datos lista
- NextAuth v4: Google OAuth + magic link por Resend
- Vercel (region `dub1`, junto a la base)

> Fase 4 a medias, a proposito: la infraestructura esta y verificada, pero la UI todavia
> lee y escribe en localStorage. Falta el puente (`/api/sync` + migracion inicial).

## Features actuales

- **Programas multiples**: crear vacio, desde plantilla predefinida, duplicar, eliminar
- **Programa**: 33 ejercicios (Ciclo 2 DUP, 3 sesiones), editable, semanas y deload configurables
- **Import Excel**: wizard de 3 pasos (subir, mapear columnas, vista previa) con plantilla descargable
- **Superserie blocks**: 2-4 ejercicios agrupados en la misma pantalla
- **Health check**: sueno/estres/energia pre-sesion (1-5)
- **Entrenamiento activo**: inputs KG/REPS/RIR, referencia de la semana anterior, notas por ejercicio
- **Timer de descanso**: arranca solo al cerrar la vuelta; en superserie espera a que la serie
  este completa en todos los ejercicios del bloque
- **Semaforo de autorregulacion**: verde (subir) / amarillo (mantener) / rojo (revisar)
- **Historial**: sesiones completadas expandibles con semaforo por ejercicio
- **Export a Excel**: hoja `Sesiones` (una fila por sesion) + hoja `Series` (una fila por set,
  con kg/reps/RIR/e1RM) — el grano que sirve para tabla dinamica
- **Progreso**: e1RM Brzycki por ejercicio, tonelaje semanal con deltas
- **Deload**: series-1 automatico
- **Re-entry flow**: revisar/editar una sesion ya registrada o empezarla de cero

## Roadmap

1. ~~MVP: programa, entrenamiento, timer, superseries, e1RM~~ Done
2. ~~Health check, historial, semaforo, superset blocks~~ Done
3. ~~Programas multiples, descripciones por ejercicio, import Excel, export del historial~~ Done
4. **En curso** — Persistencia real (Turso) + auth (NextAuth) + multi-device
   Hecho: shell Next.js, base en Turso, schema v01+v02, capa de datos, auth.
   Falta: `/api/sync`, cablear la UI, migrar el localStorage existente.
5. Roles coach/atleta + dashboard del entrenador
6. PWA offline (service worker + sync engine)

El producto apunta a entrenadores con muchos alumnos: el entrenador carga el programa,
define las referencias **por alumno** y analiza las metricas; el alumno registra el
entrenamiento. Un atleta independiente es simplemente un usuario sin entrenador — el
modelo no se bifurca. Ver `CONTEXT.md` para las decisiones y `forge-arquitectura.md`
para el diseno tecnico.

## Dev

```bash
npm install
npm run dev              # http://localhost:3000
npm run dev -- -H 0.0.0.0   # acceso desde el celular en la misma red

npm run lint
npm run build
```

Hace falta un `.env.local` (no va al repo):

```
DATABASE_URL=libsql://forge-gabriellucci.aws-eu-west-1.turso.io
TURSO_AUTH_TOKEN=...     # _secrets/Turso - Forge.txt
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...      # openssl rand -base64 32
GOOGLE_CLIENT_ID=        # Google Cloud Console
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=...       # _secrets/key Resend.txt
EMAIL_FROM=FORGE <no-reply@estudiolucci.com.ar>
```

Sin `DATABASE_URL` la app cae a `db/local.db`, asi que se puede trabajar sin credenciales.
Cada proveedor de login se activa solo si sus variables estan; la pantalla de acceso
muestra los que haya.

### Base de datos

```bash
npm run migrate                    # aplica db/*.sql sobre db/local.db
DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run migrate   # contra Turso
```

Las migraciones son numeradas (`db/v01_init.sql`, `db/v02_auth.sql`) y el runner es
idempotente: saltea lo ya aplicado. Una migracion aplicada **no se edita** — se agrega
la siguiente.

### Utilidades

```bash
npm run gen:programa    # genera data/*.xlsx del programa SEED para importar por el wizard
npm run verify          # corre todas las verificaciones
```

- `verify:excel` — round-trip del import (13 campos + superseries) y del export del historial
- `verify:schema` — invariantes del schema sobre una base descartable: resolucion de refs
  por alumno y por semana, cascadas, constraints
- `verify:repo` — la capa de datos real (`lib/repo/*`) sobre una base descartable: round-trip
  de programas, superseries, refs por atleta, reemplazo de sesiones, supervivencia del historial
- `verify:sync` — aislamiento entre usuarios (dos cuentas con el mismo SEED de ids fijos),
  round-trip de ids y merge del lado del cliente
- `verify:ui` — abre la app en un navegador headless y falla si alguna ruta no hidrata o tira
  errores de consola. Necesita el server levantado (`npm run dev`) y `playwright` en el Python
  del sistema. No entra en `npm run verify` porque depende de que la app este corriendo.

> `verify:ui` existe por un caso real: la app compilaba, respondia 200 y se veia en blanco. Era
> un service worker de otro proyecto que habia quedado registrado en `localhost:3000` — los
> service workers son por **origen**, no por proyecto. Si dos apps comparten puerto, una le
> sirve assets cacheados a la otra. Levantar cada proyecto en su propio puerto.

Los scripts de verificacion usan los helpers y los modulos **reales** (extraidos de
`components/ForgeApp.jsx` o importados de `lib/`) en vez de copiarlos, asi que no pueden
divergir del codigo que corre en produccion.

## Documentacion

| Archivo | Que contiene |
|---|---|
| `CLAUDE.md` | Convenciones, estructura, zonas protegidas, datos del atleta |
| `CONTEXT.md` | Estado actual, features, decisiones tomadas con su porque |
| `forge-arquitectura.md` | Diseno tecnico completo: schema target, modelo coach/atleta, wireframes |
| `db/v01_init.sql` | Schema del dominio (supersede la seccion 3.2 de forge-arquitectura.md) |
| `db/v02_auth.sql` | Tablas de NextAuth sobre el schema propio |
