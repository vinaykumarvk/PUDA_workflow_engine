/** Shared types for the officer portal */

export type Task = {
  task_id: string;
  arn: string;
  state_id: string;
  system_role_id: string;
  status: string;
  sla_due_at?: string;
  created_at: string;
  service_key?: string;
  applicant_name?: string;
  authority_id?: string;
};

export type Application = {
  arn: string;
  service_key: string;
  state_id: string;
  data_jsonb: any;
  sla_due_at?: string;
  created_at?: string;
  documents: any[];
  queries: any[];
  tasks: any[];
  timeline: any[];
  disposal_type?: string;
};

export type OfficerUser = {
  user_id: string;
  login: string;
  name: string;
  user_type: string;
};

export type OfficerPosting = {
  posting_id: string;
  authority_id: string;
  designation_name: string;
  system_role_ids: string[];
};

export type OfficerAuth = {
  user: OfficerUser;
  token: string;
};

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
