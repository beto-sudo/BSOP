// ==============================================================================
// Auto-generated Supabase database types.
// Last regenerated: 2026-04-20T09:04:30Z
// Project ref: ybklderteyhuugzfmxbi
// Schemas: public, core, erp, rdb, dilesa, playtomic
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
      empresas: {
        Row: {
          activa: boolean | null
          actividades_economicas: Json | null
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
          fecha_inicio_operaciones: string | null
          header_url: string | null
          id: string
          id_cif: string | null
          logo_url: string | null
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
        }
        Insert: {
          activa?: boolean | null
          actividades_economicas?: Json | null
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
          fecha_inicio_operaciones?: string | null
          header_url?: string | null
          id?: string
          id_cif?: string | null
          logo_url?: string | null
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
        }
        Update: {
          activa?: boolean | null
          actividades_economicas?: Json | null
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
          fecha_inicio_operaciones?: string | null
          header_url?: string | null
          id?: string
          id_cif?: string | null
          logo_url?: string | null
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
        }
        Relationships: []
      }
      modulos: {
        Row: {
          descripcion: string | null
          id: string
          nombre: string
          slug: string
        }
        Insert: {
          descripcion?: string | null
          id?: string
          nombre: string
          slug: string
        }
        Update: {
          descripcion?: string | null
          id?: string
          nombre?: string
          slug?: string
        }
        Relationships: []
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
      roles: {
        Row: {
          created_at: string | null
          descripcion: string | null
          empresa_id: string | null
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string | null
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
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
      usuarios: {
        Row: {
          activo: boolean | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          rol: string
          welcome_sent_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          rol?: string
          welcome_sent_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
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
          creado_por: string | null
          created_at: string
          deleted_at: string | null
          empresa_id: string
          fecha_emision: string | null
          fecha_vencimiento: string | null
          id: string
          notaria: string | null
          notario_proveedor_id: string | null
          notas: string | null
          numero_documento: string | null
          subtipo_meta: Json | null
          tipo: string | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          archivo_url?: string | null
          creado_por?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id: string
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          id?: string
          notaria?: string | null
          notario_proveedor_id?: string | null
          notas?: string | null
          numero_documento?: string | null
          subtipo_meta?: Json | null
          tipo?: string | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          archivo_url?: string | null
          creado_por?: string | null
          created_at?: string
          deleted_at?: string | null
          empresa_id?: string
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          id?: string
          notaria?: string | null
          notario_proveedor_id?: string | null
          notas?: string | null
          numero_documento?: string | null
          subtipo_meta?: Json | null
          tipo?: string | null
          titulo?: string
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
          {
            foreignKeyName: "requisiciones_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisiciones_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "v_empleados_full"
            referencedColumns: ["empleado_id"]
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
          task_id?: string
          tipo?: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
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
      [_ in never]: never
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
      expense_splits: {
        Row: {
          expense_id: string | null
          id: string
          participant_id: string | null
        }
        Insert: {
          expense_id?: string | null
          id?: string
          participant_id?: string | null
        }
        Update: {
          expense_id?: string | null
          id?: string
          participant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "trip_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "trip_participants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      health_ingest_snapshot_2025_pre: {
        Row: {
          captured_at: string | null
          first_date: string | null
          last_date: string | null
          metric_name: string
          rows_2025: number | null
          rows_total: number | null
        }
        Insert: {
          captured_at?: string | null
          first_date?: string | null
          last_date?: string | null
          metric_name: string
          rows_2025?: number | null
          rows_total?: number | null
        }
        Update: {
          captured_at?: string | null
          first_date?: string | null
          last_date?: string | null
          metric_name?: string
          rows_2025?: number | null
          rows_total?: number | null
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
      profile: {
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
      trip_expenses: {
        Row: {
          amount: number
          base_amount: number
          base_currency: string
          category: string | null
          concept: string
          created_at: string | null
          currency: string
          exchange_rate: number | null
          expense_date: string | null
          id: string
          notes: string | null
          paid_by: string | null
          trip_slug: string
        }
        Insert: {
          amount: number
          base_amount: number
          base_currency?: string
          category?: string | null
          concept: string
          created_at?: string | null
          currency?: string
          exchange_rate?: number | null
          expense_date?: string | null
          id?: string
          notes?: string | null
          paid_by?: string | null
          trip_slug: string
        }
        Update: {
          amount?: number
          base_amount?: number
          base_currency?: string
          category?: string | null
          concept?: string
          created_at?: string | null
          currency?: string
          exchange_rate?: number | null
          expense_date?: string | null
          id?: string
          notes?: string | null
          paid_by?: string | null
          trip_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "trip_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_participants: {
        Row: {
          created_at: string | null
          emoji: string | null
          id: string
          name: string
          trip_slug: string
        }
        Insert: {
          created_at?: string | null
          emoji?: string | null
          id?: string
          name: string
          trip_slug: string
        }
        Update: {
          created_at?: string | null
          emoji?: string | null
          id?: string
          name?: string
          trip_slug?: string
        }
        Relationships: []
      }
      trip_share_tokens: {
        Row: {
          created_at: string | null
          id: string
          token: string
          trip_slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          token?: string
          trip_slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          token?: string
          trip_slug?: string
        }
        Relationships: []
      }
      usage_by_model: {
        Row: {
          cost: number | null
          formatted_cost: string | null
          label: string | null
          messages: number | null
          model: string
          provider: string | null
          tokens: number | null
        }
        Insert: {
          cost?: number | null
          formatted_cost?: string | null
          label?: string | null
          messages?: number | null
          model: string
          provider?: string | null
          tokens?: number | null
        }
        Update: {
          cost?: number | null
          formatted_cost?: string | null
          label?: string | null
          messages?: number | null
          model?: string
          provider?: string | null
          tokens?: number | null
        }
        Relationships: []
      }
      usage_by_provider: {
        Row: {
          cost: number | null
          formatted_cost: string | null
          messages: number | null
          provider: string
          tokens: number | null
        }
        Insert: {
          cost?: number | null
          formatted_cost?: string | null
          messages?: number | null
          provider: string
          tokens?: number | null
        }
        Update: {
          cost?: number | null
          formatted_cost?: string | null
          messages?: number | null
          provider?: string
          tokens?: number | null
        }
        Relationships: []
      }
      usage_daily: {
        Row: {
          assistant_messages: number | null
          cost: number | null
          date: string
          formatted_cost: string | null
          messages: number | null
          sessions: number | null
          tokens: number | null
          tool_calls: number | null
          user_messages: number | null
        }
        Insert: {
          assistant_messages?: number | null
          cost?: number | null
          date: string
          formatted_cost?: string | null
          messages?: number | null
          sessions?: number | null
          tokens?: number | null
          tool_calls?: number | null
          user_messages?: number | null
        }
        Update: {
          assistant_messages?: number | null
          cost?: number | null
          date?: string
          formatted_cost?: string | null
          messages?: number | null
          sessions?: number | null
          tokens?: number | null
          tool_calls?: number | null
          user_messages?: number | null
        }
        Relationships: []
      }
      usage_daily_models: {
        Row: {
          cost: number | null
          date: string | null
          id: number
          label: string | null
          messages: number | null
          model: string | null
          tokens: number | null
        }
        Insert: {
          cost?: number | null
          date?: string | null
          id?: number
          label?: string | null
          messages?: number | null
          model?: string | null
          tokens?: number | null
        }
        Update: {
          cost?: number | null
          date?: string | null
          id?: number
          label?: string | null
          messages?: number | null
          model?: string | null
          tokens?: number | null
        }
        Relationships: []
      }
      usage_messages: {
        Row: {
          cache_creation_tokens: number | null
          cache_read_tokens: number | null
          cost: number | null
          description: string | null
          duration_ms: number | null
          formatted_cost: string | null
          id: number
          input_tokens: number | null
          model: string | null
          model_label: string | null
          output_tokens: number | null
          provider: string | null
          session_id: string | null
          skill_name: string | null
          status: string | null
          timestamp: string | null
          total_tokens: number | null
        }
        Insert: {
          cache_creation_tokens?: number | null
          cache_read_tokens?: number | null
          cost?: number | null
          description?: string | null
          duration_ms?: number | null
          formatted_cost?: string | null
          id?: number
          input_tokens?: number | null
          model?: string | null
          model_label?: string | null
          output_tokens?: number | null
          provider?: string | null
          session_id?: string | null
          skill_name?: string | null
          status?: string | null
          timestamp?: string | null
          total_tokens?: number | null
        }
        Update: {
          cache_creation_tokens?: number | null
          cache_read_tokens?: number | null
          cost?: number | null
          description?: string | null
          duration_ms?: number | null
          formatted_cost?: string | null
          id?: number
          input_tokens?: number | null
          model?: string | null
          model_label?: string | null
          output_tokens?: number | null
          provider?: string | null
          session_id?: string | null
          skill_name?: string | null
          status?: string | null
          timestamp?: string | null
          total_tokens?: number | null
        }
        Relationships: []
      }
      usage_summary: {
        Row: {
          assistant_messages: number | null
          avg_cost_per_session: number | null
          cache_hit_rate: number | null
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          cost_this_month: number | null
          cost_this_week: number | null
          cost_today: number | null
          id: number
          input_tokens: number | null
          messages: number | null
          output_tokens: number | null
          session_count: number | null
          synced_at: string | null
          tool_calls: number | null
          tool_results: number | null
          total_cost: number | null
          total_tokens: number | null
          user_messages: number | null
        }
        Insert: {
          assistant_messages?: number | null
          avg_cost_per_session?: number | null
          cache_hit_rate?: number | null
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          cost_this_month?: number | null
          cost_this_week?: number | null
          cost_today?: number | null
          id?: number
          input_tokens?: number | null
          messages?: number | null
          output_tokens?: number | null
          session_count?: number | null
          synced_at?: string | null
          tool_calls?: number | null
          tool_results?: number | null
          total_cost?: number | null
          total_tokens?: number | null
          user_messages?: number | null
        }
        Update: {
          assistant_messages?: number | null
          avg_cost_per_session?: number | null
          cache_hit_rate?: number | null
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          cost_this_month?: number | null
          cost_this_week?: number | null
          cost_today?: number | null
          id?: number
          input_tokens?: number | null
          messages?: number | null
          output_tokens?: number | null
          session_count?: number | null
          synced_at?: string | null
          tool_calls?: number | null
          tool_results?: number | null
          total_cost?: number | null
          total_tokens?: number | null
          user_messages?: number | null
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
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
