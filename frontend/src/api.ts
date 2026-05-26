import axios from 'axios';
import type {
  CurrentUser,
  DashboardStats,
  IngestResponse,
  IngestionJob,
  NormalizedRecord,
  NormalizedRecordDetail,
  AuditLog,
  RecordAction,
  RecordFilters,
  RecordListResponse,
  SignupData,
} from './types';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Basic Auth header from sessionStorage
api.interceptors.request.use((config) => {
  const creds = sessionStorage.getItem('breathe_auth');
  if (creds) {
    config.headers['Authorization'] = `Basic ${creds}`;
  }
  return config;
});

export const authApi = {
  login: async (username: string, password: string): Promise<CurrentUser> => {
    const creds = btoa(`${username}:${password}`);
    sessionStorage.setItem('breathe_auth', creds);
    const { data } = await api.get<CurrentUser>('/me/');
    return data;
  },
  signup: async (data: SignupData) => {
    return api.post('/signup/', data).then((r) => r.data);
  },
  logout: () => {
    sessionStorage.removeItem('breathe_auth');
  },
  me: () => api.get<CurrentUser>('/me/').then((r) => r.data),
};

export const dashboardApi = {
  stats: () => api.get<DashboardStats>('/dashboard/').then((r) => r.data),
};

export const jobsApi = {
  list: () => api.get<IngestionJob[]>('/jobs/').then((r) => r.data),
  ingest: (sourceType: string, file: File): Promise<IngestResponse> => {
    const fd = new FormData();
    fd.append('source_type', sourceType);
    fd.append('file', file);
    return api
      .post<IngestResponse>('/ingest/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
};

export const recordsApi = {
  list: (filters: RecordFilters = {}) => {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined)
    );
    return api.get<RecordListResponse>('/records/', { params }).then((r) => r.data);
  },
  detail: (id: string) =>
    api.get<NormalizedRecordDetail>(`/records/${id}/`).then((r) => r.data),
  patch: (id: string, data: Partial<NormalizedRecord>) =>
    api.patch<NormalizedRecordDetail>(`/records/${id}/`, data).then((r) => r.data),
  action: (id: string, action: RecordAction, note?: string) =>
    api
      .post<NormalizedRecord>(`/records/${id}/action/`, { action, note })
      .then((r) => r.data),
  bulkAction: (ids: string[], action: RecordAction, note?: string) =>
    api
      .post('/records/bulk-action/', { action, record_ids: ids, note })
      .then((r) => r.data),
  audit: (id: string) =>
    api.get<AuditLog[]>(`/records/${id}/audit/`).then((r) => r.data),
};

export default api;
