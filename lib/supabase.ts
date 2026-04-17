import { createClient } from "@supabase/supabase-js";

// ─── Database type definitions ───────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      members: {
        Row: {
          id: string;
          display_name: string;
          password_hash: string;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          password_hash: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          password_hash?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      workout_completions: {
        Row: {
          id: string;
          member_id: string;
          week_start: string;
          day_index: number;
          photo_path: string | null;
          transferred: boolean;
          workout_type: string | null;
          received_from_member_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          member_id: string;
          week_start: string;
          day_index: number;
          photo_path?: string | null;
          transferred?: boolean;
          workout_type?: string | null;
          received_from_member_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          member_id?: string;
          week_start?: string;
          day_index?: number;
          photo_path?: string | null;
          transferred?: boolean;
          workout_type?: string | null;
          received_from_member_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_completions_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_snapshots: {
        Row: {
          week_start: string;
          member_id: string;
          completion_count: number;
          met_goal: boolean;
          computed_at: string;
        };
        Insert: {
          week_start: string;
          member_id: string;
          completion_count: number;
          met_goal: boolean;
          computed_at?: string;
        };
        Update: {
          week_start?: string;
          member_id?: string;
          completion_count?: number;
          met_goal?: boolean;
          computed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_snapshots_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          member_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
        };
        Insert: {
          id: string;
          member_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          member_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      reactions: {
        Row: {
          id: string;
          from_member_id: string;
          to_member_id: string;
          week_start: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          id: string;
          from_member_id: string;
          to_member_id: string;
          week_start: string;
          emoji: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          from_member_id?: string;
          to_member_id?: string;
          week_start?: string;
          emoji?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reactions_from_member_id_fkey";
            columns: ["from_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reactions_to_member_id_fkey";
            columns: ["to_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          id: string;
          member_id: string;
          member_name: string;
          type: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id: string;
          member_id: string;
          member_name: string;
          type?: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          member_id?: string;
          member_name?: string;
          type?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_transfers: {
        Row: {
          id: string;
          from_member_id: string;
          to_member_id: string;
          week_start: string;
          created_at: string;
        };
        Insert: {
          id: string;
          from_member_id: string;
          to_member_id: string;
          week_start: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          from_member_id?: string;
          to_member_id?: string;
          week_start?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_transfers_from_member_id_fkey";
            columns: ["from_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_transfers_to_member_id_fkey";
            columns: ["to_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// ─── Client singleton ─────────────────────────────────────────────────────────

let _client: ReturnType<typeof createClient<Database>> | null = null;

/** 서버 전용 Supabase 클라이언트 (Service Role Key → RLS 우회) */
export function getSupabase() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.");
  }
  _client = createClient<Database>(url, key, { auth: { persistSession: false } });
  return _client;
}

/** Supabase 유니크 제약 위반 오류 확인 */
export function isUniqueError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: string }).code === "23505";
}

/** Supabase Storage 공개 URL 생성 */
export function storagePublicUrl(path: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${url}/storage/v1/object/public/workout-photos/${path}`;
}
