"""Host smoke tests; JavaScript tests exercise the actual embedded screens."""
import unittest
from pathlib import Path
from streamlit.testing.v1 import AppTest
from demo_preview import build_demo
ROOT=Path(__file__).resolve().parents[1]
class StreamlitTests(unittest.TestCase):
    def test_host(self):
        app=AppTest.from_file(str(ROOT/'streamlit_app.py')).run(timeout=30)
        self.assertFalse(app.exception,list(app.exception))
        self.assertEqual(app.title[0].value,'The people in the pit.')
        self.assertIn('Fictional demo',app.info[0].value)
    def test_actual_sources_embedded(self):
        html=build_demo()
        self.assertIn('function performanceSeats',html)
        self.assertIn('function adminValidate_',html)
        self.assertIn('function normalizeEditorChange_',html)
        self.assertNotIn('/*DEMO_SOURCES*/',html)
        self.assertNotIn('/*DEMO_TEMPLATES*/',html)
        self.assertNotIn('brownbear',html.lower())
if __name__=='__main__': unittest.main()
