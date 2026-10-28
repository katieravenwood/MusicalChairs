# Reference parity — 1.3

This release integrates the Apps Script application changes developed for the theatre. It does not import or connect to Brown Bear or any theatre workbook.

| Feature | Reference demonstration | Google deployment |
| --- | --- | --- |
| Public month/list calendar and roster dialogs | Actual Calendar.html | Same file |
| Staffing month grid; one selected performance per dialog | Actual Editor.html | Same file |
| AM/PM, Call Time / Places/Show Start | Same production formatting | Same formatting; stored times remain HH:mm |
| All-day / multi-day / Time TBD / no finish | Editable examples and same display/feed rules | Optional M:P fields; no invented times |
| First names; stable FirstLast identity | Fictional IDs, two Mikes with different chairs | Players records and GoogleEmail |
| Eligible players replace anyone in their chair | Selectable fictional roles; same authorization rule | Verified Google account + server checks |
| Admin across every chair/show | Administrator demo role | Access administrator list |
| Assigned player and independent unavailable lists | Same validation and coverage calculations | Persisted per seat |
| Outside substitute flag | Same regular-roster logic | Same logic |
| Blank new seats | Sync and bulk generation create Open seats | Same behavior |
| Stale save protection | In-memory record fingerprints | Server fingerprints and script lock |
| Admin tab autoload and record forms | Actual UI; same record validation | Sheets reads and atomic writes |
| Personnel, shows, chairs, dates, bulk rules | Editable fictional records | Persisted configuration |
| Bulk preview/commit | Same run planner; token checked before commit | Server planner and token |
| Public/editor reciprocal navigation | Switches shared in-memory views | Separate deployed URLs |
| Personal calendars | ICS download using production generator | Permanent live ICS subscriptions |
| Apply chair permissions and maintenance | Explicit simulation messages | Actual range protections and triggers |
| Workbook link | Fictional JSON viewer in admin | Real workbook URL in admin |
| Instruction guide | Inline demo help | Configurable shared read-only guide |
| Change history, undo and export | Demo-only whole-state undo for admin, fictional JSON export | Production audit log and native recovery |

## Demo exercise

1. Open Public calendar and inspect an uncovered Keys 2 performance. Its assigned player may still be Alex while Alex and Sam are marked unavailable.
2. Select Sam as the demo identity and open Staffing editor. Only eligible Keys 2 chairs appear, including dates assigned to Alex. Select one performance; other performances do not appear in its popup.
3. Record conflicts, assign an eligible replacement and save one seat. Return via Public Calendar to see the result. Casey is an eligible outside substitute for Keys 2.
4. Switch to Administrator. Select Administration; the forms load automatically. Edit a show, cancel an individual performance, or change a run rule and Preview bulk dates. Commit adds only missing performances, with every new seat open.
5. Choose either Mike in the public filter. Chair labels distinguish them; each snapshot contains only that player's assignments.

## Runtime boundary

The wrapper has one in-memory model shared by public and editor screens within a page. Reloading starts fresh. No browser storage, Google credentials, theatre IDs or live services are used. Role selection demonstrates behavior but is not a security boundary. Production files are embedded directly; demo/runtime.js replaces only service operations and never ships in an Apps Script bundle.

The starter workbook retains legacy fictional IDs; existing IDs remain supported. For new production players use permanent FirstLast IDs as instructed in INSTALL.md. Do not rename an existing production ID without migrating its references and subscriptions.
