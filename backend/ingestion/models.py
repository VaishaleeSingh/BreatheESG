"""
Breathe ESG — Core Data Models

Architecture Overview:
- Tenant: Multi-tenancy boundary. All data is filtered by tenant at the view level.
- IngestionJob: One job per CSV upload. Tracks state and links to parsed records.
- RawRecord: Verbatim storage of each CSV row as JSON. Never mutated after creation.
- EmissionFactor: Reference lookup table mapping activity types to kg CO2e per unit.
- NormalizedRecord: Cleaned, unified representation of a RawRecord with calculated emissions.
- AuditLog: Immutable event log capturing every state change on a NormalizedRecord.
"""

from django.db import models
from django.contrib.auth.models import User
import uuid


class Tenant(models.Model):
    """
    Represents a client organization. Provides the top-level multi-tenancy boundary.
    Every user and every data record is scoped to exactly one Tenant.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['name']


class TenantUser(models.Model):
    """
    Links a Django User to a Tenant. A user can belong to only one tenant in this prototype.
    In a production system, this would carry role information (Admin, Analyst, Reviewer).
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='tenant_profile')
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='members')
    role = models.CharField(
        max_length=50,
        choices=[('admin', 'Admin'), ('analyst', 'Analyst'), ('reviewer', 'Reviewer')],
        default='analyst'
    )

    def __str__(self):
        return f"{self.user.username} @ {self.tenant.name}"


class EmissionFactor(models.Model):
    """
    Reference table for carbon emission intensities.
    Source: UK DEFRA 2023 Conversion Factors (primary) and US EPA eGRID (electricity).

    Each record maps an (activity_type, unit) pair to a kg CO2e per unit factor.
    This table is tenant-independent — it's a global reference.
    """
    SOURCE_DEFRA = 'DEFRA'
    SOURCE_EPA = 'EPA'
    SOURCE_IPCC = 'IPCC'
    SOURCE_CHOICES = [
        (SOURCE_DEFRA, 'UK DEFRA 2023'),
        (SOURCE_EPA, 'US EPA eGRID'),
        (SOURCE_IPCC, 'IPCC AR6'),
    ]
    SCOPE_CHOICES = [
        ('1', 'Scope 1 — Direct'),
        ('2', 'Scope 2 — Electricity'),
        ('3', 'Scope 3 — Value Chain'),
    ]

    activity_type = models.CharField(
        max_length=100,
        help_text="e.g. 'diesel', 'natural_gas', 'electricity_uk', 'flight_economy'"
    )
    unit = models.CharField(
        max_length=50,
        help_text="Standardized unit: litres, kWh, miles, kg, passenger-km"
    )
    kg_co2e_per_unit = models.FloatField(
        help_text="Emission intensity in kg CO2e per unit of activity"
    )
    scope = models.CharField(max_length=1, choices=SCOPE_CHOICES)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_DEFRA)
    notes = models.TextField(blank=True)
    valid_from = models.DateField(null=True, blank=True)
    valid_to = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.activity_type} ({self.unit}) = {self.kg_co2e_per_unit} kg CO2e"

    class Meta:
        unique_together = [('activity_type', 'unit')]
        ordering = ['scope', 'activity_type']


class IngestionJob(models.Model):
    """
    Represents a single CSV file upload and its processing lifecycle.

    The job transitions through states:
    PENDING → PROCESSING → SUCCESS / FAILED

    The uploaded file is stored in MEDIA_ROOT/uploads/ and never modified after upload.
    """
    SOURCE_SAP = 'SAP'
    SOURCE_UTILITY = 'UTILITY'
    SOURCE_TRAVEL = 'TRAVEL'
    SOURCE_CHOICES = [
        (SOURCE_SAP, 'SAP Fuel & Procurement'),
        (SOURCE_UTILITY, 'Utility — Electricity'),
        (SOURCE_TRAVEL, 'Corporate Travel'),
    ]
    STATUS_PENDING = 'PENDING'
    STATUS_PROCESSING = 'PROCESSING'
    STATUS_SUCCESS = 'SUCCESS'
    STATUS_FAILED = 'FAILED'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_PROCESSING, 'Processing'),
        (STATUS_SUCCESS, 'Success'),
        (STATUS_FAILED, 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='jobs')
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='jobs')
    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    original_filename = models.CharField(max_length=255)
    file = models.FileField(upload_to='uploads/')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    row_count = models.IntegerField(default=0, help_text="Total rows parsed from CSV")
    error_count = models.IntegerField(default=0, help_text="Rows that failed to parse")
    error_detail = models.TextField(blank=True, help_text="Error message if status=FAILED")
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.source_type} upload by {self.uploaded_by} at {self.created_at:%Y-%m-%d %H:%M}"

    class Meta:
        ordering = ['-created_at']


class RawRecord(models.Model):
    """
    Verbatim storage of a single CSV row.

    Design principle: Raw records are IMMUTABLE after creation.
    They capture exactly what the source system sent, including typos,
    inconsistent formatting, and missing values. This ensures we can
    always re-run normalization without data loss.

    `row_data` is a JSON blob of {column_name: raw_value} exactly as read by pandas.
    `row_index` is the 0-based row number within the original CSV file.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='raw_records')
    job = models.ForeignKey(IngestionJob, on_delete=models.CASCADE, related_name='raw_records')
    row_index = models.IntegerField(help_text="0-based row index within the source CSV")
    row_data = models.JSONField(help_text="Raw CSV row as {column: value} dict")
    parse_error = models.TextField(blank=True, help_text="Non-empty if this row failed normalization")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Raw row {self.row_index} from job {self.job_id}"

    class Meta:
        ordering = ['job', 'row_index']
        unique_together = [('job', 'row_index')]


class NormalizedRecord(models.Model):
    """
    The canonical, normalized view of an emissions activity.

    All source-specific column names, date formats, and units are resolved
    into a consistent schema. Manual edits by analysts are tracked via
    the `edited_fields` JSON field and recorded in the AuditLog.

    Emission calculation:
      calculated_emissions_kg = activity_value * emission_factor.kg_co2e_per_unit

    Status lifecycle:
      PENDING_REVIEW → APPROVED (if correct)
      PENDING_REVIEW → FLAGGED (if suspicious, needs more review)
      FLAGGED → APPROVED (after analyst resolves)
      PENDING_REVIEW / FLAGGED → REJECTED (if invalid or duplicate)
    """
    STATUS_PENDING = 'PENDING_REVIEW'
    STATUS_APPROVED = 'APPROVED'
    STATUS_FLAGGED = 'FLAGGED'
    STATUS_REJECTED = 'REJECTED'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending Review'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_FLAGGED, 'Flagged'),
        (STATUS_REJECTED, 'Rejected'),
    ]
    SCOPE_CHOICES = [
        ('1', 'Scope 1'),
        ('2', 'Scope 2'),
        ('3', 'Scope 3'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='records')
    job = models.ForeignKey(IngestionJob, on_delete=models.CASCADE, related_name='normalized_records')
    raw_record = models.OneToOneField(
        RawRecord, on_delete=models.CASCADE, related_name='normalized',
        help_text="The source raw row this was derived from"
    )

    # --- Temporal ---
    activity_date = models.DateField(
        null=True, blank=True,
        help_text="Standardized activity/transaction date in YYYY-MM-DD"
    )

    # --- Source classification ---
    source_type = models.CharField(max_length=20, choices=IngestionJob.SOURCE_CHOICES)
    scope = models.CharField(max_length=1, choices=SCOPE_CHOICES, blank=True)
    category = models.CharField(
        max_length=100, blank=True,
        help_text="Human-readable category: 'Diesel Fuel', 'Grid Electricity', 'Flight — Economy'"
    )
    description = models.TextField(
        blank=True,
        help_text="Human-readable activity description from source data"
    )
    location = models.CharField(
        max_length=255, blank=True,
        help_text="Facility, site, or city extracted from source"
    )
    supplier_vendor = models.CharField(
        max_length=255, blank=True,
        help_text="Vendor name from SAP or airline from travel records"
    )

    # --- Activity quantity (normalized) ---
    activity_value = models.FloatField(
        null=True, blank=True,
        help_text="Standardized quantity (e.g. litres of fuel, kWh of electricity, km of travel)"
    )
    activity_unit = models.CharField(
        max_length=50, blank=True,
        help_text="Standardized unit: 'litres', 'kWh', 'passenger-km'"
    )

    # --- Emission calculation ---
    emission_factor = models.ForeignKey(
        EmissionFactor, on_delete=models.SET_NULL, null=True, blank=True,
        help_text="The EF used for calculation. SET_NULL so records survive EF updates."
    )
    emission_factor_value = models.FloatField(
        null=True, blank=True,
        help_text="Snapshot of EF kg_co2e_per_unit at time of calculation. Persisted for auditability."
    )
    calculated_emissions_kg = models.FloatField(
        null=True, blank=True,
        help_text="activity_value * emission_factor_value. Stored in kg CO2e."
    )

    # --- Review workflow ---
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    flag_reason = models.TextField(
        blank=True,
        help_text="Auto-populated for system flags; analyst-written for manual flags"
    )
    is_auto_flagged = models.BooleanField(
        default=False,
        help_text="True if this record was flagged by the parser's validation rules"
    )
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reviewed_records'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    # --- Edit tracking ---
    edited_fields = models.JSONField(
        default=dict, blank=True,
        help_text="Tracks manual edits: {field: {old: ..., new: ...}}"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return (
            f"{self.source_type} | {self.category} | "
            f"{self.activity_date} | {self.calculated_emissions_kg} kg CO2e"
        )

    class Meta:
        ordering = ['-activity_date', 'source_type']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'source_type']),
            models.Index(fields=['tenant', 'scope']),
            models.Index(fields=['activity_date']),
        ]


class AuditLog(models.Model):
    """
    Immutable event log. One entry per state change or edit on a NormalizedRecord.

    Design: AuditLog entries are NEVER updated or deleted. They form a tamper-evident
    history trail showing exactly who did what and when.

    For edits: `field_changes` stores {field: {before: X, after: Y}}.
    For status changes: `old_status` and `new_status` are populated.
    """
    ACTION_CREATE = 'CREATE'
    ACTION_EDIT = 'EDIT'
    ACTION_APPROVE = 'APPROVE'
    ACTION_FLAG = 'FLAG'
    ACTION_REJECT = 'REJECT'
    ACTION_SYSTEM_FLAG = 'SYSTEM_FLAG'
    ACTION_CHOICES = [
        (ACTION_CREATE, 'Record Created'),
        (ACTION_EDIT, 'Field Edited'),
        (ACTION_APPROVE, 'Approved'),
        (ACTION_FLAG, 'Flagged by Analyst'),
        (ACTION_REJECT, 'Rejected'),
        (ACTION_SYSTEM_FLAG, 'Auto-flagged by System'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    record = models.ForeignKey(NormalizedRecord, on_delete=models.CASCADE, related_name='audit_logs')
    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    old_status = models.CharField(max_length=20, blank=True)
    new_status = models.CharField(max_length=20, blank=True)
    field_changes = models.JSONField(
        default=dict, blank=True,
        help_text="{field_name: {before: old_value, after: new_value}}"
    )
    note = models.TextField(blank=True, help_text="Analyst note or rejection reason")
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return (
            f"{self.action} on {self.record_id} by "
            f"{self.performed_by} at {self.timestamp:%Y-%m-%d %H:%M}"
        )

    class Meta:
        ordering = ['-timestamp']
