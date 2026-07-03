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
      claim_canary_state: {
        Row: {
          breaching: boolean
          check_name: string
          detail: string | null
          last_notified_at: string | null
          reported_at: string | null
        }
        Insert: {
          breaching?: boolean
          check_name: string
          detail?: string | null
          last_notified_at?: string | null
          reported_at?: string | null
        }
        Update: {
          breaching?: boolean
          check_name?: string
          detail?: string | null
          last_notified_at?: string | null
          reported_at?: string | null
        }
        Relationships: []
      }
      claims: {
        Row: {
          booking_email: string | null
          booking_reference: string | null
          consented_at: string | null
          created_at: string
          delay_bucket: string
          destination_actual: string | null
          destination_delay_seconds: number | null
          destination_scheduled: string
          destination_stop_id: string
          destination_stop_name: string
          error_message: string | null
          external_reference: string | null
          generated_at: string | null
          id: string
          journey_key: string
          origin_scheduled: string
          origin_stop_id: string
          origin_stop_name: string
          outcome: string | null
          pdf_path: string | null
          provider_message: string | null
          purchasing_operator: string | null
          service_number: string | null
          signature_path: string | null
          status: string
          submitted_at: string | null
          trip_start_date: string
          user_id: string | null
          was_cancelled: boolean
        }
        Insert: {
          booking_email?: string | null
          booking_reference?: string | null
          consented_at?: string | null
          created_at?: string
          delay_bucket: string
          destination_actual?: string | null
          destination_delay_seconds?: number | null
          destination_scheduled: string
          destination_stop_id: string
          destination_stop_name: string
          error_message?: string | null
          external_reference?: string | null
          generated_at?: string | null
          id?: string
          journey_key: string
          origin_scheduled: string
          origin_stop_id: string
          origin_stop_name: string
          outcome?: string | null
          pdf_path?: string | null
          provider_message?: string | null
          purchasing_operator?: string | null
          service_number?: string | null
          signature_path?: string | null
          status?: string
          submitted_at?: string | null
          trip_start_date: string
          user_id?: string | null
          was_cancelled: boolean
        }
        Update: {
          booking_email?: string | null
          booking_reference?: string | null
          consented_at?: string | null
          created_at?: string
          delay_bucket?: string
          destination_actual?: string | null
          destination_delay_seconds?: number | null
          destination_scheduled?: string
          destination_stop_id?: string
          destination_stop_name?: string
          error_message?: string | null
          external_reference?: string | null
          generated_at?: string | null
          id?: string
          journey_key?: string
          origin_scheduled?: string
          origin_stop_id?: string
          origin_stop_name?: string
          outcome?: string | null
          pdf_path?: string | null
          provider_message?: string | null
          purchasing_operator?: string | null
          service_number?: string | null
          signature_path?: string | null
          status?: string
          submitted_at?: string | null
          trip_start_date?: string
          user_id?: string | null
          was_cancelled?: boolean
        }
        Relationships: []
      }
      commute_routes: {
        Row: {
          created_at: string
          from_stop_id: string
          id: string
          monitored_days: number[]
          outbound_end_time: string | null
          outbound_start_time: string | null
          return_end_time: string | null
          return_start_time: string | null
          to_stop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_stop_id: string
          id?: string
          monitored_days?: number[]
          outbound_end_time?: string | null
          outbound_start_time?: string | null
          return_end_time?: string | null
          return_start_time?: string | null
          to_stop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_stop_id?: string
          id?: string
          monitored_days?: number[]
          outbound_end_time?: string | null
          outbound_start_time?: string | null
          return_end_time?: string | null
          return_start_time?: string | null
          to_stop_id?: string
          user_id?: string
        }
        Relationships: []
      }
      data_freshness_alert_state: {
        Row: {
          breaching: boolean
          check_name: string
          last_notified_at: string | null
        }
        Insert: {
          breaching?: boolean
          check_name: string
          last_notified_at?: string | null
        }
        Update: {
          breaching?: boolean
          check_name?: string
          last_notified_at?: string | null
        }
        Relationships: []
      }
      digest_events: {
        Row: {
          created_at: string
          event_type: string
          frequency: string | null
          id: string
          link_url: string | null
          raw: Json | null
          resend_email_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          frequency?: string | null
          id?: string
          link_url?: string | null
          raw?: Json | null
          resend_email_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          frequency?: string | null
          id?: string
          link_url?: string | null
          raw?: Json | null
          resend_email_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      digest_log: {
        Row: {
          id: string
          journey_key: string
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          journey_key: string
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          journey_key?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_number: string | null
          avatar_url: string | null
          city: string | null
          claim_email: string | null
          claim_mobile: string | null
          claim_personnummer: string | null
          claim_ticket_id: string | null
          claims_done_count: number
          clearing_number: string | null
          commuter_from_stop_id: string | null
          commuter_outbound_end_time: string | null
          commuter_outbound_start_time: string | null
          commuter_return_end_time: string | null
          commuter_return_start_time: string | null
          commuter_to_stop_id: string | null
          created_at: string | null
          digest_frequency: string
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string
          is_period_ticket: boolean
          last_name: string | null
          payout_method: string | null
          postal_code: string | null
          preferred_from_stop_id: string | null
          preferred_to_stop_id: string | null
          purchasing_operator: string | null
          signature_path: string | null
          street_address: string | null
          ticket_valid_until: string | null
          updated_at: string | null
        }
        Insert: {
          account_number?: string | null
          avatar_url?: string | null
          city?: string | null
          claim_email?: string | null
          claim_mobile?: string | null
          claim_personnummer?: string | null
          claim_ticket_id?: string | null
          claims_done_count?: number
          clearing_number?: string | null
          commuter_from_stop_id?: string | null
          commuter_outbound_end_time?: string | null
          commuter_outbound_start_time?: string | null
          commuter_return_end_time?: string | null
          commuter_return_start_time?: string | null
          commuter_to_stop_id?: string | null
          created_at?: string | null
          digest_frequency?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          is_period_ticket?: boolean
          last_name?: string | null
          payout_method?: string | null
          postal_code?: string | null
          preferred_from_stop_id?: string | null
          preferred_to_stop_id?: string | null
          purchasing_operator?: string | null
          signature_path?: string | null
          street_address?: string | null
          ticket_valid_until?: string | null
          updated_at?: string | null
        }
        Update: {
          account_number?: string | null
          avatar_url?: string | null
          city?: string | null
          claim_email?: string | null
          claim_mobile?: string | null
          claim_personnummer?: string | null
          claim_ticket_id?: string | null
          claims_done_count?: number
          clearing_number?: string | null
          commuter_from_stop_id?: string | null
          commuter_outbound_end_time?: string | null
          commuter_outbound_start_time?: string | null
          commuter_return_end_time?: string | null
          commuter_return_start_time?: string | null
          commuter_to_stop_id?: string | null
          created_at?: string | null
          digest_frequency?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          is_period_ticket?: boolean
          last_name?: string | null
          payout_method?: string | null
          postal_code?: string | null
          preferred_from_stop_id?: string | null
          preferred_to_stop_id?: string | null
          purchasing_operator?: string | null
          signature_path?: string | null
          street_address?: string | null
          ticket_valid_until?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      push_log: {
        Row: {
          id: string
          journey_key: string
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          journey_key: string
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          journey_key?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
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
      raw_train_announcements: {
        Row: {
          activity_id: string
          activity_type: string | null
          actual_time: string | null
          advertised_train_ident: string | null
          canceled: boolean | null
          deleted: boolean | null
          estimated_time: string | null
          from_location: string | null
          information_owner: string | null
          ingested_at: string
          location_signature: string
          modified_time: string | null
          operator: string | null
          raw: Json | null
          scheduled_time: string | null
          to_location: string | null
          track_at_location: string | null
          train_owner: string | null
          via_from_location: string | null
        }
        Insert: {
          activity_id: string
          activity_type?: string | null
          actual_time?: string | null
          advertised_train_ident?: string | null
          canceled?: boolean | null
          deleted?: boolean | null
          estimated_time?: string | null
          from_location?: string | null
          information_owner?: string | null
          ingested_at?: string
          location_signature: string
          modified_time?: string | null
          operator?: string | null
          raw?: Json | null
          scheduled_time?: string | null
          to_location?: string | null
          track_at_location?: string | null
          train_owner?: string | null
          via_from_location?: string | null
        }
        Update: {
          activity_id?: string
          activity_type?: string | null
          actual_time?: string | null
          advertised_train_ident?: string | null
          canceled?: boolean | null
          deleted?: boolean | null
          estimated_time?: string | null
          from_location?: string | null
          information_owner?: string | null
          ingested_at?: string
          location_signature?: string
          modified_time?: string | null
          operator?: string | null
          raw?: Json | null
          scheduled_time?: string | null
          to_location?: string | null
          track_at_location?: string | null
          train_owner?: string | null
          via_from_location?: string | null
        }
        Relationships: []
      }
      ref_stations: {
        Row: {
          advertised: boolean | null
          county_no: number | null
          lat: number | null
          lon: number | null
          match_distance_m: number | null
          name_match: boolean | null
          resolved: boolean
          rest_area_id: string | null
          rest_name: string | null
          station_name: string
          tv_signature: string
        }
        Insert: {
          advertised?: boolean | null
          county_no?: number | null
          lat?: number | null
          lon?: number | null
          match_distance_m?: number | null
          name_match?: boolean | null
          resolved?: boolean
          rest_area_id?: string | null
          rest_name?: string | null
          station_name: string
          tv_signature: string
        }
        Update: {
          advertised?: boolean | null
          county_no?: number | null
          lat?: number | null
          lon?: number | null
          match_distance_m?: number | null
          name_match?: boolean | null
          resolved?: boolean
          rest_area_id?: string | null
          rest_name?: string | null
          station_name?: string
          tv_signature?: string
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
        Insert: {
          dim_station_id?: string | null
          station_name?: string | null
          stop__id?: string | null
          stop__lat?: number | null
          stop__lon?: number | null
        }
        Update: {
          dim_station_id?: string | null
          station_name?: string | null
          stop__id?: string | null
          stop__lat?: number | null
          stop__lon?: number | null
        }
        Relationships: []
      }
      v_claimable_journeys: {
        Row: {
          canceled: boolean | null
          destination_actual: string | null
          destination_delay_minutes: number | null
          destination_scheduled: string | null
          destination_source: string | null
          destination_stop_id: string | null
          destination_stop_name: string | null
          is_claimable: boolean | null
          journey_key: string | null
          line_name: string | null
          line_terminus: string | null
          operator: string | null
          origin_actual: string | null
          origin_local_date: string | null
          origin_scheduled: string | null
          origin_source: string | null
          origin_stop_id: string | null
          origin_stop_name: string | null
          route_distance_km: number | null
          service_number: string | null
          train_owner: string | null
          transport_mode: string | null
        }
        Insert: {
          canceled?: boolean | null
          destination_actual?: string | null
          destination_delay_minutes?: number | null
          destination_scheduled?: string | null
          destination_source?: string | null
          destination_stop_id?: string | null
          destination_stop_name?: string | null
          is_claimable?: never
          journey_key?: string | null
          line_name?: string | null
          line_terminus?: string | null
          operator?: string | null
          origin_actual?: string | null
          origin_local_date?: string | null
          origin_scheduled?: string | null
          origin_source?: string | null
          origin_stop_id?: string | null
          origin_stop_name?: string | null
          route_distance_km?: number | null
          service_number?: string | null
          train_owner?: string | null
          transport_mode?: string | null
        }
        Update: {
          canceled?: boolean | null
          destination_actual?: string | null
          destination_delay_minutes?: number | null
          destination_scheduled?: string | null
          destination_source?: string | null
          destination_stop_id?: string | null
          destination_stop_name?: string | null
          is_claimable?: never
          journey_key?: string | null
          line_name?: string | null
          line_terminus?: string | null
          operator?: string | null
          origin_actual?: string | null
          origin_local_date?: string | null
          origin_scheduled?: string | null
          origin_source?: string | null
          origin_stop_id?: string | null
          origin_stop_name?: string | null
          route_distance_km?: number | null
          service_number?: string | null
          train_owner?: string | null
          transport_mode?: string | null
        }
        Relationships: []
      }
      v_journeys: {
        Row: {
          canceled: boolean | null
          destination_actual: string | null
          destination_delay_minutes: number | null
          destination_scheduled: string | null
          destination_source: string | null
          destination_stop_id: string | null
          destination_stop_name: string | null
          is_claimable: boolean | null
          journey_key: string | null
          line_name: string | null
          line_terminus: string | null
          operator: string | null
          origin_actual: string | null
          origin_local_date: string | null
          origin_scheduled: string | null
          origin_source: string | null
          origin_stop_id: string | null
          origin_stop_name: string | null
          route_distance_km: number | null
          service_number: string | null
          train_owner: string | null
          transport_mode: string | null
        }
        Relationships: []
      }
      v_network_board: {
        Row: {
          canceled: boolean | null
          destination_actual: string | null
          destination_delay_minutes: number | null
          destination_scheduled: string | null
          destination_source: string | null
          destination_stop_id: string | null
          destination_stop_name: string | null
          is_claimable: boolean | null
          journey_key: string | null
          line_name: string | null
          line_terminus: string | null
          operator: string | null
          origin_actual: string | null
          origin_local_date: string | null
          origin_scheduled: string | null
          origin_source: string | null
          origin_stop_id: string | null
          origin_stop_name: string | null
          route_distance_km: number | null
          service_number: string | null
          tier: string | null
          train_owner: string | null
          transport_mode: string | null
        }
        Insert: {
          canceled?: boolean | null
          destination_actual?: string | null
          destination_delay_minutes?: number | null
          destination_scheduled?: string | null
          destination_source?: string | null
          destination_stop_id?: string | null
          destination_stop_name?: string | null
          is_claimable?: boolean | null
          journey_key?: string | null
          line_name?: string | null
          line_terminus?: string | null
          operator?: string | null
          origin_actual?: string | null
          origin_local_date?: string | null
          origin_scheduled?: string | null
          origin_source?: string | null
          origin_stop_id?: string | null
          origin_stop_name?: string | null
          route_distance_km?: number | null
          service_number?: string | null
          tier?: string | null
          train_owner?: string | null
          transport_mode?: string | null
        }
        Update: {
          canceled?: boolean | null
          destination_actual?: string | null
          destination_delay_minutes?: number | null
          destination_scheduled?: string | null
          destination_source?: string | null
          destination_stop_id?: string | null
          destination_stop_name?: string | null
          is_claimable?: boolean | null
          journey_key?: string | null
          line_name?: string | null
          line_terminus?: string | null
          operator?: string | null
          origin_actual?: string | null
          origin_local_date?: string | null
          origin_scheduled?: string | null
          origin_source?: string | null
          origin_stop_id?: string | null
          origin_stop_name?: string | null
          route_distance_km?: number | null
          service_number?: string | null
          tier?: string | null
          train_owner?: string | null
          transport_mode?: string | null
        }
        Relationships: []
      }
      v_station_claim_authority: {
        Row: {
          region_authority_key: string | null
          stop_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_data_freshness: {
        Args: never
        Returns: {
          age_minutes: number
          breaching: boolean
          check_name: string
          last_ingested: string
          threshold_minutes: number
        }[]
      }
      claim_eligibility: {
        Args: {
          p_canceled: boolean
          p_delay_seconds: number
          p_operator: string
          p_route_km: number
        }
        Returns: {
          is_claimable: boolean
          min_delay_seconds: number
          route_band: string
          tier_model: string
          tier_pct: number
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
