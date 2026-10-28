# Verification status

The reference package passed 33 automated checks:

- 20 Apps Script core checks: scheduling, daylight-saving time, assignment isolation, publication filtering, stable feed identities, cancellations, ICS escaping and folding, read-only public entrypoints, and the Sheets API reader’s date/time and checkbox handling.
- 10 Python model checks: bulk generation, isolated chair edits, validation, stale edits, undo and personal calendar export.
- 2 Streamlit AppTest checks: initial rendering, filters and bulk preview.
- 1 workbook transport check: source dates are numeric Excel dates compatible with Google Sheets import.

The bound Apps Script project was also installed in a private native Google workbook. Initialization completed, the custom menu appeared, and native validation confirmed three fictional performances and six chair assignments with no overlaps. The run preview proposed one new performance and skipped three existing slots. The preview was closed without adding dates.

The public reader was corrected to use the advanced Sheets API with read-only authorization. Its live execution completed successfully, and the public JSON endpoint returned HTTP 200 to an unauthenticated client with the expected empty unpublished schedule and three fictional player filters. All three fictional personal-feed endpoints also returned HTTP 200 with valid empty ICS calendars to unauthenticated clients. Initial native protections were applied with the owner as sole administrator; access by additional chair editors has not been exercised. Subscriptions in Google, Apple and Outlook still require the acceptance checks in INSTALL.md. The automated tests do not establish calendar-client refresh or cancellation behavior. No real theatre schedule has been imported.

The optional instruction guide link was also deployed and checked in the live calendar. Anonymous requests confirmed the configured guide URL in calendar data and public readability of the Google Doc. Drive permission readback confirmed public reader access and the owner as the only editor. A generic guide is included in docs/USER_GUIDE.md; deployments configure their own document URL in Settings.InstructionsURL.

Version 1.1 adds independent unavailable-player lists, regular cover assessment, and outside-substitute flags. Tests cover retaining assignments and outgoing conflicts, avoiding unavailability-only feed events, unknown-ID rejection, and clearing the warning when an outside substitute is assigned. The live workbook was migrated and chair conflict permissions applied. A temporary fictional conflict produced the expected Needs sub / Outside substitute needed state; a pickup retained the outgoing conflict and moved the personal-feed event. The original sample assignment and blank conflict field were restored afterward. The native validator was run after restoration.

The player-account permissions update adds seven core tests: editing another player’s seat, all-show admin access, denial of unlisted/anonymous accounts, email changes across chairs, missing/malformed/duplicate-account checks, public email exclusion, and three same-name players with distinct chair access and feeds. Total automated checks: 40 (27 JavaScript, 13 Python).

Version 1.2 adds a new-seat test that confirms blank PlayerID / Open status, immediate coverage needed, and outside-substitute status when all regulars conflict. The Python bulk-generation test checks every generated chair starts blank and needs cover, while repeat generation preserves assignments. The live defaults were cleared/hidden and current FirstLast dropdown/conflict rules repaired. Deployment must be verified separately in the target Google account.

## Authenticated editor

17 server-side authenticated editor checks pass, plus 28 existing core checks. The separate project is deployed privately; Google consent, maintenance initialization and real multi-account save verification remain deployment acceptance steps. See AUTHENTICATED-EDITOR.md.

## Administration deployment verification — 2026-10-26

59 JavaScript checks pass (28 core, 17 authenticated editing, 14 administration), plus source syntax checks. Live Google verification confirmed admin forms load, reciprocal app links resolve to existing deployment URLs, the workbook link is admin-only, Apply chair permissions succeeds, and an unchanged existing show saves without altering its schedule. Bulk preview was exercised without committing new dates. Workbook Start Here now documents the app workflow and links both apps.

The public calendar deployment was still User accessing / Only myself. Owner must restore Me / Anyone for public viewing and ICS subscriptions. Multi-account musician testing still requires participating Google accounts.
