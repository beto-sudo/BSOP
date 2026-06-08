---
titulo: 'Personal'
modulo: dilesa.rh.empleados
version: '1.0.0'
actualizado: '2026-06-07'
---

## ¿Qué es y para qué sirve?

Es el directorio de **empleados de DILESA** (activos y dados de baja), con su
puesto, departamento, antigüedad y contacto. Desde aquí das de alta personal,
consultas y editas su expediente.

## Cómo llegar

**Sidebar → DILESA → Recursos Humanos → Personal.**

## Las pestañas de arriba

- **Empleados** — el personal (excluye accionistas).
- **Accionistas** — socios, consejeros y comité ejecutivo.
- **Todos** — sin filtro.

## La tabla

Cada renglón es una persona: **Nombre**, **No.** (número de empleado),
**Departamento**, **Puesto** (con un "+N" si tiene puestos secundarios), **Email**,
**Ingreso**, **Antigüedad** y **Estado** (Activo / Inactivo). Abajo, un contador
"X de Y empleados".

## Lo que puedes hacer

- **Buscar / filtrar** — por nombre, número o email; y filtros de **Estado**
  (activos / ex-empleados), **Departamento**, **Puesto** y **Antigüedad**.
- **Nuevo empleado** — abre un asistente de 3 pasos: **Identidad** (datos de la
  persona), **Contrato** (alta laboral: puesto, departamento, sueldo,
  beneficiarios) y **Expediente** (archivos). Al terminar, te lleva al detalle.
- **Abrir un empleado** — clic en el renglón para ver/editar todo su expediente.
- Desde el menú **⋮** de cada renglón: **activar/desactivar** o **eliminar**.

## Preguntas frecuentes

**El botón "Nuevo empleado" está deshabilitado.**
Es porque la empresa tiene **datos fiscales incompletos** — hay que completarlos
en **Settings → Empresas** antes de dar de alta personal. (También se bloquea si
entras desde la vista multi-empresa; entra directo a `/dilesa/rh/personal`.)

**¿Eliminar borra al empleado?**
No. Es baja lógica (queda en el historial y se puede restaurar). Lo mismo
"desactivar": lo marca inactivo sin perder su expediente.

**¿Quién es "accionista"?**
Se detecta por su departamento ("Accionistas") o por su puesto (consejero, comité
ejecutivo, etc.). No hay una casilla aparte.

## Si algo no cuadra

Si un dato del empleado se ve mal, ábrelo (clic en el renglón) y corrígelo en el
detalle; la lista es solo el resumen.
