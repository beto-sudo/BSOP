export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  core: {
    Tables: {
      ai_config: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          modelo: string
          nota: string | null
          uso_id: string
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          modelo: string
          nota?: string | null
          uso_id: string
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          modelo?: string
          nota?: string | null
          uso_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_config_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_config_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "v_usuarios_directorio"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_invocaciones: {
        Row: {
          costo_estimado_usd: number
          created_at: string
          duracion_ms: number | null
          empresa: string | null
          error: string | null
          exito: boolean
          id: string
          modelo: string
          proveedor: string
          tokens_in: number
          tokens_out: number
          uso_id: string
        }
        Insert: {
          costo_estimado_usd?: number
          created_at?: string
          duracion_ms?: number | null
          empresa?: string | null
          error?: string | null
          exito?: boolean
          id?: string
          modelo: string
          proveedor: string
          tokens_in?: number
          tokens_out?: number
          uso_id: string
        }
        Update: {
          costo_estimado_usd?: number
          created_at?: string
          duracion_ms?: number | null
          empresa?: string | null
          error?: string | null
          exito?: boolean
          id?: string
          modelo?: string
          proveedor?: string
          tokens_in?: number
          tokens_out?: number
          uso_id?: string
        }
        Relationships: []
      }
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
          {
            foreignKeyName: "audit_log_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_usuarios_directorio"
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
            foreignKeyName: "empresa_documentos_asignado_por_fkey"
            columns: ["asignado_por"]
            isOneToOne: false
            referencedRelation: "v_usuarios_directorio"
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
      empresa_socios: {
        Row: {
          activo: boolean
          created_at: string
          empresa_id: string
          familia: string | null
          id: string
          nombre: string
          notas: string | null
          orden: number
          porcentaje: number
          socio_empresa_id: string | null
          socio_persona_id: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_id: string
          familia?: string | null
          id?: string
          nombre: string
          notas?: string | null
          orden?: number
          porcentaje: number
          socio_empresa_id?: string | null
          socio_persona_id?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_id?: string
          familia?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          orden?: number
          porcentaje?: number
          socio_empresa_id?: string | null
          socio_persona_id?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresa_socios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresa_socios_socio_empresa_id_fkey"
            columns: ["socio_empresa_id"]
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
          compras_emision_requiere_direccion: boolean
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
          email_contacto: string | null
          email_fiscal: string | null
          escritura_constitutiva: Json | null
          escritura_poder: Json | null
          estatus_sat: string | null
          favicon_url: string | null
          fecha_inicio_operaciones: string | null
          firmante_poliza: string | null
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
          registro_infonavit: string | null
          registro_patronal_imss: string | null
          representante_legal: string | null
          rfc: string | null
          rpi_imss: string | null
          slug: string
          solo_fiscal: boolean
          telefono: string | null
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
          compras_emision_requiere_direccion?: boolean
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
          email_contacto?: string | null
          email_fiscal?: string | null
          escritura_constitutiva?: Json | null
          escritura_poder?: Json | null
          estatus_sat?: string | null
          favicon_url?: string | null
          fecha_inicio_operaciones?: string | null
          firmante_poliza?: string | null
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
          registro_infonavit?: string | null
          registro_patronal_imss?: string | null
          representante_legal?: string | null
          rfc?: string | null
          rpi_imss?: string | null
          slug: string
          solo_fiscal?: boolean
          telefono?: string | null
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
          compras_emision_requiere_direccion?: boolean
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
          email_contacto?: string | null
          email_fiscal?: string | null
          escritura_constitutiva?: Json | null
          escritura_poder?: Json | null
          estatus_sat?: string | null
          favicon_url?: string | null
          fecha_inicio_operaciones?: string | null
          firmante_poliza?: string | null
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
          registro_infonavit?: string | null
          registro_patronal_imss?: string | null
          representante_legal?: string | null
          rfc?: string | null
          rpi_imss?: string | null
          slug?: string
          solo_fiscal?: boolean
          telefono?: string | null
          tipo_contribuyente?: string
          uso_cfdi_default?: string | null
          watermark_url?: string | null
        }
        Relationships: []
      }
      gobierno_acta_acuerdos: {
        Row: {
          acta_id: string
          empresa_id: string
          id: string
          notas: string | null
          orden: number
          punto: string
          resultado: string
        }
        Insert: {
          acta_id: string
          empresa_id: string
          id?: string
          notas?: string | null
          orden?: number
          punto: string
          resultado?: string
        }
        Update: {
          acta_id?: string
          empresa_id?: string
          id?: string
          notas?: string | null
          orden?: number
          punto?: string
          resultado?: string
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_acta_acuerdos_acta_id_fkey"
            columns: ["acta_id"]
            isOneToOne: false
            referencedRelation: "gobierno_actas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_acta_acuerdos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_acta_asistentes: {
        Row: {
          acta_id: string
          empresa_id: string
          id: string
          porcentaje: number | null
          presente: boolean
          representado_por: string | null
          socio_id: string | null
        }
        Insert: {
          acta_id: string
          empresa_id: string
          id?: string
          porcentaje?: number | null
          presente?: boolean
          representado_por?: string | null
          socio_id?: string | null
        }
        Update: {
          acta_id?: string
          empresa_id?: string
          id?: string
          porcentaje?: number | null
          presente?: boolean
          representado_por?: string | null
          socio_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_acta_asistentes_acta_id_fkey"
            columns: ["acta_id"]
            isOneToOne: false
            referencedRelation: "gobierno_actas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_acta_asistentes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_acta_asistentes_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "empresa_socios"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_acta_votos: {
        Row: {
          acuerdo_id: string
          empresa_id: string
          id: string
          representado_por: string | null
          sentido: string
          socio_id: string | null
        }
        Insert: {
          acuerdo_id: string
          empresa_id: string
          id?: string
          representado_por?: string | null
          sentido: string
          socio_id?: string | null
        }
        Update: {
          acuerdo_id?: string
          empresa_id?: string
          id?: string
          representado_por?: string | null
          sentido?: string
          socio_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_acta_votos_acuerdo_id_fkey"
            columns: ["acuerdo_id"]
            isOneToOne: false
            referencedRelation: "gobierno_acta_acuerdos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_acta_votos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_acta_votos_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "empresa_socios"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_actas: {
        Row: {
          asunto: string | null
          created_at: string
          created_by: string | null
          documento_id: string | null
          empresa_id: string
          estado: string
          fecha: string
          fecha_protocolizacion: string | null
          folio: string | null
          id: string
          lugar: string | null
          notario: string | null
          notas: string | null
          numero_escritura: string | null
          orden_dia: Json | null
          protocolizada: boolean
          quorum_pct: number | null
          registro_publico: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          asunto?: string | null
          created_at?: string
          created_by?: string | null
          documento_id?: string | null
          empresa_id: string
          estado?: string
          fecha: string
          fecha_protocolizacion?: string | null
          folio?: string | null
          id?: string
          lugar?: string | null
          notario?: string | null
          notas?: string | null
          numero_escritura?: string | null
          orden_dia?: Json | null
          protocolizada?: boolean
          quorum_pct?: number | null
          registro_publico?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          asunto?: string | null
          created_at?: string
          created_by?: string | null
          documento_id?: string | null
          empresa_id?: string
          estado?: string
          fecha?: string
          fecha_protocolizacion?: string | null
          folio?: string | null
          id?: string
          lugar?: string | null
          notario?: string | null
          notas?: string | null
          numero_escritura?: string | null
          orden_dia?: Json | null
          protocolizada?: boolean
          quorum_pct?: number | null
          registro_publico?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_actas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_actas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_directorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_actas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_config: {
        Row: {
          consejo_max_miembros: number | null
          consejo_sesiones_por_anio: number | null
          dividendo_anual_monto: number | null
          dividendo_moneda: string
          empresa_id: string
          mandato_meses_default: number | null
          notas: string | null
          reglamento_documento_id: string | null
          reglamento_fecha: string | null
          tanto_aplica: boolean
          tanto_orden_prelacion: string | null
          tanto_plazo_dias: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          consejo_max_miembros?: number | null
          consejo_sesiones_por_anio?: number | null
          dividendo_anual_monto?: number | null
          dividendo_moneda?: string
          empresa_id: string
          mandato_meses_default?: number | null
          notas?: string | null
          reglamento_documento_id?: string | null
          reglamento_fecha?: string | null
          tanto_aplica?: boolean
          tanto_orden_prelacion?: string | null
          tanto_plazo_dias?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          consejo_max_miembros?: number | null
          consejo_sesiones_por_anio?: number | null
          dividendo_anual_monto?: number | null
          dividendo_moneda?: string
          empresa_id?: string
          mandato_meses_default?: number | null
          notas?: string | null
          reglamento_documento_id?: string | null
          reglamento_fecha?: string | null
          tanto_aplica?: boolean
          tanto_orden_prelacion?: string | null
          tanto_plazo_dias?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_directorio"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_consejeros: {
        Row: {
          activo: boolean
          cargo: string
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          notas: string | null
          organo: string
          ostenta_voto: boolean
          periodo_fin: string | null
          periodo_inicio: string | null
          persona_id: string | null
          socio_id: string | null
          updated_at: string | null
          vitalicio: boolean
        }
        Insert: {
          activo?: boolean
          cargo?: string
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          notas?: string | null
          organo?: string
          ostenta_voto?: boolean
          periodo_fin?: string | null
          periodo_inicio?: string | null
          persona_id?: string | null
          socio_id?: string | null
          updated_at?: string | null
          vitalicio?: boolean
        }
        Update: {
          activo?: boolean
          cargo?: string
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          notas?: string | null
          organo?: string
          ostenta_voto?: boolean
          periodo_fin?: string | null
          periodo_inicio?: string | null
          persona_id?: string | null
          socio_id?: string | null
          updated_at?: string | null
          vitalicio?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_consejeros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gobierno_consejeros_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "empresa_socios"
            referencedColumns: ["id"]
          },
        ]
      }
      gobierno_mayorias: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          notas: string | null
          orden: number
          organo: string
          quorum_pct: number | null
          tipo_decision: string
          umbral_pct: number
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          notas?: string | null
          orden?: number
          organo: string
          quorum_pct?: number | null
          tipo_decision: string
          umbral_pct: number
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          notas?: string | null
          orden?: number
          organo?: string
          quorum_pct?: number | null
          tipo_decision?: string
          umbral_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "gobierno_mayorias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
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
      notification_definitions: {
        Row: {
          activo: boolean
          created_at: string
          descripcion: string | null
          empresa_id: string | null
          from_email: string
          from_name: string | null
          id: string
          nombre: string
          recipients_extra: Json
          reply_to: string | null
          slug: string
          subject_template: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          empresa_id?: string | null
          from_email: string
          from_name?: string | null
          id?: string
          nombre: string
          recipients_extra?: Json
          reply_to?: string | null
          slug: string
          subject_template: string
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          empresa_id?: string | null
          from_email?: string
          from_name?: string | null
          id?: string
          nombre?: string
          recipients_extra?: Json
          reply_to?: string | null
          slug?: string
          subject_template?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_definitions_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_definitions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_definitions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_directorio"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          context: Json
          definition_id: string | null
          empresa_id: string | null
          error_message: string | null
          id: string
          recipients: Json
          resend_id: string | null
          sent_at: string
          status: string
          subject: string | null
          triggered_by_user_id: string | null
        }
        Insert: {
          context?: Json
          definition_id?: string | null
          empresa_id?: string | null
          error_message?: string | null
          id?: string
          recipients: Json
          resend_id?: string | null
          sent_at?: string
          status: string
          subject?: string | null
          triggered_by_user_id?: string | null
        }
        Update: {
          context?: Json
          definition_id?: string | null
          empresa_id?: string | null
          error_message?: string | null
          id?: string
          recipients?: Json
          resend_id?: string | null
          sent_at?: string
          status?: string
          subject?: string | null
          triggered_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "notification_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_triggered_by_user_id_fkey"
            columns: ["triggered_by_user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_triggered_by_user_id_fkey"
            columns: ["triggered_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_usuarios_directorio"
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
          {
            foreignKeyName: "permisos_usuario_excepcion_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permisos_usuario_excepcion_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_usuarios_directorio"
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
      rol_plantilla_items: {
        Row: {
          acceso_escritura: boolean
          acceso_lectura: boolean
          modulo_id: string
          plantilla_id: string
        }
        Insert: {
          acceso_escritura?: boolean
          acceso_lectura?: boolean
          modulo_id: string
          plantilla_id: string
        }
        Update: {
          acceso_escritura?: boolean
          acceso_lectura?: boolean
          modulo_id?: string
          plantilla_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rol_plantilla_items_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_plantilla_items_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "rol_plantillas"
            referencedColumns: ["id"]
          },
        ]
      }
      rol_plantillas: {
        Row: {
          created_at: string
          created_by: string | null
          descripcion: string | null
          empresa_id: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          empresa_id: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rol_plantillas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_plantillas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_directorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_plantillas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
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
      sidebar_oculto: {
        Row: {
          nav_slug: string
          oculto_at: string
          oculto_por: string | null
        }
        Insert: {
          nav_slug: string
          oculto_at?: string
          oculto_por?: string | null
        }
        Update: {
          nav_slug?: string
          oculto_at?: string
          oculto_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sidebar_oculto_oculto_por_fkey"
            columns: ["oculto_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sidebar_oculto_oculto_por_fkey"
            columns: ["oculto_por"]
            isOneToOne: false
            referencedRelation: "v_usuarios_directorio"
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
          last_name: string | null
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
          last_name?: string | null
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
          last_name?: string | null
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
          {
            foreignKeyName: "usuarios_empresas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_empresas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_usuarios_directorio"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_usuarios_directorio: {
        Row: {
          activo: boolean | null
          id: string | null
          nombre: string | null
        }
        Insert: {
          activo?: boolean | null
          id?: string | null
          nombre?: never
        }
        Update: {
          activo?: boolean | null
          id?: string | null
          nombre?: never
        }
        Relationships: []
      }
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
      fn_user_has_role: {
        Args: { p_empresa_id: string; p_role_name: string }
        Returns: boolean
      }
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
      activo_bitacora: {
        Row: {
          activo_id: string
          creado_por: string | null
          created_at: string
          empresa_id: string
          id: string
          texto: string
          tipo: string
        }
        Insert: {
          activo_id: string
          creado_por?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          texto: string
          tipo?: string
        }
        Update: {
          activo_id?: string
          creado_por?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          texto?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "activo_bitacora_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_cara: {
        Row: {
          activo_id: string
          alto_m: number | null
          ancho_m: number | null
          created_at: string
          empresa_id: string
          iluminado: boolean | null
          notas: string | null
          orientacion: string | null
          scoring: number | null
          trafico_estimado_diario: number | null
          updated_at: string
          vialidad: string | null
        }
        Insert: {
          activo_id: string
          alto_m?: number | null
          ancho_m?: number | null
          created_at?: string
          empresa_id: string
          iluminado?: boolean | null
          notas?: string | null
          orientacion?: string | null
          scoring?: number | null
          trafico_estimado_diario?: number | null
          updated_at?: string
          vialidad?: string | null
        }
        Update: {
          activo_id?: string
          alto_m?: number | null
          ancho_m?: number | null
          created_at?: string
          empresa_id?: string
          iluminado?: boolean | null
          notas?: string | null
          orientacion?: string | null
          scoring?: number | null
          trafico_estimado_diario?: number | null
          updated_at?: string
          vialidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activo_cara_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: true
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_casa: {
        Row: {
          activo_id: string
          ano_construccion: number | null
          banos: number | null
          calle: string | null
          cochera_autos: number | null
          created_at: string
          empresa_id: string
          es_esquina: boolean | null
          estado_conservacion: string | null
          m2_construccion: number | null
          m2_terreno: number | null
          niveles: number | null
          notas: string | null
          numero_oficial: string | null
          recamaras: number | null
          tiene_frente_verde: boolean | null
          updated_at: string
        }
        Insert: {
          activo_id: string
          ano_construccion?: number | null
          banos?: number | null
          calle?: string | null
          cochera_autos?: number | null
          created_at?: string
          empresa_id: string
          es_esquina?: boolean | null
          estado_conservacion?: string | null
          m2_construccion?: number | null
          m2_terreno?: number | null
          niveles?: number | null
          notas?: string | null
          numero_oficial?: string | null
          recamaras?: number | null
          tiene_frente_verde?: boolean | null
          updated_at?: string
        }
        Update: {
          activo_id?: string
          ano_construccion?: number | null
          banos?: number | null
          calle?: string | null
          cochera_autos?: number | null
          created_at?: string
          empresa_id?: string
          es_esquina?: boolean | null
          estado_conservacion?: string | null
          m2_construccion?: number | null
          m2_terreno?: number | null
          niveles?: number | null
          notas?: string | null
          numero_oficial?: string | null
          recamaras?: number | null
          tiene_frente_verde?: boolean | null
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
      activo_documentos: {
        Row: {
          activo_id: string
          created_at: string
          deleted_at: string | null
          documento_id: string
          empresa_id: string
          es_principal: boolean
          id: string
          notas: string | null
          rol: string
          updated_at: string
        }
        Insert: {
          activo_id: string
          created_at?: string
          deleted_at?: string | null
          documento_id: string
          empresa_id: string
          es_principal?: boolean
          id?: string
          notas?: string | null
          rol?: string
          updated_at?: string
        }
        Update: {
          activo_id?: string
          created_at?: string
          deleted_at?: string | null
          documento_id?: string
          empresa_id?: string
          es_principal?: boolean
          id?: string
          notas?: string | null
          rol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activo_documentos_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
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
          caras_detalle: Json
          contrato_vigente_hasta: string | null
          created_at: string
          dueno_terreno: string | null
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
          caras_detalle?: Json
          contrato_vigente_hasta?: string | null
          created_at?: string
          dueno_terreno?: string | null
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
          caras_detalle?: Json
          contrato_vigente_hasta?: string | null
          created_at?: string
          dueno_terreno?: string | null
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
          calle: string | null
          condicion: string | null
          created_at: string
          empresa_id: string
          es_esquina: boolean | null
          fondo_m: number | null
          frente_m: number | null
          manzana: string | null
          notas: string | null
          numero_lote: string | null
          numero_oficial: string | null
          tiene_frente_verde: boolean | null
          updated_at: string
        }
        Insert: {
          activo_id: string
          calle?: string | null
          condicion?: string | null
          created_at?: string
          empresa_id: string
          es_esquina?: boolean | null
          fondo_m?: number | null
          frente_m?: number | null
          manzana?: string | null
          notas?: string | null
          numero_lote?: string | null
          numero_oficial?: string | null
          tiene_frente_verde?: boolean | null
          updated_at?: string
        }
        Update: {
          activo_id?: string
          calle?: string | null
          condicion?: string | null
          created_at?: string
          empresa_id?: string
          es_esquina?: boolean | null
          fondo_m?: number | null
          frente_m?: number | null
          manzana?: string | null
          notas?: string | null
          numero_lote?: string | null
          numero_oficial?: string | null
          tiene_frente_verde?: boolean | null
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
      activo_movimiento_partes: {
        Row: {
          activo_id: string
          empresa_id: string
          id: string
          movimiento_id: string
          rol: string
        }
        Insert: {
          activo_id: string
          empresa_id: string
          id?: string
          movimiento_id: string
          rol: string
        }
        Update: {
          activo_id?: string
          empresa_id?: string
          id?: string
          movimiento_id?: string
          rol?: string
        }
        Relationships: [
          {
            foreignKeyName: "activo_movimiento_partes_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activo_movimiento_partes_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "activo_movimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      activo_movimientos: {
        Row: {
          creado_por: string | null
          created_at: string
          documento_id: string | null
          empresa_id: string
          fecha: string
          id: string
          notas: string | null
          superficie_origen_m2: number | null
          superficie_resultante_m2: number | null
          tipo: string
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          documento_id?: string | null
          empresa_id: string
          fecha: string
          id?: string
          notas?: string | null
          superficie_origen_m2?: number | null
          superficie_resultante_m2?: number | null
          tipo: string
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          documento_id?: string | null
          empresa_id?: string
          fecha?: string
          id?: string
          notas?: string | null
          superficie_origen_m2?: number | null
          superficie_resultante_m2?: number | null
          tipo?: string
        }
        Relationships: []
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
          destino_id: string | null
          direccion_referencia: string | null
          documentos: Json
          empresa_id: string
          estado: string
          estado_geo: string | null
          etiqueta: string | null
          id: string
          latitud: number | null
          longitud: number | null
          modalidad: string | null
          municipio: string | null
          nombre: string
          notas: string | null
          numero_escritura: string | null
          situacion_legal: string | null
          tipo: string
          updated_at: string
          valor_estimado: number | null
          zona: string | null
        }
        Insert: {
          activo_padre_id?: string | null
          area_m2?: number | null
          clave_catastral?: string | null
          clave_interna?: string | null
          created_at?: string
          deleted_at?: string | null
          destino_id?: string | null
          direccion_referencia?: string | null
          documentos?: Json
          empresa_id: string
          estado?: string
          estado_geo?: string | null
          etiqueta?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          modalidad?: string | null
          municipio?: string | null
          nombre: string
          notas?: string | null
          numero_escritura?: string | null
          situacion_legal?: string | null
          tipo: string
          updated_at?: string
          valor_estimado?: number | null
          zona?: string | null
        }
        Update: {
          activo_padre_id?: string | null
          area_m2?: number | null
          clave_catastral?: string | null
          clave_interna?: string | null
          created_at?: string
          deleted_at?: string | null
          destino_id?: string | null
          direccion_referencia?: string | null
          documentos?: Json
          empresa_id?: string
          estado?: string
          estado_geo?: string | null
          etiqueta?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          modalidad?: string | null
          municipio?: string | null
          nombre?: string
          notas?: string | null
          numero_escritura?: string | null
          situacion_legal?: string | null
          tipo?: string
          updated_at?: string
          valor_estimado?: number | null
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activos_activo_padre_id_fkey"
            columns: ["activo_padre_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activos_destino_id_fkey"
            columns: ["destino_id"]
            isOneToOne: false
            referencedRelation: "portafolio_destinos"
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
          costo_materiales: number | null
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
          costo_materiales?: number | null
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
          costo_materiales?: number | null
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
            foreignKeyName: "construccion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_prototipo"
            referencedColumns: ["prototipo_id"]
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
            foreignKeyName: "construccion_tareas_terminadas_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "v_ac_obras_por_recibir"
            referencedColumns: ["construccion_id"]
          },
          {
            foreignKeyName: "construccion_tareas_terminadas_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_pendientes_de_pago"
            referencedColumns: ["construccion_id"]
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
            foreignKeyName: "contrato_lotes_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "v_ac_obras_por_recibir"
            referencedColumns: ["construccion_id"]
          },
          {
            foreignKeyName: "contrato_lotes_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_pendientes_de_pago"
            referencedColumns: ["construccion_id"]
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
          anticipo_pct: number
          cancelada_at: string | null
          cancelada_por: string | null
          coda_row_id: string | null
          codigo: string
          contratista_id: string
          cotizacion_id: string | null
          creado_por: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          es_mano_obra: boolean
          fecha_contrato: string
          fecha_fin: string | null
          fecha_inicio: string | null
          fianza_pct: number | null
          fianzas_url: string | null
          forma_pago: string | null
          id: string
          iva_tasa: number | null
          modalidad_precio: string | null
          motivo_cancelacion: string | null
          notas: string | null
          objeto: string | null
          orden_compra_id: string | null
          partida_id: string | null
          periodicidad_estimaciones_dias: number | null
          personal_a_disposicion: boolean
          proyecto_id: string | null
          repse_override_at: string | null
          repse_override_motivo: string | null
          repse_override_por: string | null
          retencion_fiscal_isr_pct: number
          retencion_fiscal_iva_pct: number
          retencion_pct: number
          tipo: string
          updated_at: string
          valor_iva: number | null
          valor_subtotal: number | null
          valor_total: number
        }
        Insert: {
          anticipo_pct?: number
          cancelada_at?: string | null
          cancelada_por?: string | null
          coda_row_id?: string | null
          codigo: string
          contratista_id: string
          cotizacion_id?: string | null
          creado_por?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          es_mano_obra?: boolean
          fecha_contrato: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fianza_pct?: number | null
          fianzas_url?: string | null
          forma_pago?: string | null
          id?: string
          iva_tasa?: number | null
          modalidad_precio?: string | null
          motivo_cancelacion?: string | null
          notas?: string | null
          objeto?: string | null
          orden_compra_id?: string | null
          partida_id?: string | null
          periodicidad_estimaciones_dias?: number | null
          personal_a_disposicion?: boolean
          proyecto_id?: string | null
          repse_override_at?: string | null
          repse_override_motivo?: string | null
          repse_override_por?: string | null
          retencion_fiscal_isr_pct?: number
          retencion_fiscal_iva_pct?: number
          retencion_pct?: number
          tipo?: string
          updated_at?: string
          valor_iva?: number | null
          valor_subtotal?: number | null
          valor_total?: number
        }
        Update: {
          anticipo_pct?: number
          cancelada_at?: string | null
          cancelada_por?: string | null
          coda_row_id?: string | null
          codigo?: string
          contratista_id?: string
          cotizacion_id?: string | null
          creado_por?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          es_mano_obra?: boolean
          fecha_contrato?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fianza_pct?: number | null
          fianzas_url?: string | null
          forma_pago?: string | null
          id?: string
          iva_tasa?: number | null
          modalidad_precio?: string | null
          motivo_cancelacion?: string | null
          notas?: string | null
          objeto?: string | null
          orden_compra_id?: string | null
          partida_id?: string | null
          periodicidad_estimaciones_dias?: number | null
          personal_a_disposicion?: boolean
          proyecto_id?: string | null
          repse_override_at?: string | null
          repse_override_motivo?: string | null
          repse_override_por?: string | null
          retencion_fiscal_isr_pct?: number
          retencion_fiscal_iva_pct?: number
          retencion_pct?: number
          tipo?: string
          updated_at?: string
          valor_iva?: number | null
          valor_subtotal?: number | null
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
          {
            foreignKeyName: "contratos_construccion_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "contratos_construccion_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "contratos_construccion_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_prediales: {
        Row: {
          activo_id: string | null
          clave_catastral: string
          created_at: string
          deleted_at: string | null
          empresa_id: string
          estatus: string
          folio: string | null
          id: string
          municipio: string | null
          notas: string | null
          superficie_fiscal_m2: number | null
          updated_at: string
        }
        Insert: {
          activo_id?: string | null
          clave_catastral: string
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          estatus?: string
          folio?: string | null
          id?: string
          municipio?: string | null
          notas?: string | null
          superficie_fiscal_m2?: number | null
          updated_at?: string
        }
        Update: {
          activo_id?: string | null
          clave_catastral?: string
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          estatus?: string
          folio?: string | null
          id?: string
          municipio?: string | null
          notas?: string | null
          superficie_fiscal_m2?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_prediales_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "activos"
            referencedColumns: ["id"]
          },
        ]
      }
      descuento_motivos: {
        Row: {
          activa: boolean
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      estimacion_tareas: {
        Row: {
          construccion_id: string
          created_at: string
          empresa_id: string
          estimacion_id: string
          id: string
          monto_calculado: number
          tarea_terminada_id: string
        }
        Insert: {
          construccion_id: string
          created_at?: string
          empresa_id: string
          estimacion_id: string
          id?: string
          monto_calculado: number
          tarea_terminada_id: string
        }
        Update: {
          construccion_id?: string
          created_at?: string
          empresa_id?: string
          estimacion_id?: string
          id?: string
          monto_calculado?: number
          tarea_terminada_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimacion_tareas_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimacion_tareas_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "v_ac_obras_por_recibir"
            referencedColumns: ["construccion_id"]
          },
          {
            foreignKeyName: "estimacion_tareas_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_pendientes_de_pago"
            referencedColumns: ["construccion_id"]
          },
          {
            foreignKeyName: "estimacion_tareas_estimacion_id_fkey"
            columns: ["estimacion_id"]
            isOneToOne: false
            referencedRelation: "estimaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimacion_tareas_tarea_terminada_id_fkey"
            columns: ["tarea_terminada_id"]
            isOneToOne: true
            referencedRelation: "construccion_tareas_terminadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimacion_tareas_tarea_terminada_id_fkey"
            columns: ["tarea_terminada_id"]
            isOneToOne: true
            referencedRelation: "v_construccion_tareas_terminadas_con_mo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimacion_tareas_tarea_terminada_id_fkey"
            columns: ["tarea_terminada_id"]
            isOneToOne: true
            referencedRelation: "v_tareas_pendientes_de_pago"
            referencedColumns: ["tarea_terminada_id"]
          },
        ]
      }
      estimaciones: {
        Row: {
          aprobada_at: string | null
          aprobada_por_user_id: string | null
          codigo: string
          contratista_id: string
          created_at: string
          deleted_at: string | null
          empresa_id: string
          estado: string
          factura_fecha: string | null
          factura_folio: string | null
          factura_url: string | null
          fecha_cierre: string
          fecha_pago_programado: string
          id: string
          monto_bruto: number
          monto_neto: number
          notas: string | null
          pagada_at: string | null
          pagada_por_user_id: string | null
          referencia_pago: string | null
          retencion_monto: number
          retencion_pct: number
          updated_at: string
        }
        Insert: {
          aprobada_at?: string | null
          aprobada_por_user_id?: string | null
          codigo: string
          contratista_id: string
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          estado?: string
          factura_fecha?: string | null
          factura_folio?: string | null
          factura_url?: string | null
          fecha_cierre: string
          fecha_pago_programado: string
          id?: string
          monto_bruto?: number
          monto_neto?: number
          notas?: string | null
          pagada_at?: string | null
          pagada_por_user_id?: string | null
          referencia_pago?: string | null
          retencion_monto?: number
          retencion_pct?: number
          updated_at?: string
        }
        Update: {
          aprobada_at?: string | null
          aprobada_por_user_id?: string | null
          codigo?: string
          contratista_id?: string
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          estado?: string
          factura_fecha?: string | null
          factura_folio?: string | null
          factura_url?: string | null
          fecha_cierre?: string
          fecha_pago_programado?: string
          id?: string
          monto_bruto?: number
          monto_neto?: number
          notas?: string | null
          pagada_at?: string | null
          pagada_por_user_id?: string | null
          referencia_pago?: string | null
          retencion_monto?: number
          retencion_pct?: number
          updated_at?: string
        }
        Relationships: []
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
      fase_metas: {
        Row: {
          activa: boolean
          created_at: string
          editado_por: string | null
          empresa_id: string
          id: string
          meta_dias: number
          nota: string | null
          posicion: number
          updated_at: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          editado_por?: string | null
          empresa_id: string
          id?: string
          meta_dias: number
          nota?: string | null
          posicion: number
          updated_at?: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          editado_por?: string | null
          empresa_id?: string
          id?: string
          meta_dias?: number
          nota?: string | null
          posicion?: number
          updated_at?: string
        }
        Relationships: []
      }
      gastos_notariales_config: {
        Row: {
          activa: boolean
          anio: number
          apertura_cuota_fija: number
          apertura_umbral_cuota_fija: number
          categoria: string
          created_at: string
          deleted_at: string | null
          empresa_id: string
          id: string
          isai_pct: number
          muni_avaluo_previo: number
          muni_certificacion_planos: number
          muni_copias_fotostaticas: number
          muni_derechos: number
          muni_forma_isai: number
          muni_no_adeudo_simas: number
          muni_valuacion_catastral: number
          muni_valuacion_catastral_pct: number
          notas: string | null
          otros_avaluo: number
          otros_aviso_definitivo: number
          otros_cnpc: number
          otros_cnpr_por_derechohabiente: number
          otros_copia_certificada: number
          otros_forma_isai: number
          otros_kinegrama: number
          otros_plano: number
          rp_aviso_preventivo: number
          rp_clg: number
          updated_at: string
        }
        Insert: {
          activa?: boolean
          anio: number
          apertura_cuota_fija?: number
          apertura_umbral_cuota_fija?: number
          categoria: string
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          id?: string
          isai_pct?: number
          muni_avaluo_previo?: number
          muni_certificacion_planos?: number
          muni_copias_fotostaticas?: number
          muni_derechos?: number
          muni_forma_isai?: number
          muni_no_adeudo_simas?: number
          muni_valuacion_catastral?: number
          muni_valuacion_catastral_pct?: number
          notas?: string | null
          otros_avaluo?: number
          otros_aviso_definitivo?: number
          otros_cnpc?: number
          otros_cnpr_por_derechohabiente?: number
          otros_copia_certificada?: number
          otros_forma_isai?: number
          otros_kinegrama?: number
          otros_plano?: number
          rp_aviso_preventivo?: number
          rp_clg?: number
          updated_at?: string
        }
        Update: {
          activa?: boolean
          anio?: number
          apertura_cuota_fija?: number
          apertura_umbral_cuota_fija?: number
          categoria?: string
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          isai_pct?: number
          muni_avaluo_previo?: number
          muni_certificacion_planos?: number
          muni_copias_fotostaticas?: number
          muni_derechos?: number
          muni_forma_isai?: number
          muni_no_adeudo_simas?: number
          muni_valuacion_catastral?: number
          muni_valuacion_catastral_pct?: number
          notas?: string | null
          otros_avaluo?: number
          otros_aviso_definitivo?: number
          otros_cnpc?: number
          otros_cnpr_por_derechohabiente?: number
          otros_copia_certificada?: number
          otros_forma_isai?: number
          otros_kinegrama?: number
          otros_plano?: number
          rp_aviso_preventivo?: number
          rp_clg?: number
          updated_at?: string
        }
        Relationships: []
      }
      gastos_notariales_tabulador: {
        Row: {
          config_id: string
          empresa_id: string
          id: string
          limite_inferior: number
          limite_superior: number | null
          orden: number
          tipo: string
          valor_beneficio: number
          valor_particular: number
        }
        Insert: {
          config_id: string
          empresa_id: string
          id?: string
          limite_inferior: number
          limite_superior?: number | null
          orden: number
          tipo: string
          valor_beneficio: number
          valor_particular: number
        }
        Update: {
          config_id?: string
          empresa_id?: string
          id?: string
          limite_inferior?: number
          limite_superior?: number | null
          orden?: number
          tipo?: string
          valor_beneficio?: number
          valor_particular?: number
        }
        Relationships: [
          {
            foreignKeyName: "gastos_notariales_tabulador_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "gastos_notariales_config"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_snapshot: {
        Row: {
          casas_en_obra: number
          cobrado_hoy: number
          created_at: string
          cxc_abierto: number
          cxc_vencido: number
          empresa_id: string
          escrituras_hoy_monto: number
          escrituras_hoy_n: number
          fecha: string
          id: string
          liquidez_total: number
          updated_at: string
          ventas_hoy_monto: number
          ventas_hoy_n: number
        }
        Insert: {
          casas_en_obra?: number
          cobrado_hoy?: number
          created_at?: string
          cxc_abierto?: number
          cxc_vencido?: number
          empresa_id: string
          escrituras_hoy_monto?: number
          escrituras_hoy_n?: number
          fecha: string
          id?: string
          liquidez_total?: number
          updated_at?: string
          ventas_hoy_monto?: number
          ventas_hoy_n?: number
        }
        Update: {
          casas_en_obra?: number
          cobrado_hoy?: number
          created_at?: string
          cxc_abierto?: number
          cxc_vencido?: number
          empresa_id?: string
          escrituras_hoy_monto?: number
          escrituras_hoy_n?: number
          fecha?: string
          id?: string
          liquidez_total?: number
          updated_at?: string
          ventas_hoy_monto?: number
          ventas_hoy_n?: number
        }
        Relationships: []
      }
      obra_estimaciones: {
        Row: {
          amortizacion_aplicada: number
          autorizada_at: string | null
          autorizada_por: string | null
          cancelada_at: string | null
          cancelada_por: string | null
          contrato_id: string
          creado_por: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          es_anticipo: boolean
          es_finiquito: boolean
          estado: string
          etiqueta: string
          factura_ref: string | null
          fecha: string | null
          id: string
          iva: number | null
          iva_tasa: number | null
          monto_total: number
          motivo_cancelacion: string | null
          nota_pago: string | null
          orden: number
          pagada_at: string | null
          retencion: number
          source_ref: string | null
          subtotal: number | null
          tope_override_motivo: string | null
          updated_at: string
        }
        Insert: {
          amortizacion_aplicada?: number
          autorizada_at?: string | null
          autorizada_por?: string | null
          cancelada_at?: string | null
          cancelada_por?: string | null
          contrato_id: string
          creado_por?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          es_anticipo?: boolean
          es_finiquito?: boolean
          estado?: string
          etiqueta: string
          factura_ref?: string | null
          fecha?: string | null
          id?: string
          iva?: number | null
          iva_tasa?: number | null
          monto_total?: number
          motivo_cancelacion?: string | null
          nota_pago?: string | null
          orden?: number
          pagada_at?: string | null
          retencion?: number
          source_ref?: string | null
          subtotal?: number | null
          tope_override_motivo?: string | null
          updated_at?: string
        }
        Update: {
          amortizacion_aplicada?: number
          autorizada_at?: string | null
          autorizada_por?: string | null
          cancelada_at?: string | null
          cancelada_por?: string | null
          contrato_id?: string
          creado_por?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          es_anticipo?: boolean
          es_finiquito?: boolean
          estado?: string
          etiqueta?: string
          factura_ref?: string | null
          fecha?: string | null
          id?: string
          iva?: number | null
          iva_tasa?: number | null
          monto_total?: number
          motivo_cancelacion?: string | null
          nota_pago?: string | null
          orden?: number
          pagada_at?: string | null
          retencion?: number
          source_ref?: string | null
          subtotal?: number | null
          tope_override_motivo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "obra_estimaciones_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_construccion"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_presupuesto_deprecated: {
        Row: {
          concepto: string
          contrato_id: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          etapa: string | null
          factura_ref: string | null
          fecha_compromiso: string | null
          gasto_real_iva: number | null
          gasto_real_iva_tasa: number | null
          gasto_real_subtotal: number | null
          gasto_real_total: number | null
          id: string
          notas: string | null
          orden: number
          presupuesto_actualizado: number | null
          presupuesto_previo: number | null
          proveedor_persona_id: string | null
          proveedor_texto: string | null
          proyecto_id: string
          source_ref: string | null
          updated_at: string
        }
        Insert: {
          concepto: string
          contrato_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          etapa?: string | null
          factura_ref?: string | null
          fecha_compromiso?: string | null
          gasto_real_iva?: number | null
          gasto_real_iva_tasa?: number | null
          gasto_real_subtotal?: number | null
          gasto_real_total?: number | null
          id?: string
          notas?: string | null
          orden?: number
          presupuesto_actualizado?: number | null
          presupuesto_previo?: number | null
          proveedor_persona_id?: string | null
          proveedor_texto?: string | null
          proyecto_id: string
          source_ref?: string | null
          updated_at?: string
        }
        Update: {
          concepto?: string
          contrato_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          etapa?: string | null
          factura_ref?: string | null
          fecha_compromiso?: string | null
          gasto_real_iva?: number | null
          gasto_real_iva_tasa?: number | null
          gasto_real_subtotal?: number | null
          gasto_real_total?: number | null
          id?: string
          notas?: string | null
          orden?: number
          presupuesto_actualizado?: number | null
          presupuesto_previo?: number | null
          proveedor_persona_id?: string | null
          proveedor_texto?: string | null
          proyecto_id?: string
          source_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "obra_presupuesto_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obra_presupuesto_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obra_presupuesto_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "obra_presupuesto_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "obra_presupuesto_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
        ]
      }
      plantilla_proyecto_tareas: {
        Row: {
          activa: boolean
          aplicacion: string
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          duracion_dias_habiles: number
          empresa_id: string | null
          entidad_responsable: string
          formato_archivo: string | null
          id: string
          nombre: string
          obligatoriedad: string
          orden_default: number
          requiere_archivo: boolean
          se_entrega_a: string | null
          subtipo: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          aplicacion: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          duracion_dias_habiles: number
          empresa_id?: string | null
          entidad_responsable: string
          formato_archivo?: string | null
          id?: string
          nombre: string
          obligatoriedad: string
          orden_default?: number
          requiere_archivo?: boolean
          se_entrega_a?: string | null
          subtipo?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          aplicacion?: string
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          duracion_dias_habiles?: number
          empresa_id?: string | null
          entidad_responsable?: string
          formato_archivo?: string | null
          id?: string
          nombre?: string
          obligatoriedad?: string
          orden_default?: number
          requiere_archivo?: boolean
          se_entrega_a?: string | null
          subtipo?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      plantilla_proyecto_tareas_dependencias: {
        Row: {
          created_at: string
          depende_de_plantilla_tarea_id: string
          id: string
          plantilla_tarea_id: string
        }
        Insert: {
          created_at?: string
          depende_de_plantilla_tarea_id: string
          id?: string
          plantilla_tarea_id: string
        }
        Update: {
          created_at?: string
          depende_de_plantilla_tarea_id?: string
          id?: string
          plantilla_tarea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plantilla_proyecto_tareas_dep_depende_de_plantilla_tarea_i_fkey"
            columns: ["depende_de_plantilla_tarea_id"]
            isOneToOne: false
            referencedRelation: "plantilla_proyecto_tareas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantilla_proyecto_tareas_dependencias_plantilla_tarea_id_fkey"
            columns: ["plantilla_tarea_id"]
            isOneToOne: false
            referencedRelation: "plantilla_proyecto_tareas"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "plantilla_tareas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_prototipo"
            referencedColumns: ["prototipo_id"]
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
      portafolio_destinos: {
        Row: {
          activo: boolean
          created_at: string
          cuenta_renta: boolean
          cuenta_venta: boolean
          deleted_at: string | null
          empresa_id: string
          id: string
          label: string
          orden: number
          slug: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          cuenta_renta?: boolean
          cuenta_venta?: boolean
          deleted_at?: string | null
          empresa_id: string
          id?: string
          label: string
          orden?: number
          slug: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          cuenta_renta?: boolean
          cuenta_venta?: boolean
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          label?: string
          orden?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      prediales_convenios: {
        Row: {
          contraprestacion: string | null
          created_at: string
          descuento_pct: number
          ejercicio_desde: number
          ejercicio_hasta: number
          empresa_id: string
          estado: string
          id: string
          nombre: string
          notas: string | null
          updated_at: string
        }
        Insert: {
          contraprestacion?: string | null
          created_at?: string
          descuento_pct?: number
          ejercicio_desde: number
          ejercicio_hasta: number
          empresa_id: string
          estado?: string
          id?: string
          nombre: string
          notas?: string | null
          updated_at?: string
        }
        Update: {
          contraprestacion?: string | null
          created_at?: string
          descuento_pct?: number
          ejercicio_desde?: number
          ejercicio_hasta?: number
          empresa_id?: string
          estado?: string
          id?: string
          nombre?: string
          notas?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prediales_ejercicios: {
        Row: {
          aseo: number | null
          bomberos: number | null
          convenio_id: string | null
          created_at: string
          cuenta_id: string
          ejercicio: number
          empresa_id: string
          estado: string
          fecha_pago: string | null
          id: string
          monto_pagado: number | null
          notas: string | null
          pagado_por: string | null
          predial: number | null
          recargos: number | null
          recargos_aseo: number | null
          recargos_bomberos: number | null
          updated_at: string
        }
        Insert: {
          aseo?: number | null
          bomberos?: number | null
          convenio_id?: string | null
          created_at?: string
          cuenta_id: string
          ejercicio: number
          empresa_id: string
          estado?: string
          fecha_pago?: string | null
          id?: string
          monto_pagado?: number | null
          notas?: string | null
          pagado_por?: string | null
          predial?: number | null
          recargos?: number | null
          recargos_aseo?: number | null
          recargos_bomberos?: number | null
          updated_at?: string
        }
        Update: {
          aseo?: number | null
          bomberos?: number | null
          convenio_id?: string | null
          created_at?: string
          cuenta_id?: string
          ejercicio?: number
          empresa_id?: string
          estado?: string
          fecha_pago?: string | null
          id?: string
          monto_pagado?: number | null
          notas?: string | null
          pagado_por?: string | null
          predial?: number | null
          recargos?: number | null
          recargos_aseo?: number | null
          recargos_bomberos?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediales_ejercicios_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "prediales_convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediales_ejercicios_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_prediales"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          atributos: Json
          costo_comercializacion_referencia: number | null
          costo_materiales_referencia: number | null
          costo_mo_referencia: number | null
          costo_referencia: number | null
          costo_urbanizacion_referencia: number | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          id: string
          nombre: string
          planos: Json
          proyecto_id: string
          registro_ruv_referencia: number | null
          seguro_calidad_referencia: number | null
          updated_at: string
          valor_comercial_referencia: number | null
        }
        Insert: {
          atributos?: Json
          costo_comercializacion_referencia?: number | null
          costo_materiales_referencia?: number | null
          costo_mo_referencia?: number | null
          costo_referencia?: number | null
          costo_urbanizacion_referencia?: number | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          id?: string
          nombre: string
          planos?: Json
          proyecto_id: string
          registro_ruv_referencia?: number | null
          seguro_calidad_referencia?: number | null
          updated_at?: string
          valor_comercial_referencia?: number | null
        }
        Update: {
          atributos?: Json
          costo_comercializacion_referencia?: number | null
          costo_materiales_referencia?: number | null
          costo_mo_referencia?: number | null
          costo_referencia?: number | null
          costo_urbanizacion_referencia?: number | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          planos?: Json
          proyecto_id?: string
          registro_ruv_referencia?: number | null
          seguro_calidad_referencia?: number | null
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
          {
            foreignKeyName: "productos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "productos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "productos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
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
          monto: number
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
          monto?: number
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
          monto?: number
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
          {
            foreignKeyName: "proyecto_activos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_activos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_activos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
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
          {
            foreignKeyName: "proyecto_documentos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_documentos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_documentos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
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
          {
            foreignKeyName: "proyecto_hitos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_hitos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_hitos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_planos: {
        Row: {
          ai_analisis: Json | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          id: string
          proyecto_id: string
          subido_por: string | null
          updated_at: string
          version: number
          vigente: boolean
        }
        Insert: {
          ai_analisis?: Json | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          id?: string
          proyecto_id: string
          subido_por?: string | null
          updated_at?: string
          version: number
          vigente?: boolean
        }
        Update: {
          ai_analisis?: Json | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          id?: string
          proyecto_id?: string
          subido_por?: string | null
          updated_at?: string
          version?: number
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_planos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_planos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_planos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_planos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_presupuesto_partidas: {
        Row: {
          autorizado_at: string | null
          autorizado_por: string | null
          cantidad: number | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          estado: string
          fuente: string | null
          id: string
          monto_aprobado: number | null
          monto_ejercido: number
          monto_estimado: number | null
          notas: string | null
          partida: string
          proveedor_persona_id: string | null
          proyecto_id: string
          tarea_origen_id: string | null
          unidad: string | null
          updated_at: string
        }
        Insert: {
          autorizado_at?: string | null
          autorizado_por?: string | null
          cantidad?: number | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          estado?: string
          fuente?: string | null
          id?: string
          monto_aprobado?: number | null
          monto_ejercido?: number
          monto_estimado?: number | null
          notas?: string | null
          partida: string
          proveedor_persona_id?: string | null
          proyecto_id: string
          tarea_origen_id?: string | null
          unidad?: string | null
          updated_at?: string
        }
        Update: {
          autorizado_at?: string | null
          autorizado_por?: string | null
          cantidad?: number | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          estado?: string
          fuente?: string | null
          id?: string
          monto_aprobado?: number | null
          monto_ejercido?: number
          monto_estimado?: number | null
          notas?: string | null
          partida?: string
          proveedor_persona_id?: string | null
          proyecto_id?: string
          tarea_origen_id?: string | null
          unidad?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_presupuesto_partidas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_presupuesto_partidas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_presupuesto_partidas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_presupuesto_partidas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_presupuesto_partidas_tarea_origen_id_fkey"
            columns: ["tarea_origen_id"]
            isOneToOne: false
            referencedRelation: "proyecto_tareas"
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
            foreignKeyName: "proyecto_prorrateo_proyecto_madre_id_fkey"
            columns: ["proyecto_madre_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_prorrateo_proyecto_madre_id_fkey"
            columns: ["proyecto_madre_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_prorrateo_proyecto_madre_id_fkey"
            columns: ["proyecto_madre_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_prorrateo_sub_proyecto_id_fkey"
            columns: ["sub_proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_prorrateo_sub_proyecto_id_fkey"
            columns: ["sub_proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_prorrateo_sub_proyecto_id_fkey"
            columns: ["sub_proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_prorrateo_sub_proyecto_id_fkey"
            columns: ["sub_proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
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
          {
            foreignKeyName: "proyecto_responsables_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_responsables_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_responsables_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_tarea_pasos: {
        Row: {
          autorizado_at: string | null
          autorizado_por: string | null
          created_at: string
          deleted_at: string | null
          documento_url: string | null
          empresa_id: string
          estado: string
          fecha: string | null
          id: string
          monto: number | null
          notas: string | null
          paso: string
          tarea_id: string
          updated_at: string
        }
        Insert: {
          autorizado_at?: string | null
          autorizado_por?: string | null
          created_at?: string
          deleted_at?: string | null
          documento_url?: string | null
          empresa_id: string
          estado?: string
          fecha?: string | null
          id?: string
          monto?: number | null
          notas?: string | null
          paso: string
          tarea_id: string
          updated_at?: string
        }
        Update: {
          autorizado_at?: string | null
          autorizado_por?: string | null
          created_at?: string
          deleted_at?: string | null
          documento_url?: string | null
          empresa_id?: string
          estado?: string
          fecha?: string | null
          id?: string
          monto?: number | null
          notas?: string | null
          paso?: string
          tarea_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_tarea_pasos_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "proyecto_tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_tareas: {
        Row: {
          aplicacion_snapshot: string | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          duracion_dias_habiles_snapshot: number | null
          empresa_id: string
          entidad_responsable_snapshot: string | null
          estado: string
          fecha_completada: string | null
          fecha_limite: string | null
          fecha_objetivo_fin: string | null
          fecha_objetivo_inicio: string | null
          formato_archivo_snapshot: string | null
          id: string
          obligatoriedad_snapshot: string | null
          orden: number
          plantilla_tarea_id: string | null
          prioridad: string
          proyecto_id: string
          requiere_archivo_snapshot: boolean | null
          responsable_id: string | null
          resultado_documento_url: string | null
          resultado_monto: number | null
          se_entrega_a_snapshot: string | null
          subtipo_snapshot: string | null
          tipo_snapshot: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          aplicacion_snapshot?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          duracion_dias_habiles_snapshot?: number | null
          empresa_id: string
          entidad_responsable_snapshot?: string | null
          estado?: string
          fecha_completada?: string | null
          fecha_limite?: string | null
          fecha_objetivo_fin?: string | null
          fecha_objetivo_inicio?: string | null
          formato_archivo_snapshot?: string | null
          id?: string
          obligatoriedad_snapshot?: string | null
          orden?: number
          plantilla_tarea_id?: string | null
          prioridad?: string
          proyecto_id: string
          requiere_archivo_snapshot?: boolean | null
          responsable_id?: string | null
          resultado_documento_url?: string | null
          resultado_monto?: number | null
          se_entrega_a_snapshot?: string | null
          subtipo_snapshot?: string | null
          tipo_snapshot?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          aplicacion_snapshot?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          duracion_dias_habiles_snapshot?: number | null
          empresa_id?: string
          entidad_responsable_snapshot?: string | null
          estado?: string
          fecha_completada?: string | null
          fecha_limite?: string | null
          fecha_objetivo_fin?: string | null
          fecha_objetivo_inicio?: string | null
          formato_archivo_snapshot?: string | null
          id?: string
          obligatoriedad_snapshot?: string | null
          orden?: number
          plantilla_tarea_id?: string | null
          prioridad?: string
          proyecto_id?: string
          requiere_archivo_snapshot?: boolean | null
          responsable_id?: string | null
          resultado_documento_url?: string | null
          resultado_monto?: number | null
          se_entrega_a_snapshot?: string | null
          subtipo_snapshot?: string | null
          tipo_snapshot?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_tareas_plantilla_tarea_id_fkey"
            columns: ["plantilla_tarea_id"]
            isOneToOne: false
            referencedRelation: "plantilla_proyecto_tareas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_tareas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_tareas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_tareas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_tareas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_tareas_dependencias: {
        Row: {
          created_at: string
          depende_de_tarea_id: string
          id: string
          tarea_id: string
        }
        Insert: {
          created_at?: string
          depende_de_tarea_id: string
          id?: string
          tarea_id: string
        }
        Update: {
          created_at?: string
          depende_de_tarea_id?: string
          id?: string
          tarea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_tareas_dependencias_depende_de_tarea_id_fkey"
            columns: ["depende_de_tarea_id"]
            isOneToOne: false
            referencedRelation: "proyecto_tareas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_tareas_dependencias_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "proyecto_tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      proyectos: {
        Row: {
          acreditacion_escritura: string | null
          area_comercial_m2: number | null
          area_m2: number | null
          area_residencial_m2: number | null
          area_vendible_m2: number | null
          area_vialidades_m2: number | null
          areas_verdes_m2: number | null
          categoria_notarial: string | null
          clasificacion_inmobiliaria: string | null
          clasificaciones_inmobiliarias: string[]
          clave_interna: string | null
          costo_comercializacion: number | null
          costo_comercializacion_referencia: number | null
          costo_construccion: number | null
          costo_materiales_proyecto: number | null
          costo_materiales_referencia: number | null
          costo_mo: number | null
          costo_mo_referencia: number | null
          costo_terreno: number | null
          costo_urbanizacion: number | null
          costo_urbanizacion_referencia: number | null
          created_at: string
          deleted_at: string | null
          documentos: Json
          empresa_id: string
          estado: string
          fecha_fin_estimada: string | null
          fecha_inicio: string | null
          fecha_licencia: string | null
          id: string
          image_url: string | null
          infraestructura_cabecera_necesaria: boolean
          lotes_proyectados: number | null
          nombre: string
          notas: string | null
          objetivo_trimestral: number | null
          plano_oficial_url: string | null
          plantilla_id: string | null
          precio_m2_excedente: number | null
          presupuesto_estimado: number | null
          prototipo_referencia_id: string | null
          prototipos_referencia: string[]
          proyecto_padre_id: string | null
          proyecto_predecesor_id: string | null
          registro_ruv_proyecto: number | null
          registro_ruv_referencia: number | null
          regla_prorrateo: string
          seguro_calidad_proyecto: number | null
          seguro_calidad_referencia: number | null
          tamano_lote_promedio: number | null
          tipo: string
          updated_at: string
          valor_comercial_proyecto: number | null
          valor_comercial_referencia: number | null
          valor_predio: number | null
        }
        Insert: {
          acreditacion_escritura?: string | null
          area_comercial_m2?: number | null
          area_m2?: number | null
          area_residencial_m2?: number | null
          area_vendible_m2?: number | null
          area_vialidades_m2?: number | null
          areas_verdes_m2?: number | null
          categoria_notarial?: string | null
          clasificacion_inmobiliaria?: string | null
          clasificaciones_inmobiliarias?: string[]
          clave_interna?: string | null
          costo_comercializacion?: number | null
          costo_comercializacion_referencia?: number | null
          costo_construccion?: number | null
          costo_materiales_proyecto?: number | null
          costo_materiales_referencia?: number | null
          costo_mo?: number | null
          costo_mo_referencia?: number | null
          costo_terreno?: number | null
          costo_urbanizacion?: number | null
          costo_urbanizacion_referencia?: number | null
          created_at?: string
          deleted_at?: string | null
          documentos?: Json
          empresa_id: string
          estado?: string
          fecha_fin_estimada?: string | null
          fecha_inicio?: string | null
          fecha_licencia?: string | null
          id?: string
          image_url?: string | null
          infraestructura_cabecera_necesaria?: boolean
          lotes_proyectados?: number | null
          nombre: string
          notas?: string | null
          objetivo_trimestral?: number | null
          plano_oficial_url?: string | null
          plantilla_id?: string | null
          precio_m2_excedente?: number | null
          presupuesto_estimado?: number | null
          prototipo_referencia_id?: string | null
          prototipos_referencia?: string[]
          proyecto_padre_id?: string | null
          proyecto_predecesor_id?: string | null
          registro_ruv_proyecto?: number | null
          registro_ruv_referencia?: number | null
          regla_prorrateo?: string
          seguro_calidad_proyecto?: number | null
          seguro_calidad_referencia?: number | null
          tamano_lote_promedio?: number | null
          tipo: string
          updated_at?: string
          valor_comercial_proyecto?: number | null
          valor_comercial_referencia?: number | null
          valor_predio?: number | null
        }
        Update: {
          acreditacion_escritura?: string | null
          area_comercial_m2?: number | null
          area_m2?: number | null
          area_residencial_m2?: number | null
          area_vendible_m2?: number | null
          area_vialidades_m2?: number | null
          areas_verdes_m2?: number | null
          categoria_notarial?: string | null
          clasificacion_inmobiliaria?: string | null
          clasificaciones_inmobiliarias?: string[]
          clave_interna?: string | null
          costo_comercializacion?: number | null
          costo_comercializacion_referencia?: number | null
          costo_construccion?: number | null
          costo_materiales_proyecto?: number | null
          costo_materiales_referencia?: number | null
          costo_mo?: number | null
          costo_mo_referencia?: number | null
          costo_terreno?: number | null
          costo_urbanizacion?: number | null
          costo_urbanizacion_referencia?: number | null
          created_at?: string
          deleted_at?: string | null
          documentos?: Json
          empresa_id?: string
          estado?: string
          fecha_fin_estimada?: string | null
          fecha_inicio?: string | null
          fecha_licencia?: string | null
          id?: string
          image_url?: string | null
          infraestructura_cabecera_necesaria?: boolean
          lotes_proyectados?: number | null
          nombre?: string
          notas?: string | null
          objetivo_trimestral?: number | null
          plano_oficial_url?: string | null
          plantilla_id?: string | null
          precio_m2_excedente?: number | null
          presupuesto_estimado?: number | null
          prototipo_referencia_id?: string | null
          prototipos_referencia?: string[]
          proyecto_padre_id?: string | null
          proyecto_predecesor_id?: string | null
          registro_ruv_proyecto?: number | null
          registro_ruv_referencia?: number | null
          regla_prorrateo?: string
          seguro_calidad_proyecto?: number | null
          seguro_calidad_referencia?: number | null
          tamano_lote_promedio?: number | null
          tipo?: string
          updated_at?: string
          valor_comercial_proyecto?: number | null
          valor_comercial_referencia?: number | null
          valor_predio?: number | null
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
            foreignKeyName: "proyectos_prototipo_referencia_id_fkey"
            columns: ["prototipo_referencia_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_prototipo_referencia_id_fkey"
            columns: ["prototipo_referencia_id"]
            isOneToOne: false
            referencedRelation: "v_margen_prototipo"
            referencedColumns: ["prototipo_id"]
          },
          {
            foreignKeyName: "proyectos_proyecto_padre_id_fkey"
            columns: ["proyecto_padre_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_proyecto_padre_id_fkey"
            columns: ["proyecto_padre_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyectos_proyecto_padre_id_fkey"
            columns: ["proyecto_padre_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyectos_proyecto_padre_id_fkey"
            columns: ["proyecto_padre_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_proyecto_predecesor_id_fkey"
            columns: ["proyecto_predecesor_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_proyecto_predecesor_id_fkey"
            columns: ["proyecto_predecesor_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyectos_proyecto_predecesor_id_fkey"
            columns: ["proyecto_predecesor_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyectos_proyecto_predecesor_id_fkey"
            columns: ["proyecto_predecesor_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
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
      recepcion_obra: {
        Row: {
          checklist: Json
          construccion_id: string
          created_at: string
          deleted_at: string | null
          empresa_id: string
          estado: string
          fecha_programada: string | null
          fecha_recepcion: string
          id: string
          notas: string | null
          recibido_por_user_id: string | null
          updated_at: string
        }
        Insert: {
          checklist?: Json
          construccion_id: string
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          estado?: string
          fecha_programada?: string | null
          fecha_recepcion?: string
          id?: string
          notas?: string | null
          recibido_por_user_id?: string | null
          updated_at?: string
        }
        Update: {
          checklist?: Json
          construccion_id?: string
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          estado?: string
          fecha_programada?: string | null
          fecha_recepcion?: string
          id?: string
          notas?: string | null
          recibido_por_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recepcion_obra_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "construccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepcion_obra_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "v_ac_obras_por_recibir"
            referencedColumns: ["construccion_id"]
          },
          {
            foreignKeyName: "recepcion_obra_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_pendientes_de_pago"
            referencedColumns: ["construccion_id"]
          },
        ]
      }
      recepcion_visitas: {
        Row: {
          compromiso_contratista: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          fecha_reprograma: string | null
          fecha_visita: string
          id: string
          observaciones: string | null
          recepcion_id: string
          registrado_por_user_id: string | null
          resultado: string
          updated_at: string
        }
        Insert: {
          compromiso_contratista?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          fecha_reprograma?: string | null
          fecha_visita?: string
          id?: string
          observaciones?: string | null
          recepcion_id: string
          registrado_por_user_id?: string | null
          resultado: string
          updated_at?: string
        }
        Update: {
          compromiso_contratista?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          fecha_reprograma?: string | null
          fecha_visita?: string
          id?: string
          observaciones?: string | null
          recepcion_id?: string
          registrado_por_user_id?: string | null
          resultado?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recepcion_visitas_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "recepcion_obra"
            referencedColumns: ["id"]
          },
        ]
      }
      ruv_documentos_catalogo: {
        Row: {
          activo: boolean
          created_at: string
          descripcion: string | null
          empresa_id: string
          id: string
          nombre: string
          orden: number | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          empresa_id: string
          id?: string
          nombre: string
          orden?: number | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          orden?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ruv_frente_documentos: {
        Row: {
          archivo_url: string | null
          created_at: string
          deleted_at: string | null
          documento_catalogo_id: string
          empresa_id: string
          estado: string
          fecha_carga: string | null
          frente_id: string
          id: string
          notas: string | null
          updated_at: string
        }
        Insert: {
          archivo_url?: string | null
          created_at?: string
          deleted_at?: string | null
          documento_catalogo_id: string
          empresa_id: string
          estado?: string
          fecha_carga?: string | null
          frente_id: string
          id?: string
          notas?: string | null
          updated_at?: string
        }
        Update: {
          archivo_url?: string | null
          created_at?: string
          deleted_at?: string | null
          documento_catalogo_id?: string
          empresa_id?: string
          estado?: string
          fecha_carga?: string | null
          frente_id?: string
          id?: string
          notas?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ruv_frente_documentos_documento_catalogo_id_fkey"
            columns: ["documento_catalogo_id"]
            isOneToOne: false
            referencedRelation: "ruv_documentos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruv_frente_documentos_frente_id_fkey"
            columns: ["frente_id"]
            isOneToOne: false
            referencedRelation: "ruv_frentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruv_frente_documentos_frente_id_fkey"
            columns: ["frente_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_frente_avance"
            referencedColumns: ["frente_id"]
          },
        ]
      }
      ruv_frentes: {
        Row: {
          coda_id: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          id_oferta: number | null
          id_orden: number | null
          nombre: string
          proyecto_id: string | null
          updated_at: string
          viviendas_oferta: number | null
        }
        Insert: {
          coda_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          id_oferta?: number | null
          id_orden?: number | null
          nombre: string
          proyecto_id?: string | null
          updated_at?: string
          viviendas_oferta?: number | null
        }
        Update: {
          coda_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          id_oferta?: number | null
          id_orden?: number | null
          nombre?: string
          proyecto_id?: string | null
          updated_at?: string
          viviendas_oferta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ruv_frentes_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruv_frentes_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "ruv_frentes_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "ruv_frentes_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas_construccion: {
        Row: {
          coda_row_id: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          hito_recepcion: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          hito_recepcion?: string | null
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          coda_row_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          hito_recepcion?: string | null
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
          cuv: string | null
          deleted_at: string | null
          empresa_id: string
          es_esquina: boolean | null
          es_muestra: boolean
          estado: string
          fecha_dtu: string | null
          fecha_extraccion: string | null
          fecha_paquete_ruv: string | null
          fecha_seguro_calidad: string | null
          frente_id: string | null
          id: string
          identificador: string
          m2_construccion: number | null
          manzana: string | null
          notas: string | null
          numero_lote: string | null
          numero_oficial: string | null
          precio: number | null
          problema_zcu: boolean
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
          cuv?: string | null
          deleted_at?: string | null
          empresa_id: string
          es_esquina?: boolean | null
          es_muestra?: boolean
          estado?: string
          fecha_dtu?: string | null
          fecha_extraccion?: string | null
          fecha_paquete_ruv?: string | null
          fecha_seguro_calidad?: string | null
          frente_id?: string | null
          id?: string
          identificador: string
          m2_construccion?: number | null
          manzana?: string | null
          notas?: string | null
          numero_lote?: string | null
          numero_oficial?: string | null
          precio?: number | null
          problema_zcu?: boolean
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
          cuv?: string | null
          deleted_at?: string | null
          empresa_id?: string
          es_esquina?: boolean | null
          es_muestra?: boolean
          estado?: string
          fecha_dtu?: string | null
          fecha_extraccion?: string | null
          fecha_paquete_ruv?: string | null
          fecha_seguro_calidad?: string | null
          frente_id?: string | null
          id?: string
          identificador?: string
          m2_construccion?: number | null
          manzana?: string | null
          notas?: string | null
          numero_lote?: string | null
          numero_oficial?: string | null
          precio?: number | null
          problema_zcu?: boolean
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
            foreignKeyName: "unidades_frente_id_fkey"
            columns: ["frente_id"]
            isOneToOne: false
            referencedRelation: "ruv_frentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_frente_id_fkey"
            columns: ["frente_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_frente_avance"
            referencedColumns: ["frente_id"]
          },
          {
            foreignKeyName: "unidades_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_prototipo"
            referencedColumns: ["prototipo_id"]
          },
          {
            foreignKeyName: "unidades_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "unidades_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "unidades_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_encuestas: {
        Row: {
          calif_proceso: number | null
          calif_vivienda: number | null
          canal: string | null
          comentario: string | null
          created_at: string
          empresa_id: string
          estado: string
          id: string
          intentos: number
          nps: number | null
          programada_para: string
          respondida_at: string | null
          ultimo_envio_at: string | null
          updated_at: string
          venta_id: string
        }
        Insert: {
          calif_proceso?: number | null
          calif_vivienda?: number | null
          canal?: string | null
          comentario?: string | null
          created_at?: string
          empresa_id: string
          estado?: string
          id?: string
          intentos?: number
          nps?: number | null
          programada_para: string
          respondida_at?: string | null
          ultimo_envio_at?: string | null
          updated_at?: string
          venta_id: string
        }
        Update: {
          calif_proceso?: number | null
          calif_vivienda?: number | null
          canal?: string | null
          comentario?: string | null
          created_at?: string
          empresa_id?: string
          estado?: string
          id?: string
          intentos?: number
          nps?: number | null
          programada_para?: string
          respondida_at?: string | null
          ultimo_envio_at?: string | null
          updated_at?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "v_ac_ventas_entrega"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "v_unidad_hold_queue"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "v_ventas_lista_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "v_ventas_pipeline_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "ventas"
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
      venta_fase_revisiones: {
        Row: {
          adjunto_acuse_id: string | null
          adjunto_id: string | null
          checks: Json
          created_at: string
          ejecutado_por: string | null
          empresa_id: string
          error_detalle: string | null
          estado: string
          extraccion: Json | null
          fase: number
          id: string
          modelo: string | null
          venta_id: string
          veredicto: string
        }
        Insert: {
          adjunto_acuse_id?: string | null
          adjunto_id?: string | null
          checks?: Json
          created_at?: string
          ejecutado_por?: string | null
          empresa_id: string
          error_detalle?: string | null
          estado?: string
          extraccion?: Json | null
          fase: number
          id?: string
          modelo?: string | null
          venta_id: string
          veredicto: string
        }
        Update: {
          adjunto_acuse_id?: string | null
          adjunto_id?: string | null
          checks?: Json
          created_at?: string
          ejecutado_por?: string | null
          empresa_id?: string
          error_detalle?: string | null
          estado?: string
          extraccion?: Json | null
          fase?: number
          id?: string
          modelo?: string | null
          venta_id?: string
          veredicto?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_fase_revisiones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_ac_ventas_entrega"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_fase_revisiones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_unidad_hold_queue"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_fase_revisiones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_lista_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_fase_revisiones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pipeline_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_fase_revisiones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "v_ac_ventas_entrega"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_fases_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_unidad_hold_queue"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_fases_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_lista_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_fases_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pipeline_antiguedad"
            referencedColumns: ["venta_id"]
          },
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
            referencedRelation: "v_ac_ventas_entrega"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_unidad_hold_queue"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_lista_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pipeline_antiguedad"
            referencedColumns: ["venta_id"]
          },
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
          apoyo_infonavit: number | null
          casa_valuadora: string | null
          cd_aval_domicilio: string | null
          cd_aval_nombre: string | null
          cd_fecha_suscripcion: string | null
          cd_interes_moratorio_pct: number | null
          cd_interes_ordinario_pct: number | null
          cd_plan_pagos: Json
          cd_spread_ordinario_pct: number | null
          cd_tiie28_pct: number | null
          coda_row_id: string | null
          comision_gerencia: number | null
          comision_vendedor: number | null
          conocimiento_dueno_beneficiario: string | null
          created_at: string
          credito_cotitular_ref: string | null
          credito_titular_ref: string | null
          deleted_at: string | null
          descuento_equipamiento: number | null
          descuento_gastos_escrituracion: number | null
          descuento_maximo_autorizado: number | null
          descuento_nota_credito: number | null
          descuento_precio: number | null
          descuento_total: number | null
          descuento_valor_base: number | null
          descuento_valor_base_autorizado_at: string | null
          descuento_valor_base_autorizado_por: string | null
          descuento_valor_base_detalle: string | null
          descuento_valor_base_motivo_id: string | null
          desglose_precio: Json | null
          empresa_id: string
          enganche_fecha_primer_pago: string | null
          enganche_num_parcialidades: number
          enganche_periodicidad: string
          enganche_requerido: number | null
          es_pep: boolean | null
          estado: string
          expira_at: string | null
          expirada_at: string | null
          fase_actual: string | null
          fase_posicion: number | null
          fecha_avaluo_cerrado: string | null
          fecha_desasignacion: string | null
          fecha_detonacion: string | null
          fecha_dictaminada: string | null
          fecha_entrega: string | null
          fecha_escritura: string | null
          fecha_firma_programada: string | null
          fecha_pre_entrega: string | null
          fecha_solicitud_avaluo: string | null
          fecha_solicitud_dictamen: string | null
          fecha_validacion_patronal: string | null
          forma_pago: string | null
          gastos_escrituracion: number | null
          gastos_notariales_desglose: Json | null
          hora_firma_programada: string | null
          id: string
          incremento_credito: number | null
          ine_numero: string | null
          monto_avaluo: number | null
          monto_cheque_notaria: number | null
          monto_credito_cotitular: number | null
          monto_credito_directo: number | null
          monto_credito_titular: number | null
          monto_detonado: number | null
          monto_nota_credito: number | null
          motivo_desasignacion: string | null
          notario: string | null
          notario_id: string | null
          notas: string | null
          notif_escrituracion_at: string | null
          notif_hold_4h_at: string | null
          notif_hold_creado_at: string | null
          notif_hold_expirada_at: string | null
          notif_hold_promovido_at: string | null
          notif_solicitud_avaluo_at: string | null
          notif_solicitud_dictamen_at: string | null
          numero_cheque_notaria: string | null
          numero_escritura: string | null
          ocupacion: string | null
          persona_id: string
          poliza_garantia_expedida_at: string | null
          precio_asignacion: number | null
          precio_base: number | null
          precio_documentos_firmados: number | null
          productos_adicionales: number
          promocion_gastos_monto: number | null
          promocion_id: string | null
          saldo_gastos_at: string | null
          saldo_gastos_autorizado_por: string | null
          saldo_gastos_monto: number | null
          saldo_gastos_resolucion: string | null
          saldo_residual_at: string | null
          saldo_residual_autorizado_por: string | null
          saldo_residual_monto: number | null
          saldo_residual_resolucion: string | null
          sobreprecio_gastos_escrituracion: number
          tiene_propiedad: boolean
          tipo_credito: string | null
          unidad_id: string | null
          updated_at: string
          uso_efectivo: string | null
          valor_catastral: number | null
          valor_comercial: number | null
          valor_escrituracion: number | null
          valor_esquina: number | null
          valor_excedente_terreno: number | null
          valor_facturado: number | null
          valor_frente_verde: number | null
          valor_real_venta_dilesa: number | null
          valor_venta_futuro: number | null
          valuador_id: string | null
          vendedor: string | null
          vendedor_usuario_id: string | null
          venta_origen_id: string | null
        }
        Insert: {
          anticipo_comision?: number | null
          apoyo_infonavit?: number | null
          casa_valuadora?: string | null
          cd_aval_domicilio?: string | null
          cd_aval_nombre?: string | null
          cd_fecha_suscripcion?: string | null
          cd_interes_moratorio_pct?: number | null
          cd_interes_ordinario_pct?: number | null
          cd_plan_pagos?: Json
          cd_spread_ordinario_pct?: number | null
          cd_tiie28_pct?: number | null
          coda_row_id?: string | null
          comision_gerencia?: number | null
          comision_vendedor?: number | null
          conocimiento_dueno_beneficiario?: string | null
          created_at?: string
          credito_cotitular_ref?: string | null
          credito_titular_ref?: string | null
          deleted_at?: string | null
          descuento_equipamiento?: number | null
          descuento_gastos_escrituracion?: number | null
          descuento_maximo_autorizado?: number | null
          descuento_nota_credito?: number | null
          descuento_precio?: number | null
          descuento_total?: number | null
          descuento_valor_base?: number | null
          descuento_valor_base_autorizado_at?: string | null
          descuento_valor_base_autorizado_por?: string | null
          descuento_valor_base_detalle?: string | null
          descuento_valor_base_motivo_id?: string | null
          desglose_precio?: Json | null
          empresa_id: string
          enganche_fecha_primer_pago?: string | null
          enganche_num_parcialidades?: number
          enganche_periodicidad?: string
          enganche_requerido?: number | null
          es_pep?: boolean | null
          estado?: string
          expira_at?: string | null
          expirada_at?: string | null
          fase_actual?: string | null
          fase_posicion?: number | null
          fecha_avaluo_cerrado?: string | null
          fecha_desasignacion?: string | null
          fecha_detonacion?: string | null
          fecha_dictaminada?: string | null
          fecha_entrega?: string | null
          fecha_escritura?: string | null
          fecha_firma_programada?: string | null
          fecha_pre_entrega?: string | null
          fecha_solicitud_avaluo?: string | null
          fecha_solicitud_dictamen?: string | null
          fecha_validacion_patronal?: string | null
          forma_pago?: string | null
          gastos_escrituracion?: number | null
          gastos_notariales_desglose?: Json | null
          hora_firma_programada?: string | null
          id?: string
          incremento_credito?: number | null
          ine_numero?: string | null
          monto_avaluo?: number | null
          monto_cheque_notaria?: number | null
          monto_credito_cotitular?: number | null
          monto_credito_directo?: number | null
          monto_credito_titular?: number | null
          monto_detonado?: number | null
          monto_nota_credito?: number | null
          motivo_desasignacion?: string | null
          notario?: string | null
          notario_id?: string | null
          notas?: string | null
          notif_escrituracion_at?: string | null
          notif_hold_4h_at?: string | null
          notif_hold_creado_at?: string | null
          notif_hold_expirada_at?: string | null
          notif_hold_promovido_at?: string | null
          notif_solicitud_avaluo_at?: string | null
          notif_solicitud_dictamen_at?: string | null
          numero_cheque_notaria?: string | null
          numero_escritura?: string | null
          ocupacion?: string | null
          persona_id: string
          poliza_garantia_expedida_at?: string | null
          precio_asignacion?: number | null
          precio_base?: number | null
          precio_documentos_firmados?: number | null
          productos_adicionales?: number
          promocion_gastos_monto?: number | null
          promocion_id?: string | null
          saldo_gastos_at?: string | null
          saldo_gastos_autorizado_por?: string | null
          saldo_gastos_monto?: number | null
          saldo_gastos_resolucion?: string | null
          saldo_residual_at?: string | null
          saldo_residual_autorizado_por?: string | null
          saldo_residual_monto?: number | null
          saldo_residual_resolucion?: string | null
          sobreprecio_gastos_escrituracion?: number
          tiene_propiedad?: boolean
          tipo_credito?: string | null
          unidad_id?: string | null
          updated_at?: string
          uso_efectivo?: string | null
          valor_catastral?: number | null
          valor_comercial?: number | null
          valor_escrituracion?: number | null
          valor_esquina?: number | null
          valor_excedente_terreno?: number | null
          valor_facturado?: number | null
          valor_frente_verde?: number | null
          valor_real_venta_dilesa?: number | null
          valor_venta_futuro?: number | null
          valuador_id?: string | null
          vendedor?: string | null
          vendedor_usuario_id?: string | null
          venta_origen_id?: string | null
        }
        Update: {
          anticipo_comision?: number | null
          apoyo_infonavit?: number | null
          casa_valuadora?: string | null
          cd_aval_domicilio?: string | null
          cd_aval_nombre?: string | null
          cd_fecha_suscripcion?: string | null
          cd_interes_moratorio_pct?: number | null
          cd_interes_ordinario_pct?: number | null
          cd_plan_pagos?: Json
          cd_spread_ordinario_pct?: number | null
          cd_tiie28_pct?: number | null
          coda_row_id?: string | null
          comision_gerencia?: number | null
          comision_vendedor?: number | null
          conocimiento_dueno_beneficiario?: string | null
          created_at?: string
          credito_cotitular_ref?: string | null
          credito_titular_ref?: string | null
          deleted_at?: string | null
          descuento_equipamiento?: number | null
          descuento_gastos_escrituracion?: number | null
          descuento_maximo_autorizado?: number | null
          descuento_nota_credito?: number | null
          descuento_precio?: number | null
          descuento_total?: number | null
          descuento_valor_base?: number | null
          descuento_valor_base_autorizado_at?: string | null
          descuento_valor_base_autorizado_por?: string | null
          descuento_valor_base_detalle?: string | null
          descuento_valor_base_motivo_id?: string | null
          desglose_precio?: Json | null
          empresa_id?: string
          enganche_fecha_primer_pago?: string | null
          enganche_num_parcialidades?: number
          enganche_periodicidad?: string
          enganche_requerido?: number | null
          es_pep?: boolean | null
          estado?: string
          expira_at?: string | null
          expirada_at?: string | null
          fase_actual?: string | null
          fase_posicion?: number | null
          fecha_avaluo_cerrado?: string | null
          fecha_desasignacion?: string | null
          fecha_detonacion?: string | null
          fecha_dictaminada?: string | null
          fecha_entrega?: string | null
          fecha_escritura?: string | null
          fecha_firma_programada?: string | null
          fecha_pre_entrega?: string | null
          fecha_solicitud_avaluo?: string | null
          fecha_solicitud_dictamen?: string | null
          fecha_validacion_patronal?: string | null
          forma_pago?: string | null
          gastos_escrituracion?: number | null
          gastos_notariales_desglose?: Json | null
          hora_firma_programada?: string | null
          id?: string
          incremento_credito?: number | null
          ine_numero?: string | null
          monto_avaluo?: number | null
          monto_cheque_notaria?: number | null
          monto_credito_cotitular?: number | null
          monto_credito_directo?: number | null
          monto_credito_titular?: number | null
          monto_detonado?: number | null
          monto_nota_credito?: number | null
          motivo_desasignacion?: string | null
          notario?: string | null
          notario_id?: string | null
          notas?: string | null
          notif_escrituracion_at?: string | null
          notif_hold_4h_at?: string | null
          notif_hold_creado_at?: string | null
          notif_hold_expirada_at?: string | null
          notif_hold_promovido_at?: string | null
          notif_solicitud_avaluo_at?: string | null
          notif_solicitud_dictamen_at?: string | null
          numero_cheque_notaria?: string | null
          numero_escritura?: string | null
          ocupacion?: string | null
          persona_id?: string
          poliza_garantia_expedida_at?: string | null
          precio_asignacion?: number | null
          precio_base?: number | null
          precio_documentos_firmados?: number | null
          productos_adicionales?: number
          promocion_gastos_monto?: number | null
          promocion_id?: string | null
          saldo_gastos_at?: string | null
          saldo_gastos_autorizado_por?: string | null
          saldo_gastos_monto?: number | null
          saldo_gastos_resolucion?: string | null
          saldo_residual_at?: string | null
          saldo_residual_autorizado_por?: string | null
          saldo_residual_monto?: number | null
          saldo_residual_resolucion?: string | null
          sobreprecio_gastos_escrituracion?: number
          tiene_propiedad?: boolean
          tipo_credito?: string | null
          unidad_id?: string | null
          updated_at?: string
          uso_efectivo?: string | null
          valor_catastral?: number | null
          valor_comercial?: number | null
          valor_escrituracion?: number | null
          valor_esquina?: number | null
          valor_excedente_terreno?: number | null
          valor_facturado?: number | null
          valor_frente_verde?: number | null
          valor_real_venta_dilesa?: number | null
          valor_venta_futuro?: number | null
          valuador_id?: string | null
          vendedor?: string | null
          vendedor_usuario_id?: string | null
          venta_origen_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_descuento_valor_base_motivo_id_fkey"
            columns: ["descuento_valor_base_motivo_id"]
            isOneToOne: false
            referencedRelation: "descuento_motivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_promocion_id_fkey"
            columns: ["promocion_id"]
            isOneToOne: false
            referencedRelation: "promociones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_venta_origen_id_fkey"
            columns: ["venta_origen_id"]
            isOneToOne: false
            referencedRelation: "v_ac_ventas_entrega"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "ventas_venta_origen_id_fkey"
            columns: ["venta_origen_id"]
            isOneToOne: false
            referencedRelation: "v_unidad_hold_queue"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "ventas_venta_origen_id_fkey"
            columns: ["venta_origen_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_lista_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "ventas_venta_origen_id_fkey"
            columns: ["venta_origen_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pipeline_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "ventas_venta_origen_id_fkey"
            columns: ["venta_origen_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_ac_encuestas_pendientes: {
        Row: {
          cliente: string | null
          empresa_id: string | null
          encuesta_id: string | null
          estado: string | null
          intentos: number | null
          programada_para: string | null
          unidad: string | null
          venta_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "v_ac_ventas_entrega"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "v_unidad_hold_queue"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "v_ventas_lista_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "v_ventas_pipeline_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ac_encuestas_respondidas: {
        Row: {
          calif_proceso: number | null
          calif_vivienda: number | null
          canal: string | null
          cliente: string | null
          comentario: string | null
          empresa_id: string | null
          encuesta_id: string | null
          nps: number | null
          nps_segmento: string | null
          proyecto: string | null
          proyecto_id: string | null
          respondida_at: string | null
          respondida_fecha: string | null
          unidad: string | null
          venta_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "v_ac_ventas_entrega"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "v_unidad_hold_queue"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "v_ventas_lista_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "v_ventas_pipeline_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_encuestas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: true
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ac_kpis: {
        Row: {
          calif_proceso_prom: number | null
          calif_vivienda_prom: number | null
          empresa_id: string | null
          encuestas_respondidas: number | null
          encuestas_total: number | null
          nps_prom: number | null
        }
        Relationships: []
      }
      v_ac_obras_por_recibir: {
        Row: {
          avance_pct: number | null
          codigo: string | null
          construccion_id: string | null
          empresa_id: string | null
          estado: string | null
          fecha_programada: string | null
          proyecto: string | null
          recepcion_estado: string | null
          unidad: string | null
        }
        Relationships: []
      }
      v_ac_ventas_entrega: {
        Row: {
          cliente: string | null
          cola: string | null
          dias_en_fase: number | null
          empresa_id: string | null
          fase_actual: string | null
          fase_posicion: number | null
          pago_detonado: boolean | null
          proyecto: string | null
          unidad: string | null
          venta_id: string | null
        }
        Relationships: []
      }
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
            foreignKeyName: "construccion_tareas_terminadas_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "v_ac_obras_por_recibir"
            referencedColumns: ["construccion_id"]
          },
          {
            foreignKeyName: "construccion_tareas_terminadas_construccion_id_fkey"
            columns: ["construccion_id"]
            isOneToOne: false
            referencedRelation: "v_tareas_pendientes_de_pago"
            referencedColumns: ["construccion_id"]
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
      v_contratista_obra: {
        Row: {
          avance_esperado: number | null
          avance_real: number | null
          contratista: string | null
          contratista_id: string | null
          efectividad_pct: number | null
          empresa_id: string | null
          mo_contratado: number | null
          mo_ejecutado: number | null
          pct_ejecutado: number | null
          vencidas: number | null
          viviendas: number | null
        }
        Relationships: []
      }
      v_estimaciones_resumen: {
        Row: {
          anio_iso: number | null
          contratista_id: string | null
          empresa_id: string | null
          estado: string | null
          estimaciones_count: number | null
          monto_bruto_total: number | null
          monto_neto_total: number | null
          retencion_total: number | null
          semana_iso: number | null
        }
        Relationships: []
      }
      v_fase_benchmark: {
        Row: {
          empresa_id: string | null
          fase: string | null
          mediana: number | null
          n: number | null
          p90: number | null
          posicion: number | null
        }
        Relationships: []
      }
      v_fase_vara: {
        Row: {
          empresa_id: string | null
          fase: string | null
          mediana: number | null
          meta: number | null
          n: number | null
          p90: number | null
          posicion: number | null
          vara: number | null
        }
        Relationships: []
      }
      v_inventario_prototipo: {
        Row: {
          empresa_id: string | null
          en_inventario: number | null
          inventario_asignado: number | null
          inventario_construccion: number | null
          inventario_disponible: number | null
          inventario_terminado: number | null
          prototipo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_producto_id_fkey"
            columns: ["prototipo_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_producto_id_fkey"
            columns: ["prototipo_id"]
            isOneToOne: false
            referencedRelation: "v_margen_prototipo"
            referencedColumns: ["prototipo_id"]
          },
        ]
      }
      v_margen_prototipo: {
        Row: {
          costo_comercializacion: number | null
          costo_materiales: number | null
          costo_mo: number | null
          costo_terreno: number | null
          costo_total: number | null
          costo_urbanizacion: number | null
          empresa_id: string | null
          margen_pct: number | null
          nombre: string | null
          prototipo_id: string | null
          proyecto_id: string | null
          registro_ruv: number | null
          seguro_calidad: number | null
          utilidad: number | null
          valor_comercial: number | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "productos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "productos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_proyecto_avance: {
        Row: {
          avance_pct: number | null
          empresa_id: string | null
          proyecto_id: string | null
          tareas_aplicables: number | null
          tareas_completadas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_tareas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_tareas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_tareas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "proyecto_tareas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_proyecto_avances: {
        Row: {
          avance_const_pct: number | null
          avance_urb_pct: number | null
          avance_vts_pct: number | null
          casas_asignadas: number | null
          casas_en_construccion: number | null
          casas_entregadas: number | null
          casas_escrituradas: number | null
          casas_muestra: number | null
          casas_terminadas: number | null
          densidad_vivienda: number | null
          empresa_id: string | null
          estado_actual: string | null
          estado_sugerido: string | null
          inventario_disponible_venta: number | null
          inventario_formalizado: number | null
          lotes_comerciales: number | null
          lotes_construidos: number | null
          lotes_residenciales: number | null
          lotes_total: number | null
          lotes_urbanizados: number | null
          lotes_vendidos: number | null
          parque_disponible: number | null
          proyecto_id: string | null
          tamano_lote_promedio_m2: number | null
          ticket_promedio: number | null
          tipo: string | null
          ventas_totales: number | null
        }
        Relationships: []
      }
      v_ruv_frente_avance: {
        Row: {
          con_dtu: number | null
          con_paquete_ruv: number | null
          con_seguro_calidad: number | null
          cuvs_emitidos: number | null
          documentos_pendientes: number | null
          empresa_id: string | null
          frente_id: string | null
          lotes: number | null
          nombre: string | null
          pct_paquete_ruv: number | null
          proyecto_id: string | null
          viviendas: number | null
          viviendas_oferta: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ruv_frentes_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruv_frentes_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "ruv_frentes_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "ruv_frentes_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ruv_proyectos_disponibles: {
        Row: {
          empresa_id: string | null
          id: string | null
          lotes_disponibles: number | null
          nombre: string | null
        }
        Relationships: []
      }
      v_tareas_pendientes_de_pago: {
        Row: {
          construccion_codigo: string | null
          construccion_id: string | null
          contratista_id: string | null
          empresa_id: string | null
          fecha_terminada: string | null
          monto_calculado: number | null
          plantilla_tarea_id: string | null
          revisado_por_persona_id: string | null
          revisado_por_user_id: string | null
          tarea_terminada_id: string | null
          unidad_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "construccion_tareas_terminadas_plantilla_tarea_id_fkey"
            columns: ["plantilla_tarea_id"]
            isOneToOne: false
            referencedRelation: "plantilla_tareas"
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
      v_unidad_hold_queue: {
        Row: {
          created_at: string | null
          empresa_id: string | null
          expira_at: string | null
          notif_hold_4h_at: string | null
          notif_hold_creado_at: string | null
          notif_hold_promovido_at: string | null
          persona_id: string | null
          posicion: number | null
          unidad_id: string | null
          vendedor_usuario_id: string | null
          venta_id: string | null
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
      v_venta_fase_duraciones: {
        Row: {
          dias_en_fase: number | null
          empresa_id: string | null
          es_negativo: boolean | null
          es_tramo_abierto: boolean | null
          estado: string | null
          fase: string | null
          fecha_entrada: string | null
          fecha_salida: string | null
          posicion: number | null
          proyecto_id: string | null
          tipo_credito: string | null
          venta_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "unidades_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "unidades_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_fases_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_ac_ventas_entrega"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_fases_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_unidad_hold_queue"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_fases_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_lista_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_fases_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "v_ventas_pipeline_antiguedad"
            referencedColumns: ["venta_id"]
          },
          {
            foreignKeyName: "venta_fases_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ventas_lista_antiguedad: {
        Row: {
          dias_en_fase: number | null
          empresa_id: string | null
          fase_actual: string | null
          fase_posicion: number | null
          fecha_fase_actual: string | null
          venta_id: string | null
        }
        Relationships: []
      }
      v_ventas_pipeline_antiguedad: {
        Row: {
          cliente: string | null
          dias_en_fase: number | null
          empresa_id: string | null
          fase_actual: string | null
          fase_posicion: number | null
          fecha_fase_actual: string | null
          persona_id: string | null
          precio: number | null
          proyecto_id: string | null
          proyecto_nombre: string | null
          unidad_id: string | null
          unidad_identificador: string | null
          vendedor: string | null
          vendedor_usuario_id: string | null
          venta_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ac_encuestas_respondidas"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "unidades_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_proyecto_avances"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "unidades_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_ruv_proyectos_disponibles"
            referencedColumns: ["id"]
          },
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
    Functions: {
      _activo_upsert_satelite: {
        Args: {
          p_activo_id: string
          p_empresa_id: string
          p_sat: Json
          p_tipo: string
        }
        Returns: undefined
      }
      contrato_obra_cancelar: {
        Args: { p_contrato_id: string; p_motivo: string }
        Returns: undefined
      }
      estimacion_destajo_autorizar: {
        Args: { p_estimacion_id: string }
        Returns: string
      }
      estimacion_destajo_cancelar: {
        Args: { p_estimacion_id: string; p_motivo?: string }
        Returns: undefined
      }
      fn_actualizar_activo: {
        Args: { p_activo_id: string; p_master: Json; p_satelite?: Json }
        Returns: undefined
      }
      fn_actualizar_descuentos_venta: {
        Args: {
          p_descuento_equipamiento?: number
          p_descuento_gastos_escrituracion?: number
          p_descuento_nota_credito?: number
          p_descuento_precio?: number
          p_descuento_total: number
          p_motivo?: string
          p_venta_id: string
        }
        Returns: Json
      }
      fn_alta_activo: {
        Args: {
          p_empresa_id: string
          p_master: Json
          p_satelite?: Json
          p_tipo: string
        }
        Returns: string
      }
      fn_avanzar_post_factura: {
        Args: { p_venta_id: string }
        Returns: undefined
      }
      fn_backfill_cxc: {
        Args: never
        Returns: {
          metrica: string
          valor: number
        }[]
      }
      fn_calcular_avance_construccion: {
        Args: { p_construccion_id: string }
        Returns: number
      }
      fn_calcular_precio_venta: {
        Args: {
          p_descuento_valor_base?: number
          p_monto_credito_cotitular?: number
          p_monto_credito_titular?: number
          p_productos_adicionales?: number
          p_sobreprecio_gastos_escrituracion?: number
          p_tipo_credito_id?: string
          p_unidad_id: string
        }
        Returns: Json
      }
      fn_construccion_capturar_costo_materiales: {
        Args: { p_construccion_id: string; p_costo: number }
        Returns: undefined
      }
      fn_construccion_previas_completas: {
        Args: { p_construccion_id: string }
        Returns: boolean
      }
      fn_copiar_comprobante_detonacion: {
        Args: { p_pago_id: string }
        Returns: undefined
      }
      fn_corregir_avaluo_venta: {
        Args: {
          p_fecha_avaluo_cerrado?: string
          p_monto_avaluo: number
          p_motivo?: string
          p_venta_id: string
        }
        Returns: Json
      }
      fn_ejecutar_movimiento_activos: {
        Args: {
          p_documento_id?: string
          p_fecha: string
          p_notas?: string
          p_origen_ids: string[]
          p_resultantes: Json
          p_tipo: string
        }
        Returns: Json
      }
      fn_es_vendedor_restringido: { Args: never; Returns: boolean }
      fn_estimaciones_backfill_incremental: {
        Args: never
        Returns: {
          estimaciones_creadas: number
          tareas_vinculadas: number
        }[]
      }
      fn_expirar_ventas_vencidas: {
        Args: never
        Returns: {
          empresa_id: string
          persona_id: string
          unidad_id: string
          vendedor_usuario_id: string
          venta_id: string
        }[]
      }
      fn_fase_calificacion: {
        Args: { p_desde?: string; p_empresa: string; p_hasta?: string }
        Returns: {
          fase: string
          mediana: number
          n: number
          p90: number
          posicion: number
        }[]
      }
      fn_fase_vara: {
        Args: { p_empresa: string }
        Returns: {
          fase: string
          mediana: number
          meta: number
          n: number
          p90: number
          posicion: number
          vara: number
        }[]
      }
      fn_generar_estimacion_borrador: {
        Args: {
          p_contratista_id: string
          p_fecha_cierre?: string
          p_retencion_pct?: number
        }
        Returns: string
      }
      fn_generar_plan_pagos: { Args: { p_venta_id: string }; Returns: number }
      fn_liberar_unidad_portafolio: {
        Args: {
          p_destino_id: string
          p_tipo: string
          p_unidad_id: string
          p_valor?: number
        }
        Returns: string
      }
      fn_marcar_plano_vigente: {
        Args: { p_plano_id: string }
        Returns: undefined
      }
      fn_proyecto_promote_anteproyecto: {
        Args: { p_anteproyecto_id: string }
        Returns: string
      }
      fn_recepcion_cerrar: {
        Args: {
          p_checklist?: Json
          p_construccion_id: string
          p_estado?: string
          p_fecha?: string
          p_notas?: string
        }
        Returns: string
      }
      fn_recepcion_programar: {
        Args: { p_construccion_id: string; p_fecha_programada: string }
        Returns: string
      }
      fn_recepcion_registrar_visita: {
        Args: {
          p_compromiso?: string
          p_construccion_id: string
          p_fecha_reprograma: string
          p_fecha_visita: string
          p_observaciones: string
        }
        Returns: string
      }
      fn_regresar_unidad_proyecto: {
        Args: { p_unidad_id: string }
        Returns: undefined
      }
      fn_sync_detonacion_desde_cxc: {
        Args: { p_venta_id: string }
        Returns: undefined
      }
      fn_tarea_terminada_esta_pagada: {
        Args: { p_tarea_id: string }
        Returns: boolean
      }
      fn_venta_auditar_descuentos: {
        Args: {
          p_accion: string
          p_datos_anteriores: Json
          p_datos_nuevos: Json
          p_empresa_id: string
          p_venta_id: string
        }
        Returns: undefined
      }
      fn_ventas_lista_antiguedad: {
        Args: { p_empresa: string }
        Returns: {
          dias_en_fase: number
          fase_actual: string
          fase_posicion: number
          venta_id: string
        }[]
      }
      obra_estimacion_autorizar: {
        Args: { p_estimacion_id: string; p_override_motivo?: string }
        Returns: undefined
      }
      obra_estimacion_cancelar: {
        Args: { p_estimacion_id: string; p_motivo: string }
        Returns: undefined
      }
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
          sustituido_at: string | null
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
          sustituido_at?: string | null
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
          sustituido_at?: string | null
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
      arrendamiento_cfdis: {
        Row: {
          adjunto_id: string | null
          arrendamiento_id: string
          created_at: string
          cxc_cargo_id: string | null
          empresa_id: string
          fecha: string | null
          id: string
          linea_id: string | null
          monto: number | null
          periodo: string | null
          tipo: string
          uuid_sat: string
        }
        Insert: {
          adjunto_id?: string | null
          arrendamiento_id: string
          created_at?: string
          cxc_cargo_id?: string | null
          empresa_id: string
          fecha?: string | null
          id?: string
          linea_id?: string | null
          monto?: number | null
          periodo?: string | null
          tipo: string
          uuid_sat: string
        }
        Update: {
          adjunto_id?: string | null
          arrendamiento_id?: string
          created_at?: string
          cxc_cargo_id?: string | null
          empresa_id?: string
          fecha?: string | null
          id?: string
          linea_id?: string | null
          monto?: number | null
          periodo?: string | null
          tipo?: string
          uuid_sat?: string
        }
        Relationships: [
          {
            foreignKeyName: "arrendamiento_cfdis_arrendamiento_id_fkey"
            columns: ["arrendamiento_id"]
            isOneToOne: false
            referencedRelation: "arrendamientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrendamiento_cfdis_cxc_cargo_id_fkey"
            columns: ["cxc_cargo_id"]
            isOneToOne: false
            referencedRelation: "cxc_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrendamiento_cfdis_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "arrendamiento_lineas"
            referencedColumns: ["id"]
          },
        ]
      }
      arrendamiento_depositos: {
        Row: {
          aplicable_a_renta_desde: string | null
          arrendamiento_id: string
          cfdi_requerido_en_recepcion: boolean
          created_at: string
          deposito_naturaleza: string
          empresa_id: string
          estado: string
          fecha_devuelto: string | null
          fecha_recibido: string | null
          id: string
          monto: number
          movimiento_bancario_id: string | null
          notas: string | null
          plazo_devolucion_dias: number
          updated_at: string
        }
        Insert: {
          aplicable_a_renta_desde?: string | null
          arrendamiento_id: string
          cfdi_requerido_en_recepcion?: boolean
          created_at?: string
          deposito_naturaleza?: string
          empresa_id: string
          estado?: string
          fecha_devuelto?: string | null
          fecha_recibido?: string | null
          id?: string
          monto: number
          movimiento_bancario_id?: string | null
          notas?: string | null
          plazo_devolucion_dias?: number
          updated_at?: string
        }
        Update: {
          aplicable_a_renta_desde?: string | null
          arrendamiento_id?: string
          cfdi_requerido_en_recepcion?: boolean
          created_at?: string
          deposito_naturaleza?: string
          empresa_id?: string
          estado?: string
          fecha_devuelto?: string | null
          fecha_recibido?: string | null
          id?: string
          monto?: number
          movimiento_bancario_id?: string | null
          notas?: string | null
          plazo_devolucion_dias?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arrendamiento_depositos_arrendamiento_id_fkey"
            columns: ["arrendamiento_id"]
            isOneToOne: false
            referencedRelation: "arrendamientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrendamiento_depositos_movimiento_bancario_id_fkey"
            columns: ["movimiento_bancario_id"]
            isOneToOne: false
            referencedRelation: "movimientos_bancarios"
            referencedColumns: ["id"]
          },
        ]
      }
      arrendamiento_lineas: {
        Row: {
          activo_id: string
          arrendamiento_id: string
          created_at: string
          empresa_id: string
          estado: string
          id: string
          iva_fundamento: string | null
          iva_tasa_pct: number
          iva_validado_at: string | null
          iva_validado_por: string | null
          lugar_expedicion: string | null
          notas: string | null
          regimen_iva: string
          renta_subtotal: number
          retencion_isr_pct: number
          retencion_iva_pct: number
          sujeto_retencion: boolean
          tipo_operacion_fiscal: string
          updated_at: string
          vigencia_fin: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          activo_id: string
          arrendamiento_id: string
          created_at?: string
          empresa_id: string
          estado?: string
          id?: string
          iva_fundamento?: string | null
          iva_tasa_pct?: number
          iva_validado_at?: string | null
          iva_validado_por?: string | null
          lugar_expedicion?: string | null
          notas?: string | null
          regimen_iva?: string
          renta_subtotal: number
          retencion_isr_pct?: number
          retencion_iva_pct?: number
          sujeto_retencion?: boolean
          tipo_operacion_fiscal?: string
          updated_at?: string
          vigencia_fin?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          activo_id?: string
          arrendamiento_id?: string
          created_at?: string
          empresa_id?: string
          estado?: string
          id?: string
          iva_fundamento?: string | null
          iva_tasa_pct?: number
          iva_validado_at?: string | null
          iva_validado_por?: string | null
          lugar_expedicion?: string | null
          notas?: string | null
          regimen_iva?: string
          renta_subtotal?: number
          retencion_isr_pct?: number
          retencion_iva_pct?: number
          sujeto_retencion?: boolean
          tipo_operacion_fiscal?: string
          updated_at?: string
          vigencia_fin?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arrendamiento_lineas_arrendamiento_id_fkey"
            columns: ["arrendamiento_id"]
            isOneToOne: false
            referencedRelation: "arrendamientos"
            referencedColumns: ["id"]
          },
        ]
      }
      arrendamiento_renta_periodos: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          inpc_aplicado: number | null
          linea_id: string
          monto: number
          pct_aplicado: number | null
          vigencia_fin: string | null
          vigencia_inicio: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          inpc_aplicado?: number | null
          linea_id: string
          monto: number
          pct_aplicado?: number | null
          vigencia_fin?: string | null
          vigencia_inicio: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          inpc_aplicado?: number | null
          linea_id?: string
          monto?: number
          pct_aplicado?: number | null
          vigencia_fin?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "arrendamiento_renta_periodos_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "arrendamiento_lineas"
            referencedColumns: ["id"]
          },
        ]
      }
      arrendamientos: {
        Row: {
          arrendador_persona_id: string | null
          arrendatario_persona_id: string
          created_at: string
          deleted_at: string | null
          deposito_meses: number
          dia_corte: number | null
          empresa_id: string
          esquema_incremento: string
          estado: string
          fecha_fin: string | null
          fecha_inicio: string | null
          fiador_persona_id: string | null
          folio: string | null
          id: string
          inpc_base_anio: number | null
          inpc_base_mes: number | null
          moneda: string
          notas: string | null
          pagador_persona_id: string | null
          pct_adicional: number
          penalizacion_terminacion_meses: number
          receptor_fiscal_persona_id: string | null
          requiere_fiador: boolean
          tipo_plazo: string
          tipo_renovacion: string
          updated_at: string
        }
        Insert: {
          arrendador_persona_id?: string | null
          arrendatario_persona_id: string
          created_at?: string
          deleted_at?: string | null
          deposito_meses?: number
          dia_corte?: number | null
          empresa_id: string
          esquema_incremento?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fiador_persona_id?: string | null
          folio?: string | null
          id?: string
          inpc_base_anio?: number | null
          inpc_base_mes?: number | null
          moneda?: string
          notas?: string | null
          pagador_persona_id?: string | null
          pct_adicional?: number
          penalizacion_terminacion_meses?: number
          receptor_fiscal_persona_id?: string | null
          requiere_fiador?: boolean
          tipo_plazo?: string
          tipo_renovacion?: string
          updated_at?: string
        }
        Update: {
          arrendador_persona_id?: string | null
          arrendatario_persona_id?: string
          created_at?: string
          deleted_at?: string | null
          deposito_meses?: number
          dia_corte?: number | null
          empresa_id?: string
          esquema_incremento?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fiador_persona_id?: string | null
          folio?: string | null
          id?: string
          inpc_base_anio?: number | null
          inpc_base_mes?: number | null
          moneda?: string
          notas?: string | null
          pagador_persona_id?: string | null
          pct_adicional?: number
          penalizacion_terminacion_meses?: number
          receptor_fiscal_persona_id?: string | null
          requiere_fiador?: boolean
          tipo_plazo?: string
          tipo_renovacion?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arrendamientos_arrendador_persona_id_fkey"
            columns: ["arrendador_persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrendamientos_arrendador_persona_id_fkey"
            columns: ["arrendador_persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "arrendamientos_arrendatario_persona_id_fkey"
            columns: ["arrendatario_persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrendamientos_arrendatario_persona_id_fkey"
            columns: ["arrendatario_persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "arrendamientos_fiador_persona_id_fkey"
            columns: ["fiador_persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrendamientos_fiador_persona_id_fkey"
            columns: ["fiador_persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "arrendamientos_pagador_persona_id_fkey"
            columns: ["pagador_persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrendamientos_pagador_persona_id_fkey"
            columns: ["pagador_persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
          {
            foreignKeyName: "arrendamientos_receptor_fiscal_persona_id_fkey"
            columns: ["receptor_fiscal_persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrendamientos_receptor_fiscal_persona_id_fkey"
            columns: ["receptor_fiscal_persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
        ]
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
          va_a_cocina: boolean
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
          va_a_cocina?: boolean
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
          va_a_cocina?: boolean
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
      conceptos_compra: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          deleted_at: string | null
          empresa_id: string
          id: string
          nivel: string
          nombre: string
          notas: string | null
          orden: number
          padre_id: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          id?: string
          nivel: string
          nombre: string
          notas?: string | null
          orden?: number
          padre_id?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          nivel?: string
          nombre?: string
          notas?: string | null
          orden?: number
          padre_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conceptos_compra_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "conceptos_compra"
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
      cotizacion_lineas: {
        Row: {
          cantidad: number
          cotizacion_id: string
          created_at: string
          descripcion: string | null
          empresa_id: string
          id: string
          partida_id: string | null
          precio_estimado: number | null
          unidad: string | null
        }
        Insert: {
          cantidad?: number
          cotizacion_id: string
          created_at?: string
          descripcion?: string | null
          empresa_id: string
          id?: string
          partida_id?: string | null
          precio_estimado?: number | null
          unidad?: string | null
        }
        Update: {
          cantidad?: number
          cotizacion_id?: string
          created_at?: string
          descripcion?: string | null
          empresa_id?: string
          id?: string
          partida_id?: string | null
          precio_estimado?: number | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotizacion_lineas_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "cotizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_lineas_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_partidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_lineas_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "v_partida_control"
            referencedColumns: ["partida_id"]
          },
          {
            foreignKeyName: "cotizacion_lineas_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "v_presupuesto_reconciliacion"
            referencedColumns: ["partida_id"]
          },
        ]
      }
      cotizacion_proveedor_precios: {
        Row: {
          cotizacion_linea_id: string
          cotizacion_proveedor_id: string
          created_at: string
          empresa_id: string
          id: string
          precio_unitario: number
        }
        Insert: {
          cotizacion_linea_id: string
          cotizacion_proveedor_id: string
          created_at?: string
          empresa_id: string
          id?: string
          precio_unitario?: number
        }
        Update: {
          cotizacion_linea_id?: string
          cotizacion_proveedor_id?: string
          created_at?: string
          empresa_id?: string
          id?: string
          precio_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "cotizacion_proveedor_precios_cotizacion_linea_id_fkey"
            columns: ["cotizacion_linea_id"]
            isOneToOne: false
            referencedRelation: "cotizacion_lineas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_proveedor_precios_cotizacion_proveedor_id_fkey"
            columns: ["cotizacion_proveedor_id"]
            isOneToOne: false
            referencedRelation: "cotizacion_proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      cotizacion_proveedores: {
        Row: {
          adjunto_url: string | null
          condiciones: string | null
          cotizacion_id: string
          created_at: string
          empresa_id: string
          estado: string
          id: string
          monto_total: number | null
          notas: string | null
          proveedor_id: string
          tiempo_entrega: string | null
          updated_at: string
        }
        Insert: {
          adjunto_url?: string | null
          condiciones?: string | null
          cotizacion_id: string
          created_at?: string
          empresa_id: string
          estado?: string
          id?: string
          monto_total?: number | null
          notas?: string | null
          proveedor_id: string
          tiempo_entrega?: string | null
          updated_at?: string
        }
        Update: {
          adjunto_url?: string | null
          condiciones?: string | null
          cotizacion_id?: string
          created_at?: string
          empresa_id?: string
          estado?: string
          id?: string
          monto_total?: number | null
          notas?: string | null
          proveedor_id?: string
          tiempo_entrega?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotizacion_proveedores_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "cotizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_proveedores_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      cotizaciones: {
        Row: {
          adjudicado_proveedor_id: string | null
          cancelada_at: string | null
          cancelada_por: string | null
          codigo: string | null
          creado_por: string | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          empresa_id: string
          estado: string
          fecha_limite: string | null
          id: string
          motivo_cancelacion: string | null
          requisicion_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          adjudicado_proveedor_id?: string | null
          cancelada_at?: string | null
          cancelada_por?: string | null
          codigo?: string | null
          creado_por?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id: string
          estado?: string
          fecha_limite?: string | null
          id?: string
          motivo_cancelacion?: string | null
          requisicion_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          adjudicado_proveedor_id?: string | null
          cancelada_at?: string | null
          cancelada_por?: string | null
          codigo?: string | null
          creado_por?: string | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          empresa_id?: string
          estado?: string
          fecha_limite?: string | null
          id?: string
          motivo_cancelacion?: string | null
          requisicion_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotizaciones_adjudicado_proveedor_id_fkey"
            columns: ["adjudicado_proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_requisicion_id_fkey"
            columns: ["requisicion_id"]
            isOneToOne: false
            referencedRelation: "requisiciones"
            referencedColumns: ["id"]
          },
        ]
      }
      cuenta_saldos: {
        Row: {
          capturado_por: string | null
          created_at: string
          cuenta_id: string
          empresa_id: string
          fecha: string
          id: string
          notas: string | null
          saldo: number
        }
        Insert: {
          capturado_por?: string | null
          created_at?: string
          cuenta_id: string
          empresa_id: string
          fecha?: string
          id?: string
          notas?: string | null
          saldo: number
        }
        Update: {
          capturado_por?: string | null
          created_at?: string
          cuenta_id?: string
          empresa_id?: string
          fecha?: string
          id?: string
          notas?: string | null
          saldo?: number
        }
        Relationships: [
          {
            foreignKeyName: "cuenta_saldos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_bancarias: {
        Row: {
          activo: boolean
          banco: string | null
          clabe: string | null
          contacto: string | null
          contrato: string | null
          created_at: string
          empresa_id: string
          id: string
          moneda: string | null
          moneda_id: string | null
          nombre: string
          notas: string | null
          numero_cliente: string | null
          numero_cuenta: string | null
          producto: string | null
          saldo_actual: number | null
          sucursal: string | null
          telefono: string | null
          tipo: string | null
          titular: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          banco?: string | null
          clabe?: string | null
          contacto?: string | null
          contrato?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          moneda?: string | null
          moneda_id?: string | null
          nombre: string
          notas?: string | null
          numero_cliente?: string | null
          numero_cuenta?: string | null
          producto?: string | null
          saldo_actual?: number | null
          sucursal?: string | null
          telefono?: string | null
          tipo?: string | null
          titular?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          banco?: string | null
          clabe?: string | null
          contacto?: string | null
          contrato?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          moneda?: string | null
          moneda_id?: string | null
          nombre?: string
          notas?: string | null
          numero_cliente?: string | null
          numero_cuenta?: string | null
          producto?: string | null
          saldo_actual?: number | null
          sucursal?: string | null
          telefono?: string | null
          tipo?: string | null
          titular?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cuentas_contables: {
        Row: {
          activa: boolean
          afectable: boolean
          codigo_agrupador_sat: string | null
          codigo_contpaqi: string | null
          created_at: string
          cuenta_padre_id: string | null
          deleted_at: string | null
          empresa_id: string
          id: string
          naturaleza: string
          nivel: number
          nombre: string
          notas: string | null
          numero: string
          origen: string
          tipo: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          afectable?: boolean
          codigo_agrupador_sat?: string | null
          codigo_contpaqi?: string | null
          created_at?: string
          cuenta_padre_id?: string | null
          deleted_at?: string | null
          empresa_id: string
          id?: string
          naturaleza: string
          nivel: number
          nombre: string
          notas?: string | null
          numero: string
          origen?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          afectable?: boolean
          codigo_agrupador_sat?: string | null
          codigo_contpaqi?: string | null
          created_at?: string
          cuenta_padre_id?: string | null
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          naturaleza?: string
          nivel?: number
          nombre?: string
          notas?: string | null
          numero?: string
          origen?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_contables_cuenta_padre_id_fkey"
            columns: ["cuenta_padre_id"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
        ]
      }
      cxc_cargos: {
        Row: {
          concepto: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          estado: string
          fecha_vencimiento: string | null
          fuente_esperada: string
          id: string
          monto: number
          monto_pagado: number
          notas: string | null
          numero: number
          origen_id: string | null
          origen_tipo: string
          periodo: string | null
          persona_id: string
          saldo: number | null
          tipo_cargo: string
          updated_at: string
        }
        Insert: {
          concepto?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          estado?: string
          fecha_vencimiento?: string | null
          fuente_esperada?: string
          id?: string
          monto: number
          monto_pagado?: number
          notas?: string | null
          numero?: number
          origen_id?: string | null
          origen_tipo?: string
          periodo?: string | null
          persona_id: string
          saldo?: number | null
          tipo_cargo: string
          updated_at?: string
        }
        Update: {
          concepto?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          estado?: string
          fecha_vencimiento?: string | null
          fuente_esperada?: string
          id?: string
          monto?: number
          monto_pagado?: number
          notas?: string | null
          numero?: number
          origen_id?: string | null
          origen_tipo?: string
          periodo?: string | null
          persona_id?: string
          saldo?: number | null
          tipo_cargo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cxc_cargos_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cxc_cargos_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      cxc_pago_aplicaciones: {
        Row: {
          cargo_id: string
          created_at: string
          empresa_id: string
          id: string
          monto_aplicado: number
          pago_id: string
        }
        Insert: {
          cargo_id: string
          created_at?: string
          empresa_id: string
          id?: string
          monto_aplicado: number
          pago_id: string
        }
        Update: {
          cargo_id?: string
          created_at?: string
          empresa_id?: string
          id?: string
          monto_aplicado?: number
          pago_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cxc_pago_aplicaciones_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cxc_cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cxc_pago_aplicaciones_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "cxc_pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      cxc_pagos: {
        Row: {
          coda_row_id: string | null
          comprobante_adjunto_id: string | null
          created_at: string
          cuenta_bancaria_id: string | null
          deleted_at: string | null
          empresa_id: string
          fecha: string
          forma_pago: string | null
          fuente: string
          id: string
          monto_total: number
          notas: string | null
          origen_id: string | null
          origen_tipo: string
          persona_id: string
          referencia: string | null
          registrado_por: string | null
          updated_at: string
          uuid_sat: string | null
        }
        Insert: {
          coda_row_id?: string | null
          comprobante_adjunto_id?: string | null
          created_at?: string
          cuenta_bancaria_id?: string | null
          deleted_at?: string | null
          empresa_id: string
          fecha?: string
          forma_pago?: string | null
          fuente?: string
          id?: string
          monto_total: number
          notas?: string | null
          origen_id?: string | null
          origen_tipo?: string
          persona_id: string
          referencia?: string | null
          registrado_por?: string | null
          updated_at?: string
          uuid_sat?: string | null
        }
        Update: {
          coda_row_id?: string | null
          comprobante_adjunto_id?: string | null
          created_at?: string
          cuenta_bancaria_id?: string | null
          deleted_at?: string | null
          empresa_id?: string
          fecha?: string
          forma_pago?: string | null
          fuente?: string
          id?: string
          monto_total?: number
          notas?: string | null
          origen_id?: string | null
          origen_tipo?: string
          persona_id?: string
          referencia?: string | null
          registrado_por?: string | null
          updated_at?: string
          uuid_sat?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cxc_pagos_cuenta_bancaria_id_fkey"
            columns: ["cuenta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cxc_pagos_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cxc_pagos_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
        ]
      }
      cxp_pago_aplicaciones: {
        Row: {
          created_at: string
          empresa_id: string
          factura_id: string
          id: string
          monto_aplicado: number
          pago_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          factura_id: string
          id?: string
          monto_aplicado: number
          pago_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          factura_id?: string
          id?: string
          monto_aplicado?: number
          pago_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cxp_pago_aplicaciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cxp_pago_aplicaciones_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "cxp_pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      cxp_pagos: {
        Row: {
          aprobado_at: string | null
          aprobado_por: string | null
          created_at: string
          cuenta_bancaria_id: string | null
          deleted_at: string | null
          empresa_id: string
          estado: string
          fecha_pago: string | null
          fecha_programada: string | null
          id: string
          metodo_pago: string | null
          monto_total: number
          notas: string | null
          obra_estimacion_id: string | null
          pagado_at: string | null
          pagado_por: string | null
          programado_por: string | null
          proveedor_id: string | null
          referencia: string | null
          updated_at: string
        }
        Insert: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          created_at?: string
          cuenta_bancaria_id?: string | null
          deleted_at?: string | null
          empresa_id: string
          estado?: string
          fecha_pago?: string | null
          fecha_programada?: string | null
          id?: string
          metodo_pago?: string | null
          monto_total: number
          notas?: string | null
          obra_estimacion_id?: string | null
          pagado_at?: string | null
          pagado_por?: string | null
          programado_por?: string | null
          proveedor_id?: string | null
          referencia?: string | null
          updated_at?: string
        }
        Update: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          created_at?: string
          cuenta_bancaria_id?: string | null
          deleted_at?: string | null
          empresa_id?: string
          estado?: string
          fecha_pago?: string | null
          fecha_programada?: string | null
          id?: string
          metodo_pago?: string | null
          monto_total?: number
          notas?: string | null
          obra_estimacion_id?: string | null
          pagado_at?: string | null
          pagado_por?: string | null
          programado_por?: string | null
          proveedor_id?: string | null
          referencia?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cxp_pagos_cuenta_bancaria_id_fkey"
            columns: ["cuenta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cxp_pagos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cxp_pagos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["persona_id"]
          },
        ]
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
          notif_alta_at: string | null
          notif_baja_at: string | null
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
          notif_alta_at?: string | null
          notif_baja_at?: string | null
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
          notif_alta_at?: string | null
          notif_baja_at?: string | null
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
      estados_cuenta: {
        Row: {
          archivo_path: string | null
          capturado_por: string | null
          comisiones: number | null
          created_at: string
          cuenta_id: string
          depositos: number
          empresa_id: string
          extraccion: Json | null
          fecha_corte: string
          id: string
          notas: string | null
          num_abonos: number | null
          num_cargos: number | null
          periodo: string
          retiros: number
          saldo_final: number
          saldo_inicial: number
          saldo_inversiones: number
          updated_at: string | null
        }
        Insert: {
          archivo_path?: string | null
          capturado_por?: string | null
          comisiones?: number | null
          created_at?: string
          cuenta_id: string
          depositos?: number
          empresa_id: string
          extraccion?: Json | null
          fecha_corte: string
          id?: string
          notas?: string | null
          num_abonos?: number | null
          num_cargos?: number | null
          periodo: string
          retiros?: number
          saldo_final: number
          saldo_inicial: number
          saldo_inversiones?: number
          updated_at?: string | null
        }
        Update: {
          archivo_path?: string | null
          capturado_por?: string | null
          comisiones?: number | null
          created_at?: string
          cuenta_id?: string
          depositos?: number
          empresa_id?: string
          extraccion?: Json | null
          fecha_corte?: string
          id?: string
          notas?: string | null
          num_abonos?: number | null
          num_cargos?: number | null
          periodo?: string
          retiros?: number
          saldo_final?: number
          saldo_inicial?: number
          saldo_inversiones?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estados_cuenta_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas: {
        Row: {
          cancelada_at: string | null
          cancelada_por: string | null
          condiciones_pago_dias: number | null
          contrato_id: string | null
          created_at: string
          cuenta_contable_id: string | null
          emisor_nombre: string | null
          emisor_rfc: string | null
          empresa_id: string
          estado_cxp: string
          estado_id: string | null
          estimacion_id: string | null
          fecha_emision: string
          fecha_pago_programada: string | null
          fecha_vencimiento: string | null
          flujo: string
          forma_pago_sat: string | null
          id: string
          iva: number | null
          metodo_pago_sat: string | null
          monto_pagado: number
          motivo_cancelacion: string | null
          obra_estimacion_id: string | null
          orden_compra_id: string | null
          partida_id: string | null
          pdf_url: string | null
          persona_id: string | null
          proveedor_id: string | null
          receptor_rfc: string | null
          retencion_isr: number
          retencion_iva: number
          saldo: number | null
          subtotal: number | null
          tasa_iva: number | null
          tipo_ingreso_id: string | null
          total: number | null
          updated_at: string | null
          uso_cfdi: string | null
          uuid_sat: string | null
          xml_url: string | null
        }
        Insert: {
          cancelada_at?: string | null
          cancelada_por?: string | null
          condiciones_pago_dias?: number | null
          contrato_id?: string | null
          created_at?: string
          cuenta_contable_id?: string | null
          emisor_nombre?: string | null
          emisor_rfc?: string | null
          empresa_id: string
          estado_cxp?: string
          estado_id?: string | null
          estimacion_id?: string | null
          fecha_emision: string
          fecha_pago_programada?: string | null
          fecha_vencimiento?: string | null
          flujo: string
          forma_pago_sat?: string | null
          id?: string
          iva?: number | null
          metodo_pago_sat?: string | null
          monto_pagado?: number
          motivo_cancelacion?: string | null
          obra_estimacion_id?: string | null
          orden_compra_id?: string | null
          partida_id?: string | null
          pdf_url?: string | null
          persona_id?: string | null
          proveedor_id?: string | null
          receptor_rfc?: string | null
          retencion_isr?: number
          retencion_iva?: number
          saldo?: number | null
          subtotal?: number | null
          tasa_iva?: number | null
          tipo_ingreso_id?: string | null
          total?: number | null
          updated_at?: string | null
          uso_cfdi?: string | null
          uuid_sat?: string | null
          xml_url?: string | null
        }
        Update: {
          cancelada_at?: string | null
          cancelada_por?: string | null
          condiciones_pago_dias?: number | null
          contrato_id?: string | null
          created_at?: string
          cuenta_contable_id?: string | null
          emisor_nombre?: string | null
          emisor_rfc?: string | null
          empresa_id?: string
          estado_cxp?: string
          estado_id?: string | null
          estimacion_id?: string | null
          fecha_emision?: string
          fecha_pago_programada?: string | null
          fecha_vencimiento?: string | null
          flujo?: string
          forma_pago_sat?: string | null
          id?: string
          iva?: number | null
          metodo_pago_sat?: string | null
          monto_pagado?: number
          motivo_cancelacion?: string | null
          obra_estimacion_id?: string | null
          orden_compra_id?: string | null
          partida_id?: string | null
          pdf_url?: string | null
          persona_id?: string | null
          proveedor_id?: string | null
          receptor_rfc?: string | null
          retencion_isr?: number
          retencion_iva?: number
          saldo?: number | null
          subtotal?: number | null
          tasa_iva?: number | null
          tipo_ingreso_id?: string | null
          total?: number | null
          updated_at?: string | null
          uso_cfdi?: string | null
          uuid_sat?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturas_cuenta_contable_id_fkey"
            columns: ["cuenta_contable_id"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_orden_compra_id_fkey"
            columns: ["orden_compra_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_partidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "v_partida_control"
            referencedColumns: ["partida_id"]
          },
          {
            foreignKeyName: "facturas_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "v_presupuesto_reconciliacion"
            referencedColumns: ["partida_id"]
          },
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
          {
            foreignKeyName: "facturas_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_proveedor_id_fkey"
            columns: ["proveedor_id"]
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
          cuenta_contable_id: string | null
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
          cuenta_contable_id?: string | null
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
          cuenta_contable_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "gastos_cuenta_contable_id_fkey"
            columns: ["cuenta_contable_id"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
        ]
      }
      inpc_indices: {
        Row: {
          anio: number
          aprobado_por: string | null
          capturado_por: string | null
          created_at: string
          estado: string
          fecha_publicacion: string | null
          fuente: string
          id: string
          mes: number
          updated_at: string
          valor: number
        }
        Insert: {
          anio: number
          aprobado_por?: string | null
          capturado_por?: string | null
          created_at?: string
          estado?: string
          fecha_publicacion?: string | null
          fuente?: string
          id?: string
          mes: number
          updated_at?: string
          valor: number
        }
        Update: {
          anio?: number
          aprobado_por?: string | null
          capturado_por?: string | null
          created_at?: string
          estado?: string
          fecha_publicacion?: string | null
          fuente?: string
          id?: string
          mes?: number
          updated_at?: string
          valor?: number
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
          referencia_id: string | null
          referencia_tipo: string | null
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
          referencia_id?: string | null
          referencia_tipo?: string | null
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
          referencia_id?: string | null
          referencia_tipo?: string | null
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
          cancelada_at: string | null
          cancelada_por: string | null
          cerrada_at: string | null
          cerrada_por: string | null
          codigo: string | null
          condiciones_pago: string | null
          cotizacion_id: string | null
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
          motivo_cancelacion: string | null
          proveedor_id: string | null
          requisicion_id: string | null
          subtotal: number | null
          total: number | null
          total_a_pagar: number | null
          updated_at: string | null
        }
        Insert: {
          autorizada_at?: string | null
          cancelada_at?: string | null
          cancelada_por?: string | null
          cerrada_at?: string | null
          cerrada_por?: string | null
          codigo?: string | null
          condiciones_pago?: string | null
          cotizacion_id?: string | null
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
          motivo_cancelacion?: string | null
          proveedor_id?: string | null
          requisicion_id?: string | null
          subtotal?: number | null
          total?: number | null
          total_a_pagar?: number | null
          updated_at?: string | null
        }
        Update: {
          autorizada_at?: string | null
          cancelada_at?: string | null
          cancelada_por?: string | null
          cerrada_at?: string | null
          cerrada_por?: string | null
          codigo?: string | null
          condiciones_pago?: string | null
          cotizacion_id?: string | null
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
          motivo_cancelacion?: string | null
          proveedor_id?: string | null
          requisicion_id?: string | null
          subtotal?: number | null
          total?: number | null
          total_a_pagar?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "cotizaciones"
            referencedColumns: ["id"]
          },
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
          partida_id: string | null
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
          partida_id?: string | null
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
          partida_id?: string | null
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
            foreignKeyName: "ordenes_compra_detalle_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_partidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_detalle_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "v_partida_control"
            referencedColumns: ["partida_id"]
          },
          {
            foreignKeyName: "ordenes_compra_detalle_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "v_presupuesto_reconciliacion"
            referencedColumns: ["partida_id"]
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
          conocimiento_dueno_beneficiario: string | null
          contacto_emergencia_nombre: string | null
          contacto_emergencia_parentesco: string | null
          contacto_emergencia_telefono: string | null
          created_at: string
          curp: string | null
          deleted_at: string | null
          domicilio: string | null
          domicilio_calle: string | null
          domicilio_ciudad: string | null
          domicilio_codigo_postal: string | null
          domicilio_colonia: string | null
          domicilio_estado: string | null
          domicilio_numero_exterior: string | null
          domicilio_numero_interior: string | null
          email: string | null
          empresa_id: string
          es_pep: boolean | null
          estado_civil: string | null
          fecha_nacimiento: string | null
          forma_pago_kyc: string | null
          id: string
          lugar_nacimiento: string | null
          nacionalidad: string | null
          nombre: string
          nss: string | null
          numero_credencial_ine: string | null
          ocupacion: string | null
          rfc: string | null
          sexo: string | null
          telefono: string | null
          telefono_casa: string | null
          tipo: string
          tipo_persona: string
          updated_at: string | null
          uso_efectivo_kyc: string | null
        }
        Insert: {
          activo?: boolean
          apellido_materno?: string | null
          apellido_paterno?: string | null
          conocimiento_dueno_beneficiario?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_parentesco?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string
          curp?: string | null
          deleted_at?: string | null
          domicilio?: string | null
          domicilio_calle?: string | null
          domicilio_ciudad?: string | null
          domicilio_codigo_postal?: string | null
          domicilio_colonia?: string | null
          domicilio_estado?: string | null
          domicilio_numero_exterior?: string | null
          domicilio_numero_interior?: string | null
          email?: string | null
          empresa_id: string
          es_pep?: boolean | null
          estado_civil?: string | null
          fecha_nacimiento?: string | null
          forma_pago_kyc?: string | null
          id?: string
          lugar_nacimiento?: string | null
          nacionalidad?: string | null
          nombre: string
          nss?: string | null
          numero_credencial_ine?: string | null
          ocupacion?: string | null
          rfc?: string | null
          sexo?: string | null
          telefono?: string | null
          telefono_casa?: string | null
          tipo?: string
          tipo_persona?: string
          updated_at?: string | null
          uso_efectivo_kyc?: string | null
        }
        Update: {
          activo?: boolean
          apellido_materno?: string | null
          apellido_paterno?: string | null
          conocimiento_dueno_beneficiario?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_parentesco?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string
          curp?: string | null
          deleted_at?: string | null
          domicilio?: string | null
          domicilio_calle?: string | null
          domicilio_ciudad?: string | null
          domicilio_codigo_postal?: string | null
          domicilio_colonia?: string | null
          domicilio_estado?: string | null
          domicilio_numero_exterior?: string | null
          domicilio_numero_interior?: string | null
          email?: string | null
          empresa_id?: string
          es_pep?: boolean | null
          estado_civil?: string | null
          fecha_nacimiento?: string | null
          forma_pago_kyc?: string | null
          id?: string
          lugar_nacimiento?: string | null
          nacionalidad?: string | null
          nombre?: string
          nss?: string | null
          numero_credencial_ine?: string | null
          ocupacion?: string | null
          rfc?: string | null
          sexo?: string | null
          telefono?: string | null
          telefono_casa?: string | null
          tipo?: string
          tipo_persona?: string
          updated_at?: string | null
          uso_efectivo_kyc?: string | null
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
      presupuesto_baseline_partidas: {
        Row: {
          baseline_id: string
          concepto_texto: string | null
          empresa_id: string
          etapa: string | null
          id: string
          monto_baseline: number
          partida_id: string
        }
        Insert: {
          baseline_id: string
          concepto_texto?: string | null
          empresa_id: string
          etapa?: string | null
          id?: string
          monto_baseline?: number
          partida_id: string
        }
        Update: {
          baseline_id?: string
          concepto_texto?: string | null
          empresa_id?: string
          etapa?: string | null
          id?: string
          monto_baseline?: number
          partida_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_baseline_partidas_baseline_id_fkey"
            columns: ["baseline_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_baselines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_baseline_partidas_baseline_id_fkey"
            columns: ["baseline_id"]
            isOneToOne: false
            referencedRelation: "v_presupuesto_reconciliacion"
            referencedColumns: ["baseline_id"]
          },
          {
            foreignKeyName: "presupuesto_baseline_partidas_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_partidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_baseline_partidas_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "v_partida_control"
            referencedColumns: ["partida_id"]
          },
          {
            foreignKeyName: "presupuesto_baseline_partidas_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "v_presupuesto_reconciliacion"
            referencedColumns: ["partida_id"]
          },
        ]
      }
      presupuesto_baselines: {
        Row: {
          autorizado_at: string
          autorizado_por: string
          created_at: string
          empresa_id: string
          id: string
          notas: string | null
          partidas_count: number
          proyecto_id: string
          total: number
        }
        Insert: {
          autorizado_at?: string
          autorizado_por: string
          created_at?: string
          empresa_id: string
          id?: string
          notas?: string | null
          partidas_count?: number
          proyecto_id: string
          total?: number
        }
        Update: {
          autorizado_at?: string
          autorizado_por?: string
          created_at?: string
          empresa_id?: string
          id?: string
          notas?: string | null
          partidas_count?: number
          proyecto_id?: string
          total?: number
        }
        Relationships: []
      }
      presupuesto_cambios: {
        Row: {
          cancelada_at: string | null
          cancelada_por: string | null
          created_at: string
          empresa_id: string
          estado: string
          id: string
          monto_aprobado_antes: number | null
          monto_aprobado_despues: number | null
          monto_delta: number
          motivo: string
          motivo_categoria: string
          motivo_rechazo: string | null
          partida_id: string
          proyecto_id: string
          resuelto_at: string | null
          resuelto_por: string | null
          solicitado_at: string
          solicitado_por: string
          tipo: string
          updated_at: string
        }
        Insert: {
          cancelada_at?: string | null
          cancelada_por?: string | null
          created_at?: string
          empresa_id: string
          estado?: string
          id?: string
          monto_aprobado_antes?: number | null
          monto_aprobado_despues?: number | null
          monto_delta: number
          motivo: string
          motivo_categoria: string
          motivo_rechazo?: string | null
          partida_id: string
          proyecto_id: string
          resuelto_at?: string | null
          resuelto_por?: string | null
          solicitado_at?: string
          solicitado_por: string
          tipo: string
          updated_at?: string
        }
        Update: {
          cancelada_at?: string | null
          cancelada_por?: string | null
          created_at?: string
          empresa_id?: string
          estado?: string
          id?: string
          monto_aprobado_antes?: number | null
          monto_aprobado_despues?: number | null
          monto_delta?: number
          motivo?: string
          motivo_categoria?: string
          motivo_rechazo?: string | null
          partida_id?: string
          proyecto_id?: string
          resuelto_at?: string | null
          resuelto_por?: string | null
          solicitado_at?: string
          solicitado_por?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_cambios_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_partidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_cambios_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "v_partida_control"
            referencedColumns: ["partida_id"]
          },
          {
            foreignKeyName: "presupuesto_cambios_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "v_presupuesto_reconciliacion"
            referencedColumns: ["partida_id"]
          },
        ]
      }
      presupuesto_partidas: {
        Row: {
          autorizado_at: string | null
          autorizado_por: string | null
          cancelada_at: string | null
          cancelada_por: string | null
          concepto_id: string | null
          concepto_texto: string | null
          contrato_id: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          estado: string
          etapa: string | null
          factura_ref: string | null
          fecha_compromiso: string | null
          fuente: string | null
          gasto_real_iva: number | null
          gasto_real_iva_tasa: number | null
          gasto_real_subtotal: number | null
          gasto_real_total: number | null
          id: string
          monto_estimado: number | null
          motivo_cancelacion: string | null
          notas: string | null
          orden: number
          presupuesto_aprobado: number | null
          presupuesto_previo: number | null
          proveedor_persona_id: string | null
          proveedor_texto: string | null
          proyecto_id: string | null
          source_ref: string | null
          tarea_origen_id: string | null
          tipo_insumo: string | null
          updated_at: string
        }
        Insert: {
          autorizado_at?: string | null
          autorizado_por?: string | null
          cancelada_at?: string | null
          cancelada_por?: string | null
          concepto_id?: string | null
          concepto_texto?: string | null
          contrato_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          estado?: string
          etapa?: string | null
          factura_ref?: string | null
          fecha_compromiso?: string | null
          fuente?: string | null
          gasto_real_iva?: number | null
          gasto_real_iva_tasa?: number | null
          gasto_real_subtotal?: number | null
          gasto_real_total?: number | null
          id?: string
          monto_estimado?: number | null
          motivo_cancelacion?: string | null
          notas?: string | null
          orden?: number
          presupuesto_aprobado?: number | null
          presupuesto_previo?: number | null
          proveedor_persona_id?: string | null
          proveedor_texto?: string | null
          proyecto_id?: string | null
          source_ref?: string | null
          tarea_origen_id?: string | null
          tipo_insumo?: string | null
          updated_at?: string
        }
        Update: {
          autorizado_at?: string | null
          autorizado_por?: string | null
          cancelada_at?: string | null
          cancelada_por?: string | null
          concepto_id?: string | null
          concepto_texto?: string | null
          contrato_id?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          estado?: string
          etapa?: string | null
          factura_ref?: string | null
          fecha_compromiso?: string | null
          fuente?: string | null
          gasto_real_iva?: number | null
          gasto_real_iva_tasa?: number | null
          gasto_real_subtotal?: number | null
          gasto_real_total?: number | null
          id?: string
          monto_estimado?: number | null
          motivo_cancelacion?: string | null
          notas?: string | null
          orden?: number
          presupuesto_aprobado?: number | null
          presupuesto_previo?: number | null
          proveedor_persona_id?: string | null
          proveedor_texto?: string | null
          proyecto_id?: string | null
          source_ref?: string | null
          tarea_origen_id?: string | null
          tipo_insumo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_partidas_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_partidas_proveedor_persona_id_fkey"
            columns: ["proveedor_persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_partidas_proveedor_persona_id_fkey"
            columns: ["proveedor_persona_id"]
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
          contenido: number | null
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
          unidad_base: string | null
          updated_at: string | null
          va_a_cocina: boolean | null
        }
        Insert: {
          activo?: boolean
          categoria_id?: string | null
          clasificacion?:
            | Database["erp"]["Enums"]["clasificacion_producto"]
            | null
          codigo?: string | null
          contenido?: number | null
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
          unidad_base?: string | null
          updated_at?: string | null
          va_a_cocina?: boolean | null
        }
        Update: {
          activo?: boolean
          categoria_id?: string | null
          clasificacion?:
            | Database["erp"]["Enums"]["clasificacion_producto"]
            | null
          codigo?: string | null
          contenido?: number | null
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
          unidad_base?: string | null
          updated_at?: string | null
          va_a_cocina?: boolean | null
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
          cancelada_at: string | null
          cancelada_por: string | null
          codigo: string | null
          created_at: string
          deleted_at: string | null
          departamento_id: string | null
          empresa_id: string
          es_mano_obra: boolean
          estado_id: string | null
          fecha_requerida: string | null
          id: string
          justificacion: string | null
          motivo_cancelacion: string | null
          prioridad_id: string | null
          solicitante_id: string | null
          subtipo: string | null
          terminos_ofrecidos: string | null
          updated_at: string | null
        }
        Insert: {
          autorizada_at?: string | null
          cancelada_at?: string | null
          cancelada_por?: string | null
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          departamento_id?: string | null
          empresa_id: string
          es_mano_obra?: boolean
          estado_id?: string | null
          fecha_requerida?: string | null
          id?: string
          justificacion?: string | null
          motivo_cancelacion?: string | null
          prioridad_id?: string | null
          solicitante_id?: string | null
          subtipo?: string | null
          terminos_ofrecidos?: string | null
          updated_at?: string | null
        }
        Update: {
          autorizada_at?: string | null
          cancelada_at?: string | null
          cancelada_por?: string | null
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          departamento_id?: string | null
          empresa_id?: string
          es_mano_obra?: boolean
          estado_id?: string | null
          fecha_requerida?: string | null
          id?: string
          justificacion?: string | null
          motivo_cancelacion?: string | null
          prioridad_id?: string | null
          solicitante_id?: string | null
          subtipo?: string | null
          terminos_ofrecidos?: string | null
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
          partida_id: string | null
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
          partida_id?: string | null
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
          partida_id?: string | null
          precio_estimado?: number | null
          producto_id?: string | null
          requisicion_id?: string
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requisiciones_detalle_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_partidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisiciones_detalle_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "v_partida_control"
            referencedColumns: ["partida_id"]
          },
          {
            foreignKeyName: "requisiciones_detalle_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "v_presupuesto_reconciliacion"
            referencedColumns: ["partida_id"]
          },
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
      v_cuenta_saldo_actual: {
        Row: {
          banco: string | null
          capturado_at: string | null
          cuenta_id: string | null
          empresa_id: string | null
          fecha_saldo: string | null
          moneda_id: string | null
          nombre: string | null
          saldo: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cuenta_saldos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
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
      v_partida_control: {
        Row: {
          comprometido: number | null
          concepto_id: string | null
          concepto_texto: string | null
          disponible: number | null
          ejercido: number | null
          empresa_id: string | null
          estado: string | null
          etapa: string | null
          gasto_real_manual: number | null
          pagado: number | null
          partida_id: string | null
          presupuesto_aprobado: number | null
          proyecto_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_partidas_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      v_presupuesto_reconciliacion: {
        Row: {
          baseline_id: string | null
          cambios_netos: number | null
          concepto_texto: string | null
          drift: number | null
          empresa_id: string | null
          etapa: string | null
          monto_baseline: number | null
          partida_id: string | null
          proyecto_id: string | null
          vigente: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      arrendamiento_alta: {
        Args: { p_empresa_id: string; p_lineas?: Json; p_master: Json }
        Returns: string
      }
      arrendamiento_generar_cargos: {
        Args: { p_empresa_id: string; p_periodo: string }
        Returns: number
      }
      arrendamiento_pago_registrar: {
        Args: {
          p_arrendamiento_id: string
          p_auto_aplicar?: boolean
          p_comprobante_adjunto_id?: string
          p_cuenta_bancaria_id?: string
          p_empresa_id: string
          p_fecha?: string
          p_forma_pago?: string
          p_monto: number
          p_notas?: string
          p_periodo?: string
          p_persona_id: string
          p_referencia?: string
          p_uuid_sat?: string
        }
        Returns: string
      }
      cxc_cargo_ajustar: {
        Args: { p_cargo_id: string; p_motivo?: string; p_nuevo_monto: number }
        Returns: undefined
      }
      cxc_pago_aplicar: {
        Args: { p_aplicaciones: Json; p_pago_id: string }
        Returns: number
      }
      cxc_pago_cancelar: {
        Args: { p_motivo?: string; p_pago_id: string }
        Returns: undefined
      }
      cxc_pago_registrar: {
        Args: {
          p_auto_aplicar?: boolean
          p_comprobante_adjunto_id?: string
          p_cuenta_bancaria_id?: string
          p_empresa_id: string
          p_fecha?: string
          p_forma_pago?: string
          p_fuente?: string
          p_monto: number
          p_notas?: string
          p_origen_id: string
          p_persona_id: string
          p_referencia?: string
          p_uuid_sat?: string
        }
        Returns: string
      }
      cxp_factura_alta: {
        Args: {
          p_condiciones_pago_dias?: number
          p_emisor_nombre?: string
          p_emisor_rfc?: string
          p_empresa_id: string
          p_fecha_emision?: string
          p_forma_pago_sat?: string
          p_iva?: number
          p_metodo_pago_sat?: string
          p_notas?: string
          p_orden_compra_id?: string
          p_pdf_url?: string
          p_proveedor_id: string
          p_receptor_rfc?: string
          p_retencion_isr?: number
          p_retencion_iva?: number
          p_subtotal?: number
          p_tasa_iva?: number
          p_total: number
          p_uso_cfdi?: string
          p_usuario_id?: string
          p_uuid_sat?: string
          p_xml_url?: string
        }
        Returns: string
      }
      cxp_factura_cancelar: {
        Args: { p_factura_id: string; p_motivo?: string }
        Returns: undefined
      }
      cxp_factura_desde_estimacion: {
        Args: { p_condiciones_pago_dias?: number; p_estimacion_id: string }
        Returns: string
      }
      cxp_factura_desde_estimacion_destajo: {
        Args: { p_estimacion_id: string }
        Returns: string
      }
      cxp_factura_desde_estimacion_obra_espera: {
        Args: { p_estimacion_id: string }
        Returns: string
      }
      cxp_factura_recibir_cfdi: {
        Args: {
          p_emisor_nombre?: string
          p_emisor_rfc?: string
          p_factura_id: string
          p_fecha_emision?: string
          p_forma_pago_sat?: string
          p_iva?: number
          p_metodo_pago_sat?: string
          p_receptor_rfc?: string
          p_retencion_isr?: number
          p_retencion_iva?: number
          p_subtotal?: number
          p_tasa_iva?: number
          p_total: number
          p_uso_cfdi?: string
          p_uuid_sat: string
        }
        Returns: string
      }
      cxp_factura_total_contrato: {
        Args: {
          p_condiciones_pago_dias?: number
          p_contrato_id: string
          p_factura_ref?: string
          p_fecha_emision?: string
          p_total: number
        }
        Returns: string
      }
      cxp_pago_aprobar: { Args: { p_pago_id: string }; Returns: undefined }
      cxp_pago_autorizar_y_pagar: {
        Args: {
          p_fecha_pago?: string
          p_pago_id: string
          p_referencia?: string
        }
        Returns: undefined
      }
      cxp_pago_cancelar: {
        Args: { p_motivo?: string; p_pago_id: string }
        Returns: undefined
      }
      cxp_pago_consolidar: { Args: { p_pago_ids: string[] }; Returns: string }
      cxp_pago_desde_estimacion: {
        Args: {
          p_cuenta_bancaria_id?: string
          p_estimacion_id: string
          p_fecha_programada?: string
          p_metodo_pago?: string
          p_referencia?: string
        }
        Returns: string
      }
      cxp_pago_marcar_pagado: {
        Args: {
          p_fecha_pago?: string
          p_pago_id: string
          p_referencia?: string
        }
        Returns: undefined
      }
      cxp_pago_programar: {
        Args: {
          p_aplicaciones: Json
          p_cuenta_bancaria_id?: string
          p_empresa_id: string
          p_fecha_programada?: string
          p_metodo_pago?: string
          p_notas?: string
          p_proveedor_id: string
          p_referencia?: string
        }
        Returns: string
      }
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
      fn_cxp_recalc_factura: {
        Args: { p_factura_id: string }
        Returns: undefined
      }
      fn_es_direccion: { Args: { p_empresa_id: string }; Returns: boolean }
      fn_factor_receta_a_stock: {
        Args: { p_insumo_id: string; p_unidad_receta: string }
        Returns: number
      }
      fn_factor_universal: {
        Args: { p_a: string; p_de: string }
        Returns: number
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
      fn_presupuesto_baseline_autorizar: {
        Args: { p_notas?: string; p_proyecto_id: string }
        Returns: string
      }
      fn_presupuesto_cambio_resolver: {
        Args: {
          p_cambio_id: string
          p_decision: string
          p_motivo_rechazo?: string
        }
        Returns: Json
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
      oc_recibir_linea_partida: {
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
      protocolo_compuestos: {
        Row: {
          clase: string
          color: string | null
          componentes: Json | null
          created_at: string
          dosis_objetivo: number | null
          estado: string
          fecha_fin: string | null
          fecha_inicio: string | null
          frecuencia: string | null
          id: string
          nombre: string
          notas: string | null
          procedencia: string | null
          unidad_dosis: string | null
          updated_at: string
          via: string | null
        }
        Insert: {
          clase: string
          color?: string | null
          componentes?: Json | null
          created_at?: string
          dosis_objetivo?: number | null
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          frecuencia?: string | null
          id?: string
          nombre: string
          notas?: string | null
          procedencia?: string | null
          unidad_dosis?: string | null
          updated_at?: string
          via?: string | null
        }
        Update: {
          clase?: string
          color?: string | null
          componentes?: Json | null
          created_at?: string
          dosis_objetivo?: number | null
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          frecuencia?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          procedencia?: string | null
          unidad_dosis?: string | null
          updated_at?: string
          via?: string | null
        }
        Relationships: []
      }
      protocolo_efectos: {
        Row: {
          apetito: number | null
          created_at: string
          energia: number | null
          fecha: string
          gi: number | null
          id: string
          nausea: number | null
          nota: string | null
          toma_id: string | null
        }
        Insert: {
          apetito?: number | null
          created_at?: string
          energia?: number | null
          fecha: string
          gi?: number | null
          id?: string
          nausea?: number | null
          nota?: string | null
          toma_id?: string | null
        }
        Update: {
          apetito?: number | null
          created_at?: string
          energia?: number | null
          fecha?: string
          gi?: number | null
          id?: string
          nausea?: number | null
          nota?: string | null
          toma_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "protocolo_efectos_toma_id_fkey"
            columns: ["toma_id"]
            isOneToOne: false
            referencedRelation: "protocolo_tomas"
            referencedColumns: ["id"]
          },
        ]
      }
      protocolo_tomas: {
        Row: {
          bac_ml: number | null
          compuesto_id: string
          concentracion: number | null
          created_at: string
          dosis: number
          fecha: string
          id: string
          nota: string | null
          sitio: string | null
          unidad: string | null
          unidades: number | null
          vial_mg: number | null
        }
        Insert: {
          bac_ml?: number | null
          compuesto_id: string
          concentracion?: number | null
          created_at?: string
          dosis: number
          fecha: string
          id?: string
          nota?: string | null
          sitio?: string | null
          unidad?: string | null
          unidades?: number | null
          vial_mg?: number | null
        }
        Update: {
          bac_ml?: number | null
          compuesto_id?: string
          concentracion?: number | null
          created_at?: string
          dosis?: number
          fecha?: string
          id?: string
          nota?: string | null
          sitio?: string | null
          unidad?: string | null
          unidades?: number | null
          vial_mg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "protocolo_tomas_compuesto_id_fkey"
            columns: ["compuesto_id"]
            isOneToOne: false
            referencedRelation: "protocolo_compuestos"
            referencedColumns: ["id"]
          },
        ]
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
  peptides: {
    Tables: {
      insumos: {
        Row: {
          created_at: string
          id: string
          imported_at: string | null
          productos: string | null
          proveedor: string
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          imported_at?: string | null
          productos?: string | null
          proveedor: string
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          imported_at?: string | null
          productos?: string | null
          proveedor?: string
          url?: string | null
        }
        Relationships: []
      }
      notas: {
        Row: {
          created_at: string
          cuerpo: string | null
          fecha: string | null
          fuente: string | null
          id: string
          peptido: string | null
          tags: string[] | null
          tipo: string | null
          titulo: string | null
          vendor_codigo: string | null
        }
        Insert: {
          created_at?: string
          cuerpo?: string | null
          fecha?: string | null
          fuente?: string | null
          id?: string
          peptido?: string | null
          tags?: string[] | null
          tipo?: string | null
          titulo?: string | null
          vendor_codigo?: string | null
        }
        Update: {
          created_at?: string
          cuerpo?: string | null
          fecha?: string | null
          fuente?: string | null
          id?: string
          peptido?: string | null
          tags?: string[] | null
          tipo?: string | null
          titulo?: string | null
          vendor_codigo?: string | null
        }
        Relationships: []
      }
      peptidos: {
        Row: {
          aliases: string[] | null
          cautelas: string | null
          clase: string | null
          created_at: string
          descripcion: string | null
          fuente: string | null
          id: string
          nombre: string
          protocolo_tipico: string | null
          reconstitucion: string | null
          updated_at: string
        }
        Insert: {
          aliases?: string[] | null
          cautelas?: string | null
          clase?: string | null
          created_at?: string
          descripcion?: string | null
          fuente?: string | null
          id?: string
          nombre: string
          protocolo_tipico?: string | null
          reconstitucion?: string | null
          updated_at?: string
        }
        Update: {
          aliases?: string[] | null
          cautelas?: string | null
          clase?: string | null
          created_at?: string
          descripcion?: string | null
          fuente?: string | null
          id?: string
          nombre?: string
          protocolo_tipico?: string | null
          reconstitucion?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tests: {
        Row: {
          batch: string | null
          created_at: string
          endotoxin: string | null
          expected_mass_mg: number | null
          file_name: string | null
          id: string
          imported_at: string | null
          lab_url: string | null
          mass_mg: number | null
          peptido: string | null
          purity_pct: number | null
          test_date: string | null
          test_lab: string | null
          tfa: string | null
          vendor_codigo: string | null
        }
        Insert: {
          batch?: string | null
          created_at?: string
          endotoxin?: string | null
          expected_mass_mg?: number | null
          file_name?: string | null
          id?: string
          imported_at?: string | null
          lab_url?: string | null
          mass_mg?: number | null
          peptido?: string | null
          purity_pct?: number | null
          test_date?: string | null
          test_lab?: string | null
          tfa?: string | null
          vendor_codigo?: string | null
        }
        Update: {
          batch?: string | null
          created_at?: string
          endotoxin?: string | null
          expected_mass_mg?: number | null
          file_name?: string | null
          id?: string
          imported_at?: string | null
          lab_url?: string | null
          mass_mg?: number | null
          peptido?: string | null
          purity_pct?: number | null
          test_date?: string | null
          test_lab?: string | null
          tfa?: string | null
          vendor_codigo?: string | null
        }
        Relationships: []
      }
      vendors: {
        Row: {
          china_warehouse: boolean | null
          codigo: string
          created_at: string
          estado: string
          eu_warehouse: boolean | null
          fuente_url: string | null
          garantia: string | null
          id: string
          imported_at: string | null
          metodos_pago: string | null
          moneda: string | null
          nombre: string | null
          nota_personal: string | null
          notas: string | null
          precio_mg: number | null
          precio_mg_sale: number | null
          primer_contacto: string | null
          us_warehouse: boolean | null
        }
        Insert: {
          china_warehouse?: boolean | null
          codigo: string
          created_at?: string
          estado?: string
          eu_warehouse?: boolean | null
          fuente_url?: string | null
          garantia?: string | null
          id?: string
          imported_at?: string | null
          metodos_pago?: string | null
          moneda?: string | null
          nombre?: string | null
          nota_personal?: string | null
          notas?: string | null
          precio_mg?: number | null
          precio_mg_sale?: number | null
          primer_contacto?: string | null
          us_warehouse?: boolean | null
        }
        Update: {
          china_warehouse?: boolean | null
          codigo?: string
          created_at?: string
          estado?: string
          eu_warehouse?: boolean | null
          fuente_url?: string | null
          garantia?: string | null
          id?: string
          imported_at?: string | null
          metodos_pago?: string | null
          moneda?: string | null
          nombre?: string | null
          nota_personal?: string | null
          notas?: string | null
          precio_mg?: number | null
          precio_mg_sale?: number | null
          primer_contacto?: string | null
          us_warehouse?: boolean | null
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
      pos_cuentas: {
        Row: {
          abierta_at: string
          abierta_por: string
          cancel_razon: string | null
          cerrada_at: string | null
          client_action_id: string
          cliente_nombre: string | null
          created_at: string
          cuenta_origen_id: string | null
          descuento_total: number
          empresa_id: string
          estacion_id: string
          estado: string
          id: string
          notas: string | null
          playtomic_folio: string | null
          subtotal: number
          tipo_venta: string
          total: number
          ubicacion: string | null
          updated_at: string
        }
        Insert: {
          abierta_at?: string
          abierta_por: string
          cancel_razon?: string | null
          cerrada_at?: string | null
          client_action_id: string
          cliente_nombre?: string | null
          created_at?: string
          cuenta_origen_id?: string | null
          descuento_total?: number
          empresa_id: string
          estacion_id: string
          estado?: string
          id?: string
          notas?: string | null
          playtomic_folio?: string | null
          subtotal?: number
          tipo_venta?: string
          total?: number
          ubicacion?: string | null
          updated_at?: string
        }
        Update: {
          abierta_at?: string
          abierta_por?: string
          cancel_razon?: string | null
          cerrada_at?: string | null
          client_action_id?: string
          cliente_nombre?: string | null
          created_at?: string
          cuenta_origen_id?: string | null
          descuento_total?: number
          empresa_id?: string
          estacion_id?: string
          estado?: string
          id?: string
          notas?: string | null
          playtomic_folio?: string | null
          subtotal?: number
          tipo_venta?: string
          total?: number
          ubicacion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_cuentas_cuenta_origen_id_fkey"
            columns: ["cuenta_origen_id"]
            isOneToOne: false
            referencedRelation: "pos_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_cuentas_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "pos_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_estaciones: {
        Row: {
          activa: boolean
          auth_user_id: string | null
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          tipo: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          auth_user_id?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          tipo: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          auth_user_id?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      pos_eventos: {
        Row: {
          actor_auth_uid: string | null
          actor_empleado_id: string | null
          actor_empleado_nombre: string | null
          autorizado_por: string | null
          client_action_id: string | null
          created_at: string
          cuenta_id: string | null
          datos_antes: Json | null
          datos_despues: Json | null
          empresa_id: string
          estacion_id: string | null
          evento: string
          id: string
          item_id: string | null
          pago_id: string | null
          razon: string | null
        }
        Insert: {
          actor_auth_uid?: string | null
          actor_empleado_id?: string | null
          actor_empleado_nombre?: string | null
          autorizado_por?: string | null
          client_action_id?: string | null
          created_at?: string
          cuenta_id?: string | null
          datos_antes?: Json | null
          datos_despues?: Json | null
          empresa_id: string
          estacion_id?: string | null
          evento: string
          id?: string
          item_id?: string | null
          pago_id?: string | null
          razon?: string | null
        }
        Update: {
          actor_auth_uid?: string | null
          actor_empleado_id?: string | null
          actor_empleado_nombre?: string | null
          autorizado_por?: string | null
          client_action_id?: string | null
          created_at?: string
          cuenta_id?: string | null
          datos_antes?: Json | null
          datos_despues?: Json | null
          empresa_id?: string
          estacion_id?: string | null
          evento?: string
          id?: string
          item_id?: string | null
          pago_id?: string | null
          razon?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_eventos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "pos_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_eventos_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "pos_estaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_eventos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "pos_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_eventos_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pos_pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_items: {
        Row: {
          cantidad: number
          categoria_id: string | null
          categoria_nombre: string | null
          created_at: string
          cuenta_id: string
          descuento_autorizado_por: string | null
          descuento_pct: number
          descuento_razon: string | null
          empresa_id: string
          entregado_at: string | null
          enviado_cocina_at: string | null
          estado: string
          id: string
          listo_at: string | null
          notas: string | null
          precio_unitario: number
          producto_id: string
          producto_nombre: string
          ronda_id: string
          updated_at: string
          va_a_cocina: boolean
          void_por: string | null
          void_razon: string | null
        }
        Insert: {
          cantidad: number
          categoria_id?: string | null
          categoria_nombre?: string | null
          created_at?: string
          cuenta_id: string
          descuento_autorizado_por?: string | null
          descuento_pct?: number
          descuento_razon?: string | null
          empresa_id: string
          entregado_at?: string | null
          enviado_cocina_at?: string | null
          estado?: string
          id?: string
          listo_at?: string | null
          notas?: string | null
          precio_unitario: number
          producto_id: string
          producto_nombre: string
          ronda_id: string
          updated_at?: string
          va_a_cocina?: boolean
          void_por?: string | null
          void_razon?: string | null
        }
        Update: {
          cantidad?: number
          categoria_id?: string | null
          categoria_nombre?: string | null
          created_at?: string
          cuenta_id?: string
          descuento_autorizado_por?: string | null
          descuento_pct?: number
          descuento_razon?: string | null
          empresa_id?: string
          entregado_at?: string | null
          enviado_cocina_at?: string | null
          estado?: string
          id?: string
          listo_at?: string | null
          notas?: string | null
          precio_unitario?: number
          producto_id?: string
          producto_nombre?: string
          ronda_id?: string
          updated_at?: string
          va_a_cocina?: boolean
          void_por?: string | null
          void_razon?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_items_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "pos_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_inventario_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_producto_metricas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_producto_tendencia_semanal"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pos_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_producto_ultima_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pos_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_grupo"
            referencedColumns: ["padre_id"]
          },
          {
            foreignKeyName: "pos_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_tabla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_productos_categoria"
            referencedColumns: ["producto_catalogo_id"]
          },
          {
            foreignKeyName: "pos_items_ronda_id_fkey"
            columns: ["ronda_id"]
            isOneToOne: false
            referencedRelation: "pos_rondas"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_operadores: {
        Row: {
          activo: boolean
          created_at: string
          empleado_id: string
          empresa_id: string
          id: string
          pin_hash: string
          puede_autorizar: boolean
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empleado_id: string
          empresa_id: string
          id?: string
          pin_hash: string
          puede_autorizar?: boolean
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          empleado_id?: string
          empresa_id?: string
          id?: string
          pin_hash?: string
          puede_autorizar?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      pos_pagos: {
        Row: {
          cambio: number | null
          client_action_id: string
          corte_id: string
          created_at: string
          cuenta_id: string
          empresa_id: string
          id: string
          metodo: string
          monto: number
          propina: number
          recibido: number | null
          referencia: string | null
          registrado_por: string
          reversa_de: string | null
        }
        Insert: {
          cambio?: number | null
          client_action_id: string
          corte_id: string
          created_at?: string
          cuenta_id: string
          empresa_id: string
          id?: string
          metodo: string
          monto: number
          propina?: number
          recibido?: number | null
          referencia?: string | null
          registrado_por: string
          reversa_de?: string | null
        }
        Update: {
          cambio?: number | null
          client_action_id?: string
          corte_id?: string
          created_at?: string
          cuenta_id?: string
          empresa_id?: string
          id?: string
          metodo?: string
          monto?: number
          propina?: number
          recibido?: number | null
          referencia?: string | null
          registrado_por?: string
          reversa_de?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_pagos_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_lista"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_pagos_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "v_cortes_totales"
            referencedColumns: ["corte_id"]
          },
          {
            foreignKeyName: "pos_pagos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "pos_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_pagos_reversa_de_fkey"
            columns: ["reversa_de"]
            isOneToOne: false
            referencedRelation: "pos_pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_rondas: {
        Row: {
          capturada_por: string
          client_action_id: string
          created_at: string
          cuenta_id: string
          empresa_id: string
          estacion_id: string
          id: string
          numero: number
        }
        Insert: {
          capturada_por: string
          client_action_id: string
          created_at?: string
          cuenta_id: string
          empresa_id: string
          estacion_id: string
          id?: string
          numero: number
        }
        Update: {
          capturada_por?: string
          client_action_id?: string
          created_at?: string
          cuenta_id?: string
          empresa_id?: string
          estacion_id?: string
          id?: string
          numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_rondas_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "pos_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_rondas_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "pos_estaciones"
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
            foreignKeyName: "waitry_pagos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_pagos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos_con_fantasmas"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_pagos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos_reversa_sospechosa"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_pagos_order_id_fkey"
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
            foreignKeyName: "waitry_productos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_productos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos_con_fantasmas"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_productos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos_reversa_sospechosa"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_productos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "waitry_pedidos"
            referencedColumns: ["order_id"]
          },
        ]
      }
    }
    Views: {
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
      v_ventas_canonicas: {
        Row: {
          corte_id: string | null
          estado: string | null
          fecha: string | null
          propina: number | null
          source: string | null
          total: number | null
          ubicacion: string | null
          venta_ref: string | null
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
            foreignKeyName: "waitry_productos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_productos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos_con_fantasmas"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_productos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_waitry_pedidos_reversa_sospechosa"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "waitry_productos_order_id_fkey"
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
      fn_pos_abrir_cuenta: {
        Args: {
          p_client_action_id: string
          p_cliente_nombre?: string
          p_estacion_id: string
          p_pin: string
          p_playtomic_folio?: string
          p_tipo_venta?: string
          p_ubicacion?: string
        }
        Returns: string
      }
      fn_pos_accion_ya_procesada: {
        Args: { p_client_action_id: string }
        Returns: boolean
      }
      fn_pos_admin_guardar_operador: {
        Args: {
          p_activo?: boolean
          p_empleado_id: string
          p_pin?: string
          p_puede_autorizar?: boolean
        }
        Returns: string
      }
      fn_pos_admin_upsert_estacion: {
        Args: {
          p_activa?: boolean
          p_empresa_id: string
          p_id?: string
          p_nombre: string
          p_tipo: string
        }
        Returns: string
      }
      fn_pos_agregar_ronda: {
        Args: {
          p_client_action_id: string
          p_cuenta_id: string
          p_items: Json
          p_pin: string
          p_pin_autorizador?: string
        }
        Returns: string
      }
      fn_pos_cancelar_cuenta: {
        Args: {
          p_client_action_id: string
          p_cuenta_id: string
          p_pin: string
          p_pin_autorizador?: string
          p_razon: string
        }
        Returns: undefined
      }
      fn_pos_cobrar: {
        Args: {
          p_client_action_id: string
          p_cuenta_id: string
          p_pagos: Json
          p_pin: string
        }
        Returns: undefined
      }
      fn_pos_enviar_cocina: {
        Args: { p_client_action_id: string; p_cuenta_id: string; p_pin: string }
        Returns: number
      }
      fn_pos_kds_marcar: {
        Args: {
          p_client_action_id: string
          p_item_id: string
          p_nuevo_estado: string
        }
        Returns: undefined
      }
      fn_pos_log_evento: {
        Args: {
          p_actor: string
          p_antes?: Json
          p_autorizado_por?: string
          p_client_action_id?: string
          p_cuenta?: string
          p_despues?: Json
          p_empresa_id: string
          p_estacion: string
          p_evento: string
          p_item?: string
          p_pago?: string
          p_razon?: string
        }
        Returns: string
      }
      fn_pos_mover_cuenta: {
        Args: {
          p_client_action_id: string
          p_cuenta_id: string
          p_pin: string
          p_ubicacion: string
        }
        Returns: undefined
      }
      fn_pos_nota_cuenta: {
        Args: {
          p_client_action_id: string
          p_cuenta_id: string
          p_nota: string
          p_pin: string
        }
        Returns: undefined
      }
      fn_pos_recalcular_cuenta: {
        Args: { p_cuenta_id: string }
        Returns: undefined
      }
      fn_pos_resolver_autorizador: {
        Args: { p_empresa_id: string; p_pin: string }
        Returns: string
      }
      fn_pos_resolver_operador: {
        Args: { p_empresa_id: string; p_pin: string }
        Returns: string
      }
      fn_pos_void_item: {
        Args: {
          p_client_action_id: string
          p_item_id: string
          p_pin: string
          p_pin_autorizador?: string
          p_razon: string
        }
        Returns: undefined
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
  sanren: {
    Tables: {
      propiedades: {
        Row: {
          activo: boolean
          created_at: string
          direccion: string | null
          id: string
          nombre: string
          notas: string | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          direccion?: string | null
          id?: string
          nombre: string
          notas?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          direccion?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recibos: {
        Row: {
          coda_row_id: string | null
          comprobante_adjunto_id: string | null
          created_at: string
          extraccion: Json | null
          extraccion_at: string | null
          fecha_pago: string | null
          fecha_recibo: string
          fecha_vencimiento: string | null
          folio: string | null
          id: string
          iva: number | null
          lectura_consumo: number | null
          lectura_produccion: number | null
          metodo_pago: string | null
          moneda: string
          monto: number | null
          notas: string | null
          pagado: boolean
          periodo: string
          recibo_adjunto_id: string | null
          servicio_id: string
          subtotal: number | null
          tarifa: string | null
          updated_at: string
        }
        Insert: {
          coda_row_id?: string | null
          comprobante_adjunto_id?: string | null
          created_at?: string
          extraccion?: Json | null
          extraccion_at?: string | null
          fecha_pago?: string | null
          fecha_recibo: string
          fecha_vencimiento?: string | null
          folio?: string | null
          id?: string
          iva?: number | null
          lectura_consumo?: number | null
          lectura_produccion?: number | null
          metodo_pago?: string | null
          moneda?: string
          monto?: number | null
          notas?: string | null
          pagado?: boolean
          periodo: string
          recibo_adjunto_id?: string | null
          servicio_id: string
          subtotal?: number | null
          tarifa?: string | null
          updated_at?: string
        }
        Update: {
          coda_row_id?: string | null
          comprobante_adjunto_id?: string | null
          created_at?: string
          extraccion?: Json | null
          extraccion_at?: string | null
          fecha_pago?: string | null
          fecha_recibo?: string
          fecha_vencimiento?: string | null
          folio?: string | null
          id?: string
          iva?: number | null
          lectura_consumo?: number | null
          lectura_produccion?: number | null
          metodo_pago?: string | null
          moneda?: string
          monto?: number | null
          notas?: string | null
          pagado?: boolean
          periodo?: string
          recibo_adjunto_id?: string | null
          servicio_id?: string
          subtotal?: number | null
          tarifa?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recibos_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios: {
        Row: {
          activo: boolean
          created_at: string
          domiciliado: boolean
          id: string
          notas: string | null
          numero_cuenta: string | null
          numero_medidor: string | null
          propiedad_id: string
          proveedor: string | null
          tiene_produccion: boolean
          tipo: string
          unidad_consumo: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          domiciliado?: boolean
          id?: string
          notas?: string | null
          numero_cuenta?: string | null
          numero_medidor?: string | null
          propiedad_id: string
          proveedor?: string | null
          tiene_produccion?: boolean
          tipo: string
          unidad_consumo?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          domiciliado?: boolean
          id?: string
          notas?: string | null
          numero_cuenta?: string | null
          numero_medidor?: string | null
          propiedad_id?: string
          proveedor?: string | null
          tiene_produccion?: boolean
          tipo?: string
          unidad_consumo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicios_propiedad_id_fkey"
            columns: ["propiedad_id"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_recibos: {
        Row: {
          coda_row_id: string | null
          comprobante_adjunto_id: string | null
          consumo_periodo: number | null
          costo_unitario: number | null
          delta_monto_mom: number | null
          extraccion: Json | null
          extraccion_at: string | null
          fecha_pago: string | null
          fecha_recibo: string | null
          fecha_vencimiento: string | null
          folio: string | null
          id: string | null
          iva: number | null
          lectura_consumo: number | null
          lectura_consumo_anterior: number | null
          lectura_produccion: number | null
          lectura_produccion_anterior: number | null
          metodo_pago: string | null
          moneda: string | null
          monto: number | null
          monto_anterior: number | null
          notas: string | null
          pagado: boolean | null
          periodo: string | null
          produccion_periodo: number | null
          propiedad_id: string | null
          propiedad_nombre: string | null
          proveedor: string | null
          recibo_adjunto_id: string | null
          saldo_neto: number | null
          servicio_id: string | null
          servicio_tipo: string | null
          subtotal: number | null
          tarifa: string | null
          tiene_produccion: boolean | null
          unidad_consumo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recibos_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_propiedad_id_fkey"
            columns: ["propiedad_id"]
            isOneToOne: false
            referencedRelation: "propiedades"
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
  peptides: {
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
  sanren: {
    Enums: {},
  },
} as const

