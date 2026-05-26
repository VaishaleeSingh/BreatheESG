export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface SignupData {
  username: string;
  email: string;
  password?: string;
  company_name: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
}

export interface CurrentUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  tenant: Tenant | null;
}

export interface EmissionFactor {
  id: number;
  activity_type: string;
  unit: string;
  kg_co2e_per_unit: number;
  scope: string;
  source: string;
  notes: string;
}

export interface IngestionJob {
  id: string;
  source_type: 'SAP' | 'UTILITY' | 'TRAVEL';
  original_filename: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  row_count: number;
  error_count: number;
  error_detail: string;
  uploaded_by: User | null;
  created_at: string;
  completed_at: string | null;
}

export interface RawRecord {
  id: string;
  row_index: number;
  row_data: Record<string, string>;
  parse_error: string;
  created_at: string;
}

export type RecordStatus = 'PENDING_REVIEW' | 'APPROVED' | 'FLAGGED' | 'REJECTED';

export interface NormalizedRecord {
  id: string;
  source_type: 'SAP' | 'UTILITY' | 'TRAVEL';
  scope: '1' | '2' | '3';
  category: string;
  activity_date: string | null;
  description: string;
  location: string;
  supplier_vendor: string;
  activity_value: number | null;
  activity_unit: string;
  emission_factor: EmissionFactor | null;
  emission_factor_value: number | null;
  calculated_emissions_kg: number | null;
  status: RecordStatus;
  flag_reason: string;
  is_auto_flagged: boolean;
  reviewed_by: User | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NormalizedRecordDetail extends NormalizedRecord {
  raw_record: RawRecord | null;
  job: IngestionJob | null;
  audit_logs: AuditLog[];
  edited_fields: Record<string, { before: unknown; after: unknown }>;
}

export interface AuditLog {
  id: string;
  action: 'CREATE' | 'EDIT' | 'APPROVE' | 'FLAG' | 'REJECT' | 'SYSTEM_FLAG';
  performed_by: User | null;
  old_status: string;
  new_status: string;
  field_changes: Record<string, { before: unknown; after: unknown }>;
  note: string;
  timestamp: string;
}

export interface RecordListResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: NormalizedRecord[];
}

export interface DashboardStats {
  total_records: number;
  pending_review: number;
  flagged: number;
  approved: number;
  rejected: number;
  total_emissions_kg: number;
  scope1_emissions_kg: number;
  scope2_emissions_kg: number;
  scope3_emissions_kg: number;
  recent_jobs: IngestionJob[];
  emissions_by_source: Record<string, number>;
}

export interface IngestResponse {
  job: IngestionJob;
  rows_processed: number;
  rows_normalized: number;
  rows_failed: number;
}

export type RecordAction = 'approve' | 'flag' | 'reject';

export interface RecordFilters {
  status?: RecordStatus | '';
  source_type?: 'SAP' | 'UTILITY' | 'TRAVEL' | '';
  scope?: '1' | '2' | '3' | '';
  date_from?: string;
  date_to?: string;
  search?: string;
  ordering?: string;
  page?: number;
}
