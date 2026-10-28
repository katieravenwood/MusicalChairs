# Pit Calendar

A musician-owned pit orchestra staffing calendar. Schedule a show run in bulk, change one chair assignment without replacing the roster, track per-performance conflicts separately from assignments, flag dates needing outside substitutes, and give each musician a calendar containing their assigned dates.

The repository contains two implementations:

| Implementation | Purpose | Persistence | Calendar integration |
| --- | --- | --- | --- |
| Streamlit reference app | Public portfolio demo with fictional data | Page-local memory; reset on reload | Downloadable ICS snapshot |
| Google Sheets + Apps Script | Theatre deployment | Google Sheets | Live, player-specific ICS subscriptions |

The Streamlit demo requires no Google account, credentials, paid database or production calendar connection. It never reads the theatre's workbook.

## Try locally

Use Python 3.12 or newer.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run streamlit_app.py
```

On Windows, activate with `.venv\Scripts\activate` instead.

The demo embeds the actual Apps Script public Calendar.html and authenticated Editor.html. It includes month/list public views, a month-grid staffing editor, selected-performance dialogs, independent conflicts, coverage flags, first-name labels, and an Administration tab that loads on selection. AM/PM presentation, Call Time / Places/Show Start labels, all-day and multi-day notes, Time TBD, and optional finish times use the same code as the Google deployment. Choose a fictional musician to edit eligible chairs, or Administrator to manage players, shows, rosters, individual dates and bulk rules. The editor returns to the one public calendar, where personal ICS snapshots are available. Demo changes remain in page memory and reset on reload; Reset restores the sample data.

## Deploy the demo on Streamlit Community Cloud

1. Push this repository to your GitHub account.
2. Sign in to Streamlit Community Cloud and choose **Create app**.
3. Select the repository and branch. Use `streamlit_app.py` as the entrypoint.
4. Select Python 3.12 and deploy. No secrets are required.
5. Add the resulting demo URL to the GitHub repository's About panel.

Community Cloud is free and can put inactive apps to sleep. Session data is intentionally disposable. The demo's download button exports a snapshot, not an automatically updating subscription. Hosting the demo does not deploy the real theatre calendar.

## Deploy the real calendar

Follow [INSTALL.md](INSTALL.md). Use the starter workbook in `templates/Pit-Orchestra-Calendar.xlsx` and the Apps Script files in `apps-script/`.

The production design uses:

- A workbook owned by a musician administrator.
- An unpublished show setup, performance records and show-specific chair tabs.
- Google account access for editors, with chair-specific protected ranges.
- A bound script for bulk schedule generation, validation, revision stamping and backups.
- A separate, read-only public Apps Script project for the calendar and subscriptions.

Musicians authorized for a chair can edit its full run, including who occupies dates they are not personally playing. Routine changes need no administrator approval. Multiple people can manage the same chair. Administrators can grant wider access by assigning musicians to additional chairs.

## Tests

```bash
npm ci
npm test
python -m unittest discover -s tests -p 'test_*.py' -v
```

The JavaScript tests run the production scheduling and feed functions in Node without Google credentials. JavaScript integration tests also exercise the demo adapter and actual HTML screens in an offline DOM. Python tests check the Streamlit host, embedded sources and workbook date transport. GitHub Actions runs both suites.

Local tests do not prove Google authorization, native protected-range behavior or calendar-client refresh behavior. Complete the installation acceptance checks before using a live roster.

## Project files

| Path | Contents |
| --- | --- |
| `streamlit_app.py`, `demo_preview.py`, `demo/` | Production screens with a fictional in-memory Google-service adapter |
| `apps-script/Core.gs` | Production schedule generation, validation, time-zone handling and ICS formatting |
| `apps-script/editor/` | Bound workbook automation and run-preview dialog |
| `apps-script/public/` | Read-only calendar and ICS service |
| `templates/` | Starter workbook for conversion to native Google Sheets |
| `schema.json` | Fictional starter records and column definitions |
| `INSTALL.md` | Google Sheets / Apps Script deployment instructions |
| `docs/OPERATIONS.md` | Scheduling, substitutions, recovery and ownership handoff |
| `docs/ARCHITECTURE.md` | Data model, permission boundaries and limitations |

Do not commit real editor emails, production data, deployment identifiers, secrets or personal configuration. The sample data is fictional. `personal-deployment.json`, `.clasp.json` and Streamlit secrets are ignored by git.

## References

- [Apps Script web apps](https://developers.google.com/apps-script/guides/web)
- [Apps Script Content Service and redirects](https://developers.google.com/apps-script/guides/content)
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Protected sheets and ranges](https://support.google.com/docs/answer/1218656)
- [Streamlit Community Cloud deployment](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app)
- [Streamlit app hibernation](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app)
- [Outlook subscriptions and update delays](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web)

Player permissions are maintained once: Players.GoogleEmail maps each Google account to a stable player ID; Chairs.EligiblePlayerIDs grants access to every assignment in that chair. Access administrators manage all chairs across all shows. Use FirstLast IDs without spaces and first-name display labels; repeated display names remain distinct. The public web calendar remains read-only. A separate Google-authenticated Staffing Editor implements chair editing and administration; its header returns to the public calendar. See docs/AUTHENTICATED-EDITOR.md.

## Signed-in staffing editor

A separate Apps Script editor is included in `apps-script/authenticated`. See [Authenticated editor setup](docs/AUTHENTICATED-EDITOR.md) for deployment, player permissions, maintenance, and verification. The public calendar remains a separate read-only app.

## Keeping code in sync

Canonical source lives in apps-script/. The demo reads those sources at runtime instead of maintaining another calendar/editor implementation. After changing server code, run `python scripts/build_deployment.py` to refresh the paste-ready deployment bundles. Run `npm test` and the Python tests before publishing. See [docs/REFERENCE-PARITY.md](docs/REFERENCE-PARITY.md) for the demo boundary and feature map.
