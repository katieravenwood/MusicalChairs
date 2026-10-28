# Day-to-day operation

## Substitute or swap a date

Open your chair tab and find the performance by date, curtain and ID. Change PlayerID, AssignmentStatus or PublicNote for an assignment. Record conflicts separately in UnavailablePlayerIDs (column J), using player IDs separated by commas. Preserve other players already listed there. Column K reports coverage automatically after the edit trigger runs. Pick an eligible replacement from the dropdown. Do not paste a whole roster over the tab.

Clearing PlayerID makes the seat Open. Filling an Open seat defaults to Confirmed; choose Tentative or Needs sub when appropriate. A player marked Needs sub remains assigned, and their feed retains the date until a replacement is actually entered.

Every authorized musician for that chair can edit its full run. Permission is not limited to the dates carrying their own name. If a new substitute is missing, an administrator adds their PlayerID and updates the chair's eligible-player list.

## Change a single performance

A musician administrator edits the performance's date, call, curtain, finish or cancellation status in Performances. Keep the PerformanceID. Chair tabs look up the timing by ID. For additional new dates, leave new IDs blank and run Sync missing chair rows after the edit trigger fills them.

Cancel by setting Status to Cancelled, rather than deleting the performance. That retains identifiers for calendar updates and history. Keep former player records so their existing feed URLs can return a valid empty calendar after their final assignment is removed.

## Recover from an incorrect save

1. Stop changing the affected cell.
2. Right-click it in Sheets and inspect edit history.
3. Restore the intended player, status or note in that cell.
4. Check the other chairs and the public page.

For bulk damage, make a copy of an earlier workbook version and recover only the damaged records into the current workbook. Restoring the entire workbook can erase legitimate edits made elsewhere afterward. The custom change log records single-cell old values when Google supplies them; for multi-cell paste history, use native Sheets version history.

Native Sheets collaboration handles edits. Two people editing the same cell can still overwrite each other; cell history provides recovery. The Streamlit demo's stale-edit check illustrates a stronger application-level safeguard and is not a claim that Sheets supplies the same transaction semantics.

## Maintain chair permissions

Players.GoogleEmail stores each account once. Chairs.EligiblePlayerIDs determines the chairs that account can edit, regardless of the assigned player. Access.AdminEmail and the workbook owner can edit every chair in every show. Chairs.EditorEmails is a calculated display, refreshed by Sync, Apply permissions, and native Players/Chairs edits; it is not an input. Share file Editor access separately, then Apply chair permissions after changing player emails, eligibility, administrators, tabs or row capacity. Changes to the calculated display alone do not apply Google range protections. Run Sync missing chair rows after eligibility changes to refresh dropdowns. Removing file Editor access and removing eligibility are separate operations; review both during departure or handoff. Blank email or empty eligibility grants no player editing access.

Editors are trusted colleagues and can inspect the bound script. Use a separate backend and explicit authorization if protection from malicious editors becomes a requirement.

## Health and recovery

- Run Validate schedule after bulk changes. Resolve missing IDs, unknown players, missing chair rows and overlaps.
- Check Apps Script Executions for errors. Review installed trigger ownership when an administrator changes.
- A failed public read should surface an error rather than a fabricated empty schedule. Do not replace a failed feed with an empty calendar.
- A public page's Loaded timestamp reports when it was fetched. Reload to see current Sheets values. Calendar subscriptions may lag.
- If Google quotas are exceeded, reduce unnecessary refreshes and inspect usage. Do not assume a free service provides an uptime guarantee.

## Changes to code

Keep the Apps Script Core file synchronized between the bound and public projects. Run the tests, save changes, and update the public deployment to a new version using its existing deployment entry. Preserve production IDs and URL configuration outside the public reference repository.

## Maintain the instruction guide

The public calendar shows its guide link when Settings contains a valid InstructionsURL Google Docs URL. Keep the guide available to anyone with the link as Viewer, and separately share Editor access only with calendar administrators who should maintain it. Workbook administrator entries do not automatically share the document. Editing the Google Doc updates the guide without redeploying the calendar. Change InstructionsURL to replace the guide; clear it to hide the link.

## Record conflicts and find cover

For each performance, keep the assigned player separate from the list of unavailable players. Mark your conflict in your chair tab's column J; no reason is required or published. If the assigned player is listed there, the calendar shows Needs sub and retains their name until someone picks up the date. Pick up a date in column E; leave outgoing conflicts recorded. To withdraw a conflict, remove only that player ID and explicitly confirm the assignment status if appropriate.

Administrators maintain Chairs.RegularPlayerIDs. Blank uses EligiblePlayerIDs; set an explicit regular roster when eligibility includes outside substitutes. Names listed as regulars not marked unavailable have not necessarily confirmed they can play. Check other bookings and arrange the pickup before treating a seat as filled. If nobody in the regular pool can cover, Outside substitute needed appears. Add the agreed outside substitute to Players and the chair's eligible list, run Sync missing chair rows to refresh dropdowns, then assign them.

Personal feeds contain assignments only, never dates where a player is listed solely as unavailable. An unavailable assigned player keeps a needs-sub event until replaced.

New performances always create blank PlayerID / Open seats. A chair has no default player. Unclaimed seats appear in Needs cover; the regular-player pool only helps find coverage and never fills a seat automatically. Sync preserves existing assignments and the existing chair-tab layout while refreshing eligible-player and conflict validation.
