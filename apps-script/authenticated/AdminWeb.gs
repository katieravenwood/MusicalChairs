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
