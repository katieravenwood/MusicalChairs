"""Fictional, session-only model for the Streamlit portfolio demonstration."""
from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

ZONE = ZoneInfo('America/New_York')
PLAYERS = ['Alex', 'Casey', 'Drew', 'Jo', 'Morgan', 'Riley', 'Sam', 'Taylor']
CHAIRS = {
    'Conductor / Keys 1': ['Alex', 'Casey'],
    'Keys 2': ['Morgan', 'Riley', 'Casey'],
    'Reed 1': ['Sam', 'Taylor'],
    'Guitar': ['Drew', 'Riley'],
    'Bass': ['Taylor', 'Morgan'],
    'Drums': ['Jo', 'Casey'],
}
STATUSES = ['Confirmed', 'Tentative', 'Needs sub', 'Open']
REGULARS = {chair: list(players) for chair, players in CHAIRS.items()}
REGULARS['Keys 2'] = ['Morgan', 'Riley']  # Casey is an eligible outside substitute.


def coverage(assignment: dict) -> dict:
    unavailable = assignment.get('unavailable', [])
    assigned_unavailable = bool(assignment['player']) and assignment['player'] in unavailable
    needs_cover = not assignment['player'] or assignment['status'] == 'Needs sub' or assigned_unavailable
    candidates = [p for p in REGULARS[assignment['chair']] if p not in unavailable and not (p == assignment['player'] and assignment['status'] == 'Needs sub')]
    return dict(needs_cover=needs_cover, assigned_unavailable=assigned_unavailable,
                regular_candidates=candidates, coverage='Covered' if not needs_cover else 'Regular cover needed' if candidates else 'Outside substitute needed')


def seed(today: date | None = None) -> dict:
    today = today or datetime.now(ZONE).date()
    start = today - timedelta(days=today.weekday())
    performances, assignments = [], {}
    for n in range(35):
        d = start + timedelta(days=n)
        if d.weekday() not in [2, 4, 5, 6]:
            continue
        times = ['14:00', '19:30'] if d.weekday() == 5 else ['14:00'] if d.weekday() == 6 else ['19:30']
        for curtain in times:
            pid = f'demo-{d.isoformat()}-{curtain.replace(":", "")}'
            showtime = datetime.combine(d, time.fromisoformat(curtain), ZONE)
            end = showtime + timedelta(minutes=150)
            performances.append(dict(id=pid, show='The Lantern Room', date=d.isoformat(), call=(showtime-timedelta(minutes=30)).strftime('%H:%M'), curtain=curtain, end_date=end.date().isoformat(), end=end.strftime('%H:%M'), status='Scheduled', venue='[Theatre Name]'))
            for i, (chair, eligible) in enumerate(CHAIRS.items()):
                player = eligible[0]
                state = 'Confirmed'
                if n % 11 == 4 and chair == 'Reed 1':
                    player, state = '', 'Open'
                if n % 8 == 3 and chair == 'Keys 2':
                    state = 'Needs sub'
                unavailable = list(REGULARS[chair]) if n % 8 == 3 and chair == 'Keys 2' else [player] if state == 'Needs sub' and player else []
                assignments[f'{pid}|{chair}'] = dict(performance_id=pid, chair=chair, player=player, status=state, note='', unavailable=unavailable, revision=1)
    return dict(performances=performances, assignments=assignments, changes=[], version=1)


def apply_changes(model: dict, chair: str, edits: list[dict], expected: dict[str, int]) -> dict:
    """Validate the entire patch, then update only that chair's changed records."""
    if chair not in CHAIRS:
        raise ValueError('Unknown chair.')
    patched = deepcopy(model)
    seen = set()
    for edit in edits:
        key = f'{edit["performance_id"]}|{chair}'
        if key in seen:
            raise ValueError('Duplicate performance in this edit.')
        seen.add(key)
        if key not in model['assignments']:
            raise ValueError('Unknown performance assignment.')
        current = model['assignments'][key]
        if expected.get(key) != current['revision']:
            raise ValueError('This assignment changed after you opened it. Reload before saving.')
        player = str(edit.get('player', '') or '').strip()
        status = str(edit.get('status', '') or '').strip()
        note = str(edit.get('note', '') or '').strip()
        raw_unavailable = edit.get('unavailable', current.get('unavailable', []))
        unavailable = list(dict.fromkeys(p.strip() for p in raw_unavailable.replace(';', ',').split(',') if p.strip())) if isinstance(raw_unavailable, str) else list(dict.fromkeys(raw_unavailable))
        if any(p not in CHAIRS[chair] for p in unavailable):
            raise ValueError('Choose eligible players for conflicts, separated by commas.')
        if player and player not in CHAIRS[chair]:
            raise ValueError('Choose an eligible player for this chair.')
        if status not in STATUSES:
            raise ValueError('Choose a valid assignment status.')
        if len(note) > 500:
            raise ValueError('Keep public notes to 500 characters.')
        if not player:
            status = 'Open'
        elif player in unavailable:
            status = 'Needs sub'
        elif status == 'Open' or player != current['player'] and status == 'Needs sub':
            status = 'Confirmed'
        updated = dict(current, player=player, status=status, note=note, unavailable=unavailable)
        if any(current.get(k, []) != updated[k] for k in ['player', 'status', 'note', 'unavailable']):
            updated['revision'] += 1
            patched['assignments'][key] = updated
            patched['changes'].append(dict(at=datetime.now(timezone.utc).isoformat(), key=key, before=deepcopy(current), after=deepcopy(updated)))
    patched['version'] += 1
    return patched


def undo_last(model: dict) -> dict:
    if not model['changes']:
        return deepcopy(model)
    out = deepcopy(model)
    change = out['changes'][-1]
    current = out['assignments'][change['key']]
    if current != change['after']:
        raise ValueError('The assignment changed again; automatic undo would overwrite newer work.')
    restored = dict(change['before'], revision=current['revision'] + 1)
    out['assignments'][change['key']] = restored
    out['changes'].pop()
    out['version'] += 1
    return out


def plan_dates(start: date, end: date, weekdays: list[int], curtain: time, call_offset: int = 30, duration: int = 150, matinee_days: list[int] | None = None) -> list[dict]:
    if end < start or (end - start).days > 366:
        raise ValueError('Choose a date range of up to one year.')
    if not weekdays:
        raise ValueError('Choose at least one weekday.')
    result = []
    d = start
    while d <= end:
        if d.weekday() in weekdays:
            times = [curtain]
            if d.weekday() in (matinee_days or []) and curtain != time(14):
                times.append(time(14))
            for t in sorted(times):
                show = datetime.combine(d, t, ZONE)
                call = show - timedelta(minutes=call_offset)
                if call.date() != d:
                    raise ValueError('Call must fall on the performance date.')
                finish = show + timedelta(minutes=duration)
                result.append(dict(date=d.isoformat(), call=call.strftime('%H:%M'), curtain=t.strftime('%H:%M'), end_date=finish.date().isoformat(), end=finish.strftime('%H:%M')))
        d += timedelta(days=1)
    return result


def add_run(model: dict, title: str, plan: list[dict]) -> tuple[dict, int]:
    if not title.strip():
        raise ValueError('Enter a show title.')
    out = deepcopy(model)
    existing = {(p['show'], p['date'], p['curtain']) for p in out['performances']}
    count = 0
    for p in plan:
        slot = (title.strip(), p['date'], p['curtain'])
        if slot in existing:
            continue
        pid = f'added-{len(out["performances"])+1}-{p["date"]}-{p["curtain"].replace(":", "")}'
        out['performances'].append(dict(p, id=pid, show=title.strip(), status='Scheduled', venue='[Theatre Name]'))
        for chair, eligible in CHAIRS.items():
            out['assignments'][f'{pid}|{chair}'] = dict(performance_id=pid, chair=chair, player='', status='Open', note='', unavailable=[], revision=1)
        existing.add(slot)
        count += 1
    out['performances'].sort(key=lambda p: (p['date'], p['curtain']))
    out['version'] += 1
    return out, count


def snapshot_ics(model: dict, player: str) -> bytes:
    def escape(s):
        return str(s).replace('\\', '\\\\').replace('\n', '\\n').replace(';', '\\;').replace(',', '\\,')
    def utc(day, clock):
        return datetime.combine(date.fromisoformat(day), time.fromisoformat(clock), ZONE).astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pit Calendar Demo//EN', 'CALSCALE:GREGORIAN', f'X-WR-CALNAME:Demo - {escape(player)}']
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    for p in model['performances']:
        for chair in CHAIRS:
            a = model['assignments'][f'{p["id"]}|{chair}']
            if a['player'] != player:
                continue
            lines.extend(['BEGIN:VEVENT', f'UID:{p["id"]}-{list(CHAIRS).index(chair)}-{player.lower()}@pit-calendar-demo', f'DTSTAMP:{stamp}', f'SEQUENCE:{a["revision"]}', f'DTSTART:{utc(p["date"], p["call"])}', f'DTEND:{utc(p["end_date"], p["end"])}', 'SUMMARY:'+escape(f'{p["show"]} - {chair} - {player}'), 'DESCRIPTION:'+escape(f'Fictional demo. Call {p["call"]}; curtain {p["curtain"]}. {a["status"]}. {a["note"]}'), 'STATUS:'+('CANCELLED' if p['status']=='Cancelled' else 'TENTATIVE' if a['status']=='Tentative' else 'CONFIRMED'), 'END:VEVENT'])
    lines.append('END:VCALENDAR')
    folded = []
    for line in lines:
        part = ''
        for c in line:
            if len((part+c).encode('utf-8')) > 75:
                folded.append(part)
                part = ' '
            part += c
        folded.append(part)
    return ('\r\n'.join(folded)+'\r\n').encode('utf-8')
