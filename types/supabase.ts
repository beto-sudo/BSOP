// ==============================================================================
// Auto-generated Supabase database types.
// Last regenerated: 2026-05-25T11:04:51Z
// Project ref: ybklderteyhuugzfmxbi
// Schemas: public, core, erp, rdb, health, playtomic, dilesa, maquinaria
//
// DO NOT EDIT BY HAND. Regenerate via:
//   - GitHub Actions: trigger 'DB Types' workflow manually
//   - Local: npm run db:types (requiere supabase CLI + SUPABASE_ACCESS_TOKEN)
// ==============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  core: {
    Tables: {
      audit_log: {
        Row: {
          accion: string
          created_at: string | null
          datos_anteriores: Json | null
          datos_nuevos: Json | null
          empresa_id: string | null
          id: string
          ip_origen: unknown
          registro_id: string | null
          tabla: string
          user_agent: string | null
          usuario_id: string | null
        }
        Insert: {
          accion: string
          created_at?: string | null
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          empresa_id?: string | null
          id?: string
          ip_origen?: unknown
          registro_id?: string | null
          tabla: string
          user_agent?: string | null
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          created_at?: string | null
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          empresa_id?: string | null
          id?: string
          ip_origen?: unknown
          registro_id?: string | null
          tabla?: string
          user_agent?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      bancos: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          id: string
          nombre: string
          patron_ocr: string | null
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          patron_ocr?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
          patron_ocr?: string | null
        }
        Relationships: []
      }
      empresa_documentos: {
        Row: {
          asignado_at: string
          asignado_por: string | null
          created_at: string
          documento_id: string
          empresa_id: string
          es_default: boolean
          id: string
          notas: string | null
          rol: string
          updated_at: string | null
        }
        Insert: {
          asignado_at?: string
          asignado_por?: string | null
          created_at?: string
          documento_id: string
          empresa_id: string
          es_default?: boolean
          id?: string
          notas?: string | null
          rol: string
          updated_at?: string | null
        }
        Update: {
          asignado_at?: string
          asignado_por?: string | null
          created_at?: string
          documento_id?: string
          empresa_id?: string
          es_default?: boolean
          id?: string
          notas?: string | null
          rol?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresa_documentos_asignado_por_fkey"
            columns: ["asignado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresa_documentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          activa: boolean | null
          actividades_economicas: Json | null
          branding_updated_at: string | null
          color_fondo_brand: string | null
          color_inverso: string | null
          color_primario: string | null
          color_primario_dark: string | null
          color_secundario: string | null
          color_texto_titulo: string | null
          config_inventario: Json
          created_at: string | null
          csf_fecha_emision: string | null
          csf_url: string | null
          curp: string | null
          domicilio_calle: string | null
          domicilio_colonia: string | null
          domicilio_cp: string | null
          domicilio_estado: string | null
          domicilio_localidad: string | null
          domicilio_municipio: string | null
          domicilio_numero_ext: string | null
          domicilio_numero_int: string | null
          email_fiscal: string | null
          escritura_constitutiva: Json | null
          escritura_poder: Json | null
          estatus_sat: string | null
          favicon_url: string | null
          fecha_inicio_operaciones: string | null
          footer_doc_url: string | null
          header_email_url: string | null
          header_url: string | null
          id: string
          id_cif: string | null
          isotipo_url: string | null
          logo_horizontal_dark_url: string | null
          logo_horizontal_light_url: string | null
          logo_master_url: string | null
          logo_url: string | null
          logo_vertical_url: string | null
          nombre: string
          nombre_comercial: string | null
          obligaciones_fiscales: Json | null
          razon_social: string | null
          regimen_capital: string | null
          regimen_fiscal: string | null
          registro_patronal_imss: string | null
          representante_legal: string | null
          rfc: string | null
          rpi_imss: string | null
          slug: string
          solo_fiscal: boolean
          tipo_contribuyente: string
          uso_cfdi_default: string | null
          watermark_url: string | null
        }
        Insert: {
          activa?: boolean | null
          actividades_economicas?: Json | null
          branding_updated_at?: string | null
          color_fondo_brand?: string | null
          color_inverso?: string | null
          color_primario?: string | null
          color_primario_dark?: string | null
          color_secundario?: string | null
          color_texto_titulo?: string | null
          config_inventario?: Json
          created_at?: string | null
          csf_fecha_emision?: string | null
          csf_url?: string | null
          curp?: string | null
          domicilio_calle?: string | null
          domicilio_colonia?: string | null
          domicilio_cp?: string | null
          domicilio_estado?: string | null
          domicilio_localidad?: string | null
          domicilio_municipio?: string | null
          domicilio_numero_ext?: string | null
          domicilio_numero_int?: string | null
          email_fiscal?: string | null
          escritura_constitutiva?: Json | null
          escritura_poder?: Json | null
          estatus_sat?: string | null
          favicon_url?: string | null
          fecha_inicio_operaciones?: string | null
          footer_doc_url?: string | null
          header_email_url?: string | null
          header_url?: string | null
          id?: string
          id_cif?: string | null
          isotipo_url?: string | null
          logo_horizontal_dark_url?: string | null
          logo_horizontal_light_url?: string | null
          logo_master_url?: string | null
          logo_url?: string | null
          logo_vertical_url?: string | null
          nombre: string
          nombre_comercial?: string | null
          obligaciones_fiscales?: Json | null
          razon_social?: string | null
          regimen_capital?: string | null
          regimen_fiscal?: string | null
          registro_patronal_imss?: string | null
          representante_legal?: string | null
          rfc?: string | null
          rpi_imss?: string | null
          slug: string
          solo_fiscal?: boolean
          tipo_contribuyente?: string
          uso_cfdi_default?: string | null
          watermark_url?: string | null
        }
        Update: {
          activa?: boolean | null
          actividades_economicas?: Json | null
          branding_updated_at?: string | null
          color_fondo_brand?: string | null
          color_inverso?: string | null
          color_primario?: string | null
          color_primario_dark?: string | null
          color_secundario?: string | null
          color_texto_titulo?: string | null
          config_inventario?: Json
          created_at?: string | null
          csf_fecha_emision?: string | null
          csf_url?: string | null
          curp?: string | null
          domicilio_calle?: string | null
          domicilio_colonia?: string | null
          domicilio_cp?: string | null
          domicilio_estado?: string | null
          domicilio_localidad?: string | null
          domicilio_municipio?: string | null
          domicilio_numero_ext?: string | null
          domicilio_numero_int?: string | null
          email_fiscal?: string | null
          escritura_constitutiva?: Json | null
          escritura_poder?: Json | null
          estatus_sat?: string | null
          favicon_url?: string | null
          fecha_inicio_operaciones?: string | null
          footer_doc_url?: string | null
          header_email_url?: string | null
          header_url?: string | null
          id?: string
          id_cif?: string | null
          isotipo_url?: string | null
          logo_horizontal_dark_url?: string | null
          logo_horizontal_light_url?: string | null
          logo_master_url?: string | null
          logo_url?: string | null
          logo_vertical_url?: string | null
          nombre?: string
          nombre_comercial?: string | null
          obligaciones_fiscales?: Json | null
          razon_social?: string | null
          regimen_capital?: string | null
          regimen_fiscal?: string | null
          registro_patronal_imss?: string | null
          representante_legal?: string | null
          rfc?: string | null
          rpi_imss?: string | null
          slug?: string
          solo_fiscal?: boolean
          tipo_contribuyente?: string
          uso_cfdi_default?: string | null
          watermark_url?: string | null
        }
        Relationships: []
      }
      modulos: {
        Row: {
          descripcion: string | null
          empresa_id: string
          id: string
          nombre: string
          seccion: string
          slug: string
        }
        Insert: {
          descripcion?: string | null
          empresa_id: string
          id?: string
          nombre: string
          seccion: string
          slug: string
        }
        Update: {
          descripcion?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          seccion?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "modulos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      permisos_rol: {
        Row: {
          acceso_escritura: boolean | null
          acceso_lectura: boolean | null
          modulo_id: string
          rol_id: string
        }
        Insert: {
          acceso_escritura?: boolean | null
          acceso_lectura?: boolean | null
          modulo_id: string
          rol_id: string
        }
        Update: {
          acceso_escritura?: boolean | null
          acceso_lectura?: boolean | null
          modulo_id?: string
          rol_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permisos_rol_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permisos_rol_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      permisos_usuario_excepcion: {
        Row: {
          acceso_escritura: boolean | null
          acceso_lectura: boolean | null
          empresa_id: string
          modulo_id: string
          usuario_id: string
        }
        Insert: {
          acceso_escritura?: boolean | null
          acceso_lectura?: boolean | null
          empresa_id: string
          modulo_id: string
          usuario_id: string
        }
        Update: {
          acceso_escritura?: boolean | null
          acceso_lectura?: boolean | null
          empresa_id?: string
          modulo_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permisos_usuario_excepcion_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permisos_usuario_excepcion_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          is_active: boolean | null
          last_name: string | null
          locale: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id: string
          is_active?: boolean | null
          last_name?: string | null
          locale?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          locale?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          created_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
          puede_aprobar_cierres: boolean
        }
        Insert: {
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
          puede_aprobar_cierres?: boolean
        }
        Update: {
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
          puede_aprobar_cierres?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "roles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_presence: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_module: string
          current_path: string
          display_name: string | null
          email: string
          last_seen_at: string
          status: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_module?: string
          current_path?: string
          display_name?: string | null
          email: string
          last_seen_at?: string
          status?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_module?: string
          current_path?: string
          display_name?: string | null
          email?: string
          last_seen_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          activo: boolean | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          junta_activa_id: string | null
          rol: string
          welcome_sent_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          junta_activa_id?: string | null
          rol?: string
          welcome_sent_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          junta_activa_id?: string | null
          rol?: string
          welcome_sent_at?: string | null
        }
        Relationships: []
      }
      usuarios_empresas: {
        Row: {
          activo: boolean | null
          empresa_id: string
          rol_id: string | null
          usuario_id: string
        }
        Insert: {
          activo?: boolean | null
          empresa_id: string
          rol_id?: string | null
          usuario_id: string
        }
        Update: {
          activo?: boolean | null
          empresa_id?: string
          rol_id?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_empresas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_empresas_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_current_empresa_ids: { Args: never; Returns: string[] }
      fn_current_user_id: { Args: never; Returns: string }
      fn_empresa_documentos_sync_escrituras_cache: {
        Args: { p_empresa_id: string; p_rol: string }
        Returns: undefined
      }
      fn_has_empresa: { Args: { p_empresa_id: string }; Returns: boolean }
      fn_is_admin: { Args: never; Returns: boolean }
      fn_persona_visible: { Args: { p_persona_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  dilesa: {
    Tables: {
      activo_casa: {
        Row: {
          activo_id: string
          ano_construccion: number | null
          banos: number | null
          cochera_autos: number | null
          created_at: string
          empresa_id: string
          estado_conservacion: string | null
          m2_construccion: number | null
          m2_terreno: number | null
          niveles: number | null
          notas: string | null
          recamaras: number | null
          updated_at: string
        }
        Insert: {
          activo_id: string
          ano_construccion?: number | null
          banos?: number | null
          cochera_autos?: number | null
          created_at?: string
          empresa_id: string
          estado_conservacion?: string | null
          m2_construccion?: number | null
          m2_terreno?: number | null
          niveles?: number | null
          notas?: string | null
          recamaras?: number | null
          updated_at?: string
        }
        Update: {
          activo_id?: string
          ano_construccion?: number | null
          banos?: number | null
          cochera_autos?: number | null
          created_at?: string
          empresa_id?: string
          estado_conservacion?: string | null
          m2_construccion?: number | null
          m2_terreno?: number | null
          niveles?: number | null
          notas?: string | null
          recamaras?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activo_casa_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: true
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_departamento: {
        Row: {
          activo_id: string
          banos: number | null
          cajones_estacionamiento: number | null
          created_at: string
          empresa_id: string
          m2_construccion: number | null
          mantenimiento_mensual: number | null
          nivel: number | null
          notas: string | null
          recamaras: number | null
          tiene_balcon: boolean | null
          updated_at: string
        }
        Insert: {
          activo_id: string
          banos?: number | null
          cajones_estacionamiento?: number | null
          created_at?: string
          empresa_id: string
          m2_construccion?: number | null
          mantenimiento_mensual?: number | null
          nivel?: number | null
          notas?: string | null
          recamaras?: number | null
          tiene_balcon?: boolean | null
          updated_at?: string
        }
        Update: {
          activo_id?: string
          banos?: number | null
          cajones_estacionamiento?: number | null
          created_at?: string
          empresa_id?: string
          m2_construccion?: number | null
          mantenimiento_mensual?: number | null
          nivel?: number | null
          notas?: string | null
          recamaras?: number | null
          tiene_balcon?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activo_departamento_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: true
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_edificio: {
        Row: {
          activo_id: string
          cajones_estacionamiento: number | null
          created_at: string
          elevadores: number | null
          empresa_id: string
          m2_construccion_total: number | null
          m2_rentable_total: number | null
          niveles: number | null
          notas: string | null
          updated_at: string
          uso: string | null
        }
        Insert: {
          activo_id: string
          cajones_estacionamiento?: number | null
          created_at?: string
          elevadores?: number | null
          empresa_id: string
          m2_construccion_total?: number | null
          m2_rentable_total?: number | null
          niveles?: number | null
          notas?: string | null
          updated_at?: string
          uso?: string | null
        }
        Update: {
          activo_id?: string
          cajones_estacionamiento?: number | null
          created_at?: string
          elevadores?: number | null
          empresa_id?: string
          m2_construccion_total?: number | null
          m2_rentable_total?: number | null
          niveles?: number | null
          notas?: string | null
          updated_at?: string
          uso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activo_edificio_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: true
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_espectacular: {
        Row: {
          activo_id: string
          alto_m: number | null
          ancho_m: number | null
          anunciante_actual: string | null
          caras: number | null
          contrato_vigente_hasta: string | null
          created_at: string
          empresa_id: string
          iluminado: boolean | null
          notas: string | null
          orientacion: string | null
          renta_mensual: number | null
          trafico_estimado_diario: number | null
          updated_at: string
          vialidad: string | null
        }
        Insert: {
          activo_id: string
          alto_m?: number | null
          ancho_m?: number | null
          anunciante_actual?: string | null
          caras?: number | null
          contrato_vigente_hasta?: string | null
          created_at?: string
          empresa_id: string
          iluminado?: boolean | null
          notas?: string | null
          orientacion?: string | null
          renta_mensual?: number | null
          trafico_estimado_diario?: number | null
          updated_at?: string
          vialidad?: string | null
        }
        Update: {
          activo_id?: string
          alto_m?: number | null
          ancho_m?: number | null
          anunciante_actual?: string | null
          caras?: number | null
          contrato_vigente_hasta?: string | null
          created_at?: string
          empresa_id?: string
          iluminado?: boolean | null
          notas?: string | null
          orientacion?: string | null
          renta_mensual?: number | null
          trafico_estimado_diario?: number | null
          updated_at?: string
          vialidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activo_espectacular_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: true
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_infraestructura: {
        Row: {
          activo_id: string
          created_at: string
          empresa_id: string
          entregado_a_municipio: boolean | null
          estado_mantenimiento: string | null
          longitud_m: number | null
          notas: string | null
          subtipo: string | null
          updated_at: string
        }
        Insert: {
          activo_id: string
          created_at?: string
          empresa_id: string
          entregado_a_municipio?: boolean | null
          estado_mantenimiento?: string | null
          longitud_m?: number | null
          notas?: string | null
          subtipo?: string | null
          updated_at?: string
        }
        Update: {
          activo_id?: string
          created_at?: string
          empresa_id?: string
          entregado_a_municipio?: boolean | null
          estado_mantenimiento?: string | null
          longitud_m?: number | null
          notas?: string | null
          subtipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activo_infraestructura_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: true
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_local: {
        Row: {
          activo_id: string
          banos: number | null
          created_at: string
          empresa_id: string
          estado_obra: string | null
          frente_m: number | null
          giro_permitido: string | null
          m2_rentable: number | null
          notas: string | null
          planta: string | null
          tiene_bodega: boolean | null
          updated_at: string
        }
        Insert: {
          activo_id: string
          banos?: number | null
          created_at?: string
          empresa_id: string
          estado_obra?: string | null
          frente_m?: number | null
          giro_permitido?: string | null
          m2_rentable?: number | null
          notas?: string | null
          planta?: string | null
          tiene_bodega?: boolean | null
          updated_at?: string
        }
        Update: {
          activo_id?: string
          banos?: number | null
          created_at?: string
          empresa_id?: string
          estado_obra?: string | null
          frente_m?: number | null
          giro_permitido?: string | null
          m2_rentable?: number | null
          notas?: string | null
          planta?: string | null
          tiene_bodega?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activo_local_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: true
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_lote: {
        Row: {
          activo_id: string
          condicion: string | null
          created_at: string
          empresa_id: string
          fondo_m: number | null
          frente_m: number | null
          manzana: string | null
          notas: string | null
          numero_lote: string | null
          updated_at: string
        }
        Insert: {
          activo_id: string
          condicion?: string | null
          created_at?: string
          empresa_id: string
          fondo_m?: number | null
          frente_m?: number | null
          manzana?: string | null
          notas?: string | null
          numero_lote?: string | null
          updated_at?: string
        }
        Update: {
          activo_id?: string
          condicion?: string | null
          created_at?: string
          empresa_id?: string
          fondo_m?: number | null
          frente_m?: number | null
          manzana?: string | null
          notas?: string | null
          numero_lote?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activo_lote_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: true
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_nave: {
        Row: {
          activo_id: string
          altura_libre_m: number | null
          andenes_carga: number | null
          created_at: string
          empresa_id: string
          m2_patio: number | null
          m2_techados: number | null
          notas: string | null
          subestacion_electrica: boolean | null
          updated_at: string
          uso_suelo_industrial: boolean | null
        }
        Insert: {
          activo_id: string
          altura_libre_m?: number | null
          andenes_carga?: number | null
          created_at?: string
          empresa_id: string
          m2_patio?: number | null
          m2_techados?: number | null
          notas?: string | null
          subestacion_electrica?: boolean | null
          updated_at?: string
          uso_suelo_industrial?: boolean | null
        }
        Update: {
          activo_id?: string
          altura_libre_m?: number | null
          andenes_carga?: number | null
          created_at?: string
          empresa_id?: string
          m2_patio?: number | null
          m2_techados?: number | null
          notas?: string | null
          subestacion_electrica?: boolean | null
          updated_at?: string
          uso_suelo_industrial?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "activo_nave_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: true
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_plaza: {
        Row: {
          activo_id: string
          anchor_nombre: string | null
          area_comun_m2: number | null
          area_rentable_total_m2: number | null
          cajones_estacionamiento: number | null
          created_at: string
          empresa_id: string
          locales_totales: number | null
          notas: string | null
          tiene_anchor: boolean | null
          updated_at: string
        }
        Insert: {
          activo_id: string
          anchor_nombre?: string | null
          area_comun_m2?: number | null
          area_rentable_total_m2?: number | null
          cajones_estacionamiento?: number | null
          created_at?: string
          empresa_id: string
          locales_totales?: number | null
          notas?: string | null
          tiene_anchor?: boolean | null
          updated_at?: string
        }
        Update: {
          activo_id?: string
          anchor_nombre?: string | null
          area_comun_m2?: number | null
          area_rentable_total_m2?: number | null
          cajones_estacionamiento?: number | null
          created_at?: string
          empresa_id?: string
          locales_totales?: number | null
          notas?: string | null
          tiene_anchor?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activo_plaza_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: true
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_terreno: {
        Row: {
          activo_id: string
          areas_afectacion_m2: number | null
          corredor_nombre: string | null
          corredor_telefono: string | null
          created_at: string
          decision_actual: string | null
          empresa_id: string
          estatus_propiedad: string | null
          etapa: string | null
          factibilidad_agua: boolean | null
          factibilidad_drenaje: boolean | null
          factibilidad_electricidad: boolean | null
          factibilidad_vialidad: boolean | null
          fecha_ultima_revision: string | null
          notas: string | null
          objetivo: string | null
          origen: string | null
          precio_ofertado_m2: number | null
          precio_solicitado_m2: number | null
          prioridad: string | null
          propietario_nombre: string | null
          propietario_telefono: string | null
          responsable: string | null
          siguiente_accion: string | null
          tipo_terreno: string | null
          updated_at: string
          uso_suelo: string | null
          valor_objetivo_compra: number | null
          zona_sector: string | null
          zonificacion: string | null
        }
        Insert: {
          activo_id: string
          areas_afectacion_m2?: number | null
          corredor_nombre?: string | null
          corredor_telefono?: string | null
          created_at?: string
          decision_actual?: string | null
          empresa_id: string
          estatus_propiedad?: string | null
          etapa?: string | null
          factibilidad_agua?: boolean | null
          factibilidad_drenaje?: boolean | null
          factibilidad_electricidad?: boolean | null
          factibilidad_vialidad?: boolean | null
          fecha_ultima_revision?: string | null
          notas?: string | null
          objetivo?: string | null
          origen?: string | null
          precio_ofertado_m2?: number | null
          precio_solicitado_m2?: number | null
          prioridad?: string | null
          propietario_nombre?: string | null
          propietario_telefono?: string | null
          responsable?: string | null
          siguiente_accion?: string | null
          tipo_terreno?: string | null
          updated_at?: string
          uso_suelo?: string | null
          valor_objetivo_compra?: number | null
          zona_sector?: string | null
          zonificacion?: string | null
        }
        Update: {
          activo_id?: string
          areas_afectacion_m2?: number | null
          corredor_nombre?: string | null
          corredor_telefono?: string | null
          created_at?: string
          decision_actual?: string | null
          empresa_id?: string
          estatus_propiedad?: string | null
          etapa?: string | null
          factibilidad_agua?: boolean | null
          factibilidad_drenaje?: boolean | null
          factibilidad_electricidad?: boolean | null
          factibilidad_vialidad?: boolean | null
          fecha_ultima_revision?: string | null
          notas?: string | null
          objetivo?: string | null
          origen?: string | null
          precio_ofertado_m2?: number | null
          precio_solicitado_m2?: number | null
          prioridad?: string | null
          propietario_nombre?: string | null
          propietario_telefono?: string | null
          responsable?: string | null
          siguiente_accion?: string | null
          tipo_terreno?: string | null
          updated_at?: string
          uso_suelo?: string | null
          valor_objetivo_compra?: number | null
          zona_sector?: string | null
          zonificacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activo_terreno_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: true
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_unipolar: {
        Row: {
          activo_id: string
          alto_m: number | null
          altura_poste_m: number | null
          ancho_m: number | null
          anunciante_actual: string | null
          caras: number | null
          contrato_vigente_hasta: string | null
          created_at: string
          empresa_id: string
          iluminado: boolean | null
          notas: string | null
          orientacion: string | null
          renta_mensual: number | null
          trafico_estimado_diario: number | null
          updated_at: string
          vialidad: string | null
        }
        Insert: {
          activo_id: string
          alto_m?: number | null
          altura_poste_m?: number | null
          ancho_m?: number | null
          anunciante_actual?: string | null
          caras?: number | null
          contrato_vigente_hasta?: string | null
          created_at?: string
          empresa_id: string
          iluminado?: boolean | null
          notas?: string | null
          orientacion?: string | null
          renta_mensual?: number | null
          trafico_estimado_diario?: number | null
          updated_at?: string
          vialidad?: string | null
        }
        Update: {
          activo_id?: string
          alto_m?: number | null
          altura_poste_m?: number | null
          ancho_m?: number | null
          anunciante_actual?: string | null
          caras?: number | null
          contrato_vigente_hasta?: string | null
          created_at?: string
          empresa_id?: string
          iluminado?: boolean | null
          notas?: string | null
          orientacion?: string | null
          renta_mensual?: number | null
          trafico_estimado_diario?: number | null
          updated_at?: string
          vialidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activo_unipolar_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: true
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      activos: {
        Row: {
          activo_padre_id: string | null
          area_m2: number | null
          clave_catastral: string | null
          clave_interna: string | null
          created_at: string
          deleted_at: string | null
          direccion_referencia: string | null
          documentos: Json
          empresa_id: string
          estado: string
          estado_geo: string | null
          id: string
          latitud: number | null
          longitud: number | null
          municipio: string | null
          nombre: string
          notas: string | null
          numero_escritura: string | null
          situacion_legal: string | null
          tipo: string
          updated_at: string
          valor_estimado: number | null
        }
        Insert: {
          activo_padre_id?: string | null
          area_m2?: number | null
          clave_catastral?: string | null
          clave_interna?: string | null
          created_at?: string
          deleted_at?: string | null
          direccion_referencia?: string | null
          documentos?: Json
          empresa_id: string
          estado?: string
          estado_geo?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          municipio?: string | null
          nombre: string
          notas?: string | null
          numero_escritura?: string | null
          situacion_legal?: string | null
          tipo: string
          updated_at?: string
          valor_estimado?: number | null
        }
        Update: {
          activo_padre_id?: string | null
          area_m2?: number | null
          clave_catastral?: string | null
          clave_interna?: string | null
          created_at?: string
          deleted_at?: string | null
          direccion_referencia?: string | null
          documentos?: Json
          empresa_id?: string
          estado?: string
          estado_geo?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          municipio?: string | null
          nombre?: string
          notas?: string | null
          numero_escritura?: string | null
          situacion_legal?: string | null
          tipo?: string
          updated_at?: string
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "activos_activo_padre_id_fkey"
            columns: ["activo_padre_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      construccion: {
        Row: {
          avance_pct: number
          coda_row_id: string | null
          codigo: string
          contratista_id: string
          created_at: string
          cuv: string | null
          deleted_at: string | null
          empresa_id: string
          estado: string
          fecha_arranque: string | null
          fecha_compromiso_terminar: string | null
          fecha_dtu: string | null
          fecha_extraccion: string | null
          fecha_paquete_ruv: string | null
          fecha_seguro_calidad: string | null
          fecha_terminada: string | null
          frente_ruv: string | null
          id: string
          m2_construccion: number | null
          mo_ejecutado: number
          notas: string | null
          precio_mo_x_m2: number | null
          producto_id: string
          supervisor_persona_id: string | null
          unidad_id: string
          updated_at: string
          valor_contrato_mo: number | null
        }
        Insert: {
          avance_pct?: number
          coda_row_id?: string | null
          codigo: string
          contratista_id: string
          created_at?: string
          cuv?: string | null
          deleted_at?: string | null
          empresa_id: string
          estado?: string
          fecha_arranque?: string | null
          fecha_compromiso_terminar?: string | null
          fecha_dtu?: string | null
          fecha_extraccion?: string | null
          fecha_paquete_ruv?: string | null
          fecha_seguro_calidad?: string | null
          fecha_terminada?: string | null
          frente_ruv?: string | null
          id?: string
          m2_construccion?: number | null
          mo_ejecutado?: number
          notas?: string | null
          precio_mo_x_m2?: number | null
          producto_id: string
          supervisor_persona_id?: string | null
          unidad_id: string
          updated_at?: string
          valor_contrato_mo?: number | null
        }
        Update: {
          avance_pct?: number
          coda_row_id?: string | null
          codigo?: string
          contratista_id?: string
          created_at?: string
          cuv?: string | null
          deleted_at?: string | null
          empresa_id?: string
          estado?: string
          fecha_arranque?: string | null
          fecha_compromiso_terminar?: string | null
          fecha_dtu?: string | null
          fecha_extraccion?: string | null
          fecha_paquete_ruv?: string | null
          fecha_seguro_calidad?: string | null
          fecha_terminada?: string | null
          frente_ruv?: string | null
          id?: string
          m2_construccion?: number | null
          mo_ejecutado?: number
          notas?: string | null
          precio_mo_x_m2?: number | null
          producto_id?: string
          supervisor_persona_id?: string | null
          unidad_id?: string
          updated_at?: string
          valor_contrato_mo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "construccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construccion_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: true
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      construccion_tareas_terminadas: {
        Row: {
          coda_row_id: string | null
          construccion_id: string
          created_at: string
          deleted_at: string | null
          empresa_id: string
          fecha_pagada: string | null
          fecha_terminada: string
          id: string
          mano_obra_pagada: number | null
          notas: string | null
          plantilla_tarea_id: string
          revisado_por_persona_id: string | null
          revisado_por_user_id: string | null
          tiempo_real_dias: number | null
          updated_at: string
        }
        Insert: {
          coda_row_id?: string | null
          construccion_id: string
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          fecha_pagada?: string | null
          fecha_terminada?: string
          id?: string
          mano_obra_pagada?: number | null
          notas?: string | null
          plantilla_tarea_id: string
          revisado_por_persona_id?: string | null
          revisado_por_user_id?: string | null
          tiempo_real_dias?: number | null
          updated_at?: string
        }
        Update: {
          coda_row_id?: string | null
          construccion_id?: string
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          fecha_pagada?: string | null
          fecha_terminada?: string
          id?: string
          mano_obra_pagada?: number | null
          notas?: string | null
          plantilla_tarea_id?: string
          revisado_por_persona_id?: string | null
          revisado_por_user_id?: string | null
          tiempo_real_dias?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construccion_tareas_terminadas_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construccion_tareas_terminadas_plantilla_tarea_id_fkey"
            columns: ["plantilla_tarea_id"]
            isOneToOne: false
            referencedRelation: "plantilla_tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      contratistas_datos: {
        Row: {
          abreviacion: string | null
          activo: boolean
          coda_row_id: string | null
          created_at: string
          deleted_at: string | null
          domicilio: string | null
          empresa_id: string
          notas: string | null
          persona_fisica_o_moral: string | null
          persona_id: string
          registro_patronal: string | null
          representante_legal: string | null
          repse: string | null
          retencion_pct: number | null
          updated_at: string
        }
        Insert: {
          abreviacion?: string | null
          activo?: boolean
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          domicilio?: string | null
          empresa_id: string
          notas?: string | null
          persona_fisica_o_moral?: string | null
          persona_id: string
          registro_patronal?: string | null
          representante_legal?: string | null
          repse?: string | null
          retencion_pct?: number | null
          updated_at?: string
        }
        Update: {
          abreviacion?: string | null
          activo?: boolean
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          domicilio?: string | null
          empresa_id?: string
          notas?: string | null
          persona_fisica_o_moral?: string | null
          persona_id?: string
          registro_patronal?: string | null
          representante_legal?: string | null
          repse?: string | null
          retencion_pct?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      contrato_lotes: {
        Row: {
          coda_row_id: string | null
          construccion_id: string
          contrato_id: string
          created_at: string
          deleted_at: string | null
          empresa_id: string
          id: string
          monto_lote: number | null
          updated_at: string
        }
        Insert: {
          coda_row_id?: string | null
          construccion_id: string
          contrato_id: string
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          id?: string
          monto_lote?: number | null
          updated_at?: string
        }
        Update: {
          coda_row_id?: string | null
          construccion_id?: string
          contrato_id?: string
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          monto_lote?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_lotes_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_lotes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_construccion"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_construccion: {
        Row: {
          coda_row_id: string | null
          codigo: string
          contratista_id: string
          created_at: string
          deleted_at: string | null
          empresa_id: string
          fecha_contrato: string
          fianzas_url: string | null
          id: string
          notas: string | null
          proyecto_id: string | null
          updated_at: string
          valor_total: number
        }
        Insert: {
          coda_row_id?: string | null
          codigo: string
          contratista_id: string
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          fecha_contrato: string
          fianzas_url?: string | null
          id?: string
          notas?: string | null
          proyecto_id?: string | null
          updated_at?: string
          valor_total?: number
        }
        Update: {
          coda_row_id?: string | null
          codigo?: string
          contratista_id?: string
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          fecha_contrato?: string
          fianzas_url?: string | null
          id?: string
          notas?: string | null
          proyecto_id?: string | null
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "contratos_construccion_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      etapas_construccion: {
        Row: {
          coda_row_id: string | null
          created_at: string
          deleted_at: string | null
          dias_estimados: number | null
          empresa_id: string
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          dias_estimados?: number | null
          empresa_id: string
          id?: string
          nombre: string
          orden: number
          updated_at?: string
        }
        Update: {
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          dias_estimados?: number | null
          empresa_id?: string
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      plantilla_tareas: {
        Row: {
          coda_row_id: string | null
          costo_mo_plantilla: number
          created_at: string
          deleted_at: string | null
          empresa_id: string
          etapa_id: string
          id: string
          porcentaje_costo: number
          producto_id: string
          tarea_id: string
          tiempo_dias: number
          updated_at: string
        }
        Insert: {
          coda_row_id?: string | null
          costo_mo_plantilla?: number
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          etapa_id: string
          id?: string
          porcentaje_costo?: number
          producto_id: string
          tarea_id: string
          tiempo_dias?: number
          updated_at?: string
        }
        Update: {
          coda_row_id?: string | null
          costo_mo_plantilla?: number
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          etapa_id?: string
          id?: string
          porcentaje_costo?: number
          producto_id?: string
          tarea_id?: string
          tiempo_dias?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plantilla_tareas_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas_construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantilla_tareas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantilla_tareas_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas_construccion"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          atributos: Json
          costo_referencia: number | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          id: string
          nombre: string
          planos: Json
          proyecto_id: string
          updated_at: string
          valor_comercial_referencia: number | null
        }
        Insert: {
          atributos?: Json
          costo_referencia?: number | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          id?: string
          nombre: string
          planos?: Json
          proyecto_id: string
          updated_at?: string
          valor_comercial_referencia?: number | null
        }
        Update: {
          atributos?: Json
          costo_referencia?: number | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          planos?: Json
          proyecto_id?: string
          updated_at?: string
          valor_comercial_referencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      promociones: {
        Row: {
          activa: boolean
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          id: string
          nombre: string
          productos_aplicables: string[]
          updated_at: string
          vigencia_fin: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          activa?: boolean
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          id?: string
          nombre: string
          productos_aplicables?: string[]
          updated_at?: string
          vigencia_fin?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          activa?: boolean
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          productos_aplicables?: string[]
          updated_at?: string
          vigencia_fin?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: []
      }
      proyecto_activos: {
        Row: {
          activo_id: string
          created_at: string
          empresa_id: string
          id: string
          notas: string | null
          proyecto_id: string
          rol: string
        }
        Insert: {
          activo_id: string
          created_at?: string
          empresa_id: string
          id?: string
          notas?: string | null
          proyecto_id: string
          rol: string
        }
        Update: {
          activo_id?: string
          created_at?: string
          empresa_id?: string
          id?: string
          notas?: string | null
          proyecto_id?: string
          rol?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_activos_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_activos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_documentos: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          empresa_id: string
          id: string
          nombre: string
          notas: string | null
          proyecto_id: string
          tipo: string | null
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          empresa_id: string
          id?: string
          nombre: string
          notas?: string | null
          proyecto_id: string
          tipo?: string | null
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          notas?: string | null
          proyecto_id?: string
          tipo?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_documentos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_hitos: {
        Row: {
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          estado: string
          fecha_objetivo: string | null
          fecha_real: string | null
          id: string
          nombre: string
          orden: number
          proyecto_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          estado?: string
          fecha_objetivo?: string | null
          fecha_real?: string | null
          id?: string
          nombre: string
          orden?: number
          proyecto_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          estado?: string
          fecha_objetivo?: string | null
          fecha_real?: string | null
          id?: string
          nombre?: string
          orden?: number
          proyecto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_hitos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_prorrateo: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          notas: string | null
          porcentaje: number
          proyecto_madre_id: string
          sub_proyecto_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          notas?: string | null
          porcentaje: number
          proyecto_madre_id: string
          sub_proyecto_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          notas?: string | null
          porcentaje?: number
          proyecto_madre_id?: string
          sub_proyecto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_prorrateo_proyecto_madre_id_fkey"
            columns: ["proyecto_madre_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_prorrateo_sub_proyecto_id_fkey"
            columns: ["sub_proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_responsables: {
        Row: {
          created_at: string
          empleado_id: string | null
          empresa_id: string
          externo: boolean
          id: string
          nombre_externo: string | null
          proyecto_id: string
          rol: string
        }
        Insert: {
          created_at?: string
          empleado_id?: string | null
          empresa_id: string
          externo?: boolean
          id?: string
          nombre_externo?: string | null
          proyecto_id: string
          rol: string
        }
        Update: {
          created_at?: string
          empleado_id?: string | null
          empresa_id?: string
          externo?: boolean
          id?: string
          nombre_externo?: string | null
          proyecto_id?: string
          rol?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_responsables_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_tareas: {
        Row: {
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          estado: string
          fecha_completada: string | null
          fecha_limite: string | null
          id: string
          orden: number
          prioridad: string
          proyecto_id: string
          responsable_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          estado?: string
          fecha_completada?: string | null
          fecha_limite?: string | null
          id?: string
          orden?: number
          prioridad?: string
          proyecto_id: string
          responsable_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          estado?: string
          fecha_completada?: string | null
          fecha_limite?: string | null
          id?: string
          orden?: number
          prioridad?: string
          proyecto_id?: string
          responsable_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_tareas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyectos: {
        Row: {
          area_m2: number | null
          area_vendible_m2: number | null
          areas_verdes_m2: number | null
          clasificacion_inmobiliaria: string | null
          clave_interna: string | null
          costo_comercializacion: number | null
          costo_construccion: number | null
          costo_terreno: number | null
          costo_urbanizacion: number | null
          created_at: string
          deleted_at: string | null
          documentos: Json
          empresa_id: string
          estado: string
          fecha_fin_estimada: string | null
          fecha_inicio: string | null
          fecha_licencia: string | null
          id: string
          lotes_proyectados: number | null
          nombre: string
          notas: string | null
          plantilla_id: string | null
          precio_m2_excedente: number | null
          presupuesto_estimado: number | null
          proyecto_padre_id: string | null
          proyecto_predecesor_id: string | null
          regla_prorrateo: string
          tamano_lote_promedio: number | null
          tipo: string
          updated_at: string
        }
        Insert: {
          area_m2?: number | null
          area_vendible_m2?: number | null
          areas_verdes_m2?: number | null
          clasificacion_inmobiliaria?: string | null
          clave_interna?: string | null
          costo_comercializacion?: number | null
          costo_construccion?: number | null
          costo_terreno?: number | null
          costo_urbanizacion?: number | null
          created_at?: string
          deleted_at?: string | null
          documentos?: Json
          empresa_id: string
          estado?: string
          fecha_fin_estimada?: string | null
          fecha_inicio?: string | null
          fecha_licencia?: string | null
          id?: string
          lotes_proyectados?: number | null
          nombre: string
          notas?: string | null
          plantilla_id?: string | null
          precio_m2_excedente?: number | null
          presupuesto_estimado?: number | null
          proyecto_padre_id?: string | null
          proyecto_predecesor_id?: string | null
          regla_prorrateo?: string
          tamano_lote_promedio?: number | null
          tipo: string
          updated_at?: string
        }
        Update: {
          area_m2?: number | null
          area_vendible_m2?: number | null
          areas_verdes_m2?: number | null
          clasificacion_inmobiliaria?: string | null
          clave_interna?: string | null
          costo_comercializacion?: number | null
          costo_construccion?: number | null
          costo_terreno?: number | null
          costo_urbanizacion?: number | null
          created_at?: string
          deleted_at?: string | null
          documentos?: Json
          empresa_id?: string
          estado?: string
          fecha_fin_estimada?: string | null
          fecha_inicio?: string | null
          fecha_licencia?: string | null
          id?: string
          lotes_proyectados?: number | null
          nombre?: string
          notas?: string | null
          plantilla_id?: string | null
          precio_m2_excedente?: number | null
          presupuesto_estimado?: number | null
          proyecto_padre_id?: string | null
          proyecto_predecesor_id?: string | null
          regla_prorrateo?: string
          tamano_lote_promedio?: number | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyectos_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "proyectos_plantillas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_proyecto_padre_id_fkey"
            columns: ["proyecto_padre_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_proyecto_predecesor_id_fkey"
            columns: ["proyecto_predecesor_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyectos_plantillas: {
        Row: {
          created_at: string
          definicion: Json
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string | null
          es_oficial: boolean
          id: string
          nombre: string
          tipo_proyecto: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          definicion?: Json
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          es_oficial?: boolean
          id?: string
          nombre: string
          tipo_proyecto: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          definicion?: Json
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          es_oficial?: boolean
          id?: string
          nombre?: string
          tipo_proyecto?: string
          updated_at?: string
        }
        Relationships: []
      }
      tareas_construccion: {
        Row: {
          coda_row_id: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      tipos_credito: {
        Row: {
          activo: boolean
          apoyo_infonavit_monto: number
          costo_venta_adicional_pct: number
          created_at: string
          deleted_at: string | null
          empresa_id: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          apoyo_infonavit_monto?: number
          costo_venta_adicional_pct?: number
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          apoyo_infonavit_monto?: number
          costo_venta_adicional_pct?: number
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      unidades: {
        Row: {
          activo_id: string | null
          area_m2: number | null
          calle: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          es_esquina: boolean | null
          estado: string
          id: string
          identificador: string
          m2_construccion: number | null
          manzana: string | null
          notas: string | null
          numero_lote: string | null
          numero_oficial: string | null
          precio: number | null
          producto_id: string | null
          proyecto_id: string
          tiene_frente_verde: boolean | null
          tipo_lote: string | null
          updated_at: string
          valor_venta_futuro_snapshot: number | null
        }
        Insert: {
          activo_id?: string | null
          area_m2?: number | null
          calle?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          es_esquina?: boolean | null
          estado?: string
          id?: string
          identificador: string
          m2_construccion?: number | null
          manzana?: string | null
          notas?: string | null
          numero_lote?: string | null
          numero_oficial?: string | null
          precio?: number | null
          producto_id?: string | null
          proyecto_id: string
          tiene_frente_verde?: boolean | null
          tipo_lote?: string | null
          updated_at?: string
          valor_venta_futuro_snapshot?: number | null
        }
        Update: {
          activo_id?: string | null
          area_m2?: number | null
          calle?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          es_esquina?: boolean | null
          estado?: string
          id?: string
          identificador?: string
          m2_construccion?: number | null
          manzana?: string | null
          notas?: string | null
          numero_lote?: string | null
          numero_oficial?: string | null
          precio?: number | null
          producto_id?: string | null
          proyecto_id?: string
          tiene_frente_verde?: boolean | null
          tipo_lote?: string | null
          updated_at?: string
          valor_venta_futuro_snapshot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_fase_catalogo: {
        Row: {
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          id: string
          nombre: string
          posicion: number
          rol: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          id?: string
          nombre: string
          posicion: number
          rol?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          posicion?: number
          rol?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      venta_fases: {
        Row: {
          created_at: string
          deleted_at: string | null
          empresa_id: string
          fase: string
          fecha: string | null
          id: string
          notas: string | null
          posicion: number | null
          registrado_por: string | null
          updated_at: string
          venta_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          fase: string
          fecha?: string | null
          id?: string
          notas?: string | null
          posicion?: number | null
          registrado_por?: string | null
          updated_at?: string
          venta_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          fase?: string
          fecha?: string | null
          id?: string
          notas?: string | null
          posicion?: number | null
          registrado_por?: string | null
          updated_at?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_fases_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_pagos: {
        Row: {
          coda_row_id: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          fecha: string | null
          id: string
          monto: number
          notas: string | null
          tipo: string | null
          updated_at: string
          venta_id: string
        }
        Insert: {
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          fecha?: string | null
          id?: string
          monto: number
          notas?: string | null
          tipo?: string | null
          updated_at?: string
          venta_id: string
        }
        Update: {
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          fecha?: string | null
          id?: string
          monto?: number
          notas?: string | null
          tipo?: string | null
          updated_at?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          anticipo_comision: number | null
          casa_valuadora: string | null
          coda_row_id: string | null
          comision_gerencia: number | null
          comision_vendedor: number | null
          conocimiento_dueno_beneficiario: string | null
          created_at: string
          credito_cotitular_ref: string | null
          credito_titular_ref: string | null
          deleted_at: string | null
          descuento_total: number | null
          empresa_id: string
          enganche_requerido: number | null
          es_pep: boolean | null
          estado: string
          fase_actual: string | null
          fase_posicion: number | null
          fecha_escritura: string | null
          forma_pago: string | null
          gastos_escrituracion: number | null
          id: string
          ine_numero: string | null
          monto_avaluo: number | null
          monto_credito_cotitular: number | null
          monto_credito_titular: number | null
          motivo_desasignacion: string | null
          notario: string | null
          notas: string | null
          numero_escritura: string | null
          ocupacion: string | null
          persona_id: string
          precio_asignacion: number | null
          tipo_credito: string | null
          unidad_id: string | null
          updated_at: string
          uso_efectivo: string | null
          valor_comercial: number | null
          valor_escrituracion: number | null
          vendedor: string | null
          vendedor_usuario_id: string | null
        }
        Insert: {
          anticipo_comision?: number | null
          casa_valuadora?: string | null
          coda_row_id?: string | null
          comision_gerencia?: number | null
          comision_vendedor?: number | null
          conocimiento_dueno_beneficiario?: string | null
          created_at?: string
          credito_cotitular_ref?: string | null
          credito_titular_ref?: string | null
          deleted_at?: string | null
          descuento_total?: number | null
          empresa_id: string
          enganche_requerido?: number | null
          es_pep?: boolean | null
          estado?: string
          fase_actual?: string | null
          fase_posicion?: number | null
          fecha_escritura?: string | null
          forma_pago?: string | null
          gastos_escrituracion?: number | null
          id?: string
          ine_numero?: string | null
          monto_avaluo?: number | null
          monto_credito_cotitular?: number | null
          monto_credito_titular?: number | null
          motivo_desasignacion?: string | null
          notario?: string | null
          notas?: string | null
          numero_escritura?: string | null
          ocupacion?: string | null
          persona_id: string
          precio_asignacion?: number | null
          tipo_credito?: string | null
          unidad_id?: string | null
          updated_at?: string
          uso_efectivo?: string | null
          valor_comercial?: number | null
          valor_escrituracion?: number | null
          vendedor?: string | null
          vendedor_usuario_id?: string | null
        }
        Update: {
          anticipo_comision?: number | null
          casa_valuadora?: string | null
          coda_row_id?: string | null
          comision_gerencia?: number | null
          comision_vendedor?: number | null
          conocimiento_dueno_beneficiario?: string | null
          created_at?: string
          credito_cotitular_ref?: string | null
          credito_titular_ref?: string | null
          deleted_at?: string | null
          descuento_total?: number | null
          empresa_id?: string
          enganche_requerido?: number | null
          es_pep?: boolean | null
          estado?: string
          fase_actual?: string | null
          fase_posicion?: number | null
          fecha_escritura?: string | null
          forma_pago?: string | null
          gastos_escrituracion?: number | null
          id?: string
          ine_numero?: string | null
          monto_avaluo?: number | null
          monto_credito_cotitular?: number | null
          monto_credito_titular?: number | null
          motivo_desasignacion?: string | null
          notario?: string | null
          notas?: string | null
          numero_escritura?: string | null
          ocupacion?: string | null
          persona_id?: string
          precio_asignacion?: number | null
          tipo_credito?: string | null
          unidad_id?: string | null
          updated_at?: string
          uso_efectivo?: string | null
          valor_comercial?: number | null
          valor_escrituracion?: number | null
          vendedor?: string | null
          vendedor_usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_construccion_tareas_terminadas_con_mo: {
        Row: {
          construccion_id: string | null
          created_at: string | null
          deleted_at: string | null
          empresa_id: string | null
          fecha_pagada: string | null
          fecha_terminada: string | null
          id: string | null
          mo_calculado: number | null
          notas: string | null
          plantilla_tarea_id: string | null
          revisado_por_persona_id: string | null
          tiempo_real_dias: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "construccion_tareas_terminadas_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construccion_tareas_terminadas_plantilla_tarea_id_fkey"
            columns: ["plantilla_tarea_id"]
            isOneToOne: false
            referencedRelation: "plantilla_tareas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      fn_calcular_avance_construccion: {
        Args: { p_construccion_id: string }
        Returns: number
      }
      fn_calcular_precio_venta: {
        Args: {
          p_monto_credito_cotitular?: number
          p_monto_credito_titular?: number
          p_tipo_credito_id?: string
          p_unidad_id: string
        }
        Returns: Json
      }
      fn_es_vendedor_restringido: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  erp: {
    Tables: {
      activos: {
        Row: {
          activo: boolean
          clasificacion: string | null
          codigo: string | null
          costo_adquisicion: number | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          estado_id: string | null
          fecha_adquisicion: string | null
          id: string
          marca: string | null
          metadata: Json | null
          modelo: string | null
          nombre: string
          numero_serie: string | null
          responsable_id: string | null
          tipo: string | null
          ubicacion: string | null
          updated_at: string | null
          valor_actual: number | null
          vida_util_anios: number | null
        }
        Insert: {
          activo?: boolean
          clasificacion?: string | null
          codigo?: string | null
          costo_adquisicion?: number | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          estado_id?: string | null
          fecha_adquisicion?: string | null
          id?: string
          marca?: string | null
          metadata?: Json | null
          modelo?: string | null
          nombre: string
          numero_serie?: string | null
          responsable_id?: string | null
          tipo?: string | null
          ubicacion?: string | null
          updated_at?: string | null
          valor_actual?: number | null
          vida_util_anios?: number | null
        }
        Update: {
          activo?: boolean
          clasificacion?: string | null
          codigo?: string | null
          costo_adquisicion?: number | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          estado_id?: string | null
          fecha_adquisicion?: string | null
          id?: string
          marca?: string | null
          metadata?: Json | null
          modelo?: string | null
          nombre?: string
          numero_serie?: string | null
          responsable_id?: string | null
          tipo?: string | null
          ubicacion?: string | null
          updated_at?: string | null
          valor_actual?: number | null
          vida_util_anios?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "activos_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      activos_mantenimiento: {
        Row: {
          activo_id: string
          costo: number | null
          created_at: string
          descripcion: string | null
          empresa_id: string
          fecha: string
          id: string
          notas: string | null
          proveedor_id: string | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          activo_id: string
          costo?: number | null
          created_at?: string
          descripcion?: string | null
          empresa_id: string
          fecha?: string
          id?: string
          notas?: string | null
          proveedor_id?: string | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          activo_id?: string
          costo?: number | null
          created_at?: string
          descripcion?: string | null
          empresa_id?: string
          fecha?: string
          id?: string
          notas?: string | null
          proveedor_id?: string | null
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activos_mantenimiento_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_mantenimiento_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      adjuntos: {
        Row: {
          created_at: string
          empresa_id: string
          entidad_id: string
          entidad_tipo: string
          id: string
          metadata: Json | null
          nombre: string
          rol: string
          tamano_bytes: number | null
          tipo_mime: string | null
          uploaded_by: string | null
          url: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          entidad_id: string
          entidad_tipo: string
          id?: string
          metadata?: Json | null
          nombre: string
          rol?: string
          tamano_bytes?: number | null
          tipo_mime?: string | null
          uploaded_by?: string | null
          url: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          entidad_id?: string
          entidad_tipo?: string
          id?: string
          metadata?: Json | null
          nombre?: string
          rol?: string
          tamano_bytes?: number | null
          tipo_mime?: string | null
          uploaded_by?: string | null
          url?: string
        }
        Relationships: []
      }
      almacenes: {
        Row: {
          activo: boolean
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          responsable_id: string | null
          ubicacion: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          responsable_id?: string | null
          ubicacion?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          responsable_id?: string | null
          ubicacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "almacenes_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "almacenes_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      aprobaciones: {
        Row: {
          aprobador_id: string | null
          comentario: string | null
          created_at: string
          empresa_id: string
          entidad_id: string
          entidad_tipo: string
          estado: string
          id: string
          paso: number
        }
        Insert: {
          aprobador_id?: string | null
          comentario?: string | null
          created_at?: string
          empresa_id: string
          entidad_id: string
          entidad_tipo: string
          estado?: string
          id?: string
          paso?: number
        }
        Update: {
          aprobador_id?: string | null
          comentario?: string | null
          created_at?: string
          empresa_id?: string
          entidad_id?: string
          entidad_tipo?: string
          estado?: string
          id?: string
          paso?: number
        }
        Relationships: []
      }
      cajas: {
        Row: {
          activo: boolean
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          responsable_id: string | null
          ubicacion: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          responsable_id?: string | null
          ubicacion?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          responsable_id?: string | null
          ubicacion?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cajas_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cajas_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      categorias_producto: {
        Row: {
          activo: boolean
          color: string | null
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          color?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          color?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      citas: {
        Row: {
          cliente_id: string | null
          creado_por: string | null
          created_at: string
          duracion_minutos: number | null
          empresa_id: string
          estado: string
          fecha_hora: string
          id: string
          lugar: string | null
          notas: string | null
          persona_id: string | null
          responsable_id: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          cliente_id?: string | null
          creado_por?: string | null
          created_at?: string
          duracion_minutos?: number | null
          empresa_id: string
          estado?: string
          fecha_hora: string
          id?: string
          lugar?: string | null
          notas?: string | null
          persona_id?: string | null
          responsable_id?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          cliente_id?: string | null
          creado_por?: string | null
          created_at?: string
          duracion_minutos?: number | null
          empresa_id?: string
          estado?: string
          fecha_hora?: string
          id?: string
          lugar?: string | null
          notas?: string | null
          persona_id?: string | null
          responsable_id?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "citas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "citas_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      clientes: {
        Row: {
          activo: boolean
          created_at: string
          deleted_at: string | null
          empresa_id: string
          id: string
          perfil_extra: Json | null
          persona_id: string
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          id?: string
          perfil_extra?: Json | null
          persona_id: string
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          perfil_extra?: Json | null
          persona_id?: string
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      cobranza: {
        Row: {
          cliente_id: string | null
          created_at: string
          empresa_id: string
          estado: string
          fecha_pago: string | null
          fecha_vencimiento: string
          id: string
          monto: number
          numero_pago: number
          updated_at: string | null
          venta_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          empresa_id: string
          estado?: string
          fecha_pago?: string | null
          fecha_vencimiento: string
          id?: string
          monto: number
          numero_pago: number
          updated_at?: string | null
          venta_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          empresa_id?: string
          estado?: string
          fecha_pago?: string | null
          fecha_vencimiento?: string
          id?: string
          monto?: number
          numero_pago?: number
          updated_at?: string | null
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranza_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranza_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas_inmobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliaciones: {
        Row: {
          creado_por: string | null
          created_at: string
          empresa_id: string
          gasto_id: string | null
          id: string
          monto_aplicado: number
          movimiento_bancario_id: string
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          empresa_id: string
          gasto_id?: string | null
          id?: string
          monto_aplicado: number
          movimiento_bancario_id: string
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          empresa_id?: string
          gasto_id?: string | null
          id?: string
          monto_aplicado?: number
          movimiento_bancario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliaciones_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliaciones_movimiento_bancario_id_fkey"
            columns: ["movimiento_bancario_id"]
            isOneToOne: false
            referencedRelation: "movimientos_bancarios"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          contenido_url: string | null
          created_at: string
          empresa_id: string
          estado_id: string | null
          fecha_firma: string | null
          fecha_vencimiento: string | null
          id: string
          numero_contrato: string | null
          tipo: string | null
          venta_id: string | null
        }
        Insert: {
          contenido_url?: string | null
          created_at?: string
          empresa_id: string
          estado_id?: string | null
          fecha_firma?: string | null
          fecha_vencimiento?: string | null
          id?: string
          numero_contrato?: string | null
          tipo?: string | null
          venta_id?: string | null
        }
        Update: {
          contenido_url?: string | null
          created_at?: string
          empresa_id?: string
          estado_id?: string | null
          fecha_firma?: string | null
          fecha_vencimiento?: string | null
          id?: string
          numero_contrato?: string | null
          tipo?: string | null
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas_inmobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      corte_conteo_denominaciones: {
        Row: {
          cantidad: number
          corte_id: string
          created_at: string
          denominacion: number
          empresa_id: string
          id: string
          subtotal: number | null
          tipo: string
        }
        Insert: {
          cantidad?: number
          corte_id: string
          created_at?: string
          denominacion: number
          empresa_id: string
          id?: string
          subtotal?: number | null
          tipo: string
        }
        Update: {
          cantidad?: number
          corte_id?: string
          created_at?: string
          denominacion?: number
          empresa_id?: string
          id?: string
          subtotal?: number | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "corte_conteo_denominaciones_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "cortes_caja"
            referencedColumns: ["id"]
          },
        ]
      }
      cortes_caja: {
        Row: {
          abierto_at: string | null
          caja_nombre: string | null
          cajero_id: string | null
          cerrado_at: string | null
          corte_nombre: string | null
          created_at: string
          diferencia: number | null
          efectivo_contado: number | null
          efectivo_inicial: number | null
          empresa_id: string
          estado: string
          fecha_operativa: string | null
          id: string
          observaciones: string | null
          tipo: string
          total_efectivo: number | null
          total_tarjeta: number | null
          total_transferencia: number | null
          total_ventas: number | null
          turno_id: string | null
          updated_at: string | null
          validado_at: string | null
        }
        Insert: {
          abierto_at?: string | null
          caja_nombre?: string | null
          cajero_id?: string | null
          cerrado_at?: string | null
          corte_nombre?: string | null
          created_at?: string
          diferencia?: number | null
          efectivo_contado?: number | null
          efectivo_inicial?: number | null
          empresa_id: string
          estado?: string
          fecha_operativa?: string | null
          id?: string
          observaciones?: string | null
          tipo?: string
          total_efectivo?: number | null
          total_tarjeta?: number | null
          total_transferencia?: number | null
          total_ventas?: number | null
          turno_id?: string | null
          updated_at?: string | null
          validado_at?: string | null
        }
        Update: {
          abierto_at?: string | null
          caja_nombre?: string | null
          cajero_id?: string | null
          cerrado_at?: string | null
          corte_nombre?: string | null
          created_at?: string
          diferencia?: number | null
          efectivo_contado?: number | null
          efectivo_inicial?: number | null
          empresa_id?: string
          estado?: string
          fecha_operativa?: string | null
          id?: string
          observaciones?: string | null
          tipo?: string
          total_efectivo?: number | null
          total_tarjeta?: number | null
          total_transferencia?: number | null
          total_ventas?: number | null
          turno_id?: string | null
          updated_at?: string | null
          validado_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cortes_caja_cajero_id_fkey"
            columns: ["cajero_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_caja_cajero_id_fkey"
            columns: ["cajero_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
          {
            foreignKeyName: "cortes_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      cortes_vouchers: {
        Row: {
          afiliacion: string | null
          banco_id: string | null
          categoria: string
          corte_id: string
          empresa_id: string
          id: string
          mime_type: string | null
          monto_reportado: number | null
          movimiento_caja_id: string | null
          nombre_original: string | null
          ocr_banco_sugerido_id: string | null
          ocr_confianza: number | null
          ocr_monto_sugerido: number | null
          ocr_texto_crudo: string | null
          storage_path: string
          tamano_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
          uploaded_by_nombre: string | null
        }
        Insert: {
          afiliacion?: string | null
          banco_id?: string | null
          categoria?: string
          corte_id: string
          empresa_id: string
          id?: string
          mime_type?: string | null
          monto_reportado?: number | null
          movimiento_caja_id?: string | null
          nombre_original?: string | null
          ocr_banco_sugerido_id?: string | null
          ocr_confianza?: number | null
          ocr_monto_sugerido?: number | null
          ocr_texto_crudo?: string | null
          storage_path: string
          tamano_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_nombre?: string | null
        }
        Update: {
          afiliacion?: string | null
          banco_id?: string | null
          categoria?: string
          corte_id?: string
          empresa_id?: string
          id?: string
          mime_type?: string | null
          monto_reportado?: number | null
          movimiento_caja_id?: string | null
          nombre_original?: string | null
          ocr_banco_sugerido_id?: string | null
          ocr_confianza?: number | null
          ocr_monto_sugerido?: number | null
          ocr_texto_crudo?: string | null
          storage_path?: string
          tamano_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cortes_vouchers_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "cortes_caja"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_vouchers_movimiento_caja_id_fkey"
            columns: ["movimiento_caja_id"]
            isOneToOne: false
            referencedRelation: "movimientos_caja"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_bancarias: {
        Row: {
          activo: boolean
          banco: string | null
          clabe: string | null
          created_at: string
          empresa_id: string
          id: string
          moneda_id: string | null
          nombre: string
          numero_cuenta: string | null
          saldo_actual: number | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          banco?: string | null
          clabe?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          moneda_id?: string | null
          nombre: string
          numero_cuenta?: string | null
          saldo_actual?: number | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          banco?: string | null
          clabe?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          moneda_id?: string | null
          nombre?: string
          numero_cuenta?: string | null
          saldo_actual?: number | null
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      departamentos: {
        Row: {
          activo: boolean
          codigo: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          id: string
          nombre: string
          padre_id: string | null
        }
        Insert: {
          activo?: boolean
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          id?: string
          nombre: string
          padre_id?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          padre_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departamentos_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departamentos_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["departamento_id"]
          },
        ]
      }
      documentos: {
        Row: {
          archivo_url: string | null
          contenido_embedding: string | null
          contenido_texto: string | null
          contenido_texto_tsv: unknown
          creado_por: string | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          estado: string | null
          extraccion_error: string | null
          extraccion_fecha: string | null
          extraccion_modelo: string | null
          extraccion_status: string
          fecha_emision: string | null
          fecha_vencimiento: string | null
          folio_real: string | null
          id: string
          libro_tomo: string | null
          moneda: string | null
          monto: number | null
          municipio: string | null
          notaria: string | null
          notario_proveedor_id: string | null
          notas: string | null
          numero_documento: string | null
          partes: Json | null
          precio_m2: number | null
          subtipo_meta: Json | null
          superficie_m2: number | null
          tipo: string | null
          tipo_operacion: string | null
          titulo: string
          ubicacion_predio: string | null
          updated_at: string | null
        }
        Insert: {
          archivo_url?: string | null
          contenido_embedding?: string | null
          contenido_texto?: string | null
          contenido_texto_tsv?: unknown
          creado_por?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          estado?: string | null
          extraccion_error?: string | null
          extraccion_fecha?: string | null
          extraccion_modelo?: string | null
          extraccion_status?: string
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          folio_real?: string | null
          id?: string
          libro_tomo?: string | null
          moneda?: string | null
          monto?: number | null
          municipio?: string | null
          notaria?: string | null
          notario_proveedor_id?: string | null
          notas?: string | null
          numero_documento?: string | null
          partes?: Json | null
          precio_m2?: number | null
          subtipo_meta?: Json | null
          superficie_m2?: number | null
          tipo?: string | null
          tipo_operacion?: string | null
          titulo: string
          ubicacion_predio?: string | null
          updated_at?: string | null
        }
        Update: {
          archivo_url?: string | null
          contenido_embedding?: string | null
          contenido_texto?: string | null
          contenido_texto_tsv?: unknown
          creado_por?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          estado?: string | null
          extraccion_error?: string | null
          extraccion_fecha?: string | null
          extraccion_modelo?: string | null
          extraccion_status?: string
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          folio_real?: string | null
          id?: string
          libro_tomo?: string | null
          moneda?: string | null
          monto?: number | null
          municipio?: string | null
          notaria?: string | null
          notario_proveedor_id?: string | null
          notas?: string | null
          numero_documento?: string | null
          partes?: Json | null
          precio_m2?: number | null
          subtipo_meta?: Json | null
          superficie_m2?: number | null
          tipo?: string | null
          tipo_operacion?: string | null
          titulo?: string
          ubicacion_predio?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_notario_proveedor_id_fkey"
            columns: ["notario_proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      empleado_beneficiarios: {
        Row: {
          created_at: string
          empleado_id: string
          empresa_id: string
          id: string
          nombre: string
          orden: number
          parentesco: string | null
          porcentaje: number | null
          telefono: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          empleado_id: string
          empresa_id: string
          id?: string
          nombre: string
          orden?: number
          parentesco?: string | null
          porcentaje?: number | null
          telefono?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          empleado_id?: string
          empresa_id?: string
          id?: string
          nombre?: string
          orden?: number
          parentesco?: string | null
          porcentaje?: number | null
          telefono?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empleado_beneficiarios_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleado_beneficiarios_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      empleados: {
        Row: {
          activo: boolean
          created_at: string
          deleted_at: string | null
          departamento_id: string | null
          dia_pago: string | null
          email_empresa: string | null
          empresa_id: string
          extension: string | null
          fecha_baja: string | null
          fecha_ingreso: string | null
          fecha_nacimiento: string | null
          funciones: string | null
          horario: string | null
          id: string
          lugar_trabajo: string | null
          metodo_pago_sat: string | null
          motivo_baja: string | null
          notas: string | null
          nss: string | null
          numero_empleado: string | null
          periodo_prueba_dias: number | null
          periodo_prueba_numero: number | null
          persona_id: string
          puesto_id: string | null
          reemplaza_a: string | null
          regimen_imss: string | null
          sindicalizado: string | null
          telefono_empresa: string | null
          tipo_contrato: string | null
          tipo_prestacion: string | null
          umf: string | null
          updated_at: string | null
          zona_salario: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          deleted_at?: string | null
          departamento_id?: string | null
          dia_pago?: string | null
          email_empresa?: string | null
          empresa_id: string
          extension?: string | null
          fecha_baja?: string | null
          fecha_ingreso?: string | null
          fecha_nacimiento?: string | null
          funciones?: string | null
          horario?: string | null
          id?: string
          lugar_trabajo?: string | null
          metodo_pago_sat?: string | null
          motivo_baja?: string | null
          notas?: string | null
          nss?: string | null
          numero_empleado?: string | null
          periodo_prueba_dias?: number | null
          periodo_prueba_numero?: number | null
          persona_id: string
          puesto_id?: string | null
          reemplaza_a?: string | null
          regimen_imss?: string | null
          sindicalizado?: string | null
          telefono_empresa?: string | null
          tipo_contrato?: string | null
          tipo_prestacion?: string | null
          umf?: string | null
          updated_at?: string | null
          zona_salario?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          deleted_at?: string | null
          departamento_id?: string | null
          dia_pago?: string | null
          email_empresa?: string | null
          empresa_id?: string
          extension?: string | null
          fecha_baja?: string | null
          fecha_ingreso?: string | null
          fecha_nacimiento?: string | null
          funciones?: string | null
          horario?: string | null
          id?: string
          lugar_trabajo?: string | null
          metodo_pago_sat?: string | null
          motivo_baja?: string | null
          notas?: string | null
          nss?: string | null
          numero_empleado?: string | null
          periodo_prueba_dias?: number | null
          periodo_prueba_numero?: number | null
          persona_id?: string
          puesto_id?: string | null
          reemplaza_a?: string | null
          regimen_imss?: string | null
          sindicalizado?: string | null
          telefono_empresa?: string | null
          tipo_contrato?: string | null
          tipo_prestacion?: string | null
          umf?: string | null
          updated_at?: string | null
          zona_salario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empleados_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["departamento_id"]
          },
          {
            foreignKeyName: "empleados_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "empleados_puesto_id_fkey"
            columns: ["puesto_id"]
            isOneToOne: false
            referencedRelation: "puestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      empleados_compensacion: {
        Row: {
          bonificaciones_mensuales: number | null
          comisiones_mensuales: number | null
          compensaciones_mensuales: number | null
          created_at: string
          empleado_id: string
          empresa_id: string
          fecha_fin: string | null
          fecha_inicio: string
          frecuencia_pago: string | null
          id: string
          sdi: number | null
          sueldo_diario: number | null
          sueldo_mensual: number | null
          tipo_contrato: string | null
          updated_at: string | null
          vigente: boolean
        }
        Insert: {
          bonificaciones_mensuales?: number | null
          comisiones_mensuales?: number | null
          compensaciones_mensuales?: number | null
          created_at?: string
          empleado_id: string
          empresa_id: string
          fecha_fin?: string | null
          fecha_inicio: string
          frecuencia_pago?: string | null
          id?: string
          sdi?: number | null
          sueldo_diario?: number | null
          sueldo_mensual?: number | null
          tipo_contrato?: string | null
          updated_at?: string | null
          vigente?: boolean
        }
        Update: {
          bonificaciones_mensuales?: number | null
          comisiones_mensuales?: number | null
          compensaciones_mensuales?: number | null
          created_at?: string
          empleado_id?: string
          empresa_id?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          frecuencia_pago?: string | null
          id?: string
          sdi?: number | null
          sueldo_diario?: number | null
          sueldo_mensual?: number | null
          tipo_contrato?: string | null
          updated_at?: string | null
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "empleados_compensacion_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_compensacion_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      empleados_import_log: {
        Row: {
          accion: string
          created_at: string
          diff: Json
          empleado_id: string | null
          empresa_id: string
          id: string
          match_metodo: string | null
          notas: string | null
          origen: string
          persona_id: string | null
          snapshot_fecha: string
        }
        Insert: {
          accion: string
          created_at?: string
          diff?: Json
          empleado_id?: string | null
          empresa_id: string
          id?: string
          match_metodo?: string | null
          notas?: string | null
          origen: string
          persona_id?: string | null
          snapshot_fecha: string
        }
        Update: {
          accion?: string
          created_at?: string
          diff?: Json
          empleado_id?: string | null
          empresa_id?: string
          id?: string
          match_metodo?: string | null
          notas?: string | null
          origen?: string
          persona_id?: string | null
          snapshot_fecha?: string
        }
        Relationships: [
          {
            foreignKeyName: "empleados_import_log_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_import_log_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
          {
            foreignKeyName: "empleados_import_log_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_import_log_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      empleados_pago: {
        Row: {
          banco_codigo: string | null
          banco_nombre: string | null
          clabe: string | null
          created_at: string
          empleado_id: string
          empresa_id: string
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          notas: string | null
          numero_cuenta: string | null
          sucursal: string | null
          updated_at: string | null
          vigente: boolean
        }
        Insert: {
          banco_codigo?: string | null
          banco_nombre?: string | null
          clabe?: string | null
          created_at?: string
          empleado_id: string
          empresa_id: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          notas?: string | null
          numero_cuenta?: string | null
          sucursal?: string | null
          updated_at?: string | null
          vigente?: boolean
        }
        Update: {
          banco_codigo?: string | null
          banco_nombre?: string | null
          clabe?: string | null
          created_at?: string
          empleado_id?: string
          empresa_id?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          notas?: string | null
          numero_cuenta?: string | null
          sucursal?: string | null
          updated_at?: string | null
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "empleados_pago_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_pago_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      empleados_puestos: {
        Row: {
          created_at: string
          empleado_id: string
          empresa_id: string
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          principal: boolean
          puesto_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          empleado_id: string
          empresa_id: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          principal?: boolean
          puesto_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          empleado_id?: string
          empresa_id?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          principal?: boolean
          puesto_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empleados_puestos_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_puestos_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
          {
            foreignKeyName: "empleados_puestos_puesto_id_fkey"
            columns: ["puesto_id"]
            isOneToOne: false
            referencedRelation: "puestos"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas: {
        Row: {
          created_at: string
          emisor_nombre: string | null
          emisor_rfc: string | null
          empresa_id: string
          estado_id: string | null
          fecha_emision: string
          fecha_vencimiento: string | null
          flujo: string
          id: string
          iva: number | null
          pdf_url: string | null
          persona_id: string | null
          receptor_rfc: string | null
          subtotal: number | null
          tipo_ingreso_id: string | null
          total: number | null
          updated_at: string | null
          uuid_sat: string | null
          xml_url: string | null
        }
        Insert: {
          created_at?: string
          emisor_nombre?: string | null
          emisor_rfc?: string | null
          empresa_id: string
          estado_id?: string | null
          fecha_emision: string
          fecha_vencimiento?: string | null
          flujo: string
          id?: string
          iva?: number | null
          pdf_url?: string | null
          persona_id?: string | null
          receptor_rfc?: string | null
          subtotal?: number | null
          tipo_ingreso_id?: string | null
          total?: number | null
          updated_at?: string | null
          uuid_sat?: string | null
          xml_url?: string | null
        }
        Update: {
          created_at?: string
          emisor_nombre?: string | null
          emisor_rfc?: string | null
          empresa_id?: string
          estado_id?: string | null
          fecha_emision?: string
          fecha_vencimiento?: string | null
          flujo?: string
          id?: string
          iva?: number | null
          pdf_url?: string | null
          persona_id?: string | null
          receptor_rfc?: string | null
          subtotal?: number | null
          tipo_ingreso_id?: string | null
          total?: number | null
          updated_at?: string | null
          uuid_sat?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturas_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      finiquitos: {
        Row: {
          antiguedad_anios: number
          antiguedad_dias: number
          antiguedad_meses: number
          causa: string
          conceptos: Json
          creado_en: string
          creado_por: string | null
          empleado_id: string
          empleado_snapshot: Json
          empresa_id: string
          fecha_baja: string
          fecha_convenio: string
          fecha_ingreso: string
          forma_pago: string
          id: string
          motivo_detalle: string | null
          notas_calculo: Json
          patron_snapshot: Json
          referencia_pago: string | null
          salario_minimo_diario: number
          sdi: number | null
          sueldo_diario: number
          total_finiquito: number
          total_general: number
          total_indemnizacion: number
          zona_salario_minimo: string
        }
        Insert: {
          antiguedad_anios: number
          antiguedad_dias: number
          antiguedad_meses: number
          causa: string
          conceptos: Json
          creado_en?: string
          creado_por?: string | null
          empleado_id: string
          empleado_snapshot: Json
          empresa_id: string
          fecha_baja: string
          fecha_convenio: string
          fecha_ingreso: string
          forma_pago: string
          id?: string
          motivo_detalle?: string | null
          notas_calculo?: Json
          patron_snapshot: Json
          referencia_pago?: string | null
          salario_minimo_diario: number
          sdi?: number | null
          sueldo_diario: number
          total_finiquito: number
          total_general: number
          total_indemnizacion?: number
          zona_salario_minimo: string
        }
        Update: {
          antiguedad_anios?: number
          antiguedad_dias?: number
          antiguedad_meses?: number
          causa?: string
          conceptos?: Json
          creado_en?: string
          creado_por?: string | null
          empleado_id?: string
          empleado_snapshot?: Json
          empresa_id?: string
          fecha_baja?: string
          fecha_convenio?: string
          fecha_ingreso?: string
          forma_pago?: string
          id?: string
          motivo_detalle?: string | null
          notas_calculo?: Json
          patron_snapshot?: Json
          referencia_pago?: string | null
          salario_minimo_diario?: number
          sdi?: number | null
          sueldo_diario?: number
          total_finiquito?: number
          total_general?: number
          total_indemnizacion?: number
          zona_salario_minimo?: string
        }
        Relationships: [
          {
            foreignKeyName: "finiquitos_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finiquitos_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria_id: string | null
          creado_por: string | null
          created_at: string
          descripcion: string
          empresa_id: string
          fecha: string
          id: string
          metodo_pago: string | null
          moneda_id: string | null
          monto: number
          referencia: string | null
          registrado: boolean
          updated_at: string | null
        }
        Insert: {
          categoria_id?: string | null
          creado_por?: string | null
          created_at?: string
          descripcion: string
          empresa_id: string
          fecha?: string
          id?: string
          metodo_pago?: string | null
          moneda_id?: string | null
          monto: number
          referencia?: string | null
          registrado?: boolean
          updated_at?: string | null
        }
        Update: {
          categoria_id?: string | null
          creado_por?: string | null
          created_at?: string
          descripcion?: string
          empresa_id?: string
          fecha?: string
          id?: string
          metodo_pago?: string | null
          moneda_id?: string | null
          monto?: number
          referencia?: string | null
          registrado?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      inventario: {
        Row: {
          almacen_id: string
          cantidad: number
          cantidad_maxima: number | null
          cantidad_minima: number | null
          costo_promedio: number | null
          created_at: string
          empresa_id: string
          id: string
          producto_id: string
          ultimo_movimiento: string | null
          updated_at: string | null
        }
        Insert: {
          almacen_id: string
          cantidad?: number
          cantidad_maxima?: number | null
          cantidad_minima?: number | null
          costo_promedio?: number | null
          created_at?: string
          empresa_id: string
          id?: string
          producto_id: string
          ultimo_movimiento?: string | null
          updated_at?: string | null
        }
        Update: {
          almacen_id?: string
          cantidad?: number
          cantidad_maxima?: number | null
          cantidad_minima?: number | null
          costo_promedio?: number | null
          created_at?: string
          empresa_id?: string
          id?: string
          producto_id?: string
          ultimo_movimiento?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_levantamiento_firmas: {
        Row: {
          comentario: string | null
          empresa_id: string
          firmado_at: string
          firmante_id: string
          firmante_nombre: string
          id: string
          ip: unknown
          levantamiento_id: string
          paso: number
          rol: string
          total_diferencia: number | null
          total_lineas: number
          total_lineas_fuera: number
          user_agent: string | null
        }
        Insert: {
          comentario?: string | null
          empresa_id: string
          firmado_at?: string
          firmante_id: string
          firmante_nombre: string
          id?: string
          ip?: unknown
          levantamiento_id: string
          paso: number
          rol: string
          total_diferencia?: number | null
          total_lineas: number
          total_lineas_fuera: number
          user_agent?: string | null
        }
        Update: {
          comentario?: string | null
          empresa_id?: string
          firmado_at?: string
          firmante_id?: string
          firmante_nombre?: string
          id?: string
          ip?: unknown
          levantamiento_id?: string
          paso?: number
          rol?: string
          total_diferencia?: number | null
          total_lineas?: number
          total_lineas_fuera?: number
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_levantamiento_firmas_levantamiento_id_fkey"
            columns: ["levantamiento_id"]
            isOneToOne: false
            referencedRelation: "inventario_levantamientos"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_levantamiento_lineas: {
        Row: {
          cantidad_contada: number | null
          contado_at: string | null
          contado_por: string | null
          costo_unitario: number | null
          created_at: string
          diferencia: number | null
          diferencia_valor: number | null
          empresa_id: string
          fuera_de_tolerancia: boolean
          id: string
          levantamiento_id: string
          notas_diferencia: string | null
          producto_id: string
          recontada: boolean
          salidas_durante_captura: number
          stock_efectivo: number | null
          stock_inicial: number
          updated_at: string
        }
        Insert: {
          cantidad_contada?: number | null
          contado_at?: string | null
          contado_por?: string | null
          costo_unitario?: number | null
          created_at?: string
          diferencia?: number | null
          diferencia_valor?: number | null
          empresa_id: string
          fuera_de_tolerancia?: boolean
          id?: string
          levantamiento_id: string
          notas_diferencia?: string | null
          producto_id: string
          recontada?: boolean
          salidas_durante_captura?: number
          stock_efectivo?: number | null
          stock_inicial: number
          updated_at?: string
        }
        Update: {
          cantidad_contada?: number | null
          contado_at?: string | null
          contado_por?: string | null
          costo_unitario?: number | null
          created_at?: string
          diferencia?: number | null
          diferencia_valor?: number | null
          empresa_id?: string
          fuera_de_tolerancia?: boolean
          id?: string
          levantamiento_id?: string
          notas_diferencia?: string | null
          producto_id?: string
          recontada?: boolean
          salidas_durante_captura?: number
          stock_efectivo?: number | null
          stock_inicial?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_levantamiento_lineas_levantamiento_id_fkey"
            columns: ["levantamiento_id"]
            isOneToOne: false
            referencedRelation: "inventario_levantamientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_levantamiento_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_levantamientos: {
        Row: {
          almacen_id: string
          contador_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          empresa_id: string
          estado: string
          fecha_aplicado: string | null
          fecha_cancelado: string | null
          fecha_cierre: string | null
          fecha_inicio: string | null
          fecha_programada: string
          folio: string | null
          id: string
          motivo_cancelacion: string | null
          notas: string | null
          tipo: string
          tolerancia_monto_override: number | null
          tolerancia_pct_override: number | null
          updated_at: string
        }
        Insert: {
          almacen_id: string
          contador_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          empresa_id: string
          estado?: string
          fecha_aplicado?: string | null
          fecha_cancelado?: string | null
          fecha_cierre?: string | null
          fecha_inicio?: string | null
          fecha_programada?: string
          folio?: string | null
          id?: string
          motivo_cancelacion?: string | null
          notas?: string | null
          tipo?: string
          tolerancia_monto_override?: number | null
          tolerancia_pct_override?: number | null
          updated_at?: string
        }
        Update: {
          almacen_id?: string
          contador_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          empresa_id?: string
          estado?: string
          fecha_aplicado?: string | null
          fecha_cancelado?: string | null
          fecha_cierre?: string | null
          fecha_inicio?: string | null
          fecha_programada?: string
          folio?: string | null
          id?: string
          motivo_cancelacion?: string | null
          notas?: string | null
          tipo?: string
          tolerancia_monto_override?: number | null
          tolerancia_pct_override?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_levantamientos_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      juntas: {
        Row: {
          creado_por: string | null
          created_at: string
          descripcion: string | null
          duracion_minutos: number | null
          empresa_id: string
          enviar_a_consejo: boolean
          estado: string
          fecha_hora: string
          fecha_terminada: string | null
          id: string
          lugar: string | null
          tipo: string | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          descripcion?: string | null
          duracion_minutos?: number | null
          empresa_id: string
          enviar_a_consejo?: boolean
          estado?: string
          fecha_hora: string
          fecha_terminada?: string | null
          id?: string
          lugar?: string | null
          tipo?: string | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          descripcion?: string | null
          duracion_minutos?: number | null
          empresa_id?: string
          enviar_a_consejo?: boolean
          estado?: string
          fecha_hora?: string
          fecha_terminada?: string | null
          id?: string
          lugar?: string | null
          tipo?: string | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      juntas_asistencia: {
        Row: {
          asistio: boolean | null
          created_at: string
          empresa_id: string
          id: string
          junta_id: string
          notas: string | null
          persona_id: string | null
        }
        Insert: {
          asistio?: boolean | null
          created_at?: string
          empresa_id: string
          id?: string
          junta_id: string
          notas?: string | null
          persona_id?: string | null
        }
        Update: {
          asistio?: boolean | null
          created_at?: string
          empresa_id?: string
          id?: string
          junta_id?: string
          notas?: string | null
          persona_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "juntas_asistencia_junta_id_fkey"
            columns: ["junta_id"]
            isOneToOne: false
            referencedRelation: "juntas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "juntas_asistencia_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "juntas_asistencia_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      juntas_notas: {
        Row: {
          contenido: string
          creado_por: string | null
          created_at: string
          empresa_id: string
          id: string
          junta_id: string
          orden: number
        }
        Insert: {
          contenido: string
          creado_por?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          junta_id: string
          orden?: number
        }
        Update: {
          contenido?: string
          creado_por?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          junta_id?: string
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "juntas_notas_junta_id_fkey"
            columns: ["junta_id"]
            isOneToOne: false
            referencedRelation: "juntas"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          codigo: string | null
          created_at: string
          empresa_id: string
          estado: string
          id: string
          lote: string | null
          manzana: string | null
          precio_lista: number | null
          precio_venta: number | null
          proyecto_id: string
          superficie_m2: number | null
          updated_at: string | null
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          empresa_id: string
          estado?: string
          id?: string
          lote?: string | null
          manzana?: string | null
          precio_lista?: number | null
          precio_venta?: number | null
          proyecto_id: string
          superficie_m2?: number | null
          updated_at?: string | null
        }
        Update: {
          codigo?: string | null
          created_at?: string
          empresa_id?: string
          estado?: string
          id?: string
          lote?: string | null
          manzana?: string | null
          precio_lista?: number | null
          precio_venta?: number | null
          proyecto_id?: string
          superficie_m2?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_bancarios: {
        Row: {
          categoria_id: string | null
          conciliado: boolean
          created_at: string
          cuenta_id: string
          descripcion: string | null
          empresa_id: string
          fecha: string
          id: string
          moneda_id: string | null
          monto: number
          referencia: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          categoria_id?: string | null
          conciliado?: boolean
          created_at?: string
          cuenta_id: string
          descripcion?: string | null
          empresa_id: string
          fecha?: string
          id?: string
          moneda_id?: string | null
          monto: number
          referencia?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          categoria_id?: string | null
          conciliado?: boolean
          created_at?: string
          cuenta_id?: string
          descripcion?: string | null
          empresa_id?: string
          fecha?: string
          id?: string
          moneda_id?: string | null
          monto?: number
          referencia?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_bancarios_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_caja: {
        Row: {
          concepto: string | null
          corte_id: string | null
          created_at: string
          empresa_id: string
          id: string
          monto: number
          realizado_por: string | null
          realizado_por_nombre: string | null
          referencia: string | null
          tipo: string
          tipo_detalle: string | null
        }
        Insert: {
          concepto?: string | null
          corte_id?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          monto: number
          realizado_por?: string | null
          realizado_por_nombre?: string | null
          referencia?: string | null
          tipo: string
          tipo_detalle?: string | null
        }
        Update: {
          concepto?: string | null
          corte_id?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          monto?: number
          realizado_por?: string | null
          realizado_por_nombre?: string | null
          referencia?: string | null
          tipo?: string
          tipo_detalle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_caja_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "cortes_caja"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_realizado_por_fkey"
            columns: ["realizado_por"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_realizado_por_fkey"
            columns: ["realizado_por"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      movimientos_inventario: {
        Row: {
          almacen_id: string
          cantidad: number
          costo_unitario: number | null
          created_at: string
          created_by: string | null
          empresa_id: string
          id: string
          notas: string | null
          producto_id: string
          referencia_id: string | null
          referencia_tipo: string | null
          tipo_movimiento: string
        }
        Insert: {
          almacen_id: string
          cantidad: number
          costo_unitario?: number | null
          created_at?: string
          created_by?: string | null
          empresa_id: string
          id?: string
          notas?: string | null
          producto_id: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo_movimiento: string
        }
        Update: {
          almacen_id?: string
          cantidad?: number
          costo_unitario?: number | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          id?: string
          notas?: string | null
          producto_id?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo_movimiento?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_compra: {
        Row: {
          autorizada_at: string | null
          cerrada_at: string | null
          cerrada_por: string | null
          codigo: string | null
          condiciones_pago: string | null
          created_at: string
          deleted_at: string | null
          direccion_entrega: string | null
          empresa_id: string
          estado: string
          estado_id: string | null
          fecha_entrega: string | null
          id: string
          iva: number | null
          moneda_id: string | null
          proveedor_id: string | null
          requisicion_id: string | null
          subtotal: number | null
          total: number | null
          total_a_pagar: number | null
          updated_at: string | null
        }
        Insert: {
          autorizada_at?: string | null
          cerrada_at?: string | null
          cerrada_por?: string | null
          codigo?: string | null
          condiciones_pago?: string | null
          created_at?: string
          deleted_at?: string | null
          direccion_entrega?: string | null
          empresa_id: string
          estado?: string
          estado_id?: string | null
          fecha_entrega?: string | null
          id?: string
          iva?: number | null
          moneda_id?: string | null
          proveedor_id?: string | null
          requisicion_id?: string | null
          subtotal?: number | null
          total?: number | null
          total_a_pagar?: number | null
          updated_at?: string | null
        }
        Update: {
          autorizada_at?: string | null
          cerrada_at?: string | null
          cerrada_por?: string | null
          codigo?: string | null
          condiciones_pago?: string | null
          created_at?: string
          deleted_at?: string | null
          direccion_entrega?: string | null
          empresa_id?: string
          estado?: string
          estado_id?: string | null
          fecha_entrega?: string | null
          id?: string
          iva?: number | null
          moneda_id?: string | null
          proveedor_id?: string | null
          requisicion_id?: string | null
          subtotal?: number | null
          total?: number | null
          total_a_pagar?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_requisicion_id_fkey"
            columns: ["requisicion_id"]
            isOneToOne: false
            referencedRelation: "requisiciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_compra_detalle: {
        Row: {
          cantidad: number
          cantidad_cancelada: number
          cantidad_recibida: number
          created_at: string
          descripcion: string | null
          descuento: number | null
          empresa_id: string
          id: string
          motivo_cancelacion: string | null
          orden_compra_id: string
          precio_modificado_at: string | null
          precio_modificado_por: string | null
          precio_real: number | null
          precio_unitario: number | null
          producto_id: string | null
          subtotal: number | null
          unidad: string | null
        }
        Insert: {
          cantidad?: number
          cantidad_cancelada?: number
          cantidad_recibida?: number
          created_at?: string
          descripcion?: string | null
          descuento?: number | null
          empresa_id: string
          id?: string
          motivo_cancelacion?: string | null
          orden_compra_id: string
          precio_modificado_at?: string | null
          precio_modificado_por?: string | null
          precio_real?: number | null
          precio_unitario?: number | null
          producto_id?: string | null
          subtotal?: number | null
          unidad?: string | null
        }
        Update: {
          cantidad?: number
          cantidad_cancelada?: number
          cantidad_recibida?: number
          created_at?: string
          descripcion?: string | null
          descuento?: number | null
          empresa_id?: string
          id?: string
          motivo_cancelacion?: string | null
          orden_compra_id?: string
          precio_modificado_at?: string | null
          precio_modificado_por?: string | null
          precio_real?: number | null
          precio_unitario?: number | null
          producto_id?: string | null
          subtotal?: number | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_detalle_orden_compra_id_fkey"
            columns: ["orden_compra_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_detalle_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          cobranza_id: string
          created_at: string
          empresa_id: string
          fecha_pago: string
          id: string
          metodo: string | null
          monto: number
          recibio_id: string | null
          referencia: string | null
        }
        Insert: {
          cobranza_id: string
          created_at?: string
          empresa_id: string
          fecha_pago?: string
          id?: string
          metodo?: string | null
          monto: number
          recibio_id?: string | null
          referencia?: string | null
        }
        Update: {
          cobranza_id?: string
          created_at?: string
          empresa_id?: string
          fecha_pago?: string
          id?: string
          metodo?: string | null
          monto?: number
          recibio_id?: string | null
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_cobranza_id_fkey"
            columns: ["cobranza_id"]
            isOneToOne: false
            referencedRelation: "cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_recibio_id_fkey"
            columns: ["recibio_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_recibio_id_fkey"
            columns: ["recibio_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      pagos_provisionales: {
        Row: {
          anio_fiscal: number
          base_gravable: number | null
          comprobante_url: string | null
          created_at: string
          empresa_id: string
          estado: string
          fecha_pago: string | null
          id: string
          isr_calculado: number | null
          mes: number
          pago: number | null
          updated_at: string | null
        }
        Insert: {
          anio_fiscal: number
          base_gravable?: number | null
          comprobante_url?: string | null
          created_at?: string
          empresa_id: string
          estado?: string
          fecha_pago?: string | null
          id?: string
          isr_calculado?: number | null
          mes: number
          pago?: number | null
          updated_at?: string | null
        }
        Update: {
          anio_fiscal?: number
          base_gravable?: number | null
          comprobante_url?: string | null
          created_at?: string
          empresa_id?: string
          estado?: string
          fecha_pago?: string | null
          id?: string
          isr_calculado?: number | null
          mes?: number
          pago?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      personas: {
        Row: {
          activo: boolean
          apellido_materno: string | null
          apellido_paterno: string | null
          contacto_emergencia_nombre: string | null
          contacto_emergencia_parentesco: string | null
          contacto_emergencia_telefono: string | null
          created_at: string
          curp: string | null
          deleted_at: string | null
          domicilio: string | null
          email: string | null
          empresa_id: string
          estado_civil: string | null
          fecha_nacimiento: string | null
          id: string
          lugar_nacimiento: string | null
          nacionalidad: string | null
          nombre: string
          nss: string | null
          rfc: string | null
          sexo: string | null
          telefono: string | null
          telefono_casa: string | null
          tipo: string
          tipo_persona: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          apellido_materno?: string | null
          apellido_paterno?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_parentesco?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string
          curp?: string | null
          deleted_at?: string | null
          domicilio?: string | null
          email?: string | null
          empresa_id: string
          estado_civil?: string | null
          fecha_nacimiento?: string | null
          id?: string
          lugar_nacimiento?: string | null
          nacionalidad?: string | null
          nombre: string
          nss?: string | null
          rfc?: string | null
          sexo?: string | null
          telefono?: string | null
          telefono_casa?: string | null
          tipo?: string
          tipo_persona?: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          apellido_materno?: string | null
          apellido_paterno?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_parentesco?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string
          curp?: string | null
          deleted_at?: string | null
          domicilio?: string | null
          email?: string | null
          empresa_id?: string
          estado_civil?: string | null
          fecha_nacimiento?: string | null
          id?: string
          lugar_nacimiento?: string | null
          nacionalidad?: string | null
          nombre?: string
          nss?: string | null
          rfc?: string | null
          sexo?: string | null
          telefono?: string | null
          telefono_casa?: string | null
          tipo?: string
          tipo_persona?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      personas_contactos: {
        Row: {
          activo: boolean
          created_at: string
          email: string | null
          empresa_id: string
          id: string
          nombre: string
          notas: string | null
          persona_id: string
          principal: boolean
          puesto: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email?: string | null
          empresa_id: string
          id?: string
          nombre: string
          notas?: string | null
          persona_id: string
          principal?: boolean
          puesto?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          notas?: string | null
          persona_id?: string
          principal?: boolean
          puesto?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personas_contactos_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_contactos_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      personas_cuentas_bancarias: {
        Row: {
          banco_id: string | null
          banco_nombre: string | null
          clabe: string | null
          created_at: string
          empresa_id: string
          id: string
          moneda: string
          notas: string | null
          numero_cuenta: string | null
          persona_id: string
          tipo: string | null
          updated_at: string
          vigente: boolean
        }
        Insert: {
          banco_id?: string | null
          banco_nombre?: string | null
          clabe?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          moneda?: string
          notas?: string | null
          numero_cuenta?: string | null
          persona_id: string
          tipo?: string | null
          updated_at?: string
          vigente?: boolean
        }
        Update: {
          banco_id?: string | null
          banco_nombre?: string | null
          clabe?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          moneda?: string
          notas?: string | null
          numero_cuenta?: string | null
          persona_id?: string
          tipo?: string | null
          updated_at?: string
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "personas_cuentas_bancarias_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_cuentas_bancarias_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      personas_datos_fiscales: {
        Row: {
          created_at: string
          csf_adjunto_id: string | null
          csf_fecha_emision: string | null
          domicilio_calle: string | null
          domicilio_colonia: string | null
          domicilio_cp: string | null
          domicilio_estado: string | null
          domicilio_municipio: string | null
          domicilio_num_ext: string | null
          domicilio_num_int: string | null
          domicilio_pais: string | null
          empresa_id: string
          fecha_inicio_operaciones: string | null
          id: string
          nombre_comercial: string | null
          obligaciones: Json | null
          persona_id: string
          razon_social: string | null
          regimen_fiscal_codigo: string | null
          regimen_fiscal_nombre: string | null
          regimenes_adicionales: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          csf_adjunto_id?: string | null
          csf_fecha_emision?: string | null
          domicilio_calle?: string | null
          domicilio_colonia?: string | null
          domicilio_cp?: string | null
          domicilio_estado?: string | null
          domicilio_municipio?: string | null
          domicilio_num_ext?: string | null
          domicilio_num_int?: string | null
          domicilio_pais?: string | null
          empresa_id: string
          fecha_inicio_operaciones?: string | null
          id?: string
          nombre_comercial?: string | null
          obligaciones?: Json | null
          persona_id: string
          razon_social?: string | null
          regimen_fiscal_codigo?: string | null
          regimen_fiscal_nombre?: string | null
          regimenes_adicionales?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          csf_adjunto_id?: string | null
          csf_fecha_emision?: string | null
          domicilio_calle?: string | null
          domicilio_colonia?: string | null
          domicilio_cp?: string | null
          domicilio_estado?: string | null
          domicilio_municipio?: string | null
          domicilio_num_ext?: string | null
          domicilio_num_int?: string | null
          domicilio_pais?: string | null
          empresa_id?: string
          fecha_inicio_operaciones?: string | null
          id?: string
          nombre_comercial?: string | null
          obligaciones?: Json | null
          persona_id?: string
          razon_social?: string | null
          regimen_fiscal_codigo?: string | null
          regimen_fiscal_nombre?: string | null
          regimenes_adicionales?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personas_datos_fiscales_csf_adjunto_id_fkey"
            columns: ["csf_adjunto_id"]
            isOneToOne: false
            referencedRelation: "adjuntos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_datos_fiscales_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: true
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_datos_fiscales_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: true
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      personas_direcciones: {
        Row: {
          activo: boolean
          calle: string | null
          colonia: string | null
          cp: string | null
          created_at: string
          empresa_id: string
          estado: string | null
          id: string
          municipio: string | null
          num_ext: string | null
          num_int: string | null
          pais: string
          persona_id: string
          principal: boolean
          referencia: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          calle?: string | null
          colonia?: string | null
          cp?: string | null
          created_at?: string
          empresa_id: string
          estado?: string | null
          id?: string
          municipio?: string | null
          num_ext?: string | null
          num_int?: string | null
          pais?: string
          persona_id: string
          principal?: boolean
          referencia?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          calle?: string | null
          colonia?: string | null
          cp?: string | null
          created_at?: string
          empresa_id?: string
          estado?: string | null
          id?: string
          municipio?: string | null
          num_ext?: string | null
          num_int?: string | null
          pais?: string
          persona_id?: string
          principal?: boolean
          referencia?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personas_direcciones_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_direcciones_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      producto_receta: {
        Row: {
          cantidad: number
          created_at: string
          empresa_id: string
          id: string
          insumo_id: string
          notas: string | null
          producto_venta_id: string
          unidad: string
          updated_at: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          empresa_id: string
          id?: string
          insumo_id: string
          notas?: string | null
          producto_venta_id: string
          unidad: string
          updated_at?: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          empresa_id?: string
          id?: string
          insumo_id?: string
          notas?: string | null
          producto_venta_id?: string
          unidad?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_receta_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_receta_producto_venta_id_fkey"
            columns: ["producto_venta_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          categoria_id: string | null
          clasificacion:
            | Database["erp"]["Enums"]["clasificacion_producto"]
            | null
          codigo: string | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          factor_consumo: number
          id: string
          inventariable: boolean
          nombre: string
          parent_id: string | null
          tipo: string
          unidad: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          categoria_id?: string | null
          clasificacion?:
            | Database["erp"]["Enums"]["clasificacion_producto"]
            | null
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          factor_consumo?: number
          id?: string
          inventariable?: boolean
          nombre: string
          parent_id?: string | null
          tipo?: string
          unidad?: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          categoria_id?: string | null
          clasificacion?:
            | Database["erp"]["Enums"]["clasificacion_producto"]
            | null
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          factor_consumo?: number
          id?: string
          inventariable?: boolean
          nombre?: string
          parent_id?: string | null
          tipo?: string
          unidad?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      productos_precios: {
        Row: {
          costo: number | null
          created_at: string
          empresa_id: string
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          precio_venta: number | null
          producto_id: string
          vigente: boolean
        }
        Insert: {
          costo?: number | null
          created_at?: string
          empresa_id: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          precio_venta?: number | null
          producto_id: string
          vigente?: boolean
        }
        Update: {
          costo?: number | null
          created_at?: string
          empresa_id?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          precio_venta?: number | null
          producto_id?: string
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "productos_precios_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean
          categoria: string | null
          codigo: string | null
          condiciones_pago: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          id: string
          limite_credito: number | null
          persona_id: string
          tasa_iva: number | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          categoria?: string | null
          codigo?: string | null
          condiciones_pago?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          id?: string
          limite_credito?: number | null
          persona_id: string
          tasa_iva?: number | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          categoria?: string | null
          codigo?: string | null
          condiciones_pago?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          limite_credito?: number | null
          persona_id?: string
          tasa_iva?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proveedores_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      proyectos: {
        Row: {
          codigo: string | null
          created_at: string
          descripcion: string | null
          empresa_id: string
          estado_id: string | null
          id: string
          nombre: string
          presupuesto: number | null
          tipo: string | null
          ubicacion: string | null
          updated_at: string | null
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          descripcion?: string | null
          empresa_id: string
          estado_id?: string | null
          id?: string
          nombre: string
          presupuesto?: number | null
          tipo?: string | null
          ubicacion?: string | null
          updated_at?: string | null
        }
        Update: {
          codigo?: string | null
          created_at?: string
          descripcion?: string | null
          empresa_id?: string
          estado_id?: string | null
          id?: string
          nombre?: string
          presupuesto?: number | null
          tipo?: string | null
          ubicacion?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      puestos: {
        Row: {
          activo: boolean
          created_at: string
          deleted_at: string | null
          departamento_id: string | null
          empresa_id: string
          esquema_pago: string | null
          id: string
          nivel: string | null
          nombre: string
          objetivo: string | null
          perfil: string | null
          reporta_a: string | null
          requisitos: string | null
          sueldo_max: number | null
          sueldo_min: number | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          deleted_at?: string | null
          departamento_id?: string | null
          empresa_id: string
          esquema_pago?: string | null
          id?: string
          nivel?: string | null
          nombre: string
          objetivo?: string | null
          perfil?: string | null
          reporta_a?: string | null
          requisitos?: string | null
          sueldo_max?: number | null
          sueldo_min?: number | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          deleted_at?: string | null
          departamento_id?: string | null
          empresa_id?: string
          esquema_pago?: string | null
          id?: string
          nivel?: string | null
          nombre?: string
          objetivo?: string | null
          perfil?: string | null
          reporta_a?: string | null
          requisitos?: string | null
          sueldo_max?: number | null
          sueldo_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "puestos_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "puestos_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["departamento_id"]
          },
          {
            foreignKeyName: "puestos_reporta_a_fkey"
            columns: ["reporta_a"]
            isOneToOne: false
            referencedRelation: "puestos"
            referencedColumns: ["id"]
          },
        ]
      }
      recepciones: {
        Row: {
          codigo: string | null
          created_at: string
          empresa_id: string
          estado_id: string | null
          fecha_recepcion: string
          id: string
          notas: string | null
          orden_compra_id: string | null
          recibe_id: string | null
          updated_at: string | null
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          empresa_id: string
          estado_id?: string | null
          fecha_recepcion?: string
          id?: string
          notas?: string | null
          orden_compra_id?: string | null
          recibe_id?: string | null
          updated_at?: string | null
        }
        Update: {
          codigo?: string | null
          created_at?: string
          empresa_id?: string
          estado_id?: string | null
          fecha_recepcion?: string
          id?: string
          notas?: string | null
          orden_compra_id?: string | null
          recibe_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recepciones_orden_compra_id_fkey"
            columns: ["orden_compra_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepciones_recibe_id_fkey"
            columns: ["recibe_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepciones_recibe_id_fkey"
            columns: ["recibe_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      recepciones_detalle: {
        Row: {
          cantidad_esperada: number | null
          cantidad_rechazada: number
          cantidad_recibida: number
          created_at: string
          empresa_id: string
          id: string
          notas: string | null
          oc_detalle_id: string | null
          producto_id: string | null
          recepcion_id: string
        }
        Insert: {
          cantidad_esperada?: number | null
          cantidad_rechazada?: number
          cantidad_recibida?: number
          created_at?: string
          empresa_id: string
          id?: string
          notas?: string | null
          oc_detalle_id?: string | null
          producto_id?: string | null
          recepcion_id: string
        }
        Update: {
          cantidad_esperada?: number | null
          cantidad_rechazada?: number
          cantidad_recibida?: number
          created_at?: string
          empresa_id?: string
          id?: string
          notas?: string | null
          oc_detalle_id?: string | null
          producto_id?: string | null
          recepcion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recepciones_detalle_oc_detalle_id_fkey"
            columns: ["oc_detalle_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra_detalle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepciones_detalle_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepciones_detalle_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "recepciones"
            referencedColumns: ["id"]
          },
        ]
      }
      requisiciones: {
        Row: {
          autorizada_at: string | null
          codigo: string | null
          created_at: string
          deleted_at: string | null
          departamento_id: string | null
          empresa_id: string
          estado_id: string | null
          fecha_requerida: string | null
          id: string
          justificacion: string | null
          prioridad_id: string | null
          solicitante_id: string | null
          subtipo: string | null
          updated_at: string | null
        }
        Insert: {
          autorizada_at?: string | null
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          departamento_id?: string | null
          empresa_id: string
          estado_id?: string | null
          fecha_requerida?: string | null
          id?: string
          justificacion?: string | null
          prioridad_id?: string | null
          solicitante_id?: string | null
          subtipo?: string | null
          updated_at?: string | null
        }
        Update: {
          autorizada_at?: string | null
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          departamento_id?: string | null
          empresa_id?: string
          estado_id?: string | null
          fecha_requerida?: string | null
          id?: string
          justificacion?: string | null
          prioridad_id?: string | null
          solicitante_id?: string | null
          subtipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requisiciones_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisiciones_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["departamento_id"]
          },
        ]
      }
      requisiciones_detalle: {
        Row: {
          cantidad: number
          created_at: string
          descripcion: string | null
          empresa_id: string
          id: string
          notas: string | null
          precio_estimado: number | null
          producto_id: string | null
          requisicion_id: string
          unidad: string | null
        }
        Insert: {
          cantidad?: number
          created_at?: string
          descripcion?: string | null
          empresa_id: string
          id?: string
          notas?: string | null
          precio_estimado?: number | null
          producto_id?: string | null
          requisicion_id: string
          unidad?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string
          descripcion?: string | null
          empresa_id?: string
          id?: string
          notas?: string | null
          precio_estimado?: number | null
          producto_id?: string | null
          requisicion_id?: string
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requisiciones_detalle_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisiciones_detalle_requisicion_id_fkey"
            columns: ["requisicion_id"]
            isOneToOne: false
            referencedRelation: "requisiciones"
            referencedColumns: ["id"]
          },
        ]
      }
      taller_servicio: {
        Row: {
          cliente_id: string | null
          created_at: string
          descripcion: string | null
          empresa_id: string
          estado_id: string | null
          fecha_entrada: string
          fecha_entrega: string | null
          id: string
          tecnico_id: string | null
          tipo: string | null
          total: number | null
          updated_at: string | null
          vehiculo_id: string | null
          vin_externo: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          descripcion?: string | null
          empresa_id: string
          estado_id?: string | null
          fecha_entrada?: string
          fecha_entrega?: string | null
          id?: string
          tecnico_id?: string | null
          tipo?: string | null
          total?: number | null
          updated_at?: string | null
          vehiculo_id?: string | null
          vin_externo?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          descripcion?: string | null
          empresa_id?: string
          estado_id?: string | null
          fecha_entrada?: string
          fecha_entrega?: string | null
          id?: string
          tecnico_id?: string | null
          tipo?: string | null
          total?: number | null
          updated_at?: string | null
          vehiculo_id?: string | null
          vin_externo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "taller_servicio_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_servicio_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taller_servicio_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
          {
            foreignKeyName: "taller_servicio_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      task_updates: {
        Row: {
          contenido: string | null
          creado_por: string | null
          created_at: string
          empresa_id: string
          id: string
          junta_id: string | null
          task_id: string
          tipo: string
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          contenido?: string | null
          creado_por?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          junta_id?: string | null
          task_id: string
          tipo: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          contenido?: string | null
          creado_por?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          junta_id?: string | null
          task_id?: string
          tipo?: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_updates_junta_id_fkey"
            columns: ["junta_id"]
            isOneToOne: false
            referencedRelation: "juntas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_updates_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          asignado_a: string | null
          asignado_por: string | null
          cierre_aprobado_en: string | null
          cierre_aprobado_por: string | null
          cierre_rechazado_en: string | null
          cierre_rechazado_motivo: string | null
          cierre_rechazado_por: string | null
          cierre_solicitado_en: string | null
          cierre_solicitado_por: string | null
          completado_por: string | null
          creado_por: string | null
          created_at: string
          departamento_nombre: string | null
          descripcion: string | null
          empresa_id: string
          entidad_id: string | null
          entidad_tipo: string | null
          estado: string
          fecha_completado: string | null
          fecha_compromiso: string | null
          fecha_vence: string | null
          id: string
          iniciativa: string | null
          motivo_bloqueo: string | null
          porcentaje_avance: number | null
          prioridad: string | null
          prioridad_id: string | null
          siguiente_accion: string | null
          tipo: string | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          asignado_a?: string | null
          asignado_por?: string | null
          cierre_aprobado_en?: string | null
          cierre_aprobado_por?: string | null
          cierre_rechazado_en?: string | null
          cierre_rechazado_motivo?: string | null
          cierre_rechazado_por?: string | null
          cierre_solicitado_en?: string | null
          cierre_solicitado_por?: string | null
          completado_por?: string | null
          creado_por?: string | null
          created_at?: string
          departamento_nombre?: string | null
          descripcion?: string | null
          empresa_id: string
          entidad_id?: string | null
          entidad_tipo?: string | null
          estado?: string
          fecha_completado?: string | null
          fecha_compromiso?: string | null
          fecha_vence?: string | null
          id?: string
          iniciativa?: string | null
          motivo_bloqueo?: string | null
          porcentaje_avance?: number | null
          prioridad?: string | null
          prioridad_id?: string | null
          siguiente_accion?: string | null
          tipo?: string | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          asignado_a?: string | null
          asignado_por?: string | null
          cierre_aprobado_en?: string | null
          cierre_aprobado_por?: string | null
          cierre_rechazado_en?: string | null
          cierre_rechazado_motivo?: string | null
          cierre_rechazado_por?: string | null
          cierre_solicitado_en?: string | null
          cierre_solicitado_por?: string | null
          completado_por?: string | null
          creado_por?: string | null
          created_at?: string
          departamento_nombre?: string | null
          descripcion?: string | null
          empresa_id?: string
          entidad_id?: string | null
          entidad_tipo?: string | null
          estado?: string
          fecha_completado?: string | null
          fecha_compromiso?: string | null
          fecha_vence?: string | null
          id?: string
          iniciativa?: string | null
          motivo_bloqueo?: string | null
          porcentaje_avance?: number | null
          prioridad?: string | null
          prioridad_id?: string | null
          siguiente_accion?: string | null
          tipo?: string | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_asignado_a_fkey"
            columns: ["asignado_a"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_asignado_a_fkey"
            columns: ["asignado_a"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
          {
            foreignKeyName: "tasks_asignado_por_fkey"
            columns: ["asignado_por"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_asignado_por_fkey"
            columns: ["asignado_por"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
          {
            foreignKeyName: "tasks_cierre_aprobado_por_fkey"
            columns: ["cierre_aprobado_por"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_cierre_aprobado_por_fkey"
            columns: ["cierre_aprobado_por"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
          {
            foreignKeyName: "tasks_cierre_rechazado_por_fkey"
            columns: ["cierre_rechazado_por"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_cierre_rechazado_por_fkey"
            columns: ["cierre_rechazado_por"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
          {
            foreignKeyName: "tasks_cierre_solicitado_por_fkey"
            columns: ["cierre_solicitado_por"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_cierre_solicitado_por_fkey"
            columns: ["cierre_solicitado_por"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
          {
            foreignKeyName: "tasks_completado_por_fkey"
            columns: ["completado_por"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_completado_por_fkey"
            columns: ["completado_por"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      turnos: {
        Row: {
          activo: boolean
          created_at: string
          empresa_id: string
          hora_fin: string | null
          hora_inicio: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_id: string
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_id?: string
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      vehiculos: {
        Row: {
          anio: number | null
          color: string | null
          created_at: string
          empresa_id: string
          estado: string
          id: string
          marca: string
          modelo: string
          precio_lista: number | null
          updated_at: string | null
          vin: string | null
        }
        Insert: {
          anio?: number | null
          color?: string | null
          created_at?: string
          empresa_id: string
          estado?: string
          id?: string
          marca: string
          modelo: string
          precio_lista?: number | null
          updated_at?: string | null
          vin?: string | null
        }
        Update: {
          anio?: number | null
          color?: string | null
          created_at?: string
          empresa_id?: string
          estado?: string
          id?: string
          marca?: string
          modelo?: string
          precio_lista?: number | null
          updated_at?: string | null
          vin?: string | null
        }
        Relationships: []
      }
      ventas_autos: {
        Row: {
          cliente_id: string | null
          comision: number | null
          created_at: string
          empresa_id: string
          estado_id: string | null
          fecha_venta: string
          id: string
          precio_venta: number
          tipo: string
          updated_at: string | null
          vehiculo_id: string
          vendedor_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          comision?: number | null
          created_at?: string
          empresa_id: string
          estado_id?: string | null
          fecha_venta?: string
          id?: string
          precio_venta: number
          tipo?: string
          updated_at?: string | null
          vehiculo_id: string
          vendedor_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          comision?: number | null
          created_at?: string
          empresa_id?: string
          estado_id?: string | null
          fecha_venta?: string
          id?: string
          precio_venta?: number
          tipo?: string
          updated_at?: string | null
          vehiculo_id?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_autos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_autos_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_autos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_autos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      ventas_inmobiliarias: {
        Row: {
          cliente_id: string | null
          codigo: string | null
          created_at: string
          empresa_id: string
          enganche: number | null
          estado_id: string | null
          fecha_venta: string
          id: string
          lote_id: string
          plazo_meses: number | null
          precio_venta: number
          updated_at: string | null
          vendedor_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          codigo?: string | null
          created_at?: string
          empresa_id: string
          enganche?: number | null
          estado_id?: string | null
          fecha_venta?: string
          id?: string
          lote_id: string
          plazo_meses?: number | null
          precio_venta: number
          updated_at?: string | null
          vendedor_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          codigo?: string | null
          created_at?: string
          empresa_id?: string
          enganche?: number | null
          estado_id?: string | null
          fecha_venta?: string
          id?: string
          lote_id?: string
          plazo_meses?: number | null
          precio_venta?: number
          updated_at?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_inmobiliarias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_inmobiliarias_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_inmobiliarias_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_inmobiliarias_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
      ventas_refacciones_detalle: {
        Row: {
          cantidad: number
          created_at: string
          descripcion: string | null
          descuento: number | null
          empresa_id: string
          id: string
          precio_unitario: number | null
          producto_id: string | null
          ticket_id: string
          total: number | null
        }
        Insert: {
          cantidad?: number
          created_at?: string
          descripcion?: string | null
          descuento?: number | null
          empresa_id: string
          id?: string
          precio_unitario?: number | null
          producto_id?: string | null
          ticket_id: string
          total?: number | null
        }
        Update: {
          cantidad?: number
          created_at?: string
          descripcion?: string | null
          descuento?: number | null
          empresa_id?: string
          id?: string
          precio_unitario?: number | null
          producto_id?: string | null
          ticket_id?: string
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_refacciones_detalle_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_refacciones_detalle_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ventas_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_tickets: {
        Row: {
          cliente_id: string | null
          codigo: string | null
          created_at: string
          empresa_id: string
          estado_id: string | null
          fecha: string
          id: string
          total: number
          updated_at: string | null
          vendedor_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          codigo?: string | null
          created_at?: string
          empresa_id: string
          estado_id?: string | null
          fecha?: string
          id?: string
          total?: number
          updated_at?: string | null
          vendedor_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          codigo?: string | null
          created_at?: string
          empresa_id?: string
          estado_id?: string | null
          fecha?: string
          id?: string
          total?: number
          updated_at?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_tickets_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_tickets_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_tickets_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
          },
        ]
      }
    }
    Views: {
      v_empleados_full: {
        Row: {
          antiguedad_anios: number | null
          apellido_materno: string | null
          apellido_paterno: string | null
          bonificaciones_mensuales: number | null
          comisiones_mensuales: number | null
          compensaciones_mensuales: number | null
          curp: string | null
          departamento: string | null
          departamento_id: string | null
          edad: number | null
          email_empresa: string | null
          email_personal: string | null
          empleado_activo: boolean | null
          empleado_id: string | null
          empresa_id: string | null
          fecha_baja: string | null
          fecha_ingreso: string | null
          fecha_nacimiento: string | null
          frecuencia_pago: string | null
          motivo_baja: string | null
          nombre: string | null
          nombre_completo: string | null
          nss: string | null
          numero_empleado: string | null
          persona_id: string | null
          puesto: string | null
          puesto_id: string | null
          puestos: Json | null
          rfc: string | null
          sdi: number | null
          sueldo_diario: number | null
          sueldo_mensual: number | null
          telefono: string | null
          tipo_contrato: string | null
          total_percepciones_mensuales: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      fn_aplicar_levantamiento: {
        Args: { p_levantamiento_id: string }
        Returns: number
      }
      fn_cancelar_levantamiento: {
        Args: { p_levantamiento_id: string; p_motivo: string }
        Returns: undefined
      }
      fn_cerrar_captura_levantamiento: {
        Args: { p_levantamiento_id: string }
        Returns: undefined
      }
      fn_firmar_levantamiento: {
        Args: {
          p_comentario?: string
          p_ip?: unknown
          p_levantamiento_id: string
          p_paso: number
          p_rol: string
          p_user_agent?: string
        }
        Returns: Json
      }
      fn_get_empresa_tolerancia: {
        Args: { p_empresa_id: string }
        Returns: {
          firmas_requeridas: number
          tolerancia_monto: number
          tolerancia_pct: number
        }[]
      }
      fn_get_lineas_para_capturar: {
        Args: { p_levantamiento_id: string }
        Returns: {
          cantidad_contada: number
          categoria: string
          contado_at: string
          linea_id: string
          producto_codigo: string
          producto_id: string
          producto_nombre: string
          recontada: boolean
          unidad: string
        }[]
      }
      fn_get_lineas_para_revisar: {
        Args: { p_levantamiento_id: string }
        Returns: {
          cantidad_contada: number
          categoria: string
          contado_at: string
          costo_unitario: number
          diferencia: number
          diferencia_valor: number
          fuera_de_tolerancia: boolean
          linea_id: string
          notas_diferencia: string
          producto_codigo: string
          producto_id: string
          producto_nombre: string
          salidas_durante_captura: number
          stock_efectivo: number
          stock_inicial: number
          unidad: string
        }[]
      }
      fn_guardar_conteo: {
        Args: {
          p_cantidad: number
          p_levantamiento_id: string
          p_producto_id: string
        }
        Returns: undefined
      }
      fn_iniciar_captura_levantamiento: {
        Args: { p_levantamiento_id: string }
        Returns: number
      }
      fn_oc_audit: {
        Args: {
          p_accion: string
          p_datos_anteriores: Json
          p_datos_nuevos: Json
          p_empresa_id: string
          p_registro_id: string
          p_tabla: string
        }
        Returns: undefined
      }
      fn_oc_recalcular_estado: {
        Args: { p_orden_id: string }
        Returns: undefined
      }
      oc_cancelar_pendiente_linea: {
        Args: { p_detalle_id: string; p_motivo?: string }
        Returns: Json
      }
      oc_cerrar_orden: {
        Args: { p_motivo?: string; p_orden_id: string }
        Returns: Json
      }
      oc_recibir_linea: {
        Args: {
          p_cantidad_recibida_total: number
          p_costo_unitario?: number
          p_detalle_id: string
        }
        Returns: Json
      }
      search_documentos_by_embedding: {
        Args: {
          p_empresa_ids: string[]
          query_embedding: string
          top_k?: number
        }
        Returns: {
          id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      clasificacion_producto:
        | "inventariable"
        | "consumible"
        | "merchandising"
        | "activo_fijo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  health: {
    Tables: {
      health_ecg: {
        Row: {
          classification: string | null
          date: string
          heart_rate: number | null
          id: number
          ingested_at: string | null
          raw_json: Json | null
        }
        Insert: {
          classification?: string | null
          date: string
          heart_rate?: number | null
          id?: number
          ingested_at?: string | null
          raw_json?: Json | null
        }
        Update: {
          classification?: string | null
          date?: string
          heart_rate?: number | null
          id?: number
          ingested_at?: string | null
          raw_json?: Json | null
        }
        Relationships: []
      }
      health_ingest_log: {
        Row: {
          id: number
          metrics_by_name: Json
          metrics_count: number | null
          payload_size_bytes: number | null
          received_at: string | null
          source_ip: string | null
          status: string | null
          workouts_count: number | null
        }
        Insert: {
          id?: number
          metrics_by_name?: Json
          metrics_count?: number | null
          payload_size_bytes?: number | null
          received_at?: string | null
          source_ip?: string | null
          status?: string | null
          workouts_count?: number | null
        }
        Update: {
          id?: number
          metrics_by_name?: Json
          metrics_count?: number | null
          payload_size_bytes?: number | null
          received_at?: string | null
          source_ip?: string | null
          status?: string | null
          workouts_count?: number | null
        }
        Relationships: []
      }
      health_medications: {
        Row: {
          date: string
          dose: string | null
          id: number
          ingested_at: string | null
          name: string | null
          raw_json: Json | null
        }
        Insert: {
          date: string
          dose?: string | null
          id?: number
          ingested_at?: string | null
          name?: string | null
          raw_json?: Json | null
        }
        Update: {
          date?: string
          dose?: string | null
          id?: number
          ingested_at?: string | null
          name?: string | null
          raw_json?: Json | null
        }
        Relationships: []
      }
      health_metrics: {
        Row: {
          date: string
          id: number
          ingested_at: string | null
          metric_name: string
          source: string | null
          unit: string | null
          value: number
        }
        Insert: {
          date: string
          id?: number
          ingested_at?: string | null
          metric_name: string
          source?: string | null
          unit?: string | null
          value: number
        }
        Update: {
          date?: string
          id?: number
          ingested_at?: string | null
          metric_name?: string
          source?: string | null
          unit?: string | null
          value?: number
        }
        Relationships: []
      }
      health_workouts: {
        Row: {
          distance_km: number | null
          duration_minutes: number | null
          end_time: string | null
          energy_kcal: number | null
          heart_rate_avg: number | null
          heart_rate_max: number | null
          id: number
          ingested_at: string | null
          name: string
          raw_json: Json | null
          source: string | null
          start_time: string
        }
        Insert: {
          distance_km?: number | null
          duration_minutes?: number | null
          end_time?: string | null
          energy_kcal?: number | null
          heart_rate_avg?: number | null
          heart_rate_max?: number | null
          id?: number
          ingested_at?: string | null
          name: string
          raw_json?: Json | null
          source?: string | null
          start_time: string
        }
        Update: {
          distance_km?: number | null
          duration_minutes?: number | null
          end_time?: string | null
          energy_kcal?: number | null
          heart_rate_avg?: number | null
          heart_rate_max?: number | null
          id?: number
          ingested_at?: string | null
          name?: string
          raw_json?: Json | null
          source?: string | null
          start_time?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  maquinaria: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  playtomic: {
    Tables: {
      booking_participants: {
        Row: {
          booking_id: string
          created_at: string
          family_member_id: string | null
          id: string
          is_owner: boolean
          player_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          family_member_id?: string | null
          id?: string
          is_owner?: boolean
          player_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          family_member_id?: string | null
          id?: string
          is_owner?: boolean
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_participants_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_participants_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_payment_coverage"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_participants_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_total_coverage"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_participants_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["playtomic_id"]
          },
          {
            foreignKeyName: "booking_participants_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_top_players"
            referencedColumns: ["playtomic_id"]
          },
        ]
      }
      bookings: {
        Row: {
          activity_id: string | null
          activity_name: string | null
          booking_end: string | null
          booking_id: string
          booking_start: string | null
          booking_type: string | null
          coach_ids: string[] | null
          course_id: string | null
          course_name: string | null
          created_at: string
          duration_min: number | null
          id: string
          is_canceled: boolean
          object_id: string | null
          origin: string | null
          owner_id: string | null
          payment_status: string | null
          price_amount: number | null
          price_currency: string | null
          raw_json: Json | null
          resource_id: string | null
          resource_name: string | null
          sport_id: string | null
          status: string | null
          synced_at: string
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          activity_name?: string | null
          booking_end?: string | null
          booking_id: string
          booking_start?: string | null
          booking_type?: string | null
          coach_ids?: string[] | null
          course_id?: string | null
          course_name?: string | null
          created_at?: string
          duration_min?: number | null
          id?: string
          is_canceled?: boolean
          object_id?: string | null
          origin?: string | null
          owner_id?: string | null
          payment_status?: string | null
          price_amount?: number | null
          price_currency?: string | null
          raw_json?: Json | null
          resource_id?: string | null
          resource_name?: string | null
          sport_id?: string | null
          status?: string | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          activity_name?: string | null
          booking_end?: string | null
          booking_id?: string
          booking_start?: string | null
          booking_type?: string | null
          coach_ids?: string[] | null
          course_id?: string | null
          course_name?: string | null
          created_at?: string
          duration_min?: number | null
          id?: string
          is_canceled?: boolean
          object_id?: string | null
          origin?: string | null
          owner_id?: string | null
          payment_status?: string | null
          price_amount?: number | null
          price_currency?: string | null
          raw_json?: Json | null
          resource_id?: string | null
          resource_name?: string | null
          sport_id?: string | null
          status?: string | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_assignments: {
        Row: {
          assigned_amount: number
          assigned_at: string
          assigned_by: string
          booking_id: string
          id: string
          note: string | null
          waitry_order_id: string
        }
        Insert: {
          assigned_amount: number
          assigned_at?: string
          assigned_by: string
          booking_id: string
          id?: string
          note?: string | null
          waitry_order_id: string
        }
        Update: {
          assigned_amount?: number
          assigned_at?: string
          assigned_by?: string
          booking_id?: string
          id?: string
          note?: string | null
          waitry_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payment_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_payment_coverage"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payment_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_total_coverage"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      payments_import: {
        Row: {
          b2b_fee_rate: number | null
          b2b_fee_subtotal: number | null
          b2b_fee_tax_rate: number | null
          b2b_fee_taxes: number | null
          b2b_fee_total: number | null
          campaign_id: string | null
          campaign_name: string | null
          club_payment_id: string | null
          corporate_name: string | null
          currency: string | null
          invoice_date: string | null
          invoice_id: string | null
          invoice_number: string | null
          invoice_payer: string | null
          net_amount_transferred: number | null
          non_applicable_subtotal: number | null
          non_applicable_taxes: number | null
          non_applicable_total: number | null
          origin: string | null
          payment_date: string | null
          payment_id: string
          payment_method: string | null
          payment_status: string | null
          payment_type: string | null
          payout_code: string | null
          product_sku: string | null
          refund_id: string | null
          service_date: string | null
          source_filename: string | null
          sport: string | null
          store_product_name: string | null
          store_product_quantity: number | null
          subtotal: number | null
          tax_rate: number | null
          taxes: number | null
          total: number | null
          uploaded_at: string
          uploaded_by: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          b2b_fee_rate?: number | null
          b2b_fee_subtotal?: number | null
          b2b_fee_tax_rate?: number | null
          b2b_fee_taxes?: number | null
          b2b_fee_total?: number | null
          campaign_id?: string | null
          campaign_name?: string | null
          club_payment_id?: string | null
          corporate_name?: string | null
          currency?: string | null
          invoice_date?: string | null
          invoice_id?: string | null
          invoice_number?: string | null
          invoice_payer?: string | null
          net_amount_transferred?: number | null
          non_applicable_subtotal?: number | null
          non_applicable_taxes?: number | null
          non_applicable_total?: number | null
          origin?: string | null
          payment_date?: string | null
          payment_id: string
          payment_method?: string | null
          payment_status?: string | null
          payment_type?: string | null
          payout_code?: string | null
          product_sku?: string | null
          refund_id?: string | null
          service_date?: string | null
          source_filename?: string | null
          sport?: string | null
          store_product_name?: string | null
          store_product_quantity?: number | null
          subtotal?: number | null
          tax_rate?: number | null
          taxes?: number | null
          total?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          b2b_fee_rate?: number | null
          b2b_fee_subtotal?: number | null
          b2b_fee_tax_rate?: number | null
          b2b_fee_taxes?: number | null
          b2b_fee_total?: number | null
          campaign_id?: string | null
          campaign_name?: string | null
          club_payment_id?: string | null
          corporate_name?: string | null
          currency?: string | null
          invoice_date?: string | null
          invoice_id?: string | null
          invoice_number?: string | null
          invoice_payer?: string | null
          net_amount_transferred?: number | null
          non_applicable_subtotal?: number | null
          non_applicable_taxes?: number | null
          non_applicable_total?: number | null
          origin?: string | null
          payment_date?: string | null
          payment_id?: string
          payment_method?: string | null
          payment_status?: string | null
          payment_type?: string | null
          payout_code?: string | null
          product_sku?: string | null
          refund_id?: string | null
          service_date?: string | null
          source_filename?: string | null
          sport?: string | null
          store_product_name?: string | null
          store_product_quantity?: number | null
          subtotal?: number | null
          tax_rate?: number | null
          taxes?: number | null
          total?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      players: {
        Row: {
          accepts_commercial: boolean | null
          created_at: string
          email: string | null
          favorite_sport: string | null
          first_seen_at: string | null
          id: string
          last_seen_at: string | null
          name: string | null
          player_type: string | null
          playtomic_id: string
          total_bookings: number
          total_spend: number
          updated_at: string
        }
        Insert: {
          accepts_commercial?: boolean | null
          created_at?: string
          email?: string | null
          favorite_sport?: string | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          name?: string | null
          player_type?: string | null
          playtomic_id: string
          total_bookings?: number
          total_spend?: number
          updated_at?: string
        }
        Update: {
          accepts_commercial?: boolean | null
          created_at?: string
          email?: string | null
          favorite_sport?: string | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          name?: string | null
          player_type?: string | null
          playtomic_id?: string
          total_bookings?: number
          total_spend?: number
          updated_at?: string
        }
        Relationships: []
      }
      resources: {
        Row: {
          active: boolean
          first_seen_at: string | null
          id: string
          last_seen_at: string | null
          resource_id: string
          resource_name: string | null
          sport_id: string | null
        }
        Insert: {
          active?: boolean
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          resource_id: string
          resource_name?: string | null
          sport_id?: string | null
        }
        Update: {
          active?: boolean
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          resource_id?: string
          resource_name?: string | null
          sport_id?: string | null
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          bookings_fetched: number | null
          bookings_upserted: number | null
          date_range_end: string | null
          date_range_start: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          players_upserted: number | null
          started_at: string | null
          status: string
          sync_type: string
        }
        Insert: {
          bookings_fetched?: number | null
          bookings_upserted?: number | null
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          players_upserted?: number | null
          started_at?: string | null
          status: string
          sync_type: string
        }
        Update: {
          bookings_fetched?: number | null
          bookings_upserted?: number | null
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          players_upserted?: number | null
          started_at?: string | null
          status?: string
          sync_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_bookings_payment_coverage: {
        Row: {
          assigned_total: number | null
          assigned_waitry_orders: string[] | null
          booking_id: string | null
          booking_total: number | null
          coverage_pct: number | null
          coverage_status: string | null
        }
        Relationships: []
      }
      v_bookings_total_coverage: {
        Row: {
          booking_id: string | null
          booking_total: number | null
          combined_total: number | null
          coverage_pct: number | null
          coverage_status: string | null
          csv_payment_ids: string[] | null
          csv_payments_count: number | null
          csv_total: number | null
          effective_pct: number | null
          effective_status: string | null
          effective_total: number | null
          has_unverified_manager: boolean | null
          manager_csv_payment_ids: string[] | null
          manager_csv_total: number | null
          online_csv_payment_ids: string[] | null
          online_csv_total: number | null
          other_csv_total: number | null
          waitry_order_ids: string[] | null
          waitry_total: number | null
          wallet_coverage: number | null
          wallet_csv_payment_ids: string[] | null
          wallet_payments_count: number | null
        }
        Relationships: []
      }
      v_conciliacion_historial: {
        Row: {
          amount: number | null
          assigned_by: string | null
          booking_id: string | null
          booking_start: string | null
          booking_total: number | null
          event_at: string | null
          owner_id: string | null
          payment_method: string | null
          payment_origin: string | null
          reference_id: string | null
          resource_name: string | null
          row_id: string | null
          source: string | null
          subject: string | null
          waitry_notes: string | null
          waitry_order_total: number | null
          waitry_paid_at: string | null
        }
        Relationships: []
      }
      v_ocupacion_diaria: {
        Row: {
          fecha: string | null
          hora: number | null
          reservas: number | null
          resource_name: string | null
          revenue: number | null
        }
        Relationships: []
      }
      v_revenue_diario: {
        Row: {
          cancelaciones: number | null
          fecha: string | null
          reservas: number | null
          revenue: number | null
          sport_id: string | null
        }
        Relationships: []
      }
      v_top_players: {
        Row: {
          accepts_commercial: boolean | null
          created_at: string | null
          email: string | null
          favorite_sport: string | null
          first_seen_at: string | null
          gasto_estimado: number | null
          id: string | null
          last_seen_at: string | null
          name: string | null
          player_type: string | null
          playtomic_id: string | null
          reservas_periodo: number | null
          total_bookings: number | null
          total_spend: number | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      health_ecg: {
        Row: {
          classification: string | null
          date: string | null
          heart_rate: number | null
          id: number | null
          ingested_at: string | null
          raw_json: Json | null
        }
        Insert: {
          classification?: string | null
          date?: string | null
          heart_rate?: number | null
          id?: number | null
          ingested_at?: string | null
          raw_json?: Json | null
        }
        Update: {
          classification?: string | null
          date?: string | null
          heart_rate?: number | null
          id?: number | null
          ingested_at?: string | null
          raw_json?: Json | null
        }
        Relationships: []
      }
      health_ingest_log: {
        Row: {
          id: number | null
          metrics_by_name: Json | null
          metrics_count: number | null
          payload_size_bytes: number | null
          received_at: string | null
          source_ip: string | null
          status: string | null
          workouts_count: number | null
        }
        Insert: {
          id?: number | null
          metrics_by_name?: Json | null
          metrics_count?: number | null
          payload_size_bytes?: number | null
          received_at?: string | null
          source_ip?: string | null
          status?: string | null
          workouts_count?: number | null
        }
        Update: {
          id?: number | null
          metrics_by_name?: Json | null
          metrics_count?: number | null
          payload_size_bytes?: number | null
          received_at?: string | null
          source_ip?: string | null
          status?: string | null
          workouts_count?: number | null
        }
        Relationships: []
      }
      health_medications: {
        Row: {
          date: string | null
          dose: string | null
          id: number | null
          ingested_at: string | null
          name: string | null
          raw_json: Json | null
        }
        Insert: {
          date?: string | null
          dose?: string | null
          id?: number | null
          ingested_at?: string | null
          name?: string | null
          raw_json?: Json | null
        }
        Update: {
          date?: string | null
          dose?: string | null
          id?: number | null
          ingested_at?: string | null
          name?: string | null
          raw_json?: Json | null
        }
        Relationships: []
      }
      health_metrics: {
        Row: {
          date: string | null
          id: number | null
          ingested_at: string | null
          metric_name: string | null
          source: string | null
          unit: string | null
          value: number | null
        }
        Insert: {
          date?: string | null
          id?: number | null
          ingested_at?: string | null
          metric_name?: string | null
          source?: string | null
          unit?: string | null
          value?: number | null
        }
        Update: {
          date?: string | null
          id?: number | null
          ingested_at?: string | null
          metric_name?: string | null
          source?: string | null
          unit?: string | null
          value?: number | null
        }
        Relationships: []
      }
      health_workouts: {
        Row: {
          distance_km: number | null
          duration_minutes: number | null
          end_time: string | null
          energy_kcal: number | null
          heart_rate_avg: number | null
          heart_rate_max: number | null
          id: number | null
          ingested_at: string | null
          name: string | null
          raw_json: Json | null
          source: string | null
          start_time: string | null
        }
        Insert: {
          distance_km?: number | null
          duration_minutes?: number | null
          end_time?: string | null
          energy_kcal?: number | null
          heart_rate_avg?: number | null
          heart_rate_max?: number | null
          id?: number | null
          ingested_at?: string | null
          name?: string | null
          raw_json?: Json | null
          source?: string | null
          start_time?: string | null
        }
        Update: {
          distance_km?: number | null
          duration_minutes?: number | null
          end_time?: string | null
          energy_kcal?: number | null
          heart_rate_avg?: number | null
          heart_rate_max?: number | null
          id?: number | null
          ingested_at?: string | null
          name?: string | null
          raw_json?: Json | null
          source?: string | null
          start_time?: string | null
        }
        Relationships: []
      }
      profile: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string | null
          is_active: boolean | null
          last_name: string | null
          locale: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string | null
          is_active?: boolean | null
          last_name?: string | null
          locale?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string | null
          is_active?: boolean | null
          last_name?: string | null
          locale?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          current_module: string | null
          current_path: string | null
          display_name: string | null
          email: string | null
          last_seen_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          current_module?: string | null
          current_path?: string | null
          display_name?: string | null
          email?: string | null
          last_seen_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          current_module?: string | null
          current_path?: string | null
          display_name?: string | null
          email?: string | null
          last_seen_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_health_timeline_monthly: {
        Args: { p_from: string }
        Returns: {
          avg_value: number
          metric_name: string
          month_start: string
          sample_count: number
        }[]
      }
      get_latest_health_metrics: {
        Args: { p_names: string[] }
        Returns: {
          date: string
          id: number
          metric_name: string
          source: string
          unit: string
          value: number
        }[]
      }
      get_workout_cardiac_zones: {
        Args: {
          p_from: string
          p_max_hr?: number
          p_resting_hr?: number
          p_to: string
        }
        Returns: {
          avg_hr: number
          distance_km: number
          duration_minutes: number
          end_time: string
          energy_kcal: number
          max_hr_observed: number
          samples: number
          start_time: string
          workout_id: number
          workout_name: string
          z1_samples: number
          z2_samples: number
          z3_samples: number
          z4_samples: number
          z5_samples: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  rdb: {
    Tables: {
      corte_conteo_denominaciones_archive_2026_04_17: {
        Row: {
          cantidad: number
          corte_id: string
          created_at: string
          denominacion: number
          id: string
          subtotal: number | null
          tipo: string
          updated_at: string
        }
        Insert: {
          cantidad?: number
          corte_id: string
          created_at?: string
          denominacion: number
          id?: string
          subtotal?: number | null
          tipo: string
          updated_at?: string
        }
        Update: {
          cantidad?: number
          corte_id?: string
          created_at?: string
          denominacion?: number
          id?: string
          subtotal?: number | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      ordenes_compra_archive_2026_04_17: {
        Row: {
          created_at: string | null
          estatus: string
          fecha_emision: string | null
          fecha_recepcion: string | null
          folio: string
          id: string
          notas: string | null
          proveedor_id: string | null
          recibido_por: string | null
          requisicion_id: string | null
          total_estimado: number | null
          total_real: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          estatus?: string
          fecha_emision?: string | null
          fecha_recepcion?: string | null
          folio?: string
          id?: string
          notas?: string | null
          proveedor_id?: string | null
          recibido_por?: string | null
          requisicion_id?: string | null
          total_estimado?: number | null
          total_real?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          estatus?: string
          fecha_emision?: string | null
          fecha_recepcion?: string | null
          folio?: string
          id?: string
          notas?: string | null
          proveedor_id?: string | null
          recibido_por?: string | null
          requisicion_id?: string | null
          total_estimado?: number | null
          total_real?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores_archive_2026_04_17"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_requisicion_id_fkey"
            columns: ["requisicion_id"]
            isOneToOne: false
            referencedRelation: "requisiciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_requisicion_id_fkey"
            columns: ["requisicion_id"]
            isOneToOne: false
            referencedRelation: "requisiciones_archive_2026_04_17"
            referencedColumns: ["id"]
          },
        ]
      }
      productos_waitry_map: {
        Row: {
          created_at: string | null
          factor_salida: number | null
          id: string
          producto_id: string | null
          waitry_nombre: string
        }
        Insert: {
          created_at?: string | null
          factor_salida?: number | null
          id?: string
          producto_id?: string | null
          waitry_nombre: string
        }
        Update: {
          created_at?: string | null
          factor_salida?: number | null
          id?: string
          producto_id?: string | null
          waitry_nombre?: string
        }
        Relationships: []
      }
      proveedores_archive_2026_04_17: {
        Row: {
          activo: boolean
          contacto: string | null
          created_at: string | null
          direccion: string | null
          email: string | null
          id: string
          nombre: string
          notas: string | null
          rfc: string | null
          telefono: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          contacto?: string | null
          created_at?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          nombre: string
          notas?: string | null
          rfc?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          contacto?: string | null
          created_at?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          rfc?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      requisiciones_archive_2026_04_17: {
        Row: {
          aprobado_por: string | null
          created_at: string | null
          estatus: string
          fecha_necesidad: string | null
          fecha_solicitud: string | null
          folio: string
          id: string
          notas: string | null
          solicitado_por: string | null
          updated_at: string | null
        }
        Insert: {
          aprobado_por?: string | null
          created_at?: string | null
          estatus?: string
          fecha_necesidad?: string | null
          fecha_solicitud?: string | null
          folio?: string
          id?: string
          notas?: string | null
          solicitado_por?: string | null
          updated_at?: string | null
        }
        Update: {
          aprobado_por?: string | null
          created_at?: string | null
          estatus?: string
          fecha_necesidad?: string | null
          fecha_solicitud?: string | null
          folio?: string
          id?: string
          notas?: string | null
          solicitado_por?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      waitry_duplicate_candidates: {
        Row: {
          content_hash: string
          detected_at: string
          id: string
          match_reason: string | null
          order_id_a: string
          order_id_b: string
          resolution: string | null
          resolved: boolean
          similarity_score: number
        }
        Insert: {
          content_hash: string
          detected_at?: string
          id?: string
          match_reason?: string | null
          order_id_a: string
          order_id_b: string
          resolution?: string | null
          resolved?: boolean
          similarity_score: number
        }
        Update: {
          content_hash?: string
          detected_at?: string
          id?: string
          match_reason?: string | null
          order_id_a?: string
          order_id_b?: string
          resolution?: string | null
          resolved?: boolean
          similarity_score?: number
        }
        Relationships: []
      }
      waitry_inbound: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          event: string | null
          id: string
          order_id: string
          payload_hash: string
          payload_json: Json
          processed: boolean
          received_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          event?: string | null
          id?: string
          order_id: string
          payload_hash: string
          payload_json: Json
          processed?: boolean
          received_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          event?: string | null
          id?: string
          order_id?: string
          payload_hash?: string
          payload_json?: Json
          processed?: boolean
          received_at?: string
        }
        Relationships: []
      }
      waitry_pagos: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          id: string
          order_id: string
          payment_id: string | null
          payment_method: string | null
          tip: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          order_id: string
          payment_id?: string | null
          payment_method?: string | null
          tip?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          order_id?: string
          payment_id?: string | null
          payment_method?: string | null
          tip?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "waitry_pagos_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_pagos_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos_con_fantasmas"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_pagos_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos_reversa_sospechosa"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_pagos_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "waitry_pedidos"
            referencedColumns: ["order_id"]
          },
        ]
      }
      waitry_pedidos: {
        Row: {
          content_hash: string | null
          corte_id: string | null
          created_at: string
          external_delivery_id: string | null
          id: string
          last_action_at: string | null
          layout_name: string | null
          notes: string | null
          order_id: string
          paid: boolean | null
          place_id: string | null
          place_name: string | null
          service_charge: number | null
          status: string | null
          superseded_by_order_id: string | null
          table_id: number | null
          table_name: string | null
          tax: number | null
          timestamp: string | null
          total_amount: number | null
          total_discount: number | null
          updated_at: string
        }
        Insert: {
          content_hash?: string | null
          corte_id?: string | null
          created_at?: string
          external_delivery_id?: string | null
          id?: string
          last_action_at?: string | null
          layout_name?: string | null
          notes?: string | null
          order_id: string
          paid?: boolean | null
          place_id?: string | null
          place_name?: string | null
          service_charge?: number | null
          status?: string | null
          superseded_by_order_id?: string | null
          table_id?: number | null
          table_name?: string | null
          tax?: number | null
          timestamp?: string | null
          total_amount?: number | null
          total_discount?: number | null
          updated_at?: string
        }
        Update: {
          content_hash?: string | null
          corte_id?: string | null
          created_at?: string
          external_delivery_id?: string | null
          id?: string
          last_action_at?: string | null
          layout_name?: string | null
          notes?: string | null
          order_id?: string
          paid?: boolean | null
          place_id?: string | null
          place_name?: string | null
          service_charge?: number | null
          status?: string | null
          superseded_by_order_id?: string | null
          table_id?: number | null
          table_name?: string | null
          tax?: number | null
          timestamp?: string | null
          total_amount?: number | null
          total_discount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitry_pedidos_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_lista"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitry_pedidos_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_totales"
            referencedColumns: ["corte_id"]
          },
        ]
      }
      waitry_productos: {
        Row: {
          created_at: string
          id: string
          modifiers: Json | null
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number | null
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          modifiers?: Json | null
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          modifiers?: Json | null
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "waitry_productos_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_productos_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos_con_fantasmas"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_productos_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos_reversa_sospechosa"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_productos_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "waitry_pedidos"
            referencedColumns: ["order_id"]
          },
        ]
      }
    }
    Views: {
      corte_conteo_denominaciones: {
        Row: {
          cantidad: number | null
          corte_id: string | null
          created_at: string | null
          denominacion: number | null
          id: string | null
          subtotal: number | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          cantidad?: number | null
          corte_id?: string | null
          created_at?: string | null
          denominacion?: number | null
          id?: string | null
          subtotal?: number | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          cantidad?: number | null
          corte_id?: string | null
          created_at?: string | null
          denominacion?: number | null
          id?: string | null
          subtotal?: number | null
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ordenes_compra: {
        Row: {
          created_at: string | null
          estatus: string | null
          fecha_emision: string | null
          fecha_recepcion: string | null
          folio: string | null
          id: string | null
          notas: string | null
          proveedor_id: string | null
          recibido_por: string | null
          requisicion_id: string | null
          total_estimado: number | null
          total_real: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          estatus?: string | null
          fecha_emision?: string | null
          fecha_recepcion?: string | null
          folio?: string | null
          id?: string | null
          notas?: string | null
          proveedor_id?: string | null
          recibido_por?: string | null
          requisicion_id?: string | null
          total_estimado?: number | null
          total_real?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          estatus?: string | null
          fecha_emision?: string | null
          fecha_recepcion?: string | null
          folio?: string | null
          id?: string | null
          notas?: string | null
          proveedor_id?: string | null
          recibido_por?: string | null
          requisicion_id?: string | null
          total_estimado?: number | null
          total_real?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores_archive_2026_04_17"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_requisicion_id_fkey"
            columns: ["requisicion_id"]
            isOneToOne: false
            referencedRelation: "requisiciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_requisicion_id_fkey"
            columns: ["requisicion_id"]
            isOneToOne: false
            referencedRelation: "requisiciones_archive_2026_04_17"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean | null
          contacto: string | null
          created_at: string | null
          direccion: string | null
          email: string | null
          id: string | null
          nombre: string | null
          notas: string | null
          rfc: string | null
          telefono: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          contacto?: string | null
          created_at?: string | null
          direccion?: string | null
          email?: string | null
          id?: string | null
          nombre?: string | null
          notas?: string | null
          rfc?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          contacto?: string | null
          created_at?: string | null
          direccion?: string | null
          email?: string | null
          id?: string | null
          nombre?: string | null
          notas?: string | null
          rfc?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      requisiciones: {
        Row: {
          aprobado_por: string | null
          created_at: string | null
          estatus: string | null
          fecha_necesidad: string | null
          fecha_solicitud: string | null
          folio: string | null
          id: string | null
          notas: string | null
          solicitado_por: string | null
          updated_at: string | null
        }
        Insert: {
          aprobado_por?: string | null
          created_at?: string | null
          estatus?: string | null
          fecha_necesidad?: string | null
          fecha_solicitud?: string | null
          folio?: string | null
          id?: string | null
          notas?: string | null
          solicitado_por?: string | null
          updated_at?: string | null
        }
        Update: {
          aprobado_por?: string | null
          created_at?: string | null
          estatus?: string | null
          fecha_necesidad?: string | null
          fecha_solicitud?: string | null
          folio?: string | null
          id?: string | null
          notas?: string | null
          solicitado_por?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      v_categoria_resumen: {
        Row: {
          categoria: string | null
          categoria_id: string | null
          color: string | null
          importe_total_30d: number | null
          margen_promedio_pct: number | null
          orden: number | null
          productos_con_venta_30d: number | null
          total_productos: number | null
          utilidad_total_30d: number | null
          valor_stock_total: number | null
        }
        Relationships: []
      }
      v_corte_conteo_totales: {
        Row: {
          corte_id: string | null
          detalle: Json | null
          total_contado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "corte_conteo_denominaciones_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_lista"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corte_conteo_denominaciones_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_totales"
            referencedColumns: ["corte_id"]
          },
        ]
      }
      v_cortes_lista: {
        Row: {
          caja_id: string | null
          caja_nombre: string | null
          coda_id: string | null
          corte_nombre: string | null
          depositos: number | null
          efectivo_contado: number | null
          efectivo_esperado: number | null
          efectivo_inicial: number | null
          estado: string | null
          fecha_operativa: string | null
          hora_fin: string | null
          hora_inicio: string | null
          id: string | null
          ingresos_efectivo: number | null
          ingresos_stripe: number | null
          ingresos_tarjeta: number | null
          ingresos_transferencias: number | null
          observaciones: string | null
          pedidos_count: number | null
          responsable_apertura: string | null
          responsable_cierre: string | null
          retiros: number | null
          tipo: string | null
          total_ingresos: number | null
          turno: string | null
        }
        Relationships: []
      }
      v_cortes_productos: {
        Row: {
          cantidad_vendida: number | null
          corte_id: string | null
          importe_total: number | null
          product_id: string | null
          producto_nombre: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitry_pedidos_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_lista"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitry_pedidos_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_totales"
            referencedColumns: ["corte_id"]
          },
        ]
      }
      v_cortes_totales: {
        Row: {
          caja_nombre: string | null
          corte_id: string | null
          depositos: number | null
          efectivo_esperado: number | null
          efectivo_inicial: number | null
          empresa_id: string | null
          estado: string | null
          fecha_operativa: string | null
          hora_fin: string | null
          hora_inicio: string | null
          ingresos_efectivo: number | null
          ingresos_stripe: number | null
          ingresos_tarjeta: number | null
          ingresos_transferencias: number | null
          pedidos_count: number | null
          retiros: number | null
          total_ingresos: number | null
        }
        Relationships: []
      }
      v_inventario_stock: {
        Row: {
          bajo_minimo: boolean | null
          categoria: string | null
          clasificacion: string | null
          costo_unitario: number | null
          factor_consumo: number | null
          id: string | null
          inventariable: boolean | null
          nombre: string | null
          stock_actual: number | null
          stock_minimo: number | null
          total_entradas: number | null
          total_mermas: number | null
          total_vendido: number | null
          ultimo_costo: number | null
          unidad: string | null
          valor_inventario: number | null
        }
        Relationships: []
      }
      v_producto_metricas: {
        Row: {
          activo: boolean | null
          categoria_color: string | null
          categoria_id: string | null
          categoria_nombre: string | null
          codigo: string | null
          costo: number | null
          dias_sin_venta: number | null
          id: string | null
          importe_30d: number | null
          importe_90d: number | null
          inventariable: boolean | null
          margen_pct: number | null
          nombre: string | null
          precio_venta: number | null
          stock_actual: number | null
          ultima_venta_at: string | null
          unidades_30d: number | null
          unidades_90d: number | null
          utilidad_30d: number | null
          valor_stock: number | null
        }
        Relationships: []
      }
      v_producto_tendencia_semanal: {
        Row: {
          categoria_id: string | null
          importe: number | null
          nombre: string | null
          producto_id: string | null
          semana_inicio: string | null
          unidades: number | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "v_categoria_resumen"
            referencedColumns: ["categoria_id"]
          },
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "v_producto_metricas"
            referencedColumns: ["categoria_id"]
          },
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "v_productos_tabla"
            referencedColumns: ["categoria_id"]
          },
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_productos_categoria"
            referencedColumns: ["categoria_id"]
          },
        ]
      }
      v_producto_ultima_venta: {
        Row: {
          producto_id: string | null
          total_importe_vendido: number | null
          total_unidades_vendidas: number | null
          total_ventas: number | null
          ultima_venta_at: string | null
        }
        Relationships: []
      }
      v_productos_grupo: {
        Row: {
          categoria: string | null
          costo_unitario: number | null
          hijos: Json | null
          padre_id: string | null
          padre_nombre: string | null
          total_hijos: number | null
          unidad: string | null
        }
        Relationships: []
      }
      v_productos_tabla: {
        Row: {
          activo: boolean | null
          categoria_color: string | null
          categoria_id: string | null
          categoria_nombre: string | null
          codigo: string | null
          created_at: string | null
          descripcion: string | null
          id: string | null
          inventariable: boolean | null
          margen_pct: number | null
          nombre: string | null
          stock_actual: number | null
          tipo: string | null
          total_unidades_vendidas: number | null
          ultima_venta_at: string | null
          ultimo_costo: number | null
          ultimo_precio_venta: number | null
          unidad: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      v_waitry_pedidos: {
        Row: {
          content_hash: string | null
          corte_id: string | null
          created_at: string | null
          es_fantasma: boolean | null
          external_delivery_id: string | null
          id: string | null
          last_action_at: string | null
          layout_name: string | null
          notes: string | null
          order_id: string | null
          paid: boolean | null
          place_id: string | null
          place_name: string | null
          service_charge: number | null
          status: string | null
          superseded_by_order_id: string | null
          table_id: number | null
          table_name: string | null
          tax: number | null
          timestamp: string | null
          total_amount: number | null
          total_discount: number | null
          updated_at: string | null
        }
        Insert: {
          content_hash?: string | null
          corte_id?: string | null
          created_at?: string | null
          es_fantasma?: never
          external_delivery_id?: string | null
          id?: string | null
          last_action_at?: string | null
          layout_name?: string | null
          notes?: string | null
          order_id?: string | null
          paid?: boolean | null
          place_id?: string | null
          place_name?: string | null
          service_charge?: number | null
          status?: string | null
          superseded_by_order_id?: string | null
          table_id?: number | null
          table_name?: string | null
          tax?: number | null
          timestamp?: string | null
          total_amount?: number | null
          total_discount?: number | null
          updated_at?: string | null
        }
        Update: {
          content_hash?: string | null
          corte_id?: string | null
          created_at?: string | null
          es_fantasma?: never
          external_delivery_id?: string | null
          id?: string | null
          last_action_at?: string | null
          layout_name?: string | null
          notes?: string | null
          order_id?: string | null
          paid?: boolean | null
          place_id?: string | null
          place_name?: string | null
          service_charge?: number | null
          status?: string | null
          superseded_by_order_id?: string | null
          table_id?: number | null
          table_name?: string | null
          tax?: number | null
          timestamp?: string | null
          total_amount?: number | null
          total_discount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitry_pedidos_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_lista"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitry_pedidos_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_totales"
            referencedColumns: ["corte_id"]
          },
        ]
      }
      v_waitry_pedidos_con_fantasmas: {
        Row: {
          content_hash: string | null
          corte_id: string | null
          created_at: string | null
          es_fantasma: boolean | null
          external_delivery_id: string | null
          id: string | null
          last_action_at: string | null
          layout_name: string | null
          notes: string | null
          order_id: string | null
          paid: boolean | null
          place_id: string | null
          place_name: string | null
          service_charge: number | null
          status: string | null
          superseded_by_order_id: string | null
          table_id: number | null
          table_name: string | null
          tax: number | null
          timestamp: string | null
          total_amount: number | null
          total_discount: number | null
          updated_at: string | null
        }
        Insert: {
          content_hash?: string | null
          corte_id?: string | null
          created_at?: string | null
          es_fantasma?: never
          external_delivery_id?: string | null
          id?: string | null
          last_action_at?: string | null
          layout_name?: string | null
          notes?: string | null
          order_id?: string | null
          paid?: boolean | null
          place_id?: string | null
          place_name?: string | null
          service_charge?: number | null
          status?: string | null
          superseded_by_order_id?: string | null
          table_id?: number | null
          table_name?: string | null
          tax?: number | null
          timestamp?: string | null
          total_amount?: number | null
          total_discount?: number | null
          updated_at?: string | null
        }
        Update: {
          content_hash?: string | null
          corte_id?: string | null
          created_at?: string | null
          es_fantasma?: never
          external_delivery_id?: string | null
          id?: string | null
          last_action_at?: string | null
          layout_name?: string | null
          notes?: string | null
          order_id?: string | null
          paid?: boolean | null
          place_id?: string | null
          place_name?: string | null
          service_charge?: number | null
          status?: string | null
          superseded_by_order_id?: string | null
          table_id?: number | null
          table_name?: string | null
          tax?: number | null
          timestamp?: string | null
          total_amount?: number | null
          total_discount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitry_pedidos_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_lista"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitry_pedidos_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_totales"
            referencedColumns: ["corte_id"]
          },
        ]
      }
      v_waitry_pedidos_reversa_sospechosa: {
        Row: {
          anomaly_type: string | null
          corte_id: string | null
          is_partial_net: boolean | null
          is_zero_net: boolean | null
          layout_name: string | null
          looks_like_unmarked_cancellation: boolean | null
          matched_amount_total: number | null
          matched_pair_count: number | null
          matched_pairs: Json | null
          mesero_nombre: string | null
          negative_methods: string[] | null
          negative_payment_count: number | null
          net_payments: number | null
          order_id: string | null
          payments_summary: string | null
          place_name: string | null
          pos_email: string | null
          pos_nombre: string | null
          pos_user_id: string | null
          pos_username: string | null
          positive_methods: string[] | null
          positive_payment_count: number | null
          product_lines: number | null
          product_qty: number | null
          product_total: number | null
          products_summary: string | null
          service_charge: number | null
          status: string | null
          table_name: string | null
          tax: number | null
          timestamp: string | null
          total_amount: number | null
          total_discount: number | null
          total_negative_amount: number | null
          total_positive_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "waitry_pedidos_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_lista"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitry_pedidos_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_totales"
            referencedColumns: ["corte_id"]
          },
        ]
      }
      v_waitry_pending_duplicates: {
        Row: {
          content_hash: string | null
          detected_at: string | null
          id: string | null
          match_reason: string | null
          order_a_notes: string | null
          order_a_place_name: string | null
          order_a_status: string | null
          order_a_table_name: string | null
          order_a_timestamp: string | null
          order_a_total_amount: number | null
          order_b_notes: string | null
          order_b_place_name: string | null
          order_b_status: string | null
          order_b_table_name: string | null
          order_b_timestamp: string | null
          order_b_total_amount: number | null
          order_id_a: string | null
          order_id_b: string | null
          seconds_apart: number | null
          similarity_score: number | null
        }
        Relationships: []
      }
      v_waitry_productos_categoria: {
        Row: {
          categoria_color: string | null
          categoria_id: string | null
          categoria_nombre: string | null
          categoria_orden: number | null
          created_at: string | null
          id: string | null
          order_id: string | null
          product_id: string | null
          product_name: string | null
          producto_catalogo_id: string | null
          quantity: number | null
          total_price: number | null
          unit_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "waitry_productos_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_productos_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos_con_fantasmas"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_productos_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos_reversa_sospechosa"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_productos_order_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "waitry_pedidos"
            referencedColumns: ["order_id"]
          },
        ]
      }
    }
    Functions: {
      check_duplicates: { Args: { p_order_id: string }; Returns: number }
      compute_content_hash: {
        Args: { p_products: Json; p_table_name: string; p_total_amount: number }
        Returns: string
      }
      detect_waitry_fantasma: { Args: { p_order_id: string }; Returns: string }
      fn_inventario_al_corte: {
        Args: { p_fecha: string }
        Returns: {
          bajo_minimo: boolean
          categoria: string
          clasificacion: string
          costo_unitario: number
          factor_consumo: number
          id: string
          inventariable: boolean
          nombre: string
          stock_actual: number
          stock_minimo: number
          total_entradas: number
          total_mermas: number
          total_vendido: number
          ultimo_costo: number
          unidad: string
          valor_inventario: number
        }[]
      }
      parse_waitry_timestamptz: {
        Args: { p_fallback_tz?: string; p_value: Json }
        Returns: string
      }
      refresh_waitry_superseded: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      upsert_corte: {
        Args: {
          p_caja_nombre?: string
          p_coda_id?: string
          p_corte_nombre?: string
          p_efectivo_contado?: number
          p_efectivo_inicial?: number
          p_estado?: string
          p_fecha_operativa?: string
          p_hora_fin?: string
          p_hora_inicio?: string
          p_observaciones?: string
          p_responsable_apertura?: string
          p_responsable_cierre?: string
          p_tipo?: string
          p_turno?: string
        }
        Returns: Database["erp"]["Tables"]["cortes_caja"]["Row"]
        SetofOptions: {
          from: "*"
          to: "cortes_caja"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_movimiento: {
        Args: {
          p_coda_id?: string
          p_corte_nombre?: string
          p_fecha_hora?: string
          p_monto?: number
          p_nota?: string
          p_registrado_por?: string
          p_tipo?: string
        }
        Returns: Database["erp"]["Tables"]["movimientos_caja"]["Row"]
        SetofOptions: {
          from: "*"
          to: "movimientos_caja"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      waitry_items_signature: { Args: { p_order_id: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  core: {
    Enums: {},
  },
  dilesa: {
    Enums: {},
  },
  erp: {
    Enums: {
      clasificacion_producto: [
        "inventariable",
        "consumible",
        "merchandising",
        "activo_fijo",
      ],
    },
  },
  health: {
    Enums: {},
  },
  maquinaria: {
    Enums: {},
  },
  playtomic: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  rdb: {
    Enums: {},
  },
} as const
