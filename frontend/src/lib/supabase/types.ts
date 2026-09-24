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
  | "diagnosed"
  | "estimate_sent"
  | "estimate_approved"
  | "parts_needed"
  | "parts_ordered"
  | "parts_received"
  | "return_visit_scheduled"
  | "completed"
  | "closed"
  | "waiting_customer"
  | "canceled"
  | "estimate_declined"
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
  | "presented"
  | "approved"
  | "declined"
  | "converted_to_invoice"
  | "void";

export type DatabaseInvoiceStatus = "draft" | "sent" | "paid" | "void";

export type DatabaseCustomerStatus = "active" | "inactive" | "blocked";

export type DatabaseCustomerContactMethod = "phone" | "email" | "sms";

export type DatabaseDispatcherOrchestratorStatus =
  | "success"
  | "partial"
  | "no_availability"
  | "validation_failed";

export type DatabaseAppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "en_route"
  | "completed"
  | "canceled"
  | "no_show";

export type DatabaseAppointmentSource =
  | "dispatcher"
  | "manual"
  | "ai_dispatcher";

export type DatabaseCalendarSyncStatus =
  | "not_configured"
  | "pending"
  | "synced"
  | "failed"
  | "canceled";

export type DatabaseIntakeSourceType =
  | "phone"
  | "sms"
  | "website_form"
  | "email"
  | "yelp"
  | "google"
  | "retell_ai"
  | "manual"
  | "other";

export type DatabaseIntakeStatus =
  | "new"
  | "reviewed"
  | "needs_info"
  | "customer_matched"
  | "ready_to_convert"
  | "converted"
  | "dismissed"
  | "archived";

export type DatabaseCommunicationSourceType =
  | "phone"
  | "sms"
  | "website_form"
  | "email"
  | "yelp"
  | "google_business_messages"
  | "facebook_messenger"
  | "whatsapp"
  | "manual"
  | "other";

export type DatabaseInboundSourceChannel =
  | "phone"
  | "sms"
  | "website_form"
  | "booking_widget"
  | "lead_generator"
  | "email"
  | "social"
  | "manual"
  | "other";

export type DatabaseCommunicationConversationStatus =
  | "open"
  | "needs_action"
  | "linked"
  | "resolved"
  | "archived";

export type DatabaseCommunicationDirection =
  | "inbound"
  | "outbound"
  | "internal";

export type DatabaseCommunicationSenderRole =
  | "customer"
  | "dispatcher"
  | "technician"
  | "system";

export type DatabaseCommunicationTimelineEventType =
  | "incoming_call"
  | "incoming_sms"
  | "website_request"
  | "incoming_email"
  | "customer_replied"
  | "appointment_scheduled"
  | "appointment_changed"
  | "estimate_sent"
  | "estimate_approved"
  | "invoice_sent"
  | "payment_received"
  | "repair_completed"
  | "customer_canceled"
  | "note_added";

export type Database = {
  public: {
    Tables: {
      appointments: {
        Row: {
          id: string;
          company_id: string | null;
          service_request_id: string;
          technician_profile_id: string;
          appointment_date: string;
          window_start_time: string;
          window_end_time: string;
          status: DatabaseAppointmentStatus;
          source: DatabaseAppointmentSource;
          dispatcher_snapshot_id: string | null;
          external_calendar_provider: string | null;
          external_calendar_event_id: string | null;
          external_calendar_status: DatabaseCalendarSyncStatus;
          external_calendar_last_synced_at: string | null;
          external_calendar_error: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          service_requests?: Database["public"]["Tables"]["service_requests"]["Row"] | null;
          technician_profiles?: Database["public"]["Tables"]["technician_profiles"]["Row"] | null;
        };
        Insert: Partial<Database["public"]["Tables"]["appointments"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["appointments"]["Row"]>;
        Relationships: [];
      };
      intake_requests: {
        Row: {
          id: string;
          company_id: string | null;
          owner_profile_id: string | null;
          source_type: DatabaseIntakeSourceType;
          source_name: string | null;
          source_identifier: string | null;
          customer_first_name: string | null;
          customer_last_name: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          customer_email: string | null;
          service_address: string | null;
          unit: string | null;
          city: string | null;
          state: string;
          zip_code: string | null;
          country: string;
          latitude: number | null;
          longitude: number | null;
          place_id: string | null;
          appliance_type: string | null;
          brand: string | null;
          model_number: string | null;
          serial_number: string | null;
          problem_description: string | null;
          preferred_appointment_window: string | null;
          appointment_date: string | null;
          window_start_time: string | null;
          window_end_time: string | null;
          raw_message: string | null;
          transcript: string | null;
          raw_payload: Json;
          extracted_data: Json;
          duplicate_candidate: Json;
          extraction_confidence: number | null;
          status: DatabaseIntakeStatus;
          linked_customer_id: string | null;
          linked_service_request_id: string | null;
          linked_appointment_id: string | null;
          assigned_technician_id: string | null;
          dismissal_reason: string | null;
          duplicate_confirmed_at: string | null;
          duplicate_confirmed_by: string | null;
          archived_at: string | null;
          archived_by: string | null;
          created_by: string | null;
          updated_by: string | null;
          converted_at: string | null;
          created_at: string;
          updated_at: string;
          inbound_source_id?: string | null;
          source_account_id?: string | null;
          provider_lead_id?: string | null;
          provider_event_id?: string | null;
          attribution?: Json;
        };
        Insert: Partial<Database["public"]["Tables"]["intake_requests"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["intake_requests"]["Row"]>;
        Relationships: [];
      };
      inbound_source_credentials: {
        Row: {
          id: string;
          inbound_source_id: string;
          public_key: string;
          secret_hash: string;
          secret_hash_algorithm: string;
          label: string | null;
          is_active: boolean;
          last_used_at: string | null;
          last_used_ip: string | null;
          created_at: string;
          created_by: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          revocation_reason: string | null;
          metadata: Json;
        };
        Insert: Partial<
          Database["public"]["Tables"]["inbound_source_credentials"]["Row"]
        >;
        Update: Partial<
          Database["public"]["Tables"]["inbound_source_credentials"]["Row"]
        >;
        Relationships: [];
      };
      inbound_sources: {
        Row: {
          id: string;
          company_id: string;
          source_key: string;
          channel: DatabaseInboundSourceChannel;
          source_name: string;
          provider_name: string | null;
          domain: string | null;
          allowed_domains: string[];
          campaign: string | null;
          default_service_type: string | null;
          communication_source_account_id: string | null;
          is_active: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["inbound_sources"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["inbound_sources"]["Row"]>;
        Relationships: [];
      };
      communication_conversations: {
        Row: {
          id: string;
          company_id: string | null;
          owner_profile_id: string | null;
          source_account_id: string | null;
          provider_name: string | null;
          external_conversation_id: string | null;
          primary_source_type: DatabaseCommunicationSourceType;
          status: DatabaseCommunicationConversationStatus;
          customer_id: string | null;
          intake_request_id: string | null;
          service_request_id: string | null;
          appointment_id: string | null;
          estimate_id: string | null;
          invoice_id: string | null;
          payment_reference: string | null;
          customer_display_name: string | null;
          customer_phone: string | null;
          customer_email: string | null;
          service_address: string | null;
          summary: string | null;
          next_action: string | null;
          last_event_at: string | null;
          call_status: string | null;
          call_started_at: string | null;
          call_ended_at: string | null;
          provider_metadata: Json;
          inbound_source_id?: string | null;
          attribution?: Json;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["communication_conversations"]["Row"]
        >;
        Update: Partial<
          Database["public"]["Tables"]["communication_conversations"]["Row"]
        >;
        Relationships: [];
      };
      communication_source_accounts: {
        Row: {
          id: string;
          company_id: string;
          source_type: DatabaseCommunicationSourceType;
          provider_name: "telnyx" | "retell" | "email" | "website" | "manual" | "other";
          source_identifier: string;
          display_name: string | null;
          is_active: boolean;
          supports_inbound_voice?: boolean;
          supports_outbound_voice?: boolean;
          supports_inbound_sms?: boolean;
          supports_outbound_sms?: boolean;
          is_default_outbound_voice?: boolean;
          is_default_outbound_sms?: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["communication_source_accounts"]["Row"]
        >;
        Update: Partial<
          Database["public"]["Tables"]["communication_source_accounts"]["Row"]
        >;
        Relationships: [];
      };
      communication_messages: {
        Row: {
          id: string;
          conversation_id: string;
          source_type: DatabaseCommunicationSourceType;
          direction: DatabaseCommunicationDirection;
          sender_role: DatabaseCommunicationSenderRole;
          sender_display_name: string | null;
          body: string | null;
          attachments: Json;
          external_message_id: string | null;
          transcript_id: string | null;
          occurred_at: string;
          created_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["communication_messages"]["Row"]
        >;
        Update: Partial<
          Database["public"]["Tables"]["communication_messages"]["Row"]
        >;
        Relationships: [];
      };
      communication_transcripts: {
        Row: {
          id: string;
          conversation_id: string;
          source_type: DatabaseCommunicationSourceType;
          transcript_text: string | null;
          speaker_segments: Json;
          recording_reference: string | null;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["communication_transcripts"]["Row"]
        >;
        Update: Partial<
          Database["public"]["Tables"]["communication_transcripts"]["Row"]
        >;
        Relationships: [];
      };
      communication_timeline_events: {
        Row: {
          id: string;
          conversation_id: string;
          event_type: DatabaseCommunicationTimelineEventType;
          title: string;
          body: string | null;
          event_time: string;
          intake_request_id: string | null;
          service_request_id: string | null;
          appointment_id: string | null;
          estimate_id: string | null;
          invoice_id: string | null;
          payment_reference: string | null;
          created_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["communication_timeline_events"]["Row"]
        >;
        Update: Partial<
          Database["public"]["Tables"]["communication_timeline_events"]["Row"]
        >;
        Relationships: [];
      };
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
          base_address_line1?: string | null;
          base_address_line2?: string | null;
          base_city?: string | null;
          base_state?: string | null;
          base_zip?: string | null;
          base_country?: string | null;
          base_formatted_address?: string | null;
          base_latitude?: number | null;
          base_longitude?: number | null;
          base_place_id?: string | null;
          base_address_updated_at?: string | null;
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
      customers: {
        Row: {
          id: string;
          company_id: string | null;
          created_at: string;
          updated_at: string;
          auth_user_id: string | null;
          first_name: string | null;
          last_name: string | null;
          full_name: string;
          phone: string | null;
          email: string | null;
          avatar_storage_path?: string | null;
          avatar_updated_at?: string | null;
          preferred_contact_method: DatabaseCustomerContactMethod | null;
          customer_status: DatabaseCustomerStatus;
          notes: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["customers"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["customers"]["Row"]>;
        Relationships: [];
      };
      customer_appliances: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          customer_id: string;
          company_id: string | null;
          customer_address_id: string | null;
          appliance_type: string;
          brand: string | null;
          model_number: string | null;
          serial_number: string | null;
          purchase_year: number | null;
          location_label: string | null;
          asset_status: "active" | "inactive" | "archived";
          cover_photo_id: string | null;
          identity_source: "manual" | "ai_attachment" | "qa_attachment";
          identity_source_photo_id: string | null;
          identity_confidence: number | null;
          identity_review_status:
            | "confirmed"
            | "needs_review"
            | "unreviewed"
            | "rejected";
          identity_raw_text: string | null;
          identity_extraction: Json;
          notes: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["customer_appliances"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["customer_appliances"]["Row"]>;
        Relationships: [];
      };
      customer_appliance_photos: {
        Row: {
          id: string;
          customer_id: string;
          company_id: string | null;
          customer_appliance_id: string | null;
          uploaded_by_profile_id: string | null;
          storage_path: string;
          original_filename: string | null;
          photo_type: "asset_label" | "asset_photo";
          processing_status:
            | "not_started"
            | "pending"
            | "processed"
            | "needs_review"
            | "no_asset"
            | "failed";
          processing_result: Json;
          processing_error: string | null;
          is_cover: boolean;
          processed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["customer_appliance_photos"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["customer_appliance_photos"]["Row"]>;
        Relationships: [];
      };
      customer_addresses: {
        Row: {
          id: string;
          customer_id: string;
          company_id: string | null;
          label: string;
          street_address: string | null;
          unit: string | null;
          city: string | null;
          state: string;
          zip_code: string | null;
          country: string;
          latitude: number | null;
          longitude: number | null;
          place_id: string | null;
          is_primary: boolean;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["customer_addresses"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["customer_addresses"]["Row"]>;
        Relationships: [];
      };
      customer_internal_notes: {
        Row: {
          id: string;
          customer_id: string;
          company_id: string | null;
          body: string;
          note_type: string;
          created_by: string | null;
          created_at: string;
          archived_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["customer_internal_notes"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["customer_internal_notes"]["Row"]>;
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
          service_category_id: string | null;
          repair_group_id: string | null;
          repair_item_id: string | null;
          default_labor_hours: number | null;
          internal_name: string | null;
          public_description: string | null;
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
          line_type: "labor" | "part" | "material" | "custom" | "warranty";
          internal_name: string | null;
          customer_name: string | null;
          public_description: string | null;
          internal_cost: number | null;
          sell_price: number | null;
          service_catalog_repair_item_id: string | null;
          estimate_template_line_id: string | null;
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
          discount_type: "flat" | "percent" | null;
          discount_value: number | null;
          discount_amount: number | null;
          tax_rate: number | null;
          taxable_amount: number | null;
          non_taxable_amount: number | null;
          tax: number | null;
          total: number;
          internal_cost_total: number | null;
          gross_profit: number | null;
          margin_percent: number | null;
          estimate_status: DatabaseEstimateStatus;
          estimate_number: string | null;
          customer_preview_notes: string | null;
          warranty_text: string | null;
          disclaimer_text: string | null;
          public_approval_token_hash: string | null;
          sent_at: string | null;
          customer_responded_at: string | null;
          approval_source: "customer" | "technician_manual";
          approved_by_profile_id: string | null;
          archived_at: string | null;
          archived_by_profile_id: string | null;
          archive_reason: string | null;
          created_at: string;
          updated_at: string;
          service_request_estimate_items?: Database["public"]["Tables"]["service_request_estimate_items"]["Row"][];
        };
        Insert: Partial<Database["public"]["Tables"]["service_request_estimates"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["service_request_estimates"]["Row"]>;
        Relationships: [];
      };
      estimate_learning_events: {
        Row: {
          id: string;
          company_id: string;
          service_request_id: string | null;
          estimate_id: string | null;
          created_by_profile_id: string | null;
          event_type:
            | "draft_generated"
            | "draft_saved"
            | "draft_updated"
            | "draft_sent"
            | "draft_archived"
            | "line_adjusted";
          diagnosis_text: string | null;
          repair_scope: Json;
          line_decisions: Json;
          totals: Json;
          decision_context: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["estimate_learning_events"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["estimate_learning_events"]["Row"]>;
        Relationships: [];
      };
      service_request_invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          source_estimate_item_id: string | null;
          item_title: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          notes: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["service_request_invoice_items"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["service_request_invoice_items"]["Row"]>;
        Relationships: [];
      };
      service_request_invoices: {
        Row: {
          id: string;
          service_request_id: string;
          estimate_id: string;
          created_by_profile_id: string | null;
          invoice_number: string;
          subtotal: number;
          tax: number | null;
          total: number;
          invoice_status: DatabaseInvoiceStatus;
          sent_at: string | null;
          paid_at: string | null;
          voided_at: string | null;
          created_at: string;
          updated_at: string;
          service_request_invoice_items?: Database["public"]["Tables"]["service_request_invoice_items"]["Row"][];
        };
        Insert: Partial<Database["public"]["Tables"]["service_request_invoices"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["service_request_invoices"]["Row"]>;
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
          asset_processing_status:
            | "not_started"
            | "pending"
            | "processed"
            | "needs_review"
            | "no_asset"
            | "failed";
          asset_processing_result: Json;
          asset_processing_error: string | null;
          linked_customer_appliance_id: string | null;
          processed_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["service_request_photos"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["service_request_photos"]["Row"]>;
        Relationships: [];
      };
      dispatcher_preview_snapshots: {
        Row: {
          id: string;
          company_id: string | null;
          service_request_id: string;
          normalized_zip: string | null;
          normalized_service_type: string | null;
          normalized_appliance: string | null;
          normalized_brand: string | null;
          normalized_issue: string | null;
          requested_window: string | null;
          requested_date: string | null;
          orchestrator_status: DatabaseDispatcherOrchestratorStatus;
          recommended_technician_profile_id: string | null;
          recommendation_summary: Json;
          backup_options_count: number;
          backup_options: Json;
          safe_customer_response_draft: string | null;
          validation_warnings: Json;
          validation_errors: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["dispatcher_preview_snapshots"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["dispatcher_preview_snapshots"]["Row"]>;
        Relationships: [];
      };
      service_requests: {
        Row: {
          id: string;
          company_id: string | null;
          customer_id: string | null;
          customer_appliance_id: string | null;
          customer_name: string;
          customer_email: string | null;
          customer_phone: string | null;
          appliance_type: string;
          appliance_brand: string | null;
          appliance_model: string | null;
          job_type_id?: string | null;
          job_name?: string | null;
          problem_type_id?: string | null;
          marketing_source_id?: string | null;
          issue_description: string;
          full_address: string | null;
          street_address: string | null;
          unit: string | null;
          zip_code: string;
          city: string | null;
          state: string;
          country: string;
          latitude: number | null;
          longitude: number | null;
          place_id: string | null;
          preferred_time_window: string | null;
          selected_technician_slug: string | null;
          selected_technician_business_name: string | null;
          assigned_technician_profile_id: string | null;
          appointment_id: string | null;
          scheduled_date: string | null;
          scheduled_window_start_time: string | null;
          scheduled_window_end_time: string | null;
          request_source: string;
          status: DatabaseServiceRequestStatus;
          job_client_avatar_storage_path?: string | null;
          job_client_avatar_updated_at?: string | null;
          inbound_source_id?: string | null;
          source_account_id?: string | null;
          attribution?: Json;
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
          base_address_line1?: string | null;
          base_address_line2?: string | null;
          base_city?: string | null;
          base_state?: string | null;
          base_zip?: string | null;
          base_country?: string | null;
          base_formatted_address?: string | null;
          base_latitude?: number | null;
          base_longitude?: number | null;
          base_place_id?: string | null;
          base_address_updated_at?: string | null;
          service_zip_codes: string[];
          service_cities: string[];
          appliance_categories: string[];
          brands_serviced: string[];
          specialties: string[];
          languages: string[];
          avatar_color: string;
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
      technician_availability_rules: {
        Row: {
          id: string;
          company_id: string | null;
          technician_profile_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          is_available: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["technician_availability_rules"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["technician_availability_rules"]["Row"]>;
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
          service_cities: string[] | null;
          appliance_categories: string[] | null;
          brands_serviced: string[] | null;
          technician_status: "verified";
          public_profile_ready: boolean;
          marketplace_enabled: boolean;
          avatar_color: string | null;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      can_access_communication_conversation: {
        Args: {
          target_conversation_id: string;
        };
        Returns: boolean;
      };
      create_communication_conversation_rpc: {
        Args: {
          p_payload: Json;
        };
        Returns: Json;
      };
      can_access_intake_request: {
        Args: {
          target_intake_request_id: string;
        };
        Returns: boolean;
      };
      create_intake_request_rpc: {
        Args: {
          p_payload: Json;
        };
        Returns: Json;
      };
      update_intake_request_rpc: {
        Args: {
          p_intake_request_id: string;
          p_payload: Json;
        };
        Returns: Json;
      };
      convert_intake_request_rpc: {
        Args: {
          p_intake_request_id: string;
          p_allow_possible_duplicate?: boolean;
        };
        Returns: Json;
      };
      book_service_request_appointment_rpc: {
        Args: {
          p_service_request_id: string;
          p_technician_profile_id: string;
          p_appointment_date: string;
          p_window_start_time: string;
          p_window_end_time: string;
          p_dispatcher_snapshot_id?: string | null;
          p_source?: DatabaseAppointmentSource;
        };
        Returns: Json;
      };
      create_customer_asset_booking_rpc: {
        Args: {
          p_customer_appliance_id: string;
          p_problem_description: string;
          p_preferred_contact_method: string | null;
          p_notes: string | null;
          p_service_zip_code: string;
          p_service_city: string | null;
          p_service_state: string | null;
          p_selected_technician_slug: string;
          p_appointment_date: string;
          p_window_start_time: string;
          p_window_end_time: string;
        };
        Returns: Json;
      };
      update_customer_repair_details_rpc: {
        Args: {
          p_service_request_id: string;
          p_problem_description: string;
          p_customer_notes?: string | null;
        };
        Returns: Database["public"]["Tables"]["service_requests"]["Row"];
      };
      get_public_technician_booking_windows_rpc: {
        Args: {
          p_technician_slug: string;
          p_requested_date?: string | null;
        };
        Returns: Json;
      };
      set_appointment_calendar_sync_rpc: {
        Args: {
          p_appointment_id: string;
          p_external_calendar_provider: string | null;
          p_external_calendar_event_id: string | null;
          p_external_calendar_status: DatabaseCalendarSyncStatus;
          p_external_calendar_error?: string | null;
        };
        Returns: Json;
      };
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
          p_adjustments?: Json;
        };
        Returns: Json;
      };
      create_invoice_from_estimate_rpc: {
        Args: {
          p_estimate_id: string;
        };
        Returns: Json;
      };
      create_service_request_with_customer_rpc: {
        Args: {
          p_customer_first_name: string;
          p_customer_last_name?: string | null;
          p_customer_phone?: string | null;
          p_customer_email?: string | null;
          p_appliance_type: string;
          p_appliance_brand?: string | null;
          p_appliance_model?: string | null;
          p_issue_description: string;
          p_zip_code: string;
          p_city?: string | null;
          p_state?: string;
          p_preferred_time_window?: string | null;
          p_selected_technician_slug?: string | null;
          p_selected_technician_business_name?: string | null;
          p_request_source?: string;
        };
        Returns: Json;
      };
      find_or_create_customer_for_request_rpc: {
        Args: {
          p_first_name: string;
          p_last_name?: string | null;
          p_phone?: string | null;
          p_email?: string | null;
        };
        Returns: string;
      };
      link_current_customer_account_rpc: {
        Args: {
          p_first_name: string;
          p_last_name?: string | null;
          p_phone?: string | null;
          p_email?: string | null;
        };
        Returns: Json;
      };
      upsert_dashboard_customer_rpc: {
        Args: {
          p_customer_id?: string | null;
          p_payload?: Json;
        };
        Returns: Json;
      };
      upsert_customer_address_rpc: {
        Args: {
          p_customer_id: string;
          p_address_id?: string | null;
          p_payload?: Json;
        };
        Returns: Json;
      };
      upsert_customer_appliance_rpc: {
        Args: {
          p_customer_id: string;
          p_appliance_id?: string | null;
          p_payload?: Json;
        };
        Returns: Json;
      };
      add_customer_internal_note_rpc: {
        Args: {
          p_customer_id: string;
          p_body: string;
          p_note_type?: string | null;
        };
        Returns: Json;
      };
      match_or_create_customer_for_intake_rpc: {
        Args: {
          p_intake_request_id?: string | null;
          p_payload?: Json;
        };
        Returns: Json;
      };
      can_view_customer: {
        Args: {
          target_customer_id: string;
        };
        Returns: boolean;
      };
      can_manage_customer_crm: {
        Args: {
          target_customer_id: string;
        };
        Returns: boolean;
      };
      can_view_customer_appliance: {
        Args: {
          target_customer_appliance_id: string;
        };
        Returns: boolean;
      };
      process_service_request_photo_asset_intelligence_rpc: {
        Args: {
          p_photo_id: string;
          p_identity?: Json | null;
        };
        Returns: Json;
      };
      set_customer_appliance_cover_photo_from_job_rpc: {
        Args: {
          p_photo_id: string;
        };
        Returns: Json;
      };
      latest_dispatcher_preview_snapshot_rpc: {
        Args: {
          p_service_request_id: string;
        };
        Returns: Json;
      };
      get_public_estimate_by_token_rpc: {
        Args: {
          p_token: string;
        };
        Returns: Json;
      };
      respond_to_public_estimate_rpc: {
        Args: {
          p_token: string;
          p_response: string;
        };
        Returns: Json;
      };
      approve_service_request_estimate_for_customer_rpc: {
        Args: {
          p_estimate_id: string;
        };
        Returns: Json;
      };
      send_service_request_estimate_to_customer_rpc: {
        Args: {
          p_estimate_id: string;
        };
        Returns: Json;
      };
      delete_draft_service_request_estimate_rpc: {
        Args: {
          p_estimate_id: string;
        };
        Returns: Json;
      };
      delete_safe_service_request_rpc: {
        Args: {
          p_service_request_id: string;
        };
        Returns: Json;
      };
      send_service_request_invoice_rpc: {
        Args: {
          p_invoice_id: string;
        };
        Returns: Json;
      };
      save_dispatcher_preview_snapshot_rpc: {
        Args: {
          p_service_request_id: string;
          p_normalized_zip: string | null;
          p_normalized_service_type: string | null;
          p_normalized_appliance: string | null;
          p_normalized_brand: string | null;
          p_normalized_issue: string | null;
          p_requested_window: string | null;
          p_requested_date: string | null;
          p_orchestrator_status: DatabaseDispatcherOrchestratorStatus;
          p_recommended_technician_profile_id: string | null;
          p_recommendation_summary: Json;
          p_backup_options_count: number;
          p_backup_options: Json;
          p_safe_customer_response_draft: string | null;
          p_validation_warnings: Json;
          p_validation_errors: Json;
        };
        Returns: Json;
      };
      mark_service_request_invoice_paid_rpc: {
        Args: {
          p_invoice_id: string;
        };
        Returns: Json;
      };
      current_app_role: {
        Args: Record<string, never>;
        Returns: DatabaseAppRole;
      };
      current_dashboard_company_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      update_service_request_status_rpc: {
        Args: {
          p_request_id: string;
          p_next_status: string;
        };
        Returns: Json;
      };
      update_service_request_address_rpc: {
        Args: {
          p_request_id: string;
          p_street_address: string | null;
          p_unit: string | null;
          p_city: string | null;
          p_state: string;
          p_zip_code: string;
          p_country?: string;
          p_latitude?: number | null;
          p_longitude?: number | null;
          p_place_id?: string | null;
        };
        Returns: Json;
      };
      update_service_request_estimate_draft_rpc: {
        Args: {
          p_estimate_id: string;
          p_catalog_items?: Json;
          p_custom_items?: Json;
          p_adjustments?: Json;
        };
        Returns: Json;
      };
      update_service_request_estimate_editor_metadata_rpc: {
        Args: {
          p_estimate_id: string;
          p_metadata?: Json;
        };
        Returns: Json;
      };
      record_estimate_learning_event_rpc: {
        Args: {
          p_request_id?: string | null;
          p_estimate_id?: string | null;
          p_event_type?: string;
          p_decision_context?: Json;
        };
        Returns: Json;
      };
      archive_service_request_estimate_draft_rpc: {
        Args: {
          p_estimate_id: string;
          p_archive_reason?: string | null;
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
          p_service_cities?: string[] | null;
          p_appliance_categories?: string[] | null;
          p_brands_serviced?: string[] | null;
          p_avatar_color?: string | null;
          p_marketplace_enabled?: boolean | null;
          p_base_address_line1?: string | null;
          p_base_address_line2?: string | null;
          p_base_city?: string | null;
          p_base_state?: string | null;
          p_base_zip?: string | null;
          p_base_country?: string | null;
          p_base_formatted_address?: string | null;
          p_base_latitude?: number | null;
          p_base_longitude?: number | null;
          p_base_place_id?: string | null;
        };
        Returns: Json;
      };
      update_company_base_address_rpc: {
        Args: {
          p_company_id: string;
          p_base_address_line1?: string | null;
          p_base_address_line2?: string | null;
          p_base_city?: string | null;
          p_base_state?: string | null;
          p_base_zip?: string | null;
          p_base_country?: string | null;
          p_base_formatted_address?: string | null;
          p_base_latitude?: number | null;
          p_base_longitude?: number | null;
          p_base_place_id?: string | null;
        };
        Returns: Json;
      };
      void_service_request_estimate_draft_rpc: {
        Args: {
          p_estimate_id: string;
        };
        Returns: Json;
      };
      void_service_request_invoice_rpc: {
        Args: {
          p_invoice_id: string;
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
export type AppointmentRow = PublicSchema["Tables"]["appointments"]["Row"];
export type CompanyRow = PublicSchema["Tables"]["companies"]["Row"];
export type CompanyMemberRow =
  PublicSchema["Tables"]["company_members"]["Row"];
export type CustomerRow = PublicSchema["Tables"]["customers"]["Row"];
export type CustomerApplianceRow =
  PublicSchema["Tables"]["customer_appliances"]["Row"];
export type CustomerAddressRow =
  PublicSchema["Tables"]["customer_addresses"]["Row"];
export type CustomerInternalNoteRow =
  PublicSchema["Tables"]["customer_internal_notes"]["Row"];
export type IntakeRequestRow =
  PublicSchema["Tables"]["intake_requests"]["Row"];
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
export type ServiceRequestInvoiceItemRow =
  PublicSchema["Tables"]["service_request_invoice_items"]["Row"];
export type ServiceRequestInvoiceRow =
  PublicSchema["Tables"]["service_request_invoices"]["Row"];
export type ServiceRequestNoteRow =
  PublicSchema["Tables"]["service_request_notes"]["Row"];
export type ServiceRequestPhotoRow =
  PublicSchema["Tables"]["service_request_photos"]["Row"];
export type ServiceRequestRow =
  PublicSchema["Tables"]["service_requests"]["Row"];
export type TechnicianProfileRow =
  PublicSchema["Tables"]["technician_profiles"]["Row"];
export type TechnicianAvailabilityRuleRow =
  PublicSchema["Tables"]["technician_availability_rules"]["Row"];
