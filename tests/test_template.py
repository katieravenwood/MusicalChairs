"""Ensure the starter uses numeric dates supported by Google conversion."""
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree

class TemplateTests(unittest.TestCase):
    def test_dates_use_portable_numeric_storage(self):
        template=Path(__file__).resolve().parents[1]/'templates'/'Pit-Orchestra-Calendar.xlsx'
        with zipfile.ZipFile(template) as archive:
            root=ElementTree.fromstring(archive.read('xl/worksheets/sheet5.xml'))
            cells={e.attrib['r']:e for e in root.iter() if e.tag.endswith('}c')}
            for address,expected in [('C2',46332),('F2',46332),('C3',46333),('F3',46333)]:
                cell=cells[address]
                self.assertEqual(cell.attrib.get('t','n'),'n')
                self.assertEqual(float(next(iter(cell)).text),expected)

if __name__=='__main__':
    unittest.main()
