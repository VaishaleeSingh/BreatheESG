# Breathe ESG — Data Ingestion & Review Platform 🌱

Welcome to Breathe ESG! 

When big companies try to calculate their carbon footprint, the data they get is often a total mess. Some of it comes from SAP database exports, some from utility bill PDFs, and some from employee travel platforms. It's chaotic.

This project is a clean, modern web application designed to take all that messy data, **clean it up automatically**, calculate the emissions, and organize it into a beautiful dashboard where a human analyst can review and approve it.

---

## 🚀 How It Works (The Big Picture)

1. **Upload**: An analyst drops a messy CSV file (like Fuel, Electricity, or Travel data) into our interface.
2. **Raw Storage**: We immediately save the exact, untouched raw data into the database. This ensures we always have a pristine, unedited copy for auditors.
3. **Normalization (The Brain)**: The Python backend automatically reads the file and translates the messy data into a single, clean format (standardizing dates, units, and categories).
4. **Carbon Calculation**: The system matches the activity with the correct "Emission Factor" (e.g., 1 kWh of UK electricity = 0.207 kg CO2) and multiplies it to get the final carbon footprint.
5. **Review & Audit**: The cleaned data shows up on the frontend Review Dashboard. If the system spots something weird (like a negative fuel amount or a massive quantity), it auto-flags it. Otherwise, a human analyst reviews it, clicks "Approve", and it's locked in!

### How We Built It
* **Decoupled Stack**: The Backend (Python/Django) and Frontend (React/Tailwind) are completely separate and talk via APIs.
* **Two-Layer Architecture**: We don't overwrite data. We keep the raw data in one table and the cleaned data in another to guarantee data integrity.
* **Immutable Audit Trail**: In carbon accounting, traceability is legally required. Every time an analyst edits a field or approves a record, a permanent log is created that cannot be deleted.
* **Multi-Tenancy**: The database is structured so that multiple companies can use the platform securely without their data mixing.

---

## 🛠️ The Tech Stack

| What it does | The Technology We Used |
|---|---|
| **Backend & APIs** | Django 5.x + Django REST Framework |
| **Database** | SQLite (for local dev) / PostgreSQL (for production) |
| **Data Parsing** | Pandas 2.2 (Python) |
| **Frontend** | React 18 + Vite + TypeScript |
| **Styling** | Tailwind CSS 3 (using a custom Aqua & Cream palette) |
| **Data Tables** | Tanstack Table v8 |

---

## 💻 Quick Start (Running it Locally)

Want to run it on your own machine? You'll need Python 3.11+ and Node.js 18+ installed.

### 1. Set up the Backend

Open a terminal and run these commands to set up the Python environment:

```bash
cd backend
python -m venv venv

# Activate the virtual environment:
# On Windows: venv\Scripts\activate
# On Mac/Linux: source venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py seed_data

# Start the server!
python manage.py runserver
```
*(The backend is now running at **http://localhost:8000**)*

### 2. Set up the Frontend

Open a **second** terminal window and run:

```bash
cd frontend
npm install
npm run dev
```
*(The frontend is now running at **http://localhost:5173**)*

---

## 🧪 How to Test the Flow

1. Open **http://localhost:5173** in your browser.
2. Log in with the test credentials: 
   - **Analyst:** Username: `analyst`, Password: `breathe2024!`
   - **Admin:** Username: `admin`, Password: `breathe2024!`
3. Go to the **Upload Data** tab.
4. Click the **SAP Fuel & Procurement** card and upload the `sap_fuel.csv` file (you can find this in the `sample_data/` folder of this project).
5. Head over to the **Review Records** tab.
6. You'll see all your data neatly organized. Click on any row to open the side panel and try out the **Approve**, **Flag**, or **Reject** buttons to see the Audit Trail in action!

---

## 🚢 Deploying to Production

### Render
- **Backend Build Command:** `cd backend && pip install -r requirements.txt`
- **Backend Start Command:** `cd backend && python manage.py migrate && python manage.py seed_data && gunicorn breathe_esg.wsgi`
- **Frontend Build Command:** `cd frontend && npm install && npm run build`
- *Make sure to set `VITE_API_URL` on the frontend, and `DATABASE_URL` on the backend.*

---

## 📚 Technical Appendix

### Auto-Flagging Rules
The system automatically catches weird data. Here are a few examples:
* **SAP Fuel**: Flags quantities > 50,000 litres (likely a typo) or negative numbers.
* **Utility**: Flags usage > 500,000 kWh (unless it's a data center, this is too high).
* **Missing Data**: Flags anything missing a date or using an unknown unit.

### Deep Dive Documentation
If you want to dive deeper into why we built things the way we did, check out these files:
- [DECISIONS.md](./DECISIONS.md) — Why we chose this architecture.
- [MODEL.md](./MODEL.md) — The database schema and diagrams.
- [TRADEOFFS.md](./TRADEOFFS.md) — The compromises we made for this prototype.
- [SOURCES.md](./SOURCES.md) — Where our emission factors (like UK DEFRA and US EPA) come from.

---
*Prototype built for demonstration purposes.*
