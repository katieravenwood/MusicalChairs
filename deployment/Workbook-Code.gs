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

/** Bound editor project only. NEVER deploy this project as a public web app. */
const PC_PREFIX_ = 'Pit Calendar: ';
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Pit Calendar')
    .addItem('Initialize / repair installation','initialize')
    .addItem('Enable all-day / event fields','enableEventFields')
    .addItem('Preview run generation','previewRun')
    .addItem('Sync missing chair rows','syncChairs')
    .addItem('Apply chair permissions','applyChairPermissions')
    .addItem('Validate schedule','validateSchedule')
    .addItem('Create backup copy','createBackup')
    .addToUi();
}
function book_() {return SpreadsheetApp.getActiveSpreadsheet();}
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
function identity_() {return str_(Session.getActiveUser().getEmail()).toLowerCase();}
function owner_() {const o=book_().getOwner();check_(o,'This starter expects a personally owned workbook, not a Shared Drive.');return o.getEmail().toLowerCase();}
function admins_() {return unique_([owner_()].concat(rows_('Access',['AdminEmail']).map(r=>str_(r.AdminEmail).toLowerCase())).filter(Boolean));}
function requireAdmin_() {const email=identity_();check_(email && admins_().includes(email),'This action is for a musician administrator. Sign in with an authorized Google account.');return email;}
function locked_(fn) {const lock=LockService.getDocumentLock();check_(lock.tryLock(20000),'Another calendar operation is running. Try again shortly.');try{return fn();}finally{lock.releaseLock();}}
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
function initialize() {
  check_(identity_()===owner_() || admins_().includes(identity_()),'Run installation as the workbook owner or a musician administrator.');
  locked_(()=>{
    const config=settings_();book_().setSpreadsheetTimeZone(config.TimeZone||'America/New_York');
    const access=book_().getSheetByName('Access');
    if(!rows_('Access',['AdminEmail']).some(r=>str_(r.AdminEmail).toLowerCase()===owner_())) access.appendRow([owner_()]);
    formatBase_();ensurePerformanceFields_();syncChairs_();
    const mine=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='calendarEdit');
    if(!mine.length)ScriptApp.newTrigger('calendarEdit').forSpreadsheet(book_()).onEdit().create();
    setSetting_('LastSuccessfulCheck',new Date().toISOString());
  });
  SpreadsheetApp.getUi().alert('Installed. Permission changes are a separate action. Add musician administrators to Access, enter each player’s GoogleEmail in Players and configure Chairs.EligiblePlayerIDs, share the workbook with those accounts, and run Apply chair permissions when the editor list is agreed.');
}
function formatBase_() {
  book_().getSheets().forEach(sh=>{
    if(sh.getName()==='Start Here')return;
    sh.setFrozenRows(1);sh.setHiddenGridlines(true);
    sh.getRange(1,1,1,sh.getLastColumn()).setBackground('#283750').setFontColor('#ffffff').setFontWeight('bold');
  });
  const playerSheet=book_().getSheetByName('Players');
  check_(!playerSheet.getRange('C1').getValue()||playerSheet.getRange('C1').getValue()==='GoogleEmail','Column C on Players is reserved for GoogleEmail.');
  playerSheet.getRange('C1').setValue('GoogleEmail').setBackground('#283750').setFontColor('#ffffff').setFontWeight('bold').setNote('Google account used to edit eligible chairs. One address per player; blank gives no player editing access.');
  playerSheet.setColumnWidth(3,280);
  const shows=book_().getSheetByName('Shows');shows.getRange(2,4,Math.max(1,shows.getMaxRows()-1),1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  const chairSheet=book_().getSheetByName('Chairs');
  if(!raw_('Chairs')[0].includes('RegularPlayerIDs')){const col=chairSheet.getLastColumn()+1;chairSheet.getRange(1,col).setValue('RegularPlayerIDs').setBackground('#283750').setFontColor('#ffffff').setFontWeight('bold');chairSheet.setColumnWidth(col,200);}
  const p=book_().getSheetByName('Performances');p.getRange('H2:H').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PC_PERFORMANCE_STATUSES_,true).setAllowInvalid(false).build());
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
function syncChairs() {requireAdmin_();locked_(syncChairs_);SpreadsheetApp.getUi().alert('Missing chair rows added. Existing assignments were preserved. Reapply chair permissions before sharing newly created tabs.');}
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
function applyChairPermissions() {requireAdmin_();locked_(applyPermissions_);SpreadsheetApp.getUi().alert('Chair permissions applied. Google sharing must separately grant these accounts workbook Editor access. This action does not send sharing invitations.');}
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
function previewRun() {
  requireAdmin_();const config=settings_();
  const plan=planRun_(rows_('Run Rules',['ShowID','StartDate','EndDate','Weekdays','Curtain','DurationMin','CallOffsetMin','EventType','ExcludeDates','PublicNote']),rows_('Performances',PC_PERFORMANCE_HEADERS_),config.TimeZone,new Date().toISOString());
  const shows=keyed_(rows_('Shows',['ShowID','Title','Venue','Published']),'ShowID','Shows');plan.proposed.forEach(p=>check_(shows[p.ShowID],'Unknown show: '+p.ShowID));
  check_(plan.proposed.length<=1500,'Generate at most 1,500 performances per operation.');
  if(!plan.proposed.length){SpreadsheetApp.getUi().alert('No new performances. Existing dates are never overwritten.');return;}
  const key=Utilities.getUuid(),cache=CacheService.getUserCache(),chunks={};
  for(let i=0;i<plan.proposed.length;i+=10)chunks['plan:'+key+':'+(i/10)]=JSON.stringify(plan.proposed.slice(i,i+10));
  cache.putAll(chunks,600);cache.put('plan:'+key,String(Math.ceil(plan.proposed.length/10)),600);
  const t=HtmlService.createTemplateFromFile('RunPreview');t.payload=JSON.stringify({key,rows:plan.proposed,skipped:plan.skipped.length}).replace(/</g,'\\u003c');
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(850).setHeight(580),'Preview new performances');
}
function commitRun(key) {
  requireAdmin_();return locked_(()=>{
    const cache=CacheService.getUserCache(),count=Number(cache.get('plan:'+str_(key)));check_(count>0&&count<=150,'Preview expired. Generate a new preview.');
    const keys=Array.from({length:count},(_,i)=>'plan:'+key+':'+i),parts=cache.getAll(keys);let proposed=[];
    keys.forEach(k=>{check_(parts[k],'Preview expired. Generate a new preview.');proposed=proposed.concat(JSON.parse(parts[k]));});
    const current=rows_('Performances',PC_PERFORMANCE_HEADERS_);
    const ids=new Set(current.map(p=>p.PerformanceID)),slots=new Set(current.map(p=>p.ShowID+'|'+p.Date+'|'+p.Curtain));
    const fresh=proposed.filter(p=>!ids.has(p.PerformanceID)&&!slots.has(p.ShowID+'|'+p.Date+'|'+p.Curtain));
    const sh=book_().getSheetByName('Performances');if(fresh.length){const first=sh.getLastRow()+1;if(first+fresh.length>sh.getMaxRows())sh.insertRowsAfter(sh.getMaxRows(),first+fresh.length-sh.getMaxRows());sh.getRange(first,1,fresh.length,12).setValues(fresh.map(p=>PC_PERFORMANCE_HEADERS_.map(h=>p[h])));}
    syncChairs_();cache.removeAll(keys.concat(['plan:'+key]));
    audit_('Performances','bulk','','',fresh.length+' performances generated');return {created:fresh.length};
  });
}
function editorModel_() {
  const config=settings_(),chairs=chairConfig_(),assignments={};chairs.forEach(c=>assignments[c.TabName]=objects_(raw_(c.TabName),PC_ASSIGNMENT_HEADERS_));
  return {shows:rows_('Shows',['ShowID','Title','Venue','Published']),players:rows_('Players',['PlayerID','DisplayName']),chairs,performances:rows_('Performances',PC_PERFORMANCE_HEADERS_),assignments,zone:config.TimeZone};
}
function validateSchedule() {
  requireAdmin_();const model=editorModel_();
  // Validate unpublished shows as well as published shows without publishing them.
  const copy=JSON.parse(JSON.stringify(model));copy.shows.forEach(s=>s.Published=true);const events=publicEvents_(copy);
  model.performances.forEach(p=>{performanceTimes_(p,model.zone);model.chairs.filter(c=>c.ShowID===p.ShowID&&requiresStaffing_(p)).forEach(c=>check_((model.assignments[c.TabName]||[]).some(a=>a.PerformanceID===p.PerformanceID),'Missing chair row: '+c.Label+' / '+p.PerformanceID));});
  const conflicts=[];for(let i=0;i<events.length;i++)for(let j=i+1;j<events.length;j++){
    const a=events[i],b=events[j];if(!a.allDay&&!b.allDay&&a.finish&&b.finish&&a.playerId&&a.playerId===b.playerId&&a.status!=='Cancelled'&&b.status!=='Cancelled'&&a.start<b.finish&&b.start<a.finish)conflicts.push(a.player+' overlaps: '+a.date+' '+a.chair+' / '+b.chair);
  }
  setSetting_('LastSuccessfulCheck',new Date().toISOString());
  SpreadsheetApp.getUi().alert('Validated '+model.performances.length+' performances and '+events.length+' calendar rows.\nAll-day, time-TBD and unknown-finish entries are not checked for time overlaps.\nCoverage needed: '+events.filter(e=>e.status!=='Cancelled'&&e.needsCover).length+'; outside substitutes needed: '+events.filter(e=>e.status!=='Cancelled'&&e.coverage==='Outside substitute needed').length+'.\n'+(conflicts.length?'Potential double bookings:\n'+unique_(conflicts).slice(0,30).join('\n'):'No overlaps found among assignments with complete timed ranges.'));
}
function calendarEdit(e) {
  if(!e||!e.range)return;
  locked_(()=>{
    const sh=e.range.getSheet(),name=sh.getName(),first=Math.max(2,e.range.getRow()),last=e.range.getLastRow();
    if(last<2||name==='Change Log')return;
    const chairs=rows_('Chairs',['ShowID','ChairID','Label','Instrumentation','TabName']);
    if(chairs.some(c=>c.TabName===name)){
      stampRows_(sh,first,last-first+1,8,9);
      // Clearing a player means an open seat. Filling an open seat defaults to confirmed.
      for(let row=first;row<=last;row++){
        const v=sh.getRange(row,5,1,6).getValues()[0],unavailable=list_(v[5]);
        if(!v[0])sh.getRange(row,6).setValue('Open');
        else if(unavailable.includes(v[0]))sh.getRange(row,6).setValue('Needs sub');
        else if(v[1]==='Open'||!v[1]||(e.range.getColumn()===5&&e.range.getNumColumns()===1&&v[1]==='Needs sub'))sh.getRange(row,6).setValue('Confirmed');
      }
      refreshChairCoverage_(chairs.find(c=>c.TabName===name),sh);
    }else if(name==='Performances'){
      for(let row=first;row<=last;row++){
        const v=sh.getRange(row,1,1,12).getValues()[0];if(!v[1])continue;
        if(!v[0])sh.getRange(row,1).setValue('p-'+Utilities.getUuid());
      }
      stampRows_(sh,first,last-first+1,11,12);
    }
    if(name==='Chairs'||name==='Players')refreshChairEditors_(chairConfig_());
    if(name==='Chairs'||name==='Players')chairs.forEach(c=>{const target=book_().getSheetByName(c.TabName);if(target&&target.getLastColumn()>=11)refreshChairCoverage_(c,target);});
    let actor='Unavailable';try{actor=e.user?e.user.getEmail()||actor:actor;}catch(ignore){}
    audit_(name,e.range.getA1Notation(),e.oldValue||'',e.value===undefined?'Multiple cells changed':e.value,'Native Sheets edit',actor);
  });
}
function createBackup() {
  requireAdmin_();const copy=book_().copy(book_().getName()+' - backup '+new Date().toISOString().slice(0,10));
  audit_('Workbook','backup','','',copy.getUrl());SpreadsheetApp.getUi().alert('Backup created in your Drive:\n'+copy.getUrl());
}

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

function enableEventFields(){requireAdmin_();locked_(()=>{ensurePerformanceFields_();audit_('Performances','M:P','','','Enabled optional all-day / event fields');});SpreadsheetApp.getUi().alert('All-day / event fields are ready in Performances M:P. Existing dates, assignments and access were preserved.');}
