# Decisions & Ambiguity Resolution

## 1. Defining "Normalization"
**Ambiguity**: The prompt states "We need to ingest all of it [SAP, Utilities, Travel], normalize it, and let our analysts review." Normalization can mean schema alignment, or unit conversion, or both.
**Decision**: I decided normalization must include both schema alignment (mapping custom CSV headers to standard fields like `activity_date` and `activity_value`) AND applying emission factors to convert raw activity into standard `kg CO2e` instantly. 
**Why**: Analysts shouldn't just be reviewing raw data; they need to see the calculated carbon footprint during review to catch anomalies (e.g., a typo resulting in 10,000 tonnes of CO2).

## 2. Source Subsets Handled vs. Ignored
**SAP Fuel & Procurement**:
- Handled: Fleet fuel consumption (diesel, petrol) by volume (liters/gallons).
- Ignored: Financial procurement data (spend-based emissions). Spend-based emissions require complex mapping of MCC/SIC codes to EEIO (Environmentally-Extended Input-Output) factors, which is too complex for a prototype.

**Utility Portals (Electricity)**:
- Handled: Standard grid electricity consumption measured in kWh.
- Ignored: Time-of-Use (TOU) and market-based (Renewable Energy Certificates) matching. The prototype calculates strictly on a location-based method.

**Corporate Travel**:
- Handled: Flight segments (short-haul, medium-haul, long-haul) measured in passenger-kilometers.
- Ignored: Hotel stays and rental cars, to focus the prototype exclusively on distance-based flight emissions.

## 3. Data Editing Capabilities
**Ambiguity**: Should analysts be able to edit the raw data, or only flag it?
**Decision**: Analysts cannot edit the `RawRecord`, but they *can* edit the `NormalizedRecord` fields (date, value, description) with an automatic audit trail attached.
**Why**: Real-world data is messy. If an analyst spots a clear typo (e.g., year '2042' instead of '2024'), sending it back to the client delays the process. Allowing audited edits speeds up onboarding while maintaining compliance.

## Questions for the PM
1. **Handling Updates**: "If a client uploads a corrected spreadsheet a week later, should the system attempt to automatically overwrite existing records (via deduplication logic), or append them as new rows and rely on analysts to flag duplicates?"
2. **Review Workflows**: "Do we need a multi-tier review process (e.g., Junior Analyst drafts -> Senior Analyst approves) before data goes to auditors?"
3. **Emission Factors**: "Are we licensing emission factor databases like DEFRA/EPA directly into the platform, or will clients provide custom factors they want us to use?"
