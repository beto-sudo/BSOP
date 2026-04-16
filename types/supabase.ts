// =============================================================================
// Supabase TypeScript types — AUTO-GENERATED. DO NOT EDIT BY HAND.
// =============================================================================
//
// Este archivo se regenera a partir del esquema vivo del proyecto Supabase
// `ybklderteyhuugzfmxbi` (db.ybklderteyhuugzfmxbi.supabase.co).
//
// Cómo regenerarlo:
//
//   1. En GitHub → Actions → "Supabase Types" → Run workflow.
//      Requiere el secret `SUPABASE_ACCESS_TOKEN` configurado a nivel repo.
//      El workflow corre `supabase gen types typescript` contra todos los
//      esquemas de negocio (core, erp, rdb, dilesa, playtomic, public) y
//      commitea el resultado si hubo cambios.
//
//   2. Localmente (requiere el Supabase CLI):
//      npm run db:types
//
// El contenido inicial de este archivo corresponde SOLO al esquema `public`
// generado vía la MCP de Supabase. Los esquemas de negocio (core, erp, rdb,
// dilesa, playtomic) se llenarán en el primer run del workflow.
// =============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.4';
  };
  public: {
    Tables: {
      expense_splits: {
        Row: {
          expense_id: string | null;
          id: string;
          participant_id: string | null;
        };
        Insert: {
          expense_id?: string | null;
          id?: string;
          participant_id?: string | null;
        };
        Update: {
          expense_id?: string | null;
          id?: string;
          participant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_splits_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'trip_expenses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expense_splits_participant_id_fkey';
            columns: ['participant_id'];
            isOneToOne: false;
            referencedRelation: 'trip_participants';
            referencedColumns: ['id'];
          },
        ];
      };
      profile: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          email: string;
          first_name: string | null;
          id: string;
          is_active: boolean | null;
          last_name: string | null;
          locale: string | null;
          updated_at: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          email?: string;
          first_name?: string | null;
          id: string;
          is_active?: boolean | null;
          last_name?: string | null;
          locale?: string | null;
          updated_at?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          email?: string;
          first_name?: string | null;
          id?: string;
          is_active?: boolean | null;
          last_name?: string | null;
          locale?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      user_presence: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          current_module: string;
          current_path: string;
          display_name: string | null;
          email: string;
          last_seen_at: string;
          status: string;
          user_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          current_module?: string;
          current_path?: string;
          display_name?: string | null;
          email: string;
          last_seen_at?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          current_module?: string;
          current_path?: string;
          display_name?: string | null;
          email?: string;
          last_seen_at?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  // Los siguientes esquemas se llenarán al correr el workflow "Supabase Types".
  // Por ahora quedan como `never` para que TypeScript no rompa si alguien
  // referencia el tipo Database antes del primer run.
  core: {
    Tables: { [_ in never]: never };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  erp: {
    Tables: { [_ in never]: never };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  rdb: {
    Tables: { [_ in never]: never };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  dilesa: {
    Tables: { [_ in never]: never };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  playtomic: {
    Tables: { [_ in never]: never };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
  core: { Enums: {} },
  erp: { Enums: {} },
  rdb: { Enums: {} },
  dilesa: { Enums: {} },
  playtomic: { Enums: {} },
} as const;
