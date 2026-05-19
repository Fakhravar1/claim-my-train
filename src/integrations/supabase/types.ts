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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_call_events: {
        Row: {
          destination_stop_id: string | null
          destination_stop_name: string | null
          direction: string
          id: string
          origin_stop_id: string | null
          origin_stop_name: string | null
          requested_at: string
          source: string
        }
        Insert: {
          destination_stop_id?: string | null
          destination_stop_name?: string | null
          direction: string
          id?: string
          origin_stop_id?: string | null
          origin_stop_name?: string | null
          requested_at?: string
          source: string
        }
        Update: {
          destination_stop_id?: string | null
          destination_stop_name?: string | null
          direction?: string
          id?: string
          origin_stop_id?: string | null
          origin_stop_name?: string | null
          requested_at?: string
          source?: string
        }
        Relationships: []
      }
      claimable_corridor_windows: {
        Row: {
          actual_arrival_datetime: string | null
          arrival_delay_minutes: number
          claimable: boolean
          departure_datetime: string
          destination_stop_id: string
          destination_stop_name: string
          direction: string
          event_key: string
          expires_at: string
          id: string
          line: string
          line_name: string
          observed_at: string
          origin_stop_id: string
          origin_stop_name: string
          scheduled_arrival_datetime: string | null
          trip_key: string
        }
        Insert: {
          actual_arrival_datetime?: string | null
          arrival_delay_minutes?: number
          claimable?: boolean
          departure_datetime: string
          destination_stop_id: string
          destination_stop_name: string
          direction: string
          event_key: string
          expires_at?: string
          id?: string
          line: string
          line_name: string
          observed_at?: string
          origin_stop_id: string
          origin_stop_name: string
          scheduled_arrival_datetime?: string | null
          trip_key: string
        }
        Update: {
          actual_arrival_datetime?: string | null
          arrival_delay_minutes?: number
          claimable?: boolean
          departure_datetime?: string
          destination_stop_id?: string
          destination_stop_name?: string
          direction?: string
          event_key?: string
          expires_at?: string
          id?: string
          line?: string
          line_name?: string
          observed_at?: string
          origin_stop_id?: string
          origin_stop_name?: string
          scheduled_arrival_datetime?: string | null
          trip_key?: string
        }
        Relationships: []
      }
      departures: {
        Row: {
          arrival_date: string | null
          arrival_station: string
          arrival_time: string | null
          created_at: string
          delay_minutes: number | null
          departure_date: string
          departure_station: string
          departure_time: string
          fetched_at: string
          id: string
          is_delayed: boolean
          line: string
          line_name: string
          operator: string
          scheduled_time: string | null
          track: string | null
        }
        Insert: {
          arrival_date?: string | null
          arrival_station: string
          arrival_time?: string | null
          created_at?: string
          delay_minutes?: number | null
          departure_date: string
          departure_station: string
          departure_time: string
          fetched_at?: string
          id?: string
          is_delayed?: boolean
          line: string
          line_name: string
          operator: string
          scheduled_time?: string | null
          track?: string | null
        }
        Update: {
          arrival_date?: string | null
          arrival_station?: string
          arrival_time?: string | null
          created_at?: string
          delay_minutes?: number | null
          departure_date?: string
          departure_station?: string
          departure_time?: string
          fetched_at?: string
          id?: string
          is_delayed?: boolean
          line?: string
          line_name?: string
          operator?: string
          scheduled_time?: string | null
          track?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          claim_email: string | null
          claim_mobile: string | null
          claim_personnummer: string | null
          claim_ticket_id: string | null
          claims_done_count: number
          commuter_from_stop_id: string | null
          commuter_outbound_end_time: string | null
          commuter_outbound_start_time: string | null
          commuter_return_end_time: string | null
          commuter_return_start_time: string | null
          commuter_to_stop_id: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_period_ticket: boolean
          preferred_from_stop_id: string | null
          preferred_to_stop_id: string | null
          ticket_valid_until: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          claim_email?: string | null
          claim_mobile?: string | null
          claim_personnummer?: string | null
          claim_ticket_id?: string | null
          claims_done_count?: number
          commuter_from_stop_id?: string | null
          commuter_outbound_end_time?: string | null
          commuter_outbound_start_time?: string | null
          commuter_return_end_time?: string | null
          commuter_return_start_time?: string | null
          commuter_to_stop_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_period_ticket?: boolean
          preferred_from_stop_id?: string | null
          preferred_to_stop_id?: string | null
          ticket_valid_until?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          claim_email?: string | null
          claim_mobile?: string | null
          claim_personnummer?: string | null
          claim_ticket_id?: string | null
          claims_done_count?: number
          commuter_from_stop_id?: string | null
          commuter_outbound_end_time?: string | null
          commuter_outbound_start_time?: string | null
          commuter_return_end_time?: string | null
          commuter_return_start_time?: string | null
          commuter_to_stop_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_period_ticket?: boolean
          preferred_from_stop_id?: string | null
          preferred_to_stop_id?: string | null
          ticket_valid_until?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      raw_departures: {
        Row: {
          agency__id: string | null
          agency__name: string | null
          agency__operator: string | null
          alerts: Json | null
          arrival_delay: number | null
          canceled: boolean | null
          event_type: string | null
          id: string
          ingested_at: string
          is_realtime: boolean | null
          realtime: string | null
          realtime_platform__designation: string | null
          realtime_platform__id: string | null
          route__designation: string | null
          route__destination__id: string | null
          route__destination__name: string | null
          route__direction: string | null
          route__name: string | null
          route__origin__id: string | null
          route__origin__name: string | null
          route__transport_mode: string | null
          route__transport_mode_code: number | null
          scheduled: string
          scheduled_platform__designation: string | null
          scheduled_platform__id: string | null
          stop__id: string
          stop__lat: number | null
          stop__lon: number | null
          stop__name: string | null
          trip__start_date: string
          trip__technical_number: number | null
          trip__trip_id: string
        }
        Insert: {
          agency__id?: string | null
          agency__name?: string | null
          agency__operator?: string | null
          alerts?: Json | null
          arrival_delay?: number | null
          canceled?: boolean | null
          event_type?: string | null
          id?: string
          ingested_at?: string
          is_realtime?: boolean | null
          realtime?: string | null
          realtime_platform__designation?: string | null
          realtime_platform__id?: string | null
          route__designation?: string | null
          route__destination__id?: string | null
          route__destination__name?: string | null
          route__direction?: string | null
          route__name?: string | null
          route__origin__id?: string | null
          route__origin__name?: string | null
          route__transport_mode?: string | null
          route__transport_mode_code?: number | null
          scheduled: string
          scheduled_platform__designation?: string | null
          scheduled_platform__id?: string | null
          stop__id: string
          stop__lat?: number | null
          stop__lon?: number | null
          stop__name?: string | null
          trip__start_date: string
          trip__technical_number?: number | null
          trip__trip_id: string
        }
        Update: {
          agency__id?: string | null
          agency__name?: string | null
          agency__operator?: string | null
          alerts?: Json | null
          arrival_delay?: number | null
          canceled?: boolean | null
          event_type?: string | null
          id?: string
          ingested_at?: string
          is_realtime?: boolean | null
          realtime?: string | null
          realtime_platform__designation?: string | null
          realtime_platform__id?: string | null
          route__designation?: string | null
          route__destination__id?: string | null
          route__destination__name?: string | null
          route__direction?: string | null
          route__name?: string | null
          route__origin__id?: string | null
          route__origin__name?: string | null
          route__transport_mode?: string | null
          route__transport_mode_code?: number | null
          scheduled?: string
          scheduled_platform__designation?: string | null
          scheduled_platform__id?: string | null
          stop__id?: string
          stop__lat?: number | null
          stop__lon?: number | null
          stop__name?: string | null
          trip__start_date?: string
          trip__technical_number?: number | null
          trip__trip_id?: string
        }
        Relationships: []
      }
      stations_master: {
        Row: {
          area_type: string | null
          created_at: string | null
          stop__id: string
          stop__lat: number | null
          stop__lon: number | null
          stop__name: string | null
        }
        Insert: {
          area_type?: string | null
          created_at?: string | null
          stop__id: string
          stop__lat?: number | null
          stop__lon?: number | null
          stop__name?: string | null
        }
        Update: {
          area_type?: string | null
          created_at?: string | null
          stop__id?: string
          stop__lat?: number | null
          stop__lon?: number | null
          stop__name?: string | null
        }
        Relationships: []
      }
      train_names: {
        Row: {
          created_at: string
          first_seen: string
          id: string
          last_seen: string
          name: string
        }
        Insert: {
          created_at?: string
          first_seen?: string
          id?: string
          last_seen?: string
          name: string
        }
        Update: {
          created_at?: string
          first_seen?: string
          id?: string
          last_seen?: string
          name?: string
        }
        Relationships: []
      }
      yellow_alert_history: {
        Row: {
          actual_arrival_datetime: string
          arrival_delay_minutes: number
          arrival_station: string
          created_at: string
          departure_datetime: string
          departure_station: string
          direction: string
          event_key: string
          id: string
          line: string
          line_name: string
          scheduled_arrival_datetime: string
        }
        Insert: {
          actual_arrival_datetime: string
          arrival_delay_minutes: number
          arrival_station: string
          created_at?: string
          departure_datetime: string
          departure_station: string
          direction: string
          event_key: string
          id?: string
          line: string
          line_name: string
          scheduled_arrival_datetime: string
        }
        Update: {
          actual_arrival_datetime?: string
          arrival_delay_minutes?: number
          arrival_station?: string
          created_at?: string
          departure_datetime?: string
          departure_station?: string
          direction?: string
          event_key?: string
          id?: string
          line?: string
          line_name?: string
          scheduled_arrival_datetime?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_active_stations: {
        Row: {
          dim_station_id: string | null
          station_name: string | null
          stop__id: string | null
          stop__lat: number | null
          stop__lon: number | null
        }
        Relationships: []
      }
      v_passenger_journeys: {
        Row: {
          agency__operator: string | null
          canceled: boolean | null
          destination_actual: string | null
          destination_delay_minutes: number | null
          destination_scheduled: string | null
          destination_stop_id: string | null
          destination_stop_name: string | null
          is_claimable: boolean | null
          journey_key: string | null
          line_terminus: string | null
          origin_actual: string | null
          origin_scheduled: string | null
          origin_stop_id: string | null
          origin_stop_name: string | null
          route__name: string | null
          trip__start_date: string | null
          trip__trip_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      delete_old_departures: { Args: never; Returns: undefined }
      get_admin_api_analytics: {
        Args: { since_ts: string; timezone_name?: string }
        Returns: Json
      }
      get_api_usage_daily: {
        Args: { since_ts: string; timezone_name?: string }
        Returns: {
          calls: number
          day: string
        }[]
      }
      trigger_claim_collection: { Args: never; Returns: undefined }
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
  public: {
    Enums: {},
  },
} as const
