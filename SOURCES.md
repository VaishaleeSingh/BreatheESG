# Data Sources Research & Sample Data

When I started looking into the actual formats of the data sources requested (SAP, Utility Portals, and Concur), I quickly realized that corporate data is famously messy. Here is a breakdown of what I found in my research, what my sample data looks like, and what would inevitably break in a real-world deployment.

### 1. SAP Fuel & Procurement
**What I researched:** I looked into standard ERP fuel reports (from systems like SAP or Oracle). These reports usually track fuel purchases for company vehicle fleets or industrial machinery.
**What I learned:** ERP exports are a nightmare. They often jam financial data (like cost centers and invoice dates) right next to physical data (like liters or gallons). The column headers are usually heavily abbreviated in weird ways (like `PstngDate` or `QtyInUnit`), and the units of measure vary wildly depending on the region.
**The Sample Data (`sap_fuel.csv`):** I built a sample file that includes `PostingDate`, `CostCenter`, `MaterialDescription` (e.g., Diesel, Petrol), `Quantity`, and `UnitOfMeasure`. 
**What would break in reality:**
- **Dates:** SAP date formats change drastically based on local settings (`DD.MM.YYYY` in Europe vs `MM/DD/YYYY` in the US). My parser currently expects strict ISO formats (`YYYY-MM-DD`). It would definitely crash on a European export.
- **Material Codes:** In my sample, the description just says "Diesel." In reality, SAP often just outputs an internal material code (like `MAT-492`). We would need to build an intermediate lookup table that maps a client's specific SAP codes to our standard fuel types.

### 2. Utility Portals (Electricity)
**What I researched:** I analyzed how data comes out of web-scraped or API-exported utility portals (like PG&E or ConEdison). 
**What I learned:** Utility bills don't give you a single, clean "activity date." They bill in cycles (e.g., "Jan 15 to Feb 14"). Also, a lot of portals just dump electricity, gas, and water data all into the exact same CSV.
**The Sample Data (`utility_electricity.csv`):** My sample includes `BillingStart`, `BillingEnd`, `ServiceAddress`, `MeterNumber`, `Usage_kWh`, and `Charge_USD`.
**What would break in reality:**
- **Prorating:** Because utility bills span across months, you can't just assign the emissions to a single month. If a bill covers Jan 15 to Feb 14, the emissions actually need to be prorated (split) across January and February for accurate monthly ESG reporting. To keep the prototype simple, I cheated a bit and just used the `BillingEnd` date as the sole activity date.
- **Mixed Data:** My parser assumes the file is *only* electricity data. If a client uploads a file that also has rows for natural gas or water usage, the parser would break trying to apply an electricity emission factor to it.

### 3. Corporate Travel (e.g., Concur)
**What I researched:** I looked at exports from Travel Management Companies (TMCs) like SAP Concur and Egencia.
**What I learned:** Travel data is incredibly fragmented. A single business trip might generate 4 or 5 separate rows of data (the train to the airport, the hotel, the flight out, the flight back). Worse, for flights, they almost never tell you the actual distance flown. They just give you routing codes (like `JFK-LHR`).
**The Sample Data (`travel_flights.csv`):** My sample includes `BookingDate`, `TravelerName`, `Origin`, `Destination`, `Class`, and a nice, clean `Distance_km` column.
**What would break in reality:**
- **Missing Distances:** My sample data pretends that the TMC conveniently calculated the `Distance_km` for us. In the real world, this is a luxury you rarely get. We would likely only receive the airport codes (`JFK-LHR`), which means our system would break because we don't have a geospatial database built-in to calculate the great-circle distance between two airports.
- **Seat Classes:** Flight emissions change drastically depending on where you sit (First Class takes up more space and therefore gets a higher share of the plane's carbon footprint than Economy). Right now, my parser completely ignores the `Class` column when it looks up the emission factor.
