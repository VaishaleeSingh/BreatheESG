"""
Management command: seed_data

Creates the default tenant, admin user, analyst user, and all emission factors.

Usage:
    python manage.py seed_data

This is idempotent — safe to run multiple times.
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils.text import slugify

from ingestion.models import EmissionFactor, Tenant, TenantUser


# ---------------------------------------------------------------------------
# Emission Factor seed data
# Source: UK DEFRA 2023 Greenhouse Gas Reporting Conversion Factors
# Source: US EPA eGRID 2022 (US average electricity)
# Source: IPCC AR6 (aviation radiative forcing factor = 1.9x uplift applied to fuel burn)
# ---------------------------------------------------------------------------

EMISSION_FACTORS = [
    # === Scope 1: Stationary Combustion / Mobile Combustion ===
    {
        "activity_type": "diesel",
        "unit": "litres",
        "kg_co2e_per_unit": 2.68954,
        "scope": "1",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: Diesel for combustion. Includes CO2, CH4, N2O in CO2e.",
    },
    {
        "activity_type": "petrol",
        "unit": "litres",
        "kg_co2e_per_unit": 2.31210,
        "scope": "1",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: Petrol (motor gasoline) combustion.",
    },
    {
        "activity_type": "natural_gas",
        "unit": "litres",
        "kg_co2e_per_unit": 0.00203,
        "scope": "1",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: Natural gas per litre. More commonly measured in kWh or m3.",
    },
    {
        "activity_type": "natural_gas",
        "unit": "kWh",
        "kg_co2e_per_unit": 0.18293,
        "scope": "1",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: Natural gas per kWh (gross calorific value).",
    },
    {
        "activity_type": "lpg",
        "unit": "litres",
        "kg_co2e_per_unit": 1.55537,
        "scope": "1",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: Liquefied Petroleum Gas combustion.",
    },
    {
        "activity_type": "hvo",
        "unit": "litres",
        "kg_co2e_per_unit": 0.19520,
        "scope": "1",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: Hydrotreated Vegetable Oil — significantly lower than fossil diesel.",
    },

    # === Scope 2: Purchased Electricity ===
    {
        "activity_type": "electricity_uk",
        "unit": "kWh",
        "kg_co2e_per_unit": 0.20493,
        "scope": "2",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: UK grid average (location-based). Includes transmission & distribution losses.",
    },
    {
        "activity_type": "electricity_us",
        "unit": "kWh",
        "kg_co2e_per_unit": 0.38600,
        "scope": "2",
        "source": EmissionFactor.SOURCE_EPA,
        "notes": "US EPA eGRID 2022: US national average grid emission factor.",
    },
    {
        "activity_type": "electricity_eu",
        "unit": "kWh",
        "kg_co2e_per_unit": 0.27600,
        "scope": "2",
        "source": EmissionFactor.SOURCE_IPCC,
        "notes": "IEA 2022: EU27 average grid emission factor.",
    },

    # === Scope 3: Business Travel — Aviation ===
    # DEFRA aviation EFs include a Radiative Forcing Index (RFI) uplift of 1.9x
    {
        "activity_type": "flight_economy",
        "unit": "passenger-km",
        "kg_co2e_per_unit": 0.25498,
        "scope": "3",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: Short/medium/long haul economy class average with RFI uplift (1.9x).",
    },
    {
        "activity_type": "flight_premium_economy",
        "unit": "passenger-km",
        "kg_co2e_per_unit": 0.40428,
        "scope": "3",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: Premium economy — 1.58x economy factor.",
    },
    {
        "activity_type": "flight_business",
        "unit": "passenger-km",
        "kg_co2e_per_unit": 0.61005,
        "scope": "3",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: Business class — 2.39x economy factor (larger seat = more space = more fuel per pax).",
    },
    {
        "activity_type": "flight_first",
        "unit": "passenger-km",
        "kg_co2e_per_unit": 1.01993,
        "scope": "3",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: First class — 4.0x economy factor.",
    },

    # === Scope 3: Business Travel — Ground ===
    {
        "activity_type": "train_national_rail",
        "unit": "passenger-km",
        "kg_co2e_per_unit": 0.03694,
        "scope": "3",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: UK National Rail average (electric + diesel mix).",
    },
    {
        "activity_type": "car_average",
        "unit": "passenger-km",
        "kg_co2e_per_unit": 0.17100,
        "scope": "3",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: Average UK car, average occupancy (~1.5 pax).",
    },
    {
        "activity_type": "bus_average",
        "unit": "passenger-km",
        "kg_co2e_per_unit": 0.10290,
        "scope": "3",
        "source": EmissionFactor.SOURCE_DEFRA,
        "notes": "DEFRA 2023: Local bus average.",
    },
]


class Command(BaseCommand):
    help = "Seeds default tenant, users, and emission factors for prototype use."

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("=== Breathe ESG Seed Data ==="))

        # --- Tenant ---
        tenant, created = Tenant.objects.get_or_create(
            slug="acme-corp",
            defaults={"name": "Acme Corporation"},
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"  ✓ Created tenant: {tenant.name}"))
        else:
            self.stdout.write(f"  → Tenant already exists: {tenant.name}")

        # --- Admin user ---
        admin_user, created = User.objects.get_or_create(
            username="admin",
            defaults={
                "email": "admin@acme.example.com",
                "first_name": "Admin",
                "last_name": "User",
                "is_staff": True,
                "is_superuser": True,
            },
        )
        if created:
            admin_user.set_password("breathe2024!")
            admin_user.save()
            self.stdout.write(self.style.SUCCESS("  ✓ Created admin user (admin / breathe2024!)"))
        TenantUser.objects.get_or_create(
            user=admin_user,
            defaults={"tenant": tenant, "role": "admin"},
        )

        # --- Analyst user ---
        analyst_user, created = User.objects.get_or_create(
            username="analyst",
            defaults={
                "email": "analyst@acme.example.com",
                "first_name": "Sarah",
                "last_name": "Chen",
                "is_staff": False,
            },
        )
        if created:
            analyst_user.set_password("breathe2024!")
            analyst_user.save()
            self.stdout.write(self.style.SUCCESS("  ✓ Created analyst user (analyst / breathe2024!)"))
        TenantUser.objects.get_or_create(
            user=analyst_user,
            defaults={"tenant": tenant, "role": "analyst"},
        )

        # --- Emission Factors ---
        ef_created = 0
        for ef_data in EMISSION_FACTORS:
            _, created = EmissionFactor.objects.get_or_create(
                activity_type=ef_data["activity_type"],
                unit=ef_data["unit"],
                defaults={
                    "kg_co2e_per_unit": ef_data["kg_co2e_per_unit"],
                    "scope": ef_data["scope"],
                    "source": ef_data["source"],
                    "notes": ef_data["notes"],
                },
            )
            if created:
                ef_created += 1

        self.stdout.write(self.style.SUCCESS(f"  ✓ Created {ef_created} emission factors ({len(EMISSION_FACTORS) - ef_created} already existed)"))

        self.stdout.write(self.style.SUCCESS("\n=== Seed complete ==="))
        self.stdout.write("  Login at http://localhost:8000/api/  with:")
        self.stdout.write("  Admin: admin / breathe2024!")
        self.stdout.write("  Analyst: analyst / breathe2024!")
