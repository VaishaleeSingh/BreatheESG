import React, { useEffect, useState } from 'react';
import { dashboardApi } from '../api';
import type { DashboardStats, IngestionJob } from '../types';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';

type Page = 'dashboard' | 'upload' | 'review';

interface DashboardProps {
  onNavigate?: (page: Page) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTonnes(kg: number | undefined) {
  if (kg === undefined || kg === null) return '—';
  return (kg / 1000).toFixed(2);
}

function fmtNum(n: number | undefined) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString();
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  try {
    return format(parseISO(s), 'dd MMM yyyy, HH:mm');
  } catch {
    return s;
  }
}

function statusBadge(status: IngestionJob['status']) {
  const map: Record<IngestionJob['status'], string> = {
    PENDING: 'badge-pending',
    PROCESSING: 'bg-blue-100 text-blue-700 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
    SUCCESS: 'badge-approved',
    FAILED: 'badge-rejected',
  };
  return map[status] ?? 'badge-pending';
}

function sourceBadge(source: IngestionJob['source_type']) {
  const map: Record<IngestionJob['source_type'], string> = {
    SAP: 'bg-purple-100 text-purple-700 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
    UTILITY: 'bg-yellow-100 text-yellow-700 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
    TRAVEL: 'bg-blue-100 text-blue-700 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
  };
  return map[source];
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('animate-pulse bg-cream-200 rounded-xl', className)} />
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg: string;
  badgeClass?: string;
  subtitle?: string;
}

function KpiCard({ label, value, icon, iconBg, subtitle }: KpiCardProps) {
  return (
    <div className="card flex items-start gap-4 hover:shadow-card-hover transition-shadow duration-200">
      <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500 mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-slate-900 leading-tight truncate">{value}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Scope Bar ────────────────────────────────────────────────────────────────
interface ScopeBarProps {
  scope: '1' | '2' | '3';
  label: string;
  kg: number;
  total: number;
  color: string;
  bg: string;
}

function ScopeBar({ scope, label, kg, total, color, bg }: ScopeBarProps) {
  const pct = total > 0 ? Math.min(100, (kg / total) * 100) : 0;
  return (
    <div className="card hover:shadow-card-hover transition-shadow duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'text-xs font-bold px-2 py-0.5 rounded',
              scope === '1' ? 'badge-scope1' : scope === '2' ? 'badge-scope2' : 'badge-scope3'
            )}
          >
            Scope {scope}
          </span>
          <span className="text-sm font-medium text-slate-700">{label}</span>
        </div>
        <span className="text-sm font-semibold text-slate-600">
          {fmtTonnes(kg)} t
        </span>
      </div>
      <div className="w-full h-3 bg-cream-100 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-xs text-slate-400">{pct.toFixed(1)}% of total</span>
        <span className="text-xs text-slate-400">{fmtNum(Math.round(kg))} kg</span>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    dashboardApi
      .stats()
      .then(setStats)
      .catch(() => setError('Failed to load dashboard data. Please refresh.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-7 w-48 mb-1" />
          <Skeleton className="h-4 w-72" />
        </div>
        {/* KPI skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        {/* Scope bar skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        {/* Table skeleton */}
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <p className="text-slate-600">{error}</p>
        <button
          className="btn-primary"
          onClick={() => {
            setLoading(true);
            setError('');
            dashboardApi
              .stats()
              .then(setStats)
              .catch(() => setError('Failed to load dashboard data. Please refresh.'))
              .finally(() => setLoading(false));
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const s = stats!;
  const totalScopeKg = (s.scope1_emissions_kg ?? 0) + (s.scope2_emissions_kg ?? 0) + (s.scope3_emissions_kg ?? 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Overview of your ESG emissions data
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary text-sm"
            onClick={() => onNavigate?.('upload')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Data
          </button>
          <button
            className="btn-primary text-sm"
            onClick={() => onNavigate?.('review')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Review Records
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Total Records"
          value={fmtNum(s.total_records)}
          icon={
            <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          iconBg="bg-teal-50"
        />
        <KpiCard
          label="Pending Review"
          value={fmtNum(s.pending_review)}
          icon={
            <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          iconBg="bg-amber-50"
        />
        <KpiCard
          label="Flagged"
          value={fmtNum(s.flagged)}
          icon={
            <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
          }
          iconBg="bg-orange-50"
        />
        <KpiCard
          label="Approved"
          value={fmtNum(s.approved)}
          icon={
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          iconBg="bg-green-50"
        />
        <KpiCard
          label="Total Emissions"
          value={`${fmtTonnes(s.total_emissions_kg)} t`}
          subtitle="CO₂ equivalent"
          icon={
            <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          iconBg="bg-slate-100"
        />
      </div>

      {/* Scope Breakdown */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">
          Emissions by Scope (tonnes CO₂e)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ScopeBar
            scope="1"
            label="Direct Emissions"
            kg={s.scope1_emissions_kg ?? 0}
            total={totalScopeKg}
            color="bg-red-400"
            bg="bg-red-50"
          />
          <ScopeBar
            scope="2"
            label="Electricity & Heat"
            kg={s.scope2_emissions_kg ?? 0}
            total={totalScopeKg}
            color="bg-yellow-400"
            bg="bg-yellow-50"
          />
          <ScopeBar
            scope="3"
            label="Value Chain"
            kg={s.scope3_emissions_kg ?? 0}
            total={totalScopeKg}
            color="bg-blue-400"
            bg="bg-blue-50"
          />
        </div>
      </div>

      {/* Emissions by Source */}
      {s.emissions_by_source && Object.keys(s.emissions_by_source).length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold text-slate-800 mb-4">
            Emissions by Source Type
          </h2>
          <div className="space-y-3">
            {Object.entries(s.emissions_by_source).map(([source, kg]) => {
              const pct = s.total_emissions_kg > 0 ? Math.min(100, (kg / s.total_emissions_kg) * 100) : 0;
              const colorMap: Record<string, string> = {
                SAP: 'bg-purple-400',
                UTILITY: 'bg-yellow-400',
                TRAVEL: 'bg-blue-400',
              };
              return (
                <div key={source}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-slate-700">{source}</span>
                    <span className="text-slate-500">{fmtTonnes(kg)} t CO₂e ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full h-2.5 bg-cream-100 rounded-full overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full transition-all duration-700', colorMap[source] ?? 'bg-teal-400')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Uploads Table */}
      <div className="card overflow-hidden p-0">
        <div className="px-6 py-4 border-b border-cream-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Recent Uploads</h2>
          <button
            className="btn-ghost text-sm"
            onClick={() => onNavigate?.('upload')}
          >
            View all
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {!s.recent_jobs || s.recent_jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm">No uploads yet. Upload a file to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-50 border-b border-cream-200">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    File
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Rows
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Errors
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    Uploaded By
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {s.recent_jobs.slice(0, 10).map((job, idx) => (
                  <tr
                    key={job.id}
                    className={clsx(
                      'hover:bg-cream-50 transition-colors duration-100',
                      idx % 2 === 0 ? 'bg-white' : 'bg-cream-50/40'
                    )}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="font-medium text-slate-800 max-w-xs truncate">
                          {job.original_filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={sourceBadge(job.source_type)}>
                        {job.source_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusBadge(job.status)}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 font-medium">
                      {fmtNum(job.row_count)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {job.error_count > 0 ? (
                        <span className="text-red-600 font-medium">{fmtNum(job.error_count)}</span>
                      ) : (
                        <span className="text-green-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-600">
                      {job.uploaded_by
                        ? job.uploaded_by.first_name
                          ? `${job.uploaded_by.first_name} ${job.uploaded_by.last_name}`
                          : job.uploaded_by.username
                        : '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-500 whitespace-nowrap">
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
