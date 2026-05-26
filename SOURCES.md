# Data Sources Research & Sample Data

## 1. SAP Fuel & Procurement
**What I researched**: Exported ERP fuel reports (SAP/Oracle). These reports typically track fuel purchases for company fleets, industrial machinery, or generators.
**What I learned**: ERP exports are notoriously messy. They often combine financial data (cost centers, invoice dates) with physical data (liters, gallons), and the headers are heavily abbreviated (e.g., `PstngDate`, `QtyInUnit`). Crucially, units vary dramatically (liters, gallons, barrels).
**The Sample Data (`sap_fuel.csv`)**:
Includes `PostingDate`, `CostCenter`, `MaterialDescription` (e.g., Diesel, Petrol), `Quantity`, and `UnitOfMeasure`. 
**What would break in a real deployment**:
- SAP date formats vary wildly depending on localization (`DD.MM.YYYY` vs `MM/DD/YYYY`). My parser currently expects strict ISO formats (`YYYY-MM-DD`).
- Material descriptions might be coded (e.g., `MAT-492` instead of "Diesel"), requiring an intermediate lookup table to map SAP codes to standard fuels.

## 2. Utility Portals (Electricity)
**What I researched**: Web scraped or API-exported data from major utility providers (e.g., PG&E, ConEdison). 
**What I learned**: Utility bills don't provide a single "activity date." They provide billing cycles (e.g., "Jan 15 to Feb 14"). Furthermore, many portals lump electric, gas, and water into a single CSV.
**The Sample Data (`utility_electricity.csv`)**:
Includes `BillingStart`, `BillingEnd`, `ServiceAddress`, `MeterNumber`, `Usage_kWh`, and `Charge_USD`.
**What would break in a real deployment**:
- In reality, mapping emissions from a billing cycle requires "prorating." If a bill spans Jan 15 - Feb 14, the emissions must be split across January and February for accurate monthly reporting. My prototype simplifies this by taking the `BillingEnd` date as the sole activity date.
- It assumes the file only contains electricity; handling gas/water mixed files would break the parser.

## 3. Corporate Travel (e.g., Concur)
**What I researched**: Exports from Travel Management Companies (TMCs) like SAP Concur or Egencia.
**What I learned**: Travel data is highly fragmented. A single trip might have 4 rows (Train, Hotel, Flight Out, Flight Back). For flights, the distance is rarely provided; instead, they provide routing codes (e.g., `JFK-LHR`).
**The Sample Data (`travel_flights.csv`)**:
Includes `BookingDate`, `TravelerName`, `Origin`, `Destination`, `Class`, and `Distance_km`.
**What would break in a real deployment**:
- My sample data assumes the TMC conveniently calculated the `Distance_km` for us. In the real world, this is almost never true. We would receive `JFK-LHR`, and the system would break because it lacks a geospatial database to calculate the great-circle distance between airport IATA codes. 
- Flight emissions also heavily depend on seat class (Economy vs First Class), which my parser currently ignores when looking up the emission factor.
