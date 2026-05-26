# Tradeoffs

Building a prototype in 4 days means making some hard choices about what to focus on. To ensure the core data model and the analyst review workflow were bulletproof, I deliberately chose *not* to build three specific things.

### 1. Asynchronous Task Queues (Celery/Redis)
I processed the uploaded CSV files synchronously during the web request. I did not set up a background task queue like Celery or Redis.

**Why:** For a prototype where we're testing with a few dozen or a few hundred rows, synchronous processing is totally fine. But honestly, if this were hitting production and a client uploaded an SAP export with 50,000 rows, the web request would simply time out while trying to parse it. In a real deployment, we would absolutely need to offload the parsing step to an asynchronous worker and push real-time progress updates back to the frontend using WebSockets. I skipped it here because configuring the Redis infrastructure and the WebSocket connections would have eaten up too much of the 4-day timeframe.

### 2. A Dynamic CSV Column Mapper
Right now, the parsers are somewhat rigid. They expect the uploaded CSV files to have specific headers (like `Usage_kWh` for utilities, or `PostingDate` for SAP). I didn't build a visual interface where users can manually drag and drop their weird custom column names to match our internal database schema.

**Why:** Building a truly robust, user-friendly data mapping interface—especially one that might use Machine Learning to auto-predict column mappings—is basically an entire SaaS product on its own. It's incredibly complex to get right. Since the assignment focused on what happens *after* the data is in the system (the normalization and review process), I hardcoded the parsers to expect the sample data formats. In reality, client data is wildly unpredictable, so a dynamic ingestion layer (perhaps integrating a third-party tool like Flatfile) would be mandatory.

### 3. Granular Role-Based Access Control (RBAC)
While I built strict Tenant isolation (so Company A can never see Company B's data), I did not build a deep, granular permissions matrix for the users *within* a Tenant. I didn't create distinct roles for "Data Submitters", "Junior Analysts", "Senior Approvers", and "External Auditors".

**Why:** Adding granular RBAC tends to bloat the backend logic significantly. You end up writing dozens of permission-checking decorators and building out admin UI screens just to manage who can click what. I assumed for this prototype that anyone logged into a specific Tenant's workspace acts as a trusted Analyst. Of course, before letting an actual external auditor log into the platform, we'd need strict read-only permission boundaries.
