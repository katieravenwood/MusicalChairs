"""Embed the exact production HTML/logic, swapping Google services for fictional memory."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parent

def js_json(value):
    return json.dumps(value).replace('<', r'\u003c').replace('>', r'\u003e').replace('&', r'\u0026')

def build_demo():
    sources = '\n'.join((ROOT / p).read_text(encoding='utf-8') for p in [
        'apps-script/Core.gs', 'apps-script/authenticated/Editor.gs',
        'apps-script/authenticated/AdminWeb.gs', 'demo/runtime.js'])
    templates = {name: (ROOT / path).read_text(encoding='utf-8') for name, path in {
        'public': 'apps-script/public/Calendar.html',
        'staffing': 'apps-script/authenticated/Editor.html'}.items()}
    shell = (ROOT / 'demo/shell.html').read_text(encoding='utf-8')
    return shell.replace('/*DEMO_SOURCES*/', sources).replace('/*DEMO_TEMPLATES*/', 'const templates = '+js_json(templates)+';')
