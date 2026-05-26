"""
Breathe ESG — API Views

All views enforce tenant isolation: every queryset is filtered by the
current user's tenant before any other filtering is applied.

Authentication: BasicAuthentication + SessionAuthentication (prototype).
Permissions: IsAuthenticated on all views.

View Map:
  POST   /api/ingest/                   → IngestView
  GET    /api/jobs/                     → JobListView
  GET    /api/records/                  → RecordListView
  GET    /api/records/<id>/             → RecordDetailView
  PATCH  /api/records/<id>/             → RecordEditView
  POST   /api/records/<id>/action/      → RecordActionView
  POST   /api/records/bulk-action/      → BulkActionView
  GET    /api/records/<id>/audit/       → AuditLogView
  GET    /api/dashboard/                → DashboardView
  GET    /api/me/                       → CurrentUserView
"""

import logging
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q, Sum, Count
from django.utils import timezone

from rest_framework import status
from rest_framework.authentication import BasicAuthentication, SessionAuthentication
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AuditLog,
    IngestionJob,
    NormalizedRecord,
    RawRecord,
    Tenant,
    TenantUser,
)
from .parsers import run_parser
from .serializers import (
    AuditLogSerializer,
    BulkActionSerializer,
    DashboardStatsSerializer,
    IngestionJobSerializer,
    NormalizedRecordDetailSerializer,
    NormalizedRecordEditSerializer,
    NormalizedRecordListSerializer,
    RecordActionSerializer,
    SignupSerializer,
    IngestionJobCreateSerializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Base mixin — tenant resolution
# ---------------------------------------------------------------------------

class TenantMixin:
    """
    Resolves the current user's tenant from TenantUser.
    Raises 403 if the user has no associated tenant.
    """
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

    def get_tenant(self, request):
        try:
            return request.user.tenant_profile.tenant
        except TenantUser.DoesNotExist:
            return None

    def tenant_records(self, request):
        """Return NormalizedRecord queryset scoped to the current tenant."""
        tenant = self.get_tenant(request)
        if tenant is None:
            return NormalizedRecord.objects.none()
        return NormalizedRecord.objects.filter(tenant=tenant)


# ---------------------------------------------------------------------------
# Current User
# ---------------------------------------------------------------------------

class CurrentUserView(TenantMixin, APIView):
    """
    GET /api/me/
    Returns current user info + tenant details.
    """
    def get(self, request):
        tenant = self.get_tenant(request)
        data = {
            "id": request.user.id,
            "username": request.user.username,
            "first_name": request.user.first_name,
            "last_name": request.user.last_name,
            "email": request.user.email,
            "tenant": {
                "id": str(tenant.id) if tenant else None,
                "name": tenant.name if tenant else None,
                "slug": tenant.slug if tenant else None,
            } if tenant else None,
        }
        return Response(data)


# ---------------------------------------------------------------------------
# Signup
# ---------------------------------------------------------------------------

class SignupView(APIView):
    """
    POST /api/signup/
    Registers a new user, creates a tenant for them, and assigns them as an analyst.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        username = serializer.validated_data["username"]
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]
        company_name = serializer.validated_data["company_name"]

        with transaction.atomic():
            # Create the tenant (slug is derived from company name, fallback if needed)
            import re
            base_slug = re.sub(r'[^a-z0-9]+', '-', company_name.lower()).strip('-')
            slug = base_slug
            counter = 1
            while Tenant.objects.filter(slug=slug).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1

            tenant = Tenant.objects.create(name=company_name, slug=slug)

            # Create the user
            user = User.objects.create_user(username=username, email=email, password=password)

            # Link user to tenant
            TenantUser.objects.create(user=user, tenant=tenant, role='analyst')

        return Response(
            {"message": "User registered successfully.", "username": user.username, "tenant": tenant.name},
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------

class IngestView(TenantMixin, APIView):
    """
    POST /api/ingest/
    Accepts a multipart form with 'source_type' and 'file'.
    Creates an IngestionJob, saves the file, and runs the parser synchronously.
    
    For prototype scale (< 10,000 rows), synchronous parsing is acceptable.
    See TRADEOFFS.md for rationale on Celery deferral.
    """

    def post(self, request):
        tenant = self.get_tenant(request)
        if not tenant:
            return Response(
                {"error": "Your account is not associated with a tenant. Contact your administrator."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = IngestionJobCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        uploaded_file = serializer.validated_data["file"]
        source_type = serializer.validated_data["source_type"]

        job = IngestionJob.objects.create(
            tenant=tenant,
            uploaded_by=request.user,
            source_type=source_type,
            original_filename=uploaded_file.name,
            file=uploaded_file,
        )

        # Run parser synchronously (prototype design — see TRADEOFFS.md)
        try:
            success, errors = run_parser(job, tenant, request.user, job.file)
            return Response(
                {
                    "job": IngestionJobSerializer(job).data,
                    "rows_processed": success + errors,
                    "rows_normalized": success,
                    "rows_failed": errors,
                },
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            logger.exception(f"Unexpected error during ingestion: {e}")
            return Response(
                {"error": "An unexpected error occurred during file processing.", "detail": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ---------------------------------------------------------------------------
# Job List
# ---------------------------------------------------------------------------

class JobListView(TenantMixin, APIView):
    """
    GET /api/jobs/
    Returns all IngestionJobs for the current tenant, newest first.
    """

    def get(self, request):
        tenant = self.get_tenant(request)
        if not tenant:
            return Response([], status=status.HTTP_200_OK)
        jobs = IngestionJob.objects.filter(tenant=tenant).select_related("uploaded_by")
        return Response(IngestionJobSerializer(jobs, many=True).data)


# ---------------------------------------------------------------------------
# Record List (with filtering)
# ---------------------------------------------------------------------------

class RecordListView(TenantMixin, APIView):
    """
    GET /api/records/
    Returns NormalizedRecords for the current tenant with optional filters.

    Query params:
      status        → PENDING_REVIEW | APPROVED | FLAGGED | REJECTED
      source_type   → SAP | UTILITY | TRAVEL
      scope         → 1 | 2 | 3
      date_from     → YYYY-MM-DD
      date_to       → YYYY-MM-DD
      job_id        → UUID of IngestionJob
      search        → text search in description, category, location, supplier_vendor
      ordering      → field name (prefix with - for desc). Default: -activity_date
      page          → page number (1-indexed, 100 per page)
    """

    PAGE_SIZE = 100

    def get(self, request):
        qs = self.tenant_records(request).select_related(
            "emission_factor", "reviewed_by", "job"
        )

        # --- Filters ---
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        source_filter = request.query_params.get("source_type")
        if source_filter:
            qs = qs.filter(source_type=source_filter)

        scope_filter = request.query_params.get("scope")
        if scope_filter:
            qs = qs.filter(scope=scope_filter)

        date_from = request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(activity_date__gte=date_from)

        date_to = request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(activity_date__lte=date_to)

        job_id = request.query_params.get("job_id")
        if job_id:
            qs = qs.filter(job_id=job_id)

        search = request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(description__icontains=search) |
                Q(category__icontains=search) |
                Q(location__icontains=search) |
                Q(supplier_vendor__icontains=search)
            )

        # --- Ordering ---
        ordering = request.query_params.get("ordering", "-activity_date")
        allowed_orderings = {
            "activity_date", "-activity_date",
            "calculated_emissions_kg", "-calculated_emissions_kg",
            "status", "-status",
            "source_type", "-source_type",
            "scope", "-scope",
            "created_at", "-created_at",
        }
        if ordering not in allowed_orderings:
            ordering = "-activity_date"
        qs = qs.order_by(ordering)

        # --- Pagination ---
        page = max(1, int(request.query_params.get("page", 1)))
        total = qs.count()
        start = (page - 1) * self.PAGE_SIZE
        end = start + self.PAGE_SIZE
        records = qs[start:end]

        return Response({
            "total": total,
            "page": page,
            "page_size": self.PAGE_SIZE,
            "total_pages": max(1, -(-total // self.PAGE_SIZE)),  # ceiling division
            "results": NormalizedRecordListSerializer(records, many=True).data,
        })


# ---------------------------------------------------------------------------
# Record Detail
# ---------------------------------------------------------------------------

class RecordDetailView(TenantMixin, APIView):
    """
    GET    /api/records/<id>/  → Full detail with raw_record + audit_logs
    PATCH  /api/records/<id>/  → Edit specific fields (creates audit log entry)
    """

    def _get_record(self, request, pk):
        tenant = self.get_tenant(request)
        if not tenant:
            return None
        try:
            return NormalizedRecord.objects.select_related(
                "raw_record", "job", "emission_factor", "reviewed_by"
            ).prefetch_related("audit_logs__performed_by").get(pk=pk, tenant=tenant)
        except NormalizedRecord.DoesNotExist:
            return None

    def get(self, request, pk):
        record = self._get_record(request, pk)
        if not record:
            return Response({"error": "Record not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(NormalizedRecordDetailSerializer(record).data)

    def patch(self, request, pk):
        record = self._get_record(request, pk)
        if not record:
            return Response({"error": "Record not found."}, status=status.HTTP_404_NOT_FOUND)

        if record.status == NormalizedRecord.STATUS_APPROVED:
            return Response(
                {"error": "Approved records cannot be edited. Reject first to re-open."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = NormalizedRecordEditSerializer(record, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            updated_record, changes = serializer.save()

            if changes:
                AuditLog.objects.create(
                    record=updated_record,
                    performed_by=request.user,
                    action=AuditLog.ACTION_EDIT,
                    old_status=updated_record.status,
                    new_status=updated_record.status,
                    field_changes=changes,
                )

        return Response(NormalizedRecordDetailSerializer(updated_record).data)


# ---------------------------------------------------------------------------
# Single Record Action (approve / flag / reject)
# ---------------------------------------------------------------------------

ACTION_STATUS_MAP = {
    "approve": NormalizedRecord.STATUS_APPROVED,
    "flag": NormalizedRecord.STATUS_FLAGGED,
    "reject": NormalizedRecord.STATUS_REJECTED,
}

ACTION_AUDIT_MAP = {
    "approve": AuditLog.ACTION_APPROVE,
    "flag": AuditLog.ACTION_FLAG,
    "reject": AuditLog.ACTION_REJECT,
}


class RecordActionView(TenantMixin, APIView):
    """
    POST /api/records/<id>/action/
    Body: { "action": "approve"|"flag"|"reject", "note": "..." }
    """

    def post(self, request, pk):
        tenant = self.get_tenant(request)
        if not tenant:
            return Response({"error": "No tenant."}, status=status.HTTP_403_FORBIDDEN)

        try:
            record = NormalizedRecord.objects.get(pk=pk, tenant=tenant)
        except NormalizedRecord.DoesNotExist:
            return Response({"error": "Record not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = RecordActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        action = serializer.validated_data["action"]
        note = serializer.validated_data.get("note", "")
        old_status = record.status
        new_status = ACTION_STATUS_MAP[action]

        with transaction.atomic():
            record.status = new_status
            record.reviewed_by = request.user
            record.reviewed_at = timezone.now()
            if action == "flag" and note:
                record.flag_reason = note
            record.save(update_fields=["status", "reviewed_by", "reviewed_at", "flag_reason"])

            AuditLog.objects.create(
                record=record,
                performed_by=request.user,
                action=ACTION_AUDIT_MAP[action],
                old_status=old_status,
                new_status=new_status,
                note=note,
            )

        return Response(NormalizedRecordListSerializer(record).data)


# ---------------------------------------------------------------------------
# Bulk Action
# ---------------------------------------------------------------------------

class BulkActionView(TenantMixin, APIView):
    """
    POST /api/records/bulk-action/
    Body: { "action": "approve"|"flag"|"reject", "record_ids": [...UUIDs...], "note": "..." }
    All records must belong to the current tenant (others are silently skipped for security).
    """

    def post(self, request):
        tenant = self.get_tenant(request)
        if not tenant:
            return Response({"error": "No tenant."}, status=status.HTTP_403_FORBIDDEN)

        serializer = BulkActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        action = serializer.validated_data["action"]
        record_ids = serializer.validated_data["record_ids"]
        note = serializer.validated_data.get("note", "")
        new_status = ACTION_STATUS_MAP[action]
        audit_action = ACTION_AUDIT_MAP[action]

        records = NormalizedRecord.objects.filter(
            pk__in=record_ids,
            tenant=tenant,
        ).exclude(status=new_status)  # Skip records already in target state

        updated_count = 0
        with transaction.atomic():
            for record in records:
                old_status = record.status
                record.status = new_status
                record.reviewed_by = request.user
                record.reviewed_at = timezone.now()
                if action == "flag" and note:
                    record.flag_reason = note
                record.save(update_fields=["status", "reviewed_by", "reviewed_at", "flag_reason"])

                AuditLog.objects.create(
                    record=record,
                    performed_by=request.user,
                    action=audit_action,
                    old_status=old_status,
                    new_status=new_status,
                    note=note,
                )
                updated_count += 1

        return Response({
            "updated": updated_count,
            "action": action,
            "message": f"Successfully {action}d {updated_count} record(s).",
        })


# ---------------------------------------------------------------------------
# Audit Log for a Record
# ---------------------------------------------------------------------------

class AuditLogView(TenantMixin, APIView):
    """
    GET /api/records/<id>/audit/
    Returns the full audit trail for a specific record.
    """

    def get(self, request, pk):
        tenant = self.get_tenant(request)
        if not tenant:
            return Response({"error": "No tenant."}, status=status.HTTP_403_FORBIDDEN)

        try:
            record = NormalizedRecord.objects.get(pk=pk, tenant=tenant)
        except NormalizedRecord.DoesNotExist:
            return Response({"error": "Record not found."}, status=status.HTTP_404_NOT_FOUND)

        logs = AuditLog.objects.filter(record=record).select_related("performed_by")
        return Response(AuditLogSerializer(logs, many=True).data)


# ---------------------------------------------------------------------------
# Dashboard Stats
# ---------------------------------------------------------------------------

class DashboardView(TenantMixin, APIView):
    """
    GET /api/dashboard/
    Returns aggregated KPI statistics for the current tenant's dashboard.
    """

    def get(self, request):
        tenant = self.get_tenant(request)
        if not tenant:
            return Response({
                "total_records": 0,
                "pending_review": 0,
                "flagged": 0,
                "approved": 0,
                "rejected": 0,
                "total_emissions_kg": 0,
                "scope1_emissions_kg": 0,
                "scope2_emissions_kg": 0,
                "scope3_emissions_kg": 0,
                "recent_jobs": [],
                "emissions_by_source": {},
            })

        qs = NormalizedRecord.objects.filter(tenant=tenant)

        # Status counts
        status_counts = qs.values("status").annotate(count=Count("id"))
        status_map = {item["status"]: item["count"] for item in status_counts}

        # Emission aggregations
        total_emissions = qs.aggregate(total=Sum("calculated_emissions_kg"))["total"] or 0
        scope_emissions = {}
        for scope in ["1", "2", "3"]:
            scope_emissions[scope] = (
                qs.filter(scope=scope).aggregate(total=Sum("calculated_emissions_kg"))["total"] or 0
            )

        # By source
        source_emissions = {}
        for item in qs.values("source_type").annotate(total=Sum("calculated_emissions_kg")):
            source_emissions[item["source_type"]] = item["total"] or 0

        # Recent jobs
        recent_jobs = IngestionJob.objects.filter(tenant=tenant).select_related("uploaded_by")[:10]

        return Response({
            "total_records": qs.count(),
            "pending_review": status_map.get(NormalizedRecord.STATUS_PENDING, 0),
            "flagged": status_map.get(NormalizedRecord.STATUS_FLAGGED, 0),
            "approved": status_map.get(NormalizedRecord.STATUS_APPROVED, 0),
            "rejected": status_map.get(NormalizedRecord.STATUS_REJECTED, 0),
            "total_emissions_kg": total_emissions,
            "scope1_emissions_kg": scope_emissions.get("1", 0),
            "scope2_emissions_kg": scope_emissions.get("2", 0),
            "scope3_emissions_kg": scope_emissions.get("3", 0),
            "recent_jobs": IngestionJobSerializer(recent_jobs, many=True).data,
            "emissions_by_source": source_emissions,
        })
