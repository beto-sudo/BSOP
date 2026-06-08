---
titulo: 'Departamentos'
modulo: dilesa.rh.departamentos
version: '1.0.0'
actualizado: '2026-06-07'
---

## ¿Qué es y para qué sirve?

Es la **estructura organizacional** de DILESA: los departamentos y cómo se
agrupan (un departamento puede colgar de otro). Cada renglón muestra cuántos
empleados tiene.

## Cómo llegar

**Sidebar → DILESA → Recursos Humanos → Departamentos.**

## La tabla

Cada renglón es un departamento: **Nombre** (con una sangría "└" si depende de
otro), **Código**, **Reporta a** (el departamento padre), **Empleados** (cuántos
activos) y **Estado** (Activo / Inactivo).

## Lo que puedes hacer

- **Nuevo departamento** — Nombre (obligatorio), Código (opcional) y, si es un
  sub-departamento, eliges su **departamento padre** (déjalo vacío para uno raíz).
- **Abrir un departamento** — clic en el renglón te lleva a **Personal filtrado
  por ese departamento**.
- Desde el menú **⋮**: **editar** (incluido cambiar el padre), **activar/
  desactivar** o **eliminar**.

## Preguntas frecuentes

**¿Cómo creo una jerarquía?**
Al crear o editar un departamento, eliges su **departamento padre**. Los hijos se
muestran con sangría debajo del padre.

**¿El clic abre el detalle del departamento?**
No; te manda a **Personal** filtrado por ese departamento. La edición es desde
**⋮ → Editar**.

**Eliminé un departamento, ¿y los empleados?**
Es baja lógica; conservan su historial.

## Si algo no cuadra

Si la estructura se ve mal, revísala con **⋮ → Editar** (puedes recolocar el
padre). Un departamento no puede ser padre de sí mismo.
