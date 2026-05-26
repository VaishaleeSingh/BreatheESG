# Tradeoffs

## 1. Synchronous File Processing vs. Asynchronous Celery Queues
**What was deliberately not built**: I did not implement an asynchronous task queue (like Celery/Redis) to handle file parsing in the background. 
**Why**: For a 4-day prototype focused on demonstrating normalization and review workflows, the overhead of configuring Redis, Celery workers, and WebSocket infrastructure for real-time frontend progress updates was too high. The current synchronous implementation works well for prototype-scale files (<10,000 rows). In a real deployment with massive SAP exports, this would immediately block the web worker and timeout, necessitating an asynchronous rewrite.

## 2. Advanced CSV Mapping & Machine Learning Schemas
**What was deliberately not built**: I did not build a dynamic CSV mapper UI where users can visually map their custom column headers to our database schema. The parsers are currently hardcoded to expect specific column names.
**Why**: Building a robust mapping interface (with drag-and-drop or ML-assisted column prediction) is practically an entire product on its own. To meet the deadline, I hardcoded parsers specifically for the provided sample formats. Real-world client data is completely unpredictable, so a production system would absolutely need a dynamic mapping/ingestion layer (e.g., using a service like Flatfile or a custom LLM mapper).

## 3. Sophisticated User Role Management (RBAC)
**What was deliberately not built**: I built basic authentication and Tenant isolation, but I did not build granular Role-Based Access Control (e.g., separating "Data Submitters", "Junior Analysts", "Senior Approvers", and "Auditors").
**Why**: The prompt prioritized data ingestion, normalization, and review. Implementing a strict permissions matrix would bloat the backend logic and require additional UI screens to manage users. The current assumption is that anyone logged into a Tenant acts as a trusted Analyst. In reality, strict permission boundaries are legally required before external auditors are allowed into the platform.
