# Data Model Architecture

The data model is engineered to support a highly reliable, auditable, and isolated environment for enterprise clients uploading diverse ESG data.

## 1. Multi-Tenancy (`Tenant` and `TenantUser`)
Every piece of user-generated data in the system is strictly bound to a `Tenant`. 
- `Tenant`: Represents a single enterprise client (e.g., "Acme Corp").
- `TenantUser`: Links Django's built-in `User` to a specific `Tenant` and defines their role (e.g., 'analyst').
- **Why**: Security is paramount. Rather than relying on simple `user_id` foreign keys, binding all data to a Tenant ensures that a user can never accidentally query or modify records belonging to a different enterprise client. All API views filter by the current user's Tenant before any other operations occur.

## 2. Source-of-Truth Tracking (`IngestionJob` and `RawRecord`)
We never mutate the original uploaded data.
- `IngestionJob`: Tracks a single file upload event (who uploaded it, when, what the file was, and its processing status).
- `RawRecord`: Stores the exact, unmutated JSON representation of a single row from an uploaded file, linked to the `IngestionJob`.
- **Why**: If an auditor asks "Where did this emissions number come from?", we can trace it back to the exact row in the exact spreadsheet uploaded by a specific user on a specific date. 

## 3. Normalization & Scopes (`NormalizedRecord`)
This is the core table where analysts work.
- Extracts disparate fields from `RawRecord` into a standard schema: `activity_date`, `description`, `location`, `supplier_vendor`.
- Stores the `activity_value` and `activity_unit` (e.g., 500, "liters").
- Stores the calculated `calculated_emissions_kg` based on an applied `EmissionFactor`.
- **Categorization**: Each record is strictly categorized into `Scope 1` (direct fuel), `Scope 2` (purchased electricity), or `Scope 3` (value chain/travel).

## 4. Audit Trail (`AuditLog`)
Compliance requires strict tracking of analyst actions.
- Every state change (approving, flagging, rejecting) or field edit (correcting a typo in a location or adjusting a date) automatically generates an `AuditLog` entry.
- The log records the `performed_by` user, the `action`, the `old_status`, the `new_status`, and a JSON diff of `field_changes`.
- **Why**: Auditors need to see the exact lifecycle of a record. If an analyst modifies an activity value from 500 to 5000, the system retains the history of who made the change and when, ensuring total transparency.
