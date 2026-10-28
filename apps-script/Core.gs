/** Shared pure scheduling functions. Copy into BOTH Apps Script projects. */
const PC_VERSION_ = '1.3.0';
const PC_ASSIGNMENT_HEADERS_ = ['PerformanceID','Date','Call','Curtain','PlayerID','AssignmentStatus','PublicNote','Revision','UpdatedAt'];
const PC_ASSIGNMENT_EXT_HEADERS_ = PC_ASSIGNMENT_HEADERS_.concat(['UnavailablePlayerIDs','Coverage']);
const PC_PERFORMANCE_HEADERS_ = ['PerformanceID','ShowID','Date','Curtain','Call','EndDate','End','Status','EventType','PublicNote','Revision','UpdatedAt'];
// Optional append-only columns. Readers still accept the original A:L header prefix.
const PC_PERFORMANCE_EXTRA_HEADERS_ = ['AllDay','TimeTBD','StaffingRequired','EventTitle'];
const PC_PERFORMANCE_EXT_HEADERS_ = PC_PERFORMANCE_HEADERS_.concat(PC_PERFORMANCE_EXTRA_HEADERS_);
const PC_ASSIGNMENT_STATUSES_ = ['Confirmed','Tentative','Needs sub','Open'];
const PC_PERFORMANCE_STATUSES_ = ['Scheduled','Cancelled'];
function check_(condition, message) { if (!condition) throw new Error(message); }
function str_(v) { return v == null ? '' : String(v).trim(); }
function truth_(v) { return v === true || str_(v).toLowerCase() === 'true'; }
function list_(v) { return str_(v).split(/[,;\n]/).map(str_).filter(Boolean); }
function unique_(values) { return Array.from(new Set(values)); }
function dateKey_(s) {
  s = str_(s);
  check_(/^\d{4}-\d{2}-\d{2}$/.test(s), 'Use YYYY-MM-DD dates: ' + s);
  const d = new Date(s + 'T12:00:00Z');
  check_(!isNaN(d) && d.toISOString().slice(0,10) === s, 'Invalid date: ' + s);
  return s;
}
function timeKey_(s) {
  s = str_(s);
  check_(/^([01]\d|2[0-3]):[0-5]\d$/.test(s), 'Use 24-hour HH:mm times: ' + s);
  return s;
}
function dayAdd_(date, days) {
  const d = new Date(dateKey_(date) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}
function wallParts_(instant, zone) {
  const p = new Intl.DateTimeFormat('en-GB', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant);
  const o = {}; p.forEach(x => { o[x.type] = x.value; });
  return o.year+'-'+o.month+'-'+o.day+'T'+o.hour+':'+o.minute+':'+o.second;
}
function wallToUtc_(date, time, zone) {
  const target = dateKey_(date) + 'T' + timeKey_(time) + ':00';
  const naive = Date.parse(target+'Z');
  let guess = naive;
  for (let i=0;i<4;i++) {
    const observed = Date.parse(wallParts_(new Date(guess), zone)+'Z');
    const delta = naive-observed; guess += delta;
    if (!delta) break;
  }
  check_(wallParts_(new Date(guess),zone) === target, 'Time does not exist in '+zone+': '+target);
  // Reject ambiguous fall-back hours rather than silently choosing a different call time.
  check_(![-3600000,3600000].some(delta => wallParts_(new Date(guess+delta),zone) === target), 'Ambiguous daylight-saving time: '+target);
  return new Date(guess).toISOString();
}
function optionalFlag_(value, fallback, label) {
  if (str_(value)==='') return fallback;
  check_(typeof value==='boolean'||['true','false'].includes(str_(value).toLowerCase()),label+' must be TRUE, FALSE or blank.');
  return truth_(value);
}
function performanceFlags_(p) {
  const timeTBD=optionalFlag_(p.TimeTBD,false,'TimeTBD');
  return {allDay:optionalFlag_(p.AllDay,false,'AllDay')||timeTBD,timeTBD,staffingRequired:optionalFlag_(p.StaffingRequired,true,'StaffingRequired')};
}
function requiresStaffing_(p) {return performanceFlags_(p).staffingRequired;}
function performanceTimes_(p, zone) {
  const date=dateKey_(p.Date),flags=performanceFlags_(p);
  if(flags.allDay) {
    check_(!str_(p.Call)&&!str_(p.Curtain)&&!str_(p.End),'All-day / time-TBD entries must leave Call, Curtain and End blank: '+p.PerformanceID);
    // Workbook EndDate is the last INCLUDED day. Calendar/ICS end is exclusive.
    const last=dateKey_(p.EndDate||date);check_(last>=date,'EndDate precedes Date: '+p.PerformanceID);
    return Object.assign({start:date,show:date,end:dayAdd_(last,1)},flags);
  }
  const call=timeKey_(p.Call),curtain=timeKey_(p.Curtain);
  check_(call<=curtain,'Call must be on the performance date and no later than curtain: '+p.PerformanceID);
  const start=wallToUtc_(date,call,zone),show=wallToUtc_(date,curtain,zone);
  const endDate=dateKey_(p.EndDate||date);
  // A source with a known start and no finish stays timed; never invent a duration.
  if(!str_(p.End)) {check_(endDate===date,'A later EndDate needs an End time for timed entries: '+p.PerformanceID);return Object.assign({start,show,end:null},flags);}
  const end=wallToUtc_(endDate,p.End,zone);check_(end>show,'End must be after curtain: '+p.PerformanceID);
  return Object.assign({start,show,end},flags);
}
function eventSort_(a,b) {return (a.date+'|'+(a.allDay?'0':'1')+'|'+(a.curtain||'')+'|'+(a.title||a.show)+'|'+(a.chair||'')).localeCompare(b.date+'|'+(b.allDay?'0':'1')+'|'+(b.curtain||'')+'|'+(b.title||b.show)+'|'+(b.chair||''));}
function objects_(rows, expected) {
  check_(rows.length && expected.every((h,i) => rows[0][i] === h), 'Unexpected sheet headers. Do not rename or reorder columns.');
  return rows.slice(1).map((r,index)=>{
    const o = {_row:index+2}; rows[0].forEach((h,i)=>{o[h]=r[i];}); return o;
  }).filter(o=>rows[0].some(h=>o[h]!==false && str_(o[h])!==''));
}
function keyed_(rows, key, label) {
  const m = {};
  rows.forEach(r=>{const id=str_(r[key]);check_(id, 'Missing '+key+' in '+label);check_(!m[id], 'Duplicate '+key+': '+id); m[id]=r;});
  return m;
}
function planRun_(rules, existing, zone, now) {
  const known = new Set(existing.map(p=>p.ShowID+'|'+p.Date+'|'+p.Curtain));
  const proposed = [], skipped = [];
  rules.forEach(r=>{
    check_(str_(r.ShowID), 'Run rule needs ShowID.');
    const start=dateKey_(r.StartDate), end=dateKey_(r.EndDate);
    check_(start<=end,'Rule end precedes start.');
    check_((Date.parse(end)-Date.parse(start))/86400000<=730,'Limit each run rule to two years.');
    const days=list_(r.Weekdays).map(x=>x.slice(0,3).toLowerCase());
    check_(days.length && days.every(x=>['sun','mon','tue','wed','thu','fri','sat'].includes(x)),'Use weekday names such as Wed,Sat,Sun.');
    const exclusions = new Set(list_(r.ExcludeDates).map(dateKey_));
    const curtain=timeKey_(r.Curtain), duration=Number(r.DurationMin), offset=Number(r.CallOffsetMin);
    check_(duration>0 && duration<=1440 && Number.isInteger(duration),'DurationMin must be 1–1440.');
    check_(offset>=0 && offset<=240 && Number.isInteger(offset),'CallOffsetMin must be 0–240.');
    for(let d=start;d<=end;d=dayAdd_(d,1)) {
      const wd=['sun','mon','tue','wed','thu','fri','sat'][new Date(d+'T12:00:00Z').getUTCDay()];
      if(!days.includes(wd)||exclusions.has(d)) continue;
      const k=r.ShowID+'|'+d+'|'+curtain;
      if(known.has(k)){skipped.push(k);continue;}
      const mins=Number(curtain.slice(0,2))*60+Number(curtain.slice(3));
      check_(mins>=offset,'Call would fall on the previous day. Enter this performance manually.');
      const fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
      const p={PerformanceID:'p-'+r.ShowID+'-'+d.replace(/-/g,'')+'-'+curtain.replace(':',''),ShowID:r.ShowID,Date:d,Curtain:curtain,Call:fmt(mins-offset),EndDate:dayAdd_(d,Math.floor((mins+duration)/1440)),End:fmt((mins+duration)%1440),Status:'Scheduled',EventType:r.EventType||'Performance',PublicNote:r.PublicNote||'',Revision:1,UpdatedAt:now};
      performanceTimes_(p,zone); proposed.push(p); known.add(k);
    }
  });
  proposed.sort((a,b)=>(a.Date+a.Curtain).localeCompare(b.Date+b.Curtain));
  return {proposed,skipped};
}
function chairCoverage_(chair,a,players) {
  const eligible=list_(chair.EligiblePlayerIDs),regular=unique_(list_(chair.RegularPlayerIDs||chair.EligiblePlayerIDs));
  const unavailable=unique_(list_(a.UnavailablePlayerIDs));
  regular.forEach(id=>check_(players[id]&&(!eligible.length||eligible.includes(id)),'Unknown or ineligible regular player: '+id));
  unavailable.forEach(id=>check_(players[id]&&(!eligible.length||eligible.includes(id)),'Unknown or ineligible unavailable player: '+id));
  const assignedUnavailable=!!a.PlayerID&&unavailable.includes(a.PlayerID);
  const needsCover=!a.PlayerID||a.AssignmentStatus==='Needs sub'||assignedUnavailable;
  const candidates=regular.filter(id=>!unavailable.includes(id)&&!(id===a.PlayerID&&a.AssignmentStatus==='Needs sub'));
  const coverage=!needsCover?'Covered':!regular.length?'Regular roster not configured':candidates.length?'Regular cover needed':'Outside substitute needed';
  return {unavailablePlayerIds:unavailable,unavailablePlayers:unavailable.map(id=>players[id].DisplayName),regularCandidateIds:candidates,regularCandidates:candidates.map(id=>players[id].DisplayName),assignedUnavailable,needsCover,coverage};
}
function publicEvents_(model) {
  [model.shows,model.players,model.performances].forEach((rows,i)=>{
    const key=['ShowID','PlayerID','PerformanceID'][i];
    rows.forEach(r=>check_(/^[a-zA-Z0-9._-]+$/.test(str_(r[key])),'Use letters, digits, dots, hyphens or underscores in '+key));
  });
  const shows=keyed_(model.shows,'ShowID','Shows'),players=keyed_(model.players,'PlayerID','Players');
  const performances=keyed_(model.performances,'PerformanceID','Performances'),base={},represented=new Set();
  model.performances.forEach(p=>{
    check_(shows[p.ShowID],'Unknown show on performance '+p.PerformanceID);
    if(!truth_(shows[p.ShowID].Published))return;
    check_(PC_PERFORMANCE_STATUSES_.includes(p.Status),'Invalid performance status: '+p.Status);
    const times=performanceTimes_(p,model.zone);
    base[p.PerformanceID]={performanceId:p.PerformanceID,showId:p.ShowID,show:shows[p.ShowID].Title,title:str_(p.EventTitle)||shows[p.ShowID].Title,venue:shows[p.ShowID].Venue,date:p.Date,call:p.Call||'',curtain:p.Curtain||'',endDate:p.EndDate||p.Date,end:p.End||'',start:times.start,finish:times.end,allDay:times.allDay,timeTBD:times.timeTBD,staffingRequired:times.staffingRequired,status:p.Status,type:p.EventType,note:p.PublicNote||'',sequence:Math.max(1,Number(model.revision||1)),updated:[p.UpdatedAt,model.changedAt||''].filter(Boolean).sort().pop()||'2026-01-01T00:00:00.000Z'};
  });
  const ids=new Set(),events=[];
  model.chairs.forEach(chair=>{
    check_(/^[a-zA-Z0-9_-]+$/.test(str_(chair.ChairID)),'Invalid ChairID.');
    check_(shows[chair.ShowID],'Unknown show on chair '+chair.ChairID);
    const ck=chair.ShowID+'|'+chair.ChairID;
    check_(!ids.has(ck),'Duplicate chair '+ck);ids.add(ck);
    const seen=new Set();
    (model.assignments[chair.TabName]||[]).forEach(a=>{
      check_(!seen.has(a.PerformanceID),'Duplicate performance on '+chair.TabName);seen.add(a.PerformanceID);
      const p=performances[a.PerformanceID];
      check_(p&&p.ShowID===chair.ShowID,'Assignment points to missing or different show: '+a.PerformanceID);
      check_(!a.PlayerID||players[a.PlayerID],'Unknown player: '+a.PlayerID);
      check_(PC_ASSIGNMENT_STATUSES_.includes(a.AssignmentStatus),'Invalid assignment status: '+a.AssignmentStatus);
      check_(a.AssignmentStatus!=='Open'||!a.PlayerID,'Open assignments must have an empty PlayerID.');
      check_(!a.PlayerID||!str_(chair.EligiblePlayerIDs)||list_(chair.EligiblePlayerIDs).includes(a.PlayerID),'Player not eligible for chair: '+a.PlayerID);
      const coverage=chairCoverage_(chair,a,players);
      if(!base[p.PerformanceID])return;
      represented.add(p.PerformanceID);
      events.push(Object.assign({},base[p.PerformanceID],{id:p.PerformanceID+'--'+chair.ChairID,eventOnly:false,playerId:a.PlayerID||'',player:a.PlayerID?players[a.PlayerID].DisplayName:'Open',chair:chair.Label,instrumentation:chair.Instrumentation,assignmentStatus:coverage.assignedUnavailable?'Needs sub':a.PlayerID?a.AssignmentStatus:'Open',note:[p.PublicNote,a.PublicNote].filter(Boolean).join('\n'),updated:[base[p.PerformanceID].updated,a.UpdatedAt].filter(Boolean).sort().pop()},coverage));
    });
  });
  // A bare event is public without fabricating an instrument or musician. Staffed
  // performances remain represented only by their real seat rows, avoiding duplicates.
  Object.values(base).filter(p=>!represented.has(p.performanceId)).forEach(p=>events.push(Object.assign({},p,{id:p.performanceId+'--event',eventOnly:true,playerId:'',player:'',chair:'',instrumentation:'',assignmentStatus:'',unavailablePlayerIds:[],unavailablePlayers:[],regularCandidateIds:[],regularCandidates:[],assignedUnavailable:false,needsCover:false,coverage:'Not applicable'})));
  return events.sort(eventSort_);
}
function icsEscape_(v) {return String(v||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
function utf8Length_(s) {let n=0;for(const c of s){const p=c.codePointAt(0);n+=p<128?1:p<2048?2:p<65536?3:4;}return n;}
function foldIcs_(s) {
  const lines=[];let line='',bytes=0;
  for(const c of s){const n=utf8Length_(c);if(bytes+n>75){lines.push(line);line=' ';bytes=1;}line+=c;bytes+=n;}
  lines.push(line);return lines.join('\r\n');
}
function icsStamp_(s) {const d=new Date(s);check_(!isNaN(d),'Invalid timestamp');return d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');}
function makeIcs_(events, playerId, options) {
  check_(str_(playerId),'Choose an individual PlayerID.');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Musician Pit Calendar//EN','CALSCALE:GREGORIAN','X-WR-CALNAME:'+icsEscape_(options.title+' - '+options.playerName)];
  // Merely being eligible or listed as unavailable never adds an event to a feed.
  events.filter(e=>e.playerId===playerId&&!e.eventOnly).forEach(e=>{
    const canceled=e.status==='Cancelled';
    const summary=(canceled?'CANCELLED: ':'')+(e.title||e.show)+' - '+e.chair+' - '+e.player+(e.assignmentStatus==='Tentative'?' (tentative)':e.assignmentStatus==='Needs sub'?' (needs sub)':'')+(e.timeTBD?' (time TBD)':'');
    const timing=e.allDay?[e.timeTBD?'Time not listed — time TBD.':'All day','Dates: '+e.date+(e.endDate!==e.date?' through '+e.endDate:'')]:['Call: '+e.call,'Curtain: '+e.curtain,e.end?'Expected finish: '+e.endDate+' '+e.end:'Finish not listed.'];
    const desc=timing.concat(['Instrumentation: '+e.instrumentation,'Assignment: '+e.assignmentStatus,e.assignedUnavailable?'Assigned player has recorded a conflict; replacement needed.':'',e.needsCover?'Coverage: '+e.coverage:'',e.note,'Check the live schedule for urgent changes.']).filter(Boolean).join('\n');
    const dates=e.allDay?['DTSTART;VALUE=DATE:'+dateKey_(e.date).replace(/-/g,''),'DTEND;VALUE=DATE:'+dateKey_(e.finish).replace(/-/g,'')]:['DTSTART:'+icsStamp_(e.start)].concat(e.finish?['DTEND:'+icsStamp_(e.finish)]:[]);
    lines.push('BEGIN:VEVENT','UID:'+e.id+'--'+playerId+'@musician-pit-calendar','DTSTAMP:'+icsStamp_(e.updated),'LAST-MODIFIED:'+icsStamp_(e.updated),'SEQUENCE:'+Math.max(1,e.sequence),...dates,'SUMMARY:'+icsEscape_(summary),'DESCRIPTION:'+icsEscape_(desc),'LOCATION:'+icsEscape_(e.venue),'STATUS:'+(canceled?'CANCELLED':e.assignmentStatus==='Tentative'?'TENTATIVE':'CONFIRMED'),'TRANSP:OPAQUE','END:VEVENT');
  });
  lines.push('END:VCALENDAR');return lines.map(foldIcs_).join('\r\n')+'\r\n';
}

/** Identity is stored once per player. Chair permissions never depend on assignments. */
function playerAccounts_(players) {
  const byID=keyed_(players,'PlayerID','Players'),seen={};
  players.forEach(p=>{
    const email=str_(p.GoogleEmail).toLowerCase();
    check_(!email||/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email),'Invalid GoogleEmail for player '+p.PlayerID);
    check_(!email||!seen[email],'GoogleEmail is assigned to more than one player: '+email);
    if(email)seen[email]=true;
  });
  return byID;
}
function chairEditorEmails_(chair,players) {
  const byID=playerAccounts_(players);
  return unique_(list_(chair.EligiblePlayerIDs).map(id=>{
    check_(byID[id],'Unknown eligible PlayerID: '+id);
    return str_(byID[id].GoogleEmail).toLowerCase();
  }).filter(Boolean));
}
function canEditChair_(email,chair,players,adminEmails) {
  const account=str_(email).toLowerCase();
  if(!account)return false;
  if(adminEmails.some(e=>str_(e).toLowerCase()===account))return true;
  return chairEditorEmails_(chair,players).includes(account);
}

/** A new performance seat is unclaimed until a player explicitly takes it. */
function newAssignmentRow_(performanceId,now) {
  return [performanceId,'','','','','Open','',1,now,'',''];
}

