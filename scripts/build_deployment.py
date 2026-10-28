"""Regenerate paste-ready Apps Script bundles from their canonical sources."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
for name, files in {
    'Public-Code.gs':['apps-script/Core.gs','apps-script/public/Public.gs'],
    'Authenticated-Code.gs':['apps-script/Core.gs','apps-script/authenticated/Editor.gs','apps-script/authenticated/AdminWeb.gs'],
    'Workbook-Code.gs':['apps-script/Core.gs','apps-script/editor/Admin.gs'],
}.items():
    (ROOT/'deployment'/name).write_text('\n\n'.join((ROOT/f).read_text().rstrip() for f in files)+'\n')
