"""Run with: streamlit run streamlit_app.py. No Google credentials required."""
from datetime import date, datetime, timedelta, time
from html import escape
import calendar
import json

import pandas as pd
import streamlit as st

from pit_demo import CHAIRS, PLAYERS, REGULARS, STATUSES, ZONE, coverage, add_run, apply_changes, plan_dates, seed, snapshot_ics, undo_last

st.set_page_config(page_title='Pit Calendar | Orchestra staffing', page_icon='🎼', layout='wide')
st.markdown('''<style>.block-container{padding-top:2rem;max-width:1380px}h1{letter-spacing:-1.5px}div[data-testid="stMetric"]{background:#f2f4f7;border-radius:10px;padding:16px}.pitgrid{display:grid;grid-template-columns:repeat(7,minmax(125px,1fr));gap:1px;background:#dfe3e9;border:1px solid #dfe3e9;border-radius:8px;overflow:hidden}.pitday{background:white;min-height:150px;padding:10px;color:#24324b}.pithead{background:#e9edf3;text-align:center;font-weight:600;font-size:12px;padding:8px}.pitoutside{background:#f7f7f5}.pitevent{background:#edf2fa;border-left:3px solid #405b88;border-radius:4px;padding:7px;margin-top:7px;font-size:12px}.pitgap{background:#fff0c8;border-color:#a7761f}.pitcancel{background:#f7e7e7;border-color:#a64747}.pitdate{font-size:12px;color:#53617a}.pitshow{font-weight:650}.pitwrap{overflow-x:auto}div[data-testid="stCaptionContainer"]{color:#53617a}</style>''', unsafe_allow_html=True)

if 'model' not in st.session_state:
    st.session_state.model = seed()
model = st.session_state.model
today = datetime.now(ZONE).date()

st.caption('MUSICIAN-OWNED SCHEDULING · REFERENCE APPLICATION')
st.title('The people in the pit.')
st.write('Plan a run. Fill every chair. Keep everyone’s dates in tune.')
st.info('Interactive demo with fictional people and shows. Your edits stay in this browser session and reset when the session ends. The production version uses Google Sheets and Apps Script.')

with st.sidebar:
    st.header('Explore the calendar')
    shows = sorted({p['show'] for p in model['performances']})
    show_filter = st.selectbox('Show', ['All shows'] + shows)
    player_filter = st.selectbox('Player', ['Full roster'] + PLAYERS)
    only_gaps = st.checkbox('Dates needing cover only')
    only_external = st.checkbox('Outside substitute needed only')
    st.caption('All times are America/New_York.')
    if st.button('Reset fictional demo', width="stretch"):
        st.session_state.model = seed()
        st.session_state.pop('run_preview', None)
        st.rerun()
    st.divider()
    st.write('**Production deployment**')
    st.caption('Google Sheets holds assignments. Apps Script serves the public calendar and live personal feeds. See INSTALL.md in the repository.')

visible = []
for p in model['performances']:
    if show_filter != 'All shows' and p['show'] != show_filter:
        continue
    seats = [dict(model['assignments'][f'{p["id"]}|{c}'], **coverage(model['assignments'][f'{p["id"]}|{c}'])) for c in CHAIRS]
    if player_filter != 'Full roster':
        seats = [a for a in seats if a['player'] == player_filter]
    if only_gaps:
        seats = [a for a in seats if a['needs_cover'] and p['status'] != 'Cancelled']
    if only_external:
        seats = [a for a in seats if a['coverage'] == 'Outside substitute needed' and p['status'] != 'Cancelled']
    if seats:
        visible.append((p, seats))

c1, c2, c3 = st.columns(3)
c1.metric('Performances in view', len(visible))
c2.metric('Open seats', sum(a['status']=='Open' for _, seats in visible for a in seats))
c3.metric('Outside substitutes needed', sum(a['coverage']=='Outside substitute needed' for p, seats in visible for a in seats if p['status']!='Cancelled'))

schedule, editing, bulk, feeds, history = st.tabs(['Schedule', 'Edit a chair', 'Build a run', 'My calendar', 'Change history'])
with schedule:
    left, right = st.columns([2, 1])
    month_anchor = left.date_input('Month', value=today.replace(day=1), key='month_anchor')
    style = right.radio('View', ['Month', 'List'], horizontal=True)
    month_items = [(p,a) for p,a in visible if p['date'].startswith(month_anchor.strftime('%Y-%m'))]
    if style == 'Month':
        st.caption('Scroll sideways on small screens. Use List view for the full roster.')
        chunks = ['<div class="pitwrap"><div class="pitgrid">']
        chunks += [f'<div class="pithead">{d}</div>' for d in ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']]
        for week in calendar.Calendar(firstweekday=0).monthdatescalendar(month_anchor.year, month_anchor.month):
            for d in week:
                cls = 'pitday' + (' pitoutside' if d.month != month_anchor.month else '')
                chunks.append(f'<div class="{cls}"><div class="pitdate">{d.day}</div>')
                for p, seats in visible:
                    if p['date'] != d.isoformat():
                        continue
                    gap = any(a['needs_cover'] for a in seats)
                    cls = 'pitevent'+(' pitcancel' if p['status']=='Cancelled' else ' pitgap' if gap else '')
                    roster = '<br>'.join(escape(a['chair']+': '+(a['player'] or 'Open')+' · '+a['coverage']+(' · Unavailable: '+', '.join(a.get('unavailable', [])) if a.get('unavailable') else '')) for a in seats)
                    chunks.append(f'<div class="{cls}"><div class="pitshow">{escape(p["curtain"]+" "+p["show"])}</div><div>Call {escape(p["call"])}</div>{roster}</div>')
                chunks.append('</div>')
        chunks.append('</div></div>')
        st.markdown(''.join(chunks), unsafe_allow_html=True)
    else:
        if not month_items:
            st.write('No performances match this month and these filters.')
        for p, seats in month_items:
            with st.expander(f'{p["date"]} · {p["curtain"]} · {p["show"]} · Call {p["call"]}', expanded=False):
                st.caption(f'{p["venue"]} · Expected finish {p["end"]} · {p["status"]}')
                st.dataframe(pd.DataFrame(seats)[['chair','player','status','unavailable','coverage','regular_candidates','note']], hide_index=True, width="stretch")

with editing:
    st.subheader('Edit the chair, one assignment at a time')
    st.caption('This selector previews chair permissions. In production, Google accounts and protected ranges determine which chairs a musician can edit.')
    chair = st.selectbox('Chair to edit', list(CHAIRS))
    st.caption('Regulars: '+', '.join(REGULARS[chair])+'. Enter conflicts as comma-separated names in Unavailable players. No conflict recorded means availability is unknown. Pick up a date by changing Player; the conflict list is retained. Keys 2 also has Casey as an eligible outside substitute.')
    edit_rows = []
    expected = {}
    for p in model['performances']:
        if show_filter != 'All shows' and p['show'] != show_filter:
            continue
        a = model['assignments'][f'{p["id"]}|{chair}']
        edit_rows.append(dict(performance_id=p['id'], date=p['date'], call=p['call'], curtain=p['curtain'], player=a['player'], status=a['status'], unavailable=', '.join(a.get('unavailable', [])), coverage=coverage(a)['coverage'], note=a['note']))
        expected[f'{p["id"]}|{chair}'] = a['revision']
    original = pd.DataFrame(edit_rows)
    if not original.empty:
        edited = st.data_editor(original, hide_index=True, width="stretch", disabled=['performance_id','date','call','curtain','coverage'], column_config={'performance_id':None,'player':st.column_config.SelectboxColumn('Player', options=['']+CHAIRS[chair], required=False),'status':st.column_config.SelectboxColumn('Status', options=STATUSES, required=True),'unavailable':st.column_config.TextColumn('Unavailable players', help='Comma-separated eligible names; assignment is kept separately.'),'coverage':st.column_config.TextColumn('Coverage'),'note':st.column_config.TextColumn('Public note', max_chars=500)}, key=f'chair_editor_{chair}_{model["version"]}')
        if st.button('Save changed assignments', type='primary'):
            try:
                clean = edited.fillna('').to_dict('records')
                st.session_state.model = apply_changes(model, chair, clean, expected)
                st.session_state.saved = 'Changed assignments saved in your demo session. Other chairs were preserved.'
                st.rerun()
            except ValueError as exc:
                st.error(str(exc))
    if 'saved' in st.session_state:
        st.success(st.session_state.pop('saved'))

with bulk:
    st.subheader('Set up a show run')
    with st.form('run_builder'):
        title = st.text_input('Show title', value='The Midnight Express')
        a,b = st.columns(2)
        start = a.date_input('First date', today+timedelta(days=7))
        end = b.date_input('Last date', today+timedelta(days=28))
        names = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
        weekdays = st.multiselect('Performance weekdays', names, default=['Wed','Fri','Sat','Sun'])
        matinees = st.multiselect('Also add a 2 PM matinee on', names, default=['Sat'])
        a,b,c = st.columns(3)
        curtain = a.time_input('Curtain', time(19,30))
        offset = b.number_input('Call minutes before curtain', min_value=0, max_value=240, value=30)
        duration = c.number_input('Performance length in minutes', min_value=1, max_value=1440, value=150)
        preview = st.form_submit_button('Preview dates')
    if preview:
        try:
            st.session_state.run_preview = dict(title=title, plan=plan_dates(start,end,[names.index(d) for d in weekdays],curtain,int(offset),int(duration),[names.index(d) for d in matinees]))
        except ValueError as exc:
            st.error(str(exc))
    if 'run_preview' in st.session_state:
        plan = st.session_state.run_preview
        st.write(f'**{plan["title"]}: {len(plan["plan"])} proposed performances**')
        st.dataframe(pd.DataFrame(plan['plan']), hide_index=True, width="stretch")
        if st.button('Add previewed performances to demo'):
            try:
                st.session_state.model,count = add_run(model, plan['title'], plan['plan'])
                del st.session_state.run_preview
                st.session_state.saved = f'{count} new performances added. Existing dates and assignments were preserved.'
                st.rerun()
            except ValueError as exc:
                st.error(str(exc))

with feeds:
    st.subheader('One musician. Their assigned dates.')
    who = st.selectbox('Calendar for', PLAYERS, index=PLAYERS.index(player_filter) if player_filter in PLAYERS else 0)
    st.download_button('Download demo calendar snapshot (.ics)', snapshot_ics(model,who),file_name=f'demo-{who.lower()}.ics',mime='text/calendar')
    st.caption('This download is a snapshot. Streamlit Community Cloud does not host a live feed for this demo. The Apps Script deployment supplies the permanent subscription URL and refreshes it from Sheets.')
    st.code('YOUR_APPS_SCRIPT_WEB_APP_URL?mode=ics&player=PLAYER_ID', language=None)
    st.write('**Google:** Other calendars → From URL. **Apple:** New Calendar Subscription. **Outlook:** Add calendar → Subscribe from web.')
    st.write('The live feed starts events at call time, includes curtain and finish details, and changes when a player is assigned or replaced. Tentative and needs-sub assignments remain on the assigned musician’s calendar until reassigned.')

with history:
    st.subheader('Changes in this demo session')
    if model['changes']:
        rows=[dict(time=c['at'],assignment=c['key'],before=c['before']['player'] or 'Open',after=c['after']['player'] or 'Open',status=c['after']['status'],unavailable=', '.join(c['after'].get('unavailable', []))) for c in reversed(model['changes'])]
        st.dataframe(pd.DataFrame(rows),hide_index=True,width="stretch")
        if st.button('Undo the last assignment change'):
            try:
                st.session_state.model = undo_last(model)
                st.rerun()
            except ValueError as exc:
                st.error(str(exc))
    else:
        st.write('Edit a chair to see the change history here.')
    st.download_button('Export demo data (JSON)',json.dumps(model,indent=2),file_name='pit-calendar-demo.json',mime='application/json')

st.divider()
st.caption('Reference project: Streamlit demonstration · Google Sheets and Apps Script production deployment · No theatre data or credentials required for the demo.')
