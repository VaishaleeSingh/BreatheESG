"""
Breathe ESG — CSV Ingestion Parsers

Each parser follows the same contract:
  parse_<source>(job, tenant, user, file_obj) -> (success_count, error_count)

Design principles:
- Raw rows are ALWAYS saved first, even if normalization fails.
- Normalization errors are recorded on RawRecord.parse_error.
- Auto-flagging happens at the end of normalization, before saving NormalizedRecord.
- Emission factor lookup is best-effort: missing EF results in a FLAGGED record.
- All dates are normalized to Python date objects; failures yield None (not a crash).
- Units are normalized to: litres (fuel), kWh (electricity), passenger-km (travel).
"""

import logging
import re
from datetime import date, datetime
from typing import Optional

import numpy as np
import pandas as pd

from django.utils import timezone

from .models import (
    AuditLog,
    EmissionFactor,
    IngestionJob,
    NormalizedRecord,
    RawRecord,
    Tenant,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

# Ordered list of date formats to try during parsing.
# We try the most specific / unambiguous ones first.
_DATE_FORMATS = [
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%d-%m-%Y",
    "%m-%d-%Y",
    "%d %b %Y",
    "%B %d, %Y",
    "%b %d, %Y",
    "%d %B %Y",
    "%Y/%m/%d",
    "%d.%m.%Y",
]


def _parse_date(value) -> Optional[date]:
    """
    Attempt to parse a date value from a variety of string formats.
    Returns a Python date object or None if parsing fails.
    Handles NaN/None/empty strings gracefully.
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    s = str(value).strip()
    if not s or s.lower() in ("nan", "none", "n/a", "-"):
        return None
    # pandas first (handles ISO and many common formats)
    try:
        return pd.to_datetime(s, dayfirst=True).date()
    except Exception:
        pass
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _clean_float(value) -> Optional[float]:
    """
    Convert a value to float, stripping currency symbols and commas.
    Returns None for empty/NaN/unparseable values.
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    s = re.sub(r"[£$€,\s]", "", str(value).strip())
    if not s or s.lower() in ("nan", "none", "n/a", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _clean_str(value, default: str = "") -> str:
    """Strip whitespace and return a clean string; return default for NaN/None."""
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return default
    return str(value).strip()


def _lookup_emission_factor(activity_type: str, unit: str) -> Optional[EmissionFactor]:
    """
    Look up the best-matching emission factor.
    Tries exact match first, then falls back to activity_type-only match.
    """
    try:
        return EmissionFactor.objects.get(activity_type=activity_type, unit=unit)
    except EmissionFactor.DoesNotExist:
        return None
    except EmissionFactor.MultipleObjectsReturned:
        return EmissionFactor.objects.filter(activity_type=activity_type, unit=unit).first()


def _create_audit_log(record: NormalizedRecord, user, action: str, note: str = ""):
    AuditLog.objects.create(
        record=record,
        performed_by=user,
        action=action,
        new_status=record.status,
        note=note,
    )


def _calculate_and_save(record: NormalizedRecord):
    """Apply emission factor lookup and calculate emissions in kg CO2e."""
    if record.activity_value is not None and record.emission_factor:
        record.emission_factor_value = record.emission_factor.kg_co2e_per_unit
        record.calculated_emissions_kg = record.activity_value * record.emission_factor_value
    elif record.activity_value is not None and not record.emission_factor:
        # No EF found — flag for analyst review
        record.status = NormalizedRecord.STATUS_FLAGGED
        record.is_auto_flagged = True
        record.flag_reason = (
            record.flag_reason + "\n" if record.flag_reason else ""
        ) + f"No emission factor found for category '{record.category}' / unit '{record.activity_unit}'."


# ---------------------------------------------------------------------------
# Suspicious value thresholds
# ---------------------------------------------------------------------------

SAP_MAX_QUANTITY = 50_000  # litres — above this is likely a data entry error
SAP_MIN_QUANTITY = 0       # negative quantities are invalid

UTILITY_MAX_KWH = 500_000   # kWh per billing period — data centre scale
UTILITY_MIN_KWH = 0

TRAVEL_MAX_KM = 25_000      # ~longest commercial flight (SYD-LHR is ~17,000 km)
TRAVEL_MIN_KM = 0


# ---------------------------------------------------------------------------
# Fuel type normalization map
# ---------------------------------------------------------------------------

FUEL_TYPE_MAP = {
    # Diesel variants
    "diesel": "diesel",
    "diesel fuel": "diesel",
    "gas oil": "diesel",
    "gasoil": "diesel",
    "derv": "diesel",
    # Petrol / Gasoline
    "petrol": "petrol",
    "gasoline": "petrol",
    "unleaded": "petrol",
    "ulsp": "petrol",
    # Natural Gas
    "natural gas": "natural_gas",
    "ng": "natural_gas",
    "gas": "natural_gas",
    "methane": "natural_gas",
    # LPG
    "lpg": "lpg",
    "liquified petroleum gas": "lpg",
    "propane": "lpg",
    "butane": "lpg",
    # HVO
    "hvo": "hvo",
    "hydrotreated vegetable oil": "hvo",
    # Unknown
}

FUEL_SCOPE_MAP = {
    "diesel": "1",
    "petrol": "1",
    "natural_gas": "1",
    "lpg": "1",
    "hvo": "1",
}

FUEL_EF_UNIT = "litres"  # all fuel quantities normalized to litres

UNIT_TO_LITRES = {
    "l": 1.0,
    "litre": 1.0,
    "litres": 1.0,
    "liter": 1.0,
    "liters": 1.0,
    "lt": 1.0,
    "gal": 4.546,      # UK gallon
    "gallon": 4.546,
    "gallons": 4.546,
    "usgal": 3.785,    # US gallon
    "kg": None,        # Requires density — flag for analyst
    "m3": 1000.0,      # cubic metre of liquid fuel ≈ 1000 litres
}

# ---------------------------------------------------------------------------
# Transport mode normalization
# ---------------------------------------------------------------------------

TRANSPORT_MAP = {
    "flight": "flight",
    "flights": "flight",
    "air": "flight",
    "airplane": "flight",
    "plane": "flight",
    "aviation": "flight",
    "train": "train",
    "rail": "train",
    "railway": "train",
    "national rail": "train",
    "car": "car",
    "taxi": "car",
    "cab": "car",
    "automobile": "car",
    "vehicle": "car",
    "bus": "bus",
    "coach": "bus",
    "ferry": "ferry",
    "boat": "ferry",
    "ship": "ferry",
    "motorcycle": "motorcycle",
    "motorbike": "motorcycle",
}

TRAVEL_CLASS_MAP = {
    "economy": "economy",
    "eco": "economy",
    "e": "economy",
    "coach": "economy",
    "premium economy": "premium_economy",
    "premium eco": "premium_economy",
    "pe": "premium_economy",
    "w": "premium_economy",
    "business": "business",
    "biz": "business",
    "j": "business",
    "c": "business",
    "first": "first",
    "first class": "first",
    "1st": "first",
    "f": "first",
}

FLIGHT_EF_MAP = {
    "economy": "flight_economy",
    "premium_economy": "flight_premium_economy",
    "business": "flight_business",
    "first": "flight_first",
}


# ---------------------------------------------------------------------------
# SAP Fuel & Procurement Parser
# ---------------------------------------------------------------------------

def parse_sap(job: IngestionJob, tenant: Tenant, user, file_obj) -> tuple[int, int]:
    """
    Parse a SAP Fuel & Procurement CSV file.

    Expected (messy) columns (case-insensitive matching):
      Document_Date, Vendor_Name, Item_Description, Quantity, UoM,
      Net_Amount_GBP, Fuel_Type, Cost_Center, GL_Account, Plant, Notes

    Returns (success_count, error_count).
    """
    try:
        df = pd.read_csv(file_obj, dtype=str, skip_blank_lines=True)
    except Exception as e:
        job.status = IngestionJob.STATUS_FAILED
        job.error_detail = f"Failed to read CSV: {e}"
        job.save(update_fields=["status", "error_detail"])
        return 0, 0

    # Normalize column headers: strip whitespace, lowercase for matching
    df.columns = [c.strip() for c in df.columns]
    col_lower = {c.lower().replace(" ", "_"): c for c in df.columns}

    def get_col(variants):
        """Return the first matching column name from a list of lowercase variants."""
        for v in variants:
            if v in col_lower:
                return col_lower[v]
        return None

    col_date = get_col(["document_date", "date", "posting_date", "transaction_date"])
    col_vendor = get_col(["vendor_name", "vendor", "supplier", "supplier_name"])
    col_desc = get_col(["item_description", "description", "material_description", "item_desc"])
    col_qty = get_col(["quantity", "qty", "amount_litres", "volume"])
    col_uom = get_col(["uom", "unit", "unit_of_measure", "units"])
    col_fuel = get_col(["fuel_type", "fuel", "material_type", "product_type"])
    col_cost = get_col(["net_amount_gbp", "net_amount", "cost", "amount", "total_cost"])
    col_location = get_col(["plant", "site", "location", "facility"])

    success, errors = 0, 0

    for idx, row in df.iterrows():
        raw_data = {k: _clean_str(v) for k, v in row.items()}
        raw = RawRecord.objects.create(
            tenant=tenant,
            job=job,
            row_index=idx,
            row_data=raw_data,
        )

        try:
            activity_date = _parse_date(row.get(col_date) if col_date else None)
            quantity_raw = _clean_float(row.get(col_qty) if col_qty else None)
            uom_raw = _clean_str(row.get(col_uom, "")).lower().strip()
            fuel_raw = _clean_str(row.get(col_fuel, "")).lower().strip()
            vendor = _clean_str(row.get(col_vendor, "")).title()
            description = _clean_str(row.get(col_desc, ""))
            location = _clean_str(row.get(col_location, ""))
            cost = _clean_float(row.get(col_cost) if col_cost else None)

            # Normalize fuel type
            fuel_normalized = FUEL_TYPE_MAP.get(fuel_raw)
            if not fuel_normalized and fuel_raw:
                # Try partial match
                for key, val in FUEL_TYPE_MAP.items():
                    if key in fuel_raw or fuel_raw in key:
                        fuel_normalized = val
                        break

            # Normalize quantity to litres
            quantity_litres = None
            conversion = UNIT_TO_LITRES.get(uom_raw)
            flag_reasons = []

            if quantity_raw is not None and conversion is not None:
                quantity_litres = quantity_raw * conversion
            elif quantity_raw is not None and conversion is None and uom_raw in ("kg",):
                flag_reasons.append(f"Unit '{uom_raw}' requires density conversion — cannot auto-convert to litres.")
                quantity_litres = quantity_raw  # Store raw value, flagged
            elif quantity_raw is not None:
                quantity_litres = quantity_raw  # Unknown unit — store raw

            # Validate
            if quantity_litres is not None:
                if quantity_litres < SAP_MIN_QUANTITY:
                    flag_reasons.append(f"Negative quantity ({quantity_litres:.2f}) is suspicious.")
                if quantity_litres > SAP_MAX_QUANTITY:
                    flag_reasons.append(f"Very large quantity ({quantity_litres:.0f} litres) — please verify.")
            if activity_date is None:
                flag_reasons.append("Could not parse activity date.")
            if not fuel_normalized:
                flag_reasons.append(f"Unrecognized fuel type '{fuel_raw}'.")

            # Emission factor lookup
            ef = _lookup_emission_factor(fuel_normalized or "", FUEL_EF_UNIT) if fuel_normalized else None

            record = NormalizedRecord(
                tenant=tenant,
                job=job,
                raw_record=raw,
                activity_date=activity_date,
                source_type=IngestionJob.SOURCE_SAP,
                scope=FUEL_SCOPE_MAP.get(fuel_normalized or "", "1"),
                category=fuel_normalized.replace("_", " ").title() if fuel_normalized else "Unknown Fuel",
                description=description or f"{fuel_normalized or 'Fuel'} purchase from {vendor}",
                location=location,
                supplier_vendor=vendor,
                activity_value=quantity_litres,
                activity_unit=FUEL_EF_UNIT,
                emission_factor=ef,
            )

            if flag_reasons:
                record.status = NormalizedRecord.STATUS_FLAGGED
                record.is_auto_flagged = True
                record.flag_reason = " | ".join(flag_reasons)

            _calculate_and_save(record)
            record.save()

            _create_audit_log(record, user, AuditLog.ACTION_CREATE)
            if record.is_auto_flagged:
                _create_audit_log(record, None, AuditLog.ACTION_SYSTEM_FLAG, record.flag_reason)

            success += 1

        except Exception as e:
            logger.exception(f"SAP parser error on row {idx}: {e}")
            raw.parse_error = str(e)
            raw.save(update_fields=["parse_error"])
            errors += 1

    return success, errors


# ---------------------------------------------------------------------------
# Utility Electricity Parser
# ---------------------------------------------------------------------------

def parse_utility(job: IngestionJob, tenant: Tenant, user, file_obj) -> tuple[int, int]:
    """
    Parse a Utility Electricity CSV file.

    Expected (messy) columns:
      Billing_Period, Account_Number, Meter_Number, Facility_Name, Address,
      Region, Usage, Unit, Total_Charges_GBP, Tariff_Code, Notes

    Returns (success_count, error_count).
    """
    try:
        df = pd.read_csv(file_obj, dtype=str, skip_blank_lines=True)
    except Exception as e:
        job.status = IngestionJob.STATUS_FAILED
        job.error_detail = f"Failed to read CSV: {e}"
        job.save(update_fields=["status", "error_detail"])
        return 0, 0

    df.columns = [c.strip() for c in df.columns]
    col_lower = {c.lower().replace(" ", "_"): c for c in df.columns}

    def get_col(variants):
        for v in variants:
            if v in col_lower:
                return col_lower[v]
        return None

    col_period = get_col(["billing_period", "period", "month", "invoice_period", "billing_month"])
    col_account = get_col(["account_number", "account_no", "account", "acc_no"])
    col_facility = get_col(["facility_name", "facility", "site_name", "site", "premises"])
    col_address = get_col(["address", "street_address", "site_address"])
    col_region = get_col(["region", "country", "state", "location", "territory"])
    col_usage = get_col(["usage", "consumption", "kwh", "electricity_usage", "energy"])
    col_unit = get_col(["unit", "units", "uom", "usage_unit"])
    col_charges = get_col(["total_charges_gbp", "total_charges", "amount", "invoice_amount", "cost"])

    # UK grid electricity emission factor (Scope 2, market-based)
    ef_uk = _lookup_emission_factor("electricity_uk", "kWh")
    ef_us = _lookup_emission_factor("electricity_us", "kWh")

    success, errors = 0, 0

    for idx, row in df.iterrows():
        raw_data = {k: _clean_str(v) for k, v in row.items()}
        raw = RawRecord.objects.create(
            tenant=tenant,
            job=job,
            row_index=idx,
            row_data=raw_data,
        )

        try:
            # Parse billing period — extract a representative date (first of the period)
            period_str = _clean_str(row.get(col_period, "")) if col_period else ""
            activity_date = _parse_billing_period(period_str)

            usage_raw = _clean_float(row.get(col_usage) if col_usage else None)
            unit_raw = _clean_str(row.get(col_unit, "")).lower().strip() if col_unit else "kwh"
            facility = _clean_str(row.get(col_facility, "")) if col_facility else ""
            region = _clean_str(row.get(col_region, "")).strip() if col_region else ""
            account = _clean_str(row.get(col_account, "")) if col_account else ""
            charges = _clean_float(row.get(col_charges) if col_charges else None)

            # Normalize to kWh
            usage_kwh = None
            if usage_raw is not None:
                if unit_raw in ("kwh", "kw/h", "kilowatt-hour", "kilowatt hour"):
                    usage_kwh = usage_raw
                elif unit_raw in ("mwh", "megawatt-hour", "megawatt hour"):
                    usage_kwh = usage_raw * 1000
                elif unit_raw in ("gwh", "gigawatt-hour"):
                    usage_kwh = usage_raw * 1_000_000
                else:
                    usage_kwh = usage_raw  # Assume kWh if unknown

            # Select EF by region
            region_upper = region.upper()
            if region_upper in ("US", "USA", "UNITED STATES", "CA", "NY", "TX"):
                ef = ef_us
            else:
                ef = ef_uk  # Default to UK

            flag_reasons = []
            if usage_kwh is not None and usage_kwh < UTILITY_MIN_KWH:
                flag_reasons.append(f"Negative usage ({usage_kwh:.2f} kWh) — may be a credit note or data error.")
            if usage_kwh is not None and usage_kwh > UTILITY_MAX_KWH:
                flag_reasons.append(f"Unusually high usage ({usage_kwh:,.0f} kWh) — please verify this is not a data entry error.")
            if usage_kwh == 0 and charges and charges > 0:
                flag_reasons.append("Zero usage with non-zero charge — may be a standing charge only.")
            if activity_date is None:
                flag_reasons.append(f"Could not parse billing period '{period_str}'.")
            if not facility:
                flag_reasons.append("Facility name is missing.")

            record = NormalizedRecord(
                tenant=tenant,
                job=job,
                raw_record=raw,
                activity_date=activity_date,
                source_type=IngestionJob.SOURCE_UTILITY,
                scope="2",
                category="Grid Electricity",
                description=f"Electricity — {facility or account or 'Unknown facility'} ({period_str})",
                location=facility,
                supplier_vendor=account,
                activity_value=usage_kwh,
                activity_unit="kWh",
                emission_factor=ef,
            )

            if flag_reasons:
                record.status = NormalizedRecord.STATUS_FLAGGED
                record.is_auto_flagged = True
                record.flag_reason = " | ".join(flag_reasons)

            _calculate_and_save(record)
            record.save()

            _create_audit_log(record, user, AuditLog.ACTION_CREATE)
            if record.is_auto_flagged:
                _create_audit_log(record, None, AuditLog.ACTION_SYSTEM_FLAG, record.flag_reason)

            success += 1

        except Exception as e:
            logger.exception(f"Utility parser error on row {idx}: {e}")
            raw.parse_error = str(e)
            raw.save(update_fields=["parse_error"])
            errors += 1

    return success, errors


def _parse_billing_period(period_str: str) -> Optional[date]:
    """
    Parse a billing period string into a representative date (first of the month).
    Handles: 'Jan 2024', '01/2024', '2024-01', 'January 2024', '2024-01-01 to 2024-01-31'
    """
    if not period_str:
        return None
    # Handle range format — take the start date
    if " to " in period_str.lower():
        period_str = period_str.lower().split(" to ")[0].strip()
    # Try direct date parse first
    d = _parse_date(period_str)
    if d:
        return d
    # Try month-year formats
    for fmt in ["%b %Y", "%B %Y", "%m/%Y", "%Y-%m", "%Y/%m", "%m-%Y"]:
        try:
            return datetime.strptime(period_str.strip(), fmt).replace(day=1).date()
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Corporate Travel Parser
# ---------------------------------------------------------------------------

def parse_travel(job: IngestionJob, tenant: Tenant, user, file_obj) -> tuple[int, int]:
    """
    Parse a Corporate Travel CSV file.

    Expected (messy) columns:
      Travel_Date, Employee_ID, Employee_Name, Department, Origin, Destination,
      Transport_Mode, Travel_Class, Distance, Distance_Unit, Nights_Hotel,
      Carbon_Offset, Cost_GBP, Project_Code, Notes

    Returns (success_count, error_count).
    """
    try:
        df = pd.read_csv(file_obj, dtype=str, skip_blank_lines=True)
    except Exception as e:
        job.status = IngestionJob.STATUS_FAILED
        job.error_detail = f"Failed to read CSV: {e}"
        job.save(update_fields=["status", "error_detail"])
        return 0, 0

    df.columns = [c.strip() for c in df.columns]
    col_lower = {c.lower().replace(" ", "_"): c for c in df.columns}

    def get_col(variants):
        for v in variants:
            if v in col_lower:
                return col_lower[v]
        return None

    col_date = get_col(["travel_date", "date", "departure_date", "trip_date"])
    col_emp_id = get_col(["employee_id", "emp_id", "staff_id", "id"])
    col_emp_name = get_col(["employee_name", "name", "traveller", "traveler", "employee"])
    col_dept = get_col(["department", "dept", "division", "team", "cost_center"])
    col_origin = get_col(["origin", "from", "departure", "departure_city", "start"])
    col_dest = get_col(["destination", "to", "arrival", "arrival_city", "end"])
    col_mode = get_col(["transport_mode", "mode", "transport", "travel_mode", "type"])
    col_class = get_col(["travel_class", "class", "cabin_class", "fare_class", "booking_class"])
    col_dist = get_col(["distance", "dist", "km", "miles", "distance_km", "distance_miles"])
    col_dist_unit = get_col(["distance_unit", "dist_unit", "unit"])
    col_offset = get_col(["carbon_offset", "offset", "co2_offset", "green"])

    success, errors = 0, 0

    for idx, row in df.iterrows():
        raw_data = {k: _clean_str(v) for k, v in row.items()}
        raw = RawRecord.objects.create(
            tenant=tenant,
            job=job,
            row_index=idx,
            row_data=raw_data,
        )

        try:
            activity_date = _parse_date(row.get(col_date) if col_date else None)
            emp_name = _clean_str(row.get(col_emp_name, "")) if col_emp_name else ""
            emp_id = _clean_str(row.get(col_emp_id, "")) if col_emp_id else ""
            dept = _clean_str(row.get(col_dept, "")) if col_dept else ""
            origin = _clean_str(row.get(col_origin, "")) if col_origin else ""
            destination = _clean_str(row.get(col_dest, "")) if col_dest else ""
            mode_raw = _clean_str(row.get(col_mode, "")).lower().strip() if col_mode else ""
            class_raw = _clean_str(row.get(col_class, "")).lower().strip() if col_class else ""
            dist_raw = _clean_float(row.get(col_dist) if col_dist else None)
            dist_unit_raw = _clean_str(row.get(col_dist_unit, "")).lower().strip() if col_dist_unit else "km"
            offset_raw = _clean_str(row.get(col_offset, "")).lower().strip() if col_offset else ""

            # Normalize mode
            mode = TRANSPORT_MAP.get(mode_raw)
            if not mode and mode_raw:
                for key, val in TRANSPORT_MAP.items():
                    if key in mode_raw or mode_raw in key:
                        mode = val
                        break

            # Normalize class
            travel_class = TRAVEL_CLASS_MAP.get(class_raw, "economy")

            # Normalize distance to km
            dist_km = None
            if dist_raw is not None:
                if dist_unit_raw in ("km", "kilometre", "kilometres", "kilometer", "kilometers"):
                    dist_km = dist_raw
                elif dist_unit_raw in ("mi", "mile", "miles"):
                    dist_km = dist_raw * 1.60934
                else:
                    dist_km = dist_raw  # Assume km if unknown

            # Passenger-km = distance (already per passenger for corporate travel records)
            passenger_km = dist_km

            # Carbon offset flag
            is_offset = offset_raw in ("y", "yes", "true", "1", "offset")

            # EF lookup based on mode and class
            ef = None
            ef_key = None
            scope = "3"
            if mode == "flight":
                ef_key = FLIGHT_EF_MAP.get(travel_class, "flight_economy")
                ef = _lookup_emission_factor(ef_key, "passenger-km")
            elif mode == "train":
                ef = _lookup_emission_factor("train_national_rail", "passenger-km")
                ef_key = "train_national_rail"
            elif mode == "car":
                ef = _lookup_emission_factor("car_average", "passenger-km")
                ef_key = "car_average"
            elif mode == "bus":
                ef = _lookup_emission_factor("bus_average", "passenger-km")
                ef_key = "bus_average"

            category = f"{(mode or 'unknown').title()}"
            if mode == "flight":
                category = f"Flight — {travel_class.replace('_', ' ').title()}"
            elif mode == "train":
                category = "Rail Travel"
            elif mode == "car":
                category = "Car / Taxi"

            flag_reasons = []
            if dist_km is not None and dist_km < TRAVEL_MIN_KM:
                flag_reasons.append(f"Negative distance ({dist_km:.2f} km).")
            if dist_km is not None and dist_km > TRAVEL_MAX_KM:
                flag_reasons.append(f"Distance {dist_km:,.0f} km exceeds maximum plausible commercial route. Please verify.")
            if activity_date is None:
                flag_reasons.append("Could not parse travel date.")
            if not mode:
                flag_reasons.append(f"Unrecognized transport mode '{mode_raw}'.")
            if not origin or not destination:
                flag_reasons.append("Origin or destination is missing.")

            record = NormalizedRecord(
                tenant=tenant,
                job=job,
                raw_record=raw,
                activity_date=activity_date,
                source_type=IngestionJob.SOURCE_TRAVEL,
                scope=scope,
                category=category,
                description=f"{category}: {origin} → {destination} ({emp_name or emp_id})",
                location=f"{origin} → {destination}",
                supplier_vendor=emp_name or emp_id,
                activity_value=passenger_km,
                activity_unit="passenger-km",
                emission_factor=ef,
            )

            # Apply offset: if carbon offset purchased, net emissions = 0
            if is_offset and record.calculated_emissions_kg:
                record.calculated_emissions_kg = 0
                flag_reasons.append("Carbon offset applied — emissions set to zero.")

            if flag_reasons:
                record.status = NormalizedRecord.STATUS_FLAGGED
                record.is_auto_flagged = True
                record.flag_reason = " | ".join(flag_reasons)

            _calculate_and_save(record)
            record.save()

            _create_audit_log(record, user, AuditLog.ACTION_CREATE)
            if record.is_auto_flagged:
                _create_audit_log(record, None, AuditLog.ACTION_SYSTEM_FLAG, record.flag_reason)

            success += 1

        except Exception as e:
            logger.exception(f"Travel parser error on row {idx}: {e}")
            raw.parse_error = str(e)
            raw.save(update_fields=["parse_error"])
            errors += 1

    return success, errors


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

PARSER_MAP = {
    IngestionJob.SOURCE_SAP: parse_sap,
    IngestionJob.SOURCE_UTILITY: parse_utility,
    IngestionJob.SOURCE_TRAVEL: parse_travel,
}


def run_parser(job: IngestionJob, tenant: Tenant, user, file_obj) -> tuple[int, int]:
    """
    Entry point for all parsers. Selects the correct parser based on job.source_type,
    updates job status, and returns (success_count, error_count).
    """
    parser_fn = PARSER_MAP.get(job.source_type)
    if not parser_fn:
        job.status = IngestionJob.STATUS_FAILED
        job.error_detail = f"No parser registered for source type '{job.source_type}'"
        job.save(update_fields=["status", "error_detail"])
        return 0, 0

    job.status = IngestionJob.STATUS_PROCESSING
    job.save(update_fields=["status"])

    try:
        success, errors = parser_fn(job, tenant, user, file_obj)
        job.status = IngestionJob.STATUS_SUCCESS if errors == 0 else IngestionJob.STATUS_SUCCESS
        job.row_count = success + errors
        job.error_count = errors
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "row_count", "error_count", "completed_at"])
        return success, errors
    except Exception as e:
        logger.exception(f"Critical parser failure for job {job.id}: {e}")
        job.status = IngestionJob.STATUS_FAILED
        job.error_detail = str(e)
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "error_detail", "completed_at"])
        return 0, 0
