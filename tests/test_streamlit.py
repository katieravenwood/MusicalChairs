"""Smoke checks for the reference UI. Requires requirements.txt."""
import unittest
from pathlib import Path
from streamlit.testing.v1 import AppTest

ROOT=Path(__file__).resolve().parents[1]

class StreamlitTests(unittest.TestCase):
    def test_initial_render_and_filters(self):
        app=AppTest.from_file(str(ROOT/'streamlit_app.py')).run(timeout=30)
        self.assertFalse(app.exception, list(app.exception))
        self.assertEqual(len(app.tabs),5)
        self.assertEqual(app.title[0].value,'The people in the pit.')
        picker=next(x for x in app.selectbox if x.label=='Player')
        picker.select('Morgan').run(timeout=30)
        self.assertFalse(app.exception,list(app.exception))

    def test_bulk_preview(self):
        app=AppTest.from_file(str(ROOT/'streamlit_app.py')).run(timeout=30)
        next(b for b in app.button if b.label=='Preview dates').click().run(timeout=30)
        self.assertFalse(app.exception,list(app.exception))
        self.assertTrue(app.session_state['run_preview']['plan'])

if __name__=='__main__':
    unittest.main()
