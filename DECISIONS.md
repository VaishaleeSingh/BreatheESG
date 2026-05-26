# Decisions & Ambiguity Resolution

While building this prototype, I ran into a few spots where the requirements were a bit ambiguous. Here is a breakdown of how I interpreted them, the choices I made to keep the project moving, and a few things I'd love to chat with the PM about.

### What does "Normalization" actually mean?
The prompt mentioned we needed to "ingest all of it, normalize it, and let our analysts review." Normalization can mean a lot of things—does it just mean making the column headers match, or does it mean actually doing the carbon math?

I decided that true normalization in this context has to include applying the emission factors to calculate the carbon footprint (`kg CO2e`) instantly. If we just showed analysts the raw gallons of fuel or kWh of electricity without the resulting carbon number, it would be much harder for them to spot anomalies. Seeing a weirdly huge CO2e number is usually the best way to catch a typo in the raw data, so I made sure those calculations happen before the review stage.

### Deciding what to handle vs. what to ignore
Given the 4-day timeline, I had to be strategic about which subsets of the data sources I actually tackled. 

For **SAP Fuel & Procurement**, I focused strictly on volume-based fleet fuel consumption (like liters of diesel). I completely avoided spend-based procurement data. Mapping financial spend to Environmentally-Extended Input-Output (EEIO) factors is a massive, complex undertaking that felt out of scope for a quick prototype.

For **Utility Portals**, I kept it simple by sticking to standard grid electricity measured in kWh. I ignored things like Time-of-Use (TOU) rates or market-based Renewable Energy Certificates (RECs) because the prototype is built around a standard location-based calculation method.

For **Corporate Travel**, I focused entirely on flight segments (short, medium, and long-haul distances). I intentionally ignored hotel stays and rental car data so I could build a really solid, focused parser just for flights.

### Letting analysts edit data
Another big ambiguity was whether analysts should just be reviewing and flagging data, or if they should be allowed to actually fix it themselves.

Real-world client data is incredibly messy. If a client accidentally types "2042" instead of "2024", kicking the entire spreadsheet back to them just to fix a typo wastes everyone's time. I decided to allow analysts to directly edit the `NormalizedRecord` fields (like dates, values, and descriptions). However, to ensure we don't break compliance, I made sure that every single edit triggers an automatic, un-deletable entry in the `AuditLog`. This strikes a good balance between speed and security.

### Questions I'd ask the PM
If we were taking this to production, I'd want to get clarity on a few things:
1. **Handling re-uploads:** "If a client realizes they made a mistake and uploads a corrected version of their spreadsheet a week later, should the system try to automatically overwrite the old records via deduplication logic? Or do we just append the new rows and rely on the analysts to manually flag the duplicates?"
2. **Review workflows:** "Do we need a multi-tier review system? For example, does a Junior Analyst draft the corrections, and a Senior Analyst has to sign off before the data is officially marked as 'approved' for auditors?"
3. **Emission Factor databases:** "Are we planning to license heavy-duty databases like DEFRA or the EPA directly into our platform, or is the expectation that enterprise clients will provide their own custom factors that they want us to use?"
