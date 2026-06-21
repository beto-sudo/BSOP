---
titulo: 'Construcción — Obras'
modulo: dilesa.construccion.obras
version: '1.2.0'
actualizado: '2026-06-20'
---

## ¿Qué es y para qué sirve?

Es la lista de todas las **obras** de DILESA: cada vivienda en construcción, con
su prototipo, contratista, supervisor, avance y fechas clave. Es la pestaña que
abre por defecto dentro de Construcción.

> Construcción es un hub con varias pestañas: **Obras** (esta), **Contratos**,
> **Contratistas**, **Prototipos**, **Estimaciones** y **Costeo**.

## Cómo llegar

**Sidebar → DILESA → Inmobiliario → Construcción.** Abre en **Obras**.

## Lo que ves arriba (indicadores)

Cinco números que se recalculan con los filtros:

- **Obras** — cuántas hay en la vista.
- **En progreso** — las arrancadas o en construcción activa.
- **Avance promedio** — el promedio de avance de lo filtrado.
- **Terminadas** — las que ya cerraron construcción.
- **Próximas a entregar** — las que van al **80% o más** sin terminar (lo que
  está por liberarse pronto).

## La tabla

Cada renglón es una obra (una vivienda). Trae la **Unidad** (su identificador,
ej. `M3-L9-LDLE`), el **Proyecto**, el **Prototipo**, el **Contratista** y
**Supervisor**, el **Avance** (barra de color: rojo si va bajo, ámbar a medio,
verde si va alto), el **Estado**, los montos de **MO contrato** (mano de obra) y
**Materiales**, y las **fechas** críticas: Arranque, Compromiso, Terminada,
Seguro calidad, Paquete RUV y DTU.

Abajo, un contador te dice **"X de Y obras"** (cuántas quedaron tras filtrar).

## Lo que puedes hacer

- **Buscar / filtrar** — por unidad o contratista (búsqueda), o con los filtros
  de **Proyecto**, **Contratista**, **Estado**, **Avance** (p. ej. "< 20%",
  "≥ 66%", "100%") y **rango de arranque**.
- **Abrir una obra** — clic en el renglón para ver el detalle: datos generales,
  mano de obra, y el **avance por etapa** (cada etapa con su barra y la lista de
  tareas terminadas/pendientes).
- **Nuevo contrato + arranques** — botón para crear un contrato y arrancar
  obras (solo aparece si tu rol tiene permiso de Contratos).

## Estados de una obra

| Estado             | Significa                                       |
| ------------------ | ----------------------------------------------- |
| **Arrancada**      | Se inició la construcción.                      |
| **En progreso**    | Construcción activa.                            |
| **Terminada**      | Construcción cerrada (todas las tareas listas). |
| **DTU**            | Con Dictamen Técnico de Uso.                    |
| **Seguro calidad** | Pasó la inspección de seguro de calidad.        |
| **Extraída**       | Unidad ya liberada (venta completada).          |
| **Cancelada**      | Obra cancelada.                                 |

## Recepción de obra (Atención a Clientes)

Una obra al **100% de avance no pasa sola a entrega**: primero hay que
**recibirla al contratista**. La revisión se hace **en papel** (se imprime el
formato, se recorre la vivienda marcando a mano y se firma en campo) y la operas
desde el **detalle de la obra**, con un botón que cambia según el punto:

1. **Programar recepción** — agenda la fecha de la cita con el contratista.
   (Mientras la obra no llega al 100%, el botón aparece bloqueado e indica
   cuántas tareas faltan.)
2. **Imprimir formato** — dentro del recorrido imprimes el **formato en blanco**
   (membrete DILESA, datos de la unidad, casillas para marcar a mano y espacios
   de firma). Lo llevas impreso a la vivienda y ahí marcas cada punto a mano; si
   todo queda bien, **se firma en campo** (Supervisor, Contratista y Atención a
   Clientes) en un solo viaje.
3. Según cómo salga la visita:
   - **Si encontraste detalles → Registrar observaciones y reprogramar.** Anotas
     lo que falta corregir, subes la **evidencia** (la hoja marcada o fotos),
     fijas la **nueva fecha** y el **compromiso del contratista**. La obra **no
     se recibe** y queda **"con observaciones"**. Cada visita se guarda en el
     **historial**; el ciclo se repite las veces que haga falta hasta que todo
     quede corregido.
   - **Si todo quedó bien → Recibir obra.** Subes el **acta firmada escaneada**
     y recibes. **Subir el acta es lo único que habilita "Recibir obra"** y lo
     que da la obra por terminada y la libera para entrega.

Todo el **historial de visitas** (fechas, observaciones, compromisos y
evidencias) queda guardado en la obra como respaldo. Los pendientes de recepción
también aparecen en la bandeja de **Atención a Clientes** (cola "Obras por
recibir"), con el badge _sin programar_ / _programada_ / _con observaciones_.

## Preguntas frecuentes

**¿Cómo se calcula el avance?**
Solo. Cada vez que se marca una tarea como terminada, el sistema recalcula el
porcentaje (no se edita a mano). Cuando una obra cruza **20%**, pasa a "en
construcción" automáticamente — es la señal de que ya puede dispararse su venta.

**¿Puedo editar una obra desde aquí?**
No. La lista es de consulta. Los datos maestros (fechas, contratista, supervisor)
se capturan en otros flujos; las tareas terminadas se palomean en el detalle.

**¿Por qué una obra dice "(sin contratista)" en rojo?**
Porque aún no se le asignó contratista. Conviene asignarlo para que el costo de
mano de obra quede ligado.

## Si algo no cuadra

Si el avance o una fecha se ve mal, anota la **Unidad** y avísale a
administración. No fuerces el dato — el avance se corrige cerrando/abriendo las
tareas correctas, no editándolo directo.
