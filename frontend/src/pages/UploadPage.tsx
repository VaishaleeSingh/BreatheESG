import React, { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { jobsApi } from '../api';
import type { IngestResponse, IngestionJob } from '../types';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
type SourceType = 'SAP' | 'UTILITY' | 'TRAVEL';

interface SourceCard {
  id: SourceType;
  label: string;
  description: string;
  scope: string;
  scopeLabel: string;
  icon: React.ReactNode;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  try {
    return format(parseISO(s), 'dd MMM yyyy, HH:mm');
  } catch {
    return s;
  }
}

function fmtNum(n: number | undefined | null) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString();
}

// ─── Source Cards Config ──────────────────────────────────────────────────────
const SOURCE_CARDS: SourceCard[] = [
  {
    id: 'SAP',
    label: 'SAP Fuel & Procurement',
    description: 'Direct fuel consumption, fleet usage, and procurement data from SAP exports.',
    scope: '1',
    scopeLabel: 'Scope 1 — Direct emissions',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
        />
      </svg>
    ),
  },
  {
    id: 'UTILITY',
    label: 'Utility Electricity',
    description: 'Electricity, gas, and water consumption data from utility providers.',
    scope: '2',
    scopeLabel: 'Scope 2 — Indirect energy',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
  },
  {
    id: 'TRAVEL',
    label: 'Corporate Travel',
    description: 'Business flights, hotel stays, and ground transport expense data.',
    scope: '3',
    scopeLabel: 'Scope 3 — Value chain',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
];

// ─── Status badge ─────────────────────────────────────────────────────────────
function JobStatusBadge({ status }: { status: IngestionJob['status'] }) {
  const map: Record<IngestionJob['status'], { cls: string; label: string }> = {
    PENDING: { cls: 'badge-pending', label: 'Pending' },
    PROCESSING: {
      cls: 'bg-blue-100 text-blue-700 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
      label: 'Processing',
    },
    SUCCESS: { cls: 'badge-approved', label: 'Success' },
    FAILED: { cls: 'badge-rejected', label: 'Failed' },
  };
  const { cls, label } = map[status] ?? map.PENDING;
  return <span className={cls}>{label}</span>;
}

// ─── Upload Result ────────────────────────────────────────────────────────────
function UploadResult({
  result,
  error,
  onDismiss,
}: {
  result: IngestResponse | null;
  error: string;
  onDismiss: () => void;
}) {
  if (!result && !error) return null;

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-red-800 text-sm">Upload Failed</p>
            <p className="text-red-700 text-sm mt-0.5">{error}</p>
          </div>
          <button onClick={onDismiss} className="text-red-400 hover:text-red-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="font-semibold text-green-800 text-sm">Upload Successful</p>
          <p className="text-green-700 text-sm mt-0.5">
            File processed. Job ID:{' '}
            <span className="font-mono text-xs bg-green-100 px-1.5 py-0.5 rounded">
              {result.job.id.slice(0, 8)}…
            </span>
          </p>
        </div>
        <button onClick={onDismiss} className="text-green-400 hover:text-green-600 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg p-3 border border-green-100 text-center">
          <p className="text-2xl font-bold text-slate-900">{fmtNum(result.rows_processed)}</p>
          <p className="text-xs text-slate-500 mt-0.5">Rows Processed</p>
        </div>
        <div className="bg-white rounded-lg p-3 border border-green-100 text-center">
          <p className="text-2xl font-bold text-green-700">{fmtNum(result.rows_normalized)}</p>
          <p className="text-xs text-slate-500 mt-0.5">Normalized</p>
        </div>
        <div className="bg-white rounded-lg p-3 border border-red-50 text-center">
          <p className={clsx('text-2xl font-bold', result.rows_failed > 0 ? 'text-red-600' : 'text-slate-400')}>
            {fmtNum(result.rows_failed)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Failed</p>
        </div>
      </div>
    </div>
  );
}

// ─── UploadPage ────────────────────────────────────────────────────────────────
export default function UploadPage() {
  const [selectedSource, setSelectedSource] = useState<SourceType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  // Load job list
  const loadJobs = useCallback(() => {
    jobsApi
      .list()
      .then(setJobs)
      .catch(() => {})
      .finally(() => setJobsLoading(false));
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Dropzone
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) {
      setFile(acceptedFiles[0]);
      setResult(null);
      setUploadError('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    multiple: false,
  });

  const handleUpload = async () => {
    if (!selectedSource || !file) return;
    setUploading(true);
    setResult(null);
    setUploadError('');
    try {
      const res = await jobsApi.ingest(selectedSource, file);
      setResult(res);
      setFile(null);
      toast.success('File uploaded and processed successfully!');
      loadJobs();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string; error?: string } } };
      const msg =
        axErr?.response?.data?.detail ||
        axErr?.response?.data?.error ||
        'Upload failed. Please check your file and try again.';
      setUploadError(msg);
      toast.error('Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const canUpload = !!selectedSource && !!file && !uploading;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Upload Emissions Data</h1>
        <p className="text-sm text-slate-500 mt-1">
          Select a data source and upload a CSV file to begin processing
        </p>
      </div>

      {/* Step 1: Source Type */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold">
            1
          </div>
          <h2 className="text-base font-semibold text-slate-800">Select Data Source</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SOURCE_CARDS.map((src) => {
            const isSelected = selectedSource === src.id;
            return (
              <button
                key={src.id}
                onClick={() => setSelectedSource(src.id)}
                className={clsx(
                  'relative text-left p-4 rounded-xl border-2 transition-all duration-150 hover:shadow-card-hover',
                  isSelected
                    ? 'border-teal-500 bg-teal-50 shadow-card'
                    : 'border-cream-200 bg-white hover:border-teal-300 hover:bg-cream-50'
                )}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                <div
                  className={clsx(
                    'w-12 h-12 rounded-xl flex items-center justify-center mb-3',
                    isSelected ? 'bg-teal-500 text-white' : 'bg-cream-100 text-slate-600'
                  )}
                >
                  {src.icon}
                </div>
                <p className="font-semibold text-slate-900 text-sm leading-tight mb-1">
                  {src.label}
                </p>
                <p className="text-xs text-slate-500 leading-relaxed mb-2">
                  {src.description}
                </p>
                <span
                  className={clsx(
                    'text-xs font-medium px-2 py-0.5 rounded',
                    src.scope === '1'
                      ? 'badge-scope1'
                      : src.scope === '2'
                      ? 'badge-scope2'
                      : 'badge-scope3'
                  )}
                >
                  {src.scopeLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Drop Zone */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <div
            className={clsx(
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
              selectedSource ? 'bg-teal-500 text-white' : 'bg-cream-200 text-slate-400'
            )}
          >
            2
          </div>
          <h2 className="text-base font-semibold text-slate-800">Upload CSV File</h2>
        </div>

        <div
          {...getRootProps()}
          className={clsx(
            'relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-150',
            isDragReject
              ? 'border-red-400 bg-red-50'
              : isDragActive
              ? 'border-teal-500 bg-teal-50 scale-[1.01]'
              : file
              ? 'border-teal-400 bg-teal-50'
              : 'border-cream-300 bg-cream-50 hover:border-teal-400 hover:bg-teal-50'
          )}
        >
          <input {...getInputProps()} />

          {file ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-teal-800 text-sm">{file.name}</p>
                <p className="text-xs text-teal-600 mt-0.5">
                  {(file.size / 1024).toFixed(1)} KB · CSV file ready to upload
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                className="text-xs text-teal-600 underline hover:text-teal-800"
              >
                Remove file
              </button>
            </div>
          ) : isDragReject ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="font-medium text-red-700 text-sm">Only .csv files accepted</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div
                className={clsx(
                  'w-14 h-14 rounded-2xl flex items-center justify-center transition-colors',
                  isDragActive ? 'bg-teal-500 text-white' : 'bg-cream-200 text-teal-600'
                )}
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-slate-700 text-sm">
                  {isDragActive ? 'Drop your CSV file here' : 'Drag & drop your CSV file here'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  or <span className="text-teal-600 underline cursor-pointer">browse to select a file</span>
                </p>
              </div>
              <p className="text-xs text-slate-400">Accepts .csv files only</p>
            </div>
          )}
        </div>

        {/* Upload Result */}
        <UploadResult
          result={result}
          error={uploadError}
          onDismiss={() => {
            setResult(null);
            setUploadError('');
          }}
        />

        {/* Upload Button */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {!selectedSource && 'Select a data source above to continue'}
            {selectedSource && !file && 'Drop a CSV file to continue'}
          </p>
          <button
            onClick={handleUpload}
            disabled={!canUpload}
            className={clsx(
              'btn-primary',
              !canUpload && 'opacity-40 cursor-not-allowed pointer-events-none'
            )}
          >
            {uploading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload & Process
              </>
            )}
          </button>
        </div>
      </div>

      {/* Recent Uploads */}
      <div className="card overflow-hidden p-0">
        <div className="px-6 py-4 border-b border-cream-200">
          <h2 className="text-base font-semibold text-slate-800">Recent Upload Jobs</h2>
        </div>

        {jobsLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-cream-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-sm">No uploads yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-50 border-b border-cream-200">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">File</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rows</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Errors</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {jobs.map((job, idx) => (
                  <tr
                    key={job.id}
                    className={clsx(
                      'hover:bg-cream-50 transition-colors duration-100',
                      idx % 2 === 0 ? 'bg-white' : 'bg-cream-50/40'
                    )}
                  >
                    <td className="px-6 py-3">
                      <span className="font-medium text-slate-800 max-w-xs truncate block">
                        {job.original_filename}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                          job.source_type === 'SAP'
                            ? 'bg-purple-100 text-purple-700'
                            : job.source_type === 'UTILITY'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-blue-100 text-blue-700'
                        )}
                      >
                        {job.source_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 font-medium">
                      {fmtNum(job.row_count)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={job.error_count > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                        {fmtNum(job.error_count)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {fmtDate(job.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
