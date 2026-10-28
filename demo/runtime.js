/* Demo-only storage and Google service adapter. Never deploy this file to Apps Script. */
const DEMO_ADMIN = 'admin@example.invalid';
let demoIdentity = DEMO_ADMIN;
let demoData;
let demoHistory = [];
const copy = value => JSON.parse(JSON.stringify(value));
function numbered(rows) { return rows.map((r,i)=>({...r,_row:i+2})); }
function seedDemo(day) {
  day = day || new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const players = [['AlexSmith','Alex'],['SamBrown','Sam'],['CaseyGreen','Casey'],['MikeJones','Mike'],['MikeBell','Mike'],['JoLandry','Jo']].map(([PlayerID,DisplayName])=>({PlayerID,DisplayName,GoogleEmail:PlayerID.toLowerCase()+'@example.invalid'}));
  const shows = [{ShowID:'lantern',Title:'The Lantern Room',Venue:'Example Theatre',Published:true},{ShowID:'midnight',Title:'The Midnight Express',Venue:'Example Theatre',Published:true}];
  const chairs=[];
  shows.forEach(s=>[['keys','Keys 2','Piano / synthesizer','AlexSmith,SamBrown,CaseyGreen','AlexSmith,SamBrown'],['drums','Drums','Drum kit','MikeJones,JoLandry','MikeJones,JoLandry'],['bass','Bass','Electric / upright bass','MikeBell,CaseyGreen','MikeBell']].forEach(([ChairID,Label,Instrumentation,EligiblePlayerIDs,RegularPlayerIDs])=>chairs.push({ShowID:s.ShowID,ChairID,Label,Instrumentation,EligiblePlayerIDs,RegularPlayerIDs,TabName:s.ShowID+' '+ChairID})));
  const rules=[{ShowID:'lantern',StartDate:day,EndDate:dayAdd_(day,34),Weekdays:'Wed,Fri,Sat,Sun',Curtain:'19:30',DurationMin:150,CallOffsetMin:30,EventType:'Performance',ExcludeDates:'',PublicNote:''},{ShowID:'lantern',StartDate:day,EndDate:dayAdd_(day,34),Weekdays:'Sat',Curtain:'14:00',DurationMin:150,CallOffsetMin:30,EventType:'Performance',ExcludeDates:'',PublicNote:''},{ShowID:'midnight',StartDate:day,EndDate:dayAdd_(day,13),Weekdays:'Sat',Curtain:'14:00',DurationMin:120,CallOffsetMin:30,EventType:'Performance',ExcludeDates:'',PublicNote:''}];
  demoData={Players:numbered(players),Shows:numbered(shows),Chairs:numbered(chairs),Performances:numbered(planRun_(rules,[],'America/New_York',new Date().toISOString()).proposed),'Run Rules':numbered(rules),assignments:{},zone:'America/New_York',revision:1};
  demoData.Performances.push({PerformanceID:'demo-note',ShowID:'lantern',Date:day,EndDate:dayAdd_(day,2),Call:'',Curtain:'',End:'',Status:'Scheduled',EventType:'Note',AllDay:true,TimeTBD:false,StaffingRequired:false,EventTitle:'Costume fittings — see posted schedule',PublicNote:'Fictional multi-day note. No pit staffing required.',Revision:1,UpdatedAt:new Date().toISOString(),_row:demoData.Performances.length+2});
  demoData.Performances.push({PerformanceID:'demo-tbd',ShowID:'lantern',Date:dayAdd_(day,3),EndDate:dayAdd_(day,3),Call:'',Curtain:'',End:'',Status:'Scheduled',EventType:'Rehearsal',AllDay:false,TimeTBD:true,StaffingRequired:false,EventTitle:'Rehearsal time to be confirmed',PublicNote:'Fictional time-TBD entry.',Revision:1,UpdatedAt:new Date().toISOString(),_row:demoData.Performances.length+2});
  syncDemo();
  // Explicit fictional assignments only. syncDemo always creates empty seats.
  demoData.Chairs.forEach(c=>demoData.assignments[c.TabName].forEach((a,i)=>{
    if(i%4!==0){a.PlayerID=list_(c.EligiblePlayerIDs)[i%2];a.AssignmentStatus='Confirmed';}
    if(c.ChairID==='keys'&&i%5===0){a.PlayerID='AlexSmith';a.AssignmentStatus='Needs sub';a.UnavailablePlayerIDs='AlexSmith,SamBrown';}
  }));
  demoHistory=[];
  return copy(demoData);
}
function syncDemo() {
  demoData.Chairs.forEach(c=>{
    const rows=demoData.assignments[c.TabName] ||= [];
    demoData.Performances.filter(p=>p.ShowID===c.ShowID&&requiresStaffing_(p)).forEach(p=>{
      if(!rows.some(a=>a.PerformanceID===p.PerformanceID))rows.push({PerformanceID:p.PerformanceID,PlayerID:'',AssignmentStatus:'Open',PublicNote:'',UnavailablePlayerIDs:'',Revision:1,UpdatedAt:new Date().toISOString(),_row:rows.length+2});
    });
  });
}
function editorIdentity_(){return demoIdentity;}
function editorRead_(name){
  if(name==='Access')return [{AdminEmail:DEMO_ADMIN}];
  if(name==='Settings')return [{Key:'TimeZone',Value:demoData.zone},{Key:'PublicAppURL',Value:'https://script.google.com/macros/s/DEMO/exec'}];
  return copy(demoData[name]||demoData.assignments[name]||[]);
}
function editorFingerprint_(a){return JSON.stringify(editorInputs_(a));}
function maintenanceReady_(){return true;}
function adminToken_(r){return JSON.stringify(r);}
function adminData(){return {...demoData};}
function requireAdmin(){check_(demoIdentity===DEMO_ADMIN,'Administrators only.');}
function changedDemo(before,label){demoData.revision++;demoHistory.push({before,label,at:new Date().toISOString()});}
function saveEditorAssignment(request){
  const ctx=editorContext_();
  const c=ctx.allowed.find(c=>c.ShowID===request.showId&&c.ChairID===request.chairId);
  check_(c,'You cannot edit this chair.');
  const a=demoData.assignments[c.TabName].find(a=>a.PerformanceID===request.performanceId);
  check_(a,'Assignment missing.');
  check_(request.fingerprint===editorFingerprint_(a),'This seat changed. Reload this seat before saving.');
  const next=normalizeEditorChange_(request,c,ctx.players),before=copy(demoData);
  Object.assign(a,next,{Revision:a.Revision+1,UpdatedAt:new Date().toISOString()});
  changedDemo(before,'Updated '+c.Label+' · '+request.performanceId);
  return {saved:true,fingerprint:editorFingerprint_(a),coverage:chairCoverage_(c,a,keyed_(ctx.players,'PlayerID','Players')).coverage};
}
function getAdminState(){
  requireAdmin();const tables={};
  Object.entries(ADMIN_FIELDS_).forEach(([name,fields])=>tables[name]={fields,records:demoData[name].map(r=>({values:copy(r),token:adminToken_(r)}))});
  return {tables,workbookUrl:'#workbook'};
}
function saveAdminRecord(request){
  requireAdmin();check_(Object.hasOwn(ADMIN_FIELDS_,request.table),'Unknown table.');
  const records=demoData[request.table],old=request.row?records.find(r=>r._row===request.row):null;
  check_(!request.row||old,'Record no longer exists.');
  check_(!old||request.token===adminToken_(old),'This record changed. Refresh administration.');
  const r={};ADMIN_FIELDS_[request.table].forEach(f=>r[f]=str_(Object.hasOwn(request.values,f)?request.values[f]:PC_PERFORMANCE_EXTRA_HEADERS_.includes(f)&&old?old[f]:''));
  adminValidate_(request.table,r,old,adminData());
  const before=copy(demoData);
  if(request.table==='Performances')Object.assign(r,{Revision:(old?.Revision||0)+1,UpdatedAt:new Date().toISOString()});
  if(old)Object.assign(old,r);else records.push({...r,_row:records.length+2});
  syncDemo();changedDemo(before,'Saved '+request.table);
  return {saved:true,message:'Saved in this demo. New seats remain open; existing assignments were preserved.'};
}
function applyEditorChairPermissions(){requireAdmin();return {message:'Demo eligibility checked on every save. No Google sharing or permissions were changed.'};}
function syncEditorChairs(){requireAdmin();const before=copy(demoData);syncDemo();changedDemo(before,'Synchronized missing seats');return {message:'Missing demo seats added with no assigned player.'};}
function installEditorMaintenance(){requireAdmin();return {ready:true,message:'Background maintenance is simulated in this demo.'};}
function previewAdminRun(){
  requireAdmin();const plan=planRun_(demoData['Run Rules'],demoData.Performances,demoData.zone,new Date().toISOString());
  plan.proposed.forEach(p=>check_(demoData.Shows.some(s=>s.ShowID===p.ShowID),'Unknown show.'));
  check_(plan.proposed.length<=1500,'Generate at most 1,500 performances at once.');
  return {rows:plan.proposed,skipped:plan.skipped.length,token:JSON.stringify([demoData['Run Rules'],demoData.Performances])};
}
function commitAdminRun(request){
  const plan=previewAdminRun();check_(request.token===plan.token,'Rules or dates changed. Preview again.');
  const before=copy(demoData);plan.rows.forEach(p=>demoData.Performances.push({...p,_row:demoData.Performances.length+2}));
  syncDemo();changedDemo(before,'Added '+plan.rows.length+' performances');return {message:plan.rows.length+' performances created with open seats.'};
}
function demoPublicData(){
  const model={shows:demoData.Shows,players:demoData.Players,chairs:demoData.Chairs,performances:demoData.Performances,assignments:demoData.assignments,zone:demoData.zone,revision:demoData.revision};
  return {title:'Example Theatre — Pit Calendar',zone:demoData.zone,events:publicEvents_(model),players:demoData.Players.map(p=>({id:p.PlayerID,name:p.DisplayName})),appUrl:'',staffingEditorUrl:'#staffing',instructionsUrl:'#guide',loadedAt:new Date().toISOString()};
}
function demoSnapshot(playerId){const p=demoData.Players.find(p=>p.PlayerID===playerId);check_(p,'Choose a player.');return makeIcs_(demoPublicData().events,playerId,{title:'Fictional pit demo',playerName:p.DisplayName});}
const DEMO_RPC={getEditorState,saveEditorAssignment,getAdminState,saveAdminRecord,applyEditorChairPermissions,syncEditorChairs,installEditorMaintenance,previewAdminRun,commitAdminRun};
function demoCall(name,arg){check_(Object.hasOwn(DEMO_RPC,name),'Unknown operation.');return copy(DEMO_RPC[name](copy(arg===undefined?null:arg)));}
seedDemo();
