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
          slug: string
        }
        Insert: {
          descripcion?: string | null
          empresa_id: string
          id?: string
          nombre: string
          slug: string
        }
        Update: {
          descripcion?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
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
      fn_has_empresa: { Args: { p_empresa_id: string }; Returns: boolean }
      fn_is_admin: { Args: never; Returns: boolean }
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
      anteproyectos: {
        Row: {
          area_vendible_m2: number | null
          areas_verdes_m2: number | null
          cantidad_lotes: number | null
          clave_interna: string | null
          coda_row_id: string | null
          convertido_a_proyecto_en: string | null
          convertido_a_proyecto_por: string | null
          created_at: string
          decision_actual: string | null
          deleted_at: string | null
          empresa_id: string
          estado: string
          etapa: string | null
          fecha_inicio: string | null
          fecha_ultima_revision: string | null
          id: string
          infraestructura_cabecera_inversion: number | null
          lote_promedio_m2: number | null
          motivo_no_viable: string | null
          nombre: string
          notas: string | null
          plano_lotificacion_url: string | null
          prioridad: string | null
          proyecto_id: string | null
          responsable_id: string | null
          siguiente_accion: string | null
          terreno_id: string
          tipo_proyecto_id: string | null
          updated_at: string
        }
        Insert: {
          area_vendible_m2?: number | null
          areas_verdes_m2?: number | null
          cantidad_lotes?: number | null
          clave_interna?: string | null
          coda_row_id?: string | null
          convertido_a_proyecto_en?: string | null
          convertido_a_proyecto_por?: string | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id: string
          estado?: string
          etapa?: string | null
          fecha_inicio?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          infraestructura_cabecera_inversion?: number | null
          lote_promedio_m2?: number | null
          motivo_no_viable?: string | null
          nombre: string
          notas?: string | null
          plano_lotificacion_url?: string | null
          prioridad?: string | null
          proyecto_id?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          terreno_id: string
          tipo_proyecto_id?: string | null
          updated_at?: string
        }
        Update: {
          area_vendible_m2?: number | null
          areas_verdes_m2?: number | null
          cantidad_lotes?: number | null
          clave_interna?: string | null
          coda_row_id?: string | null
          convertido_a_proyecto_en?: string | null
          convertido_a_proyecto_por?: string | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id?: string
          estado?: string
          etapa?: string | null
          fecha_inicio?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          infraestructura_cabecera_inversion?: number | null
          lote_promedio_m2?: number | null
          motivo_no_viable?: string | null
          nombre?: string
          notas?: string | null
          plano_lotificacion_url?: string | null
          prioridad?: string | null
          proyecto_id?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          terreno_id?: string
          tipo_proyecto_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anteproyectos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anteproyectos_terreno_id_fkey"
            columns: ["terreno_id"]
            isOneToOne: false
            referencedRelation: "terrenos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anteproyectos_tipo_proyecto_id_fkey"
            columns: ["tipo_proyecto_id"]
            isOneToOne: false
            referencedRelation: "tipo_proyecto"
            referencedColumns: ["id"]
          },
        ]
      }
      anteproyectos_prototipos_referencia: {
        Row: {
          anteproyecto_id: string
          coda_row_id: string | null
          created_at: string
          empresa_id: string
          id: string
          prototipo_id: string
        }
        Insert: {
          anteproyecto_id: string
          coda_row_id?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          prototipo_id: string
        }
        Update: {
          anteproyecto_id?: string
          coda_row_id?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          prototipo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anteproyectos_prototipos_referencia_anteproyecto_id_fkey"
            columns: ["anteproyecto_id"]
            isOneToOne: false
            referencedRelation: "anteproyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anteproyectos_prototipos_referencia_anteproyecto_id_fkey"
            columns: ["anteproyecto_id"]
            isOneToOne: false
            referencedRelation: "v_anteproyectos_analisis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anteproyectos_prototipos_referencia_prototipo_id_fkey"
            columns: ["prototipo_id"]
            isOneToOne: false
            referencedRelation: "prototipos"
            referencedColumns: ["id"]
          },
        ]
      }
      bitacora_obra: {
        Row: {
          actividades_realizadas: string | null
          coda_row_id: string | null
          condiciones_clima: string | null
          construccion_lote_id: string
          created_at: string
          deleted_at: string | null
          empresa_id: string
          fecha: string
          fotos_urls: string[] | null
          id: string
          incidencias: string | null
          materiales_recibidos: Json | null
          personal_presente: number | null
          supervisor_id: string | null
          temperatura_c: number | null
          updated_at: string
        }
        Insert: {
          actividades_realizadas?: string | null
          coda_row_id?: string | null
          condiciones_clima?: string | null
          construccion_lote_id: string
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          fecha: string
          fotos_urls?: string[] | null
          id?: string
          incidencias?: string | null
          materiales_recibidos?: Json | null
          personal_presente?: number | null
          supervisor_id?: string | null
          temperatura_c?: number | null
          updated_at?: string
        }
        Update: {
          actividades_realizadas?: string | null
          coda_row_id?: string | null
          condiciones_clima?: string | null
          construccion_lote_id?: string
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          fecha?: string
          fotos_urls?: string[] | null
          id?: string
          incidencias?: string | null
          materiales_recibidos?: Json | null
          personal_presente?: number | null
          supervisor_id?: string | null
          temperatura_c?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bitacora_obra_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "construccion_lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bitacora_obra_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_estatus"
            referencedColumns: ["construccion_id"]
          },
          {
            foreignKeyName: "bitacora_obra_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "v_obra_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_maestro: {
        Row: {
          activa: boolean
          categoria: string | null
          coda_row_id: string | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          etapa_construccion_id: string | null
          id: string
          nombre: string
          prototipo_id: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          categoria?: string | null
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          etapa_construccion_id?: string | null
          id?: string
          nombre: string
          prototipo_id?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          categoria?: string | null
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          etapa_construccion_id?: string | null
          id?: string
          nombre?: string
          prototipo_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_maestro_etapa_construccion_id_fkey"
            columns: ["etapa_construccion_id"]
            isOneToOne: false
            referencedRelation: "etapas_construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_maestro_prototipo_id_fkey"
            columns: ["prototipo_id"]
            isOneToOne: false
            referencedRelation: "prototipos"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_maestro_items: {
        Row: {
          checklist_id: string
          coda_row_id: string | null
          created_at: string
          criterio_aceptacion: string | null
          deleted_at: string | null
          descripcion_item: string
          empresa_id: string
          id: string
          obligatorio: boolean
          orden: number
          updated_at: string
        }
        Insert: {
          checklist_id: string
          coda_row_id?: string | null
          created_at?: string
          criterio_aceptacion?: string | null
          deleted_at?: string | null
          descripcion_item: string
          empresa_id: string
          id?: string
          obligatorio?: boolean
          orden: number
          updated_at?: string
        }
        Update: {
          checklist_id?: string
          coda_row_id?: string | null
          created_at?: string
          criterio_aceptacion?: string | null
          deleted_at?: string | null
          descripcion_item?: string
          empresa_id?: string
          id?: string
          obligatorio?: boolean
          orden?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_maestro_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklist_maestro"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_supervision: {
        Row: {
          checklist_maestro_id: string
          coda_row_id: string | null
          construccion_lote_id: string
          created_at: string
          deleted_at: string | null
          empresa_id: string
          fecha_inspeccion: string
          id: string
          observaciones_generales: string | null
          resultado: string
          supervisor_id: string | null
          updated_at: string
        }
        Insert: {
          checklist_maestro_id: string
          coda_row_id?: string | null
          construccion_lote_id: string
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          fecha_inspeccion: string
          id?: string
          observaciones_generales?: string | null
          resultado: string
          supervisor_id?: string | null
          updated_at?: string
        }
        Update: {
          checklist_maestro_id?: string
          coda_row_id?: string | null
          construccion_lote_id?: string
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          fecha_inspeccion?: string
          id?: string
          observaciones_generales?: string | null
          resultado?: string
          supervisor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_supervision_checklist_maestro_id_fkey"
            columns: ["checklist_maestro_id"]
            isOneToOne: false
            referencedRelation: "checklist_maestro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_supervision_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "construccion_lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_supervision_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_estatus"
            referencedColumns: ["construccion_id"]
          },
          {
            foreignKeyName: "checklist_supervision_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "v_obra_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_supervision_resultados: {
        Row: {
          checklist_item_id: string
          checklist_supervision_id: string
          coda_row_id: string | null
          created_at: string
          cumple: boolean
          deleted_at: string | null
          empresa_id: string
          evidencia_url: string | null
          id: string
          observaciones: string | null
          updated_at: string
        }
        Insert: {
          checklist_item_id: string
          checklist_supervision_id: string
          coda_row_id?: string | null
          created_at?: string
          cumple: boolean
          deleted_at?: string | null
          empresa_id: string
          evidencia_url?: string | null
          id?: string
          observaciones?: string | null
          updated_at?: string
        }
        Update: {
          checklist_item_id?: string
          checklist_supervision_id?: string
          coda_row_id?: string | null
          created_at?: string
          cumple?: boolean
          deleted_at?: string | null
          empresa_id?: string
          evidencia_url?: string | null
          id?: string
          observaciones?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_supervision_resultados_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_maestro_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_supervision_resultados_checklist_supervision_id_fkey"
            columns: ["checklist_supervision_id"]
            isOneToOne: false
            referencedRelation: "checklist_supervision"
            referencedColumns: ["id"]
          },
        ]
      }
      clasificacion_inmobiliaria: {
        Row: {
          activo: boolean
          coda_row_id: string | null
          codigo: string
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          coda_row_id?: string | null
          codigo: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          coda_row_id?: string | null
          codigo?: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      construccion_lote: {
        Row: {
          avance_pct: number
          coda_row_id: string | null
          contratista_principal_id: string | null
          costo_acumulado: number
          created_at: string
          decision_actual: string | null
          deleted_at: string | null
          empresa_id: string
          etapa: string | null
          etapa_construccion_id: string | null
          fecha_estimada_entrega: string | null
          fecha_inicio_obra: string | null
          fecha_real_entrega: string | null
          fecha_ultima_revision: string | null
          id: string
          lote_id: string
          observaciones: string | null
          presupuesto_asignado: number | null
          prioridad: string | null
          prototipo_id: string
          responsable_id: string | null
          siguiente_accion: string | null
          updated_at: string
        }
        Insert: {
          avance_pct?: number
          coda_row_id?: string | null
          contratista_principal_id?: string | null
          costo_acumulado?: number
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id: string
          etapa?: string | null
          etapa_construccion_id?: string | null
          fecha_estimada_entrega?: string | null
          fecha_inicio_obra?: string | null
          fecha_real_entrega?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          lote_id: string
          observaciones?: string | null
          presupuesto_asignado?: number | null
          prioridad?: string | null
          prototipo_id: string
          responsable_id?: string | null
          siguiente_accion?: string | null
          updated_at?: string
        }
        Update: {
          avance_pct?: number
          coda_row_id?: string | null
          contratista_principal_id?: string | null
          costo_acumulado?: number
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id?: string
          etapa?: string | null
          etapa_construccion_id?: string | null
          fecha_estimada_entrega?: string | null
          fecha_inicio_obra?: string | null
          fecha_real_entrega?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          lote_id?: string
          observaciones?: string | null
          presupuesto_asignado?: number | null
          prioridad?: string | null
          prototipo_id?: string
          responsable_id?: string | null
          siguiente_accion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "construccion_lote_etapa_construccion_id_fkey"
            columns: ["etapa_construccion_id"]
            isOneToOne: false
            referencedRelation: "etapas_construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construccion_lote_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construccion_lote_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_estatus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construccion_lote_prototipo_id_fkey"
            columns: ["prototipo_id"]
            isOneToOne: false
            referencedRelation: "prototipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_construccion_lote_contratista_principal"
            columns: ["contratista_principal_id"]
            isOneToOne: false
            referencedRelation: "contratistas"
            referencedColumns: ["id"]
          },
        ]
      }
      contratistas: {
        Row: {
          calificacion: number | null
          coda_row_id: string | null
          codigo: string | null
          convenio_vigente: boolean
          created_at: string
          decision_actual: string | null
          deleted_at: string | null
          empresa_id: string
          especialidad: string | null
          etapa: string | null
          fecha_alta: string | null
          fecha_ultima_revision: string | null
          id: string
          observaciones: string | null
          persona_id: string
          prioridad: string | null
          responsable_id: string | null
          siguiente_accion: string | null
          tipo_trabajo_principal_id: string | null
          updated_at: string
        }
        Insert: {
          calificacion?: number | null
          coda_row_id?: string | null
          codigo?: string | null
          convenio_vigente?: boolean
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id: string
          especialidad?: string | null
          etapa?: string | null
          fecha_alta?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          observaciones?: string | null
          persona_id: string
          prioridad?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          tipo_trabajo_principal_id?: string | null
          updated_at?: string
        }
        Update: {
          calificacion?: number | null
          coda_row_id?: string | null
          codigo?: string | null
          convenio_vigente?: boolean
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id?: string
          especialidad?: string | null
          etapa?: string | null
          fecha_alta?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          observaciones?: string | null
          persona_id?: string
          prioridad?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          tipo_trabajo_principal_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratistas_tipo_trabajo_principal_id_fkey"
            columns: ["tipo_trabajo_principal_id"]
            isOneToOne: false
            referencedRelation: "tipo_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_construccion: {
        Row: {
          archivo_contrato_url: string | null
          coda_row_id: string | null
          codigo_contrato: string | null
          construccion_lote_id: string
          contratista_id: string
          created_at: string
          decision_actual: string | null
          deleted_at: string | null
          empresa_id: string
          estado: string
          etapa: string | null
          fecha_firma: string | null
          fecha_inicio_estimada: string | null
          fecha_terminacion_estimada: string | null
          fecha_terminacion_real: string | null
          fecha_ultima_revision: string | null
          id: string
          monto_total: number | null
          observaciones: string | null
          porcentaje_anticipo: number | null
          prioridad: string | null
          responsable_id: string | null
          siguiente_accion: string | null
          tipo_trabajo_id: string | null
          updated_at: string
        }
        Insert: {
          archivo_contrato_url?: string | null
          coda_row_id?: string | null
          codigo_contrato?: string | null
          construccion_lote_id: string
          contratista_id: string
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id: string
          estado?: string
          etapa?: string | null
          fecha_firma?: string | null
          fecha_inicio_estimada?: string | null
          fecha_terminacion_estimada?: string | null
          fecha_terminacion_real?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          monto_total?: number | null
          observaciones?: string | null
          porcentaje_anticipo?: number | null
          prioridad?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          tipo_trabajo_id?: string | null
          updated_at?: string
        }
        Update: {
          archivo_contrato_url?: string | null
          coda_row_id?: string | null
          codigo_contrato?: string | null
          construccion_lote_id?: string
          contratista_id?: string
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id?: string
          estado?: string
          etapa?: string | null
          fecha_firma?: string | null
          fecha_inicio_estimada?: string | null
          fecha_terminacion_estimada?: string | null
          fecha_terminacion_real?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          monto_total?: number | null
          observaciones?: string | null
          porcentaje_anticipo?: number | null
          prioridad?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          tipo_trabajo_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratos_construccion_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "construccion_lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_construccion_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_estatus"
            referencedColumns: ["construccion_id"]
          },
          {
            foreignKeyName: "contratos_construccion_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "v_obra_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_construccion_contratista_id_fkey"
            columns: ["contratista_id"]
            isOneToOne: false
            referencedRelation: "contratistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_construccion_tipo_trabajo_id_fkey"
            columns: ["tipo_trabajo_id"]
            isOneToOne: false
            referencedRelation: "tipo_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      etapas_construccion: {
        Row: {
          activo: boolean
          coda_row_id: string | null
          codigo: string
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          coda_row_id?: string | null
          codigo: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          coda_row_id?: string | null
          codigo?: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      fases_inventario: {
        Row: {
          activo: boolean
          coda_row_id: string | null
          codigo: string
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          coda_row_id?: string | null
          codigo: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          coda_row_id?: string | null
          codigo?: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      fases_urbanizacion: {
        Row: {
          activo: boolean
          coda_row_id: string | null
          codigo: string
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          coda_row_id?: string | null
          codigo: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          coda_row_id?: string | null
          codigo?: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      forma_pago: {
        Row: {
          activo: boolean
          coda_row_id: string | null
          codigo: string
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          coda_row_id?: string | null
          codigo: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          coda_row_id?: string | null
          codigo?: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      fraccionamiento_prototipo: {
        Row: {
          cantidad_unidades: number
          coda_row_id: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          id: string
          notas: string | null
          precio_venta: number | null
          prototipo_id: string
          proyecto_id: string
          updated_at: string
        }
        Insert: {
          cantidad_unidades?: number
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          id?: string
          notas?: string | null
          precio_venta?: number | null
          prototipo_id: string
          proyecto_id: string
          updated_at?: string
        }
        Update: {
          cantidad_unidades?: number
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          notas?: string | null
          precio_venta?: number | null
          prototipo_id?: string
          proyecto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraccionamiento_prototipo_prototipo_id_fkey"
            columns: ["prototipo_id"]
            isOneToOne: false
            referencedRelation: "prototipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraccionamiento_prototipo_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_vivienda: {
        Row: {
          cliente_apartado_id: string | null
          coda_row_id: string | null
          codigo_unidad: string | null
          construccion_lote_id: string
          created_at: string
          decision_actual: string | null
          deleted_at: string | null
          empresa_id: string
          estado_comercial: string
          etapa: string | null
          fase_inventario_id: string | null
          fecha_apartado: string | null
          fecha_disponibilidad: string | null
          fecha_entrega: string | null
          fecha_escrituracion: string | null
          fecha_ultima_revision: string | null
          fecha_vencimiento_apartado: string | null
          fecha_venta: string | null
          id: string
          lote_id: string
          monto_apartado: number | null
          observaciones: string | null
          precio_lista: number | null
          precio_promocional: number | null
          prioridad: string | null
          promocion_id: string | null
          prototipo_id: string
          proyecto_id: string
          responsable_id: string | null
          siguiente_accion: string | null
          updated_at: string
        }
        Insert: {
          cliente_apartado_id?: string | null
          coda_row_id?: string | null
          codigo_unidad?: string | null
          construccion_lote_id: string
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id: string
          estado_comercial?: string
          etapa?: string | null
          fase_inventario_id?: string | null
          fecha_apartado?: string | null
          fecha_disponibilidad?: string | null
          fecha_entrega?: string | null
          fecha_escrituracion?: string | null
          fecha_ultima_revision?: string | null
          fecha_vencimiento_apartado?: string | null
          fecha_venta?: string | null
          id?: string
          lote_id: string
          monto_apartado?: number | null
          observaciones?: string | null
          precio_lista?: number | null
          precio_promocional?: number | null
          prioridad?: string | null
          promocion_id?: string | null
          prototipo_id: string
          proyecto_id: string
          responsable_id?: string | null
          siguiente_accion?: string | null
          updated_at?: string
        }
        Update: {
          cliente_apartado_id?: string | null
          coda_row_id?: string | null
          codigo_unidad?: string | null
          construccion_lote_id?: string
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id?: string
          estado_comercial?: string
          etapa?: string | null
          fase_inventario_id?: string | null
          fecha_apartado?: string | null
          fecha_disponibilidad?: string | null
          fecha_entrega?: string | null
          fecha_escrituracion?: string | null
          fecha_ultima_revision?: string | null
          fecha_vencimiento_apartado?: string | null
          fecha_venta?: string | null
          id?: string
          lote_id?: string
          monto_apartado?: number | null
          observaciones?: string | null
          precio_lista?: number | null
          precio_promocional?: number | null
          prioridad?: string | null
          promocion_id?: string | null
          prototipo_id?: string
          proyecto_id?: string
          responsable_id?: string | null
          siguiente_accion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_vivienda_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "construccion_lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_estatus"
            referencedColumns: ["construccion_id"]
          },
          {
            foreignKeyName: "inventario_vivienda_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "v_obra_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_fase_inventario_id_fkey"
            columns: ["fase_inventario_id"]
            isOneToOne: false
            referencedRelation: "fases_inventario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_estatus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_promocion_id_fkey"
            columns: ["promocion_id"]
            isOneToOne: false
            referencedRelation: "promociones_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_prototipo_id_fkey"
            columns: ["prototipo_id"]
            isOneToOne: false
            referencedRelation: "prototipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          coda_row_id: string | null
          colindancias: Json | null
          coordenadas_lat: number | null
          coordenadas_lng: number | null
          created_at: string
          decision_actual: string | null
          deleted_at: string | null
          empresa_id: string
          etapa: string | null
          fase_inventario_id: string | null
          fecha_ultima_revision: string | null
          fondo_m: number | null
          frente_m: number | null
          id: string
          manzana: string | null
          notas: string | null
          numero_lote: string
          precio_lote: number | null
          prioridad: string | null
          prototipo_asignado_id: string | null
          proyecto_id: string
          responsable_id: string | null
          siguiente_accion: string | null
          superficie_m2: number | null
          tipo_uso: string | null
          updated_at: string
        }
        Insert: {
          coda_row_id?: string | null
          colindancias?: Json | null
          coordenadas_lat?: number | null
          coordenadas_lng?: number | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id: string
          etapa?: string | null
          fase_inventario_id?: string | null
          fecha_ultima_revision?: string | null
          fondo_m?: number | null
          frente_m?: number | null
          id?: string
          manzana?: string | null
          notas?: string | null
          numero_lote: string
          precio_lote?: number | null
          prioridad?: string | null
          prototipo_asignado_id?: string | null
          proyecto_id: string
          responsable_id?: string | null
          siguiente_accion?: string | null
          superficie_m2?: number | null
          tipo_uso?: string | null
          updated_at?: string
        }
        Update: {
          coda_row_id?: string | null
          colindancias?: Json | null
          coordenadas_lat?: number | null
          coordenadas_lng?: number | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id?: string
          etapa?: string | null
          fase_inventario_id?: string | null
          fecha_ultima_revision?: string | null
          fondo_m?: number | null
          frente_m?: number | null
          id?: string
          manzana?: string | null
          notas?: string | null
          numero_lote?: string
          precio_lote?: number | null
          prioridad?: string | null
          prototipo_asignado_id?: string | null
          proyecto_id?: string
          responsable_id?: string | null
          siguiente_accion?: string | null
          superficie_m2?: number | null
          tipo_uso?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_fase_inventario_id_fkey"
            columns: ["fase_inventario_id"]
            isOneToOne: false
            referencedRelation: "fases_inventario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_prototipo_asignado_id_fkey"
            columns: ["prototipo_asignado_id"]
            isOneToOne: false
            referencedRelation: "prototipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      plantilla_tareas_construccion: {
        Row: {
          activa: boolean
          coda_row_id: string | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          id: string
          nombre: string
          prototipo_id: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          id?: string
          nombre: string
          prototipo_id?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          prototipo_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plantilla_tareas_construccion_prototipo_id_fkey"
            columns: ["prototipo_id"]
            isOneToOne: false
            referencedRelation: "prototipos"
            referencedColumns: ["id"]
          },
        ]
      }
      plantilla_tareas_construccion_items: {
        Row: {
          coda_row_id: string | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          duracion_dias_estimada: number | null
          empresa_id: string
          etapa_construccion_id: string | null
          id: string
          nombre_tarea: string
          obligatoria: boolean
          orden: number
          plantilla_id: string
          tipo_trabajo_id: string | null
          updated_at: string
        }
        Insert: {
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          duracion_dias_estimada?: number | null
          empresa_id: string
          etapa_construccion_id?: string | null
          id?: string
          nombre_tarea: string
          obligatoria?: boolean
          orden: number
          plantilla_id: string
          tipo_trabajo_id?: string | null
          updated_at?: string
        }
        Update: {
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          duracion_dias_estimada?: number | null
          empresa_id?: string
          etapa_construccion_id?: string | null
          id?: string
          nombre_tarea?: string
          obligatoria?: boolean
          orden?: number
          plantilla_id?: string
          tipo_trabajo_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plantilla_tareas_construccion_items_etapa_construccion_id_fkey"
            columns: ["etapa_construccion_id"]
            isOneToOne: false
            referencedRelation: "etapas_construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantilla_tareas_construccion_items_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "plantilla_tareas_construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantilla_tareas_construccion_items_tipo_trabajo_id_fkey"
            columns: ["tipo_trabajo_id"]
            isOneToOne: false
            referencedRelation: "tipo_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      promociones_ventas: {
        Row: {
          activa: boolean
          coda_row_id: string | null
          condiciones: string | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          descuento_monto: number | null
          descuento_pct: number | null
          empresa_id: string
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          nombre: string
          proyecto_id: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          coda_row_id?: string | null
          condiciones?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          descuento_monto?: number | null
          descuento_pct?: number | null
          empresa_id: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre: string
          proyecto_id?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          coda_row_id?: string | null
          condiciones?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          descuento_monto?: number | null
          descuento_pct?: number | null
          empresa_id?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre?: string
          proyecto_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promociones_ventas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      prototipos: {
        Row: {
          banos: number | null
          clasificacion_inmobiliaria_id: string | null
          coda_row_id: string | null
          codigo: string | null
          costo_comercializacion: number | null
          costo_mano_obra: number | null
          costo_materiales: number | null
          costo_registro_ruv: number | null
          costo_total_unitario: number | null
          costo_urbanizacion: number | null
          created_at: string
          decision_actual: string | null
          deleted_at: string | null
          empresa_id: string
          etapa: string | null
          fecha_ultima_revision: string | null
          id: string
          imagen_principal_url: string | null
          nombre: string
          notas: string | null
          plano_arquitectonico_url: string | null
          prioridad: string | null
          recamaras: number | null
          responsable_id: string | null
          seguro_calidad: number | null
          siguiente_accion: string | null
          superficie_construida_m2: number | null
          superficie_lote_min_m2: number | null
          updated_at: string
          valor_comercial: number | null
        }
        Insert: {
          banos?: number | null
          clasificacion_inmobiliaria_id?: string | null
          coda_row_id?: string | null
          codigo?: string | null
          costo_comercializacion?: number | null
          costo_mano_obra?: number | null
          costo_materiales?: number | null
          costo_registro_ruv?: number | null
          costo_total_unitario?: number | null
          costo_urbanizacion?: number | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id: string
          etapa?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          imagen_principal_url?: string | null
          nombre: string
          notas?: string | null
          plano_arquitectonico_url?: string | null
          prioridad?: string | null
          recamaras?: number | null
          responsable_id?: string | null
          seguro_calidad?: number | null
          siguiente_accion?: string | null
          superficie_construida_m2?: number | null
          superficie_lote_min_m2?: number | null
          updated_at?: string
          valor_comercial?: number | null
        }
        Update: {
          banos?: number | null
          clasificacion_inmobiliaria_id?: string | null
          coda_row_id?: string | null
          codigo?: string | null
          costo_comercializacion?: number | null
          costo_mano_obra?: number | null
          costo_materiales?: number | null
          costo_registro_ruv?: number | null
          costo_total_unitario?: number | null
          costo_urbanizacion?: number | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id?: string
          etapa?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          imagen_principal_url?: string | null
          nombre?: string
          notas?: string | null
          plano_arquitectonico_url?: string | null
          prioridad?: string | null
          recamaras?: number | null
          responsable_id?: string | null
          seguro_calidad?: number | null
          siguiente_accion?: string | null
          superficie_construida_m2?: number | null
          superficie_lote_min_m2?: number | null
          updated_at?: string
          valor_comercial?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prototipos_clasificacion_inmobiliaria_id_fkey"
            columns: ["clasificacion_inmobiliaria_id"]
            isOneToOne: false
            referencedRelation: "clasificacion_inmobiliaria"
            referencedColumns: ["id"]
          },
        ]
      }
      proyectos: {
        Row: {
          anteproyecto_id: string | null
          area_vendible_m2: number | null
          areas_verdes_m2: number | null
          cantidad_lotes_total: number | null
          coda_row_id: string | null
          codigo: string | null
          created_at: string
          decision_actual: string | null
          deleted_at: string | null
          empresa_id: string
          etapa: string | null
          fase: string | null
          fecha_estimada_cierre: string | null
          fecha_inicio: string | null
          fecha_ultima_revision: string | null
          id: string
          inversion_total: number | null
          nombre: string
          notas: string | null
          presupuesto_total: number | null
          prioridad: string | null
          responsable_id: string | null
          siguiente_accion: string | null
          terreno_id: string
          tipo_proyecto_id: string | null
          updated_at: string
        }
        Insert: {
          anteproyecto_id?: string | null
          area_vendible_m2?: number | null
          areas_verdes_m2?: number | null
          cantidad_lotes_total?: number | null
          coda_row_id?: string | null
          codigo?: string | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id: string
          etapa?: string | null
          fase?: string | null
          fecha_estimada_cierre?: string | null
          fecha_inicio?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          inversion_total?: number | null
          nombre: string
          notas?: string | null
          presupuesto_total?: number | null
          prioridad?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          terreno_id: string
          tipo_proyecto_id?: string | null
          updated_at?: string
        }
        Update: {
          anteproyecto_id?: string | null
          area_vendible_m2?: number | null
          areas_verdes_m2?: number | null
          cantidad_lotes_total?: number | null
          coda_row_id?: string | null
          codigo?: string | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id?: string
          etapa?: string | null
          fase?: string | null
          fecha_estimada_cierre?: string | null
          fecha_inicio?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          inversion_total?: number | null
          nombre?: string
          notas?: string | null
          presupuesto_total?: number | null
          prioridad?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          terreno_id?: string
          tipo_proyecto_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyectos_anteproyecto_id_fkey"
            columns: ["anteproyecto_id"]
            isOneToOne: false
            referencedRelation: "anteproyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_anteproyecto_id_fkey"
            columns: ["anteproyecto_id"]
            isOneToOne: false
            referencedRelation: "v_anteproyectos_analisis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_terreno_id_fkey"
            columns: ["terreno_id"]
            isOneToOne: false
            referencedRelation: "terrenos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_tipo_proyecto_id_fkey"
            columns: ["tipo_proyecto_id"]
            isOneToOne: false
            referencedRelation: "tipo_proyecto"
            referencedColumns: ["id"]
          },
        ]
      }
      recepciones_contratista: {
        Row: {
          avance_pct: number | null
          coda_row_id: string | null
          contrato_construccion_id: string
          created_at: string
          deleted_at: string | null
          empresa_id: string
          evidencias_urls: string[] | null
          fecha_recepcion: string
          id: string
          monto_recibido: number | null
          observaciones: string | null
          supervisor_id: string | null
          tipo_recepcion: string
          updated_at: string
        }
        Insert: {
          avance_pct?: number | null
          coda_row_id?: string | null
          contrato_construccion_id: string
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          evidencias_urls?: string[] | null
          fecha_recepcion: string
          id?: string
          monto_recibido?: number | null
          observaciones?: string | null
          supervisor_id?: string | null
          tipo_recepcion?: string
          updated_at?: string
        }
        Update: {
          avance_pct?: number | null
          coda_row_id?: string | null
          contrato_construccion_id?: string
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          evidencias_urls?: string[] | null
          fecha_recepcion?: string
          id?: string
          monto_recibido?: number | null
          observaciones?: string | null
          supervisor_id?: string | null
          tipo_recepcion?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recepciones_contratista_contrato_construccion_id_fkey"
            columns: ["contrato_construccion_id"]
            isOneToOne: false
            referencedRelation: "contratos_construccion"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas_construccion: {
        Row: {
          avance_pct: number
          coda_row_id: string | null
          construccion_lote_id: string
          contratista_id: string | null
          created_at: string
          decision_actual: string | null
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          estado: string
          etapa: string | null
          etapa_construccion_id: string | null
          evidencias_urls: string[] | null
          fecha_fin_estimada: string | null
          fecha_fin_real: string | null
          fecha_inicio_estimada: string | null
          fecha_inicio_real: string | null
          fecha_ultima_revision: string | null
          id: string
          nombre: string
          observaciones: string | null
          orden: number | null
          plantilla_item_id: string | null
          prioridad: string | null
          responsable_id: string | null
          siguiente_accion: string | null
          updated_at: string
        }
        Insert: {
          avance_pct?: number
          coda_row_id?: string | null
          construccion_lote_id: string
          contratista_id?: string | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          estado?: string
          etapa?: string | null
          etapa_construccion_id?: string | null
          evidencias_urls?: string[] | null
          fecha_fin_estimada?: string | null
          fecha_fin_real?: string | null
          fecha_inicio_estimada?: string | null
          fecha_inicio_real?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          nombre: string
          observaciones?: string | null
          orden?: number | null
          plantilla_item_id?: string | null
          prioridad?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          updated_at?: string
        }
        Update: {
          avance_pct?: number
          coda_row_id?: string | null
          construccion_lote_id?: string
          contratista_id?: string | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          estado?: string
          etapa?: string | null
          etapa_construccion_id?: string | null
          evidencias_urls?: string[] | null
          fecha_fin_estimada?: string | null
          fecha_fin_real?: string | null
          fecha_inicio_estimada?: string | null
          fecha_inicio_real?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          nombre?: string
          observaciones?: string | null
          orden?: number | null
          plantilla_item_id?: string | null
          prioridad?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tareas_construccion_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "construccion_lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_construccion_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_estatus"
            referencedColumns: ["construccion_id"]
          },
          {
            foreignKeyName: "tareas_construccion_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "v_obra_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_construccion_contratista_id_fkey"
            columns: ["contratista_id"]
            isOneToOne: false
            referencedRelation: "contratistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_construccion_etapa_construccion_id_fkey"
            columns: ["etapa_construccion_id"]
            isOneToOne: false
            referencedRelation: "etapas_construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_construccion_plantilla_item_id_fkey"
            columns: ["plantilla_item_id"]
            isOneToOne: false
            referencedRelation: "plantilla_tareas_construccion_items"
            referencedColumns: ["id"]
          },
        ]
      }
      terrenos: {
        Row: {
          archivo_kmz_url: string | null
          area_terreno_m2: number | null
          areas_afectacion_m2: number | null
          areas_aprovechables_m2: number | null
          clave_interna: string | null
          coda_row_id: string | null
          created_at: string
          decision_actual: string | null
          deleted_at: string | null
          direccion_referencia: string | null
          documentos: Json
          empresa_id: string
          estatus_propiedad: string | null
          etapa: string | null
          fecha_captura: string
          fecha_ultima_revision: string | null
          id: string
          imagen_zcu_url: string | null
          municipio: string | null
          nombre: string
          nombre_corredor: string | null
          nombre_propietario: string | null
          notas: string | null
          numero_escritura: string | null
          objetivo: string | null
          origen: string | null
          pct_diferencia_solicitado_oferta: number | null
          pdf_escritura_url: string | null
          precio_ofertado_m2: number | null
          precio_solicitado_m2: number | null
          prioridad: string | null
          responsable_id: string | null
          siguiente_accion: string | null
          telefono_corredor: string | null
          telefono_propietario: string | null
          tipo: string | null
          updated_at: string
          valor_interno_estimado: number | null
          valor_objetivo_compra: number | null
          valor_predio: number | null
          valor_total_oferta: number | null
          zona_sector: string | null
        }
        Insert: {
          archivo_kmz_url?: string | null
          area_terreno_m2?: number | null
          areas_afectacion_m2?: number | null
          areas_aprovechables_m2?: number | null
          clave_interna?: string | null
          coda_row_id?: string | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          direccion_referencia?: string | null
          documentos?: Json
          empresa_id: string
          estatus_propiedad?: string | null
          etapa?: string | null
          fecha_captura?: string
          fecha_ultima_revision?: string | null
          id?: string
          imagen_zcu_url?: string | null
          municipio?: string | null
          nombre: string
          nombre_corredor?: string | null
          nombre_propietario?: string | null
          notas?: string | null
          numero_escritura?: string | null
          objetivo?: string | null
          origen?: string | null
          pct_diferencia_solicitado_oferta?: number | null
          pdf_escritura_url?: string | null
          precio_ofertado_m2?: number | null
          precio_solicitado_m2?: number | null
          prioridad?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          telefono_corredor?: string | null
          telefono_propietario?: string | null
          tipo?: string | null
          updated_at?: string
          valor_interno_estimado?: number | null
          valor_objetivo_compra?: number | null
          valor_predio?: number | null
          valor_total_oferta?: number | null
          zona_sector?: string | null
        }
        Update: {
          archivo_kmz_url?: string | null
          area_terreno_m2?: number | null
          areas_afectacion_m2?: number | null
          areas_aprovechables_m2?: number | null
          clave_interna?: string | null
          coda_row_id?: string | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          direccion_referencia?: string | null
          documentos?: Json
          empresa_id?: string
          estatus_propiedad?: string | null
          etapa?: string | null
          fecha_captura?: string
          fecha_ultima_revision?: string | null
          id?: string
          imagen_zcu_url?: string | null
          municipio?: string | null
          nombre?: string
          nombre_corredor?: string | null
          nombre_propietario?: string | null
          notas?: string | null
          numero_escritura?: string | null
          objetivo?: string | null
          origen?: string | null
          pct_diferencia_solicitado_oferta?: number | null
          pdf_escritura_url?: string | null
          precio_ofertado_m2?: number | null
          precio_solicitado_m2?: number | null
          prioridad?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          telefono_corredor?: string | null
          telefono_propietario?: string | null
          tipo?: string | null
          updated_at?: string
          valor_interno_estimado?: number | null
          valor_objetivo_compra?: number | null
          valor_predio?: number | null
          valor_total_oferta?: number | null
          zona_sector?: string | null
        }
        Relationships: []
      }
      tipo_credito: {
        Row: {
          activo: boolean
          coda_row_id: string | null
          codigo: string
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          coda_row_id?: string | null
          codigo: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          coda_row_id?: string | null
          codigo?: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      tipo_deposito: {
        Row: {
          activo: boolean
          coda_row_id: string | null
          codigo: string
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          coda_row_id?: string | null
          codigo: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          coda_row_id?: string | null
          codigo?: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      tipo_proyecto: {
        Row: {
          activo: boolean
          coda_row_id: string | null
          codigo: string
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          coda_row_id?: string | null
          codigo: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          coda_row_id?: string | null
          codigo?: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      tipo_trabajo: {
        Row: {
          activo: boolean
          coda_row_id: string | null
          codigo: string
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          coda_row_id?: string | null
          codigo: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          coda_row_id?: string | null
          codigo?: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      urbanizacion_lote: {
        Row: {
          avance_pct: number
          coda_row_id: string | null
          created_at: string
          decision_actual: string | null
          deleted_at: string | null
          empresa_id: string
          etapa: string | null
          evidencias_urls: string[] | null
          fase_urbanizacion_id: string | null
          fecha_inicio: string | null
          fecha_terminacion: string | null
          fecha_ultima_revision: string | null
          id: string
          lote_id: string
          observaciones: string | null
          prioridad: string | null
          responsable_id: string | null
          siguiente_accion: string | null
          updated_at: string
        }
        Insert: {
          avance_pct?: number
          coda_row_id?: string | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id: string
          etapa?: string | null
          evidencias_urls?: string[] | null
          fase_urbanizacion_id?: string | null
          fecha_inicio?: string | null
          fecha_terminacion?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          lote_id: string
          observaciones?: string | null
          prioridad?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          updated_at?: string
        }
        Update: {
          avance_pct?: number
          coda_row_id?: string | null
          created_at?: string
          decision_actual?: string | null
          deleted_at?: string | null
          empresa_id?: string
          etapa?: string | null
          evidencias_urls?: string[] | null
          fase_urbanizacion_id?: string | null
          fecha_inicio?: string | null
          fecha_terminacion?: string | null
          fecha_ultima_revision?: string | null
          id?: string
          lote_id?: string
          observaciones?: string | null
          prioridad?: string | null
          responsable_id?: string | null
          siguiente_accion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "urbanizacion_lote_fase_urbanizacion_id_fkey"
            columns: ["fase_urbanizacion_id"]
            isOneToOne: false
            referencedRelation: "fases_urbanizacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "urbanizacion_lote_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "urbanizacion_lote_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_estatus"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_anteproyectos_analisis: {
        Row: {
          aprovechamiento_pct: number | null
          area_terreno_m2: number | null
          area_vendible_m2: number | null
          areas_aprovechables_m2: number | null
          areas_verdes_m2: number | null
          cantidad_lotes: number | null
          clave_interna: string | null
          convertido_a_proyecto_en: string | null
          convertido_a_proyecto_por: string | null
          costo_comercializacion_ref: number | null
          costo_mano_obra_ref: number | null
          costo_materiales_ref: number | null
          costo_registro_ruv_ref: number | null
          costo_total_proyecto: number | null
          costo_total_ref: number | null
          costo_urbanizacion_ref: number | null
          created_at: string | null
          decision_actual: string | null
          empresa_id: string | null
          estado: string | null
          etapa: string | null
          fecha_inicio: string | null
          fecha_ultima_revision: string | null
          id: string | null
          infraestructura_cabecera_inversion: number | null
          lote_promedio_m2: number | null
          margen_pct: number | null
          motivo_no_viable: string | null
          nombre: string | null
          plano_lotificacion_url: string | null
          porcentaje_areas_verdes: number | null
          precio_m2_aprovechable: number | null
          prioridad: string | null
          prototipos_referenciados: number | null
          proyecto_id: string | null
          responsable_id: string | null
          seguro_calidad_ref: number | null
          siguiente_accion: string | null
          terreno_id: string | null
          tipo_proyecto_id: string | null
          updated_at: string | null
          utilidad_proyecto: number | null
          valor_comercial_proyecto: number | null
          valor_comercial_ref: number | null
          valor_predio: number | null
          vialidades_banquetas_m2: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anteproyectos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anteproyectos_terreno_id_fkey"
            columns: ["terreno_id"]
            isOneToOne: false
            referencedRelation: "terrenos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anteproyectos_tipo_proyecto_id_fkey"
            columns: ["tipo_proyecto_id"]
            isOneToOne: false
            referencedRelation: "tipo_proyecto"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inventario_comercial: {
        Row: {
          cliente_apartado_id: string | null
          cliente_apartado_nombre: string | null
          cliente_apartado_telefono: string | null
          codigo_unidad: string | null
          construccion_avance_pct: number | null
          construccion_etapa_id: string | null
          construccion_lote_id: string | null
          created_at: string | null
          decision_actual: string | null
          dias_en_fase: number | null
          empresa_id: string | null
          estado_comercial: string | null
          etapa: string | null
          fase_inventario_id: string | null
          fase_inventario_nombre: string | null
          fecha_apartado: string | null
          fecha_disponibilidad: string | null
          fecha_entrega: string | null
          fecha_escrituracion: string | null
          fecha_ultima_revision: string | null
          fecha_vencimiento_apartado: string | null
          fecha_venta: string | null
          id: string | null
          lote_id: string | null
          lote_manzana: string | null
          lote_numero: string | null
          lote_superficie_m2: number | null
          monto_apartado: number | null
          observaciones: string | null
          precio_final: number | null
          precio_lista: number | null
          precio_promocional: number | null
          prioridad: string | null
          promocion_descuento_monto: number | null
          promocion_descuento_pct: number | null
          promocion_id: string | null
          promocion_nombre: string | null
          prototipo_banos: number | null
          prototipo_codigo: string | null
          prototipo_id: string | null
          prototipo_nombre: string | null
          prototipo_recamaras: number | null
          prototipo_superficie_m2: number | null
          proyecto_codigo: string | null
          proyecto_id: string | null
          proyecto_nombre: string | null
          responsable_id: string | null
          siguiente_accion: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "construccion_lote_etapa_construccion_id_fkey"
            columns: ["construccion_etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas_construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "construccion_lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_estatus"
            referencedColumns: ["construccion_id"]
          },
          {
            foreignKeyName: "inventario_vivienda_construccion_lote_id_fkey"
            columns: ["construccion_lote_id"]
            isOneToOne: false
            referencedRelation: "v_obra_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_fase_inventario_id_fkey"
            columns: ["fase_inventario_id"]
            isOneToOne: false
            referencedRelation: "fases_inventario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_estatus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_promocion_id_fkey"
            columns: ["promocion_id"]
            isOneToOne: false
            referencedRelation: "promociones_ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_prototipo_id_fkey"
            columns: ["prototipo_id"]
            isOneToOne: false
            referencedRelation: "prototipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_vivienda_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_lotes_estatus: {
        Row: {
          construccion_avance_pct: number | null
          construccion_id: string | null
          construccion_prototipo_id: string | null
          contratista_principal_id: string | null
          costo_acumulado: number | null
          created_at: string | null
          decision_actual: string | null
          empresa_id: string | null
          estatus_unificado: string | null
          etapa: string | null
          etapa_construccion_id: string | null
          fase_inventario_id: string | null
          fecha_estimada_entrega: string | null
          fecha_inicio_obra: string | null
          fecha_real_entrega: string | null
          fecha_ultima_revision: string | null
          fondo_m: number | null
          frente_m: number | null
          id: string | null
          manzana: string | null
          numero_lote: string | null
          precio_lote: number | null
          presupuesto_asignado: number | null
          prioridad: string | null
          prototipo_asignado_id: string | null
          prototipo_asignado_nombre: string | null
          proyecto_id: string | null
          responsable_id: string | null
          siguiente_accion: string | null
          superficie_m2: number | null
          tipo_uso: string | null
          updated_at: string | null
          urbanizacion_avance_pct: number | null
          urbanizacion_fases_completas: number | null
          urbanizacion_fases_count: number | null
          urbanizacion_fecha_inicio: string | null
          urbanizacion_fecha_terminacion: string | null
        }
        Relationships: [
          {
            foreignKeyName: "construccion_lote_etapa_construccion_id_fkey"
            columns: ["etapa_construccion_id"]
            isOneToOne: false
            referencedRelation: "etapas_construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construccion_lote_prototipo_id_fkey"
            columns: ["construccion_prototipo_id"]
            isOneToOne: false
            referencedRelation: "prototipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_construccion_lote_contratista_principal"
            columns: ["contratista_principal_id"]
            isOneToOne: false
            referencedRelation: "contratistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_fase_inventario_id_fkey"
            columns: ["fase_inventario_id"]
            isOneToOne: false
            referencedRelation: "fases_inventario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_prototipo_asignado_id_fkey"
            columns: ["prototipo_asignado_id"]
            isOneToOne: false
            referencedRelation: "prototipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_obra_resumen: {
        Row: {
          avance_tareas_pct: number | null
          construccion_avance_pct: number | null
          contratista_principal_id: string | null
          contratista_principal_nombre: string | null
          contratos_activos: number | null
          costo_acumulado: number | null
          created_at: string | null
          empresa_id: string | null
          etapa_construccion_id: string | null
          fecha_estimada_entrega: string | null
          fecha_inicio_obra: string | null
          fecha_real_entrega: string | null
          id: string | null
          lote_id: string | null
          presupuesto_asignado: number | null
          prototipo_id: string | null
          tareas_completadas: number | null
          total_tareas: number | null
          ultima_bitacora_fecha: string | null
          ultima_inspeccion_fecha: string | null
          ultima_inspeccion_resultado: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "construccion_lote_etapa_construccion_id_fkey"
            columns: ["etapa_construccion_id"]
            isOneToOne: false
            referencedRelation: "etapas_construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construccion_lote_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construccion_lote_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_estatus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construccion_lote_prototipo_id_fkey"
            columns: ["prototipo_id"]
            isOneToOne: false
            referencedRelation: "prototipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_construccion_lote_contratista_principal"
            columns: ["contratista_principal_id"]
            isOneToOne: false
            referencedRelation: "contratistas"
            referencedColumns: ["id"]
          },
        ]
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
          corte_id: string
          empresa_id: string
          id: string
          mime_type: string | null
          monto_reportado: number | null
          nombre_original: string | null
          storage_path: string
          tamano_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
          uploaded_by_nombre: string | null
        }
        Insert: {
          afiliacion?: string | null
          corte_id: string
          empresa_id: string
          id?: string
          mime_type?: string | null
          monto_reportado?: number | null
          nombre_original?: string | null
          storage_path: string
          tamano_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_nombre?: string | null
        }
        Update: {
          afiliacion?: string | null
          corte_id?: string
          empresa_id?: string
          id?: string
          mime_type?: string | null
          monto_reportado?: number | null
          nombre_original?: string | null
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
          motivo_baja: string | null
          notas: string | null
          nss: string | null
          numero_empleado: string | null
          periodo_prueba_dias: number | null
          periodo_prueba_numero: number | null
          persona_id: string
          puesto_id: string | null
          reemplaza_a: string | null
          telefono_empresa: string | null
          tipo_contrato: string | null
          updated_at: string | null
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
          motivo_baja?: string | null
          notas?: string | null
          nss?: string | null
          numero_empleado?: string | null
          periodo_prueba_dias?: number | null
          periodo_prueba_numero?: number | null
          persona_id: string
          puesto_id?: string | null
          reemplaza_a?: string | null
          telefono_empresa?: string | null
          tipo_contrato?: string | null
          updated_at?: string | null
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
          motivo_baja?: string | null
          notas?: string | null
          nss?: string | null
          numero_empleado?: string | null
          periodo_prueba_dias?: number | null
          periodo_prueba_numero?: number | null
          persona_id?: string
          puesto_id?: string | null
          reemplaza_a?: string | null
          telefono_empresa?: string | null
          tipo_contrato?: string | null
          updated_at?: string | null
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
            foreignKeyName: "empleados_puesto_id_fkey"
            columns: ["puesto_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["puesto_id"]
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
          codigo: string | null
          condiciones_pago: string | null
          created_at: string
          deleted_at: string | null
          direccion_entrega: string | null
          empresa_id: string
          estado_id: string | null
          fecha_entrega: string | null
          id: string
          iva: number | null
          moneda_id: string | null
          proveedor_id: string | null
          requisicion_id: string | null
          subtotal: number | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          autorizada_at?: string | null
          codigo?: string | null
          condiciones_pago?: string | null
          created_at?: string
          deleted_at?: string | null
          direccion_entrega?: string | null
          empresa_id: string
          estado_id?: string | null
          fecha_entrega?: string | null
          id?: string
          iva?: number | null
          moneda_id?: string | null
          proveedor_id?: string | null
          requisicion_id?: string | null
          subtotal?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          autorizada_at?: string | null
          codigo?: string | null
          condiciones_pago?: string | null
          created_at?: string
          deleted_at?: string | null
          direccion_entrega?: string | null
          empresa_id?: string
          estado_id?: string | null
          fecha_entrega?: string | null
          id?: string
          iva?: number | null
          moneda_id?: string | null
          proveedor_id?: string | null
          requisicion_id?: string | null
          subtotal?: number | null
          total?: number | null
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
          created_at: string
          descripcion: string | null
          descuento: number | null
          empresa_id: string
          id: string
          orden_compra_id: string
          precio_unitario: number | null
          producto_id: string | null
          subtotal: number | null
          unidad: string | null
        }
        Insert: {
          cantidad?: number
          created_at?: string
          descripcion?: string | null
          descuento?: number | null
          empresa_id: string
          id?: string
          orden_compra_id: string
          precio_unitario?: number | null
          producto_id?: string | null
          subtotal?: number | null
          unidad?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string
          descripcion?: string | null
          descuento?: number | null
          empresa_id?: string
          id?: string
          orden_compra_id?: string
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
          updated_at?: string | null
        }
        Relationships: []
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
          {
            foreignKeyName: "puestos_reporta_a_fkey"
            columns: ["reporta_a"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["puesto_id"]
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
          metrics_count: number | null
          payload_size_bytes: number | null
          received_at: string | null
          source_ip: string | null
          status: string | null
          workouts_count: number | null
        }
        Insert: {
          id?: number
          metrics_count?: number | null
          payload_size_bytes?: number | null
          received_at?: string | null
          source_ip?: string | null
          status?: string | null
          workouts_count?: number | null
        }
        Update: {
          id?: number
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
          metrics_count: number | null
          payload_size_bytes: number | null
          received_at: string | null
          source_ip: string | null
          status: string | null
          workouts_count: number | null
        }
        Insert: {
          id?: number | null
          metrics_count?: number | null
          payload_size_bytes?: number | null
          received_at?: string | null
          source_ip?: string | null
          status?: string | null
          workouts_count?: number | null
        }
        Update: {
          id?: number | null
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
    }
    Functions: {
      check_duplicates: { Args: { p_order_id: string }; Returns: number }
      compute_content_hash: {
        Args: { p_products: Json; p_table_name: string; p_total_amount: number }
        Returns: string
      }
      fn_inventario_al_corte: {
        Args: { p_fecha: string }
        Returns: {
          bajo_minimo: boolean
          categoria: string
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
