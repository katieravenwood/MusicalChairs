> For a new installation, replace [Theatre Name] in Settings.CalendarTitle and Shows.Venue. For upgrades, preserve the existing workbook and deployment URLs; follow deployment/UPGRADE.md.

# Install the theatre calendar

This deployment uses Google Sheets and three Apps Script projects: bound workbook tools, a public reader, and a signed-in editor. It is designed to operate within free consumer-account quotas for a small orchestra. Quotas and service terms can change. Development and maintenance still require time.

## 1. Create the workbook

1. Upload `templates/Pit-Orchestra-Calendar.xlsx` to your Google Drive.
2. Open it and choose **File > Save as Google Sheets** if it has not already been converted. Apps Script needs a native Google Sheet.
3. Rename it for the theatre and place it in a musician-controlled folder.
4. Keep sharing restricted while setting up. Do not enable “Anyone with the link can edit.”
5. In Settings, set `CalendarTitle` and confirm `TimeZone` is `America/New_York`.

The initial show is fictional and unpublished. Its dates and names must not be treated as an imported theatre schedule. No Brown Bear data has been migrated.

## 2. Install the bound workbook tools

1. In the workbook, choose **Extensions > Apps Script**.
2. Name the project `Pit Calendar — Workbook Tools`.
3. Replace `Code.gs` with `apps-script/Core.gs` followed by `apps-script/editor/Admin.gs`. You may instead add these as separate script files.
4. Add an HTML file named exactly `RunPreview`. Paste `apps-script/editor/RunPreview.html` into it.
5. In **Project Settings**, enable **Show appsscript.json manifest file in editor**.
6. Replace the manifest with `apps-script/editor/appsscript.json`. Save all files.
7. Run `initialize` as the workbook owner. Review Google's authorization screen. The script requests access to this workbook, spreadsheet dialogs, trigger management and your email identity.
8. Reload the workbook. A **Pit Calendar** menu should appear.

Initialize prepares the workbook and installs one edit trigger for the account running it. It does not change sharing or apply chair permissions. Use a single designated trigger owner. A second administrator should not rerun initialization just to gain edit access, because installable triggers belong to the individual who creates them.

Do not deploy this bound project as a public web app. Workbook editors can inspect and modify bound script code, so editors must be trusted collaborators. Protected ranges prevent ordinary accidental or unauthorized cell edits; they are not a hostile-user security boundary.

## 3. Configure musicians and chair access

1. Add at least two musician administrators' Google email addresses in `Access.AdminEmail`. The workbook owner always retains administrator access.
2. Add each musician to `Players` with a permanent `PlayerID` using FirstLast with no spaces (for example `MikeSmith`), a first-name `DisplayName` (`Mike`), and their Google-account email in `GoogleEmail`. Use a middle initial or numeric suffix if full names repeat. Preserve the exact ID once assigned, even if their name, email or instruments change. Several players can share a display name; IDs distinguish them. Use a last initial in DisplayName if names collide within one chair. Existing installations may retain their older IDs to preserve subscriptions.
3. Add a show to `Shows` with a unique `ShowID`, title and venue. Leave `Published` unchecked.
4. Add each show-specific chair to `Chairs`:

| Column | Meaning |
| --- | --- |
| ShowID | Production to which the chair belongs |
| ChairID | Stable identifier, such as `keys2` |
| Label | Visible chair name |
| Instrumentation | Instruments or doubling requirements |
| TabName | Unique Google Sheets tab name |
| EligiblePlayerIDs | Comma-separated player IDs; blank grants no musician editing access |
| EditorEmails | Calculated display of eligible players’ GoogleEmail addresses; do not maintain manually |
| RegularPlayerIDs | Comma-separated regular player IDs used to assess cover; blank falls back to EligiblePlayerIDs. Eligible players may also include outside substitutes. |

5. Share the workbook with the agreed musicians as **Editors** using Google's sharing dialog. These invites are a separate action from range protection.
6. As the owner or an administrator, run **Pit Calendar > Sync missing chair rows**, then **Apply chair permissions**.

Permissions join Chairs.EligiblePlayerIDs to Players.PlayerID and read Players.GoogleEmail. Every eligible player with an email can manage the chair, regardless of the assigned player. Administrators in Access and the workbook owner can edit every chair across all shows, even when absent from Players. A blank GoogleEmail grants no player editing access; an empty eligible list grants no player editors (the legacy assignment dropdown may still allow all players). Review the derived EditorEmails list before applying permissions. Administrators manage the structure. Chair editors can edit columns E:G (`PlayerID`, `AssignmentStatus`, `PublicNote`) and J (`UnavailablePlayerIDs`) across their chair's tab. Dates, IDs and metadata stay protected. Include a player’s ID in each chair they may play; their email is maintained once in Players. After changing an email, eligibility or administrators, run Apply chair permissions again. Run Sync missing chair rows as well when eligibility changes to refresh dropdowns. Google file ownership is singular; an administrator list does not create co-owners.

The permission action creates or updates only protections whose description starts with `Pit Calendar:`. It does not send sharing invitations or remove unrelated protections. Existing overlapping protections can still restrict a chair editor; check them if a valid editor cannot edit.

## 4. Create a run

1. Add rows in `Run Rules`. Use ISO dates (`YYYY-MM-DD`) and 24-hour times (`HH:mm`).
2. Enter a weekday list, such as `Wed,Fri,Sat,Sun`, plus duration and call offset in minutes.
3. Use separate rules for matinees and evenings. Put omitted dates in `ExcludeDates`, separated by commas.
4. Choose **Preview run generation**, review the proposed performances and confirm creation in the dialog.
5. Existing performance slots are skipped. Existing assignments are preserved. New assignments always start blank with status Open and need coverage.
6. Run **Validate schedule**, inspect double-booking warnings, and apply chair permissions again if tabs or row capacity were added.

For a single exception, edit the relevant row in Performances. Change the call/curtain/finish fields without changing the PerformanceID. Use `EndDate` for performances finishing after midnight. A call on the previous calendar day requires extending the starter's data model; the current validation intentionally rejects it.

For manual performance rows, leave PerformanceID blank. The installed edit trigger assigns an ID. Then run **Sync missing chair rows**. IDs on existing performances must never be regenerated.

## 5. Install the separate public calendar

1. Create a **new standalone** project in Apps Script. Name it `Pit Calendar — Public Calendar`.
2. Put `apps-script/Core.gs` followed by `apps-script/public/Public.gs` into Code.gs, or use two script files.
3. Add an HTML file named exactly `Calendar` containing `apps-script/public/Calendar.html`.
4. Show the manifest in Project Settings, then replace it with `apps-script/public/appsscript.json`. This enables the advanced Google Sheets API service (`Sheets`, v4). Confirm Google Sheets API appears under **Services**. With the default Apps Script Cloud project, Google enables its API automatically; if using a standard Google Cloud project, enable the Google Sheets API in that project too.
5. Add a Script Property named `SPREADSHEET_ID`. Its value is the ID between `/d/` and `/edit` in the workbook URL.
6. Choose **Deploy > New deployment > Web app**. Execute as the musician account owning the deployment. Select **Anyone** for access so calendar services can fetch feeds without signing in.
7. Review and authorize the public project's read-only Sheets scope. Although the code reads only the configured workbook, Google describes this scope as read access to spreadsheets in your account. Use a dedicated musician-controlled owner account if you want to limit the account's accessible data.
8. Copy the canonical HTTPS web app URL ending in `/exec`. Put that exact URL in `Settings.PublicAppURL` in the workbook.

Optionally create a Google Doc from `docs/USER_GUIDE.md`. Set its general access to **Anyone with the link → Viewer**, and explicitly share **Editor** access only with musician administrators who should maintain the guide. In Settings, add a row with Key `InstructionsURL` and the Google Doc's full `/edit` or `/view` URL as Value. The calendar then shows **How to use this calendar** after its introductory sentence. A blank or invalid URL hides the link. Guide permissions are separate from workbook roles; adding an administrator in Access does not share the guide automatically.

The public project has no write endpoints. It publishes only the whitelisted schedule fields and first-name player list. It never returns editor emails, Access, the change log, or the source workbook ID. Public notes are public. The workbook itself can remain restricted.

The public reader deliberately uses `Sheets.Spreadsheets.Values.get`, which supports read-only authorization. Do not substitute `SpreadsheetApp.openById`: that method requires the broader `spreadsheets` scope even when subsequent operations only read cells. Keep date columns formatted as `yyyy-mm-dd` and time columns as `hh:mm`; the API preserves those date/time strings while returning checkbox values as booleans.

Use **Manage deployments > Edit > New version** for later updates to preserve the existing subscription URL. Avoid creating a new deployment for every code change.

## 6. Publish and subscribe

1. While the fictional show remains unpublished, verify that the public page shows no events.
2. Test the fictional show by temporarily checking its Published box. Verify the roster, personal filter and feed. Unpublish it afterward.
3. Set the actual production's Published box only after its real dates and rosters have been checked.
4. On the public page, choose a musician. Copy their personal subscription URL.
5. In Google Calendar use **Other calendars > From URL**. In Apple Calendar choose **New Calendar Subscription**. In Outlook choose **Add calendar > Subscribe from web**.

Subscribe to the canonical `/exec?mode=ics&player=PLAYER_ID` URL. It need not end in `.ics`. Apps Script redirects feed content to a temporary Google URL; subscribe to the original `/exec` URL, never the temporary redirected URL.

Subscriptions contain all published dates assigned to the selected PlayerID. A show/month filter on the web page does not narrow that person's subscription. Tentative and needs-sub assignments remain included until reassigned. Calls are event start times. Curtain, expected finish, chair and instrumentation appear in the description.

## 7. Acceptance checks before using a real roster

- Owner sees the custom menu and initialization completes without errors.
- An authorized chair editor can change another player's assignment on the same chair.
- That editor cannot change dates, IDs, metadata or a chair they do not manage.
- The public page works in a signed-out browser and has no editing controls.
- Unpublished performances do not appear publicly.
- Two performances on one date appear separately.
- A substitution changes one seat while all other chairs retain their assignments.
- The outgoing musician's subscription loses the assignment and the incoming musician's gains it after refresh. Test removal of a musician's last remaining assignment too.
- A cancellation preserves the event UID and appears cancelled in each supported calendar client.
- Summer and winter calls display at the intended Eastern local time.
- Test Google, Apple and Outlook subscriptions separately, including Apps Script redirects.
- The execution log shows no recurring edit-trigger failures.

Calendar clients control refresh timing. Use direct communication for urgent changes. Pure unit tests cannot establish calendar-client behavior.

## 8. Ownership and backup

Use **Create backup copy** from the musician administrator menu, or Google Sheets **File > Make a copy**. Store periodic exports outside the owner account. Record who owns the workbook, who owns the public deployment, and who owns the installed trigger.

Before an administrator leaves, transfer workbook ownership where supported, recreate the edit trigger under the successor, remove the old trigger, and plan the public deployment handoff. Deployment URLs may need to change when ownership or accounts change; preserve the existing deployment where possible and test before retiring the old account.

## Conflicts and coverage (version 1.1)

Each chair tab retains its assigned player independently of its comma-separated UnavailablePlayerIDs in column J. Column K shows derived coverage. Recording the assigned player's conflict changes their status to Needs sub; it does not erase their assignment. Picking up the date by selecting a different non-conflicted PlayerID in column E defaults the new assignment to Confirmed and preserves the conflict list. If an editor also explicitly changes status in a multi-column edit, that status is respected unless the assigned player is unavailable.

Regular cover needed means at least one regular has no conflict recorded, not that they have confirmed availability. Outside substitute needed means a replacement is required and every configured regular is either marked unavailable or is the current player asking for a substitute. A booked, non-conflicted outside substitute resolves that warning. A blank regular roster and blank eligibility roster produce Regular roster not configured, rather than claiming no one can play.

For existing installations, update Core in both projects and Admin in the bound project, then run Initialize / repair installation. It appends the new fields without moving old columns. Run Apply chair permissions to permit each chair's editors to change J while protecting K. Update the public Calendar template and deploy a new version using the existing deployment. Keep existing IDs, URLs, assignment values and conflicts. For API integrations, update revision metadata and run Sync missing chair rows to refresh stored Coverage values; the public service calculates coverage from the current source fields on every request.

## Player-based permissions update

Update Core and Admin in the bound workbook project, add Players.GoogleEmail in column C (or run Initialize / repair installation), then Apply chair permissions. Existing Chairs.EditorEmails values are saved in cell notes for reference and replaced with calculated values. They no longer grant access. Configure player emails explicitly; do not infer identities from first names. File sharing remains a separate required step. Google-authenticated in-app editing uses this same authorization rule in the separate signed-in editor. The public reader remains compatible and excludes GoogleEmail from its output.

New performances always create blank PlayerID / Open seats. A chair has no default player. Unclaimed seats appear in Needs cover; the regular-player pool only helps find coverage and never fills a seat automatically. Sync preserves existing assignments and the existing chair-tab layout while refreshing eligible-player and conflict validation.

For existing installations, remove the obsolete DefaultPlayerID column from Chairs after updating both script projects. The reader accepts both the legacy and simplified chair layout, but ignores legacy defaults.

## Install the signed-in staffing editor

Install the separate authenticated project using [these instructions](docs/AUTHENTICATED-EDITOR.md). Do not change the public app into an authenticated editor.

After installation, select Administration to load its forms automatically. Use it to maintain players, shows, chair rosters, individual dates and bulk rules, and to Apply chair permissions. Google sharing and Access administrator changes remain explicit setup tasks. Enter both deployed URLs on Start Here; set Settings.StaffingEditorURL and Settings.PublicAppURL for reciprocal navigation. Copy docs/USER_GUIDE.md into a read-only shared guide if desired and set Settings.InstructionsURL.

Optional Performances columns M:P are AllDay, TimeTBD, StaffingRequired and EventTitle. Keep the original A:L columns in order. All-day/TBD records leave Call, Curtain and End empty; EndDate is inclusive. Set StaffingRequired to false for unstaffed notes. A timed entry may omit End without inventing a finish. See docs/REFERENCE-RELEASE.md.
