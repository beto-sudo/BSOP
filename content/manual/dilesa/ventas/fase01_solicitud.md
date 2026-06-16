---
titulo: 'Fase 1 — Solicitud de Asignación'
modulo: dilesa.ventas.fase01_solicitud
version: '1.1.0'
actualizado: '2026-06-16'
---

## ¿Qué es esta fase?

El arranque de toda venta: el **vendedor** captura al cliente y aparta la
vivienda. Crea la venta en el sistema con su primera fase cerrada.

**Quién la captura:** Vendedor (también Dirección).

## Cómo llegar

**Ventas → botón "Nueva solicitud"** (o desde Inventario, eligiendo una
vivienda disponible).

## Qué se captura

- **El cliente** — datos personales y de contacto. Si ya existe, el sistema lo
  encuentra por CURP y no lo duplica; al seleccionarlo se despliega una **ficha
  informativa** con su nombre, teléfono, email, CURP e **INE**, para que
  confirmes que es la persona correcta. Se llena también el cuestionario de
  conocimiento del cliente (FICU/PLD): forma de pago, ocupación, estado civil.
- **La vivienda** — se elige de las disponibles; el sistema calcula el precio
  con el tipo de crédito (los costos del crédito se suman solos; en casas con
  problema ZCU el sistema lo exenta automáticamente).
- **El tipo de crédito y montos** — institución, monto solicitado, co-titular
  si lo hay.

## Al guardar

- La vivienda queda **apartada** para tu cliente (entra a la cola de hold con
  vigencia — si la solicitud no avanza a tiempo, el apartado expira).
- La venta aparece en tu lista con fase **Solicitud de Asignación** ✓.
- Sigue la **Fase 2 — Asignada**: Dirección revisa el expediente firmado y
  autoriza.

## Preguntas frecuentes

**¿Puedo capturar si la vivienda ya está apartada por otro vendedor?**
Sí — entras a la **cola**: si el apartado de adelante expira, tu solicitud toma
el lugar. La autorización (F2) solo procede para el líder de la cola.

**¿El precio lo puedo cambiar?**
El precio sale del sistema (lista + cargos del crédito). Los descuentos se
manejan aparte y con autorización — habla con tu gerente.

**¿De dónde sale el tope de descuento de la venta?**
De la **promoción** que aplica a la solicitud: su monto es el máximo de descuento
autorizado que después respeta la Cuadratura. (El catálogo de promociones lo
administra Dirección en la pestaña **Promociones** de Ventas.)
