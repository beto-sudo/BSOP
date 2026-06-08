---
titulo: 'Documentos'
modulo: dilesa.admin.documentos
version: '1.0.0'
actualizado: '2026-06-07'
---

## ¿Qué es y para qué sirve?

Es el **expediente documental** de DILESA: escrituras, contratos, seguros,
permisos, etc., con sus archivos (PDF, imágenes, anexos), fechas de vencimiento y
búsqueda — incluida una **búsqueda con IA** por significado.

## Cómo llegar

**Sidebar → DILESA → Administración → Documentos.**

## La tabla

Cada renglón es un documento: **Título** (con ⚠️ si le falta el PDF principal),
**Tipo**, y según el documento, **Operación**, **Monto**, **Superficie** y **$/m²**;
más **Descripción**, accesos al **PDF** / **Imagen** / **Anexos**, y fechas de
**Emisión** y **Vencimiento** (con etiqueta Vigente / Por vencer / Vencido).
Arriba aparecen avisos si hay documentos **vencidos** o **por vencer (≤60 días)**.

## Lo que puedes hacer

- **Buscar / filtrar** — por texto (título, número, descripción, contenido,
  ubicación, partes) y filtros de **Tipo**, **Operación** y **Municipio**.
- **Búsqueda con IA** (✨) — escribes una pregunta en lenguaje natural y ordena los
  documentos por relevancia.
- **Nuevo documento** — capturas título, tipo, fechas, y subes los archivos:
  **PDF principal**, **imagen de referencia** y **anexos**.
- **Abrir un documento** — clic en el renglón para ver el detalle y editar.
- **Abrir un archivo** — clic en los enlaces **PDF / IMG / Anexos** (se abre en
  otra pestaña).

## Estados de vencimiento

| Etiqueta       | Significa                                |
| -------------- | ---------------------------------------- |
| **Vigente**    | Sin vencer (o sin fecha de vencimiento). |
| **Por vencer** | Vence en los próximos 60 días.           |
| **Vencido**    | Ya pasó su fecha de vencimiento.         |

## Preguntas frecuentes

**¿Para qué sirve la búsqueda con IA?**
Para encontrar por significado, no solo por palabra exacta (ej. "el seguro de la
maquinaria amarilla"). Ordena los resultados por relevancia; "Limpiar búsqueda IA"
regresa a la lista normal.

**Subí un documento pero un enlace de archivo no abre.**
Los archivos viven en un bucket privado y se abren con un enlace temporal (1 hora).
Si expiró, vuelve a entrar al documento para regenerarlo.

**No encuentro la notaría que necesito.**
Puedes crearla al vuelo desde la captura/detalle del documento (queda registrada
como proveedor tipo notaría).

## Si algo no cuadra

Si un documento muestra ⚠️, es que le falta el **PDF principal** — ábrelo y súbelo.
