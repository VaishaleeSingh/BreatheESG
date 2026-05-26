"""
Breathe ESG — DRF Serializers

Serializers are kept lean and explicit.
We use separate serializers for list vs detail views to control field exposure.
"""

from rest_framework import serializers
from django.contrib.auth.models import User

from .models import (
    AuditLog,
    EmissionFactor,
    IngestionJob,
    NormalizedRecord,
    RawRecord,
    Tenant,
    TenantUser,
)


# ---------------------------------------------------------------------------
# Auth / Tenant
# ---------------------------------------------------------------------------

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email"]


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ["id", "name", "slug", "created_at"]


class SignupSerializer(serializers.Serializer):
    """Used for registering a new user and creating a new tenant."""
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    company_name = serializers.CharField(max_length=255)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value


# ---------------------------------------------------------------------------
# Ingestion Job
# ---------------------------------------------------------------------------

class IngestionJobSerializer(serializers.ModelSerializer):
    uploaded_by = UserSerializer(read_only=True)

    class Meta:
        model = IngestionJob
        fields = [
            "id", "source_type", "original_filename", "status",
            "row_count", "error_count", "error_detail",
            "uploaded_by", "created_at", "completed_at",
        ]
        read_only_fields = fields


class IngestionJobCreateSerializer(serializers.Serializer):
    """Used for the file upload endpoint."""
    source_type = serializers.ChoiceField(choices=IngestionJob.SOURCE_CHOICES)
    file = serializers.FileField()

    def validate_file(self, value):
        if not value.name.endswith(".csv"):
            raise serializers.ValidationError("Only CSV files are accepted.")
        if value.size > 50 * 1024 * 1024:  # 50 MB limit
            raise serializers.ValidationError("File size must not exceed 50 MB.")
        return value


# ---------------------------------------------------------------------------
# Raw Record
# ---------------------------------------------------------------------------

class RawRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = RawRecord
        fields = ["id", "row_index", "row_data", "parse_error", "created_at"]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Emission Factor
# ---------------------------------------------------------------------------

class EmissionFactorSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmissionFactor
        fields = ["id", "activity_type", "unit", "kg_co2e_per_unit", "scope", "source", "notes"]


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------

class AuditLogSerializer(serializers.ModelSerializer):
    performed_by = UserSerializer(read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id", "action", "performed_by",
            "old_status", "new_status",
            "field_changes", "note", "timestamp",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Normalized Record — List view (compact)
# ---------------------------------------------------------------------------

class NormalizedRecordListSerializer(serializers.ModelSerializer):
    """
    Compact serializer for the review table.
    Omits raw_record and audit_logs to keep list responses fast.
    """
    reviewed_by = UserSerializer(read_only=True)
    emission_factor = EmissionFactorSerializer(read_only=True)

    class Meta:
        model = NormalizedRecord
        fields = [
            "id", "source_type", "scope", "category",
            "activity_date", "description", "location", "supplier_vendor",
            "activity_value", "activity_unit",
            "emission_factor", "emission_factor_value", "calculated_emissions_kg",
            "status", "flag_reason", "is_auto_flagged",
            "reviewed_by", "reviewed_at",
            "created_at", "updated_at",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Normalized Record — Detail view (full with raw + audit)
# ---------------------------------------------------------------------------

class NormalizedRecordDetailSerializer(serializers.ModelSerializer):
    """
    Full serializer for the detail / drawer view.
    Includes the raw_record for Raw vs Normalized comparison.
    """
    raw_record = RawRecordSerializer(read_only=True)
    emission_factor = EmissionFactorSerializer(read_only=True)
    reviewed_by = UserSerializer(read_only=True)
    audit_logs = AuditLogSerializer(many=True, read_only=True)
    job = IngestionJobSerializer(read_only=True)

    class Meta:
        model = NormalizedRecord
        fields = [
            "id", "source_type", "scope", "category",
            "activity_date", "description", "location", "supplier_vendor",
            "activity_value", "activity_unit",
            "emission_factor", "emission_factor_value", "calculated_emissions_kg",
            "status", "flag_reason", "is_auto_flagged", "edited_fields",
            "reviewed_by", "reviewed_at",
            "raw_record", "job", "audit_logs",
            "created_at", "updated_at",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Normalized Record — Edit (analyst patch)
# ---------------------------------------------------------------------------

class NormalizedRecordEditSerializer(serializers.ModelSerializer):
    """
    Allows analysts to patch specific fields. 
    Tracks changes in edited_fields for audit purposes.
    """
    class Meta:
        model = NormalizedRecord
        fields = [
            "activity_date", "description", "location", "supplier_vendor",
            "activity_value", "activity_unit", "scope", "category",
        ]

    def update(self, instance, validated_data):
        changes = {}
        for field, new_value in validated_data.items():
            old_value = getattr(instance, field)
            # Convert date to string for JSON serializability
            if hasattr(old_value, "isoformat"):
                old_value = old_value.isoformat()
            if hasattr(new_value, "isoformat"):
                new_value_str = new_value.isoformat()
            else:
                new_value_str = new_value
            if str(old_value) != str(new_value_str):
                changes[field] = {"before": old_value, "after": new_value_str}

        instance = super().update(instance, validated_data)

        if changes:
            # Merge with existing edited_fields
            existing = instance.edited_fields or {}
            existing.update(changes)
            instance.edited_fields = existing
            instance.save(update_fields=["edited_fields"])

        return instance, changes


# ---------------------------------------------------------------------------
# Action Serializer (approve / flag / reject)
# ---------------------------------------------------------------------------

class RecordActionSerializer(serializers.Serializer):
    """Serializer for single-record action (approve, flag, reject)."""
    ACTION_CHOICES = ["approve", "flag", "reject"]
    action = serializers.ChoiceField(choices=ACTION_CHOICES)
    note = serializers.CharField(required=False, allow_blank=True, max_length=1000)


class BulkActionSerializer(serializers.Serializer):
    """Serializer for bulk action on multiple records."""
    ACTION_CHOICES = ["approve", "flag", "reject"]
    action = serializers.ChoiceField(choices=ACTION_CHOICES)
    record_ids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
        max_length=500,
    )
    note = serializers.CharField(required=False, allow_blank=True, max_length=1000)


# ---------------------------------------------------------------------------
# Dashboard Stats
# ---------------------------------------------------------------------------

class DashboardStatsSerializer(serializers.Serializer):
    """Aggregated KPI stats for the dashboard. Read-only output only."""
    total_records = serializers.IntegerField()
    pending_review = serializers.IntegerField()
    flagged = serializers.IntegerField()
    approved = serializers.IntegerField()
    rejected = serializers.IntegerField()

    total_emissions_kg = serializers.FloatField()
    scope1_emissions_kg = serializers.FloatField()
    scope2_emissions_kg = serializers.FloatField()
    scope3_emissions_kg = serializers.FloatField()

    recent_jobs = IngestionJobSerializer(many=True)
    emissions_by_source = serializers.DictField()
