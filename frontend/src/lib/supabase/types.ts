export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type DatabaseAppRole =
  | "public_visitor"
  | "customer"
  | "technician"
  | "verified_technician"
  | "expert_technician"
  | "company_owner"
  | "admin";

export type DatabaseProfileStatus =
  | "pending"
  | "active"
  | "verified"
  | "rejected"
  | "suspended";

export type DatabaseRoleIntent = "customer" | "technician";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          role: DatabaseAppRole;
          status: DatabaseProfileStatus;
          role_intent: DatabaseRoleIntent | null;
          company_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          role?: DatabaseAppRole;
          status?: DatabaseProfileStatus;
          role_intent?: DatabaseRoleIntent | null;
          company_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          role?: DatabaseAppRole;
          status?: DatabaseProfileStatus;
          role_intent?: DatabaseRoleIntent | null;
          company_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_app_role: {
        Args: Record<string, never>;
        Returns: DatabaseAppRole;
      };
    };
    Enums: {
      app_role: DatabaseAppRole;
      profile_status: DatabaseProfileStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type PublicSchema = Database["public"];
export type ProfileRow = PublicSchema["Tables"]["profiles"]["Row"];
export type ProfileInsert = PublicSchema["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = PublicSchema["Tables"]["profiles"]["Update"];
