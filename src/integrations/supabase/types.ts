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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          casino_id: string
          category: Database["public"]["Enums"]["log_category"]
          created_at: string
          details: Json
          id: string
          operator_id: string
        }
        Insert: {
          action: string
          casino_id: string
          category: Database["public"]["Enums"]["log_category"]
          created_at?: string
          details?: Json
          id?: string
          operator_id: string
        }
        Update: {
          action?: string
          casino_id?: string
          category?: Database["public"]["Enums"]["log_category"]
          created_at?: string
          details?: Json
          id?: string
          operator_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs_archive: {
        Row: {
          action: string
          casino_id: string
          category: Database["public"]["Enums"]["log_category"]
          created_at: string
          details: Json
          id: string
          operator_id: string
        }
        Insert: {
          action: string
          casino_id: string
          category: Database["public"]["Enums"]["log_category"]
          created_at?: string
          details?: Json
          id?: string
          operator_id: string
        }
        Update: {
          action?: string
          casino_id?: string
          category?: Database["public"]["Enums"]["log_category"]
          created_at?: string
          details?: Json
          id?: string
          operator_id?: string
        }
        Relationships: []
      }
      am_budget_ledger: {
        Row: {
          am_user_id: string
          casino_id: string
          created_at: string
          created_by: string | null
          delta: number
          id: string
          reason: string
          ref_id: string | null
          ref_type: string | null
        }
        Insert: {
          am_user_id: string
          casino_id: string
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          reason: string
          ref_id?: string | null
          ref_type?: string | null
        }
        Update: {
          am_user_id?: string
          casino_id?: string
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          reason?: string
          ref_id?: string | null
          ref_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "am_budget_ledger_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      am_budgets: {
        Row: {
          am_user_id: string
          balance: number
          casino_id: string
          id: string
          updated_at: string
        }
        Insert: {
          am_user_id: string
          balance?: number
          casino_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          am_user_id?: string
          balance?: number
          casino_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "am_budgets_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_holidays: {
        Row: {
          casino_id: string
          created_at: string
          created_by: string | null
          date: string
          id: string
          multiplier: number
          name: string
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          multiplier?: number
          name?: string
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          multiplier?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_holidays_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_hours: {
        Row: {
          casino_id: string
          created_at: string
          date: string
          employee_id: string
          hours: number
          id: string
          note: string | null
          recorded_by: string | null
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          date: string
          employee_id: string
          hours?: number
          id?: string
          note?: string | null
          recorded_by?: string | null
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          date?: string
          employee_id?: string
          hours?: number
          id?: string
          note?: string | null
          recorded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_hours_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_hours_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_checks: {
        Row: {
          amount: number
          approval_code: string
          bank: string
          card_masked: string
          casino_id: string
          check_date: string
          check_time: string | null
          created_at: string
          created_by: string
          currency: string
          discrepancy: number
          expected_balance: number
          id: string
          is_balanced: boolean
          merchant: string
          note: string
          photo_url: string | null
          receipt_no: string
          updated_at: string
        }
        Insert: {
          amount: number
          approval_code?: string
          bank?: string
          card_masked?: string
          casino_id: string
          check_date: string
          check_time?: string | null
          created_at?: string
          created_by: string
          currency?: string
          discrepancy?: number
          expected_balance?: number
          id?: string
          is_balanced?: boolean
          merchant?: string
          note?: string
          photo_url?: string | null
          receipt_no?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approval_code?: string
          bank?: string
          card_masked?: string
          casino_id?: string
          check_date?: string
          check_time?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          discrepancy?: number
          expected_balance?: number
          id?: string
          is_balanced?: boolean
          merchant?: string
          note?: string
          photo_url?: string | null
          receipt_no?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_checks_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      box_config: {
        Row: {
          branding: Json
          casino_name: string | null
          casino_slug: string | null
          cloud_link: Json
          created_at: string
          id: string
          is_setup_complete: boolean
          network: Json
          node_id: string
          peer_mode: string
          tailscale: Json
          updated_at: string
        }
        Insert: {
          branding?: Json
          casino_name?: string | null
          casino_slug?: string | null
          cloud_link?: Json
          created_at?: string
          id?: string
          is_setup_complete?: boolean
          network?: Json
          node_id: string
          peer_mode?: string
          tailscale?: Json
          updated_at?: string
        }
        Update: {
          branding?: Json
          casino_name?: string | null
          casino_slug?: string | null
          cloud_link?: Json
          created_at?: string
          id?: string
          is_setup_complete?: boolean
          network?: Json
          node_id?: string
          peer_mode?: string
          tailscale?: Json
          updated_at?: string
        }
        Relationships: []
      }
      box_licenses: {
        Row: {
          activated_at: string
          challenge_nonce: string | null
          created_at: string
          full_days: number
          id: string
          last_heartbeat_at: string
          license_expires_at: string | null
          license_key: string | null
          node_id: string
          notes: string | null
          restricted_days: number
          updated_at: string
        }
        Insert: {
          activated_at?: string
          challenge_nonce?: string | null
          created_at?: string
          full_days?: number
          id?: string
          last_heartbeat_at?: string
          license_expires_at?: string | null
          license_key?: string | null
          node_id: string
          notes?: string | null
          restricted_days?: number
          updated_at?: string
        }
        Update: {
          activated_at?: string
          challenge_nonce?: string | null
          created_at?: string
          full_days?: number
          id?: string
          last_heartbeat_at?: string
          license_expires_at?: string | null
          license_key?: string | null
          node_id?: string
          notes?: string | null
          restricted_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      breaklist: {
        Row: {
          casino_id: string
          created_at: string
          created_by: string
          date: string
          employee_id: string
          id: string
          is_locked: boolean
          locked_by: string | null
          role: Database["public"]["Enums"]["dealer_role"]
          table_id: string | null
          time_slot: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          casino_id: string
          created_at?: string
          created_by: string
          date: string
          employee_id: string
          id?: string
          is_locked?: boolean
          locked_by?: string | null
          role?: Database["public"]["Enums"]["dealer_role"]
          table_id?: string | null
          time_slot: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          casino_id?: string
          created_at?: string
          created_by?: string
          date?: string
          employee_id?: string
          id?: string
          is_locked?: boolean
          locked_by?: string | null
          role?: Database["public"]["Enums"]["dealer_role"]
          table_id?: string | null
          time_slot?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "breaklist_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breaklist_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breaklist_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      breaklist_logs: {
        Row: {
          action: string
          breaklist_id: string | null
          casino_id: string
          created_at: string
          date: string
          dealer_id: string
          id: string
          new_role: string | null
          new_table_id: string | null
          old_role: string | null
          old_table_id: string | null
          operator_id: string
          time_slot: string
        }
        Insert: {
          action: string
          breaklist_id?: string | null
          casino_id: string
          created_at?: string
          date: string
          dealer_id: string
          id?: string
          new_role?: string | null
          new_table_id?: string | null
          old_role?: string | null
          old_table_id?: string | null
          operator_id: string
          time_slot: string
        }
        Update: {
          action?: string
          breaklist_id?: string | null
          casino_id?: string
          created_at?: string
          date?: string
          dealer_id?: string
          id?: string
          new_role?: string | null
          new_table_id?: string | null
          old_role?: string | null
          old_table_id?: string | null
          operator_id?: string
          time_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "breaklist_logs_breaklist_id_fkey"
            columns: ["breaklist_id"]
            isOneToOne: false
            referencedRelation: "breaklist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breaklist_logs_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breaklist_logs_new_table_id_fkey"
            columns: ["new_table_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breaklist_logs_old_table_id_fkey"
            columns: ["old_table_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      breaklist_logs_archive: {
        Row: {
          action: string
          breaklist_id: string | null
          casino_id: string
          created_at: string
          date: string
          dealer_id: string
          id: string
          new_role: string | null
          new_table_id: string | null
          old_role: string | null
          old_table_id: string | null
          operator_id: string
          time_slot: string
        }
        Insert: {
          action: string
          breaklist_id?: string | null
          casino_id: string
          created_at?: string
          date: string
          dealer_id: string
          id?: string
          new_role?: string | null
          new_table_id?: string | null
          old_role?: string | null
          old_table_id?: string | null
          operator_id: string
          time_slot: string
        }
        Update: {
          action?: string
          breaklist_id?: string | null
          casino_id?: string
          created_at?: string
          date?: string
          dealer_id?: string
          id?: string
          new_role?: string | null
          new_table_id?: string | null
          old_role?: string | null
          old_table_id?: string | null
          operator_id?: string
          time_slot?: string
        }
        Relationships: []
      }
      business_day_closures: {
        Row: {
          business_date: string
          casino_id: string
          closed_at: string
          closed_by: string | null
          closed_method: string
          id: string
          snapshot: Json
        }
        Insert: {
          business_date: string
          casino_id: string
          closed_at?: string
          closed_by?: string | null
          closed_method: string
          id?: string
          snapshot?: Json
        }
        Update: {
          business_date?: string
          casino_id?: string
          closed_at?: string
          closed_by?: string | null
          closed_method?: string
          id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "business_day_closures_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      cage_slots_cards: {
        Row: {
          cage_slots_shift_id: string
          card_balance_effect_tzs: number | null
          card_deposit_value_tzs: number
          casino_id: string
          closing_card_count: number | null
          created_at: string
          id: string
          miss_card_count: number | null
          opening_card_count: number
          updated_at: string
        }
        Insert: {
          cage_slots_shift_id: string
          card_balance_effect_tzs?: number | null
          card_deposit_value_tzs?: number
          casino_id: string
          closing_card_count?: number | null
          created_at?: string
          id?: string
          miss_card_count?: number | null
          opening_card_count?: number
          updated_at?: string
        }
        Update: {
          cage_slots_shift_id?: string
          card_balance_effect_tzs?: number | null
          card_deposit_value_tzs?: number
          casino_id?: string
          closing_card_count?: number | null
          created_at?: string
          id?: string
          miss_card_count?: number | null
          opening_card_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cage_slots_cards_cage_slots_shift_id_fkey"
            columns: ["cage_slots_shift_id"]
            isOneToOne: true
            referencedRelation: "cage_slots_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cage_slots_cards_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      cage_slots_cash_counts: {
        Row: {
          cage_slots_shift_id: string
          casino_id: string
          count_type: Database["public"]["Enums"]["cage_slots_count_type"]
          counted_by: string
          created_at: string
          denominations: Json
          id: string
          note: string | null
          total_tzs: number
        }
        Insert: {
          cage_slots_shift_id: string
          casino_id: string
          count_type: Database["public"]["Enums"]["cage_slots_count_type"]
          counted_by: string
          created_at?: string
          denominations?: Json
          id?: string
          note?: string | null
          total_tzs?: number
        }
        Update: {
          cage_slots_shift_id?: string
          casino_id?: string
          count_type?: Database["public"]["Enums"]["cage_slots_count_type"]
          counted_by?: string
          created_at?: string
          denominations?: Json
          id?: string
          note?: string | null
          total_tzs?: number
        }
        Relationships: [
          {
            foreignKeyName: "cage_slots_cash_counts_cage_slots_shift_id_fkey"
            columns: ["cage_slots_shift_id"]
            isOneToOne: false
            referencedRelation: "cage_slots_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cage_slots_cash_counts_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      cage_slots_cash_inventory: {
        Row: {
          cage_slots_shift_id: string
          casino_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          denomination: number
          id: string
          inventory_type: Database["public"]["Enums"]["cage_slots_inventory_type"]
          quantity: number
          rate_to_tzs: number
          total_currency: number
          total_tzs: number
          updated_at: string
        }
        Insert: {
          cage_slots_shift_id: string
          casino_id: string
          created_at?: string
          created_by?: string | null
          currency_code: string
          denomination: number
          id?: string
          inventory_type: Database["public"]["Enums"]["cage_slots_inventory_type"]
          quantity?: number
          rate_to_tzs?: number
          total_currency?: number
          total_tzs?: number
          updated_at?: string
        }
        Update: {
          cage_slots_shift_id?: string
          casino_id?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          denomination?: number
          id?: string
          inventory_type?: Database["public"]["Enums"]["cage_slots_inventory_type"]
          quantity?: number
          rate_to_tzs?: number
          total_currency?: number
          total_tzs?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cage_slots_cash_inventory_cage_slots_shift_id_fkey"
            columns: ["cage_slots_shift_id"]
            isOneToOne: false
            referencedRelation: "cage_slots_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cage_slots_cash_inventory_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      cage_slots_comments: {
        Row: {
          cage_slots_shift_id: string
          casino_id: string
          comment_text: string
          comment_type: Database["public"]["Enums"]["cage_slots_comment_type"]
          created_at: string
          created_by: string
          id: string
        }
        Insert: {
          cage_slots_shift_id: string
          casino_id: string
          comment_text: string
          comment_type: Database["public"]["Enums"]["cage_slots_comment_type"]
          created_at?: string
          created_by: string
          id?: string
        }
        Update: {
          cage_slots_shift_id?: string
          casino_id?: string
          comment_text?: string
          comment_type?: Database["public"]["Enums"]["cage_slots_comment_type"]
          created_at?: string
          created_by?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cage_slots_comments_cage_slots_shift_id_fkey"
            columns: ["cage_slots_shift_id"]
            isOneToOne: false
            referencedRelation: "cage_slots_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cage_slots_comments_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      cage_slots_exchange_rates: {
        Row: {
          cage_slots_shift_id: string
          casino_id: string
          created_at: string
          currency_code: string
          id: string
          rate_to_tzs: number
          updated_at: string
        }
        Insert: {
          cage_slots_shift_id: string
          casino_id: string
          created_at?: string
          currency_code: string
          id?: string
          rate_to_tzs: number
          updated_at?: string
        }
        Update: {
          cage_slots_shift_id?: string
          casino_id?: string
          created_at?: string
          currency_code?: string
          id?: string
          rate_to_tzs?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cage_slots_exchange_rates_cage_slots_shift_id_fkey"
            columns: ["cage_slots_shift_id"]
            isOneToOne: false
            referencedRelation: "cage_slots_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cage_slots_exchange_rates_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      cage_slots_settings: {
        Row: {
          card_deposit_value_tzs: number
          casino_id: string
          created_at: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          card_deposit_value_tzs?: number
          casino_id: string
          created_at?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          card_deposit_value_tzs?: number
          casino_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cage_slots_settings_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: true
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      cage_slots_shifts: {
        Row: {
          ace_fills: number
          actual_cage_result: number | null
          balance: number | null
          business_date: string
          cards_miss: number | null
          cash_desk_result: number | null
          cashier_id: string
          cashier_note: string | null
          cashless_final: number
          cashless_final_providers: Json
          cashless_in_providers: Json
          cashless_out_providers: Json
          casino_id: string
          client_uuid: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          difference_amount: number | null
          id: string
          manager_comment: string | null
          manual_drop_slots: number
          opened_at: string
          opened_by: string
          reverses_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift_type: Database["public"]["Enums"]["cage_slots_shift_type"]
          slots_result: number | null
          status: Database["public"]["Enums"]["cage_slots_status"]
          submitted_at: string | null
          system_shift_result: number | null
          updated_at: string
        }
        Insert: {
          ace_fills?: number
          actual_cage_result?: number | null
          balance?: number | null
          business_date: string
          cards_miss?: number | null
          cash_desk_result?: number | null
          cashier_id: string
          cashier_note?: string | null
          cashless_final?: number
          cashless_final_providers?: Json
          cashless_in_providers?: Json
          cashless_out_providers?: Json
          casino_id: string
          client_uuid?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          difference_amount?: number | null
          id?: string
          manager_comment?: string | null
          manual_drop_slots?: number
          opened_at?: string
          opened_by: string
          reverses_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_type: Database["public"]["Enums"]["cage_slots_shift_type"]
          slots_result?: number | null
          status?: Database["public"]["Enums"]["cage_slots_status"]
          submitted_at?: string | null
          system_shift_result?: number | null
          updated_at?: string
        }
        Update: {
          ace_fills?: number
          actual_cage_result?: number | null
          balance?: number | null
          business_date?: string
          cards_miss?: number | null
          cash_desk_result?: number | null
          cashier_id?: string
          cashier_note?: string | null
          cashless_final?: number
          cashless_final_providers?: Json
          cashless_in_providers?: Json
          cashless_out_providers?: Json
          casino_id?: string
          client_uuid?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          difference_amount?: number | null
          id?: string
          manager_comment?: string | null
          manual_drop_slots?: number
          opened_at?: string
          opened_by?: string
          reverses_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_type?: Database["public"]["Enums"]["cage_slots_shift_type"]
          slots_result?: number | null
          status?: Database["public"]["Enums"]["cage_slots_status"]
          submitted_at?: string | null
          system_shift_result?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cage_slots_shifts_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cage_slots_shifts_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "cage_slots_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      cage_slots_tips_cd: {
        Row: {
          amount: number
          bucket: string
          cage_slots_shift_id: string
          casino_id: string
          created_at: string
          id: string
          note: string
          operator_id: string
        }
        Insert: {
          amount: number
          bucket?: string
          cage_slots_shift_id: string
          casino_id: string
          created_at?: string
          id?: string
          note?: string
          operator_id: string
        }
        Update: {
          amount?: number
          bucket?: string
          cage_slots_shift_id?: string
          casino_id?: string
          created_at?: string
          id?: string
          note?: string
          operator_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cage_slots_tips_cd_cage_slots_shift_id_fkey"
            columns: ["cage_slots_shift_id"]
            isOneToOne: false
            referencedRelation: "cage_slots_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      cage_slots_tips_cd_payouts: {
        Row: {
          amount: number
          bucket: string
          cage_slots_shift_id: string
          casino_id: string
          collected_amount: number
          created_at: string
          id: string
          note: string | null
          operator_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          bucket: string
          cage_slots_shift_id: string
          casino_id: string
          collected_amount?: number
          created_at?: string
          id?: string
          note?: string | null
          operator_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bucket?: string
          cage_slots_shift_id?: string
          casino_id?: string
          collected_amount?: number
          created_at?: string
          id?: string
          note?: string | null
          operator_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cage_slots_tips_cd_payouts_cage_slots_shift_id_fkey"
            columns: ["cage_slots_shift_id"]
            isOneToOne: false
            referencedRelation: "cage_slots_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      cage_slots_transfers: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string
          approved_by_user: string | null
          cage_slots_shift_id: string
          casino_id: string
          counterpart_lg_shift_id: string | null
          counterpart_lg_transfer_id: string | null
          created_at: string
          direction: string
          id: string
          note: string
          operator_id: string
          requires_approval: boolean
          transfer_type: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by: string
          approved_by_user?: string | null
          cage_slots_shift_id: string
          casino_id: string
          counterpart_lg_shift_id?: string | null
          counterpart_lg_transfer_id?: string | null
          created_at?: string
          direction: string
          id?: string
          note?: string
          operator_id: string
          requires_approval?: boolean
          transfer_type: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string
          approved_by_user?: string | null
          cage_slots_shift_id?: string
          casino_id?: string
          counterpart_lg_shift_id?: string | null
          counterpart_lg_transfer_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          note?: string
          operator_id?: string
          requires_approval?: boolean
          transfer_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cage_slots_transfers_cage_slots_shift_id_fkey"
            columns: ["cage_slots_shift_id"]
            isOneToOne: false
            referencedRelation: "cage_slots_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cage_slots_transfers_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cage_slots_transfers_counterpart_lg_shift_id_fkey"
            columns: ["counterpart_lg_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cage_slots_transfers_counterpart_lg_transfer_id_fkey"
            columns: ["counterpart_lg_transfer_id"]
            isOneToOne: false
            referencedRelation: "cage_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      cage_transfers: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string
          approved_by_user: string | null
          casino_id: string
          chips: Json | null
          counterpart_slots_transfer_id: string | null
          created_at: string
          direction: string
          id: string
          note: string
          operator_id: string
          requires_approval: boolean
          shift_id: string
          table_id: string | null
          transfer_type: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by: string
          approved_by_user?: string | null
          casino_id: string
          chips?: Json | null
          counterpart_slots_transfer_id?: string | null
          created_at?: string
          direction: string
          id?: string
          note?: string
          operator_id: string
          requires_approval?: boolean
          shift_id: string
          table_id?: string | null
          transfer_type: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string
          approved_by_user?: string | null
          casino_id?: string
          chips?: Json | null
          counterpart_slots_transfer_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          note?: string
          operator_id?: string
          requires_approval?: boolean
          shift_id?: string
          table_id?: string | null
          transfer_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cage_transfers_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cage_transfers_counterpart_slots_transfer_id_fkey"
            columns: ["counterpart_slots_transfer_id"]
            isOneToOne: false
            referencedRelation: "cage_slots_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cage_transfers_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cage_transfers_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_count_snapshots: {
        Row: {
          casino_id: string
          counted_by: string
          created_at: string
          currency: string
          denominations: Json
          discrepancy: number
          exchange_rate: number
          expected_balance: number
          id: string
          note: string
          physical_total: number
          physical_total_tzs: number
          wallet_type: Database["public"]["Enums"]["wallet_type"]
        }
        Insert: {
          casino_id: string
          counted_by: string
          created_at?: string
          currency?: string
          denominations?: Json
          discrepancy?: number
          exchange_rate?: number
          expected_balance?: number
          id?: string
          note?: string
          physical_total?: number
          physical_total_tzs?: number
          wallet_type: Database["public"]["Enums"]["wallet_type"]
        }
        Update: {
          casino_id?: string
          counted_by?: string
          created_at?: string
          currency?: string
          denominations?: Json
          discrepancy?: number
          exchange_rate?: number
          expected_balance?: number
          id?: string
          note?: string
          physical_total?: number
          physical_total_tzs?: number
          wallet_type?: Database["public"]["Enums"]["wallet_type"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_count_snapshots_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_counts: {
        Row: {
          casino_id: string
          count_type: string
          counted_by: string
          created_at: string
          currency: string
          denominations: Json
          id: string
          shift_id: string
          total: number
        }
        Insert: {
          casino_id: string
          count_type: string
          counted_by: string
          created_at?: string
          currency?: string
          denominations?: Json
          id?: string
          shift_id: string
          total?: number
        }
        Update: {
          casino_id?: string
          count_type?: string
          counted_by?: string
          created_at?: string
          currency?: string
          denominations?: Json
          id?: string
          shift_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_counts_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_counts_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      cashless_transactions: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          business_date: string
          cage_slots_shift_id: string | null
          cage_type: string
          casino_id: string
          created_at: string
          currency: string
          direction: string
          id: string
          note: string
          operator_id: string
          player_id: string | null
          player_name: string
          provider: string
          reference: string
          source_module: string | null
          status: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          business_date: string
          cage_slots_shift_id?: string | null
          cage_type?: string
          casino_id: string
          created_at?: string
          currency?: string
          direction: string
          id?: string
          note?: string
          operator_id: string
          player_id?: string | null
          player_name?: string
          provider: string
          reference?: string
          source_module?: string | null
          status?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          business_date?: string
          cage_slots_shift_id?: string | null
          cage_type?: string
          casino_id?: string
          created_at?: string
          currency?: string
          direction?: string
          id?: string
          note?: string
          operator_id?: string
          player_id?: string | null
          player_name?: string
          provider?: string
          reference?: string
          source_module?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashless_transactions_cage_slots_shift_id_fkey"
            columns: ["cage_slots_shift_id"]
            isOneToOne: false
            referencedRelation: "cage_slots_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashless_transactions_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashless_transactions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "cashless_transactions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      casino_packages: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_active: boolean
          max_tables: number | null
          max_users: number | null
          modules: Json
          name: string
          price_usd: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          max_tables?: number | null
          max_users?: number | null
          modules?: Json
          name: string
          price_usd?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          max_tables?: number | null
          max_users?: number | null
          modules?: Json
          name?: string
          price_usd?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      casino_servers: {
        Row: {
          casino_id: string
          created_at: string
          display_name: string | null
          id: string
          local_url: string | null
          node_id: string | null
          role: Database["public"]["Enums"]["casino_server_role"]
        }
        Insert: {
          casino_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          local_url?: string | null
          node_id?: string | null
          role?: Database["public"]["Enums"]["casino_server_role"]
        }
        Update: {
          casino_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          local_url?: string | null
          node_id?: string | null
          role?: Database["public"]["Enums"]["casino_server_role"]
        }
        Relationships: []
      }
      casino_visits: {
        Row: {
          casino_id: string
          checked_in_at: string
          checked_in_by: string
          checked_out_at: string | null
          date: string
          id: string
          player_id: string
          position: string
        }
        Insert: {
          casino_id: string
          checked_in_at?: string
          checked_in_by: string
          checked_out_at?: string | null
          date?: string
          id?: string
          player_id: string
          position?: string
        }
        Update: {
          casino_id?: string
          checked_in_at?: string
          checked_in_by?: string
          checked_out_at?: string | null
          date?: string
          id?: string
          player_id?: string
          position?: string
        }
        Relationships: [
          {
            foreignKeyName: "casino_visits_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casino_visits_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "casino_visits_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      casino_visits_archive: {
        Row: {
          casino_id: string
          checked_in_at: string
          checked_in_by: string
          checked_out_at: string | null
          date: string
          id: string
          player_id: string
          position: string
        }
        Insert: {
          casino_id: string
          checked_in_at?: string
          checked_in_by: string
          checked_out_at?: string | null
          date?: string
          id?: string
          player_id: string
          position?: string
        }
        Update: {
          casino_id?: string
          checked_in_at?: string
          checked_in_by?: string
          checked_out_at?: string | null
          date?: string
          id?: string
          player_id?: string
          position?: string
        }
        Relationships: []
      }
      casinos: {
        Row: {
          apple_touch_icon_url: string | null
          background_color: string | null
          brand_accent_hsl: string | null
          brand_primary_hsl: string | null
          breaklist_lock: string
          breaklist_lock_pending: string | null
          breaklist_lock_pending_from: string | null
          cage_close_deadline_min: number | null
          cage_float: number
          chip_conservation_mode: string
          code: string
          created_at: string
          d_shift_start: string | null
          favicon_url: string | null
          float_locked: boolean
          id: string
          logo_url: string | null
          manager_override_window_min: number | null
          meta_description: string | null
          meta_title: string | null
          n_shift_start: string | null
          name: string
          og_image_url: string | null
          pwa_display: string | null
          pwa_icon_192_url: string | null
          pwa_icon_512_url: string | null
          shift_end: string
          shift_end_pending: string | null
          shift_end_pending_from: string | null
          shift_matrix: Json
          shift_start: string
          short_name: string | null
          slug: string | null
          tables_open: string
          tagline: string | null
          theme_color: string | null
          timezone: string
          verification_bonus_amount: number
          verification_bonus_funding_pool: string
          verification_bonus_lifetime_days: number
        }
        Insert: {
          apple_touch_icon_url?: string | null
          background_color?: string | null
          brand_accent_hsl?: string | null
          brand_primary_hsl?: string | null
          breaklist_lock?: string
          breaklist_lock_pending?: string | null
          breaklist_lock_pending_from?: string | null
          cage_close_deadline_min?: number | null
          cage_float?: number
          chip_conservation_mode?: string
          code: string
          created_at?: string
          d_shift_start?: string | null
          favicon_url?: string | null
          float_locked?: boolean
          id?: string
          logo_url?: string | null
          manager_override_window_min?: number | null
          meta_description?: string | null
          meta_title?: string | null
          n_shift_start?: string | null
          name: string
          og_image_url?: string | null
          pwa_display?: string | null
          pwa_icon_192_url?: string | null
          pwa_icon_512_url?: string | null
          shift_end?: string
          shift_end_pending?: string | null
          shift_end_pending_from?: string | null
          shift_matrix?: Json
          shift_start?: string
          short_name?: string | null
          slug?: string | null
          tables_open?: string
          tagline?: string | null
          theme_color?: string | null
          timezone?: string
          verification_bonus_amount?: number
          verification_bonus_funding_pool?: string
          verification_bonus_lifetime_days?: number
        }
        Update: {
          apple_touch_icon_url?: string | null
          background_color?: string | null
          brand_accent_hsl?: string | null
          brand_primary_hsl?: string | null
          breaklist_lock?: string
          breaklist_lock_pending?: string | null
          breaklist_lock_pending_from?: string | null
          cage_close_deadline_min?: number | null
          cage_float?: number
          chip_conservation_mode?: string
          code?: string
          created_at?: string
          d_shift_start?: string | null
          favicon_url?: string | null
          float_locked?: boolean
          id?: string
          logo_url?: string | null
          manager_override_window_min?: number | null
          meta_description?: string | null
          meta_title?: string | null
          n_shift_start?: string | null
          name?: string
          og_image_url?: string | null
          pwa_display?: string | null
          pwa_icon_192_url?: string | null
          pwa_icon_512_url?: string | null
          shift_end?: string
          shift_end_pending?: string | null
          shift_end_pending_from?: string | null
          shift_matrix?: Json
          shift_start?: string
          short_name?: string | null
          slug?: string | null
          tables_open?: string
          tagline?: string | null
          theme_color?: string | null
          timezone?: string
          verification_bonus_amount?: number
          verification_bonus_funding_pool?: string
          verification_bonus_lifetime_days?: number
        }
        Relationships: []
      }
      cctv_observations: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          casino_id: string
          content: string
          created_at: string
          id: string
          observation_type: string
          observer_id: string
          player_id: string | null
          shift_id: string | null
          subject_type: string
          table_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          casino_id: string
          content: string
          created_at?: string
          id?: string
          observation_type?: string
          observer_id: string
          player_id?: string | null
          shift_id?: string | null
          subject_type?: string
          table_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          casino_id?: string
          content?: string
          created_at?: string
          id?: string
          observation_type?: string
          observer_id?: string
          player_id?: string | null
          shift_id?: string | null
          subject_type?: string
          table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cctv_observations_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cctv_observations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "cctv_observations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cctv_observations_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cctv_observations_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_baseline: {
        Row: {
          casino_id: string
          denomination: number
          expected_quantity: number
          id: string
          location_id: string | null
          location_type: string
        }
        Insert: {
          casino_id: string
          denomination: number
          expected_quantity?: number
          id?: string
          location_id?: string | null
          location_type: string
        }
        Update: {
          casino_id?: string
          denomination?: number
          expected_quantity?: number
          id?: string
          location_id?: string | null
          location_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chip_baseline_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_color_settings: {
        Row: {
          bg_color: string
          casino_id: string
          created_at: string
          denomination: number
          edge_color: string
          id: string
          is_promo: boolean
          is_visible: boolean
          text_color: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bg_color: string
          casino_id: string
          created_at?: string
          denomination: number
          edge_color?: string
          id?: string
          is_promo?: boolean
          is_visible?: boolean
          text_color?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bg_color?: string
          casino_id?: string
          created_at?: string
          denomination?: number
          edge_color?: string
          id?: string
          is_promo?: boolean
          is_visible?: boolean
          text_color?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chip_color_settings_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_emissions: {
        Row: {
          casino_id: string
          created_at: string
          denomination: number
          id: string
          operator_id: string
          quantity_added: number
          reason: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          denomination: number
          id?: string
          operator_id: string
          quantity_added: number
          reason: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          denomination?: number
          id?: string
          operator_id?: string
          quantity_added?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "chip_emissions_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_initial_baseline: {
        Row: {
          casino_id: string
          created_at: string
          created_by: string | null
          denomination: number
          id: string
          initial_quantity: number
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          created_by?: string | null
          denomination: number
          id?: string
          initial_quantity?: number
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          created_by?: string | null
          denomination?: number
          id?: string
          initial_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chip_initial_baseline_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_inventory: {
        Row: {
          casino_id: string
          denomination: number
          id: string
          location_id: string | null
          location_type: string
          quantity: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          casino_id: string
          denomination: number
          id?: string
          location_id?: string | null
          location_type: string
          quantity?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          casino_id?: string
          denomination?: number
          id?: string
          location_id?: string | null
          location_type?: string
          quantity?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chip_inventory_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chip_inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_snapshots: {
        Row: {
          actual_quantity: number
          casino_id: string
          created_at: string
          date: string
          denomination: number
          expected_quantity: number
          id: string
          location_id: string | null
          location_type: string
          miss: number | null
          recorded_by: string
        }
        Insert: {
          actual_quantity?: number
          casino_id: string
          created_at?: string
          date: string
          denomination: number
          expected_quantity?: number
          id?: string
          location_id?: string | null
          location_type: string
          miss?: number | null
          recorded_by: string
        }
        Update: {
          actual_quantity?: number
          casino_id?: string
          created_at?: string
          date?: string
          denomination?: number
          expected_quantity?: number
          id?: string
          location_id?: string | null
          location_type?: string
          miss?: number | null
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "chip_snapshots_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chip_snapshots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_transfers: {
        Row: {
          amount: number
          business_date: string | null
          casino_id: string
          chips: Json | null
          counterparty_player_id: string
          created_at: string
          direction: string
          id: string
          note: string
          operator_id: string
          pair_id: string
          player_id: string
          shift_id: string
          table_id: string | null
        }
        Insert: {
          amount: number
          business_date?: string | null
          casino_id: string
          chips?: Json | null
          counterparty_player_id: string
          created_at?: string
          direction: string
          id?: string
          note?: string
          operator_id: string
          pair_id: string
          player_id: string
          shift_id: string
          table_id?: string | null
        }
        Update: {
          amount?: number
          business_date?: string | null
          casino_id?: string
          chips?: Json | null
          counterparty_player_id?: string
          created_at?: string
          direction?: string
          id?: string
          note?: string
          operator_id?: string
          pair_id?: string
          player_id?: string
          shift_id?: string
          table_id?: string | null
        }
        Relationships: []
      }
      client_sessions: {
        Row: {
          avg_bet: number
          bet_changed_at: string | null
          casino_id: string
          created_at: string
          created_by: string
          duration_minutes: number
          hands_played: number
          id: string
          player_id: string
          started_at: string
          stopped_at: string | null
          table_id: string
          total_bet: number
        }
        Insert: {
          avg_bet?: number
          bet_changed_at?: string | null
          casino_id: string
          created_at?: string
          created_by: string
          duration_minutes?: number
          hands_played?: number
          id?: string
          player_id: string
          started_at?: string
          stopped_at?: string | null
          table_id: string
          total_bet?: number
        }
        Update: {
          avg_bet?: number
          bet_changed_at?: string | null
          casino_id?: string
          created_at?: string
          created_by?: string
          duration_minutes?: number
          hands_played?: number
          id?: string
          player_id?: string
          started_at?: string
          stopped_at?: string | null
          table_id?: string
          total_bet?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_sessions_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sessions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "client_sessions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      client_sessions_archive: {
        Row: {
          avg_bet: number
          bet_changed_at: string | null
          casino_id: string
          created_at: string
          created_by: string
          duration_minutes: number
          hands_played: number
          id: string
          player_id: string
          started_at: string
          stopped_at: string | null
          table_id: string
          total_bet: number
        }
        Insert: {
          avg_bet?: number
          bet_changed_at?: string | null
          casino_id: string
          created_at?: string
          created_by: string
          duration_minutes?: number
          hands_played?: number
          id?: string
          player_id: string
          started_at?: string
          stopped_at?: string | null
          table_id: string
          total_bet?: number
        }
        Update: {
          avg_bet?: number
          bet_changed_at?: string | null
          casino_id?: string
          created_at?: string
          created_by?: string
          duration_minutes?: number
          hands_played?: number
          id?: string
          player_id?: string
          started_at?: string
          stopped_at?: string | null
          table_id?: string
          total_bet?: number
        }
        Relationships: []
      }
      cloud_clone_reports: {
        Row: {
          checks: Json
          created_at: string
          id: string
          node_id: string
          overall: string
          ran_at: string
          regressions: number
          upload_id: string
        }
        Insert: {
          checks?: Json
          created_at?: string
          id?: string
          node_id: string
          overall?: string
          ran_at?: string
          regressions?: number
          upload_id: string
        }
        Update: {
          checks?: Json
          created_at?: string
          id?: string
          node_id?: string
          overall?: string
          ran_at?: string
          regressions?: number
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cloud_clone_reports_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "cloud_clone_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      cloud_clone_uploads: {
        Row: {
          casino_id: string | null
          chunk_count: number
          created_at: string
          id: string
          node_id: string
          notes: Json
          rows_by_table: Json
          sha256: string
          size_bytes: number
          status: string
          storage_path: string | null
          uploaded_at: string
        }
        Insert: {
          casino_id?: string | null
          chunk_count: number
          created_at?: string
          id?: string
          node_id: string
          notes?: Json
          rows_by_table?: Json
          sha256: string
          size_bytes: number
          status?: string
          storage_path?: string | null
          uploaded_at?: string
        }
        Update: {
          casino_id?: string | null
          chunk_count?: number
          created_at?: string
          id?: string
          node_id?: string
          notes?: Json
          rows_by_table?: Json
          sha256?: string
          size_bytes?: number
          status?: string
          storage_path?: string | null
          uploaded_at?: string
        }
        Relationships: []
      }
      cloud_connection: {
        Row: {
          casino_id: string | null
          cloud_url: string | null
          connected_at: string | null
          id: number
          last_error: string | null
          last_polled_at: string | null
          pairing_code: string | null
          pairing_expires_at: string | null
          pairing_id: string | null
          status: string
          sync_secret: string | null
          updated_at: string
        }
        Insert: {
          casino_id?: string | null
          cloud_url?: string | null
          connected_at?: string | null
          id?: number
          last_error?: string | null
          last_polled_at?: string | null
          pairing_code?: string | null
          pairing_expires_at?: string | null
          pairing_id?: string | null
          status?: string
          sync_secret?: string | null
          updated_at?: string
        }
        Update: {
          casino_id?: string | null
          cloud_url?: string | null
          connected_at?: string | null
          id?: number
          last_error?: string | null
          last_polled_at?: string | null
          pairing_code?: string | null
          pairing_expires_at?: string | null
          pairing_id?: string | null
          status?: string
          sync_secret?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      club_account_secrets: {
        Row: {
          club_account_id: string
          created_at: string
          password_hash: string | null
          totp_secret_enc: string | null
          updated_at: string
        }
        Insert: {
          club_account_id: string
          created_at?: string
          password_hash?: string | null
          totp_secret_enc?: string | null
          updated_at?: string
        }
        Update: {
          club_account_id?: string
          created_at?: string
          password_hash?: string | null
          totp_secret_enc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_account_secrets_club_account_id_fkey"
            columns: ["club_account_id"]
            isOneToOne: true
            referencedRelation: "club_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      club_accounts: {
        Row: {
          created_at: string
          id: string
          last_login_at: string | null
          phone: string
          player_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          phone: string
          player_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          phone?: string
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_accounts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "club_accounts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      club_daily_spend_limits: {
        Row: {
          casino_id: string
          daily_cap_credits: number
          effective_from: string
          id: string
          notes: string | null
          set_at: string
          set_by: string | null
        }
        Insert: {
          casino_id: string
          daily_cap_credits?: number
          effective_from?: string
          id?: string
          notes?: string | null
          set_at?: string
          set_by?: string | null
        }
        Update: {
          casino_id?: string
          daily_cap_credits?: number
          effective_from?: string
          id?: string
          notes?: string | null
          set_at?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_daily_spend_limits_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      club_otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          phone: string
          used_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          used_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          used_at?: string | null
        }
        Relationships: []
      }
      consultation_requests: {
        Row: {
          company: string | null
          contact: string
          created_at: string
          email_error: string | null
          email_sent: boolean
          id: string
          language: string
          message: string
          name: string
          source_url: string | null
          user_agent: string | null
        }
        Insert: {
          company?: string | null
          contact: string
          created_at?: string
          email_error?: string | null
          email_sent?: boolean
          id?: string
          language?: string
          message: string
          name: string
          source_url?: string | null
          user_agent?: string | null
        }
        Update: {
          company?: string | null
          contact?: string
          created_at?: string
          email_error?: string | null
          email_sent?: boolean
          id?: string
          language?: string
          message?: string
          name?: string
          source_url?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      cron_run_log: {
        Row: {
          created_at: string
          details: Json | null
          duration_ms: number | null
          id: number
          job_name: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          id?: number
          job_name: string
          status: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          id?: number
          job_name?: string
          status?: string
        }
        Relationships: []
      }
      cutover_sessions: {
        Row: {
          casino_id: string
          completed_at: string | null
          delta_rows: number
          drain_ms: number | null
          id: string
          initiated_by: string | null
          notes: string | null
          rollback_window_until: string | null
          seed_rows: number
          source_node_id: string | null
          started_at: string
          state: string
          target_node_id: string | null
          updated_at: string
        }
        Insert: {
          casino_id: string
          completed_at?: string | null
          delta_rows?: number
          drain_ms?: number | null
          id?: string
          initiated_by?: string | null
          notes?: string | null
          rollback_window_until?: string | null
          seed_rows?: number
          source_node_id?: string | null
          started_at?: string
          state?: string
          target_node_id?: string | null
          updated_at?: string
        }
        Update: {
          casino_id?: string
          completed_at?: string | null
          delta_rows?: number
          drain_ms?: number | null
          id?: string
          initiated_by?: string | null
          notes?: string | null
          rollback_window_until?: string | null
          seed_rows?: number
          source_node_id?: string | null
          started_at?: string
          state?: string
          target_node_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cutover_sessions_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_attendance: {
        Row: {
          casino_id: string
          created_at: string
          date: string
          employee_id: string
          id: string
          recorded_by: string
          updated_at: string
          value: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          date: string
          employee_id: string
          id?: string
          recorded_by: string
          updated_at?: string
          value?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          recorded_by?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_attendance_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_seed_log: {
        Row: {
          casino_id: string
          created_at: string
          id: number
          row_id: string
          table_name: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          id?: number
          row_id: string
          table_name: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          id?: number
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      employee_bank_accounts: {
        Row: {
          account_number: string
          bank_code: string
          bank_name: string
          branch_code: string
          created_at: string
          employee_id: string
          id: string
          is_primary: boolean
        }
        Insert: {
          account_number?: string
          bank_code?: string
          bank_name?: string
          branch_code?: string
          created_at?: string
          employee_id: string
          id?: string
          is_primary?: boolean
        }
        Update: {
          account_number?: string
          bank_code?: string
          bank_name?: string
          branch_code?: string
          created_at?: string
          employee_id?: string
          id?: string
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employee_bank_accounts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_playlist_notes: {
        Row: {
          casino_id: string
          employee_id: string
          note: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          casino_id: string
          employee_id: string
          note?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          casino_id?: string
          employee_id?: string
          note?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_playlist_notes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_role_history: {
        Row: {
          created_at: string
          dealer_category: string | null
          department: string
          effective_from: string
          employee_id: string
          id: string
          is_pit_boss: boolean
          position: string
        }
        Insert: {
          created_at?: string
          dealer_category?: string | null
          department?: string
          effective_from: string
          employee_id: string
          id?: string
          is_pit_boss?: boolean
          position?: string
        }
        Update: {
          created_at?: string
          dealer_category?: string | null
          department?: string
          effective_from?: string
          employee_id?: string
          id?: string
          is_pit_boss?: boolean
          position?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_role_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          annual_leave_earned: number
          annual_leave_sold: number
          annual_leave_used: number
          basic_salary: number
          birthday: string | null
          casino_id: string
          confidentiality_agreement: boolean
          contract_end: string | null
          contract_start: string | null
          contract_type: string | null
          corporate_mail: string | null
          created_at: string
          created_by: string | null
          dealer_category: string | null
          department: string
          disciplinary_acknowledged: boolean
          employment_date: string | null
          first_name: string
          full_name: string
          gender: string | null
          general_details: string | null
          gepf_number: string | null
          id: string
          intro_to_work: boolean
          is_pit_boss: boolean
          job_description: string | null
          last_name: string
          license_available: boolean
          license_pass_date: string | null
          license_type: string | null
          nationality: string | null
          nssf_number: string | null
          onboarding_date: string | null
          payroll_status: string
          phone: string | null
          photo_url: string | null
          position: string
          source_table: string | null
          staff_rules_acknowledged: boolean
          tax_id: string | null
          uniform_issued: boolean
          updated_at: string
        }
        Insert: {
          annual_leave_earned?: number
          annual_leave_sold?: number
          annual_leave_used?: number
          basic_salary?: number
          birthday?: string | null
          casino_id: string
          confidentiality_agreement?: boolean
          contract_end?: string | null
          contract_start?: string | null
          contract_type?: string | null
          corporate_mail?: string | null
          created_at?: string
          created_by?: string | null
          dealer_category?: string | null
          department?: string
          disciplinary_acknowledged?: boolean
          employment_date?: string | null
          first_name?: string
          full_name: string
          gender?: string | null
          general_details?: string | null
          gepf_number?: string | null
          id?: string
          intro_to_work?: boolean
          is_pit_boss?: boolean
          job_description?: string | null
          last_name?: string
          license_available?: boolean
          license_pass_date?: string | null
          license_type?: string | null
          nationality?: string | null
          nssf_number?: string | null
          onboarding_date?: string | null
          payroll_status?: string
          phone?: string | null
          photo_url?: string | null
          position?: string
          source_table?: string | null
          staff_rules_acknowledged?: boolean
          tax_id?: string | null
          uniform_issued?: boolean
          updated_at?: string
        }
        Update: {
          annual_leave_earned?: number
          annual_leave_sold?: number
          annual_leave_used?: number
          basic_salary?: number
          birthday?: string | null
          casino_id?: string
          confidentiality_agreement?: boolean
          contract_end?: string | null
          contract_start?: string | null
          contract_type?: string | null
          corporate_mail?: string | null
          created_at?: string
          created_by?: string | null
          dealer_category?: string | null
          department?: string
          disciplinary_acknowledged?: boolean
          employment_date?: string | null
          first_name?: string
          full_name?: string
          gender?: string | null
          general_details?: string | null
          gepf_number?: string | null
          id?: string
          intro_to_work?: boolean
          is_pit_boss?: boolean
          job_description?: string | null
          last_name?: string
          license_available?: boolean
          license_pass_date?: string | null
          license_type?: string | null
          nationality?: string | null
          nssf_number?: string | null
          onboarding_date?: string | null
          payroll_status?: string
          phone?: string | null
          photo_url?: string | null
          position?: string
          source_table?: string | null
          staff_rules_acknowledged?: boolean
          tax_id?: string | null
          uniform_issued?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      endpoint_health_checks: {
        Row: {
          checked_at: string
          duration_ms: number | null
          endpoint: string
          error: string | null
          http_code: number | null
          id: string
          status: string
        }
        Insert: {
          checked_at?: string
          duration_ms?: number | null
          endpoint: string
          error?: string | null
          http_code?: number | null
          id?: string
          status: string
        }
        Update: {
          checked_at?: string
          duration_ms?: number | null
          endpoint?: string
          error?: string | null
          http_code?: number | null
          id?: string
          status?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          active: boolean
          casino_id: string
          code: string
          created_at: string
          fin_category_id: string | null
          id: string
          label: string
          scope: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          casino_id: string
          code: string
          created_at?: string
          fin_category_id?: string | null
          id?: string
          label: string
          scope?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          casino_id?: string
          code?: string
          created_at?: string
          fin_category_id?: string | null
          id?: string
          label?: string
          scope?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_fin_category_id_fkey"
            columns: ["fin_category_id"]
            isOneToOne: false
            referencedRelation: "fin_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          amount_tzs: number | null
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          business_date: string | null
          cage_slots_shift_id: string | null
          cage_type: string
          casino_id: string
          category: Database["public"]["Enums"]["expense_category"]
          category_code: string | null
          created_at: string
          created_by: string
          currency: string
          description: string
          exchange_rate: number
          fin_category_id: string | null
          id: string
          is_overrun: boolean
          overrun_approved_by: string | null
          overrun_reason: string | null
          player_id: string | null
          player_name: string
          reversal_of: string | null
          reversed_by: string | null
          shift_id: string | null
          source: string
          voided_at: string | null
          voided_by: string | null
          wallet_id: string | null
        }
        Insert: {
          amount: number
          amount_tzs?: number | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          business_date?: string | null
          cage_slots_shift_id?: string | null
          cage_type?: string
          casino_id: string
          category: Database["public"]["Enums"]["expense_category"]
          category_code?: string | null
          created_at?: string
          created_by: string
          currency?: string
          description?: string
          exchange_rate?: number
          fin_category_id?: string | null
          id?: string
          is_overrun?: boolean
          overrun_approved_by?: string | null
          overrun_reason?: string | null
          player_id?: string | null
          player_name?: string
          reversal_of?: string | null
          reversed_by?: string | null
          shift_id?: string | null
          source?: string
          voided_at?: string | null
          voided_by?: string | null
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          amount_tzs?: number | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          business_date?: string | null
          cage_slots_shift_id?: string | null
          cage_type?: string
          casino_id?: string
          category?: Database["public"]["Enums"]["expense_category"]
          category_code?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          description?: string
          exchange_rate?: number
          fin_category_id?: string | null
          id?: string
          is_overrun?: boolean
          overrun_approved_by?: string | null
          overrun_reason?: string | null
          player_id?: string | null
          player_name?: string
          reversal_of?: string | null
          reversed_by?: string | null
          shift_id?: string | null
          source?: string
          voided_at?: string | null
          voided_by?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_cage_slots_shift_id_fkey"
            columns: ["cage_slots_shift_id"]
            isOneToOne: false
            referencedRelation: "cage_slots_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_fin_category_fk"
            columns: ["fin_category_id"]
            isOneToOne: false
            referencedRelation: "fin_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "expenses_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_wallet_fk"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "fin_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_audit_log: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          before: Json | null
          casino_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string
          id: string
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          casino_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table: string
          id?: string
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          casino_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          id?: string
        }
        Relationships: []
      }
      fin_audit_log_archive: {
        Row: {
          action: string
          actor: string | null
          archived_at: string
          casino_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string | null
          id: string
          meta: Json | null
        }
        Insert: {
          action: string
          actor?: string | null
          archived_at?: string
          casino_id?: string | null
          created_at: string
          entity_id?: string | null
          entity_table?: string | null
          id: string
          meta?: Json | null
        }
        Update: {
          action?: string
          actor?: string | null
          archived_at?: string
          casino_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          id?: string
          meta?: Json | null
        }
        Relationships: []
      }
      fin_budget: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          casino_id: string
          category_id: string
          created_at: string
          currency: string
          id: string
          locked_at: string | null
          month: number
          overrun_limit_pct: number
          planned_amount: number
          updated_at: string
          year: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          casino_id: string
          category_id: string
          created_at?: string
          currency: string
          id?: string
          locked_at?: string | null
          month: number
          overrun_limit_pct?: number
          planned_amount?: number
          updated_at?: string
          year: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          casino_id?: string
          category_id?: string
          created_at?: string
          currency?: string
          id?: string
          locked_at?: string | null
          month?: number
          overrun_limit_pct?: number
          planned_amount?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_budget_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_budget_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fin_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_categories: {
        Row: {
          created_at: string
          group_code: string
          group_name: string
          id: string
          is_active: boolean
          is_income: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_code: string
          group_name: string
          id?: string
          is_active?: boolean
          is_income?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_code?: string
          group_name?: string
          id?: string
          is_active?: boolean
          is_income?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      fin_category_aliases: {
        Row: {
          alias_norm: string
          alias_original: string
          category_id: string
          created_at: string
          created_by: string | null
          id: string
        }
        Insert: {
          alias_norm: string
          alias_original: string
          category_id: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Update: {
          alias_norm?: string
          alias_original?: string
          category_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_category_aliases_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fin_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_daily_rates: {
        Row: {
          business_date: string
          casino_id: string
          created_at: string
          currency: string
          id: string
          rate_to_tzs: number
          set_at: string
          set_by: string | null
          updated_at: string
        }
        Insert: {
          business_date: string
          casino_id: string
          created_at?: string
          currency: string
          id?: string
          rate_to_tzs: number
          set_at?: string
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          business_date?: string
          casino_id?: string
          created_at?: string
          currency?: string
          id?: string
          rate_to_tzs?: number
          set_at?: string
          set_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_daily_rates_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_day_closing: {
        Row: {
          business_date: string
          casino_id: string
          closed_by: string | null
          created_at: string
          id: string
          income_lines: Json
          locked_at: string | null
          notes: string | null
          slots_result: number
          tables_result: number
          updated_at: string
          variance_note: string | null
        }
        Insert: {
          business_date: string
          casino_id: string
          closed_by?: string | null
          created_at?: string
          id?: string
          income_lines?: Json
          locked_at?: string | null
          notes?: string | null
          slots_result?: number
          tables_result?: number
          updated_at?: string
          variance_note?: string | null
        }
        Update: {
          business_date?: string
          casino_id?: string
          closed_by?: string | null
          created_at?: string
          id?: string
          income_lines?: Json
          locked_at?: string | null
          notes?: string | null
          slots_result?: number
          tables_result?: number
          updated_at?: string
          variance_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_day_closing_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_excel_imports: {
        Row: {
          applied_at: string | null
          casino_id: string
          created_at: string
          error_log: string | null
          filename: string
          id: string
          imported_by: string
          mapping: Json | null
          raw_data: Json
          rows_imported: number | null
          status: string
          target_kind: string
        }
        Insert: {
          applied_at?: string | null
          casino_id: string
          created_at?: string
          error_log?: string | null
          filename: string
          id?: string
          imported_by: string
          mapping?: Json | null
          raw_data: Json
          rows_imported?: number | null
          status?: string
          target_kind: string
        }
        Update: {
          applied_at?: string | null
          casino_id?: string
          created_at?: string
          error_log?: string | null
          filename?: string
          id?: string
          imported_by?: string
          mapping?: Json | null
          raw_data?: Json
          rows_imported?: number | null
          status?: string
          target_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_excel_imports_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_incomes: {
        Row: {
          amount: number
          casino_id: string
          created_at: string
          created_by: string | null
          currency: string
          fin_category_id: string
          id: string
          month: number
          notes: string | null
          updated_at: string
          year: number
        }
        Insert: {
          amount?: number
          casino_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          fin_category_id: string
          id?: string
          month: number
          notes?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          amount?: number
          casino_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          fin_category_id?: string
          id?: string
          month?: number
          notes?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_incomes_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_incomes_fin_category_id_fkey"
            columns: ["fin_category_id"]
            isOneToOne: false
            referencedRelation: "fin_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_money_change: {
        Row: {
          business_date: string
          casino_id: string
          created_at: string
          from_amount: number
          from_currency: string
          from_wallet_id: string
          id: string
          manager_id: string
          note: string | null
          rate: number
          to_amount: number
          to_casino_id: string | null
          to_currency: string
          to_wallet_id: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          business_date: string
          casino_id: string
          created_at?: string
          from_amount: number
          from_currency: string
          from_wallet_id: string
          id?: string
          manager_id: string
          note?: string | null
          rate: number
          to_amount: number
          to_casino_id?: string | null
          to_currency: string
          to_wallet_id: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          business_date?: string
          casino_id?: string
          created_at?: string
          from_amount?: number
          from_currency?: string
          from_wallet_id?: string
          id?: string
          manager_id?: string
          note?: string | null
          rate?: number
          to_amount?: number
          to_casino_id?: string | null
          to_currency?: string
          to_wallet_id?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_money_change_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_money_change_from_wallet_id_fkey"
            columns: ["from_wallet_id"]
            isOneToOne: false
            referencedRelation: "fin_wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_money_change_to_casino_id_fkey"
            columns: ["to_casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_money_change_to_wallet_id_fkey"
            columns: ["to_wallet_id"]
            isOneToOne: false
            referencedRelation: "fin_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_month_closures: {
        Row: {
          casino_id: string
          closed_at: string
          closed_by: string
          collection_details: Json
          collection_total_tzs: number
          collection_total_usd: number
          created_at: string
          id: string
          month: number
          new_float_details: Json
          note: string | null
          year: number
        }
        Insert: {
          casino_id: string
          closed_at?: string
          closed_by: string
          collection_details?: Json
          collection_total_tzs?: number
          collection_total_usd?: number
          created_at?: string
          id?: string
          month: number
          new_float_details?: Json
          note?: string | null
          year: number
        }
        Update: {
          casino_id?: string
          closed_at?: string
          closed_by?: string
          collection_details?: Json
          collection_total_tzs?: number
          collection_total_usd?: number
          created_at?: string
          id?: string
          month?: number
          new_float_details?: Json
          note?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_month_closures_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_other_incomes: {
        Row: {
          amount: number
          business_date: string
          casino_id: string
          created_at: string
          created_by: string
          currency: string
          fin_category_id: string | null
          fx_rate: number
          id: string
          note: string | null
          reversed_by_id: string | null
          reverses_id: string | null
          source: string
          wallet_id: string
          wallet_tx_id: string | null
        }
        Insert: {
          amount: number
          business_date: string
          casino_id: string
          created_at?: string
          created_by: string
          currency: string
          fin_category_id?: string | null
          fx_rate?: number
          id?: string
          note?: string | null
          reversed_by_id?: string | null
          reverses_id?: string | null
          source: string
          wallet_id: string
          wallet_tx_id?: string | null
        }
        Update: {
          amount?: number
          business_date?: string
          casino_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          fin_category_id?: string | null
          fx_rate?: number
          id?: string
          note?: string | null
          reversed_by_id?: string | null
          reverses_id?: string | null
          source?: string
          wallet_id?: string
          wallet_tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_other_incomes_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_other_incomes_fin_category_id_fkey"
            columns: ["fin_category_id"]
            isOneToOne: false
            referencedRelation: "fin_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_other_incomes_reversed_by_id_fkey"
            columns: ["reversed_by_id"]
            isOneToOne: false
            referencedRelation: "fin_other_incomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_other_incomes_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "fin_other_incomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_other_incomes_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "fin_wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_other_incomes_wallet_tx_id_fkey"
            columns: ["wallet_tx_id"]
            isOneToOne: false
            referencedRelation: "fin_wallet_tx"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_wallet_tx: {
        Row: {
          amount: number
          amount_tzs: number
          business_date: string
          casino_id: string
          category_id: string | null
          created_at: string
          created_by: string
          currency: string
          fx_rate: number
          id: string
          kind: string
          note: string | null
          ref_id: string | null
          ref_table: string | null
          reversal_of: string | null
          wallet_id: string
        }
        Insert: {
          amount: number
          amount_tzs: number
          business_date: string
          casino_id: string
          category_id?: string | null
          created_at?: string
          created_by: string
          currency: string
          fx_rate?: number
          id?: string
          kind: string
          note?: string | null
          ref_id?: string | null
          ref_table?: string | null
          reversal_of?: string | null
          wallet_id: string
        }
        Update: {
          amount?: number
          amount_tzs?: number
          business_date?: string
          casino_id?: string
          category_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          fx_rate?: number
          id?: string
          kind?: string
          note?: string | null
          ref_id?: string | null
          ref_table?: string | null
          reversal_of?: string | null
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_wallet_tx_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_wallet_tx_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fin_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_wallet_tx_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "fin_wallet_tx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_wallet_tx_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "fin_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_wallets: {
        Row: {
          casino_id: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          kind: string
          name: string
          sort_order: number
          starting_float_amount: number
          starting_float_date: string | null
          starting_float_note: string | null
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          currency: string
          id?: string
          is_active?: boolean
          kind: string
          name: string
          sort_order?: number
          starting_float_amount?: number
          starting_float_date?: string | null
          starting_float_note?: string | null
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          sort_order?: number
          starting_float_amount?: number
          starting_float_date?: string | null
          starting_float_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_wallets_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_bulk_operations: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          done_count: number
          error_count: number
          id: string
          kind: string
          payload: Json
          runbook_id: string | null
          status: string
          target_node_ids: string[]
          total_count: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          done_count?: number
          error_count?: number
          id?: string
          kind: string
          payload?: Json
          runbook_id?: string | null
          status?: string
          target_node_ids?: string[]
          total_count?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          done_count?: number
          error_count?: number
          id?: string
          kind?: string
          payload?: Json
          runbook_id?: string | null
          status?: string
          target_node_ids?: string[]
          total_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "fleet_bulk_operations_runbook_id_fkey"
            columns: ["runbook_id"]
            isOneToOne: false
            referencedRelation: "fleet_runbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_commands: {
        Row: {
          bulk_op_id: string | null
          completed_at: string | null
          id: string
          issued_at: string
          issued_by: string | null
          kind: string
          node_id: string
          payload: Json
          result_text: string | null
          runbook_id: string | null
          status: string
        }
        Insert: {
          bulk_op_id?: string | null
          completed_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          kind: string
          node_id: string
          payload?: Json
          result_text?: string | null
          runbook_id?: string | null
          status?: string
        }
        Update: {
          bulk_op_id?: string | null
          completed_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          kind?: string
          node_id?: string
          payload?: Json
          result_text?: string | null
          runbook_id?: string | null
          status?: string
        }
        Relationships: []
      }
      fleet_heartbeats: {
        Row: {
          auto_rollback_at: string | null
          auto_rollback_reason: string | null
          casino_id: string | null
          cms_version: string | null
          cpu_load: number | null
          disk_used_pct: number | null
          first_seen_at: string
          hostname: string | null
          last_seen_at: string
          license_expires_at: string | null
          license_mode: string | null
          local_ip: unknown
          node_id: string
          notes: Json
          public_ip: unknown
          ram_used_pct: number | null
          tailscale_ip: unknown
          uptime_seconds: number | null
        }
        Insert: {
          auto_rollback_at?: string | null
          auto_rollback_reason?: string | null
          casino_id?: string | null
          cms_version?: string | null
          cpu_load?: number | null
          disk_used_pct?: number | null
          first_seen_at?: string
          hostname?: string | null
          last_seen_at?: string
          license_expires_at?: string | null
          license_mode?: string | null
          local_ip?: unknown
          node_id: string
          notes?: Json
          public_ip?: unknown
          ram_used_pct?: number | null
          tailscale_ip?: unknown
          uptime_seconds?: number | null
        }
        Update: {
          auto_rollback_at?: string | null
          auto_rollback_reason?: string | null
          casino_id?: string | null
          cms_version?: string | null
          cpu_load?: number | null
          disk_used_pct?: number | null
          first_seen_at?: string
          hostname?: string | null
          last_seen_at?: string
          license_expires_at?: string | null
          license_mode?: string | null
          local_ip?: unknown
          node_id?: string
          notes?: Json
          public_ip?: unknown
          ram_used_pct?: number | null
          tailscale_ip?: unknown
          uptime_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_heartbeats_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_incident_forwards: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          body: string | null
          category: string | null
          id: string
          local_incident_id: string | null
          metadata: Json
          node_id: string
          occurred_at: string
          received_at: string
          severity: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          body?: string | null
          category?: string | null
          id?: string
          local_incident_id?: string | null
          metadata?: Json
          node_id: string
          occurred_at?: string
          received_at?: string
          severity?: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          body?: string | null
          category?: string | null
          id?: string
          local_incident_id?: string | null
          metadata?: Json
          node_id?: string
          occurred_at?: string
          received_at?: string
          severity?: string
          title?: string
        }
        Relationships: []
      }
      fleet_runbooks: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_destructive: boolean
          name: string
          requires_confirmation: boolean
          sql_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_destructive?: boolean
          name: string
          requires_confirmation?: boolean
          sql_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_destructive?: boolean
          name?: string
          requires_confirmation?: boolean
          sql_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      gaming_tables: {
        Row: {
          casino_id: string
          closing_chips: Json | null
          closing_result: number | null
          created_at: string
          denominations: number[]
          display_order: number
          float_amount: number
          game: string
          id: string
          is_archived: boolean
          name: string
          status: Database["public"]["Enums"]["table_status"]
        }
        Insert: {
          casino_id: string
          closing_chips?: Json | null
          closing_result?: number | null
          created_at?: string
          denominations?: number[]
          display_order?: number
          float_amount?: number
          game: string
          id?: string
          is_archived?: boolean
          name: string
          status?: Database["public"]["Enums"]["table_status"]
        }
        Update: {
          casino_id?: string
          closing_chips?: Json | null
          closing_result?: number | null
          created_at?: string
          denominations?: number[]
          display_order?: number
          float_amount?: number
          game?: string
          id?: string
          is_archived?: boolean
          name?: string
          status?: Database["public"]["Enums"]["table_status"]
        }
        Relationships: [
          {
            foreignKeyName: "gaming_tables_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          left_at: string | null
          player_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
          player_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "player_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "group_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      house_promo_fund: {
        Row: {
          balance: number
          casino_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          casino_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          casino_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_promo_fund_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: true
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      house_promo_ledger: {
        Row: {
          casino_id: string
          created_at: string
          created_by: string | null
          delta: number
          id: string
          reason: string
          ref_id: string | null
          ref_type: string | null
        }
        Insert: {
          casino_id: string
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          reason: string
          ref_id?: string | null
          ref_type?: string | null
        }
        Update: {
          casino_id?: string
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          reason?: string
          ref_id?: string | null
          ref_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "house_promo_ledger_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          business_date: string | null
          casino_id: string
          cctv_observer: string | null
          comments: string | null
          created_at: string
          created_by: string | null
          dealer_name: string | null
          department: string | null
          employees: string | null
          id: string
          incident: string
          incident_date: string
          incident_time: string
          inspector_name: string | null
          manager: string | null
          outcome: string | null
          photo_url: string | null
          points: number
          table_name: string | null
          violation_type: string | null
        }
        Insert: {
          business_date?: string | null
          casino_id: string
          cctv_observer?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          dealer_name?: string | null
          department?: string | null
          employees?: string | null
          id?: string
          incident: string
          incident_date: string
          incident_time: string
          inspector_name?: string | null
          manager?: string | null
          outcome?: string | null
          photo_url?: string | null
          points?: number
          table_name?: string | null
          violation_type?: string | null
        }
        Update: {
          business_date?: string | null
          casino_id?: string
          cctv_observer?: string | null
          comments?: string | null
          created_at?: string
          created_by?: string | null
          dealer_name?: string | null
          department?: string | null
          employees?: string | null
          id?: string
          incident?: string
          incident_date?: string
          incident_time?: string
          inspector_name?: string | null
          manager?: string | null
          outcome?: string | null
          photo_url?: string | null
          points?: number
          table_name?: string | null
          violation_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents_audit: {
        Row: {
          casino_id: string
          changes: Json
          edited_at: string
          edited_by: string | null
          id: string
          incident_id: string
        }
        Insert: {
          casino_id: string
          changes: Json
          edited_at?: string
          edited_by?: string | null
          id?: string
          incident_id: string
        }
        Update: {
          casino_id?: string
          changes?: Json
          edited_at?: string
          edited_by?: string | null
          id?: string
          incident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_audit_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      initial_sync_jobs: {
        Row: {
          casino_id: string
          created_at: string
          current_table: string | null
          error: string | null
          finished_at: string | null
          id: string
          local_server_id: string
          requested_by: string | null
          rows_done: number
          rows_total: number
          started_at: string | null
          status: string
          tables_done: number
          tables_total: number
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          current_table?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          local_server_id: string
          requested_by?: string | null
          rows_done?: number
          rows_total?: number
          started_at?: string | null
          status?: string
          tables_done?: number
          tables_total?: number
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          current_table?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          local_server_id?: string
          requested_by?: string | null
          rows_done?: number
          rows_total?: number
          started_at?: string | null
          status?: string
          tables_done?: number
          tables_total?: number
          updated_at?: string
        }
        Relationships: []
      }
      kyc_reviews: {
        Row: {
          ai_result: Json | null
          am_decision_at: string | null
          am_notes: string | null
          am_user_id: string | null
          casino_id: string
          created_at: string
          id: string
          player_id: string
          source: Database["public"]["Enums"]["kyc_review_source"]
          status: Database["public"]["Enums"]["kyc_review_status"]
          updated_at: string
        }
        Insert: {
          ai_result?: Json | null
          am_decision_at?: string | null
          am_notes?: string | null
          am_user_id?: string | null
          casino_id: string
          created_at?: string
          id?: string
          player_id: string
          source: Database["public"]["Enums"]["kyc_review_source"]
          status?: Database["public"]["Enums"]["kyc_review_status"]
          updated_at?: string
        }
        Update: {
          ai_result?: Json | null
          am_decision_at?: string | null
          am_notes?: string | null
          am_user_id?: string | null
          casino_id?: string
          created_at?: string
          id?: string
          player_id?: string
          source?: Database["public"]["Enums"]["kyc_review_source"]
          status?: Database["public"]["Enums"]["kyc_review_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_reviews_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_reviews_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "kyc_reviews_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      lotteries: {
        Row: {
          casino_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          draw_business_date: string
          id: string
          max_tickets_per_player: number | null
          name: string
          prize_fund_description: string | null
          status: string
          ticket_price_credits: number
          total_tickets_cap: number | null
        }
        Insert: {
          casino_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          draw_business_date: string
          id?: string
          max_tickets_per_player?: number | null
          name: string
          prize_fund_description?: string | null
          status?: string
          ticket_price_credits: number
          total_tickets_cap?: number | null
        }
        Update: {
          casino_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          draw_business_date?: string
          id?: string
          max_tickets_per_player?: number | null
          name?: string
          prize_fund_description?: string | null
          status?: string
          ticket_price_credits?: number
          total_tickets_cap?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lotteries_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      lottery_tickets: {
        Row: {
          id: string
          lottery_id: string
          paid_credits: number
          player_id: string
          purchased_at: string
          purchased_via: string
          ticket_number: number
        }
        Insert: {
          id?: string
          lottery_id: string
          paid_credits: number
          player_id: string
          purchased_at?: string
          purchased_via?: string
          ticket_number: number
        }
        Update: {
          id?: string
          lottery_id?: string
          paid_credits?: number
          player_id?: string
          purchased_at?: string
          purchased_via?: string
          ticket_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "lottery_tickets_lottery_id_fkey"
            columns: ["lottery_id"]
            isOneToOne: false
            referencedRelation: "lotteries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lottery_tickets_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "lottery_tickets_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      merge_group_dismissed: {
        Row: {
          dismissed_at: string
          dismissed_by: string | null
          expires_at: string
          id: string
          player_ids: string[]
        }
        Insert: {
          dismissed_at?: string
          dismissed_by?: string | null
          expires_at?: string
          id?: string
          player_ids: string[]
        }
        Update: {
          dismissed_at?: string
          dismissed_by?: string | null
          expires_at?: string
          id?: string
          player_ids?: string[]
        }
        Relationships: []
      }
      mirror_cutover_state: {
        Row: {
          casino_id: string
          freeze_started_at: string | null
          freeze_started_by: string | null
          last_parity_at: string | null
          last_parity_ok: boolean | null
          last_parity_summary: Json | null
          promoted_by: string | null
          promoted_to_local_at: string | null
          updated_at: string
          write_freeze: boolean
        }
        Insert: {
          casino_id: string
          freeze_started_at?: string | null
          freeze_started_by?: string | null
          last_parity_at?: string | null
          last_parity_ok?: boolean | null
          last_parity_summary?: Json | null
          promoted_by?: string | null
          promoted_to_local_at?: string | null
          updated_at?: string
          write_freeze?: boolean
        }
        Update: {
          casino_id?: string
          freeze_started_at?: string | null
          freeze_started_by?: string | null
          last_parity_at?: string | null
          last_parity_ok?: boolean | null
          last_parity_summary?: Json | null
          promoted_by?: string | null
          promoted_to_local_at?: string | null
          updated_at?: string
          write_freeze?: boolean
        }
        Relationships: []
      }
      monthly_tips_entries: {
        Row: {
          bonus_points: number
          casino_id: string
          created_at: string
          employee_id: string
          extra_override: number | null
          id: string
          period_start: string
          updated_at: string
        }
        Insert: {
          bonus_points?: number
          casino_id: string
          created_at?: string
          employee_id: string
          extra_override?: number | null
          id?: string
          period_start: string
          updated_at?: string
        }
        Update: {
          bonus_points?: number
          casino_id?: string
          created_at?: string
          employee_id?: string
          extra_override?: number | null
          id?: string
          period_start?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_tips_entries_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_tips_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_tips_pools: {
        Row: {
          calculated_at: string | null
          calculated_by: string | null
          casino_id: string
          created_at: string
          currency: string
          id: string
          is_calculated: boolean
          period_start: string
          pool_amount: number
          updated_at: string
        }
        Insert: {
          calculated_at?: string | null
          calculated_by?: string | null
          casino_id: string
          created_at?: string
          currency?: string
          id?: string
          is_calculated?: boolean
          period_start: string
          pool_amount?: number
          updated_at?: string
        }
        Update: {
          calculated_at?: string | null
          calculated_by?: string | null
          casino_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_calculated?: boolean
          period_start?: string
          pool_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_tips_pools_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      node_commands: {
        Row: {
          action: string
          completed_at: string | null
          id: string
          issued_at: string
          issued_by: string | null
          popped_at: string | null
          result_text: string | null
          status: string
          target_node_id: string
        }
        Insert: {
          action: string
          completed_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          popped_at?: string | null
          result_text?: string | null
          status?: string
          target_node_id: string
        }
        Update: {
          action?: string
          completed_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          popped_at?: string | null
          result_text?: string | null
          status?: string
          target_node_id?: string
        }
        Relationships: []
      }
      node_identity: {
        Row: {
          created_at: string
          display_name: string
          id: boolean
          node_id: string
          node_kind: string
          owned_casino_ids: string[]
          schema_version: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id?: boolean
          node_id?: string
          node_kind?: string
          owned_casino_ids?: string[]
          schema_version?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: boolean
          node_id?: string
          node_kind?: string
          owned_casino_ids?: string[]
          schema_version?: string
          updated_at?: string
        }
        Relationships: []
      }
      node_modes: {
        Row: {
          casino_id: string
          mode: string
          notes: string | null
          promoted_at: string | null
          promoted_by: string | null
          updated_at: string
        }
        Insert: {
          casino_id: string
          mode?: string
          notes?: string | null
          promoted_at?: string | null
          promoted_by?: string | null
          updated_at?: string
        }
        Update: {
          casino_id?: string
          mode?: string
          notes?: string | null
          promoted_at?: string | null
          promoted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "node_modes_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: true
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      onprem_channel_migrations: {
        Row: {
          applied_at: string
          channel_id: string
          error: string | null
          id: string
          ok: boolean
          sql_hash: string
          version: string
        }
        Insert: {
          applied_at?: string
          channel_id: string
          error?: string | null
          id?: string
          ok?: boolean
          sql_hash: string
          version: string
        }
        Update: {
          applied_at?: string
          channel_id?: string
          error?: string | null
          id?: string
          ok?: boolean
          sql_hash?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "onprem_channel_migrations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "onprem_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      onprem_channels: {
        Row: {
          casino_id: string
          cf_tunnel_id: string | null
          created_at: string
          hmac_secret_hash: string
          id: string
          last_seen_at: string | null
          outbox_lag: number | null
          paired_at: string | null
          paired_by: string | null
          pairing_code: string | null
          pairing_expires_at: string | null
          slug: string
          status: string
          tunnel_hostname: string
          updated_at: string
          version: string | null
        }
        Insert: {
          casino_id: string
          cf_tunnel_id?: string | null
          created_at?: string
          hmac_secret_hash: string
          id?: string
          last_seen_at?: string | null
          outbox_lag?: number | null
          paired_at?: string | null
          paired_by?: string | null
          pairing_code?: string | null
          pairing_expires_at?: string | null
          slug: string
          status?: string
          tunnel_hostname: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          casino_id?: string
          cf_tunnel_id?: string | null
          created_at?: string
          hmac_secret_hash?: string
          id?: string
          last_seen_at?: string | null
          outbox_lag?: number | null
          paired_at?: string | null
          paired_by?: string | null
          pairing_code?: string | null
          pairing_expires_at?: string | null
          slug?: string
          status?: string
          tunnel_hostname?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onprem_channels_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          casino_id: string
          created_at: string
          details: Json
          id: string
          period_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          casino_id: string
          created_at?: string
          details?: Json
          id?: string
          period_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          casino_id?: string
          created_at?: string
          details?: Json
          id?: string
          period_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_audit_log_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_entries: {
        Row: {
          cash_shortage: number
          casino_id: string
          created_at: string
          deductions_missing_days: number
          employee_id: string | null
          gepf_employee: number
          gepf_loan: number
          gross_salary: number
          hrs_worked_on_holiday: number
          id: string
          missing_days: number
          net_salary: number
          night_allowance: number
          night_allowance_hours: number
          night_days: number
          nssf_employee: number
          nssf_employer: number
          off_days: number
          off_days_hours: number
          off_days_total: number
          paye: number
          period_id: string
          public_holiday_earned: number
          public_holiday_worked: number
          salary_advances: number
          sdl_amount: number
          snapshot_account_number: string
          snapshot_bank_code: string
          snapshot_basic_salary: number
          snapshot_branch_code: string
          snapshot_full_name: string
          snapshot_position: string
          taxable_pay: number
          updated_at: string
          wcf_amount: number
        }
        Insert: {
          cash_shortage?: number
          casino_id: string
          created_at?: string
          deductions_missing_days?: number
          employee_id?: string | null
          gepf_employee?: number
          gepf_loan?: number
          gross_salary?: number
          hrs_worked_on_holiday?: number
          id?: string
          missing_days?: number
          net_salary?: number
          night_allowance?: number
          night_allowance_hours?: number
          night_days?: number
          nssf_employee?: number
          nssf_employer?: number
          off_days?: number
          off_days_hours?: number
          off_days_total?: number
          paye?: number
          period_id: string
          public_holiday_earned?: number
          public_holiday_worked?: number
          salary_advances?: number
          sdl_amount?: number
          snapshot_account_number?: string
          snapshot_bank_code?: string
          snapshot_basic_salary?: number
          snapshot_branch_code?: string
          snapshot_full_name: string
          snapshot_position?: string
          taxable_pay?: number
          updated_at?: string
          wcf_amount?: number
        }
        Update: {
          cash_shortage?: number
          casino_id?: string
          created_at?: string
          deductions_missing_days?: number
          employee_id?: string | null
          gepf_employee?: number
          gepf_loan?: number
          gross_salary?: number
          hrs_worked_on_holiday?: number
          id?: string
          missing_days?: number
          net_salary?: number
          night_allowance?: number
          night_allowance_hours?: number
          night_days?: number
          nssf_employee?: number
          nssf_employer?: number
          off_days?: number
          off_days_hours?: number
          off_days_total?: number
          paye?: number
          period_id?: string
          public_holiday_earned?: number
          public_holiday_worked?: number
          salary_advances?: number
          sdl_amount?: number
          snapshot_account_number?: string
          snapshot_bank_code?: string
          snapshot_basic_salary?: number
          snapshot_branch_code?: string
          snapshot_full_name?: string
          snapshot_position?: string
          taxable_pay?: number
          updated_at?: string
          wcf_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_paye_brackets: {
        Row: {
          base_tax: number
          casino_id: string
          created_at: string
          effective_from: string
          id: string
          lower_bound: number
          ord: number
          rate_pct: number
          upper_bound: number | null
        }
        Insert: {
          base_tax?: number
          casino_id: string
          created_at?: string
          effective_from?: string
          id?: string
          lower_bound: number
          ord: number
          rate_pct?: number
          upper_bound?: number | null
        }
        Update: {
          base_tax?: number
          casino_id?: string
          created_at?: string
          effective_from?: string
          id?: string
          lower_bound?: number
          ord?: number
          rate_pct?: number
          upper_bound?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_paye_brackets_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          branch_label: string | null
          casino_id: string
          created_at: string
          created_by: string | null
          hr_approved_at: string | null
          hr_approved_by: string | null
          id: string
          locked_at: string | null
          manager_approved_at: string | null
          manager_approved_by: string | null
          month: number
          paid_at: string | null
          paid_by: string | null
          payment_description: string | null
          status: string
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
          year: number
        }
        Insert: {
          branch_label?: string | null
          casino_id: string
          created_at?: string
          created_by?: string | null
          hr_approved_at?: string | null
          hr_approved_by?: string | null
          id?: string
          locked_at?: string | null
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          month: number
          paid_at?: string | null
          paid_by?: string | null
          payment_description?: string | null
          status?: string
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          branch_label?: string | null
          casino_id?: string
          created_at?: string
          created_by?: string | null
          hr_approved_at?: string | null
          hr_approved_by?: string | null
          id?: string
          locked_at?: string | null
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          month?: number
          paid_at?: string | null
          paid_by?: string | null
          payment_description?: string | null
          status?: string
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_settings: {
        Row: {
          casino_id: string
          created_at: string
          default_payment_description: string | null
          effective_from: string
          gepf_pct: number
          hours_per_month: number
          id: string
          night_hours_per_day: number
          night_rate_pct: number
          nssf_employee_pct: number
          nssf_employer_pct: number
          off_day_multiplier: number
          sdl_pct: number
          wcf_pct: number
          working_days: number
        }
        Insert: {
          casino_id: string
          created_at?: string
          default_payment_description?: string | null
          effective_from: string
          gepf_pct?: number
          hours_per_month?: number
          id?: string
          night_hours_per_day?: number
          night_rate_pct?: number
          nssf_employee_pct?: number
          nssf_employer_pct?: number
          off_day_multiplier?: number
          sdl_pct?: number
          wcf_pct?: number
          working_days?: number
        }
        Update: {
          casino_id?: string
          created_at?: string
          default_payment_description?: string | null
          effective_from?: string
          gepf_pct?: number
          hours_per_month?: number
          id?: string
          night_hours_per_day?: number
          night_rate_pct?: number
          nssf_employee_pct?: number
          nssf_employer_pct?: number
          off_day_multiplier?: number
          sdl_pct?: number
          wcf_pct?: number
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_settings_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_bootstrap_tokens: {
        Row: {
          consumed_at: string | null
          consumed_by_casino_id: string | null
          consumed_by_slug: string | null
          created_at: string
          description: string | null
          expires_at: string | null
          token: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_by_casino_id?: string | null
          consumed_by_slug?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          token: string
        }
        Update: {
          consumed_at?: string | null
          consumed_by_casino_id?: string | null
          consumed_by_slug?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          token?: string
        }
        Relationships: []
      }
      peer_links: {
        Row: {
          casino_id: string | null
          created_at: string
          display_name: string
          id: string
          last_pull_cursor: number
          last_pull_error: string | null
          last_push_cursor: number
          last_push_error: string | null
          last_seen_at: string | null
          peer_node_id: string | null
          peer_node_kind: string | null
          peer_url: string
          schema_version: string | null
          status: string
          sync_secret: string
          updated_at: string
        }
        Insert: {
          casino_id?: string | null
          created_at?: string
          display_name: string
          id?: string
          last_pull_cursor?: number
          last_pull_error?: string | null
          last_push_cursor?: number
          last_push_error?: string | null
          last_seen_at?: string | null
          peer_node_id?: string | null
          peer_node_kind?: string | null
          peer_url: string
          schema_version?: string | null
          status?: string
          sync_secret: string
          updated_at?: string
        }
        Update: {
          casino_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
          last_pull_cursor?: number
          last_pull_error?: string | null
          last_push_cursor?: number
          last_push_error?: string | null
          last_seen_at?: string | null
          peer_node_id?: string | null
          peer_node_kind?: string | null
          peer_url?: string
          schema_version?: string | null
          status?: string
          sync_secret?: string
          updated_at?: string
        }
        Relationships: []
      }
      pending_server_registrations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_casino_id: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string
          hostname: string | null
          id: string
          pairing_code: string
          rejected_reason: string | null
          seed_token: string | null
          seed_token_expires_at: string | null
          server_ip: string | null
          server_name: string
          server_slug: string | null
          status: string
          sync_secret: string | null
          system_info: Json | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_casino_id?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          hostname?: string | null
          id?: string
          pairing_code: string
          rejected_reason?: string | null
          seed_token?: string | null
          seed_token_expires_at?: string | null
          server_ip?: string | null
          server_name: string
          server_slug?: string | null
          status?: string
          sync_secret?: string | null
          system_info?: Json | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_casino_id?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          hostname?: string | null
          id?: string
          pairing_code?: string
          rejected_reason?: string | null
          seed_token?: string | null
          seed_token_expires_at?: string | null
          server_ip?: string | null
          server_name?: string
          server_slug?: string | null
          status?: string
          sync_secret?: string | null
          system_info?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_server_registrations_approved_casino_id_fkey"
            columns: ["approved_casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      pit_book_entries: {
        Row: {
          author_id: string
          author_name: string
          author_role: string
          body: string
          business_date: string
          casino_id: string
          channel: string
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          author_name: string
          author_role: string
          body: string
          business_date: string
          casino_id: string
          channel: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          author_name?: string
          author_role?: string
          body?: string
          business_date?: string
          casino_id?: string
          channel?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pit_book_entries_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      pit_book_reads: {
        Row: {
          casino_id: string
          channel: string
          created_at: string
          id: string
          last_read_at: string
          last_read_entry_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          casino_id: string
          channel: string
          created_at?: string
          id?: string
          last_read_at?: string
          last_read_entry_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          casino_id?: string
          channel?: string
          created_at?: string
          id?: string
          last_read_at?: string
          last_read_entry_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pit_rota: {
        Row: {
          casino_id: string
          created_at: string
          created_by: string
          date: string
          employee_id: string
          id: string
          shift: Database["public"]["Enums"]["shift_type"]
        }
        Insert: {
          casino_id: string
          created_at?: string
          created_by: string
          date: string
          employee_id: string
          id?: string
          shift: Database["public"]["Enums"]["shift_type"]
        }
        Update: {
          casino_id?: string
          created_at?: string
          created_by?: string
          date?: string
          employee_id?: string
          id?: string
          shift?: Database["public"]["Enums"]["shift_type"]
        }
        Relationships: [
          {
            foreignKeyName: "pit_rota_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pit_rota_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      player_cards: {
        Row: {
          card_number: string
          card_type: Database["public"]["Enums"]["card_type"]
          id: string
          is_active: boolean
          issued_at: string
          issued_by: string | null
          player_id: string
          rfid_uid: string | null
        }
        Insert: {
          card_number: string
          card_type?: Database["public"]["Enums"]["card_type"]
          id?: string
          is_active?: boolean
          issued_at?: string
          issued_by?: string | null
          player_id: string
          rfid_uid?: string | null
        }
        Update: {
          card_number?: string
          card_type?: Database["public"]["Enums"]["card_type"]
          id?: string
          is_active?: boolean
          issued_at?: string
          issued_by?: string | null
          player_id?: string
          rfid_uid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_chip_adjustments: {
        Row: {
          business_date: string
          casino_id: string
          chip_in: number
          chip_out: number
          created_at: string
          id: string
          note: string
          operator_id: string
          player_id: string
        }
        Insert: {
          business_date?: string
          casino_id: string
          chip_in?: number
          chip_out?: number
          created_at?: string
          id?: string
          note?: string
          operator_id: string
          player_id: string
        }
        Update: {
          business_date?: string
          casino_id?: string
          chip_in?: number
          chip_out?: number
          created_at?: string
          id?: string
          note?: string
          operator_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_chip_adjustments_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_chip_adjustments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_chip_adjustments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_crm: {
        Row: {
          birthday_card_sent_year: number | null
          casino_id: string
          custom_tags: string[]
          host_user_id: string | null
          last_contact_at: string | null
          last_contact_note: string
          player_id: string
          segment: Database["public"]["Enums"]["player_crm_segment"]
          segment_locked: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          birthday_card_sent_year?: number | null
          casino_id: string
          custom_tags?: string[]
          host_user_id?: string | null
          last_contact_at?: string | null
          last_contact_note?: string
          player_id: string
          segment?: Database["public"]["Enums"]["player_crm_segment"]
          segment_locked?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          birthday_card_sent_year?: number | null
          casino_id?: string
          custom_tags?: string[]
          host_user_id?: string | null
          last_contact_at?: string | null
          last_contact_note?: string
          player_id?: string
          segment?: Database["public"]["Enums"]["player_crm_segment"]
          segment_locked?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_crm_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_crm_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_crm_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_daily_avg_bet_changes: {
        Row: {
          business_date: string
          casino_id: string
          changed_at: string
          changed_by: string | null
          game_group: string
          id: string
          player_id: string
          value: number
        }
        Insert: {
          business_date: string
          casino_id: string
          changed_at?: string
          changed_by?: string | null
          game_group: string
          id?: string
          player_id: string
          value: number
        }
        Update: {
          business_date?: string
          casino_id?: string
          changed_at?: string
          changed_by?: string | null
          game_group?: string
          id?: string
          player_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_daily_avg_bet_changes_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_daily_avg_bet_changes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_daily_avg_bet_changes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_daily_avg_bets: {
        Row: {
          avg_bet_ar: number | null
          avg_bet_bj: number | null
          avg_bet_club: number | null
          avg_bet_poker: number | null
          business_date: string
          casino_id: string
          created_at: string
          id: string
          player_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          avg_bet_ar?: number | null
          avg_bet_bj?: number | null
          avg_bet_club?: number | null
          avg_bet_poker?: number | null
          business_date: string
          casino_id: string
          created_at?: string
          id?: string
          player_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          avg_bet_ar?: number | null
          avg_bet_bj?: number | null
          avg_bet_club?: number | null
          avg_bet_poker?: number | null
          business_date?: string
          casino_id?: string
          created_at?: string
          id?: string
          player_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_daily_avg_bets_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_daily_avg_bets_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_daily_avg_bets_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_daily_zones: {
        Row: {
          business_date: string
          casino_id: string
          created_at: string
          created_by: string | null
          id: string
          player_id: string
          updated_at: string
          updated_by: string | null
          zone: string
        }
        Insert: {
          business_date: string
          casino_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          player_id: string
          updated_at?: string
          updated_by?: string | null
          zone: string
        }
        Update: {
          business_date?: string
          casino_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          player_id?: string
          updated_at?: string
          updated_by?: string | null
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_daily_zones_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_daily_zones_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_day_drop_cache: {
        Row: {
          business_date: string
          casino_id: string
          peak: number
          player_id: string
          recycled: number
          total_in: number
          total_out: number
          tx_count: number
          updated_at: string
        }
        Insert: {
          business_date: string
          casino_id: string
          peak?: number
          player_id: string
          recycled?: number
          total_in?: number
          total_out?: number
          tx_count?: number
          updated_at?: string
        }
        Update: {
          business_date?: string
          casino_id?: string
          peak?: number
          player_id?: string
          recycled?: number
          total_in?: number
          total_out?: number
          tx_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      player_groups: {
        Row: {
          casino_id: string
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_groups_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      player_merges: {
        Row: {
          affected_counts: Json
          casino_id: string | null
          created_at: string
          field_choices: Json
          id: string
          loser_ids: string[]
          loser_snapshots: Json
          migrations: Json
          performed_at: string
          performed_by: string | null
          reason: string
          survivor_id: string
          survivor_snapshot: Json
          undone_at: string | null
          undone_by: string | null
          updated_at: string
        }
        Insert: {
          affected_counts?: Json
          casino_id?: string | null
          created_at?: string
          field_choices?: Json
          id?: string
          loser_ids: string[]
          loser_snapshots: Json
          migrations?: Json
          performed_at?: string
          performed_by?: string | null
          reason: string
          survivor_id: string
          survivor_snapshot: Json
          undone_at?: string | null
          undone_by?: string | null
          updated_at?: string
        }
        Update: {
          affected_counts?: Json
          casino_id?: string | null
          created_at?: string
          field_choices?: Json
          id?: string
          loser_ids?: string[]
          loser_snapshots?: Json
          migrations?: Json
          performed_at?: string
          performed_by?: string | null
          reason?: string
          survivor_id?: string
          survivor_snapshot?: Json
          undone_at?: string | null
          undone_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_merges_survivor_id_fkey"
            columns: ["survivor_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_merges_survivor_id_fkey"
            columns: ["survivor_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_notes: {
        Row: {
          casino_id: string
          content: string
          created_at: string
          created_by: string
          id: string
          note_type: string
          player_id: string
        }
        Insert: {
          casino_id: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          note_type?: string
          player_id: string
        }
        Update: {
          casino_id?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          note_type?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_notes_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_position_history: {
        Row: {
          casino_id: string
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          player_id: string
          position: string
          started_at: string
          table_id: string | null
          visit_id: string | null
        }
        Insert: {
          casino_id: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          player_id: string
          position: string
          started_at?: string
          table_id?: string | null
          visit_id?: string | null
        }
        Update: {
          casino_id?: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          player_id?: string
          position?: string
          started_at?: string
          table_id?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_position_history_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_position_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_position_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_position_history_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_position_history_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "casino_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      player_tags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          player_id: string
          source: string
          tag: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          player_id: string
          source?: string
          tag: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          player_id?: string
          source?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_tags_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_tags_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          am_reviewed_at: string | null
          am_reviewed_by: string | null
          birth_date: string | null
          casino_id: string
          category: Database["public"]["Enums"]["player_category"]
          created_at: string
          first_name: string
          full_name: string | null
          id: string
          id_document_url: string | null
          id_number: string
          last_name: string
          locked_at: string | null
          merged_at: string | null
          merged_by: string | null
          merged_into_id: string | null
          nickname: string
          phone: string
          photo_url: string | null
          player_type: Database["public"]["Enums"]["player_type"]
          status: Database["public"]["Enums"]["player_status"]
          updated_at: string
          verification_status: Database["public"]["Enums"]["player_verification_status"]
          verified_at: string | null
          verified_by: string | null
          verified_source: string | null
        }
        Insert: {
          am_reviewed_at?: string | null
          am_reviewed_by?: string | null
          birth_date?: string | null
          casino_id: string
          category?: Database["public"]["Enums"]["player_category"]
          created_at?: string
          first_name: string
          full_name?: string | null
          id?: string
          id_document_url?: string | null
          id_number?: string
          last_name: string
          locked_at?: string | null
          merged_at?: string | null
          merged_by?: string | null
          merged_into_id?: string | null
          nickname?: string
          phone?: string
          photo_url?: string | null
          player_type?: Database["public"]["Enums"]["player_type"]
          status?: Database["public"]["Enums"]["player_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["player_verification_status"]
          verified_at?: string | null
          verified_by?: string | null
          verified_source?: string | null
        }
        Update: {
          am_reviewed_at?: string | null
          am_reviewed_by?: string | null
          birth_date?: string | null
          casino_id?: string
          category?: Database["public"]["Enums"]["player_category"]
          created_at?: string
          first_name?: string
          full_name?: string | null
          id?: string
          id_document_url?: string | null
          id_number?: string
          last_name?: string
          locked_at?: string | null
          merged_at?: string | null
          merged_by?: string | null
          merged_into_id?: string | null
          nickname?: string
          phone?: string
          photo_url?: string | null
          player_type?: Database["public"]["Enums"]["player_type"]
          status?: Database["public"]["Enums"]["player_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["player_verification_status"]
          verified_at?: string | null
          verified_by?: string | null
          verified_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "players_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_comp_budget_overrides: {
        Row: {
          amount_tzs: number
          casino_id: string
          created_at: string
          id: string
          manager_user_id: string
          month_start: string
          reason: string
          tab_id: string
        }
        Insert: {
          amount_tzs: number
          casino_id: string
          created_at?: string
          id?: string
          manager_user_id: string
          month_start: string
          reason: string
          tab_id: string
        }
        Update: {
          amount_tzs?: number
          casino_id?: string
          created_at?: string
          id?: string
          manager_user_id?: string
          month_start?: string
          reason?: string
          tab_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_comp_budget_overrides_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_comp_budget_overrides_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "pos_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_comp_budgets: {
        Row: {
          casino_id: string
          created_at: string
          created_by: string | null
          id: string
          limit_tzs: number
          month_start: string
          note: string
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          limit_tzs: number
          month_start: string
          note?: string
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          limit_tzs?: number
          month_start?: string
          note?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_comp_budgets_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_inventory_movements: {
        Row: {
          business_date: string | null
          casino_id: string | null
          cost_snapshot_missing: boolean
          cost_tzs_snapshot: number | null
          created_at: string
          delta: number
          id: string
          item_id: string
          metadata: Json | null
          reason: string
          reference_id: string | null
          reference_type: string | null
          source_item_id: string | null
          unit_cost_tzs_snapshot: number | null
          user_id: string | null
        }
        Insert: {
          business_date?: string | null
          casino_id?: string | null
          cost_snapshot_missing?: boolean
          cost_tzs_snapshot?: number | null
          created_at?: string
          delta: number
          id?: string
          item_id: string
          metadata?: Json | null
          reason: string
          reference_id?: string | null
          reference_type?: string | null
          source_item_id?: string | null
          unit_cost_tzs_snapshot?: number | null
          user_id?: string | null
        }
        Update: {
          business_date?: string | null
          casino_id?: string | null
          cost_snapshot_missing?: boolean
          cost_tzs_snapshot?: number | null
          created_at?: string
          delta?: number
          id?: string
          item_id?: string
          metadata?: Json | null
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
          source_item_id?: string | null
          unit_cost_tzs_snapshot?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_pos_item_availability"
            referencedColumns: ["sellable_item_id"]
          },
          {
            foreignKeyName: "pos_inventory_movements_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_inventory_movements_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "v_pos_item_availability"
            referencedColumns: ["sellable_item_id"]
          },
        ]
      }
      pos_locations: {
        Row: {
          casino_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_locations_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_menu_categories: {
        Row: {
          casino_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_menu_items: {
        Row: {
          avg_cost_tzs: number
          bottle_size_ml: number | null
          casino_id: string
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          last_purchase_at: string | null
          last_purchase_cost_tzs: number | null
          low_threshold: number | null
          name: string
          price_round_step_tzs: number
          price_tzs: number
          serving_size_ml: number | null
          stock_qty: number | null
          updated_at: string
        }
        Insert: {
          avg_cost_tzs?: number
          bottle_size_ml?: number | null
          casino_id: string
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_purchase_at?: string | null
          last_purchase_cost_tzs?: number | null
          low_threshold?: number | null
          name: string
          price_round_step_tzs?: number
          price_tzs: number
          serving_size_ml?: number | null
          stock_qty?: number | null
          updated_at?: string
        }
        Update: {
          avg_cost_tzs?: number
          bottle_size_ml?: number | null
          casino_id?: string
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_purchase_at?: string | null
          last_purchase_cost_tzs?: number | null
          low_threshold?: number | null
          name?: string
          price_round_step_tzs?: number
          price_tzs?: number
          serving_size_ml?: number | null
          stock_qty?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_menu_price_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          item_id: string
          new_price_tzs: number
          old_price_tzs: number | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          item_id: string
          new_price_tzs: number
          old_price_tzs?: number | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          item_id?: string
          new_price_tzs?: number
          old_price_tzs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_menu_price_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_menu_price_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_pos_item_availability"
            referencedColumns: ["sellable_item_id"]
          },
        ]
      }
      pos_modifier_menu_items: {
        Row: {
          casino_id: string
          created_at: string
          menu_item_id: string
          modifier_id: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          menu_item_id: string
          modifier_id: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          menu_item_id?: string
          modifier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_modifier_menu_items_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_modifier_menu_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_modifier_menu_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_pos_item_availability"
            referencedColumns: ["sellable_item_id"]
          },
          {
            foreignKeyName: "pos_modifier_menu_items_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: false
            referencedRelation: "pos_modifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_modifier_recipe_effects: {
        Row: {
          casino_id: string
          created_at: string
          effect_type: string
          id: string
          ingredient_item_id: string
          modifier_id: string
          multiplier: number | null
          quantity: number | null
          sellable_item_id: string | null
          sort_order: number
          unit: string | null
          updated_at: string
          waste_percent: number
        }
        Insert: {
          casino_id: string
          created_at?: string
          effect_type: string
          id?: string
          ingredient_item_id: string
          modifier_id: string
          multiplier?: number | null
          quantity?: number | null
          sellable_item_id?: string | null
          sort_order?: number
          unit?: string | null
          updated_at?: string
          waste_percent?: number
        }
        Update: {
          casino_id?: string
          created_at?: string
          effect_type?: string
          id?: string
          ingredient_item_id?: string
          modifier_id?: string
          multiplier?: number | null
          quantity?: number | null
          sellable_item_id?: string | null
          sort_order?: number
          unit?: string | null
          updated_at?: string
          waste_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_modifier_recipe_effects_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_modifier_recipe_effects_ingredient_item_id_fkey"
            columns: ["ingredient_item_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_modifier_recipe_effects_ingredient_item_id_fkey"
            columns: ["ingredient_item_id"]
            isOneToOne: false
            referencedRelation: "v_pos_item_availability"
            referencedColumns: ["sellable_item_id"]
          },
          {
            foreignKeyName: "pos_modifier_recipe_effects_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: false
            referencedRelation: "pos_modifiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_modifier_recipe_effects_sellable_item_id_fkey"
            columns: ["sellable_item_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_modifier_recipe_effects_sellable_item_id_fkey"
            columns: ["sellable_item_id"]
            isOneToOne: false
            referencedRelation: "v_pos_item_availability"
            referencedColumns: ["sellable_item_id"]
          },
        ]
      }
      pos_modifiers: {
        Row: {
          casino_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_tzs_delta: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_tzs_delta?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_tzs_delta?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_modifiers_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_order_item_modifiers: {
        Row: {
          created_at: string
          id: string
          modifier_id: string | null
          modifier_name_snapshot: string
          order_item_id: string
          price_tzs_delta_snapshot: number
          recipe_effects_snapshot: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          modifier_id?: string | null
          modifier_name_snapshot: string
          order_item_id: string
          price_tzs_delta_snapshot?: number
          recipe_effects_snapshot?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          modifier_id?: string | null
          modifier_name_snapshot?: string
          order_item_id?: string
          price_tzs_delta_snapshot?: number
          recipe_effects_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_order_item_modifiers_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: false
            referencedRelation: "pos_modifiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_order_item_modifiers_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "pos_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_order_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_name: string
          line_total_tzs: number
          order_id: string
          qty: number
          unit_price_tzs: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_name: string
          line_total_tzs: number
          order_id: string
          qty: number
          unit_price_tzs: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_name?: string
          line_total_tzs?: number
          order_id?: string
          qty?: number
          unit_price_tzs?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_pos_item_availability"
            referencedColumns: ["sellable_item_id"]
          },
          {
            foreignKeyName: "pos_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pos_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_orders: {
        Row: {
          auto_closed_at: string | null
          business_date: string | null
          casino_id: string
          closed_by_system: boolean
          created_at: string
          force_close_reason: string | null
          force_closed_at: string | null
          force_closed_by: string | null
          id: string
          is_problem: boolean
          notes: string | null
          pos_location_id: string | null
          problem_marked_at: string | null
          problem_marked_by: string | null
          problem_reason: string | null
          ready_at: string | null
          served_at: string | null
          shift_id: string | null
          source: string
          status: Database["public"]["Enums"]["pos_order_status"]
          stock_deducted_at: string | null
          stock_mode: string | null
          tab_id: string
          total_tzs: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          voided_reason: string | null
          waiter_user_id: string
        }
        Insert: {
          auto_closed_at?: string | null
          business_date?: string | null
          casino_id: string
          closed_by_system?: boolean
          created_at?: string
          force_close_reason?: string | null
          force_closed_at?: string | null
          force_closed_by?: string | null
          id?: string
          is_problem?: boolean
          notes?: string | null
          pos_location_id?: string | null
          problem_marked_at?: string | null
          problem_marked_by?: string | null
          problem_reason?: string | null
          ready_at?: string | null
          served_at?: string | null
          shift_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["pos_order_status"]
          stock_deducted_at?: string | null
          stock_mode?: string | null
          tab_id: string
          total_tzs?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
          waiter_user_id: string
        }
        Update: {
          auto_closed_at?: string | null
          business_date?: string | null
          casino_id?: string
          closed_by_system?: boolean
          created_at?: string
          force_close_reason?: string | null
          force_closed_at?: string | null
          force_closed_by?: string | null
          id?: string
          is_problem?: boolean
          notes?: string | null
          pos_location_id?: string | null
          problem_marked_at?: string | null
          problem_marked_by?: string | null
          problem_reason?: string | null
          ready_at?: string | null
          served_at?: string | null
          shift_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["pos_order_status"]
          stock_deducted_at?: string | null
          stock_mode?: string | null
          tab_id?: string
          total_tzs?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
          waiter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_orders_pos_location_id_fkey"
            columns: ["pos_location_id"]
            isOneToOne: false
            referencedRelation: "pos_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_orders_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_orders_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "pos_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_player_charges: {
        Row: {
          amount_tzs: number
          business_date: string
          casino_id: string
          created_at: string
          id: string
          player_id: string
          settled_at: string | null
          settled_by: string | null
          settlement_ref: string | null
          status: string
          tab_id: string
          updated_at: string
          void_reason: string | null
        }
        Insert: {
          amount_tzs: number
          business_date: string
          casino_id: string
          created_at?: string
          id?: string
          player_id: string
          settled_at?: string | null
          settled_by?: string | null
          settlement_ref?: string | null
          status?: string
          tab_id: string
          updated_at?: string
          void_reason?: string | null
        }
        Update: {
          amount_tzs?: number
          business_date?: string
          casino_id?: string
          created_at?: string
          id?: string
          player_id?: string
          settled_at?: string | null
          settled_by?: string | null
          settlement_ref?: string | null
          status?: string
          tab_id?: string
          updated_at?: string
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_player_charges_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_player_charges_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "pos_player_charges_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_player_charges_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: true
            referencedRelation: "pos_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_purchase_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          line_total_tzs: number
          purchase_id: string
          qty: number
          unit_cost_tzs: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          line_total_tzs: number
          purchase_id: string
          qty: number
          unit_cost_tzs: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          line_total_tzs?: number
          purchase_id?: string
          qty?: number
          unit_cost_tzs?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_purchase_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_purchase_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_pos_item_availability"
            referencedColumns: ["sellable_item_id"]
          },
          {
            foreignKeyName: "pos_purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "pos_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_purchases: {
        Row: {
          bartender_user_id: string
          business_date: string | null
          casino_id: string
          created_at: string
          expense_id: string | null
          id: string
          notes: string
          purchase_type: string
          supplier: string | null
          total_tzs: number
        }
        Insert: {
          bartender_user_id: string
          business_date?: string | null
          casino_id: string
          created_at?: string
          expense_id?: string | null
          id?: string
          notes?: string
          purchase_type: string
          supplier?: string | null
          total_tzs?: number
        }
        Update: {
          bartender_user_id?: string
          business_date?: string | null
          casino_id?: string
          created_at?: string
          expense_id?: string | null
          id?: string
          notes?: string
          purchase_type?: string
          supplier?: string | null
          total_tzs?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_purchases_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_purchases_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_recipe_items: {
        Row: {
          created_at: string
          id: string
          ingredient_item_id: string
          quantity: number
          recipe_id: string
          unit: string | null
          updated_at: string
          waste_percent: number
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_item_id: string
          quantity: number
          recipe_id: string
          unit?: string | null
          updated_at?: string
          waste_percent?: number
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_item_id?: string
          quantity?: number
          recipe_id?: string
          unit?: string | null
          updated_at?: string
          waste_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_recipe_items_ingredient_item_id_fkey"
            columns: ["ingredient_item_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_recipe_items_ingredient_item_id_fkey"
            columns: ["ingredient_item_id"]
            isOneToOne: false
            referencedRelation: "v_pos_item_availability"
            referencedColumns: ["sellable_item_id"]
          },
          {
            foreignKeyName: "pos_recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "pos_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_recipes: {
        Row: {
          casino_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sellable_item_id: string
          updated_at: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sellable_item_id: string
          updated_at?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sellable_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_recipes_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_recipes_sellable_item_id_fkey"
            columns: ["sellable_item_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_recipes_sellable_item_id_fkey"
            columns: ["sellable_item_id"]
            isOneToOne: false
            referencedRelation: "v_pos_item_availability"
            referencedColumns: ["sellable_item_id"]
          },
        ]
      }
      pos_shifts: {
        Row: {
          business_date: string | null
          casino_id: string
          closed_at: string | null
          closing_cash: number | null
          created_at: string
          handover_from_shift_id: string | null
          id: string
          opened_at: string
          opening_cash: number
          pos_location_id: string | null
          shift_type: string
          waiter_user_id: string
          z_report: Json | null
        }
        Insert: {
          business_date?: string | null
          casino_id: string
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          handover_from_shift_id?: string | null
          id?: string
          opened_at?: string
          opening_cash?: number
          pos_location_id?: string | null
          shift_type?: string
          waiter_user_id: string
          z_report?: Json | null
        }
        Update: {
          business_date?: string | null
          casino_id?: string
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          handover_from_shift_id?: string | null
          id?: string
          opened_at?: string
          opening_cash?: number
          pos_location_id?: string | null
          shift_type?: string
          waiter_user_id?: string
          z_report?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_shifts_handover_from_shift_id_fkey"
            columns: ["handover_from_shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_pos_location_id_fkey"
            columns: ["pos_location_id"]
            isOneToOne: false
            referencedRelation: "pos_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_stock_count_items: {
        Row: {
          count_id: string
          counted_qty: number
          created_at: string
          expected_qty: number
          id: string
          item_id: string
          unit_cost_tzs: number
          variance_qty: number | null
          variance_value_tzs: number
        }
        Insert: {
          count_id: string
          counted_qty: number
          created_at?: string
          expected_qty: number
          id?: string
          item_id: string
          unit_cost_tzs?: number
          variance_qty?: number | null
          variance_value_tzs?: number
        }
        Update: {
          count_id?: string
          counted_qty?: number
          created_at?: string
          expected_qty?: number
          id?: string
          item_id?: string
          unit_cost_tzs?: number
          variance_qty?: number | null
          variance_value_tzs?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_stock_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_count_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_count_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_pos_item_availability"
            referencedColumns: ["sellable_item_id"]
          },
        ]
      }
      pos_stock_counts: {
        Row: {
          casino_id: string
          count_type: string
          counted_by: string
          counted_by_name: string | null
          created_at: string
          id: string
          items_count: number
          notes: string | null
          shift_id: string | null
          total_variance_value_tzs: number
        }
        Insert: {
          casino_id: string
          count_type: string
          counted_by: string
          counted_by_name?: string | null
          created_at?: string
          id?: string
          items_count?: number
          notes?: string | null
          shift_id?: string | null
          total_variance_value_tzs?: number
        }
        Update: {
          casino_id?: string
          count_type?: string
          counted_by?: string
          counted_by_name?: string | null
          created_at?: string
          id?: string
          items_count?: number
          notes?: string | null
          shift_id?: string | null
          total_variance_value_tzs?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_stock_counts_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_tabs: {
        Row: {
          business_date: string | null
          casino_id: string
          closed_at: string | null
          closed_by_user_id: string | null
          comp_override_id: string | null
          created_at: string
          expense_id: string | null
          id: string
          opened_at: string
          opened_by_user_id: string
          payment_split: Json | null
          player_id: string | null
          player_name: string | null
          pos_location_id: string | null
          shift_id: string
          status: string
          total_tzs: number
          updated_at: string
          void_reason: string | null
          walkin_label: string | null
        }
        Insert: {
          business_date?: string | null
          casino_id: string
          closed_at?: string | null
          closed_by_user_id?: string | null
          comp_override_id?: string | null
          created_at?: string
          expense_id?: string | null
          id?: string
          opened_at?: string
          opened_by_user_id: string
          payment_split?: Json | null
          player_id?: string | null
          player_name?: string | null
          pos_location_id?: string | null
          shift_id: string
          status?: string
          total_tzs?: number
          updated_at?: string
          void_reason?: string | null
          walkin_label?: string | null
        }
        Update: {
          business_date?: string | null
          casino_id?: string
          closed_at?: string | null
          closed_by_user_id?: string | null
          comp_override_id?: string | null
          created_at?: string
          expense_id?: string | null
          id?: string
          opened_at?: string
          opened_by_user_id?: string
          payment_split?: Json | null
          player_id?: string | null
          player_name?: string | null
          pos_location_id?: string | null
          shift_id?: string
          status?: string
          total_tzs?: number
          updated_at?: string
          void_reason?: string | null
          walkin_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_tabs_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_tabs_comp_override_id_fkey"
            columns: ["comp_override_id"]
            isOneToOne: false
            referencedRelation: "pos_comp_budget_overrides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_tabs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "pos_tabs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_tabs_pos_location_id_fkey"
            columns: ["pos_location_id"]
            isOneToOne: false
            referencedRelation: "pos_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_tabs_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      premier_promo_campaigns: {
        Row: {
          active: boolean
          active_from: string | null
          active_until: string | null
          amount: number
          casino_id: string | null
          created_at: string
          created_by: string | null
          funding_source: Database["public"]["Enums"]["promo_funding_source"]
          grant_fixed_business_date: string | null
          grant_lifetime_days: number | null
          grant_lifetime_mode: Database["public"]["Enums"]["promo_grant_lifetime_mode"]
          id: string
          name: string
          scope: Database["public"]["Enums"]["promo_campaign_scope"]
          total_cap: number | null
          updated_at: string
          used_amount: number
        }
        Insert: {
          active?: boolean
          active_from?: string | null
          active_until?: string | null
          amount: number
          casino_id?: string | null
          created_at?: string
          created_by?: string | null
          funding_source: Database["public"]["Enums"]["promo_funding_source"]
          grant_fixed_business_date?: string | null
          grant_lifetime_days?: number | null
          grant_lifetime_mode?: Database["public"]["Enums"]["promo_grant_lifetime_mode"]
          id?: string
          name: string
          scope: Database["public"]["Enums"]["promo_campaign_scope"]
          total_cap?: number | null
          updated_at?: string
          used_amount?: number
        }
        Update: {
          active?: boolean
          active_from?: string | null
          active_until?: string | null
          amount?: number
          casino_id?: string | null
          created_at?: string
          created_by?: string | null
          funding_source?: Database["public"]["Enums"]["promo_funding_source"]
          grant_fixed_business_date?: string | null
          grant_lifetime_days?: number | null
          grant_lifetime_mode?: Database["public"]["Enums"]["promo_grant_lifetime_mode"]
          id?: string
          name?: string
          scope?: Database["public"]["Enums"]["promo_campaign_scope"]
          total_cap?: number | null
          updated_at?: string
          used_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "premier_promo_campaigns_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          casino_id: string
          created_at: string
          disabled_at: string | null
          disabled_by: string | null
          display_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          display_name: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          display_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_campaign_expenses: {
        Row: {
          amount_tzs: number
          campaign_id: string
          casino_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          spent_on: string
          vendor: string | null
        }
        Insert: {
          amount_tzs: number
          campaign_id: string
          casino_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          spent_on?: string
          vendor?: string | null
        }
        Update: {
          amount_tzs?: number
          campaign_id?: string
          casino_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          spent_on?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_campaign_expenses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "promo_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_campaign_players: {
        Row: {
          attributed_on: string
          campaign_id: string
          casino_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          player_id: string
        }
        Insert: {
          attributed_on?: string
          campaign_id: string
          casino_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          player_id: string
        }
        Update: {
          attributed_on?: string
          campaign_id?: string
          casino_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_campaign_players_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "promo_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_campaigns: {
        Row: {
          budget_tzs: number
          campaign_type: Database["public"]["Enums"]["promo_campaign_type"]
          casino_id: string
          created_at: string
          created_by: string | null
          description: string | null
          ends_on: string | null
          id: string
          name: string
          starts_on: string
          status: Database["public"]["Enums"]["promo_campaign_status"]
          updated_at: string
        }
        Insert: {
          budget_tzs?: number
          campaign_type?: Database["public"]["Enums"]["promo_campaign_type"]
          casino_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_on?: string | null
          id?: string
          name: string
          starts_on: string
          status?: Database["public"]["Enums"]["promo_campaign_status"]
          updated_at?: string
        }
        Update: {
          budget_tzs?: number
          campaign_type?: Database["public"]["Enums"]["promo_campaign_type"]
          casino_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_on?: string | null
          id?: string
          name?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["promo_campaign_status"]
          updated_at?: string
        }
        Relationships: []
      }
      promo_code_redemptions: {
        Row: {
          business_date: string
          code_id: string
          created_at: string
          grant_id: string | null
          id: string
          player_id: string
        }
        Insert: {
          business_date: string
          code_id: string
          created_at?: string
          grant_id?: string | null
          id?: string
          player_id: string
        }
        Update: {
          business_date?: string
          code_id?: string
          created_at?: string
          grant_id?: string | null
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_redemptions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_redemptions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "promo_code_redemptions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          amount: number
          assigned_player_id: string | null
          batch_id: string | null
          batch_label: string | null
          campaign_id: string | null
          code: string
          code_active_from: string | null
          code_active_until: string | null
          code_kind: string
          created_at: string
          created_by: string | null
          current_uses: number
          grant_fixed_business_date: string | null
          grant_lifetime_days: number | null
          grant_lifetime_mode: Database["public"]["Enums"]["promo_grant_lifetime_mode"]
          id: string
          max_uses_total: number | null
          per_player_limit: number
          redeemed_at: string | null
          redeemed_by_player_id: string | null
        }
        Insert: {
          amount: number
          assigned_player_id?: string | null
          batch_id?: string | null
          batch_label?: string | null
          campaign_id?: string | null
          code: string
          code_active_from?: string | null
          code_active_until?: string | null
          code_kind?: string
          created_at?: string
          created_by?: string | null
          current_uses?: number
          grant_fixed_business_date?: string | null
          grant_lifetime_days?: number | null
          grant_lifetime_mode?: Database["public"]["Enums"]["promo_grant_lifetime_mode"]
          id?: string
          max_uses_total?: number | null
          per_player_limit?: number
          redeemed_at?: string | null
          redeemed_by_player_id?: string | null
        }
        Update: {
          amount?: number
          assigned_player_id?: string | null
          batch_id?: string | null
          batch_label?: string | null
          campaign_id?: string | null
          code?: string
          code_active_from?: string | null
          code_active_until?: string | null
          code_kind?: string
          created_at?: string
          created_by?: string | null
          current_uses?: number
          grant_fixed_business_date?: string | null
          grant_lifetime_days?: number | null
          grant_lifetime_mode?: Database["public"]["Enums"]["promo_grant_lifetime_mode"]
          id?: string
          max_uses_total?: number | null
          per_player_limit?: number
          redeemed_at?: string | null
          redeemed_by_player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_assigned_player_id_fkey"
            columns: ["assigned_player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "promo_codes_assigned_player_id_fkey"
            columns: ["assigned_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "premier_promo_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_redeemed_by_player_id_fkey"
            columns: ["redeemed_by_player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "promo_codes_redeemed_by_player_id_fkey"
            columns: ["redeemed_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_grants: {
        Row: {
          amount: number
          casino_id: string
          created_at: string
          created_by: string | null
          expires_business_date: string | null
          funding_pool: Database["public"]["Enums"]["promo_funding_source"]
          funding_pool_ref: string | null
          id: string
          issued_business_date: string
          player_id: string
          remaining: number
          source: Database["public"]["Enums"]["promo_grant_source"]
          source_ref: string | null
          status: Database["public"]["Enums"]["promo_grant_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          casino_id: string
          created_at?: string
          created_by?: string | null
          expires_business_date?: string | null
          funding_pool: Database["public"]["Enums"]["promo_funding_source"]
          funding_pool_ref?: string | null
          id?: string
          issued_business_date: string
          player_id: string
          remaining: number
          source: Database["public"]["Enums"]["promo_grant_source"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["promo_grant_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          casino_id?: string
          created_at?: string
          created_by?: string | null
          expires_business_date?: string | null
          funding_pool?: Database["public"]["Enums"]["promo_funding_source"]
          funding_pool_ref?: string | null
          id?: string
          issued_business_date?: string
          player_id?: string
          remaining?: number
          source?: Database["public"]["Enums"]["promo_grant_source"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["promo_grant_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_grants_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_grants_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "promo_grants_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_redemptions: {
        Row: {
          amount: number
          cage_id: string | null
          cashier_id: string | null
          casino_id: string
          created_at: string
          grant_breakdown: Json
          id: string
          payout_type: string
          player_id: string
          shift_id: string | null
        }
        Insert: {
          amount: number
          cage_id?: string | null
          cashier_id?: string | null
          casino_id: string
          created_at?: string
          grant_breakdown: Json
          id?: string
          payout_type: string
          player_id: string
          shift_id?: string | null
        }
        Update: {
          amount?: number
          cage_id?: string | null
          cashier_id?: string | null
          casino_id?: string
          created_at?: string
          grant_breakdown?: Json
          id?: string
          payout_type?: string
          player_id?: string
          shift_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "promo_redemptions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_wallet_ledger: {
        Row: {
          business_date: string
          created_at: string
          created_by: string | null
          delta: number
          grant_id: string
          id: string
          player_id: string
          reason: string
          ref_id: string | null
          ref_type: string | null
        }
        Insert: {
          business_date: string
          created_at?: string
          created_by?: string | null
          delta: number
          grant_id: string
          id?: string
          player_id: string
          reason: string
          ref_id?: string | null
          ref_type?: string | null
        }
        Update: {
          business_date?: string
          created_at?: string
          created_by?: string | null
          delta?: number
          grant_id?: string
          id?: string
          player_id?: string
          reason?: string
          ref_id?: string | null
          ref_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_wallet_ledger_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "promo_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_wallet_ledger_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "promo_wallet_ledger_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      role_module_defaults: {
        Row: {
          can_view: boolean
          can_write: boolean
          day_horizon: Database["public"]["Enums"]["day_horizon"]
          module_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          can_view?: boolean
          can_write?: boolean
          day_horizon?: Database["public"]["Enums"]["day_horizon"]
          module_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          can_view?: boolean
          can_write?: boolean
          day_horizon?: Database["public"]["Enums"]["day_horizon"]
          module_key?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      rota_locks: {
        Row: {
          casino_id: string
          locked_at: string
          locked_by: string
          month: string
          scope: string
        }
        Insert: {
          casino_id: string
          locked_at?: string
          locked_by: string
          month: string
          scope: string
        }
        Update: {
          casino_id?: string
          locked_at?: string
          locked_by?: string
          month?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "rota_locks_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          balance: number | null
          cash_desk_result: number | null
          cash_flow_delta: number | null
          cash_result: number | null
          cashless_in_providers: Json
          cashless_out_providers: Json
          casino_id: string
          closed_at: string | null
          closed_by: string | null
          closing_cash: Json | null
          closing_count: Json | null
          created_at: string
          exchange_rates: Json
          id: string
          miss_total: number | null
          notes: string | null
          opened_at: string
          opened_by: string
          opening_float: Json | null
          shift_result: number | null
          status: string
          tables_result: number | null
        }
        Insert: {
          balance?: number | null
          cash_desk_result?: number | null
          cash_flow_delta?: number | null
          cash_result?: number | null
          cashless_in_providers?: Json
          cashless_out_providers?: Json
          casino_id: string
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: Json | null
          closing_count?: Json | null
          created_at?: string
          exchange_rates?: Json
          id?: string
          miss_total?: number | null
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_float?: Json | null
          shift_result?: number | null
          status?: string
          tables_result?: number | null
        }
        Update: {
          balance?: number | null
          cash_desk_result?: number | null
          cash_flow_delta?: number | null
          cash_result?: number | null
          cashless_in_providers?: Json
          cashless_out_providers?: Json
          casino_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: Json | null
          closing_count?: Json | null
          created_at?: string
          exchange_rates?: Json
          id?: string
          miss_total?: number | null
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_float?: Json | null
          shift_result?: number | null
          status?: string
          tables_result?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_items: {
        Row: {
          casino_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          photo_url: string | null
          price_credits: number
          sku: string | null
          stock_qty: number
          updated_at: string
        }
        Insert: {
          casino_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          photo_url?: string | null
          price_credits: number
          sku?: string | null
          stock_qty?: number
          updated_at?: string
        }
        Update: {
          casino_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          photo_url?: string | null
          price_credits?: number
          sku?: string | null
          stock_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_items_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_orders: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          casino_id: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          notes: string | null
          ordered_at: string
          player_id: string
          qty: number
          shop_item_id: string
          status: string
          total_credits: number
          unit_price_credits: number
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          casino_id: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string
          player_id: string
          qty?: number
          shop_item_id: string
          status?: string
          total_credits: number
          unit_price_credits: number
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          casino_id?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string
          player_id?: string
          qty?: number
          shop_item_id?: string
          status?: string
          total_credits?: number
          unit_price_credits?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_orders_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_orders_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "shop_orders_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_orders_shop_item_id_fkey"
            columns: ["shop_item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          notes: string | null
          reason: string
          ref_order_id: string | null
          shop_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          notes?: string | null
          reason: string
          ref_order_id?: string | null
          shop_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          notes?: string | null
          reason?: string
          ref_order_id?: string | null
          shop_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_stock_movements_ref_order_id_fkey"
            columns: ["ref_order_id"]
            isOneToOne: false
            referencedRelation: "shop_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_stock_movements_shop_item_id_fkey"
            columns: ["shop_item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_attendance: {
        Row: {
          casino_id: string
          created_at: string
          date: string
          employee_id: string
          id: string
          recorded_by: string
          updated_at: string
          value: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          date: string
          employee_id: string
          id?: string
          recorded_by: string
          updated_at?: string
          value?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          recorded_by?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_rota: {
        Row: {
          casino_id: string
          created_at: string
          created_by: string
          date: string
          employee_id: string
          id: string
          shift: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          created_by: string
          date: string
          employee_id: string
          id?: string
          shift?: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          created_by?: string
          date?: string
          employee_id?: string
          id?: string
          shift?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_rota_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_rota_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_warnings: {
        Row: {
          business_date: string
          casino_id: string
          comment: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          kind: string
          source_table: string
          updated_at: string
        }
        Insert: {
          business_date: string
          casino_id: string
          comment?: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          kind: string
          source_table?: string
          updated_at?: string
        }
        Update: {
          business_date?: string
          casino_id?: string
          comment?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          kind?: string
          source_table?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_warnings_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_warnings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_apply_errors: {
        Row: {
          attempts: number
          error_code: string
          error_text: string | null
          first_seen_at: string
          id: number
          last_seen_at: string
          op: string | null
          payload_hash: string | null
          peer_link_id: string | null
          peer_name: string | null
          pk: Json | null
          resolution: string | null
          resolved_at: string | null
          source_outbox_id: number | null
          table_name: string
        }
        Insert: {
          attempts?: number
          error_code: string
          error_text?: string | null
          first_seen_at?: string
          id?: number
          last_seen_at?: string
          op?: string | null
          payload_hash?: string | null
          peer_link_id?: string | null
          peer_name?: string | null
          pk?: Json | null
          resolution?: string | null
          resolved_at?: string | null
          source_outbox_id?: number | null
          table_name: string
        }
        Update: {
          attempts?: number
          error_code?: string
          error_text?: string | null
          first_seen_at?: string
          id?: number
          last_seen_at?: string
          op?: string | null
          payload_hash?: string | null
          peer_link_id?: string | null
          peer_name?: string | null
          pk?: Json | null
          resolution?: string | null
          resolved_at?: string | null
          source_outbox_id?: number | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_apply_errors_peer_link_id_fkey"
            columns: ["peer_link_id"]
            isOneToOne: false
            referencedRelation: "peer_links"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_exchange_logs: {
        Row: {
          batch_id: string | null
          created_at: string
          direction: string
          error_text: string | null
          id: number
          meta: Json | null
          peer_link_id: string | null
          peer_name: string | null
          peer_node_id: string | null
          row_count: number | null
          status: string
          table_name: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          direction: string
          error_text?: string | null
          id?: number
          meta?: Json | null
          peer_link_id?: string | null
          peer_name?: string | null
          peer_node_id?: string | null
          row_count?: number | null
          status: string
          table_name?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          direction?: string
          error_text?: string | null
          id?: number
          meta?: Json | null
          peer_link_id?: string | null
          peer_name?: string | null
          peer_node_id?: string | null
          row_count?: number | null
          status?: string
          table_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_exchange_logs_peer_link_id_fkey"
            columns: ["peer_link_id"]
            isOneToOne: false
            referencedRelation: "peer_links"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_inbox_log: {
        Row: {
          applied_at: string
          casino_id: string
          error: string | null
          id: number
          local_id: number
          op: string
          retry_count: number
          table_name: string
        }
        Insert: {
          applied_at?: string
          casino_id: string
          error?: string | null
          id?: number
          local_id: number
          op: string
          retry_count?: number
          table_name: string
        }
        Update: {
          applied_at?: string
          casino_id?: string
          error?: string | null
          id?: number
          local_id?: number
          op?: string
          retry_count?: number
          table_name?: string
        }
        Relationships: []
      }
      sync_outbox: {
        Row: {
          casino_id: string | null
          changed_at: string
          id: number
          op: string
          origin_node_id: string | null
          payload: Json | null
          pk: Json
          sync_role: string
          table_name: string
        }
        Insert: {
          casino_id?: string | null
          changed_at?: string
          id?: number
          op: string
          origin_node_id?: string | null
          payload?: Json | null
          pk: Json
          sync_role?: string
          table_name: string
        }
        Update: {
          casino_id?: string | null
          changed_at?: string
          id?: number
          op?: string
          origin_node_id?: string | null
          payload?: Json | null
          pk?: Json
          sync_role?: string
          table_name?: string
        }
        Relationships: []
      }
      sync_peer_health: {
        Row: {
          apply_errors_count: number
          last_apply_ok_at: string | null
          last_error_code: string | null
          last_error_text: string | null
          last_heartbeat_at: string | null
          last_probe_at: string | null
          last_probe_latency_ms: number | null
          last_pull_ok_at: string | null
          last_push_ok_at: string | null
          peer_link_id: string
          peer_name: string | null
          peer_node_id: string | null
          pending_outbox_count: number
          remote_lag_seconds: number | null
          schema_version_local: string | null
          schema_version_remote: string | null
          state: string
          updated_at: string
        }
        Insert: {
          apply_errors_count?: number
          last_apply_ok_at?: string | null
          last_error_code?: string | null
          last_error_text?: string | null
          last_heartbeat_at?: string | null
          last_probe_at?: string | null
          last_probe_latency_ms?: number | null
          last_pull_ok_at?: string | null
          last_push_ok_at?: string | null
          peer_link_id: string
          peer_name?: string | null
          peer_node_id?: string | null
          pending_outbox_count?: number
          remote_lag_seconds?: number | null
          schema_version_local?: string | null
          schema_version_remote?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          apply_errors_count?: number
          last_apply_ok_at?: string | null
          last_error_code?: string | null
          last_error_text?: string | null
          last_heartbeat_at?: string | null
          last_probe_at?: string | null
          last_probe_latency_ms?: number | null
          last_pull_ok_at?: string | null
          last_push_ok_at?: string | null
          peer_link_id?: string
          peer_name?: string | null
          peer_node_id?: string | null
          pending_outbox_count?: number
          remote_lag_seconds?: number | null
          schema_version_local?: string | null
          schema_version_remote?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_peer_health_peer_link_id_fkey"
            columns: ["peer_link_id"]
            isOneToOne: true
            referencedRelation: "peer_links"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_probe_events: {
        Row: {
          ack_at: string | null
          direction: string
          error_text: string | null
          id: string
          latency_ms: number | null
          peer_link_id: string | null
          sent_at: string
          status: string
        }
        Insert: {
          ack_at?: string | null
          direction: string
          error_text?: string | null
          id?: string
          latency_ms?: number | null
          peer_link_id?: string | null
          sent_at?: string
          status?: string
        }
        Update: {
          ack_at?: string | null
          direction?: string
          error_text?: string | null
          id?: string
          latency_ms?: number | null
          peer_link_id?: string | null
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_probe_events_peer_link_id_fkey"
            columns: ["peer_link_id"]
            isOneToOne: false
            referencedRelation: "peer_links"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_probes: {
        Row: {
          details: Json
          echoed_at: string | null
          id: string
          latency_ms: number | null
          origin_casino_id: string
          origin_slug: string
          received_back_at: string | null
          sent_at: string
          status: string
        }
        Insert: {
          details?: Json
          echoed_at?: string | null
          id?: string
          latency_ms?: number | null
          origin_casino_id: string
          origin_slug: string
          received_back_at?: string | null
          sent_at?: string
          status?: string
        }
        Update: {
          details?: Json
          echoed_at?: string | null
          id?: string
          latency_ms?: number | null
          origin_casino_id?: string
          origin_slug?: string
          received_back_at?: string | null
          sent_at?: string
          status?: string
        }
        Relationships: []
      }
      sync_seed_marker: {
        Row: {
          casino_id: string
          completed_at: string
          row_count: number
          table_name: string
        }
        Insert: {
          casino_id: string
          completed_at?: string
          row_count?: number
          table_name: string
        }
        Update: {
          casino_id?: string
          completed_at?: string
          row_count?: number
          table_name?: string
        }
        Relationships: []
      }
      sync_snapshot_state: {
        Row: {
          casino_id: string
          checksum: string | null
          imported_at: string
          snapshot_id: string | null
          source: string | null
          source_created_at: string | null
          table_counts: Json
        }
        Insert: {
          casino_id: string
          checksum?: string | null
          imported_at?: string
          snapshot_id?: string | null
          source?: string | null
          source_created_at?: string | null
          table_counts?: Json
        }
        Update: {
          casino_id?: string
          checksum?: string | null
          imported_at?: string
          snapshot_id?: string | null
          source?: string | null
          source_created_at?: string | null
          table_counts?: Json
        }
        Relationships: []
      }
      sync_table_registry: {
        Row: {
          critical: boolean
          date_column: string | null
          notes: string | null
          parity_required: boolean
          scope: string
          table_name: string
          updated_at: string
        }
        Insert: {
          critical?: boolean
          date_column?: string | null
          notes?: string | null
          parity_required?: boolean
          scope: string
          table_name: string
          updated_at?: string
        }
        Update: {
          critical?: boolean
          date_column?: string | null
          notes?: string | null
          parity_required?: boolean
          scope?: string
          table_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_locks: {
        Row: {
          casino_id: string
          created_at: string
          created_by: string | null
          id: string
          locked_until: string
          reason: string
        }
        Insert: {
          casino_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          locked_until: string
          reason: string
        }
        Update: {
          casino_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          locked_until?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_locks_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      table_daily_results: {
        Row: {
          casino_id: string
          close: number
          confirmed: boolean
          created_at: string
          created_by: string | null
          credit: number
          date: string
          drop_amount: number
          fill: number
          id: string
          open: number
          result: number
          source: string
          table_id: string
          updated_at: string
        }
        Insert: {
          casino_id: string
          close?: number
          confirmed?: boolean
          created_at?: string
          created_by?: string | null
          credit?: number
          date: string
          drop_amount?: number
          fill?: number
          id?: string
          open?: number
          result?: number
          source?: string
          table_id: string
          updated_at?: string
        }
        Update: {
          casino_id?: string
          close?: number
          confirmed?: boolean
          created_at?: string
          created_by?: string | null
          credit?: number
          date?: string
          drop_amount?: number
          fill?: number
          id?: string
          open?: number
          result?: number
          source?: string
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_daily_results_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_daily_results_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      table_day_drop_cache: {
        Row: {
          business_date: string
          casino_id: string
          drop_r_share: number
          in_at_table: number
          player_id: string
          recycled_share: number
          table_id: string
          updated_at: string
        }
        Insert: {
          business_date: string
          casino_id: string
          drop_r_share?: number
          in_at_table?: number
          player_id: string
          recycled_share?: number
          table_id: string
          updated_at?: string
        }
        Update: {
          business_date?: string
          casino_id?: string
          drop_r_share?: number
          in_at_table?: number
          player_id?: string
          recycled_share?: number
          table_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      table_head_count: {
        Row: {
          casino_id: string
          created_at: string
          date: string
          id: string
          table_id: string
          time_slot: string
          updated_at: string
          value: number
        }
        Insert: {
          casino_id: string
          created_at?: string
          date: string
          id?: string
          table_id: string
          time_slot: string
          updated_at?: string
          value: number
        }
        Update: {
          casino_id?: string
          created_at?: string
          date?: string
          id?: string
          table_id?: string
          time_slot?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "table_head_count_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_head_count_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      table_tracker: {
        Row: {
          casino_id: string
          created_at: string
          date: string
          id: string
          recorded_by: string
          table_id: string
          time_slot: string
          value: number
        }
        Insert: {
          casino_id: string
          created_at?: string
          date: string
          id?: string
          recorded_by: string
          table_id: string
          time_slot: string
          value?: number
        }
        Update: {
          casino_id?: string
          created_at?: string
          date?: string
          id?: string
          recorded_by?: string
          table_id?: string
          time_slot?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "table_tracker_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_tracker_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_conflicts: {
        Row: {
          id: string
          tag_a: string
          tag_b: string
        }
        Insert: {
          id?: string
          tag_a: string
          tag_b: string
        }
        Update: {
          id?: string
          tag_a?: string
          tag_b?: string
        }
        Relationships: []
      }
      tax_brackets: {
        Row: {
          base_tax: number
          bracket_order: number
          created_at: string
          effective_from: string
          id: string
          lower_bound: number
          rate_pct: number
          upper_bound: number | null
        }
        Insert: {
          base_tax?: number
          bracket_order: number
          created_at?: string
          effective_from: string
          id?: string
          lower_bound: number
          rate_pct: number
          upper_bound?: number | null
        }
        Update: {
          base_tax?: number
          bracket_order?: number
          created_at?: string
          effective_from?: string
          id?: string
          lower_bound?: number
          rate_pct?: number
          upper_bound?: number | null
        }
        Relationships: []
      }
      transaction_cancellations: {
        Row: {
          amount: number
          business_date: string | null
          cancelled_at: string
          cancelled_by: string
          casino_id: string
          id: string
          player_id: string
          reason: string
          shift_id: string | null
          transaction_id: string
          tx_type: string
        }
        Insert: {
          amount: number
          business_date?: string | null
          cancelled_at?: string
          cancelled_by: string
          casino_id: string
          id?: string
          player_id: string
          reason: string
          shift_id?: string | null
          transaction_id: string
          tx_type: string
        }
        Update: {
          amount?: number
          business_date?: string | null
          cancelled_at?: string
          cancelled_by?: string
          casino_id?: string
          id?: string
          player_id?: string
          reason?: string
          shift_id?: string | null
          transaction_id?: string
          tx_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_cancellations_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_cancellations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "transaction_cancellations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_cancellations_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_cancellations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          business_date: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          casino_id: string
          chips: Json | null
          created_at: string
          id: string
          operator_id: string
          player_id: string | null
          shift_id: string | null
          table_id: string | null
          tips_recipient_employee_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          amount: number
          business_date?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          casino_id: string
          chips?: Json | null
          created_at?: string
          id?: string
          operator_id: string
          player_id?: string | null
          shift_id?: string | null
          table_id?: string | null
          tips_recipient_employee_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          amount?: number
          business_date?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          casino_id?: string
          chips?: Json | null
          created_at?: string
          id?: string
          operator_id?: string
          player_id?: string | null
          shift_id?: string | null
          table_id?: string | null
          tips_recipient_employee_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "transactions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_tips_recipient_employee_id_fkey"
            columns: ["tips_recipient_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      update_commands: {
        Row: {
          acknowledged_at: string | null
          applied_at: string | null
          auto_apply: boolean
          casino_id: string
          id: string
          issued_at: string
          issued_by: string
          status: string
          status_message: string | null
          target_version: string
        }
        Insert: {
          acknowledged_at?: string | null
          applied_at?: string | null
          auto_apply?: boolean
          casino_id: string
          id?: string
          issued_at?: string
          issued_by: string
          status?: string
          status_message?: string | null
          target_version: string
        }
        Update: {
          acknowledged_at?: string | null
          applied_at?: string | null
          auto_apply?: boolean
          casino_id?: string
          id?: string
          issued_at?: string
          issued_by?: string
          status?: string
          status_message?: string | null
          target_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "update_commands_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_casino_access: {
        Row: {
          casino_id: string
          granted_at: string
          granted_by: string
          id: string
          user_id: string
        }
        Insert: {
          casino_id: string
          granted_at?: string
          granted_by: string
          id?: string
          user_id: string
        }
        Update: {
          casino_id?: string
          granted_at?: string
          granted_by?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_casino_access_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credentials: {
        Row: {
          id: string
          pin_hash: string | null
          rfid_tag: string | null
          user_id: string
        }
        Insert: {
          id?: string
          pin_hash?: string | null
          rfid_tag?: string | null
          user_id: string
        }
        Update: {
          id?: string
          pin_hash?: string | null
          rfid_tag?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_module_permissions: {
        Row: {
          can_view: boolean
          can_write: boolean | null
          created_at: string
          day_horizon: Database["public"]["Enums"]["day_horizon"] | null
          granted_by: string | null
          history_horizon: Database["public"]["Enums"]["history_horizon"] | null
          id: string
          module_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_view?: boolean
          can_write?: boolean | null
          created_at?: string
          day_horizon?: Database["public"]["Enums"]["day_horizon"] | null
          granted_by?: string | null
          history_horizon?:
            | Database["public"]["Enums"]["history_horizon"]
            | null
          id?: string
          module_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_view?: boolean
          can_write?: boolean | null
          created_at?: string
          day_horizon?: Database["public"]["Enums"]["day_horizon"] | null
          granted_by?: string | null
          history_horizon?:
            | Database["public"]["Enums"]["history_horizon"]
            | null
          id?: string
          module_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_bonus_entries: {
        Row: {
          bonus_points: number
          casino_id: string
          created_at: string
          employee_id: string
          extra_override: number | null
          id: string
          updated_at: string
          week_start: string
        }
        Insert: {
          bonus_points?: number
          casino_id: string
          created_at?: string
          employee_id: string
          extra_override?: number | null
          id?: string
          updated_at?: string
          week_start: string
        }
        Update: {
          bonus_points?: number
          casino_id?: string
          created_at?: string
          employee_id?: string
          extra_override?: number | null
          id?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_bonus_entries_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_bonus_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_bonus_pools: {
        Row: {
          calculated_at: string | null
          calculated_by: string | null
          casino_id: string
          created_at: string
          currency: string
          id: string
          is_calculated: boolean
          pool_amount: number
          updated_at: string
          week_start: string
        }
        Insert: {
          calculated_at?: string | null
          calculated_by?: string | null
          casino_id: string
          created_at?: string
          currency?: string
          id?: string
          is_calculated?: boolean
          pool_amount?: number
          updated_at?: string
          week_start: string
        }
        Update: {
          calculated_at?: string | null
          calculated_by?: string | null
          casino_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_calculated?: boolean
          pool_amount?: number
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_bonus_pools_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      chip_conservation_status: {
        Row: {
          archived_miss: number | null
          casino_id: string | null
          denomination: number | null
          in_locations: number | null
          initial_quantity: number | null
          live_floor: number | null
        }
        Insert: {
          archived_miss?: never
          casino_id?: string | null
          denomination?: number | null
          in_locations?: never
          initial_quantity?: number | null
          live_floor?: never
        }
        Update: {
          archived_miss?: never
          casino_id?: string | null
          denomination?: number | null
          in_locations?: never
          initial_quantity?: number | null
          live_floor?: never
        }
        Relationships: [
          {
            foreignKeyName: "chip_initial_baseline_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_job_health: {
        Row: {
          age: string | null
          is_unhealthy: boolean | null
          job_name: string | null
          last_details: Json | null
          last_duration_ms: number | null
          last_run_at: string | null
          last_status: string | null
        }
        Relationships: []
      }
      cron_recent_runs: {
        Row: {
          end_time: string | null
          jobname: string | null
          return_message: string | null
          start_time: string | null
          status: string | null
        }
        Relationships: []
      }
      payroll_bank_export_v: {
        Row: {
          account_number: string | null
          amount: number | null
          bank_code: string | null
          branch_code: string | null
          casino_id: string | null
          employee_id: string | null
          id: string | null
          name: string | null
          period_id: string | null
          warning: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      player_economy: {
        Row: {
          casino_id: string | null
          first_name: string | null
          last_name: string | null
          nickname: string | null
          player_id: string | null
          real_result: number | null
          result: number | null
          status: Database["public"]["Enums"]["player_status"] | null
          total: number | null
          total_cashout: number | null
          total_drop: number | null
          total_drop_r: number | null
          total_drop_recycled: number | null
          total_expenses: number | null
        }
        Relationships: [
          {
            foreignKeyName: "players_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      player_session_drops: {
        Row: {
          casino_id: string | null
          drop_v: number | null
          player_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_sessions_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sessions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "client_sessions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_session_stats: {
        Row: {
          bet_sum_by_avg: number | null
          casino_id: string | null
          first_session_at: string | null
          hands: number | null
          last_session_at: string | null
          minutes: number | null
          player_id: string | null
          session_count: number | null
          table_id: string | null
          total_bet_sum: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_sessions_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sessions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_economy"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "client_sessions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "gaming_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions_total_bet_sum: {
        Row: {
          business_date: string | null
          casino_id: string | null
          total_bet: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_sessions_casino_id_fkey"
            columns: ["casino_id"]
            isOneToOne: false
            referencedRelation: "casinos"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_outbox_pending: {
        Row: {
          casino_id: string | null
          oldest_change_at: string | null
          oldest_minutes: number | null
          pending_count: number | null
          table_name: string | null
        }
        Relationships: []
      }
      v_pos_item_availability: {
        Row: {
          bottleneck_ingredient_id: string | null
          bottleneck_ingredient_name: string | null
          bottleneck_remaining: number | null
          casino_id: string | null
          empty_recipe: boolean | null
          has_recipe: boolean | null
          item_name: string | null
          low_threshold: number | null
          portions_available: number | null
          sellable_item_id: string | null
          sellable_stock_qty: number | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_recipe_items_ingredient_item_id_fkey"
            columns: ["bottleneck_ingredient_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_recipe_items_ingredient_item_id_fkey"
            columns: ["bottleneck_ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_pos_item_availability"
            referencedColumns: ["sellable_item_id"]
          },
        ]
      }
    }
    Functions: {
      _cash_to_tzs: { Args: { cash: Json; rates: Json }; Returns: number }
      _close_open_position: {
        Args: { _at: string; _casino_id: string; _player_id: string }
        Returns: undefined
      }
      _has_payload: { Args: { snap: Json }; Returns: boolean }
      _sum_denoms: { Args: { p: Json }; Returns: number }
      _sum_mobile: { Args: { p: Json }; Returns: number }
      activity_logs_purge: { Args: { p_days?: number }; Returns: number }
      am_issue_grant: {
        Args: {
          p_amount: number
          p_casino_id: string
          p_fixed_date?: string
          p_funding_pool: Database["public"]["Enums"]["promo_funding_source"]
          p_lifetime_days?: number
          p_lifetime_mode?: Database["public"]["Enums"]["promo_grant_lifetime_mode"]
          p_notes?: string
          p_player_id: string
          p_source: Database["public"]["Enums"]["promo_grant_source"]
        }
        Returns: Json
      }
      am_performance_summary: {
        Args: {
          _am_id: string
          _casino_id?: string
          _from?: string
          _to?: string
        }
        Returns: Json
      }
      am_revoke_verification: {
        Args: { p_player_id: string; p_reason: string }
        Returns: Json
      }
      am_trust_player: {
        Args: { p_player_id: string; p_reason: string }
        Returns: Json
      }
      apply_cage_shift_closing: { Args: { _shift_id: string }; Returns: Json }
      approve_expense_as_manager: {
        Args: { p_expense_id: string; p_manager_id: string }
        Returns: undefined
      }
      audit_drop_caches: {
        Args: { _from?: string; _to?: string }
        Returns: {
          business_date: string
          casino_id: string
          diff: number
          players_peak: number
          tables_share: number
        }[]
      }
      auto_close_business_day: { Args: never; Returns: Json }
      auto_close_forgotten_business_days: { Args: never; Returns: undefined }
      box_license_mode: { Args: never; Returns: string }
      build_business_day_snapshot: {
        Args: { _business_date: string; _casino_id: string }
        Returns: Json
      }
      business_date_of: { Args: { _ts: string }; Returns: string }
      can_close_shift: {
        Args: { p_shift_id: string }
        Returns: {
          ok: boolean
          open_tables: Json
        }[]
      }
      cancel_transaction: {
        Args: { p_reason: string; p_transaction_id: string }
        Returns: undefined
      }
      cashier_issue_lottery_ticket: {
        Args: {
          p_casino_id: string
          p_lottery_id: string
          p_player_id: string
          p_qty: number
        }
        Returns: Json
      }
      cashier_redeem_promo_by_account: {
        Args: {
          p_amount: number
          p_cage_id: string
          p_casino_id: string
          p_club_account_id: string
          p_shift_id: string
        }
        Returns: Json
      }
      chip_snapshots_latest: {
        Args: { _casino_id: string; _date: string }
        Returns: {
          actual_quantity: number
          casino_id: string
          created_at: string
          date: string
          denomination: number
          expected_quantity: number
          id: string
          location_id: string | null
          location_type: string
          miss: number | null
          recorded_by: string
        }[]
        SetofOptions: {
          from: "*"
          to: "chip_snapshots"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_old_data: { Args: never; Returns: Json }
      clear_stale_peer_links: { Args: never; Returns: number }
      clear_stale_peer_requests: { Args: never; Returns: number }
      clone_arusha_to_mbeya_demo: { Args: never; Returns: Json }
      close_business_day: {
        Args: {
          _casino_id: string
          _force_close_cycles?: boolean
          _method: string
        }
        Returns: Json
      }
      close_open_sessions_5am: { Args: never; Returns: Json }
      club_buy_lottery_ticket: {
        Args: {
          p_casino_id: string
          p_lottery_id: string
          p_player_id: string
          p_qty: number
        }
        Returns: Json
      }
      club_cancel_kyc: { Args: { _player_id: string }; Returns: Json }
      club_place_shop_order: {
        Args: {
          p_casino_id: string
          p_item_id: string
          p_player_id: string
          p_qty: number
        }
        Returns: Json
      }
      club_redeem_promo_code: {
        Args: { p_code: string; p_player_id: string }
        Returns: Json
      }
      club_self_register: {
        Args: {
          _casino_slug: string
          _dob: string
          _first: string
          _id_number: string
          _last: string
          _phone: string
        }
        Returns: Json
      }
      club_self_register_minimal: {
        Args: {
          _casino_slug: string
          _dob: string
          _first: string
          _last: string
          _phone: string
        }
        Returns: Json
      }
      club_submit_kyc: {
        Args: {
          _dob: string
          _first: string
          _id_back_url: string
          _id_front_url: string
          _id_number: string
          _last: string
          _ocr: Json
          _player_id: string
          _selfie_url: string
        }
        Returns: Json
      }
      club_update_profile: {
        Args: {
          _casino_slug: string
          _dob: string
          _first: string
          _id_number: string
          _last: string
          _player_id: string
        }
        Returns: Json
      }
      compute_cage_slots_balance: {
        Args: { p_shift_id: string }
        Returns: Json
      }
      compute_daily_diff: {
        Args: { _casino_id: string; _from: string; _to: string }
        Returns: {
          business_date: string
          diff: number
          drop_r: number
          miss: number
          player_result: number
          result: number
          tips: number
        }[]
      }
      compute_paye_for_amount: {
        Args: { _amount: number; _at: string }
        Returns: number
      }
      compute_player_drop_split: {
        Args: { _from?: string; _player_id: string; _to?: string }
        Returns: {
          drop_r: number
          drop_recycled: number
        }[]
      }
      compute_players_drop_split: {
        Args: { _casino_id: string; _from?: string; _to?: string }
        Returns: {
          drop_r: number
          drop_recycled: number
          player_id: string
        }[]
      }
      compute_shift_balance: { Args: { _shift_id: string }; Returns: Json }
      compute_shift_balance_from_row: {
        Args: { s: Database["public"]["Tables"]["shifts"]["Row"] }
        Returns: Json
      }
      compute_shift_cash_flow_delta: {
        Args: { closing_count: Json; exchange_rates: Json; opening_float: Json }
        Returns: number
      }
      compute_shift_close: { Args: { p_shift_id: string }; Returns: Json }
      compute_shift_table_results: {
        Args: { p_shift_id: string }
        Returns: {
          result: number
          table_id: string
        }[]
      }
      compute_shift_tables_result_total: {
        Args: { p_shift_id: string }
        Returns: number
      }
      compute_slots_shift_balance: {
        Args: { _shift_id: string }
        Returns: Json
      }
      compute_slots_shift_balance_from_row: {
        Args: { s: Database["public"]["Tables"]["cage_slots_shifts"]["Row"] }
        Returns: Json
      }
      compute_tables_drop_split: {
        Args: { _casino_id: string; _from?: string; _to?: string }
        Returns: {
          drop_r: number
          drop_recycled: number
          table_id: string
        }[]
      }
      create_chip_transfer_pair: {
        Args: {
          _amount: number
          _chips?: Json
          _from_player: string
          _note?: string
          _table_id?: string
          _to_player: string
        }
        Returns: Json
      }
      create_office_expense: {
        Args: {
          p_amount: number
          p_casino_id: string
          p_category_code: string
          p_description: string
        }
        Returns: string
      }
      crm_players_list: {
        Args: { _casino: string }
        Returns: {
          birth_date: string
          birthday_card_sent_year: number
          card_number: string
          category: Database["public"]["Enums"]["player_category"]
          created_at: string
          custom_tags: string[]
          first_name: string
          host_name: string
          host_user_id: string
          last_contact_at: string
          last_contact_note: string
          last_name: string
          last_visit: string
          nickname: string
          phone: string
          photo_url: string
          player_id: string
          segment: Database["public"]["Enums"]["player_crm_segment"]
          segment_locked: boolean
          status: Database["public"]["Enums"]["player_status"]
          visits_90d: number
          visits_total: number
        }[]
      }
      cron_health_overview: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          last_run_start: string
          last_runtime_ms: number
          last_status: string
          schedule: string
          total_failures_24h: number
        }[]
      }
      cs_can_approve: { Args: { _casino: string }; Returns: boolean }
      cs_can_view: { Args: { _casino: string }; Returns: boolean }
      cs_can_write: { Args: { _casino: string }; Returns: boolean }
      cutover_begin: {
        Args: { p_casino: string; p_target_node: string }
        Returns: string
      }
      cutover_freeze_cloud: { Args: { p_casino: string }; Returns: number }
      cutover_promote_local: { Args: { p_casino: string }; Returns: undefined }
      cutover_rollback: { Args: { p_session: string }; Returns: undefined }
      cutover_set_state: {
        Args: { p_notes?: string; p_session: string; p_state: string }
        Returns: undefined
      }
      demote_to_cloud_primary: { Args: { p_casino_id: string }; Returns: Json }
      edit_business_day_snapshot: {
        Args: { _closure_id: string; _patches: Json; _section: string }
        Returns: Json
      }
      effective_module_perms: {
        Args: { p_user_id: string }
        Returns: {
          can_view: boolean
          can_write: boolean
          day_horizon: Database["public"]["Enums"]["day_horizon"]
          module_key: string
        }[]
      }
      employee_roles_at: {
        Args: { _casino_id: string; _on_date: string }
        Returns: {
          dealer_category: string
          department: string
          employee_id: string
          is_pit_boss: boolean
          job_position: string
        }[]
      }
      ensure_fin_daily_rates: {
        Args: { _business_date: string; _casino_id: string }
        Returns: undefined
      }
      export_full_schema_ddl: { Args: never; Returns: string }
      fin_archive_old_audit_log: { Args: never; Returns: number }
      fin_balance_snapshot: {
        Args: {
          p_casino_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: Json
      }
      fin_budget_set_annual: {
        Args: {
          p_annual: number
          p_casino: string
          p_category: string
          p_currency: string
          p_year: number
        }
        Returns: undefined
      }
      fin_lock_day_closing: {
        Args: { p_id: string; p_variance_note?: string }
        Returns: undefined
      }
      fin_money_change_create: {
        Args: {
          p_business_date: string
          p_casino: string
          p_from_amount: number
          p_from_ccy: string
          p_from_wallet: string
          p_note: string
          p_rate: number
          p_to_amount: number
          p_to_casino: string
          p_to_ccy: string
          p_to_wallet: string
        }
        Returns: string
      }
      fin_reverse_tx: {
        Args: { p_reason: string; p_tx_id: string }
        Returns: string
      }
      finalize_open_cycles_for_close: {
        Args: { _casino_id: string; _user: string }
        Returns: Json
      }
      finalize_player_daily_avg_bets: {
        Args: { p_business_date: string; p_casino_id: string }
        Returns: number
      }
      find_duplicate_groups: {
        Args: { _casino_id?: string; _limit?: number }
        Returns: {
          group_key: string
          match_reason: string
          players: Json
        }[]
      }
      finish_first_run: {
        Args: {
          _config: Json
          _email: string
          _node_id: string
          _password: string
        }
        Returns: Json
      }
      fleet_dispatch_bulk: { Args: { _bulk_id: string }; Returns: number }
      fm_topup_am_budget: {
        Args: {
          p_am_user_id: string
          p_amount: number
          p_casino_id: string
          p_note?: string
        }
        Returns: string
      }
      fm_topup_campaign_budget: {
        Args: { p_amount: number; p_campaign_id: string; p_note?: string }
        Returns: string
      }
      fm_topup_house_promo_fund: {
        Args: { p_amount: number; p_casino_id: string; p_note?: string }
        Returns: string
      }
      gc_pending_server_registrations: { Args: never; Returns: undefined }
      generate_card_number: { Args: never; Returns: string }
      get_business_date_for_casino: {
        Args: { _casino_id: string }
        Returns: string
      }
      get_current_business_date: {
        Args: { _casino_id: string }
        Returns: string
      }
      get_effective_shift_settings: {
        Args: { _casino_id: string }
        Returns: {
          breaklist_lock: string
          shift_end: string
        }[]
      }
      get_expected_chips:
        | {
            Args: {
              _casino_id: string
              _denomination: number
              _location_id: string
              _location_type: string
            }
            Returns: number
          }
        | {
            Args: {
              _casino_id: string
              _denomination: number
              _location_id: string
              _location_type: string
            }
            Returns: number
          }
      get_monthly_attendance: {
        Args: { p_casino_id: string; p_month: string }
        Returns: {
          auto_hours: number
          d: string
          dealer_category: string
          department: string
          effective_hours: number
          employee_id: string
          full_name: string
          holiday_multiplier: number
          is_holiday: boolean
          is_pit_boss: boolean
          job_position: string
          manual_hours: number
          photo_url: string
          raw_value: string
        }[]
      }
      get_promo_wallet_balance: {
        Args: { p_player_id: string }
        Returns: number
      }
      get_user_casino_id: { Args: { _user_id: string }; Returns: string }
      has_any_pos_role: { Args: { _user: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager_op: { Args: { _uid: string }; Returns: boolean }
      is_promo_chip: { Args: { p_chip_color_id: string }; Returns: boolean }
      is_super_admin: { Args: { _uid: string }; Returns: boolean }
      kyc_decide: {
        Args: { p_approve: boolean; p_notes?: string; p_review_id: string }
        Returns: Json
      }
      kyc_revoke_reception: {
        Args: { p_player_id: string; p_reason: string }
        Returns: Json
      }
      list_open_cycles_for_day: { Args: { _casino_id: string }; Returns: Json }
      local_servers_overview: {
        Args: never
        Returns: {
          casino_id: string
          containers_running: number
          containers_total: number
          current_version: string
          disk_used_pct: number
          health_updated_at: string
          id: string
          is_online: boolean
          last_sync_at: string
          minutes_since_sync: number
          server_ip: string
          server_name: string
          uptime_seconds: number
        }[]
      }
      lookup_rfid_user: {
        Args: { rfid: string }
        Returns: {
          casino_id: string
          display_name: string
          user_id: string
        }[]
      }
      manager_edit_blacklist_reason: {
        Args: { _player_id: string; _reason: string }
        Returns: Json
      }
      manager_set_player_blacklist: {
        Args: {
          _manager_id: string
          _player_id: string
          _reason?: string
          _status: string
        }
        Returns: undefined
      }
      merge_players: {
        Args: {
          _field_choices: Json
          _loser_ids: string[]
          _reason: string
          _survivor_id: string
        }
        Returns: string
      }
      mirror_freeze_writes: { Args: { p_casino_id: string }; Returns: Json }
      mirror_full_parity_snapshot: {
        Args: { p_casino_id: string }
        Returns: {
          critical: boolean
          ids_checksum: string
          max_change_ts: string
          row_count: number
          rows_checksum: string
          scope: string
          table_name: string
        }[]
      }
      mirror_parity_snapshot: {
        Args: { p_casino_id: string }
        Returns: {
          max_updated_at: string
          row_count: number
          table_name: string
        }[]
      }
      mirror_record_parity: {
        Args: { p_casino_id: string; p_ok: boolean; p_summary: Json }
        Returns: undefined
      }
      mirror_unfreeze_writes: { Args: { p_casino_id: string }; Returns: Json }
      payroll_approve_hr: { Args: { _period_id: string }; Returns: undefined }
      payroll_approve_manager: {
        Args: { _period_id: string }
        Returns: undefined
      }
      payroll_create_period: {
        Args: { _casino_id?: string; _month: number; _year: number }
        Returns: string
      }
      payroll_duplicate_period: {
        Args: { _month: number; _source_period_id: string; _year: number }
        Returns: string
      }
      payroll_mark_paid: { Args: { _period_id: string }; Returns: undefined }
      payroll_refresh_period: { Args: { _period_id: string }; Returns: Json }
      payroll_revert_to_draft: {
        Args: { _period_id: string; _reason?: string }
        Returns: undefined
      }
      payroll_unlock_period: {
        Args: { _period_id: string; _reason: string }
        Returns: undefined
      }
      peer_apply_change: {
        Args: {
          p_changed_at: string
          p_op: string
          p_origin_node_id: string
          p_payload: Json
          p_pk: Json
          p_table: string
        }
        Returns: undefined
      }
      player_active_visit_casino: {
        Args: { _player_id: string }
        Returns: {
          casino_id: string
          casino_name: string
          checked_in_at: string
        }[]
      }
      player_drop_split_lifetime: {
        Args: { _player_id: string }
        Returns: {
          drop_r: number
          drop_recycled: number
        }[]
      }
      player_lifetime_visit_counts: {
        Args: { _casino_id: string; _player_ids?: string[] }
        Returns: {
          player_id: string
          visit_count: number
        }[]
      }
      player_segment_recalc: { Args: { _casino: string }; Returns: number }
      populate_table_daily_results_for_day: {
        Args: { _business_date: string; _casino_id: string; _user: string }
        Returns: number
      }
      pos_backfill_cost_snapshots: {
        Args: {
          _casino_id: string
          _dry_run?: boolean
          _from_date?: string
          _to_date?: string
        }
        Returns: {
          backfilled: boolean
          item_id: string
          movement_id: string
          new_cost_tzs: number
          new_unit_cost: number
          old_cost_tzs: number
          old_unit_cost: number
        }[]
      }
      pos_close_shift: {
        Args: { _closing_cash: number; _shift_id: string }
        Returns: Json
      }
      pos_cogs_report: {
        Args: {
          _casino_id: string
          _from_date: string
          _group_by?: string
          _pos_location_id?: string
          _to_date: string
        }
        Returns: {
          cogs_tzs: number
          cost_card_tzs: number
          cost_cash_tzs: number
          cost_comp_house_tzs: number
          cost_comp_player_tzs: number
          cost_player_charge_tzs: number
          cost_voided_tzs: number
          gross_margin_pct: number
          gross_margin_tzs: number
          gross_sales_tzs: number
          group_key: string
          group_label: string
          group_type: string
          movement_count: number
          uncosted_movement_count: number
          units_consumed: number
        }[]
      }
      pos_comp_budget_status: {
        Args: { _casino_id: string; _month_start?: string }
        Returns: Json
      }
      pos_compute_z_report: { Args: { _shift_id: string }; Returns: Json }
      pos_create_purchase: { Args: { _payload: Json }; Returns: string }
      pos_get_or_create_default_location: {
        Args: { _casino_id: string }
        Returns: string
      }
      pos_handover_shift: {
        Args: {
          _closing_cash: number
          _closing_shift_id: string
          _new_shift_type: string
          _new_waiter_user_id: string
        }
        Returns: Json
      }
      pos_item_availability_detail: { Args: { item_id: string }; Returns: Json }
      pos_player_search: {
        Args: { _casino_id: string; _q: string }
        Returns: {
          category: string
          first_name: string
          home_casino_id: string
          id: string
          last_name: string
          matched_card: boolean
          nickname: string
          phone_masked: string
        }[]
      }
      pos_player_status: {
        Args: { _casino_id: string; _player_id: string }
        Returns: string
      }
      pos_record_waste: {
        Args: {
          _item_id: string
          _notes?: string
          _qty: number
          _reason: string
        }
        Returns: string
      }
      pos_save_stock_count: {
        Args: {
          _count_type: string
          _items: Json
          _notes?: string
          _shift_id: string
        }
        Returns: string
      }
      pos_shift_reconciliation: {
        Args: { _casino_id: string; _from: string; _to: string }
        Returns: {
          business_date: string
          card_tzs: number
          cash_delta: number
          cash_tzs: number
          closed_at: string
          closing_cash: number
          comp_house_tzs: number
          comp_player_tzs: number
          expected_cash: number
          gross_tzs: number
          opened_at: string
          opening_cash: number
          outstanding_charges_tzs: number
          overrides_count: number
          shift_id: string
          shift_type: string
          status: string
          stock_variance_tzs: number
          waiter_name: string
          waiter_user_id: string
        }[]
      }
      pos_suggested_price: { Args: { _item_id: string }; Returns: number }
      pos_tabs_recompute_total: {
        Args: { _tab_id: string }
        Returns: undefined
      }
      promo_campaign_kpi: { Args: { _campaign_id: string }; Returns: Json }
      promote_to_local_primary: {
        Args: { p_casino_id: string; p_force?: boolean }
        Returns: Json
      }
      purge_endpoint_health_checks: { Args: never; Returns: undefined }
      purge_mbeya_demo: { Args: never; Returns: Json }
      rebuild_drop_caches_for_day: {
        Args: { _business_date: string; _casino_id: string }
        Returns: number
      }
      recalc_shift_tables_result: {
        Args: { p_shift_id: string }
        Returns: number
      }
      reception_verify_player: {
        Args: {
          p_dob: string
          p_first: string
          p_id_doc_url?: string
          p_id_number: string
          p_last: string
          p_photo_url?: string
          p_player_id: string
        }
        Returns: Json
      }
      recompute_drop_cache_for_day: {
        Args: { _business_date: string; _player_id: string }
        Returns: undefined
      }
      redeem_promo_fifo: {
        Args: {
          p_amount: number
          p_cage_id: string
          p_cashier_id: string
          p_casino_id: string
          p_payout_type?: string
          p_player_id: string
          p_shift_id: string
        }
        Returns: Json
      }
      refresh_chip_initial_baseline: {
        Args: { _casino_id: string }
        Returns: undefined
      }
      reimport_staff_master: { Args: { p_casino_id: string }; Returns: Json }
      reopen_shift: {
        Args: { _reason?: string; _shift_id: string }
        Returns: Json
      }
      replication_readiness: { Args: { p_casino_id: string }; Returns: Json }
      reset_operational_dashboards: {
        Args: { _casino_id: string }
        Returns: Json
      }
      rotate_local_server_secret: {
        Args: { _server_id: string }
        Returns: string
      }
      seed_export_auth_users: {
        Args: { p_casino_id: string }
        Returns: {
          aud: string
          created_at: string
          email: string
          email_confirmed_at: string
          encrypted_password: string
          id: string
          phone: string
          raw_app_meta_data: Json
          raw_user_meta_data: Json
          role: string
        }[]
      }
      set_player_category: {
        Args: { _category: string; _player_id: string }
        Returns: undefined
      }
      shift_miss_total_from_closing_count: {
        Args: { _closing_count: Json }
        Returns: number
      }
      staff_rota_scope: { Args: { _employee_id: string }; Returns: string }
      sync_apply_remote: {
        Args: {
          p_casino_id: string
          p_local_id: number
          p_op: string
          p_payload: Json
          p_pk: Json
          p_table: string
        }
        Returns: Json
      }
      sync_attach: { Args: { p_table: unknown }; Returns: undefined }
      sync_diagnostics_gc: { Args: never; Returns: undefined }
      sync_exchange_logs_gc: { Args: never; Returns: undefined }
      sync_inbox_health: {
        Args: never
        Returns: {
          casino_id: string
          errors_24h: number
          last_applied_at: string
          oldest_error_at: string
          total_24h: number
        }[]
      }
      sync_outbox_gc: { Args: never; Returns: undefined }
      sync_outbox_health: {
        Args: never
        Returns: {
          casino_id: string
          failed_count: number
          oldest_pending_at: string
          pending_count: number
        }[]
      }
      sync_outbox_per_table: {
        Args: never
        Returns: {
          casino_id: string
          oldest_change_at: string
          oldest_minutes: number
          pending_count: number
          table_name: string
        }[]
      }
      sync_promote_server: { Args: { p_server_id: string }; Returns: undefined }
      sync_record_apply_error: {
        Args: {
          p_error_code: string
          p_error_text: string
          p_op: string
          p_payload_hash: string
          p_peer_link_id: string
          p_pk: Json
          p_source_outbox_id: number
          p_table: string
        }
        Returns: number
      }
      sync_record_apply_ok: {
        Args: { p_peer_link_id: string }
        Returns: undefined
      }
      sync_record_health: {
        Args: {
          p_heartbeat_at?: string
          p_last_error_code?: string
          p_last_error_text?: string
          p_peer_link_id: string
          p_pending_outbox?: number
          p_remote_lag_seconds?: number
          p_schema_version_local?: string
          p_schema_version_remote?: string
          p_state: string
        }
        Returns: undefined
      }
      sync_record_probe_ack: {
        Args: { p_error_text?: string; p_probe_id: string; p_status?: string }
        Returns: undefined
      }
      sync_record_probe_sent: {
        Args: { p_direction?: string; p_peer_link_id: string }
        Returns: string
      }
      sync_record_pull_ok: {
        Args: { p_peer_link_id: string }
        Returns: undefined
      }
      sync_record_push_ok: {
        Args: { p_peer_link_id: string }
        Returns: undefined
      }
      sync_record_snapshot: {
        Args: {
          p_casino_id: string
          p_checksum: string
          p_snapshot_id: string
          p_source: string
          p_source_created_at: string
          p_table_counts: Json
        }
        Returns: undefined
      }
      sync_reset_outbox: {
        Args: { p_advance_cursors?: boolean; p_casino_id: string }
        Returns: Json
      }
      sync_resolve_apply_error: {
        Args: { p_id: number; p_resolution: string }
        Returns: undefined
      }
      sync_role_for_table: { Args: { p_table: string }; Returns: string }
      sync_roundtrip_probe: {
        Args: { p_origin_casino_id: string; p_origin_slug: string }
        Returns: string
      }
      sync_seed_from_existing: {
        Args: { p_casino_id: string }
        Returns: {
          inserted_count: number
          table_name: string
        }[]
      }
      sync_wipe_casino_data: {
        Args: { p_casino_id: string; p_confirm_slug: string }
        Returns: Json
      }
      undo_player_merge: { Args: { _merge_id: string }; Returns: undefined }
      update_user_roles: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: undefined
      }
      user_can_see_casino: {
        Args: { _casino: string; _user: string }
        Returns: boolean
      }
      user_can_subscribe_casino_realtime: {
        Args: { _casino_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_casino_access: {
        Args: { _casino_id: string; _user_id: string }
        Returns: boolean
      }
      validate_chip_consistency: {
        Args: { _casino_id: string }
        Returns: {
          difference: number
          status: string
          total_actual: number
          total_expected: number
        }[]
      }
    }
    Enums: {
      app_role:
        | "cashier"
        | "pit"
        | "manager"
        | "reception"
        | "finance_manager"
        | "surveillance"
        | "super_admin"
        | "hr"
        | "shift_manager"
        | "cashier_slots"
        | "pos_waiter"
        | "pos_bartender"
        | "pos_manager"
        | "account_manager"
      cage_slots_comment_type:
        | "cashier_note"
        | "manager_comment"
        | "reversal_reason"
      cage_slots_count_type: "opening" | "check" | "closing"
      cage_slots_inventory_type: "opening" | "closing"
      cage_slots_shift_type: "day" | "night"
      cage_slots_status:
        | "draft"
        | "open"
        | "ready_for_review"
        | "approved"
        | "closed"
        | "reversed"
      card_type: "manual" | "rfid"
      casino_server_role: "primary" | "replica"
      day_horizon: "today" | "7d" | "30d" | "all"
      dealer_category:
        | "trainee"
        | "dealer"
        | "inspector"
        | "expert"
        | "pit_boss"
      dealer_role:
        | "BJ"
        | "BJi"
        | "AR1"
        | "AR1i"
        | "AR1c"
        | "BR"
        | "P"
        | "Pi"
        | "AR"
        | "ARi"
        | "ARc"
        | "S"
        | "TR"
        | "SRT"
        | "CLS"
        | "LT"
        | "CLR"
        | "CP"
      expense_category:
        | "food"
        | "alcohol"
        | "taxi"
        | "hotel"
        | "flight"
        | "other"
        | "pos_comp"
        | "bar_charge"
      history_horizon: "today" | "7d" | "30d" | "all"
      kyc_review_source: "reception" | "club" | "club_app"
      kyc_review_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "revoked"
        | "trusted_bypass"
      log_category:
        | "transaction"
        | "edit"
        | "lock"
        | "expense"
        | "player"
        | "system"
        | "breaklist"
        | "pit"
      office_expense_category:
        | "salary"
        | "bonus"
        | "fuel"
        | "transport"
        | "repairs"
        | "internet_it"
        | "security_expense"
        | "cleaning"
        | "rent"
        | "utilities"
        | "office"
        | "gaming_tax"
        | "fixed_tax"
        | "license"
        | "visa"
        | "machines"
        | "parts"
        | "debts"
        | "adjustments"
        | "other_office"
      player_category: "casino" | "diamond" | "platinum" | "gold" | "normal"
      player_crm_segment: "vip" | "regular" | "new" | "dormant" | "custom"
      player_status: "active" | "blacklist" | "merged"
      player_type: "slots" | "table" | "mix"
      player_verification_status: "unverified" | "verified" | "rejected"
      pos_order_status: "pending" | "preparing" | "ready" | "served" | "void"
      pos_payment_mode: "cash" | "card" | "comp_player" | "comp_house"
      promo_campaign_scope:
        | "reception_verify"
        | "club_verify"
        | "code"
        | "manual"
      promo_campaign_status: "planned" | "active" | "completed" | "cancelled"
      promo_campaign_type:
        | "event"
        | "bonus"
        | "advertising"
        | "sponsorship"
        | "other"
      promo_funding_source: "house" | "am_budget" | "campaign_budget"
      promo_grant_lifetime_mode:
        | "lifetime"
        | "days_after_redeem"
        | "fixed_business_date"
      promo_grant_source:
        | "verification_bonus"
        | "manual_am"
        | "cashback"
        | "campaign"
        | "code_redeem"
        | "reversal"
        | "expiry_writeoff"
      promo_grant_status: "active" | "exhausted" | "expired" | "reversed"
      shift_type: "M" | "N" | "A" | "S" | "E" | "L" | "EM" | "EN"
      staff_department:
        | "security"
        | "cashier"
        | "bartender"
        | "hostess"
        | "waiter"
        | "cleaner"
        | "it"
        | "hr"
        | "driver"
        | "reception"
      table_status: "open" | "closed"
      transaction_type:
        | "buy"
        | "cashout"
        | "in"
        | "out"
        | "tips_live"
        | "tips_poker"
        | "tips_floor"
      wallet_tx_type:
        | "transfer"
        | "allocate_reserve"
        | "use_reserve"
        | "manual_expense"
        | "daily_result"
        | "initial_balance"
        | "collection"
        | "adjustment"
        | "external_income"
        | "pos_deposit"
      wallet_type:
        | "main_cash"
        | "office_safe"
        | "rent_reserve"
        | "license_reserve"
        | "tax_reserve"
        | "other_reserve"
        | "cage_slot"
        | "cage_table"
        | "mobile_money"
        | "bank_account"
        | "bar_cash"
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
    Enums: {
      app_role: [
        "cashier",
        "pit",
        "manager",
        "reception",
        "finance_manager",
        "surveillance",
        "super_admin",
        "hr",
        "shift_manager",
        "cashier_slots",
        "pos_waiter",
        "pos_bartender",
        "pos_manager",
        "account_manager",
      ],
      cage_slots_comment_type: [
        "cashier_note",
        "manager_comment",
        "reversal_reason",
      ],
      cage_slots_count_type: ["opening", "check", "closing"],
      cage_slots_inventory_type: ["opening", "closing"],
      cage_slots_shift_type: ["day", "night"],
      cage_slots_status: [
        "draft",
        "open",
        "ready_for_review",
        "approved",
        "closed",
        "reversed",
      ],
      card_type: ["manual", "rfid"],
      casino_server_role: ["primary", "replica"],
      day_horizon: ["today", "7d", "30d", "all"],
      dealer_category: ["trainee", "dealer", "inspector", "expert", "pit_boss"],
      dealer_role: [
        "BJ",
        "BJi",
        "AR1",
        "AR1i",
        "AR1c",
        "BR",
        "P",
        "Pi",
        "AR",
        "ARi",
        "ARc",
        "S",
        "TR",
        "SRT",
        "CLS",
        "LT",
        "CLR",
        "CP",
      ],
      expense_category: [
        "food",
        "alcohol",
        "taxi",
        "hotel",
        "flight",
        "other",
        "pos_comp",
        "bar_charge",
      ],
      history_horizon: ["today", "7d", "30d", "all"],
      kyc_review_source: ["reception", "club", "club_app"],
      kyc_review_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "revoked",
        "trusted_bypass",
      ],
      log_category: [
        "transaction",
        "edit",
        "lock",
        "expense",
        "player",
        "system",
        "breaklist",
        "pit",
      ],
      office_expense_category: [
        "salary",
        "bonus",
        "fuel",
        "transport",
        "repairs",
        "internet_it",
        "security_expense",
        "cleaning",
        "rent",
        "utilities",
        "office",
        "gaming_tax",
        "fixed_tax",
        "license",
        "visa",
        "machines",
        "parts",
        "debts",
        "adjustments",
        "other_office",
      ],
      player_category: ["casino", "diamond", "platinum", "gold", "normal"],
      player_crm_segment: ["vip", "regular", "new", "dormant", "custom"],
      player_status: ["active", "blacklist", "merged"],
      player_type: ["slots", "table", "mix"],
      player_verification_status: ["unverified", "verified", "rejected"],
      pos_order_status: ["pending", "preparing", "ready", "served", "void"],
      pos_payment_mode: ["cash", "card", "comp_player", "comp_house"],
      promo_campaign_scope: [
        "reception_verify",
        "club_verify",
        "code",
        "manual",
      ],
      promo_campaign_status: ["planned", "active", "completed", "cancelled"],
      promo_campaign_type: [
        "event",
        "bonus",
        "advertising",
        "sponsorship",
        "other",
      ],
      promo_funding_source: ["house", "am_budget", "campaign_budget"],
      promo_grant_lifetime_mode: [
        "lifetime",
        "days_after_redeem",
        "fixed_business_date",
      ],
      promo_grant_source: [
        "verification_bonus",
        "manual_am",
        "cashback",
        "campaign",
        "code_redeem",
        "reversal",
        "expiry_writeoff",
      ],
      promo_grant_status: ["active", "exhausted", "expired", "reversed"],
      shift_type: ["M", "N", "A", "S", "E", "L", "EM", "EN"],
      staff_department: [
        "security",
        "cashier",
        "bartender",
        "hostess",
        "waiter",
        "cleaner",
        "it",
        "hr",
        "driver",
        "reception",
      ],
      table_status: ["open", "closed"],
      transaction_type: [
        "buy",
        "cashout",
        "in",
        "out",
        "tips_live",
        "tips_poker",
        "tips_floor",
      ],
      wallet_tx_type: [
        "transfer",
        "allocate_reserve",
        "use_reserve",
        "manual_expense",
        "daily_result",
        "initial_balance",
        "collection",
        "adjustment",
        "external_income",
        "pos_deposit",
      ],
      wallet_type: [
        "main_cash",
        "office_safe",
        "rent_reserve",
        "license_reserve",
        "tax_reserve",
        "other_reserve",
        "cage_slot",
        "cage_table",
        "mobile_money",
        "bank_account",
        "bar_cash",
      ],
    },
  },
} as const
