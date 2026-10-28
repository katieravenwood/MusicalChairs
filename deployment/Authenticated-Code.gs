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

/** Standalone authenticated editor. Deploy as USER_ACCESSING, never as owner. */
function editorBook_(){const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');check_(id,'Administrator must set SPREADSHEET_ID in Project Settings.');return id;}
function editorRead_(name,headers){const r=Sheets.Spreadsheets.Values.get(editorBook_(),"'"+name.replace(/'/g,"''")+"'",{valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'FORMATTED_STRING'});return objects_(r.values||[],headers);}
function editorIdentity_(){const email=str_(Session.getActiveUser().getEmail()).toLowerCase();check_(email&&email===str_(Session.getEffectiveUser().getEmail()).toLowerCase(),'Sign in to the editor deployed to run as the user accessing the app.');return email;}
function editorContext_(background){const email=background?str_(Session.getEffectiveUser().getEmail()).toLowerCase():editorIdentity_();const players=editorRead_('Players',['PlayerID','DisplayName']);playerAccounts_(players);const admins=editorRead_('Access',['AdminEmail']).map(r=>str_(r.AdminEmail).toLowerCase());const chairs=editorRead_('Chairs',['ShowID','ChairID','Label','Instrumentation','TabName']);keyed_(chairs,'TabName','Chairs');keyed_(chairs.map(c=>({key:c.ShowID+'|'+c.ChairID})),'key','Chairs');const allowed=chairs.filter(c=>canEditChair_(email,c,players,admins));check_(admins.includes(email)||allowed.length,'Your Google account is not authorized for any chair. Ask an administrator to check Players.GoogleEmail and chair eligibility.');return {email,players,admins,chairs,allowed,isAdmin:admins.includes(email)};}
function editorLock_(fn){const lock=LockService.getScriptLock();check_(lock.tryLock(20000),'Another save is in progress. Try again.');try{return fn();}finally{lock.releaseLock();}}
function editorInputs_(a){return [str_(a.PlayerID),str_(a.AssignmentStatus),str_(a.PublicNote),str_(a.UnavailablePlayerIDs)];}
function editorFingerprint_(a){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(editorInputs_(a))));}
function editorSettings_(){const o={};editorRead_('Settings',['Key','Value']).forEach(r=>o[r.Key]=r.Value);return o;}
function maintenanceReady_(){const p=PropertiesService.getScriptProperties();const t=Date.parse(p.getProperty('MAINTENANCE_AT')||'');return Number.isFinite(t)&&Date.now()-t<10*60*1000;}
function getEditorState(){
 const ctx=editorContext_(),shows=keyed_(editorRead_('Shows',['ShowID','Title','Venue','Published']),'ShowID','Shows'),perfs=keyed_(editorRead_('Performances',PC_PERFORMANCE_HEADERS_),'PerformanceID','Performances'),players=keyed_(ctx.players,'PlayerID','Players'),rows=[],represented=new Set();
 const assignments={};
 const timing=p=>Object.assign({title:str_(p.EventTitle)||shows[p.ShowID].Title,endDate:p.EndDate||p.Date,end:p.End||'',type:p.EventType,performanceNote:str_(p.PublicNote)},performanceFlags_(p));
 // Read-only event context is public data. Chair details still come ONLY from ctx.allowed.
 ctx.chairs.forEach(c=>{assignments[c.TabName]=editorRead_(c.TabName,PC_ASSIGNMENT_HEADERS_);assignments[c.TabName].forEach(a=>represented.add(a.PerformanceID));});
 ctx.allowed.forEach(c=>assignments[c.TabName].forEach(a=>{const p=perfs[a.PerformanceID];check_(p&&p.ShowID===c.ShowID,'Invalid performance reference. Ask an administrator to validate the workbook.');rows.push(Object.assign({showId:c.ShowID,chairId:c.ChairID,performanceId:p.PerformanceID,show:shows[c.ShowID].Title,chair:c.Label,date:p.Date,call:p.Call||'',curtain:p.Curtain||'',cancelled:p.Status==='Cancelled',eventOnly:false,playerId:str_(a.PlayerID),status:str_(a.AssignmentStatus),note:str_(a.PublicNote),unavailable:unique_(list_(a.UnavailablePlayerIDs)),fingerprint:editorFingerprint_(a),coverage:chairCoverage_(c,a,players).coverage},timing(p)));}));
 Object.values(perfs).filter(p=>!represented.has(p.PerformanceID)&&(ctx.isAdmin||shows[p.ShowID]&&truth_(shows[p.ShowID].Published))).forEach(p=>{check_(shows[p.ShowID],'Unknown show on event. Ask an administrator to validate the workbook.');rows.push(Object.assign({showId:p.ShowID,chairId:'',performanceId:p.PerformanceID,show:shows[p.ShowID].Title,chair:'',date:p.Date,call:p.Call||'',curtain:p.Curtain||'',cancelled:p.Status==='Cancelled',eventOnly:true,playerId:'',status:'',note:str_(p.PublicNote),unavailable:[],coverage:'Not applicable'},timing(p)));});
 rows.sort(eventSort_);const config=editorSettings_(),calendarUrl=/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(str_(config.PublicAppURL))?str_(config.PublicAppURL):'';
 return {calendarUrl,email:ctx.email,isAdmin:ctx.isAdmin,ready:maintenanceReady_(),zone:config.TimeZone||'America/New_York',chairs:ctx.allowed.map(c=>({showId:c.ShowID,chairId:c.ChairID,label:c.Label,eligible:list_(c.EligiblePlayerIDs)})),players:ctx.players.map(p=>({id:p.PlayerID,name:p.DisplayName})),rows};
}
function normalizeEditorChange_(request,chair,players){check_(request&&typeof request==='object','Invalid save.');const player=str_(request.playerId),eligible=list_(chair.EligiblePlayerIDs);const ids=keyed_(players,'PlayerID','Players');check_(!player||(ids[player]&&eligible.includes(player)),'Choose a player eligible for this chair.');check_(Array.isArray(request.unavailable)&&request.unavailable.length<=eligible.length,'Invalid conflicts.');const conflicts=unique_(request.unavailable.map(str_));check_(conflicts.every(id=>ids[id]&&eligible.includes(id)),'A conflict contains an ineligible player.');let status=str_(request.status);check_(PC_ASSIGNMENT_STATUSES_.includes(status),'Invalid assignment status.');if(!player)status='Open';else if(conflicts.includes(player))status='Needs sub';else check_(status!=='Open','Choose a status for the assigned player.');const note=str_(request.note);check_(note.length<=1000,'Public note must be at most 1,000 characters.');return {PlayerID:player,AssignmentStatus:status,PublicNote:note,UnavailablePlayerIDs:conflicts.join(',')};}
function editorCell_(value){return {userEnteredValue:typeof value==='boolean'?{boolValue:value}:typeof value==='number'&&Number.isFinite(value)?{numberValue:value}:{stringValue:String(value)}};}
function editorCellRequest_(sheetId,row,col,values){return {updateCells:{range:{sheetId,startRowIndex:row-1,endRowIndex:row,startColumnIndex:col-1,endColumnIndex:col-1+values.length},rows:[{values:values.map(editorCell_)}],fields:'userEnteredValue'}};}
function saveEditorAssignment(request){return editorLock_(()=>{const ctx=editorContext_();check_(maintenanceReady_(),'Background maintenance is not ready. Ask an administrator to enable or repair it.');const c=ctx.allowed.find(c=>c.ShowID===request.showId&&c.ChairID===request.chairId);check_(c,'You cannot edit this chair.');const matches=editorRead_(c.TabName,PC_ASSIGNMENT_HEADERS_).filter(a=>a.PerformanceID===request.performanceId);check_(matches.length===1,'Assignment missing or duplicated. Ask an administrator to sync and validate.');const a=matches[0];check_(typeof request.fingerprint==='string'&&request.fingerprint===editorFingerprint_(a),'This seat changed since you opened it. Reload this seat, review the current values, and try again.');const p=editorRead_('Performances',PC_PERFORMANCE_HEADERS_).find(p=>p.PerformanceID===a.PerformanceID&&p.ShowID===c.ShowID);check_(p,'Performance no longer exists.');const changed=normalizeEditorChange_(request,c,ctx.players);const meta=Sheets.Spreadsheets.get(editorBook_(),{fields:'sheets.properties'});const sheet=meta.sheets.find(s=>s.properties.title===c.TabName);check_(sheet,'Chair tab not found.');const id=sheet.properties.sheetId;
// One atomic Sheets request; only user-editable cells. Explicit stringValue prevents formula injection.
Sheets.Spreadsheets.batchUpdate({requests:[editorCellRequest_(id,a._row,5,[changed.PlayerID,changed.AssignmentStatus,changed.PublicNote]),editorCellRequest_(id,a._row,10,[changed.UnavailablePlayerIDs])]},editorBook_());
return {saved:true,fingerprint:editorFingerprint_(changed),coverage:chairCoverage_(c,changed,keyed_(ctx.players,'PlayerID','Players')).coverage};});}
function doGet(){editorContext_();return HtmlService.createHtmlOutputFromFile('Editor').setTitle('Pit Calendar — Edit staffing').addMetaTag('viewport','width=device-width, initial-scale=1');}
/** Run once as an Access administrator, from the signed-in editor or Script editor. */
function installEditorMaintenance(){const ctx=editorContext_();check_(ctx.isAdmin,'Administrators only.');return editorLock_(()=>{const props=PropertiesService.getScriptProperties();const maintainer=props.getProperty('MAINTAINER');check_(!maintainer||maintainer===ctx.email,'Maintenance belongs to another administrator. Ask that administrator to repair it.');editorSnapshot_(ctx,false);if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='reconcileEditorChanges'))ScriptApp.newTrigger('reconcileEditorChanges').timeBased().everyMinutes(1).create();props.setProperty('MAINTAINER',ctx.email);props.setProperty('MAINTENANCE_AT',new Date().toISOString());return {ready:true};});}
function reconcileEditorChanges(){return editorLock_(()=>{const ctx=editorContext_(true);check_(ctx.isAdmin,'Maintenance account is no longer an administrator.');editorSnapshot_(ctx,false);PropertiesService.getScriptProperties().setProperty('MAINTENANCE_AT',new Date().toISOString());});}
function editorSnapshot_(ctx,initialize){const props=PropertiesService.getScriptProperties(),all=props.getProperties();const config=editorSettings_();const changes=[];const metadata=Sheets.Spreadsheets.get(editorBook_(),{fields:'sheets.properties'});const byName={};metadata.sheets.forEach(s=>byName[s.properties.title]=s.properties.sheetId);const players=keyed_(ctx.players,'PlayerID','Players');const requests=[],now=new Date().toISOString();const seen={};const updates={};ctx.chairs.forEach(c=>editorRead_(c.TabName,PC_ASSIGNMENT_HEADERS_).forEach(a=>{const k='ROW_'+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,c.TabName+'|'+a.PerformanceID));seen[k]=true;const value=JSON.stringify(editorInputs_(a));updates[k]=value;if(!initialize&&all[k]!==undefined&&all[k]!==value){requests.push(editorCellRequest_(byName[c.TabName],a._row,8,[Math.max(0,Number(a.Revision)||0)+1,now]));requests.push(editorCellRequest_(byName[c.TabName],a._row,11,[chairCoverage_(c,a,players).coverage]));changes.push([now,'Not captured (background reconciliation)',c.TabName,'PerformanceID: '+a.PerformanceID,all[k],value,'Observed input changes; may include app, API, or native Sheets edits.']);}}));if(changes.length){const settings=editorRead_('Settings',['Key','Value']);[['ScheduleRevision',Number(config.ScheduleRevision||0)+1],['LastEditAt',now]].forEach(([key,val])=>{const r=settings.find(x=>x.Key===key);check_(r,'Missing setting '+key);requests.push(editorCellRequest_(byName.Settings,r._row,2,[val]));});requests.push({appendCells:{sheetId:byName['Change Log'],rows:changes.map(row=>({values:row.map(editorCell_)})),fields:'userEnteredValue'}});Sheets.Spreadsheets.batchUpdate({requests},editorBook_());}props.setProperties(updates);Object.keys(all).filter(k=>k.startsWith('ROW_')&&!seen[k]).forEach(k=>props.deleteProperty(k));}

/** Authenticated web administration. Internal helpers are not RPC callable. */
const PC_PREFIX_ = 'Pit Calendar: ';
function book_(){return SpreadsheetApp.openById(editorBook_());}
function identity_(){return editorIdentity_();}
function raw_(name) {
  const sheet=book_().getSheetByName(name);check_(sheet,'Missing tab: '+name);
  return sheet.getDataRange().getValues().map(row=>row.map(v=>{
    if(v instanceof Date) return Utilities.formatDate(v,book_().getSpreadsheetTimeZone(), v.getFullYear()<1901?'HH:mm':'yyyy-MM-dd');
    return typeof v==='string'?v.trim():v;
  }));
}
function rows_(name,headers) {return objects_(raw_(name),headers||raw_(name)[0]);}
function settings_() {const out={};rows_('Settings',['Key','Value']).forEach(r=>out[r.Key]=r.Value);return out;}
function setSetting_(key,value) {
  const sh=book_().getSheetByName('Settings');const r=rows_('Settings',['Key','Value']).find(x=>x.Key===key);
  if(r)sh.getRange(r._row,2).setValue(value);else sh.appendRow([key,value]);
}
function owner_() {const o=book_().getOwner();check_(o,'This starter expects a personally owned workbook, not a Shared Drive.');return o.getEmail().toLowerCase();}
function admins_() {return unique_([owner_()].concat(rows_('Access',['AdminEmail']).map(r=>str_(r.AdminEmail).toLowerCase())).filter(Boolean));}
function audit_(sheet,range,before,after,note,actor) {
  const short=v=>str_(v).slice(0,4000);
  book_().getSheetByName('Change Log').appendRow([new Date().toISOString(),actor||identity_()||'Unavailable',sheet,range,short(before),short(after),note||'']);
  const config=settings_();setSetting_('ScheduleRevision',Number(config.ScheduleRevision||0)+1);setSetting_('LastEditAt',new Date().toISOString());
}
function stampRows_(sheet,first,count,revCol,timeCol) {
  const now=new Date().toISOString();const r=sheet.getRange(first,revCol,count,1).getValues();
  sheet.getRange(first,revCol,count,1).setValues(r.map(x=>[Math.max(0,Number(x[0])||0)+1]));
  sheet.getRange(first,timeCol,count,1).setValues(r.map(()=>[now]));
}
function chairConfig_() {
  const chairs=rows_('Chairs',['ShowID','ChairID','Label','Instrumentation','TabName']);
  keyed_(chairs.map(c=>({key:c.ShowID+'|'+c.ChairID})),'key','Chairs');keyed_(chairs,'TabName','Chairs');
  const shows=keyed_(rows_('Shows',['ShowID','Title','Venue','Published']),'ShowID','Shows');
  const players=keyed_(rows_('Players',['PlayerID','DisplayName']),'PlayerID','Players');
  chairs.forEach(c=>{
    check_(shows[c.ShowID],'Unknown ShowID on chair '+c.ChairID);
    check_(/^[a-zA-Z0-9_-]+$/.test(c.ChairID),'ChairID must contain letters, digits, hyphens or underscores.');
    check_(!['Start Here','Shows','Players','Chairs','Performances','Run Rules','Access','Settings','Change Log'].includes(c.TabName),'Reserved tab name: '+c.TabName);
    check_(c.TabName && c.TabName.length<=80 && !/[\[\]*?:/\\]/.test(c.TabName),'Invalid TabName: '+c.TabName);
    const eligible=list_(c.EligiblePlayerIDs);eligible.forEach(id=>check_(players[id],'Unknown eligible PlayerID: '+id));
    list_(c.RegularPlayerIDs||c.EligiblePlayerIDs).forEach(id=>check_(players[id]&&(!eligible.length||eligible.includes(id)),'Unknown or ineligible regular player: '+id));
    chairEditorEmails_(c,Object.values(players));
  });
  return chairs;
}
function refreshChairEditors_(chairs) {
  const players=rows_('Players',['PlayerID','DisplayName']),sh=book_().getSheetByName('Chairs');
  // Preflight every lookup before writing the derived display.
  const resolved=chairs.map(c=>({c,emails:chairEditorEmails_(c,players)}));
  sh.getRange(1,raw_('Chairs')[0].indexOf('EditorEmails')+1).setNote('Calculated from EligiblePlayerIDs and Players.GoogleEmail. Do not type email addresses here. Run Apply chair permissions after account or eligibility changes. Admins in Access can edit all chairs.');
  resolved.forEach(({c,emails})=>{
    const cell=sh.getRange(c._row,raw_('Chairs')[0].indexOf('EditorEmails')+1),note=cell.getNote()||'';
    if(!note.startsWith('Calculated chair editors.')) {
      const old=str_(cell.getValue());
      cell.setNote('Calculated chair editors. Maintained by calendar tools.'+(old?' Previous manual list (reference only, no longer grants access): '+old:'')+(note?' Previous note: '+note:''));
    }
    cell.setValue(emails.join(','));
  });
}
function syncChairs_() {
  const chairs=chairConfig_(),perfs=rows_('Performances',PC_PERFORMANCE_HEADERS_);keyed_(perfs,'PerformanceID','Performances');
  refreshChairEditors_(chairs);
  chairs.forEach(c=>{
    let sh=book_().getSheetByName(c.TabName);const isNew=!sh;if(isNew){sh=book_().insertSheet(c.TabName);sh.appendRow(PC_ASSIGNMENT_EXT_HEADERS_);}
    const extra=sh.getRange('J1:K1').getValues()[0];
    check_((!extra[0]||extra[0]==='UnavailablePlayerIDs')&&(!extra[1]||extra[1]==='Coverage'),'Columns J:K are reserved for conflicts and coverage on '+c.TabName);
    sh.getRange('J1:K1').setValues([['UnavailablePlayerIDs','Coverage']]);
    const assignments=objects_(raw_(c.TabName),PC_ASSIGNMENT_HEADERS_);const existing=keyed_(assignments,'PerformanceID',c.TabName);
    const add=perfs.filter(p=>p.ShowID===c.ShowID&&requiresStaffing_(p)&&!existing[p.PerformanceID]).map(p=>newAssignmentRow_(p.PerformanceID,new Date().toISOString()));
    if(add.length) {
      const first=sh.getLastRow()+1;
      if(first+add.length>sh.getMaxRows())sh.insertRowsAfter(sh.getMaxRows(),first+add.length-sh.getMaxRows());
      sh.getRange(first,1,add.length,11).setValues(add);
    }
    const n=sh.getLastRow()-1;
    if(n>0){
      // Lookup by immutable PerformanceID, never by row position or date.
      const f=[];for(let r=2;r<=n+1;r++)f.push([`=IFNA(VLOOKUP($A${r},Performances!$A$2:$L,3,FALSE),"Missing performance")`,`=IFNA(IF(VLOOKUP($A${r},Performances!$A$2:$L,5,FALSE)="","",VLOOKUP($A${r},Performances!$A$2:$L,5,FALSE)),"")`,`=IFNA(IF(VLOOKUP($A${r},Performances!$A$2:$L,4,FALSE)="","",VLOOKUP($A${r},Performances!$A$2:$L,4,FALSE)),"")`]);
      sh.getRange(2,2,n,3).setFormulas(f);sh.getRange(2,2,n,1).setNumberFormat('yyyy-mm-dd');sh.getRange(2,3,n,2).setNumberFormat('hh:mm');
    }
    const options=list_(c.EligiblePlayerIDs).length?list_(c.EligiblePlayerIDs):rows_('Players',['PlayerID','DisplayName']).map(p=>p.PlayerID);
    if(options.length)sh.getRange('E2:E').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(options,true).setAllowInvalid(false).build());
    sh.getRange('F2:F').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PC_ASSIGNMENT_STATUSES_,true).setAllowInvalid(false).build());
    if(isNew)sh.getRange('J2:J').setBackground('#fff4d6');
    const ids=options.map(id=>id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
    if(ids)sh.getRange('J2:J').setDataValidation(SpreadsheetApp.newDataValidation().requireFormulaSatisfied('=OR(J2="",AND($A2<>"",REGEXMATCH(J2,"^\\s*('+ids+')(\\s*[,;]\\s*('+ids+'))*\\s*$")))').setAllowInvalid(false).setHelpText('Eligible PlayerIDs separated by commas: '+options.join(', ')+'. No reasons or private details.').build());
    refreshChairCoverage_(c,sh);
    if(isNew){sh.getRange('E2:G').setBackground('#fff4d6');sh.setFrozenRows(1);sh.setFrozenColumns(1);sh.setHiddenGridlines(true);
      sh.getRange(1,1,1,11).setBackground('#283750').setFontColor('#ffffff').setFontWeight('bold');sh.setColumnWidths(1,9,145);sh.setColumnWidth(1,260);sh.setColumnWidth(7,280);sh.setColumnWidth(10,230);sh.setColumnWidth(11,240);}
  });
}
function refreshChairCoverage_(c,sh) {
  const players=keyed_(rows_('Players',['PlayerID','DisplayName']),'PlayerID','Players');
  const assignments=objects_(raw_(c.TabName),PC_ASSIGNMENT_HEADERS_);
  assignments.forEach(a=>{a._coverage=chairCoverage_(c,a,players).coverage;});
  if(assignments.length){const byRow={};assignments.forEach(a=>byRow[a._row]=a._coverage);const n=sh.getLastRow()-1;sh.getRange(2,11,n,1).setValues(Array.from({length:n},(_,i)=>[byRow[i+2]||'']));}
}
function setProtection_(p,emails) {
  const me=Session.getEffectiveUser().getEmail();
  p.setWarningOnly(false);p.addEditor(me);
  const remove=p.getEditors().map(u=>u.getEmail()).filter(e=>e!==me&&e!==owner_());if(remove.length)p.removeEditors(remove);
  if(emails.length)p.addEditors(emails);
  if(p.canDomainEdit())p.setDomainEdit(false);
}
function applyPermissions_() {
  const admin=admins_(),chairs=chairConfig_(),players=rows_('Players',['PlayerID','DisplayName']),byTab={};chairs.forEach(c=>byTab[c.TabName]=c);
  refreshChairEditors_(chairs);
  // Protect sheets before exposing assignment ranges. Unknown/new tabs default to administrators only.
  book_().getSheets().forEach(sh=>{
    const owned=sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).filter(p=>str_(p.getDescription()).startsWith(PC_PREFIX_));
    const p=owned[0]||sh.protect();p.setDescription(PC_PREFIX_+'structure');setProtection_(p,admin);
    const c=byTab[sh.getName()];
    if(c){
      const range=sh.getRange(2,5,Math.max(1,sh.getMaxRows()-1),3);
      const old=sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).filter(x=>x.getDescription()===PC_PREFIX_+'assignments');
      const rp=old[0]||range.protect();rp.setRange(range);rp.setDescription(PC_PREFIX_+'assignments');
      setProtection_(rp,unique_(admin.concat(chairEditorEmails_(c,players))));
      const conflict=sh.getRange(2,10,Math.max(1,sh.getMaxRows()-1),1);
      const oldConflict=sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).filter(x=>x.getDescription()===PC_PREFIX_+'conflicts');
      const cp=oldConflict[0]||conflict.protect();cp.setRange(conflict);cp.setDescription(PC_PREFIX_+'conflicts');
      setProtection_(cp,unique_(admin.concat(chairEditorEmails_(c,players))));
      p.setUnprotectedRanges([range,conflict]);
    }else p.setUnprotectedRanges([]);
  });
  audit_('Chairs','permissions','','','Applied chair permissions from eligible players and Players.GoogleEmail; administrators cover all chairs');
}
function editorModel_() {
  const config=settings_(),chairs=chairConfig_(),assignments={};chairs.forEach(c=>assignments[c.TabName]=objects_(raw_(c.TabName),PC_ASSIGNMENT_HEADERS_));
  return {shows:rows_('Shows',['ShowID','Title','Venue','Published']),players:rows_('Players',['PlayerID','DisplayName']),chairs,performances:rows_('Performances',PC_PERFORMANCE_HEADERS_),assignments,zone:config.TimeZone};
}
const ADMIN_FIELDS_={Players:['PlayerID','DisplayName','GoogleEmail'],Shows:['ShowID','Title','Venue','Published'],Chairs:['ShowID','ChairID','Label','Instrumentation','TabName','EligiblePlayerIDs','RegularPlayerIDs'],Performances:PC_PERFORMANCE_HEADERS_.slice(0,10).concat(PC_PERFORMANCE_EXTRA_HEADERS_),'Run Rules':['ShowID','StartDate','EndDate','Weekdays','Curtain','DurationMin','CallOffsetMin','EventType','ExcludeDates','PublicNote']};
function webAdmin_(){const ctx=editorContext_();check_(ctx.isAdmin,'Administrators only.');return ctx;}
function adminToken_(record){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(record)));}
function getAdminState(){webAdmin_();const tables={};Object.keys(ADMIN_FIELDS_).forEach(name=>{const headers=raw_(name)[0],fields=ADMIN_FIELDS_[name].filter(h=>name!=='Performances'||!PC_PERFORMANCE_EXTRA_HEADERS_.includes(h)||headers.includes(h));check_(fields.every(h=>headers.includes(h)),'Missing columns in '+name);tables[name]={fields,records:rows_(name).map(r=>({values:r,token:adminToken_(r)}))};});return {tables,workbookUrl:book_().getUrl()};}
function adminValidate_(table,r,old,data){
 const id=v=>check_(/^[A-Za-z0-9_-]+$/.test(str_(v)),'IDs must contain letters, digits, hyphens or underscores, without spaces.');
 Object.values(r).forEach(v=>check_(str_(v).length<=1000,'Fields must be at most 1,000 characters.'));
 const shows=keyed_(data.Shows,'ShowID','Shows'),players=keyed_(data.Players,'PlayerID','Players');
 if(table==='Players'){id(r.PlayerID);check_(r.DisplayName,'Enter a display name.');check_(!old||old.PlayerID===r.PlayerID,'Player IDs cannot be renamed.');playerAccounts_(data.Players.filter(x=>!old||x._row!==old._row).concat([r]));}
 if(table==='Shows'){id(r.ShowID);check_(r.Title,'Enter a show title.');check_(!old||old.ShowID===r.ShowID,'Show IDs cannot be renamed.');check_(['true','false'].includes(str_(r.Published).toLowerCase()),'Published must be true or false.');r.Published=truth_(r.Published);}
 if(table==='Chairs'){
  id(r.ChairID);check_(shows[r.ShowID],'Choose an existing show.');check_(r.Label,'Enter a chair label.');
  check_(!old||(old.ShowID===r.ShowID&&old.ChairID===r.ChairID&&old.TabName===r.TabName),'Existing chair IDs, show and storage tab cannot be changed.');
  check_(r.TabName&&r.TabName.length<=80&&!/[\[\]*?:/\\]/.test(r.TabName),'Invalid storage tab name.');check_(!['Start Here','Shows','Players','Chairs','Performances','Run Rules','Access','Settings','Change Log'].includes(r.TabName),'Reserved storage tab name.');
  const eligible=unique_(list_(r.EligiblePlayerIDs));check_(eligible.every(x=>players[x]),'Unknown eligible player.');check_(list_(r.RegularPlayerIDs).every(x=>eligible.includes(x)),'Regular players must also be eligible.');
  check_(!data.Chairs.some(c=>(!old||c._row!==old._row)&&(c.TabName===r.TabName||(c.ShowID===r.ShowID&&c.ChairID===r.ChairID))),'Duplicate chair or storage tab.');
  if(old)(data.assignments[old.TabName]||[]).forEach(a=>check_([a.PlayerID,...list_(a.UnavailablePlayerIDs)].filter(Boolean).every(x=>eligible.includes(x)),'A removed player still has assignments or conflicts. Reassign or clear those entries first.'));
  r.EligiblePlayerIDs=eligible.join(',');r.RegularPlayerIDs=unique_(list_(r.RegularPlayerIDs)).join(',');
 }
 if(table==='Performances'){
  id(r.PerformanceID);check_(shows[r.ShowID],'Choose an existing show.');check_(!old||(old.PerformanceID===r.PerformanceID&&old.ShowID===r.ShowID),'Existing performance IDs and show cannot be changed.');check_(PC_PERFORMANCE_STATUSES_.includes(r.Status),'Invalid performance status.');const flags=performanceFlags_(r);r.AllDay=flags.allDay;r.TimeTBD=flags.timeTBD;r.StaffingRequired=flags.staffingRequired;performanceTimes_(r,data.zone);
  check_(!data.Performances.some(p=>(!old||p._row!==old._row)&&!performanceFlags_(p).allDay&&!performanceFlags_(r).allDay&&requiresStaffing_(p)&&requiresStaffing_(r)&&p.ShowID===r.ShowID&&p.Date===r.Date&&p.Curtain===r.Curtain),'Another performance already occupies this show time.');
 }
 if(table==='Run Rules'){check_(shows[r.ShowID],'Choose an existing show.');planRun_([r],[],data.zone,new Date().toISOString());}
 if(['Players','Shows','Performances'].includes(table)){const key=ADMIN_FIELDS_[table][0];check_(!data[table].some(x=>(!old||x._row!==old._row)&&x[key]===r[key]),'That ID already exists.');}
 return r;
}
function saveAdminRecord(request){return editorLock_(()=>{
 webAdmin_();check_(request&&Object.prototype.hasOwnProperty.call(ADMIN_FIELDS_,request.table),'Unknown table.');const table=request.table,fields=ADMIN_FIELDS_[table],sh=book_().getSheetByName(table),existing=rows_(table);let headers=raw_(table)[0];const row=Number(request.row||0);check_(Number.isInteger(row)&&row>=0,'Invalid record.');const old=row?existing.find(r=>r._row===row):null;check_(!row||old,'Record no longer exists.');check_(!old||request.token===adminToken_(old),'This record changed. Reload administration and try again.');
 const data={};['Players','Shows','Chairs','Performances'].forEach(n=>data[n]=rows_(n));data.zone=settings_().TimeZone;data.assignments={};if(table==='Chairs'&&old)data.assignments[old.TabName]=rows_(old.TabName);
 const r={};fields.forEach(h=>r[h]=str_(request.values&&Object.prototype.hasOwnProperty.call(request.values,h)?request.values[h]:PC_PERFORMANCE_EXTRA_HEADERS_.includes(h)&&old?old[h]:''));adminValidate_(table,r,old,data);
 if(table==='Chairs'&&!old)check_(!book_().getSheetByName(r.TabName),'That storage tab already exists. Choose another name.');
 if(table==='Performances'){ensurePerformanceFields_();headers=raw_(table)[0];r.Revision=Number(old&&old.Revision||0)+1;r.UpdatedAt=new Date().toISOString();}
 const target=old?old._row:sh.getLastRow()+1;if(target>sh.getMaxRows())sh.insertRowsAfter(sh.getMaxRows(),target-sh.getMaxRows());
 // Write only named fields, preserving custom columns, formatting and formulas.
 const requests=Object.keys(r).map(h=>{const col=headers.indexOf(h);check_(col>=0,'Missing column '+h);return editorCellRequest_(sh.getSheetId(),target,col+1,[r[h]]);});
 Sheets.Spreadsheets.batchUpdate({requests},editorBook_());
 audit_(table,'row '+target,old?JSON.stringify(old):'',JSON.stringify(r),'Staffing Editor administration');
 try{if(['Players','Chairs','Performances'].includes(table)){syncChairs_();applyPermissions_();}SpreadsheetApp.flush();return {saved:true,message:'Saved. New seats remain open; existing assignments were preserved.'};}catch(e){return {saved:true,message:'Record saved, but follow-up synchronization or permissions failed: '+e.message+'. Use Repair / sync and Apply chair permissions before sharing or editing new chairs.'};}
 });}
function applyEditorChairPermissions(){return editorLock_(()=>{webAdmin_();applyPermissions_();return {message:'Chair permissions applied. Workbook sharing is separate and no invitations were sent.'};});}
function syncEditorChairs(){return editorLock_(()=>{webAdmin_();syncChairs_();applyPermissions_();return {message:'Missing seats added, coverage refreshed and permissions applied. Existing assignments preserved.'};});}
function previewAdminRun(){webAdmin_();const rules=rows_('Run Rules'),existing=rows_('Performances',PC_PERFORMANCE_HEADERS_),zone=settings_().TimeZone;const plan=planRun_(rules,existing,zone,new Date().toISOString());const shows=keyed_(rows_('Shows'),'ShowID','Shows');plan.proposed.forEach(p=>check_(shows[p.ShowID],'Unknown show '+p.ShowID));check_(plan.proposed.length<=1500,'Generate at most 1,500 performances at once.');return {rows:plan.proposed,skipped:plan.skipped.length,token:adminToken_({rules,existing,zone})};}
function commitAdminRun(request){return editorLock_(()=>{webAdmin_();const plan=previewAdminRun();check_(request&&request.token===plan.token,'Rules or performances changed. Preview again.');if(!plan.rows.length)return {message:'No new dates to create.'};const sh=book_().getSheetByName('Performances'),first=sh.getLastRow()+1;if(first+plan.rows.length>sh.getMaxRows())sh.insertRowsAfter(sh.getMaxRows(),first+plan.rows.length-sh.getMaxRows());Sheets.Spreadsheets.batchUpdate({requests:plan.rows.map((p,i)=>editorCellRequest_(sh.getSheetId(),first+i,1,PC_PERFORMANCE_HEADERS_.map(h=>p[h])))},editorBook_());audit_('Performances','bulk','','',plan.rows.length+' performances generated in Staffing Editor');try{syncChairs_();applyPermissions_();return {message:plan.rows.length+' performances created with open seats.'};}catch(e){return {message:'Dates created. Repair / sync is needed: '+e.message};}});}

/** Append optional flags without changing A:L or overwriting custom columns. */
function ensurePerformanceFields_() {
 const sh=book_().getSheetByName('Performances'),values=raw_('Performances'),headers=values[0];
 check_(PC_PERFORMANCE_HEADERS_.every((h,i)=>headers[i]===h),'Unexpected Performances headers. A:L must remain unchanged.');
 PC_PERFORMANCE_EXTRA_HEADERS_.forEach((h,i)=>check_(!str_(headers[12+i])||headers[12+i]===h,'Performances column '+(13+i)+' is already used. Preserve it and resolve the schema before enabling all-day entries.'));
 PC_PERFORMANCE_EXTRA_HEADERS_.forEach((h,i)=>check_(str_(headers[12+i])||!values.slice(1).some(row=>str_(row[12+i])!==''),'Performances column '+(13+i)+' has data beneath a blank header. Preserve it and resolve the schema before enabling all-day entries.'));
 if(sh.getMaxColumns()<16)sh.insertColumnsAfter(sh.getMaxColumns(),16-sh.getMaxColumns());
 sh.getRange(1,13,1,4).setValues([PC_PERFORMANCE_EXTRA_HEADERS_]).setBackground('#283750').setFontColor('#ffffff').setFontWeight('bold');
 const notes=['TRUE: a date-only entry. Leave Call/Curtain/End blank. EndDate is the last included day. Blank means FALSE.','TRUE: start time is not listed. Display in all-day area as Time TBD; leave all times blank. Blank means FALSE.','FALSE: informational event, no automatic chair rows. Blank means TRUE for legacy performances. Does not delete existing chair rows.','Optional event-specific display title. Blank uses the show title.'];
 notes.forEach((note,i)=>sh.getRange(1,13+i).setNote(note));
 // A TRUE/FALSE list allows a blank legacy StaffingRequired to stay blank (not FALSE).
 sh.getRange(2,13,Math.max(1,sh.getMaxRows()-1),3).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['TRUE','FALSE'],true).setAllowInvalid(false).build());
 sh.getRange('F1').setNote('Timed entry: date of finish. All-day/time-TBD entry: last INCLUDED date (blank means Date). Calendar feeds convert this to an exclusive end.');
}
