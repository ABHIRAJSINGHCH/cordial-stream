// Shared domain types — client-safe.
export type Channel = "email" | "linkedin" | "manual";
export type Tone = "professional" | "founder" | "recruiter" | "casual" | "sales" | "enterprise";
export type CampaignStatus = "draft" | "active" | "paused" | "completed";
export type LeadStatus = "new" | "enriching" | "enriched" | "failed" | "unsubscribed";
export type MessageStatus =
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "sent"
  | "failed"
  | "replied"
  | "skipped";

export interface LeadEnrichment {
  company_summary?: string;
  industry?: string;
  company_size?: string;
  recent_activity?: string[];
  hiring_signals?: string[];
  tech_stack?: string[];
  pain_points?: string[];
  outreach_angles?: string[];
  confidence?: number;
}

export interface GeneratedMessage {
  subject: string;
  body: string;
  reasoning: string[];
  confidence: number;
}
