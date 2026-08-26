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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json
          entity: string
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      order_item_additions: {
        Row: {
          addition_name: string
          created_at: string
          id: string
          order_item_id: string
          product_id: string
          quantity_per_item: number
          unit_price: number
        }
        Insert: {
          addition_name: string
          created_at?: string
          id?: string
          order_item_id: string
          product_id: string
          quantity_per_item?: number
          unit_price: number
        }
        Update: {
          addition_name?: string
          created_at?: string
          id?: string
          order_item_id?: string
          product_id?: string
          quantity_per_item?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_additions_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_additions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_from_status:
            | Database["public"]["Enums"]["order_item_cancellation_origin_status"]
            | null
          created_at: string
          delivered_at: string | null
          id: string
          line_number: number
          notes: string | null
          order_id: string
          preparation_station: Database["public"]["Enums"]["preparation_station"]
          preparing_at: string | null
          product_id: string
          product_name: string
          quantity: number
          ready_at: string | null
          status: Database["public"]["Enums"]["order_item_status"]
          unit_price: number
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_from_status?:
            | Database["public"]["Enums"]["order_item_cancellation_origin_status"]
            | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          line_number: number
          notes?: string | null
          order_id: string
          preparation_station: Database["public"]["Enums"]["preparation_station"]
          preparing_at?: string | null
          product_id: string
          product_name: string
          quantity: number
          ready_at?: string | null
          status?: Database["public"]["Enums"]["order_item_status"]
          unit_price: number
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_from_status?:
            | Database["public"]["Enums"]["order_item_cancellation_origin_status"]
            | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          line_number?: number
          notes?: string | null
          order_id?: string
          preparation_station?: Database["public"]["Enums"]["preparation_station"]
          preparing_at?: string | null
          product_id?: string
          product_name?: string
          quantity?: number
          ready_at?: string | null
          status?: Database["public"]["Enums"]["order_item_status"]
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          notes: string | null
          sent_at: string
          sequence_number: number
          service_session_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          sent_at?: string
          sequence_number: number
          service_session_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          sent_at?: string
          sequence_number?: number
          service_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_service_session_id_fkey"
            columns: ["service_session_id"]
            isOneToOne: false
            referencedRelation: "service_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          business_amount: number
          customer_total: number
          fee_amount: number
          fee_rate: number
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at: string
          received_by: string
          service_session_id: string
          shift_id: string
        }
        Insert: {
          business_amount: number
          customer_total: number
          fee_amount?: number
          fee_rate?: number
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at?: string
          received_by: string
          service_session_id: string
          shift_id: string
        }
        Update: {
          business_amount?: number
          customer_total?: number
          fee_amount?: number
          fee_rate?: number
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string
          received_by?: string
          service_session_id?: string
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_service_session_id_fkey"
            columns: ["service_session_id"]
            isOneToOne: false
            referencedRelation: "service_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_session_shift_consistent"
            columns: ["service_session_id", "shift_id"]
            isOneToOne: false
            referencedRelation: "service_sessions"
            referencedColumns: ["id", "shift_id"]
          },
          {
            foreignKeyName: "payments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          allows_additions: boolean
          category_id: string
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          is_active: boolean
          is_available: boolean
          name: string
          preparation_station:
            | Database["public"]["Enums"]["preparation_station"]
            | null
          price: number
          updated_at: string
        }
        Insert: {
          allows_additions?: boolean
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          is_available?: boolean
          name: string
          preparation_station?:
            | Database["public"]["Enums"]["preparation_station"]
            | null
          price: number
          updated_at?: string
        }
        Update: {
          allows_additions?: boolean
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          is_available?: boolean
          name?: string
          preparation_station?:
            | Database["public"]["Enums"]["preparation_station"]
            | null
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_email: string
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string
        }
        Insert: {
          auth_email: string
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username: string
        }
        Update: {
          auth_email?: string
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      service_points: {
        Row: {
          id: string
          is_active: boolean
          name: string
          sort_order: number
          type: Database["public"]["Enums"]["service_point_type"]
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          type: Database["public"]["Enums"]["service_point_type"]
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          type?: Database["public"]["Enums"]["service_point_type"]
        }
        Relationships: []
      }
      service_sessions: {
        Row: {
          cancellation_reason: string | null
          closed_at: string | null
          closed_by: string | null
          id: string
          opened_at: string
          opened_by: string
          service_point_id: string
          shift_id: string
          status: Database["public"]["Enums"]["session_status"]
        }
        Insert: {
          cancellation_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          opened_at?: string
          opened_by: string
          service_point_id: string
          shift_id: string
          status?: Database["public"]["Enums"]["session_status"]
        }
        Update: {
          cancellation_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          opened_at?: string
          opened_by?: string
          service_point_id?: string
          shift_id?: string
          status?: Database["public"]["Enums"]["session_status"]
        }
        Relationships: [
          {
            foreignKeyName: "service_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_sessions_service_point_id_fkey"
            columns: ["service_point_id"]
            isOneToOne: false
            referencedRelation: "service_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_sessions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_closures: {
        Row: {
          business_sales_total: number
          cancelled_sessions_count: number
          card_fee_total: number
          card_total: number
          cash_total: number
          closed_by: string
          created_at: string
          customer_card_total: number
          id: string
          orders_count: number
          report_path: string | null
          service_sessions_count: number
          shift_id: string
          summary: Json
          yape_total: number
        }
        Insert: {
          business_sales_total: number
          cancelled_sessions_count?: number
          card_fee_total?: number
          card_total?: number
          cash_total?: number
          closed_by: string
          created_at?: string
          customer_card_total?: number
          id?: string
          orders_count?: number
          report_path?: string | null
          service_sessions_count?: number
          shift_id: string
          summary?: Json
          yape_total?: number
        }
        Update: {
          business_sales_total?: number
          cancelled_sessions_count?: number
          card_fee_total?: number
          card_total?: number
          cash_total?: number
          closed_by?: string
          created_at?: string
          customer_card_total?: number
          id?: string
          orders_count?: number
          report_path?: string | null
          service_sessions_count?: number
          shift_id?: string
          summary?: Json
          yape_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "shift_closures_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_closures_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: true
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          id: string
          opened_at: string
          opened_by: string
          opening_cash: number
          status: Database["public"]["Enums"]["shift_status"]
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          opened_at?: string
          opened_by: string
          opening_cash?: number
          status?: Database["public"]["Enums"]["shift_status"]
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          opened_at?: string
          opened_by?: string
          opening_cash?: number
          status?: Database["public"]["Enums"]["shift_status"]
        }
        Relationships: [
          {
            foreignKeyName: "shifts_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      order_item_cancellation_origin_status:
        | "PENDING"
        | "PREPARING"
        | "READY"
        | "DELIVERED"
      order_item_status:
        | "PENDING"
        | "PREPARING"
        | "READY"
        | "DELIVERED"
        | "CANCELLED"
      payment_method: "CASH" | "YAPE" | "CARD"
      preparation_station: "KITCHEN" | "DRINKS"
      service_point_type: "TABLE" | "BAR" | "TAKEAWAY"
      session_status: "OPEN" | "AWAITING_PAYMENT" | "PAID" | "CANCELLED"
      shift_status: "OPEN" | "CLOSED"
      user_role: "ADMIN" | "MANAGER" | "WAITER" | "CASHIER" | "KITCHEN"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      order_item_cancellation_origin_status: [
        "PENDING",
        "PREPARING",
        "READY",
        "DELIVERED",
      ],
      order_item_status: [
        "PENDING",
        "PREPARING",
        "READY",
        "DELIVERED",
        "CANCELLED",
      ],
      payment_method: ["CASH", "YAPE", "CARD"],
      preparation_station: ["KITCHEN", "DRINKS"],
      service_point_type: ["TABLE", "BAR", "TAKEAWAY"],
      session_status: ["OPEN", "AWAITING_PAYMENT", "PAID", "CANCELLED"],
      shift_status: ["OPEN", "CLOSED"],
      user_role: ["ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN"],
    },
  },
} as const
