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
  public: {
    Tables: {
      ai_jobs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json | null
          kind: Database["public"]["Enums"]["ai_job_kind"]
          output: Json | null
          status: Database["public"]["Enums"]["ai_job_status"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          kind: Database["public"]["Enums"]["ai_job_kind"]
          output?: Json | null
          status?: Database["public"]["Enums"]["ai_job_status"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          kind?: Database["public"]["Enums"]["ai_job_kind"]
          output?: Json | null
          status?: Database["public"]["Enums"]["ai_job_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_leads: {
        Row: {
          added_at: string
          campaign_id: string
          current_step_position: number
          id: string
          lead_id: string
          state: Database["public"]["Enums"]["campaign_lead_state"]
          workspace_id: string
        }
        Insert: {
          added_at?: string
          campaign_id: string
          current_step_position?: number
          id?: string
          lead_id: string
          state?: Database["public"]["Enums"]["campaign_lead_state"]
          workspace_id: string
        }
        Update: {
          added_at?: string
          campaign_id?: string
          current_step_position?: number
          id?: string
          lead_id?: string
          state?: Database["public"]["Enums"]["campaign_lead_state"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          default_tone: Database["public"]["Enums"]["message_tone"]
          goal: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_tone?: Database["public"]["Enums"]["message_tone"]
          goal?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_tone?: Database["public"]["Enums"]["message_tone"]
          goal?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          lead_id: string
          workspace_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          lead_id: string
          workspace_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          lead_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          enrichment: Json | null
          enrichment_summary: string | null
          first_name: string | null
          full_name: string
          id: string
          last_name: string | null
          linkedin_url: string | null
          location: string | null
          status: Database["public"]["Enums"]["lead_status"]
          tags: string[]
          title: string | null
          updated_at: string
          website: string | null
          workspace_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          enrichment?: Json | null
          enrichment_summary?: string | null
          first_name?: string | null
          full_name: string
          id?: string
          last_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tags?: string[]
          title?: string | null
          updated_at?: string
          website?: string | null
          workspace_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          enrichment?: Json | null
          enrichment_summary?: string | null
          first_name?: string | null
          full_name?: string
          id?: string
          last_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tags?: string[]
          title?: string | null
          updated_at?: string
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_events: {
        Row: {
          id: string
          message_id: string
          occurred_at: string
          payload: Json | null
          type: Database["public"]["Enums"]["event_type"]
          workspace_id: string
        }
        Insert: {
          id?: string
          message_id: string
          occurred_at?: string
          payload?: Json | null
          type: Database["public"]["Enums"]["event_type"]
          workspace_id: string
        }
        Update: {
          id?: string
          message_id?: string
          occurred_at?: string
          payload?: Json | null
          type?: Database["public"]["Enums"]["event_type"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ai_confidence: number | null
          ai_reasoning: string[]
          body: string | null
          campaign_id: string
          campaign_lead_id: string
          channel: Database["public"]["Enums"]["step_channel"]
          created_at: string
          id: string
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["message_status"]
          step_id: string
          subject: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_reasoning?: string[]
          body?: string | null
          campaign_id: string
          campaign_lead_id: string
          channel: Database["public"]["Enums"]["step_channel"]
          created_at?: string
          id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          step_id: string
          subject?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_confidence?: number | null
          ai_reasoning?: string[]
          body?: string | null
          campaign_id?: string
          campaign_lead_id?: string
          channel?: Database["public"]["Enums"]["step_channel"]
          created_at?: string
          id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          step_id?: string
          subject?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_campaign_lead_id_fkey"
            columns: ["campaign_lead_id"]
            isOneToOne: false
            referencedRelation: "campaign_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "sequence_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_steps: {
        Row: {
          body_template: string | null
          campaign_id: string
          channel: Database["public"]["Enums"]["step_channel"]
          created_at: string
          id: string
          position: number
          subject_template: string | null
          tone: Database["public"]["Enums"]["message_tone"] | null
          updated_at: string
          wait_days: number
          workspace_id: string
        }
        Insert: {
          body_template?: string | null
          campaign_id: string
          channel?: Database["public"]["Enums"]["step_channel"]
          created_at?: string
          id?: string
          position: number
          subject_template?: string | null
          tone?: Database["public"]["Enums"]["message_tone"] | null
          updated_at?: string
          wait_days?: number
          workspace_id: string
        }
        Update: {
          body_template?: string | null
          campaign_id?: string
          channel?: Database["public"]["Enums"]["step_channel"]
          created_at?: string
          id?: string
          position?: number
          subject_template?: string | null
          tone?: Database["public"]["Enums"]["message_tone"] | null
          updated_at?: string
          wait_days?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          auto_approve_threshold: number
          created_at: string
          daily_send_cap: number
          default_tone: Database["public"]["Enums"]["message_tone"]
          id: string
          name: string
          send_window_end: string
          send_window_start: string
          sender_email: string | null
          sender_name: string | null
          updated_at: string
        }
        Insert: {
          auto_approve_threshold?: number
          created_at?: string
          daily_send_cap?: number
          default_tone?: Database["public"]["Enums"]["message_tone"]
          id?: string
          name: string
          send_window_end?: string
          send_window_start?: string
          sender_email?: string | null
          sender_name?: string | null
          updated_at?: string
        }
        Update: {
          auto_approve_threshold?: number
          created_at?: string
          daily_send_cap?: number
          default_tone?: Database["public"]["Enums"]["message_tone"]
          id?: string
          name?: string
          send_window_end?: string
          send_window_start?: string
          sender_email?: string | null
          sender_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_workspace: { Args: never; Returns: string }
      has_workspace_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      ai_job_kind: "enrich" | "generate"
      ai_job_status: "pending" | "running" | "done" | "failed"
      app_role: "owner" | "member"
      campaign_lead_state:
        | "queued"
        | "in_progress"
        | "replied"
        | "bounced"
        | "unsubscribed"
        | "completed"
      campaign_status: "draft" | "active" | "paused" | "completed"
      event_type: "open" | "click" | "reply" | "bounce" | "unsubscribe" | "sent"
      lead_status: "new" | "enriching" | "enriched" | "failed" | "unsubscribed"
      message_status:
        | "pending_approval"
        | "approved"
        | "scheduled"
        | "sent"
        | "failed"
        | "replied"
        | "skipped"
      message_tone:
        | "professional"
        | "founder"
        | "recruiter"
        | "casual"
        | "sales"
        | "enterprise"
      step_channel: "email" | "linkedin" | "manual"
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
      ai_job_kind: ["enrich", "generate"],
      ai_job_status: ["pending", "running", "done", "failed"],
      app_role: ["owner", "member"],
      campaign_lead_state: [
        "queued",
        "in_progress",
        "replied",
        "bounced",
        "unsubscribed",
        "completed",
      ],
      campaign_status: ["draft", "active", "paused", "completed"],
      event_type: ["open", "click", "reply", "bounce", "unsubscribe", "sent"],
      lead_status: ["new", "enriching", "enriched", "failed", "unsubscribed"],
      message_status: [
        "pending_approval",
        "approved",
        "scheduled",
        "sent",
        "failed",
        "replied",
        "skipped",
      ],
      message_tone: [
        "professional",
        "founder",
        "recruiter",
        "casual",
        "sales",
        "enterprise",
      ],
      step_channel: ["email", "linkedin", "manual"],
    },
  },
} as const
