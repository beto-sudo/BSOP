-- Branding por empresa: paleta de colores + URLs de variantes de logo derivadas del
-- SVG master. Se usan en el briefing diario (Resend), minutas, reportes impresos,
-- favicon, sidebar BSOP y watermarks de documentos.
--
-- Convención: los archivos viven en el bucket `empresas/{slug}/brand/` y las columnas
-- guardan solo la URL pública. `logo_url` y `header_url` ya existían — mantenemos
-- compatibilidad y dejamos que apunten al horizontal_light y al header_doc_url
-- respectivamente.

alter table core.empresas
  -- Paleta
  add column if not exists color_primario text,          -- acento principal (hex #RRGGBB)
  add column if not exists color_primario_dark text,     -- hover/énfasis
  add column if not exists color_secundario text,        -- acento secundario
  add column if not exists color_texto_titulo text,      -- texto oscuro sobre fondo claro
  add column if not exists color_fondo_brand text,       -- fondo suave tipo crema/neutro
  add column if not exists color_inverso text,           -- texto/logo sobre fondo oscuro (default blanco)

  -- Archivo vectorial master — fuente de verdad para regenerar derivados
  add column if not exists logo_master_url text,

  -- Variantes del logo
  add column if not exists logo_horizontal_light_url text, -- horizontal para fondo claro (emails, docs)
  add column if not exists logo_horizontal_dark_url text,  -- horizontal para fondo oscuro (sidebar BSOP)
  add column if not exists logo_vertical_url text,         -- vertical (tarjetas, portadas)
  add column if not exists isotipo_url text,               -- solo icono, sin wordmark
  add column if not exists favicon_url text,               -- 512x512 cuadrado para favicon/app icon

  -- Composiciones (generadas por el script con color primario)
  add column if not exists header_email_url text,          -- banner para top de email Resend
  add column if not exists footer_doc_url text,            -- pie para documentos impresos
  add column if not exists watermark_url text,             -- marca de agua para PDFs confidenciales

  -- Metadata
  add column if not exists branding_updated_at timestamptz;

comment on column core.empresas.color_primario is 'Hex #RRGGBB — acento principal de la identidad (botones, headers, énfasis)';
comment on column core.empresas.logo_master_url is 'SVG vectorial master — fuente de verdad para regenerar derivados';
comment on column core.empresas.header_email_url is 'PNG 1600x320 — banner de encabezado para correos Resend';
comment on column core.empresas.branding_updated_at is 'Última vez que se regeneraron/actualizaron los assets de branding';
