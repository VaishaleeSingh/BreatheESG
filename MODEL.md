# Data Model Architecture

When I sat down to design the data model for this prototype, my main goal was to make sure it could handle the messy reality of enterprise data without compromising on security or auditability. Here's a breakdown of how the database is structured and the reasoning behind it.

### Multi-Tenancy (Keeping Data Isolated)
The absolute biggest risk in a SaaS platform like this is one client accidentally seeing another client's emissions data. To prevent this, I built strict multi-tenancy into the core of the app. 

Instead of just linking data to a `user_id`, everything is bound to a `Tenant` (which represents the enterprise client, like "Acme Corp"). Users are linked to a Tenant via a `TenantUser` profile. This means that at the database level, every single query is automatically filtered by the current user's Tenant before anything else happens. It’s a fail-safe way to ensure complete data isolation.

### The Source of Truth 
One of the core requirements was to track exactly where a piece of data came from. If an auditor asks, "Where did you get this 5,000 liters of diesel from?", we need a solid answer.

To solve this, I split the data ingestion process. When a user uploads a file, the system creates an `IngestionJob` to track the metadata (who uploaded it, what the file was named, and when). Then, the system reads the file and saves the exact, untouched JSON representation of every single row into a `RawRecord` table. 

We never mutate the `RawRecord`. It acts as our permanent, immutable source of truth.

### Normalization & Categorization
Analysts can't work easily with raw JSON dumps, so the system parses those raw records and extracts the important bits into a standard schema called `NormalizedRecord`. 

This is the table that powers the dashboard and the review screens. It pulls out the `activity_date`, `description`, `location`, and the raw `activity_value`. During this step, the system also applies the appropriate `EmissionFactor` to calculate the final `kg_co2e` footprint on the fly. 

To handle the scoping requirements, the system strictly tags every normalized record as Scope 1 (direct fuels), Scope 2 (electricity), or Scope 3 (travel/supply chain) based on the factor used.

### The Audit Trail
Finally, compliance and auditing are massive parts of ESG reporting. You can't just let an analyst change a number from 500 to 5,000 without tracking it.

I built an `AuditLog` table that acts as a ledger. Anytime an analyst approves, flags, or edits a field on a normalized record, a new audit entry is generated. It records exactly who made the change, what time they did it, the old status, the new status, and a detailed JSON diff of exactly which fields were altered. This gives auditors complete transparency into the lifecycle of every single emission record.
