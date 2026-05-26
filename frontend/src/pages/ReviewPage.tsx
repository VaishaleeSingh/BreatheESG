import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  Fragment,
} from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { recordsApi } from '../api';
import type {
  NormalizedRecord,
  NormalizedRecordDetail,
  RecordFilters,
  RecordStatus,
  RecordAction,
  AuditLog,
} from '../types';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  try {
    return format(parseISO(s), 'dd MMM yyyy');
  } catch {
    return s;
  }
}

function fmtDateTime(s: string | null | undefined) {
  if (!s) return '—';
  try {
    return format(parseISO(s), 'dd MMM yyyy, HH:mm');
  } catch {
    return s;
  }
}

function fmtEmissions(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return '—';
  if (Math.abs(kg) >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  return `${kg.toFixed(2)} kg`;
}

// ─── Badges ──────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: RecordStatus }) {
  const map: Record<RecordStatus, string> = {
    PENDING_REVIEW: 'badge-pending',
    APPROVED: 'badge-approved',
    FLAGGED: 'badge-flagged',
    REJECTED: 'badge-rejected',
  };
  const labelMap: Record<RecordStatus, string> = {
    PENDING_REVIEW: 'Pending',
    APPROVED: 'Approved',
    FLAGGED: 'Flagged',
    REJECTED: 'Rejected',
  };
  return <span className={map[status]}>{labelMap[status]}</span>;
}

function SourceBadge({ src }: { src: NormalizedRecord['source_type'] }) {
  const cls =
    src === 'SAP'
      ? 'bg-purple-100 text-purple-700'
      : src === 'UTILITY'
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-blue-100 text-blue-700';
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', cls)}>
      {src}
    </span>
  );
}

function ScopeBadge({ scope }: { scope: NormalizedRecord['scope'] }) {
  const cls =
    scope === '1'
      ? 'badge-scope1'
      : scope === '2'
      ? 'badge-scope2'
      : 'badge-scope3';
  return <span className={clsx(cls, 'inline-flex items-center')}>{`S${scope}`}</span>;
}

// ─── Audit Action Icon ─────────────────────────────────────────────────────────
function AuditIcon({ action }: { action: AuditLog['action'] }) {
  switch (action) {
    case 'APPROVE':
      return (
        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    case 'FLAG':
    case 'SYSTEM_FLAG':
      return (
        <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
          </svg>
        </div>
      );
    case 'REJECT':
      return (
        <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
    case 'EDIT':
      return (
        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>
      );
    default:
      return (
        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
      );
  }
}

// ─── Note Modal ────────────────────────────────────────────────────────────────
interface NoteModalProps {
  action: RecordAction;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

function NoteModal({ action, onConfirm, onCancel }: NoteModalProps) {
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const labelMap: Record<RecordAction, { title: string; desc: string; btnCls: string; btnLabel: string }> = {
    flag: {
      title: 'Flag Record',
      desc: 'Please provide a reason for flagging this record.',
      btnCls: 'bg-orange-500 hover:bg-orange-600 text-white',
      btnLabel: 'Flag Record',
    },
    reject: {
      title: 'Reject Record',
      desc: 'Please provide a reason for rejecting this record.',
      btnCls: 'bg-red-500 hover:bg-red-600 text-white',
      btnLabel: 'Reject Record',
    },
    approve: {
      title: 'Approve Record',
      desc: 'Optionally add a note before approving.',
      btnCls: 'bg-green-600 hover:bg-green-700 text-white',
      btnLabel: 'Approve',
    },
  };

  const cfg = labelMap[action];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <h3 className="text-lg font-semibold text-slate-900 mb-1">{cfg.title}</h3>
        <p className="text-sm text-slate-500 mb-4">{cfg.desc}</p>
        <textarea
          ref={inputRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Enter reason or note (optional for approve)..."
          rows={3}
          className="input resize-none text-sm mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn-ghost text-sm px-4 py-2">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(note)}
            className={clsx('inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all', cfg.btnCls)}
          >
            {cfg.btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Record Detail Drawer ──────────────────────────────────────────────────────
interface DrawerProps {
  recordId: string | null;
  onClose: () => void;
  onRecordUpdated: () => void;
}

function RecordDetailDrawer({ recordId, onClose, onRecordUpdated }: DrawerProps) {
  const [detail, setDetail] = useState<NormalizedRecordDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<RecordAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<{
    activity_value: string;
    activity_date: string;
    description: string;
    location: string;
  }>({ activity_value: '', activity_date: '', description: '', location: '' });
  const [saveLoading, setSaveLoading] = useState(false);

  const load = useCallback(() => {
    if (!recordId) return;
    setLoading(true);
    recordsApi
      .detail(recordId)
      .then((d) => {
        setDetail(d);
        setEditData({
          activity_value: d.activity_value?.toString() ?? '',
          activity_date: d.activity_date ?? '',
          description: d.description ?? '',
          location: d.location ?? '',
        });
      })
      .catch(() => toast.error('Failed to load record details.'))
      .finally(() => setLoading(false));
  }, [recordId]);

  useEffect(() => {
    if (recordId) {
      setDetail(null);
      setEditMode(false);
      load();
    }
  }, [recordId, load]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleAction = async (action: RecordAction, note: string) => {
    if (!detail) return;
    setActionLoading(true);
    setPendingAction(null);
    try {
      await recordsApi.action(detail.id, action, note);
      toast.success(
        action === 'approve'
          ? 'Record approved!'
          : action === 'flag'
          ? 'Record flagged.'
          : 'Record rejected.'
      );
      load();
      onRecordUpdated();
    } catch {
      toast.error('Action failed. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!detail) return;
    setSaveLoading(true);
    try {
      await recordsApi.patch(detail.id, {
        activity_value: editData.activity_value ? parseFloat(editData.activity_value) : undefined,
        activity_date: editData.activity_date || undefined,
        description: editData.description,
        location: editData.location,
      } as Partial<NormalizedRecord>);
      toast.success('Record updated!');
      setEditMode(false);
      load();
      onRecordUpdated();
    } catch {
      toast.error('Failed to save changes.');
    } finally {
      setSaveLoading(false);
    }
  };

  const isOpen = !!recordId;

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={clsx(
          'fixed top-0 right-0 h-full w-full max-w-[620px] bg-white z-50 shadow-drawer',
          'flex flex-col transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin w-8 h-8 text-teal-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-slate-500">Loading record…</p>
            </div>
          </div>
        )}

        {!loading && detail && (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-cream-200 flex items-start justify-between bg-white flex-shrink-0">
              <div className="min-w-0 flex-1 pr-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold text-slate-900 truncate">
                    {detail.category || 'Record Detail'}
                  </h2>
                  <StatusBadge status={detail.status} />
                  {detail.is_auto_flagged && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Auto-flagged
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  ID: {detail.id.slice(0, 8)}… · Updated {fmtDateTime(detail.updated_at)}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:bg-cream-100 hover:text-slate-700 transition-all flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body - scrollable */}
            <div className="flex-1 overflow-y-auto">
              {/* Data Grid */}
              <div className="grid grid-cols-2 gap-0 border-b border-cream-200">
                {/* Left: Normalized Data */}
                <div className="p-5 border-r border-cream-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Normalized Data
                    </h3>
                    <button
                      onClick={() => setEditMode((v) => !v)}
                      className={clsx(
                        'text-xs px-2 py-1 rounded-md font-medium transition-all',
                        editMode
                          ? 'bg-teal-100 text-teal-700'
                          : 'text-slate-400 hover:text-teal-600 hover:bg-teal-50'
                      )}
                    >
                      {editMode ? 'Cancel Edit' : 'Edit Fields'}
                    </button>
                  </div>

                  <div className="space-y-3 text-sm">
                    <Field label="Source" value={<SourceBadge src={detail.source_type} />} />
                    <Field label="Scope" value={<ScopeBadge scope={detail.scope} />} />
                    <Field label="Category" value={detail.category || '—'} />

                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Activity Date</p>
                      {editMode ? (
                        <input
                          type="date"
                          value={editData.activity_date}
                          onChange={(e) => setEditData((d) => ({ ...d, activity_date: e.target.value }))}
                          className="input text-sm py-1"
                        />
                      ) : (
                        <p className="text-slate-800 font-medium">{fmtDate(detail.activity_date)}</p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Description</p>
                      {editMode ? (
                        <input
                          type="text"
                          value={editData.description}
                          onChange={(e) => setEditData((d) => ({ ...d, description: e.target.value }))}
                          className="input text-sm py-1"
                        />
                      ) : (
                        <p className="text-slate-800 font-medium text-xs leading-relaxed break-words">
                          {detail.description || '—'}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Location</p>
                      {editMode ? (
                        <input
                          type="text"
                          value={editData.location}
                          onChange={(e) => setEditData((d) => ({ ...d, location: e.target.value }))}
                          className="input text-sm py-1"
                        />
                      ) : (
                        <p className="text-slate-800 font-medium">{detail.location || '—'}</p>
                      )}
                    </div>

                    <Field label="Supplier / Vendor" value={detail.supplier_vendor || '—'} />

                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Activity Value</p>
                      {editMode ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={editData.activity_value}
                            onChange={(e) => setEditData((d) => ({ ...d, activity_value: e.target.value }))}
                            className="input text-sm py-1"
                          />
                          <span className="text-xs text-slate-500 whitespace-nowrap">{detail.activity_unit}</span>
                        </div>
                      ) : (
                        <p className="text-slate-800 font-medium">
                          {detail.activity_value !== null ? `${detail.activity_value} ${detail.activity_unit}` : '—'}
                        </p>
                      )}
                    </div>
                  </div>

                  {editMode && (
                    <button
                      onClick={handleSaveEdits}
                      disabled={saveLoading}
                      className="btn-primary mt-4 w-full justify-center text-sm py-2"
                    >
                      {saveLoading ? 'Saving…' : 'Save Changes'}
                    </button>
                  )}
                </div>

                {/* Right: Raw Data */}
                <div className="p-5">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    Raw Source Data
                  </h3>
                  {detail.raw_record ? (
                    <div className="space-y-1.5 text-xs">
                      {Object.entries(detail.raw_record.row_data).map(([k, v]) => (
                        <div key={k} className="flex gap-1.5">
                          <span className="text-slate-400 font-medium min-w-0 break-all">{k}:</span>
                          <span className="text-slate-700 break-all">{v || '—'}</span>
                        </div>
                      ))}
                      {detail.raw_record.parse_error && (
                        <div className="mt-2 p-2 bg-red-50 rounded-lg text-red-600 text-xs">
                          Parse error: {detail.raw_record.parse_error}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No raw record linked</p>
                  )}
                </div>
              </div>

              {/* Emission Calculation */}
              <div className="px-5 py-4 border-b border-cream-200 bg-cream-50">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Emission Calculation
                </h3>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700 flex-wrap">
                  <div className="bg-white rounded-lg px-3 py-2 border border-cream-200 shadow-sm text-center">
                    <p className="text-xs text-slate-400 mb-0.5">Activity</p>
                    <p>{detail.activity_value !== null ? `${detail.activity_value} ${detail.activity_unit}` : '—'}</p>
                  </div>
                  <span className="text-slate-400 font-bold">×</span>
                  <div className="bg-white rounded-lg px-3 py-2 border border-cream-200 shadow-sm text-center">
                    <p className="text-xs text-slate-400 mb-0.5">Emission Factor</p>
                    <p>
                      {detail.emission_factor_value !== null
                        ? `${detail.emission_factor_value} kg CO₂e/${detail.activity_unit}`
                        : detail.emission_factor
                        ? `${detail.emission_factor.kg_co2e_per_unit} kg CO₂e/${detail.emission_factor.unit}`
                        : '—'}
                    </p>
                  </div>
                  <span className="text-slate-400 font-bold">=</span>
                  <div className="bg-teal-50 rounded-lg px-3 py-2 border border-teal-200 shadow-sm text-center">
                    <p className="text-xs text-teal-600 mb-0.5">Calculated Emissions</p>
                    <p className="text-teal-800 font-bold">{fmtEmissions(detail.calculated_emissions_kg)}</p>
                  </div>
                </div>
                {detail.emission_factor && (
                  <p className="text-xs text-slate-400 mt-2">
                    Factor source: {detail.emission_factor.source} · {detail.emission_factor.activity_type}
                  </p>
                )}
                {detail.flag_reason && (
                  <div className="mt-3 flex items-start gap-2 p-2.5 bg-orange-50 rounded-lg border border-orange-100">
                    <svg className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="text-xs text-orange-700">
                      <span className="font-semibold">Flag reason: </span>
                      {detail.flag_reason}
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="px-5 py-4 border-b border-cream-200 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setPendingAction('approve')}
                  disabled={actionLoading || detail.status === 'APPROVED'}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium text-sm transition-all',
                    detail.status === 'APPROVED'
                      ? 'bg-green-50 text-green-300 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  )}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Approve
                </button>
                <button
                  onClick={() => setPendingAction('flag')}
                  disabled={actionLoading || detail.status === 'FLAGGED'}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium text-sm transition-all',
                    detail.status === 'FLAGGED'
                      ? 'bg-orange-50 text-orange-300 cursor-not-allowed'
                      : 'bg-orange-500 text-white hover:bg-orange-600'
                  )}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
                  </svg>
                  Flag
                </button>
                <button
                  onClick={() => setPendingAction('reject')}
                  disabled={actionLoading || detail.status === 'REJECTED'}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium text-sm transition-all',
                    detail.status === 'REJECTED'
                      ? 'bg-red-50 text-red-300 cursor-not-allowed'
                      : 'bg-red-500 text-white hover:bg-red-600'
                  )}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reject
                </button>
                {actionLoading && (
                  <svg className="animate-spin w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
              </div>

              {/* Audit Log */}
              <div className="px-5 py-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                  Audit Log
                </h3>
                {detail.audit_logs && detail.audit_logs.length > 0 ? (
                  <div className="relative">
                    <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-cream-200" />
                    <div className="space-y-4">
                      {detail.audit_logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-3 relative">
                          <AuditIcon action={log.action} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-slate-700">{log.action}</span>
                              {log.performed_by && (
                                <span className="text-xs text-slate-500">
                                  by{' '}
                                  {log.performed_by.first_name
                                    ? `${log.performed_by.first_name} ${log.performed_by.last_name}`
                                    : log.performed_by.username}
                                </span>
                              )}
                              {!log.performed_by && (
                                <span className="text-xs text-slate-400 italic">System</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(log.timestamp)}</p>
                            {log.note && (
                              <p className="text-xs text-slate-600 mt-1 bg-cream-50 rounded-lg px-2 py-1.5 border border-cream-200">
                                {log.note}
                              </p>
                            )}
                            {log.old_status && log.new_status && log.old_status !== log.new_status && (
                              <p className="text-xs text-slate-400 mt-1">
                                {log.old_status} → {log.new_status}
                              </p>
                            )}
                            {log.field_changes && Object.keys(log.field_changes).length > 0 && (
                              <div className="mt-1.5 space-y-0.5">
                                {Object.entries(log.field_changes).map(([field, change]) => (
                                  <p key={field} className="text-xs text-slate-400">
                                    <span className="font-medium text-slate-600">{field}:</span>{' '}
                                    <span className="line-through text-red-400">{String(change.before ?? '—')}</span>
                                    {' → '}
                                    <span className="text-green-600">{String(change.after ?? '—')}</span>
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No audit events yet</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Note Modal */}
      {pendingAction && (
        <NoteModal
          action={pendingAction}
          onConfirm={(note) => handleAction(pendingAction, note)}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <div className="text-slate-800 font-medium text-sm">{value}</div>
    </div>
  );
}

// ─── Bulk Confirm Modal ───────────────────────────────────────────────────────
interface BulkConfirmProps {
  count: number;
  action: RecordAction;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

function BulkConfirmModal({ count, action, onConfirm, onCancel }: BulkConfirmProps) {
  const [note, setNote] = useState('');
  const labelMap: Record<RecordAction, { title: string; btnCls: string; btnLabel: string }> = {
    approve: {
      title: `Approve ${count} record${count > 1 ? 's' : ''}?`,
      btnCls: 'bg-green-600 hover:bg-green-700 text-white',
      btnLabel: 'Approve All',
    },
    flag: {
      title: `Flag ${count} record${count > 1 ? 's' : ''}?`,
      btnCls: 'bg-orange-500 hover:bg-orange-600 text-white',
      btnLabel: 'Flag All',
    },
    reject: {
      title: `Reject ${count} record${count > 1 ? 's' : ''}?`,
      btnCls: 'bg-red-500 hover:bg-red-600 text-white',
      btnLabel: 'Reject All',
    },
  };
  const cfg = labelMap[action];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{cfg.title}</h3>
        <p className="text-sm text-slate-500 mb-4">
          This action will be applied to all {count} selected records.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note..."
          rows={2}
          className="input resize-none text-sm mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn-ghost text-sm">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(note)}
            className={clsx('inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all', cfg.btnCls)}
          >
            {cfg.btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sort Icon ─────────────────────────────────────────────────────────────────
function SortIcon({ direction }: { direction: 'asc' | 'desc' | false }) {
  if (!direction) {
    return (
      <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  return direction === 'asc' ? (
    <svg className="w-3.5 h-3.5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-3.5 h-3.5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ─── ReviewPage ────────────────────────────────────────────────────────────────
const columnHelper = createColumnHelper<NormalizedRecord>();

const EMPTY_FILTERS: RecordFilters = {
  status: '',
  source_type: '',
  scope: '',
  date_from: '',
  date_to: '',
  search: '',
  ordering: '-activity_date',
  page: 1,
};

export default function ReviewPage() {
  const [filters, setFilters] = useState<RecordFilters>({ ...EMPTY_FILTERS });
  const [data, setData] = useState<NormalizedRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [sorting, setSorting] = useState<SortingState>([{ id: 'activity_date', desc: true }]);

  const [openDrawerId, setOpenDrawerId] = useState<string | null>(null);

  const [bulkAction, setBulkAction] = useState<RecordAction | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(
    (f: RecordFilters) => {
      setLoading(true);
      recordsApi
        .list(f)
        .then((res) => {
          setData(res.results);
          setTotal(res.total);
          setTotalPages(res.total_pages);
        })
        .catch(() => toast.error('Failed to load records.'))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    fetchData(filters);
  }, [filters, fetchData]);

  // Sync sorting → ordering filter
  useEffect(() => {
    if (sorting.length === 0) return;
    const s = sorting[0];
    const field = s.id === 'calculated_emissions_kg' ? 'calculated_emissions_kg' : 'activity_date';
    const ordering = (s.desc ? '-' : '') + field;
    setFilters((f) => ({ ...f, ordering, page: 1 }));
  }, [sorting]);

  const setFilter = <K extends keyof RecordFilters>(key: K, val: RecordFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: val, page: 1 }));
    setRowSelection({});
  };

  const handleSearchChange = (val: string) => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setFilter('search', val);
    }, 350);
  };

  const clearFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setRowSelection({});
  };

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);

  const handleBulkConfirm = async (note: string) => {
    if (!bulkAction || selectedIds.length === 0) return;
    setBulkLoading(true);
    setBulkAction(null);
    try {
      await recordsApi.bulkAction(selectedIds, bulkAction, note);
      toast.success(`${selectedIds.length} record(s) ${bulkAction}d.`);
      setRowSelection({});
      fetchData(filters);
    } catch {
      toast.error('Bulk action failed.');
    } finally {
      setBulkLoading(false);
    }
  };

  // Table columns
  const columns = [
    columnHelper.display({
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          className="rounded border-cream-300 text-teal-500 focus:ring-teal-400 w-4 h-4"
          checked={table.getIsAllPageRowsSelected()}
          ref={(el) => {
            if (el) el.indeterminate = table.getIsSomePageRowsSelected();
          }}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="rounded border-cream-300 text-teal-500 focus:ring-teal-400 w-4 h-4"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      size: 40,
    }),
    columnHelper.accessor('activity_date', {
      header: 'Date',
      cell: (info) => (
        <span className="text-slate-700 whitespace-nowrap text-xs">
          {fmtDate(info.getValue())}
        </span>
      ),
      enableSorting: true,
      size: 100,
    }),
    columnHelper.accessor('source_type', {
      header: 'Source',
      cell: (info) => <SourceBadge src={info.getValue()} />,
      enableSorting: false,
      size: 80,
    }),
    columnHelper.accessor('scope', {
      header: 'Scope',
      cell: (info) => <ScopeBadge scope={info.getValue()} />,
      enableSorting: false,
      size: 60,
    }),
    columnHelper.accessor('category', {
      header: 'Category',
      cell: (info) => (
        <span className="text-slate-700 text-xs font-medium">{info.getValue() || '—'}</span>
      ),
      enableSorting: false,
      size: 120,
    }),
    columnHelper.accessor('description', {
      header: 'Description',
      cell: (info) => (
        <span
          className="text-slate-500 text-xs block truncate"
          style={{ maxWidth: '200px' }}
          title={info.getValue() || ''}
        >
          {info.getValue() || '—'}
        </span>
      ),
      enableSorting: false,
      size: 200,
    }),
    columnHelper.display({
      id: 'activity',
      header: 'Activity',
      cell: ({ row }) => {
        const rec = row.original;
        return (
          <span className="text-slate-700 text-xs whitespace-nowrap">
            {rec.activity_value !== null ? `${rec.activity_value} ${rec.activity_unit}` : '—'}
          </span>
        );
      },
      size: 100,
    }),
    columnHelper.accessor('calculated_emissions_kg', {
      header: 'Emissions',
      cell: (info) => (
        <span className="text-slate-700 text-xs font-medium whitespace-nowrap">
          {fmtEmissions(info.getValue())}
        </span>
      ),
      enableSorting: true,
      size: 100,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => <StatusBadge status={info.getValue()} />,
      enableSorting: false,
      size: 100,
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenDrawerId(row.original.id);
          }}
          className="text-xs text-teal-600 hover:text-teal-800 font-medium px-2 py-1 rounded hover:bg-teal-50 transition-all"
        >
          View
        </button>
      ),
      size: 60,
    }),
  ];

  const table = useReactTable({
    data,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true,
    getRowId: (row) => row.id,
    enableRowSelection: true,
  });

  const hasFilters =
    !!filters.status ||
    !!filters.source_type ||
    !!filters.scope ||
    !!filters.date_from ||
    !!filters.date_to ||
    !!filters.search;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Review Records</h1>
          <p className="text-sm text-slate-500 mt-1">
            {loading ? 'Loading…' : `${total.toLocaleString()} record${total !== 1 ? 's' : ''} found`}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select
              className="input text-sm py-1.5"
              value={filters.status ?? ''}
              onChange={(e) => setFilter('status', e.target.value as RecordFilters['status'])}
            >
              <option value="">All Statuses</option>
              <option value="PENDING_REVIEW">Pending Review</option>
              <option value="FLAGGED">Flagged</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* Source Type */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Source</label>
            <select
              className="input text-sm py-1.5"
              value={filters.source_type ?? ''}
              onChange={(e) => setFilter('source_type', e.target.value as RecordFilters['source_type'])}
            >
              <option value="">All Sources</option>
              <option value="SAP">SAP</option>
              <option value="UTILITY">Utility</option>
              <option value="TRAVEL">Travel</option>
            </select>
          </div>

          {/* Scope */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Scope</label>
            <select
              className="input text-sm py-1.5"
              value={filters.scope ?? ''}
              onChange={(e) => setFilter('scope', e.target.value as RecordFilters['scope'])}
            >
              <option value="">All Scopes</option>
              <option value="1">Scope 1</option>
              <option value="2">Scope 2</option>
              <option value="3">Scope 3</option>
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Date From</label>
            <input
              type="date"
              className="input text-sm py-1.5"
              value={filters.date_from ?? ''}
              onChange={(e) => setFilter('date_from', e.target.value)}
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Date To</label>
            <input
              type="date"
              className="input text-sm py-1.5"
              value={filters.date_to ?? ''}
              onChange={(e) => setFilter('date_to', e.target.value)}
            />
          </div>

          {/* Search */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                className="input text-sm py-1.5 pl-8"
                placeholder="Description, location…"
                defaultValue={filters.search ?? ''}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
          </div>
        </div>

        {hasFilters && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-400">Active filters:</span>
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 font-medium px-2 py-1 bg-teal-50 rounded-lg hover:bg-teal-100 transition-all"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-teal-600 rounded-xl px-5 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-white">{selectedIds.length}</span>
            </div>
            <span className="text-sm font-medium text-white">
              {selectedIds.length} record{selectedIds.length > 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            {bulkLoading && (
              <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <button
              onClick={() => setBulkAction('approve')}
              disabled={bulkLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-400 text-white text-xs font-semibold rounded-lg transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Approve
            </button>
            <button
              onClick={() => setBulkAction('flag')}
              disabled={bulkLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg transition-all"
            >
              Flag
            </button>
            <button
              onClick={() => setBulkAction('reject')}
              disabled={bulkLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white text-xs font-semibold rounded-lg transition-all"
            >
              Reject
            </button>
            <button
              onClick={() => setRowSelection({})}
              className="px-2 py-1.5 text-white/70 hover:text-white text-xs transition-all"
            >
              Deselect
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="bg-cream-50 border-b border-cream-200">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={clsx(
                            'flex items-center gap-1',
                            header.column.getCanSort() && 'cursor-pointer select-none hover:text-teal-600'
                          )}
                          onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <SortIcon direction={header.column.getIsSorted()} />
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-cream-100">
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-cream-50/40'}>
                    {columns.map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-4 bg-cream-200 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm font-medium">No records found</p>
                      {hasFilters && (
                        <button onClick={clearFilters} className="text-xs text-teal-600 underline">
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, idx) => {
                  const isFlagged = row.original.status === 'FLAGGED';
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setOpenDrawerId(row.original.id)}
                      className={clsx(
                        'hover:bg-teal-50/30 cursor-pointer transition-colors duration-100 relative',
                        row.getIsSelected() ? 'bg-teal-50' : idx % 2 === 0 ? 'bg-white' : 'bg-cream-50/40',
                        isFlagged && 'border-l-2 border-orange-400'
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && data.length > 0 && (
          <div className="px-4 py-3 border-t border-cream-200 flex items-center justify-between bg-cream-50">
            <span className="text-xs text-slate-500">
              Page {filters.page ?? 1} of {totalPages} · {total.toLocaleString()} records
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
                disabled={(filters.page ?? 1) <= 1}
                className={clsx(
                  'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  (filters.page ?? 1) <= 1
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-600 hover:bg-cream-200'
                )}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Prev
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const curPage = filters.page ?? 1;
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (curPage <= 3) {
                    pageNum = i + 1;
                  } else if (curPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = curPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setFilters((f) => ({ ...f, page: pageNum }))}
                      className={clsx(
                        'w-7 h-7 rounded-lg text-xs font-medium transition-all',
                        pageNum === curPage
                          ? 'bg-teal-500 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-cream-200'
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() =>
                  setFilters((f) => ({ ...f, page: Math.min(totalPages, (f.page ?? 1) + 1) }))
                }
                disabled={(filters.page ?? 1) >= totalPages}
                className={clsx(
                  'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  (filters.page ?? 1) >= totalPages
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-600 hover:bg-cream-200'
                )}
              >
                Next
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <RecordDetailDrawer
        recordId={openDrawerId}
        onClose={() => setOpenDrawerId(null)}
        onRecordUpdated={() => fetchData(filters)}
      />

      {/* Bulk Confirm Modal */}
      {bulkAction && (
        <BulkConfirmModal
          count={selectedIds.length}
          action={bulkAction}
          onConfirm={handleBulkConfirm}
          onCancel={() => setBulkAction(null)}
        />
      )}

      {/* Suppress unused Fragment import warning */}
      <Fragment />
    </div>
  );
}
