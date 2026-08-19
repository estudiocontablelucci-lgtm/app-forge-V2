# Benchmark de apps — que se toma y que no (2026-08-18)

Relevamiento de apps de tracking de gimnasio para decidir que le falta a FORGE.
No es una lista de features lindas: cada entrada dice **que tiene FORGE hoy**,
verificado contra el codigo, y **por que** la decision es la que es.

## Que se miro

| App | Que es | Que aporta |
|---|---|---|
| [MyFitCoach](https://www.myfitcoach.app/en) | Plan generado + nutricion (MWM, alemana) | La pregunta semanal de recuperacion POR GRUPO MUSCULAR |
| [RP Hypertrophy](https://rpstrength.com/pages/hypertrophy-app) | El original de eso: MEV/MRV, mesociclos | El modelo de autorregulacion que MyFitCoach suaviza |
| [Liftosaur](https://github.com/astashov/liftosaur) | PWA open source, offline, Liftoscript | La progresion definida DENTRO del programa |
| [Hevy](https://www.hevyapp.com/features/) | El tracker mas usado | El registro en si: "anterior", discos, PR |

**Liftosaur es la referencia mas cercana a FORGE**, no MyFitCoach: PWA instalable
que funciona sin red, con la logica de progresion y deload viviendo en el
programa. Es la misma arquitectura unos anos mas adelante.

De MyFitCoach se toma **una sola cosa** y el resto se descarta: es una app de plan
generado + macros, y eso es otro producto.

---

## 1. "La vez pasada" en Entrenar — SE TOMA

**La referencia**: Hevy y Strong muestran, al lado de cada serie, lo que hiciste
la ultima vez en esa misma serie de ese mismo ejercicio.

**Que hay hoy**: `ForgeApp.jsx:1727` muestra `Ref: 140kg × 8-10 | T 3010 | D 2:00 | RIR 2`.
Eso es **la prescripcion**, no el hecho. Lo que se hizo la semana pasada esta
guardado y no se muestra en ningun lado de Entrenar.

**Por que importa mas que ninguna otra**: es el dato con el que se elige el peso
parado frente a la maquina. Hoy hay que salir a Historial a buscarlo, que es lo
que nadie hace a mitad de serie — asi que en la practica se decide de memoria.

**Costo**: bajo. `logs` es `week|exId|setN`: la serie anterior es un lookup
directo con el mismo `exId` y `setN` en la semana previa. El dato ya esta.

**Cuidado**: la semana anterior puede no tener ese ejercicio (entro despues) o
ser el deload. Vale la misma regla que ya aplica `lib/progreso.js`: la ultima
semana CON DATOS, y el deload afuera.

### RESTRICCION: la vez pasada se MUESTRA, no prellena

**El prellenado se queda exactamente como esta: sale del PROGRAMA.**
`ForgeApp.jsx:266-282` — el placeholder de KG es `refFor(ex, week)` y `prefillKg`
la escribe al enfocar si el campo esta vacio; REPS y RIR son placeholder y nada
mas (`repsFor(ex, week, deload).max` y `ex.rir`). Todo pasa por `refFor`, que
respeta `refsByWeek` sobre `refKg`.

**Por que no se toca**: Hevy prellena con lo de la vez pasada porque es un LOG —
no hay programa que mande. FORGE es un programa EJECUTADO, y ahi prellenar con lo
ultimo tiene tres consecuencias:

- El programa deja de gobernar. La app derivaria sola a repetir la carga
  anterior, que es justo lo contrario de un mesociclo.
- **El deload se rompe.** Es -40% A PROPOSITO; prellenarlo con la carga de la
  semana anterior lo anula sin que nadie lo note.
- `refsByWeek` quedaria decorativo. Existe para que cada semana tenga su ref, y
  esa es la pieza que hace que subir la ref a mitad de ciclo no reescriba las
  semanas ya entrenadas.

**Corolario que encaja con el hallazgo 2**: como el prefill sale de la ref, la
UNICA forma de que "subir carga" se materialice es cambiar la ref — que es
exactamente lo que el resumen de progreso va a proponer. Los dos hallazgos se
sostienen mutuamente. Si el prefill viniera de la vez pasada, el resumen de
progreso seria a la vez innecesario e inutil.

La serie anterior va al lado como DATO para decidir, nunca como valor cargado.

## 2. El semaforo ya emite el veredicto — SE TOMA, en un resumen de progreso

**La referencia**: Liftoscript deja escribir la regla de progresion dentro del
ejercicio ("si cerraste el rango con RIR ≥ X, +2.5 kg la proxima").

**Que hay hoy**: FORGE calcula verde/amarillo/rojo y dice "subir", pero **subir la
ref sigue siendo un acto manual** en el editor. El loop esta abierto a mitad de
camino: la app emite un juicio que despues nadie ejecuta.

**Decision (2026-08-18)**: NO se aplica automaticamente ni se pregunta serie por
serie. Va en un **resumen de progreso** que junta los veredictos y propone las
refs de la vuelta siguiente, para revisar de una sentada.

**Por que asi y no autoaplicado**:
- Una ref ya entrenada es un HECHO, no una prescripcion — la regla ya esta escrita
  en `CLAUDE.md` y `refsByWeek` existe justamente para eso.
- En un programa asignado el que decide es el entrenador. Una app que sube kilos
  sola en el programa de otra persona rompe el modelo entero.
- Un semaforo por ejercicio interrumpe; un resumen se lee cuando uno esta
  disponible para decidir.

**Cuidado documentado**: el e1RM sube con reps altas en aislamientos (el caso del
gemelo sentado, ver CONTEXT.md 2026-08-05). Cualquier propuesta de subir carga
que lea ese numero hereda ese sesgo.

## 3. Volumen semanal por grupo muscular — SE TOMA

**La referencia**: es la metrica que gobierna toda la programacion de hipertrofia
(MEV/MRV en RP).

**Que hay hoy**: `lib/catalog.js` ya guarda el grupo de cada ejercicio y
`npm run gen:programa` ya imprime el volumen por grupo para cruzarlo contra el
documento de Salud. **La app no lo muestra nunca.** El dato existe y vive solo en
la salida de un script de terminal.

**Dos versiones, las dos baratas**:
- **Planificado**: series del programa agrupadas por grupo → pantalla Programa.
- **Real**: lo mismo desde `logs` → Progreso y ficha del coach.

**Lo que solo se ve teniendo las dos**: un ejercicio que se saltea
sistematicamente hace divergir planificado y real, y hoy eso no lo ve nadie. Es
exactamente como se detecto que `ASIM-IZQ` nunca se ejecuto (0 series en 8
sesiones), pero a mano y meses despues.

## 4. El feedback por grupo muscular — SE TOMA, partido en dos momentos que YA EXISTEN

**La referencia**: MyFitCoach pregunta cada semana, por grupo muscular, como
venis de recuperacion, y ajusta volumen y fatiga. RP recoge ademas pump, dolor
articular y rendimiento.

**La pregunta que se abrio**: ¿semanal o al terminar la sesion?

**Decision: ninguna de las dos sola — son DOS preguntas distintas y cada una
tiene su momento, y los dos momentos ya estan construidos.**

- **Al EMPEZAR** (health check): la recuperacion. Al terminar de entrenar no se
  sabe como se recupero uno; recien se entreno. La pregunta es "¿como llegas de
  los grupos que toca hoy?" y llega justo antes de la unica decision que afecta:
  cuanto cargar hoy.
- **Al TERMINAR** (junto a la nota de sesion): como fue. Esfuerzo, molestias.
  Eso casi existe ya, y el camino al entrenador esta hecho — viaja con la sesion
  y dispara el aviso de nota sin leer.

**Por que NO una encuesta semanal aparte**:
- No hay un momento en que FORGE se abra sin entrenar. Habria que inventarlo con
  una notificacion, y la app ya aprendio que un pedido que aparece sin que nadie
  lo haya buscado se rechaza de un dedo (por eso la notificacion de descanso
  arranca apagada).
- La memoria del dolor muscular es corta. Preguntar el domingo como se recupero
  el pecho del martes pide una reconstruccion, no un dato.

**El agregado semanal se CALCULA, no se pregunta.** Mismo patron que
`lib/asistencia.js`: lo que sale del historial no se guarda.

**Y no modifica el programa solo.** En MyFitCoach el feedback reescribe el plan;
en FORGE no puede, porque el programa lo escribe un entrenador con restricciones
medicas reales de por medio. El feedback VIAJA a la ficha del entrenador, con el
mismo tratamiento que la nota. La app es la herramienta, el vinculo es personal.

## 5. Mensaje de cierre de sesion — SE TOMA, pero no como felicitacion fija

**La pregunta**: ¿conviene un "¡buen trabajo!" al terminar?

**Decision: si hay cierre, pero dice un HECHO, no un elogio.**

Un "¡Buen trabajo!" fijo es la misma clase de error que el
`Sincronizado · 4 programas` que anunciaba exito con un programa afuera: una
frase que se emite pase lo que pase deja de informar, y a las tres sesiones es
invisible. Peor: contradice el principio del repo de no afirmar lo que no se
puede sostener.

**Lo que si funciona** es un cierre que resuma lo que paso —duracion, tonelaje,
cuantos ejercicios en cada color— y, cuando exista, **la comparacion con la vez
pasada** (hallazgo 1). Eso ES el animo, y ademas es informacion.

**El caso que hay que resolver antes de escribirlo: la sesion mala.** Si la app
felicita igual despues de un dia donde todo salio rojo, se descubre el truco y se
pierde la confianza en el resto de lo que dice. Con isotretinoina activa hasta
~02/2027 y dias de fatiga real, esto no es hipotetico. Ahi el mensaje correcto no
es animo sino reconocimiento: **"Dia dificil. Terminaste igual"** le gana a
"¡Buen trabajo!" — y es verdad, que es el punto.

**Limite**: el cierre nunca opina sobre datos de salud ni suplanta al entrenador.

## 6. Records personales — POSTERGADO

Es el feature mas pedido del genero y en este caso tiene dos problemas.

- **Medico**: isotretinoina activa hasta ~28/02/2027 — sin test de maximos ni PRs.
  Ya esta escrito en `CLAUDE.md`.
- **De dato**: el e1RM se infla con reps altas en aislamientos (gemelo sentado,
  +42% a 25 reps). Un cartel de "¡PR!" sobre un numero inflado es peor que no
  tener el cartel.

Si se hace mas adelante, que sea sobre carga × reps de la serie y con la misma
cautela con la que el semaforo juzga.

## 7. Imagenes en la ficha de ejercicio — SE TOMA

MyFitCoach vende 500+ ejercicios ilustrados; Hevy 400+.

**La decision de tener ~30 reales NO se toca.** Esta argumentada en
`lib/catalog.js` y sigue siendo correcta: un catalogo generico de 300 ejercicios
inventados es mas vistoso y menos util.

**Lo que si suma es el medio en la ficha** (`descModal`, que desde la fase 5
muestra la prescripcion completa). Para un alumno nuevo del entrenador, "como se
ejecuta" en una imagen vale mas que el parrafo.

**El costo esta en el contenido, no en el codigo.** Y la parte dificil es la
licencia: no se pueden bajar GIFs de cualquier lado. Antes de empezar hay que
resolver de donde salen las imagenes con licencia que permita redistribuirlas —
el repo es PUBLICO.

## Social — BACKLOG, con una condicion

Interesa, pero no como leaderboard. Copiar el ranking es copiar el mecanismo
equivocado: comparar cargas entre personas con historias, lesiones y anos de
entrenamiento distintos produce un numero que no significa nada, y en un producto
que ya tiene restricciones medicas cargadas es peor.

Lo que habria que contestar antes de disenar nada: **que hace social a FORGE que
Hevy no hace ya.** La respuesta probable esta en el vinculo que el producto ya
tiene y ninguna otra app tiene igual — coach y alumno, o los alumnos de un mismo
entrenador. No definido.

---

## Lo que NO se copia

- **Nutricion, macros y recetas.** Otro producto entero, y dar consejo
  nutricional sobre datos de salud de terceros es una responsabilidad que este
  proyecto no toma (Ley 25.326).
- **El plan generado automaticamente.** Choca de frente con que el programa lo
  escribe un entrenador con discopatias L3-S1 en la ecuacion. Ninguna generacion
  automatica sabe que no puede proponer peso muerto convencional.
- **Calculadora de discos**: no descartada, pero de valor acotado. Queda como
  tarea suelta y barata (funcion pura en `lib/`, verificable como el resto).

---

## Orden sugerido

1. **"La vez pasada"** — el dato ya esta guardado y cambia la pantalla que mas se usa.
2. **Volumen por grupo** — el dato ya esta calculado y hoy muere en una terminal.
3. **Resumen de progreso con propuesta de refs** — cierra un loop que la app ya empezo.
4. **Feedback por grupo en los dos momentos** — necesita definir la pregunta antes que el codigo.
5. **Cierre de sesion** — depende de 1 para tener con que comparar.
6. Imagenes (bloqueado por licencia) · Discos (suelto) · PR (postergado) · Social (sin definir).

Los tres primeros no agregan una sola pregunta al usuario: muestran algo que la
app ya sabe y no dice.
