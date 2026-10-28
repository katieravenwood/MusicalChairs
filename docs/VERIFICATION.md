# Verification — reference 1.3

The current reference uses canonical Apps Script sources, not a second independently maintained calendar UI.

Automated checks cover:

- Core scheduling, daylight-saving time, publication filtering, coverage, independent conflicts, stable personal feeds, ICS formatting, authorization and blank new seats.
- Authenticated seat edits, stale-write rejection, assignment isolation, formula-safe cell writes and maintenance reconciliation.
- Administrative validation, immutable IDs, role denial, roster references and native checkbox values.
- All-day spans, inclusive workbook/exclusive ICS ends, Time TBD, optional finish, blank-time Sync, AM/PM minute values, and paired call/places labels.
- Monday-first month boundaries, leap years, selected-performance isolation and first-name labels.
- Demo service adapters: same-name players in separate chairs, replacing another assigned player, unauthorized chair/admin rejection, cancellation, unpublished shows, bulk preview tokens and blank generated seats.
- Offline DOM integration using the actual HTML: public calendar rendering, selected-performance dialogs, administrator autoload, musician tab visibility, single-seat saves and return navigation.
- Streamlit host rendering, inclusion of canonical source, and starter workbook numeric date transport.

Run `npm ci && npm test` and `python -m unittest discover -s tests -p 'test_*.py' -v`.

Deployment bundles are checked against canonical files. Regenerate them with `python scripts/build_deployment.py` after server-code changes.

The browser environment could not open the local preview file, so this pass uses offline DOM integration and Streamlit AppTest rather than claiming visual browser verification. Google authorization, workbook protections, live multi-account saves, background triggers and subscriber refresh behavior require the acceptance checks in INSTALL.md. The demo has no live Google service integration and no permanent feed endpoint. This reference update does not deploy or change the theatre's live apps.
