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

export type DatabaseCompanyStatus =
  | "pending"
  | "active"
  | "suspended"
  | "rejected"
  | "archived";

export type DatabaseCompanyMemberRole =
  | "owner"
  | "manager"
  | "dispatcher"
  | "technician";

export type DatabaseCompanyMemberStatus =
  | "invited"
  | "active"
  | "inactive"
  | "removed"
  | "suspended";

export type DatabaseTechnicianStatus =
  | "draft"
  | "pending_verification"
  | "verified"
  | "rejected"
  | "suspended"
  | "archived";

export type DatabaseTechnicianAffiliationType =
  | "independent"
  | "company_pending"
  | "company_member";

export type DatabaseOnboardingStatus =
  | "not_started"
  | "profile_required"
  | "profile_started"
  | "customer_ready"
  | "technician_profile_required"
  | "technician_profile_started"
  | "technician_verification_pending"
  | "company_required"
  | "company_pending_review"
  | "company_ready"
  | "complete";

export type DatabaseServiceRequestStatus =
  | "new"
  | "contacted"
  | "scheduled"
  | "completed"
  | "canceled"
  | "reviewed"
  | "lead_created"
  | "archived"
  | "spam";

export type DatabaseServiceRequestNoteType =
  | "internal_note"
  | "diagnostic"
  | "dispatcher_note"
  | "parts_note"
  | "status_change"
  | "estimate";

export type DatabaseServiceRequestPhotoType =
  | "customer_upload"
  | "technician_upload"
  | "diagnostic"
  | "completed_repair";

export type DatabaseEstimateStatus =
  | "draft"
  | "sent"
  | "approved"
  | "declined"
  | "canceled";

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
          onboarding_status: DatabaseOnboardingStatus | null;
          onboarding_completed_at: string | null;
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
          onboarding_status?: DatabaseOnboardingStatus | null;
          onboarding_completed_at?: string | null;
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
          onboarding_status?: DatabaseOnboardingStatus | null;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          owner_profile_id: string;
          name: string;
          slug: string;
          primary_city: string | null;
          primary_state: string | null;
          business_phone: string | null;
          business_email: string | null;
          website_url: string | null;
          status: DatabaseCompanyStatus;
          onboarding_status: string;
          created_by_profile_id: string | null;
          reviewed_by_profile_id: string | null;
          archived_by_profile_id: string | null;
          reviewed_at: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["companies"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["companies"]["Row"]>;
        Relationships: [];
      };
      company_members: {
        Row: {
          id: string;
          company_id: string;
          profile_id: string;
          member_role: DatabaseCompanyMemberRole;
          member_status: DatabaseCompanyMemberStatus;
          invited_by_profile_id: string | null;
          removed_by_profile_id: string | null;
          archived_by_profile_id: string | null;
          invited_at: string | null;
          joined_at: string | null;
          removed_at: string | null;
          suspended_at: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          notes?: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["company_members"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["company_members"]["Row"]>;
        Relationships: [];
      };
      pricing_catalog_items: {
        Row: {
          id: string;
          appliance_type: string;
          category: string;
          title: string;
          description: string | null;
          default_labor_price: number;
          customer_price: number | null;
          technician_cost: number | null;
          taxable: boolean | null;
          default_warranty_text: string | null;
          default_disclaimer_text: string | null;
          sort_order: number | null;
          estimated_duration_minutes: number | null;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["pricing_catalog_items"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["pricing_catalog_items"]["Row"]>;
        Relationships: [];
      };
      service_request_estimate_items: {
        Row: {
          id: string;
          estimate_id: string;
          pricing_catalog_item_id: string | null;
          item_title: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          technician_cost: number | null;
          taxable: boolean | null;
          warranty_text: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["service_request_estimate_items"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["service_request_estimate_items"]["Row"]>;
        Relationships: [];
      };
      service_request_estimates: {
        Row: {
          id: string;
          service_request_id: string;
          created_by_profile_id: string | null;
          subtotal: number;
          tax: number | null;
          total: number;
          estimate_status: DatabaseEstimateStatus;
          estimate_number: string | null;
          customer_preview_notes: string | null;
          warranty_text: string | null;
          disclaimer_text: string | null;
          created_at: string;
          updated_at: string;
          service_request_estimate_items?: Database["public"]["Tables"]["service_request_estimate_items"]["Row"][];
        };
        Insert: Partial<Database["public"]["Tables"]["service_request_estimates"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["service_request_estimates"]["Row"]>;
        Relationships: [];
      };
      service_request_notes: {
        Row: {
          id: string;
          service_request_id: string;
          created_by_profile_id: string | null;
          note_type: DatabaseServiceRequestNoteType;
          body: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["service_request_notes"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["service_request_notes"]["Row"]>;
        Relationships: [];
      };
      service_request_photos: {
        Row: {
          id: string;
          service_request_id: string;
          uploaded_by_profile_id: string | null;
          storage_path: string;
          original_filename: string | null;
          photo_type: DatabaseServiceRequestPhotoType;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["service_request_photos"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["service_request_photos"]["Row"]>;
        Relationships: [];
      };
      service_requests: {
        Row: {
          id: string;
          customer_name: string;
          customer_email: string | null;
          customer_phone: string | null;
          appliance_type: string;
          appliance_brand: string | null;
          appliance_model: string | null;
          issue_description: string;
          zip_code: string;
          city: string | null;
          state: string;
          preferred_time_window: string | null;
          selected_technician_slug: string | null;
          selected_technician_business_name: string | null;
          request_source: string;
          status: DatabaseServiceRequestStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["service_requests"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["service_requests"]["Row"]>;
        Relationships: [];
      };
      technician_profiles: {
        Row: {
          id: string;
          profile_id: string;
          company_id: string | null;
          affiliation_type: DatabaseTechnicianAffiliationType;
          display_name: string | null;
          business_name: string | null;
          years_experience: number | null;
          service_summary_public: string | null;
          bio_private: string | null;
          primary_city: string | null;
          primary_state: string | null;
          service_zip_codes: string[];
          specialties: string[];
          languages: string[];
          technician_status: DatabaseTechnicianStatus;
          marketplace_enabled: boolean;
          public_profile_ready: boolean;
          verification_submitted_at: string | null;
          verified_at: string | null;
          verified_by_profile_id: string | null;
          rejected_at: string | null;
          suspended_at: string | null;
          archived_by_profile_id: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["technician_profiles"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["technician_profiles"]["Row"]>;
        Relationships: [];
      };
    };
    Views: {
      public_technician_profiles: {
        Row: {
          slug: string;
          display_name: string | null;
          business_name: string | null;
          primary_city: string | null;
          primary_state: string | null;
          service_summary_public: string | null;
          specialties: string[] | null;
          languages: string[] | null;
          years_experience: number | null;
          service_zip_codes: string[] | null;
          technician_status: "verified";
          public_profile_ready: boolean;
          marketplace_enabled: boolean;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      add_service_request_note_rpc: {
        Args: {
          p_request_id: string;
          p_note_type: string;
          p_body: string;
        };
        Returns: Json;
      };
      add_service_request_photo_rpc: {
        Args: {
          p_request_id: string;
          p_storage_path: string;
          p_original_filename: string | null;
          p_photo_type: string;
        };
        Returns: Json;
      };
      complete_onboarding_rpc: {
        Args: Record<string, never>;
        Returns: Json;
      };
      create_company_and_owner_membership_rpc: {
        Args: {
          p_business_email: string | null;
          p_business_phone: string | null;
          p_company_name: string;
          p_primary_city: string | null;
          p_primary_state: string | null;
          p_slug: string;
          p_website_url: string | null;
        };
        Returns: Json;
      };
      create_service_request_estimate_rpc: {
        Args: {
          p_request_id: string;
          p_catalog_items?: Json;
          p_custom_items?: Json;
        };
        Returns: Json;
      };
      current_app_role: {
        Args: Record<string, never>;
        Returns: DatabaseAppRole;
      };
      update_service_request_status_rpc: {
        Args: {
          p_request_id: string;
          p_next_status: string;
        };
        Returns: Json;
      };
      upsert_own_technician_profile_rpc: {
        Args: {
          p_bio_private?: string | null;
          p_business_name?: string | null;
          p_display_name?: string | null;
          p_languages?: string[] | null;
          p_primary_city?: string | null;
          p_primary_state?: string | null;
          p_service_summary_public?: string | null;
          p_service_zip_codes?: string[] | null;
          p_specialties?: string[] | null;
          p_years_experience?: number | null;
        };
        Returns: Json;
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
export type CompanyRow = PublicSchema["Tables"]["companies"]["Row"];
export type CompanyMemberRow =
  PublicSchema["Tables"]["company_members"]["Row"];
export type PricingCatalogItemRow =
  PublicSchema["Tables"]["pricing_catalog_items"]["Row"];
export type ProfileRow = PublicSchema["Tables"]["profiles"]["Row"];
export type ProfileInsert = PublicSchema["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = PublicSchema["Tables"]["profiles"]["Update"];
export type PublicTechnicianProfileRow =
  PublicSchema["Views"]["public_technician_profiles"]["Row"];
export type ServiceRequestEstimateItemRow =
  PublicSchema["Tables"]["service_request_estimate_items"]["Row"];
export type ServiceRequestEstimateRow =
  PublicSchema["Tables"]["service_request_estimates"]["Row"];
export type ServiceRequestNoteRow =
  PublicSchema["Tables"]["service_request_notes"]["Row"];
export type ServiceRequestPhotoRow =
  PublicSchema["Tables"]["service_request_photos"]["Row"];
export type ServiceRequestRow =
  PublicSchema["Tables"]["service_requests"]["Row"];
export type TechnicianProfileRow =
  PublicSchema["Tables"]["technician_profiles"]["Row"];
