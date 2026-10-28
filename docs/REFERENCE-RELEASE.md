# Reusable reference package — October 28, 2026

This package is a generic starter for **[Theatre Name]**, not a backup of any live theatre's roster. Replace the theatre placeholder in the starter workbook's Shows.Venue and Settings.CalendarTitle. Configure your own workbook ID, deployment URLs, account emails, venue address and timezone during installation. No production identifiers or roster have been included.

## Included updates

- Current version 1.3 Apps Script backend bundles, with corresponding split source files.
- Full public Calendar.html and authenticated Editor.html replacements with AM/PM presentation.
- Performances display both **Call Time** (arrival in the building) and **Places/Show Start**. Other timed event types display **Call Time** only.
- All-day notes and Time TBD entries stay above timed entries. Multi-day dates remain inclusive in the workbook and exclusive at the end of an ICS event.
- Optional Performances columns M:P: AllDay, TimeTBD, StaffingRequired, EventTitle. Original A:L columns stay in place.
- Empty time lookups remain blank after Sync rather than displaying midnight.
- A timed entry may have no specified finish; no duration is invented. Personal subscriptions include assigned seats, not availability-only or bare calendar-note entries.

## Configuration, not hard-coded theatre policy

The interface reads the actual Call and Curtain values from the workbook. It does not infer a schedule from weekdays or rewrite times. Configure each theatre's dates and times through Performances or Run Rules. Curtain remains the storage/API field name for Places/Show Start. Native browser time-entry controls may follow the browser's locale; this is separate from the AM/PM schedule display.

The Streamlit demo now embeds these same production screens and shared scheduling logic, including all-day notes, Time TBD, optional finish times and the paired labels. It provides public, staffing and administration views with fictional roles and memory-backed service adapters. This demonstrates the interface and data rules, not live Google authentication or permissions. See REFERENCE-PARITY.md.

## Safe use

For a **new installation**, follow INSTALL.md and replace placeholder configuration before publishing. The starter demonstration show is unpublished and audit timestamps start blank; initialization and subsequent edits stamp current revisions.

For an **existing installation**, do not replace its workbook with the starter. Back up your source and data. Install either the combined deployment/*.gs files or the matching split source files, not both. Preserve script properties, permissions and existing deployment URLs. See deployment/UPGRADE.md. A code package does not itself authorize changing sharing or credentials.

## Verification

Backend/core, authenticated editing, administration, calendar grouping, all-day/feed and blank-time tests are included. Both full HTMLs were separately tested through their complete scripts, including filtering, dialogs, save/discard, admin preview and all 1,440 minute values in each interface. The starter workbook's placeholders and extra headers were rendered and checked, its existing formulas preserved, and numeric date portability tested.

Streamlit AppTest, offline HTML DOM integration, the demo adapter suite, the Apps Script suites and workbook transport checks pass. See VERIFICATION.md for the current verification boundary. No live deployment, Google authentication, authorization, protected-range enforcement or third-party calendar refresh was newly verified by this packaging task.
