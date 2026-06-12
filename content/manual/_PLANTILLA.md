---
# Copia este archivo a content/manual/<empresa>/<modulo>/<pantalla>.md
# (o content/manual/<empresa>/<pantalla>.md si el módulo es una sola pantalla)
# y borra los comentarios. El prefijo `_` hace que el loader IGNORE este
# archivo — tu copia NO debe llevarlo.
#
# ⚠️ version y actualizado SIEMPRE entre comillas: sin ellas YAML parsea
# `1.0` como número y la fecha como Date, y el doc podría servirse mal
# (el loader normaliza, pero las comillas son la convención).
titulo: '<Módulo> — <Pantalla>'
modulo: <empresa>.<slug.rbac.de.la.pantalla>
version: '1.0.0'
actualizado: '<YYYY-MM-DD>'
---

## ¿Qué es y para qué sirve?

<2-4 líneas. Qué es esta pantalla en lenguaje del negocio (cero jerga técnica)
y cuándo la usas. Si alimenta otra cosa (un correo, un reporte, otra pantalla),
dilo aquí.>

## Cómo llegar

**Sidebar → <Empresa> → <Sección> → <Módulo>.** <Si es un tab o una pantalla
interna, explica desde dónde se abre.>

## La tabla, columna por columna

<Solo si la pantalla es un listado. Una viñeta por columna visible:>

- **<Columna>** — <qué significa y de dónde sale el dato>.

## Lo que puedes hacer

<Acciones disponibles: botones, filtros, captura. Una viñeta por acción, con
quién puede hacerla si hay gate de rol:>

- **<Acción>** — <qué hace y qué pasa después>.

## Estados

<Solo si hay estados/fases con badge. Tabla o viñetas: estado → qué significa
→ quién/qué lo mueve al siguiente.>

## Preguntas frecuentes

<3-6 preguntas reales de operación, con la respuesta directa:>

**¿<Pregunta como la haría el usuario>?**
<Respuesta en 1-3 líneas.>

## Si algo no cuadra

<Qué hacer cuando un dato se ve mal: a quién avisar y qué anotar. La regla
default: no corregir a la fuerza; anotar el folio/nombre y avisar a
administración para que quede rastro.>
