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
