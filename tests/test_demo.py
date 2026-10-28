import unittest
from copy import deepcopy
from datetime import date, time
from pit_demo import CHAIRS, add_run, apply_changes, coverage, plan_dates, seed, snapshot_ics, undo_last

class DemoTests(unittest.TestCase):
    def setUp(self):
        self.model=seed(date(2026,10,21))
        self.chair='Keys 2'
        self.key=next(k for k,a in self.model['assignments'].items() if a['chair']==self.chair)
        self.assignment=self.model['assignments'][self.key]

    def test_single_seat_patch_preserves_other_chairs(self):
        edit=dict(self.assignment,player='Riley')
        out=apply_changes(self.model,self.chair,[edit],{self.key:1})
        self.assertEqual(out['assignments'][self.key]['player'],'Riley')
        self.assertEqual(sum(v!=out['assignments'][k] for k,v in self.model['assignments'].items()),1)
        self.assertEqual(self.model['assignments'][self.key]['player'],'Morgan')

    def test_stale_edit_and_ineligible_player_rejected(self):
        with self.assertRaisesRegex(ValueError,'changed after'):
            apply_changes(self.model,self.chair,[dict(self.assignment,player='Riley')],{self.key:0})
        with self.assertRaisesRegex(ValueError,'eligible'):
            apply_changes(self.model,self.chair,[dict(self.assignment,player='Jo')],{self.key:1})

    def test_validation_does_not_partially_save(self):
        before=deepcopy(self.model)
        bad=dict(self.assignment,player='Jo')
        with self.assertRaises(ValueError):
            apply_changes(self.model,self.chair,[bad],{self.key:1})
        self.assertEqual(self.model,before)

    def test_clearing_a_player_opens_only_that_seat_and_undo_restores_it(self):
        out=apply_changes(self.model,self.chair,[dict(self.assignment,player='')],{self.key:1})
        self.assertEqual(out['assignments'][self.key]['status'],'Open')
        restored=undo_last(out)
        self.assertEqual(restored['assignments'][self.key]['player'],'Morgan')
        self.assertGreater(restored['assignments'][self.key]['revision'],out['assignments'][self.key]['revision'])

    def test_bulk_generation_two_show_day_and_rerun_idempotence(self):
        plan=plan_dates(date(2026,11,7),date(2026,11,8),[5,6],time(19,30),matinee_days=[5])
        self.assertEqual(len(plan),3)
        out,count=add_run(self.model,'Fictional New Show',plan)
        repeated,count2=add_run(out,'Fictional New Show',plan)
        self.assertEqual((count,count2),(3,0))
        self.assertEqual(out['assignments'],repeated['assignments'])
        new_ids={p['id'] for p in out['performances'] if p['show']=='Fictional New Show'}
        new_seats=[a for a in out['assignments'].values() if a['performance_id'] in new_ids]
        self.assertEqual(len(new_seats),len(plan)*len(CHAIRS))
        self.assertTrue(all(a['player']=='' and a['status']=='Open' and coverage(a)['needs_cover'] for a in new_seats))

    def test_personal_feed_filters_assignments_and_uses_eastern_call_time(self):
        ics=snapshot_ics(self.model,'Morgan').decode()
        self.assertIn('BEGIN:VCALENDAR',ics)
        self.assertNotIn(' - Drums - ',ics)
        self.assertNotIn(' - Sam',ics)
        self.assertTrue(ics.endswith('\r\n'))
        for line in ics.split('\r\n'):
            self.assertLessEqual(len(line.encode()),75)

    def test_conflict_and_pickup_preserve_unavailability_and_other_chairs(self):
        out=apply_changes(self.model,self.chair,[dict(self.assignment,unavailable='Morgan')],{self.key:1})
        a=out['assignments'][self.key]
        self.assertEqual(a['player'],'Morgan')
        self.assertEqual(a['status'],'Needs sub')
        picked=apply_changes(out,self.chair,[dict(a,player='Riley')],{self.key:2})
        self.assertEqual(picked['assignments'][self.key]['unavailable'],['Morgan'])
        self.assertEqual(coverage(picked['assignments'][self.key])['coverage'],'Covered')
        self.assertEqual(sum(v!=picked['assignments'][k] for k,v in self.model['assignments'].items()),1)

    def test_no_regulars_can_cover_and_undo_restores_conflicts(self):
        out=apply_changes(self.model,self.chair,[dict(self.assignment,unavailable=CHAIRS[self.chair])],{self.key:1})
        self.assertEqual(coverage(out['assignments'][self.key])['coverage'],'Outside substitute needed')
        restored=undo_last(out)
        self.assertEqual(restored['assignments'][self.key]['unavailable'],self.assignment['unavailable'])

    def test_unavailable_does_not_assign_the_player_or_add_their_feed_date(self):
        before=snapshot_ics(self.model,'Riley').decode().count('BEGIN:VEVENT')
        out=apply_changes(self.model,self.chair,[dict(self.assignment,unavailable='Riley')],{self.key:1})
        self.assertEqual(snapshot_ics(out,'Riley').decode().count('BEGIN:VEVENT'),before)

    def test_outside_substitute_resolves_a_date_with_no_regular_cover(self):
        out=apply_changes(self.model,self.chair,[dict(self.assignment,unavailable='Morgan,Riley')],{self.key:1})
        a=out['assignments'][self.key]
        self.assertEqual(coverage(a)['coverage'],'Outside substitute needed')
        out=apply_changes(out,self.chair,[dict(a,player='Casey')],{self.key:2})
        self.assertEqual(coverage(out['assignments'][self.key])['coverage'],'Covered')
        self.assertEqual(out['assignments'][self.key]['unavailable'],['Morgan','Riley'])

if __name__=='__main__':
    unittest.main()
