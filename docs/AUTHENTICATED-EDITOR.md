# Authenticated staffing editor

This third, standalone Apps Script project provides a signed-in editing page. Keep it separate from the public calendar and the bound workbook tools. Copy `deployment/Authenticated-Code.gs` into Code.gs, add `apps-script/authenticated/Editor.html` as Editor.html, and use the authenticated appsscript.json manifest. Set Script Property `SPREADSHEET_ID` to the staffing workbook ID. The manifest enables the Advanced Sheets service.

## Deployment and account setup

1. In the **authenticated editor** project, Deploy → New deployment → Web app. Set **Execute as: User accessing the web app** and **Who has access: Anyone with Google account** (the wording may vary by account). Keep it **Only myself** during initial testing. Never deploy this editor to run as the owner.
2. Each musician's Google account email goes in Players.GoogleEmail. Use FirstLast PlayerIDs in Chairs.EligiblePlayerIDs. Every eligible player can edit every assignment and conflict for that show/chair, regardless of its current occupant. The eligible list also defines the assignment/conflict choices, including for admins. Add a substitute to Players and chair eligibility before assigning them.
3. List every administrator, including the workbook owner, in Access.AdminEmail. Admins can edit all chairs without being eligible players. Share the workbook with all musicians and admins as **Editors**. Sheet sharing alone does not grant app access; app permissions alone do not grant sheet write access.
4. Use **Calendar administration → Apply chair permissions** in the authenticated editor (or the equivalent workbook menu) after email, eligibility, or admin changes. This preserves protected configuration and metadata. Do not share the standalone script project with musicians; share its deployed web-app URL.
5. An administrator opens the authenticated editor and approves Google's requested scopes, then clicks **Enable / repair maintenance**. This installs a once-per-minute trigger under that administrator's account. For a new app Google may show an unverified-app authorization flow; review the project and scopes before authorizing. If your Workspace policy blocks the app, your Workspace administrator must approve it.
6. Each musician authorizes the editor on first visit. Scopes are spreadsheets, Google account email, and Apps Script trigger management. Only administrators can use the maintenance setup function; normal players cannot install its trigger through the app.
7. Restore the **public calendar** deployment to **Execute as: Me** and **Who has access: Anyone**, retaining its existing URL. Personal ICS subscriptions need this public endpoint. No changes are needed to the bound project's deployment; do not deploy it.

## Using it

Filter by show, chair, date, or uncovered seats. For one performance, choose the assigned player, status, and any unavailable players; optionally add a public note. Click **Save this seat**. Clearing the player makes the seat Open. Marking its assigned player unavailable keeps their name but changes the status to Needs sub. Both the short name and PlayerID appear in selection controls so duplicate first names remain distinct.

The app rechecks the signed-in account, eligibility, current seat values, and input validity on every save. A stale save is rejected with a request to reload that seat. Saves use one atomic Sheets API operation for E:G and J of one row; formatting and all other seats stay untouched. Notes are explicit string cells, never formulas. The public calendar reads the new assignment immediately on its next page load.

## Background updates and limits

App/API writes do not invoke the workbook's native edit trigger. The maintenance task compares assignment inputs and refreshes protected revision, update-time, coverage and schedule-revision cells, typically on its next minute run. Calendar clients refresh subscriptions on their own schedules. A heartbeat older than ten minutes pauses app saves until an administrator repairs maintenance.

The background change log records observed before/after snapshots, not a verified user identity. Its actor column explicitly says identity was not captured. Multiple changes between runs can be combined into one observed change; a change reverted before the run may leave no background log record. This is an operational change log, not a forensic audit trail. Native Sheets retains its own history.

A script lock serializes saves through this editor, and input fingerprints reject stale forms. Native Sheets edits and the bound script use separate mechanisms; a simultaneous direct workbook edit can still race between the editor's read and write. Prefer the app for staffing edits while it is in use. This starter is intended for a theatre-sized roster, not a large multi-tenant scheduling service. Protected metadata remains administrator-only.

## Verification before inviting musicians

- Confirm an eligible player's real Google account can replace someone else's assignment in its chair but cannot access another chair.
- Confirm an admin outside a chair's eligible list can edit it.
- Open the same seat in two sessions; save in one, then verify the older form is rejected.
- Confirm a blank seat is flagged as needing coverage and all regular players unavailable produces an outside-substitute flag.
- Confirm maintenance updates Coverage/Revision/UpdatedAt and the Change Log after an app save.
- Test the public calendar and ICS feed in a signed-out browser after restoring its deployment settings.

Automated tests cover authorization, duplicate names, stale saves, validation, formula-safe writes, blank seats and assigned-player conflicts. Real multi-account authorization and Google consent must still be tested with the participating accounts.

## Calendar administration

Administrators have an Administration tab that loads automatically when selected. Use it to add or edit Players, Shows, Chairs and eligible/regular rosters, individual Performances, and Run Rules. Existing IDs remain fixed. Cancel performances instead of deleting them; unpublish shows to hide them. Player eligibility cannot be removed while assignments or conflicts still refer to that player in that chair. Display names should be first names. Staffing selectors and conflict checkboxes show these names; stable PlayerIDs remain the saved values used for authorization and feeds. Player record setup retains the permanent ID field for administrators.

Save run rules, select Preview bulk dates, review the proposed dates, then Create. Existing performances are skipped. New chair rows always have blank players and Open status. Dates and rule changes invalidate an older bulk preview. Configuration saves reject stale forms and preserve unrelated columns and formatting. After player, chair or performance changes, the app synchronizes chair rows and reapplies protections. If a follow-up fails, the app reports that the record was saved and asks for Repair / sync. Do not repeat an add blindly.

The editor header links to the public calendar. The admin area links to the workbook when Administration is selected. Set Settings.StaffingEditorURL to the authenticated deployed /exec URL to show its link in the public calendar footer. Put both deployed URLs on Start Here for easy navigation.

Daily staffing and schedule management can happen in the app. Initial Google sharing, authorization, deployment settings and adding/removing Access administrators still require the owner’s Google setup or workbook access. No sharing invitations are sent by these buttons.

Upgrade both standalone projects using their deployment Code.gs files and corresponding HTML files, saving a new version of each existing deployment. Preserve deployment URLs and existing intended execution/access settings. The expanded administration UI needs live Google authorization and deployment verification before production use.

## Calendar staffing navigation

Staffing opens as a Monday-first month calendar. Filter by show or chair and select a performance to edit its individual seats and unavailable players. Use previous/next month or Today to navigate. Save each seat separately; closing with unsaved changes asks before discarding them. The Public Calendar link returns to the single public view and subscription source. The editor has no second public calendar or subscription feeds. The public view offers Sign in for staffing. Repeated first names in the public player filter are distinguished by chair names rather than PlayerIDs.
