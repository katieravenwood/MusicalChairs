const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({console,Date,Intl,Set,Map,JSON,Number,String,Array,Math,Error});
vm.runInContext(fs.readFileSync(path.join(root,'apps-script/Core.gs'),'utf8'),ctx);
const schema=JSON.parse(fs.readFileSync(path.join(root,'schema.json'),'utf8'));
const rows=name=>ctx.objects_(schema[name],schema[name][0]);
function model(){const chairs=rows('Chairs'),assignments={};chairs.forEach(c=>assignments[c.TabName]=rows(c.TabName));return {shows:rows('Shows').map(s=>({...s,Published:true})),players:rows('Players'),chairs,performances:rows('Performances'),assignments,zone:'America/New_York',revision:7};}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('winter and summer Eastern time convert correctly',()=>{
  assert.equal(ctx.wallToUtc_('2026-01-15','19:00','America/New_York'),'2026-01-16T00:00:00.000Z');
  assert.equal(ctx.wallToUtc_('2026-07-15','19:00','America/New_York'),'2026-07-15T23:00:00.000Z');
});
test('invalid and ambiguous DST wall times are rejected',()=>{
  assert.throws(()=>ctx.wallToUtc_('2026-03-08','02:30','America/New_York'),/does not exist/);
  assert.throws(()=>ctx.wallToUtc_('2026-11-01','01:30','America/New_York'),/Ambiguous/);
});
test('blank rows preserve their real sheet row numbers',()=>{
  const v=ctx.objects_([['ID'],['a'],[''],['b']],['ID']);assert.equal(v[1]._row,4);
});
test('unchecked checkboxes do not create blank show records',()=>{
  const v=ctx.objects_([['ShowID','Title','Published'],['demo','Demo',false],['','',false]],['ShowID','Title','Published']);
  assert.equal(v.length,1);assert.equal(v[0].ShowID,'demo');
});
test('bulk generation skips existing dates and duplicates',()=>{
  const plan=ctx.planRun_(rows('Run Rules'),rows('Performances'),'America/New_York','2026-10-21T12:00:00Z');
  assert.equal(plan.proposed.length,1);assert.equal(plan.proposed[0].Date,'2026-11-08');
  assert.equal(plan.proposed[0].Call,'13:30');assert.equal(plan.skipped.length,3);
});
test('two performances on one date remain separate',()=>{
  const m=model(),events=ctx.publicEvents_(m);assert.equal(events.filter(e=>e.date==='2026-11-07').length,4);
});
test('unpublished shows return no public events',()=>{
  const m=model();m.shows[0].Published=false;assert.equal(ctx.publicEvents_(m).length,0);
});
test('updating one seat preserves every other assignment',()=>{
  const m=model(),before=ctx.publicEvents_(m);m.assignments['DEMO Keys 2'][0].PlayerID='sam';m.revision++;
  const after=ctx.publicEvents_(m);assert.equal(after.filter((e,i)=>JSON.stringify({...e,sequence:0})!==JSON.stringify({...before[i],sequence:0})).length,1);
  const alex=ctx.makeIcs_(after,'alex',{title:'Pit',playerName:'Alex'});assert.equal((alex.match(/BEGIN:VEVENT/g)||[]).length,1);
  const sam=ctx.makeIcs_(after,'sam',{title:'Pit',playerName:'Sam'});assert.equal((sam.match(/BEGIN:VEVENT/g)||[]).length,2);
});
test('feeds use unique IDs rather than display-name matching',()=>{
  const m=model();m.players[0].DisplayName='Sam';const events=ctx.publicEvents_(m);
  const ics=ctx.makeIcs_(events,'alex',{title:'Pit',playerName:'Sam'});assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,2);
});
test('cancelled dates retain event UID and emit CANCELLED',()=>{
  const m=model(),before=ctx.makeIcs_(ctx.publicEvents_(m),'alex',{title:'Pit',playerName:'Alex'});
  m.performances[0].Status='Cancelled';const after=ctx.makeIcs_(ctx.publicEvents_(m),'alex',{title:'Pit',playerName:'Alex'});
  assert.match(after,/STATUS:CANCELLED/);assert.deepEqual(before.match(/^UID:.+$/gm),after.match(/^UID:.+$/gm));
});
test('ICS escapes text and folds multibyte UTF-8 lines',()=>{
  const m=model();m.assignments['DEMO Keys 2'][0].PublicNote='🎵'.repeat(80)+'\nText, semi; slash\\';
  const ics=ctx.makeIcs_(ctx.publicEvents_(m),'alex',{title:'Pit',playerName:'Alex'});
  assert.ok(ics.endsWith('\r\n'));ics.split('\r\n').forEach(l=>assert.ok(Buffer.byteLength(l,'utf8')<=75));
  assert.match(ics.replace(/\r\n /g,''),/\\nText\\, semi\\; slash\\\\/);
});
test('missing references and duplicate assignments fail visibly',()=>{
  const m=model();m.assignments['DEMO Keys 2'][0].PerformanceID='missing';assert.throws(()=>ctx.publicEvents_(m),/missing/);
  const n=model();n.assignments['DEMO Keys 2'].push({...n.assignments['DEMO Keys 2'][0]});assert.throws(()=>ctx.publicEvents_(n),/Duplicate/);
});
test('empty personal feed is valid after the last assignment is removed',()=>{
  const ics=ctx.makeIcs_([],'alex',{title:'Pit',playerName:'Alex'});assert.match(ics,/BEGIN:VCALENDAR/);assert.doesNotMatch(ics,/BEGIN:VEVENT/);
});
test('public project exposes GET only, no mutation methods or write scopes',()=>{
  const src=fs.readFileSync(path.join(root,'apps-script/public/Public.gs'),'utf8');
  const functions=[...src.matchAll(/^function\s+([a-zA-Z0-9_]+)/gm)].map(m=>m[1]);
  assert.deepEqual(functions.filter(f=>!f.endsWith('_')),['doGet']);
  const scopes=JSON.parse(fs.readFileSync(path.join(root,'apps-script/public/appsscript.json'),'utf8')).oauthScopes;
  assert.deepEqual(scopes,['https://www.googleapis.com/auth/spreadsheets.readonly']);
  assert.doesNotMatch(src,/return SpreadsheetApp\./);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'apps-script/public/appsscript.json'),'utf8')).dependencies.enabledAdvancedServices,[{userSymbol:'Sheets',serviceId:'sheets',version:'v4'}]);
  assert.doesNotMatch(src,/\.setValues?\(|\.appendRow\(|\.addEditor\(/);
});
test('public reader uses the read-only API and preserves checkbox and time values',()=>{
  const calls=[];
  ctx.PropertiesService={getScriptProperties:()=>({getProperty:()=> 'configured-book'})};
  ctx.Sheets={Spreadsheets:{Values:{get:(id,range,options)=>{
    calls.push({id,range,options});
    return {values:[['ID','Date','Time','Published','Revision'],['demo','2026-11-06','19:30',false,2],['','','',false]]};
  }}}};
  vm.runInContext(fs.readFileSync(path.join(root,'apps-script/public/Public.gs'),'utf8'),ctx);
  const got=ctx.readTable_(ctx.publicBook_(),"Player's Chair",['ID','Date','Time','Published','Revision']);
  assert.equal(calls[0].id,'configured-book');assert.equal(calls[0].range,"'Player''s Chair'");
  assert.equal(calls[0].options.valueRenderOption,'UNFORMATTED_VALUE');
  assert.equal(calls[0].options.dateTimeRenderOption,'FORMATTED_STRING');
  assert.equal(got.length,1);assert.equal(got[0].Date,'2026-11-06');assert.equal(got[0].Time,'19:30');
  assert.equal(got[0].Published,false);assert.equal(got[0].Revision,2);
});
test('recording a conflict keeps the assigned player but requests cover',()=>{
  const m=model();m.assignments['DEMO Keys 2'][0].UnavailablePlayerIDs='alex';
  const e=ctx.publicEvents_(m).find(e=>e.performanceId==='demo-20261106-1930'&&e.chair==='Keys 2');
  assert.equal(e.playerId,'alex');assert.equal(e.assignedUnavailable,true);assert.equal(e.assignmentStatus,'Needs sub');
  assert.equal(e.coverage,'Regular cover needed');assert.deepEqual(Array.from(e.regularCandidates),['Sam']);
});
test('all regulars unavailable requires an outside substitute',()=>{
  const m=model();m.assignments['DEMO Keys 2'][0].UnavailablePlayerIDs='alex,sam';
  const e=ctx.publicEvents_(m).find(e=>e.performanceId==='demo-20261106-1930'&&e.chair==='Keys 2');
  assert.equal(e.coverage,'Outside substitute needed');assert.equal(e.regularCandidates.length,0);
});
test('a pickup preserves outgoing conflicts and affects only the assigned personal feed',()=>{
  const m=model(),a=m.assignments['DEMO Keys 2'][0];a.UnavailablePlayerIDs='alex';a.PlayerID='sam';a.AssignmentStatus='Confirmed';
  const events=ctx.publicEvents_(m),e=events.find(e=>e.performanceId===a.PerformanceID&&e.chair==='Keys 2');
  assert.equal(e.coverage,'Covered');assert.deepEqual(Array.from(e.unavailablePlayers),['Alex']);
  const alex=ctx.makeIcs_(events,'alex',{title:'Pit',playerName:'Alex'});
  assert.doesNotMatch(alex,new RegExp('UID:'+a.PerformanceID+'--keys2--alex'));
  assert.match(ctx.makeIcs_(events,'sam',{title:'Pit',playerName:'Sam'}),new RegExp('UID:'+a.PerformanceID+'--keys2--sam'));
});
test('an assigned outside substitute resolves the regular-roster warning',()=>{
  const m=model(),c=m.chairs[0],a=m.assignments[c.TabName][0];c.RegularPlayerIDs='alex';a.UnavailablePlayerIDs='alex';a.PlayerID='sam';
  const e=ctx.publicEvents_(m).find(e=>e.performanceId===a.PerformanceID&&e.chair==='Keys 2');assert.equal(e.coverage,'Covered');
});
test('unknown conflict IDs are rejected and legacy blank conflicts remain valid',()=>{
  const m=model();m.assignments['DEMO Keys 2'][0].UnavailablePlayerIDs='unknown';assert.throws(()=>ctx.publicEvents_(m),/unavailable player/);
  const n=model();Object.values(n.assignments).forEach(rows=>rows.forEach(a=>delete a.UnavailablePlayerIDs));assert.equal(ctx.publicEvents_(n)[0].unavailablePlayers.length,0);
});
const permissionPlayers=[{PlayerID:'alex',DisplayName:'Alex',GoogleEmail:'Alex@example.com'},{PlayerID:'sam',DisplayName:'Sam',GoogleEmail:'sam@example.com'},{PlayerID:'jo',DisplayName:'Jo',GoogleEmail:''}];
test('eligible players can edit a chair regardless of the assigned player',()=>{
  for(const assigned of ['alex','sam','jo','']) {
    const c={EligiblePlayerIDs:'alex,sam',PlayerID:assigned};
    assert.equal(ctx.canEditChair_('sam@example.com',c,permissionPlayers,[]),true);
    assert.equal(ctx.canEditChair_('alex@example.com',c,permissionPlayers,[]),true);
  }
});
test('administrators can edit every chair even when not a registered player',()=>{
  for(const c of [{ShowID:'one',EligiblePlayerIDs:'alex'},{ShowID:'two',EligiblePlayerIDs:'jo'},{ShowID:'three',EligiblePlayerIDs:''}])
    assert.equal(ctx.canEditChair_('admin@example.com',c,permissionPlayers,['ADMIN@example.com']),true);
});
test('ineligible, unknown and anonymous accounts are denied; manual chair emails are ignored',()=>{
  const c={EligiblePlayerIDs:'alex',EditorEmails:'sam@example.com'};
  for(const email of ['sam@example.com','unknown@example.com',''])assert.equal(ctx.canEditChair_(email,c,permissionPlayers,[]),false);
  assert.deepEqual(Array.from(ctx.chairEditorEmails_({EligiblePlayerIDs:''},permissionPlayers)),[]);
});
test('one account update affects all eligible chairs and removes the old address',()=>{
  const updated=permissionPlayers.map(p=>p.PlayerID==='sam'?{...p,GoogleEmail:'new@example.com'}:p);
  for(const c of [{EligiblePlayerIDs:'alex,sam'},{EligiblePlayerIDs:'sam,jo'}]) {
    assert.equal(ctx.canEditChair_('new@example.com',c,updated,[]),true);
    assert.equal(ctx.canEditChair_('sam@example.com',c,updated,[]),false);
  }
});
test('missing emails grant no access; malformed, duplicate and unknown identities fail preflight',()=>{
  assert.deepEqual(Array.from(ctx.chairEditorEmails_({EligiblePlayerIDs:'jo'},permissionPlayers)),[]);
  assert.throws(()=>ctx.chairEditorEmails_({EligiblePlayerIDs:'missing'},permissionPlayers),/Unknown eligible/);
  assert.throws(()=>ctx.playerAccounts_([{PlayerID:'a',GoogleEmail:'not-email'}]),/Invalid GoogleEmail/);
  assert.throws(()=>ctx.playerAccounts_([{PlayerID:'a',GoogleEmail:'a@example.com'},{PlayerID:'b',GoogleEmail:'A@example.com'}]),/more than one/);
});
test('public schedule and ICS never expose player account emails',()=>{
  const m=model();m.players.forEach(p=>p.GoogleEmail=p.PlayerID+'@example.com');
  const events=ctx.publicEvents_(m);assert.doesNotMatch(JSON.stringify(events),/@example.com/);
  assert.doesNotMatch(ctx.makeIcs_(events,'alex',{title:'Pit',playerName:'Alex'}),/@example.com/);
});
test('three players named Mike retain separate chair permissions and personal feeds',()=>{
  const m=model();m.players=[{PlayerID:'mike01',DisplayName:'Mike',GoogleEmail:'mike1@example.com'},{PlayerID:'mike02',DisplayName:'Mike',GoogleEmail:'mike2@example.com'},{PlayerID:'mike03',DisplayName:'Mike',GoogleEmail:'mike3@example.com'}];
  m.chairs=m.chairs.map((c,i)=>({...c,DefaultPlayerID:'',EligiblePlayerIDs:'mike0'+(i+1),RegularPlayerIDs:'mike0'+(i+1)}));
  m.chairs.forEach((c,i)=>m.assignments[c.TabName].forEach(a=>{a.PlayerID='mike0'+(i+1);a.UnavailablePlayerIDs='';}));
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)assert.equal(ctx.canEditChair_(m.players[i].GoogleEmail,{EligiblePlayerIDs:m.players[j].PlayerID},m.players,[]),i===j);
  const events=ctx.publicEvents_(m);
  assert.equal(events.filter(e=>e.playerId==='mike01').length,3);
  assert.equal(events.filter(e=>e.playerId==='mike02').length,3);
  assert.equal((ctx.makeIcs_(events,'mike01',{title:'Pit',playerName:'Mike'}).match(/BEGIN:VEVENT/g)||[]).length,3);
  assert.equal((ctx.makeIcs_(events,'mike03',{title:'Pit',playerName:'Mike'}).match(/BEGIN:VEVENT/g)||[]).length,0);
});
test('new seats never inherit a player and immediately need coverage',()=>{
  const m=model(),chair=m.chairs[0],now='2026-10-23T18:00:00Z';chair.DefaultPlayerID='alex';
  const row=ctx.newAssignmentRow_('new-performance',now),a=ctx.objects_([Array.from(vm.runInContext('PC_ASSIGNMENT_EXT_HEADERS_',ctx)),Array.from(row)],Array.from(vm.runInContext('PC_ASSIGNMENT_HEADERS_',ctx)))[0];
  assert.equal(a.PlayerID,'');assert.equal(a.AssignmentStatus,'Open');
  const cover=ctx.chairCoverage_(chair,a,ctx.keyed_(m.players,'PlayerID','Players'));
  assert.equal(cover.needsCover,true);assert.equal(cover.coverage,'Regular cover needed');
  a.UnavailablePlayerIDs=chair.EligiblePlayerIDs;
  assert.equal(ctx.chairCoverage_(chair,a,ctx.keyed_(m.players,'PlayerID','Players')).coverage,'Outside substitute needed');
});
console.log(`${passed} Apps Script core tests passed.`);
