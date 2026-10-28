# Current reference update (October 28, 2026)

For the AM/PM and paired show-label update, replace only the public Calendar.html and authenticated Editor.html with their full matching files in apps-script/. Save and publish a new version of each EXISTING deployment, preserving URLs, execution settings and access. Do not change credentials or sharing for this update.

If installing the all-day backend for the first time, back up current source and data, then replace each Code.gs with its matching deployment bundle. Preserve appsscript.json and script properties. Run the owner's **Enable all-day/event fields** menu action (enableEventFields) to append M:P without moving A:L. Do not run Initialize or Apply chair permissions just for this upgrade. The new starter template already contains M:P.

Both Workbook-Code.gs and Authenticated-Code.gs include the blank-time Sync formula fix. Saving the workbook script and publishing a new version of the authenticated app installs that fix; no immediate Sync run is needed solely for the change.

The reusable starter uses [Theatre Name]. Existing theatre-specific workbook titles, venues and schedules remain their own configuration; do not replace the live workbook with the template.

## Historical upgrade notes

The following earlier instructions describe older releases, not additional required steps for the current HTML update.

# Update an existing installation to 1.2

This release preserves the FirstLast player IDs and chair eligibility entered in your workbook. Newly generated seats always start blank / Open and need coverage. The eligible and regular rosters never automatically assign a player.

1. Open the **standalone public calendar** Apps Script project. Replace Code.gs with deployment/Public-Code.gs. Save. Under Deploy → Manage deployments, edit the existing deployment, choose New version, and deploy. Preserve its current URL, Execute as Me, and Anyone access so anonymous calendar subscriptions keep working. This reader supports the current legacy Chairs layout and the simplified layout.
2. Open the **bound Workbook Tools** project using the workbook’s Extensions → Apps Script menu. Replace Code.gs with deployment/Workbook-Code.gs. Replace RunPreview.html with apps-script/editor/RunPreview.html. Save. Do not publicly deploy this project.
3. In the workbook, run Pit Calendar → Sync missing chair rows. Existing assignments and chair-tab widths, colors and wrapping are preserved; player dropdowns and conflict validation refresh from current EligiblePlayerIDs. Run Apply chair permissions after changing Google accounts or eligibility. Run Validate schedule.
4. The old DefaultPlayerID column may remain blank and hidden for compatibility. Once the updated public reader and workbook tools are installed, you can delete just that obsolete column from Chairs. Header-based lookups keep EditorEmails and RegularPlayerIDs working in either layout. The new reference template omits DefaultPlayerID entirely.

## Authenticated editing

Google-authenticated in-app editing still needs a separate interface with save handlers; changing the public deployment’s sign-in setting does not add editing and can block calendar subscriptions.

## Staffing administration update
Replace the authenticated project's Code.gs with deployment/Authenticated-Code.gs and Editor.html with apps-script/authenticated/Editor.html. Update the public project's Code.gs and Calendar.html too. Publish new versions of the existing deployments. Configure Settings.StaffingEditorURL. See docs/AUTHENTICATED-EDITOR.md.

## Calendar staffing tabs update

For installations already running the administration update, replace only authenticated Editor.html and public Calendar.html with the matching files in apps-script. Save and publish a new version of each existing deployment, preserving URLs and execution/access settings. Staffing uses a month grid; Administration loads on selection. Update Start Here to say “Select Administration” instead of “Load administration.” First-name labels retain stable IDs internally.
