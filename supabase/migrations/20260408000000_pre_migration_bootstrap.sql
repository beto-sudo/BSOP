-- ════════════════════════════════════════════════════════════════════════════
-- PRE-MIGRATION BOOTSTRAP — drift-1.5 (2026-04-23)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Establece el baseline "ambient" que originalmente vivía en el dashboard de
-- Supabase antes de tener migration tracking. Sin esto, una DB fresca
-- (Supabase Preview Branch, dev local, DR) no tiene `core.empresas`,
-- `shared.estados`, `rdb.waitry_inbound`, etc., y la cadena entera de
-- migraciones falla porque los CREATE TABLE / GRANT / FK declarations
-- referencian objetos que no existen.
--
-- Todo aquí usa `IF NOT EXISTS`. En PRODUCCIÓN — donde las tablas ya viven —
-- es no-op puro. En entornos nuevos crea el esqueleto mínimo para que el
-- resto del histórico aplique limpio.
--
-- Convenciones:
--   * Solo schema/columns/PKs/UNIQUEs/CHECKs y FKs intra-schema.
--   * FKs cross-schema (rdb → erp, core → erp, etc.) se omiten — las añaden
--     migraciones posteriores cuando las tablas destino ya existen.
--   * Comments y indexes secundarios se omiten — no son necesarios para que
--     la suite arranque.
--
-- Ver supabase/GOVERNANCE.md §1 para la regla que esto cierra.

-- ───────────────────────── schemas ─────────────────────────
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS shared;
CREATE SCHEMA IF NOT EXISTS rdb;
CREATE SCHEMA IF NOT EXISTS playtomic;

-- ───────────────────────── core.* (ambient) ─────────────────────────
CREATE TABLE IF NOT EXISTS core.empresas (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                      text NOT NULL,
  slug                        text NOT NULL UNIQUE,
  activa                      boolean DEFAULT true,
  logo_url                    text,
  created_at                  timestamptz DEFAULT now(),
  header_url                  text,
  rfc                         text UNIQUE,
  razon_social                text,
  regimen_capital             text,
  nombre_comercial            text,
  fecha_inicio_operaciones    date,
  estatus_sat                 text,
  id_cif                      text,
  regimen_fiscal              text,
  domicilio_cp                text,
  domicilio_calle             text,
  domicilio_numero_ext        text,
  domicilio_numero_int        text,
  domicilio_colonia           text,
  domicilio_localidad         text,
  domicilio_municipio         text,
  domicilio_estado            text,
  actividades_economicas      jsonb,
  obligaciones_fiscales       jsonb,
  csf_fecha_emision           date,
  csf_url                     text,
  registro_patronal_imss      text,
  representante_legal         text,
  escritura_constitutiva      jsonb,
  escritura_poder             jsonb,
  tipo_contribuyente          text NOT NULL DEFAULT 'persona_moral',
  curp                        text,
  solo_fiscal                 boolean NOT NULL DEFAULT false,
  email_fiscal                text,
  uso_cfdi_default            text,
  color_primario              text,
  color_primario_dark         text,
  color_secundario            text,
  color_texto_titulo          text,
  color_fondo_brand           text,
  color_inverso               text,
  logo_master_url             text,
  logo_horizontal_light_url   text,
  logo_horizontal_dark_url    text,
  logo_vertical_url           text,
  isotipo_url                 text,
  favicon_url                 text,
  header_email_url            text,
  footer_doc_url              text,
  watermark_url               text,
  branding_updated_at         timestamptz
);

CREATE TABLE IF NOT EXISTS core.usuarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  rol             text NOT NULL DEFAULT 'viewer',
  activo          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  first_name      text,
  welcome_sent_at timestamptz,
  junta_activa_id uuid  -- FK a erp.juntas se añade por migración posterior
);

CREATE TABLE IF NOT EXISTS core.modulos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  nombre      text NOT NULL,
  descripcion text
);

CREATE TABLE IF NOT EXISTS core.roles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                text NOT NULL,
  empresa_id            uuid REFERENCES core.empresas(id),
  descripcion           text,
  created_at            timestamptz DEFAULT now(),
  puede_aprobar_cierres boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS core.permisos_rol (
  rol_id            uuid NOT NULL REFERENCES core.roles(id),
  modulo_id         uuid NOT NULL REFERENCES core.modulos(id),
  acceso_lectura    boolean DEFAULT true,
  acceso_escritura  boolean DEFAULT false,
  PRIMARY KEY (rol_id, modulo_id)
);

CREATE TABLE IF NOT EXISTS core.usuarios_empresas (
  usuario_id  uuid NOT NULL REFERENCES core.usuarios(id),
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id),
  rol_id      uuid REFERENCES core.roles(id),
  activo      boolean DEFAULT true,
  PRIMARY KEY (usuario_id, empresa_id)
);

CREATE TABLE IF NOT EXISTS core.permisos_usuario_excepcion (
  usuario_id        uuid NOT NULL REFERENCES core.usuarios(id),
  empresa_id        uuid NOT NULL REFERENCES core.empresas(id),
  modulo_id         uuid NOT NULL REFERENCES core.modulos(id),
  acceso_lectura    boolean,
  acceso_escritura  boolean,
  PRIMARY KEY (usuario_id, empresa_id, modulo_id)
);

CREATE TABLE IF NOT EXISTS core.audit_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid REFERENCES core.empresas(id),
  usuario_id        uuid REFERENCES core.usuarios(id),
  accion            text NOT NULL,
  tabla             text NOT NULL,
  registro_id       uuid,
  datos_anteriores  jsonb,
  datos_nuevos      jsonb,
  ip_origen         inet,
  user_agent        text,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.profiles (
  id          uuid PRIMARY KEY,
  email       text NOT NULL DEFAULT '',
  first_name  text DEFAULT '',
  last_name   text DEFAULT '',
  avatar_url  text,
  locale      text DEFAULT 'es-MX',
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

GRANT USAGE ON SCHEMA core TO anon, authenticated, service_role;

-- ───────────────────────── shared.* (ambient, dropeado en prod) ─────────────────────────
-- Sólo necesitamos las PKs para satisfacer FKs declaradas en erp_schema_v3.
-- 20260415220000 dropea CASCADE el schema entero — perfecto.
CREATE TABLE IF NOT EXISTS shared.categorias (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text,
  tipo   text
);
CREATE TABLE IF NOT EXISTS shared.estados (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug   text,
  nombre text
);
CREATE TABLE IF NOT EXISTS shared.monedas (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text,
  nombre text
);
CREATE TABLE IF NOT EXISTS shared.prioridades (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug   text,
  nombre text
);

GRANT USAGE ON SCHEMA shared TO anon, authenticated, service_role;

-- ───────────────────────── rdb.waitry_* (ambient, vivos en prod) ─────────────────────────
GRANT USAGE ON SCHEMA rdb TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS rdb.waitry_inbound (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      text NOT NULL,
  event         text,
  payload_json  jsonb NOT NULL,
  payload_hash  text NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed     boolean NOT NULL DEFAULT false,
  attempts      integer NOT NULL DEFAULT 0,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waitry_inbound_order_id_unique UNIQUE (order_id)
);

CREATE TABLE IF NOT EXISTS rdb.waitry_pedidos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              text NOT NULL,
  status                text,
  paid                  boolean,
  "timestamp"           timestamptz,
  place_id              text,
  place_name            text,
  table_name            text,
  layout_name           text,
  total_amount          numeric(14,2),
  total_discount        numeric(14,2),
  service_charge        numeric(14,2),
  tax                   numeric(14,2),
  external_delivery_id  text,
  notes                 text,
  last_action_at        timestamptz,
  content_hash          text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  corte_id              uuid,  -- FK a erp.cortes_caja añadida por migración posterior
  CONSTRAINT waitry_pedidos_order_id_unique UNIQUE (order_id)
);

CREATE TABLE IF NOT EXISTS rdb.waitry_productos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      text NOT NULL REFERENCES rdb.waitry_pedidos(order_id) ON DELETE CASCADE,
  product_id    text,
  product_name  text NOT NULL,
  quantity      numeric(14,3),
  unit_price    numeric(14,2),
  total_price   numeric(14,2),
  modifiers     jsonb,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waitry_productos_unique_line UNIQUE (order_id, product_id, product_name)
);

CREATE TABLE IF NOT EXISTS rdb.waitry_pagos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        text NOT NULL REFERENCES rdb.waitry_pedidos(order_id) ON DELETE CASCADE,
  payment_id      text,
  payment_method  text,
  amount          numeric(14,2),
  tip             numeric(14,2),
  currency        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rdb.productos_waitry_map (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id    uuid,
  waitry_nombre  text NOT NULL UNIQUE,
  factor_salida  numeric(10,2) DEFAULT 1.0,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rdb.waitry_duplicate_candidates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id_a        text NOT NULL,
  order_id_b        text NOT NULL,
  similarity_score  numeric(5,4) NOT NULL CHECK (similarity_score BETWEEN 0 AND 1),
  match_reason      text,
  content_hash      text NOT NULL,
  detected_at       timestamptz NOT NULL DEFAULT now(),
  resolved          boolean NOT NULL DEFAULT false,
  resolution        text CHECK (resolution IS NULL OR resolution IN ('keep_a','keep_b','merge','keep_both')),
  CHECK (order_id_a <> order_id_b)
);

NOTIFY pgrst, 'reload schema';
