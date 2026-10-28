# Data and permission design

## Records and ownership

Shows define productions and publication status. Performances define independently editable dates and timing. Chairs are scoped to shows and define instrumentation and eligibility. Players have stable FirstLast IDs (no spaces), public first-name display labels and private-to-workbook GoogleEmail account fields. Repeated display names are supported. EligiblePlayerIDs joins to PlayerID to derive chair editors; manual EditorEmails is no longer an authority. AdminEmail in Access grants all-chair access across every show. Authorization never uses the name currently assigned to a performance. Each chair tab has one assignment per PerformanceID.

An assignment is identified by PerformanceID plus ChairID. Its player may change while the performance and chair remain stable. Calendar UIDs additionally include PlayerID, allowing each personal subscription to maintain a distinct assignment identity without matching names inside event text.

The stored assignment is independent of its neighboring chairs. Updates in the chair's E:G input cells cannot replace a serialized full-roster object because there is no such object to replace.

## Production boundaries

| Boundary | Reads | Writes |
| --- | --- | --- |
| Musician's Google Sheets session | Shared workbook | Native permission-controlled cells |
| Bound workbook script | Current workbook | Workbook setup, generated records, metadata and log |
| Authenticated editor | Configured workbook and Google identity | Authorized seat saves and admin configuration |
| Standalone public script | Configured workbook through read-only Sheets scope | No writes |
| Google / Apple / Outlook subscriber | Public personal ICS URL | Subscriber-controlled calendar cache |
| Streamlit reference demo | Fictional local seed | Page-local memory, reset on reload |

Do not combine the bound tools with the publicly deployed project. All non-entry functions in the public project end in an underscore and are unavailable through `google.script.run`. Its only public entrypoint is doGet. No raw worksheet endpoint or arbitrary workbook identifier is accepted from a request.

The public reader uses the advanced Sheets API with `spreadsheets.readonly`; it does not use `SpreadsheetApp.openById`, which requires the broader spreadsheet scope. Date/time fields are returned as formatted strings, with other values left unformatted so checkbox booleans remain booleans.

## Time and feed behavior

Production date/time inputs use Eastern wall time. The feed converts them to UTC using America/New_York rules, including daylight-saving time. Invalid spring-forward times and ambiguous fall-back hours are rejected. Finish dates can differ from performance dates. Calls on the preceding calendar day are outside this starter's schema.

ICS output escapes text, folds lines to at most 75 UTF-8 bytes, uses CRLF, and provides stable UIDs, revisions and timestamps. Cancelled performances stay in feeds with STATUS:CANCELLED. Reassignments remove the event from the outgoing person's feed and add it to the replacement's feed. Client deletion/cancellation handling must be tested in all intended calendar applications.

The global ScheduleRevision and LastEditAt fields update after native edits processed by the installed trigger and after scripted bulk operations. There can be a brief delay while a trigger runs. External API writes do not fire Sheets edit triggers; if an integration is later added, it must update revision metadata explicitly.

## Limitations

- Google Sheets range protection is collaboration control, not a secure boundary against an adversarial workbook editor.
- Google may omit an editor's identity from trigger events. The log marks unavailable identities honestly.
- Apps Script has runtime, concurrency, storage and daily quotas. Long runs and large groups require load testing.
- Public first-name schedules can be read by anyone who gets the URL. Feed URLs in this version are public filters, not private bearer credentials.
- Public notes must never include private contacts or restricted music links.
- Google file ownership, script deployment ownership and trigger ownership are separate responsibilities.
- The reference Streamlit role selector is a demonstration, not authentication.
- Streamlit's downloadable ICS file is a snapshot. The live feed is supplied by Apps Script.

## Availability

UnavailablePlayerIDs is a separate per-performance, per-chair list. RegularPlayerIDs defines the regular cover pool; it falls back to the eligible-player list when blank. Unmarked availability remains unknown. The public service derives coverage on every read; the bound edit trigger also updates the protected Coverage display column. Recording a conflict preserves the assignment and all other chairs. Public conflict lists contain first-name labels only, with no reasons. Calendar subscriptions still select only the assigned player ID.

The shared canEditChair_ helper implements the intended authenticated editor rule, but the current production calendar still exposes read-only HTML/JSON/ICS. The bound tools apply the same eligibility rule to native Sheets protections. Account and roster changes require Apply chair permissions; changing file sharing is separate. GoogleEmail stays out of the public DTO and feeds.

New performances always create blank PlayerID / Open seats. A chair has no default player. Unclaimed seats appear in Needs cover; the regular-player pool only helps find coverage and never fills a seat automatically. Sync preserves existing assignments and the existing chair-tab layout while refreshing eligible-player and conflict validation.

## Shared reference implementation

The Streamlit host embeds the canonical public and authenticated HTML. Core.gs, Editor.gs and AdminWeb.gs are loaded into a demo-only shell with memory-backed service adapters. Production validators, authorization rules, public projection and ICS generation run unchanged; Google storage, identity and trigger operations are simulated. The adapter is never included in deployment bundles. The demo uses stable FirstLast IDs and fictional example.invalid accounts, including two musicians named Mike in different chairs.
