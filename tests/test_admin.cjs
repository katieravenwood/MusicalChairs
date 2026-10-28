const fs=require('fs'),vm=require('vm'),assert=require('assert');const c=vm.createContext({Date,JSON,Intl,Set});for(const p of ['apps-script/Core.gs','apps-script/authenticated/Editor.gs','apps-script/authenticated/AdminWeb.gs'])vm.runInContext(fs.readFileSync(p,'utf8'),c);let n=0;function test(s,f){f();n++;console.log('PASS '+s)}
const d={Players:[{_row:2,PlayerID:'AlexSmith',DisplayName:'Alex',GoogleEmail:'alex@example.com'}],Shows:[{ShowID:'demo',Title:'Demo'}],Chairs:[],Performances:[],assignments:{},zone:'America/New_York'},r={ShowID:'demo',ChairID:'keys',Label:'Keys',TabName:'Demo Keys',EligiblePlayerIDs:'AlexSmith',RegularPlayerIDs:''};
test('non-admin cannot read administration',()=>{c.editorContext_=()=>({isAdmin:false});assert.throws(()=>c.getAdminState(),/Administrators only/)});
test('player ID immutable',()=>assert.throws(()=>c.adminValidate_('Players',{PlayerID:'Other',DisplayName:'Other'},d.Players[0],d),/cannot be renamed/));
test('duplicate account rejected',()=>assert.throws(()=>c.adminValidate_('Players',{PlayerID:'Other',DisplayName:'Other',GoogleEmail:'alex@example.com'},null,d)));
test('unknown eligibility rejected',()=>assert.throws(()=>c.adminValidate_('Chairs',{...r,EligiblePlayerIDs:'Unknown'},null,d),/Unknown eligible/));
test('regular players must be eligible',()=>assert.throws(()=>c.adminValidate_('Chairs',{...r,RegularPlayerIDs:'Unknown'},null,d),/also be eligible/));
for(const a of [{PlayerID:'AlexSmith'},{UnavailablePlayerIDs:'AlexSmith'}])test('referenced player cannot lose eligibility',()=>assert.throws(()=>c.adminValidate_('Chairs',{...r,EligiblePlayerIDs:''},r,{...d,assignments:{'Demo Keys':[a]}}),/still has assignments/));
test('chair storage identity immutable',()=>assert.throws(()=>c.adminValidate_('Chairs',{...r,TabName:'Other'},r,d),/cannot be changed/));
test('reserved tabs rejected',()=>assert.throws(()=>c.adminValidate_('Chairs',{...r,TabName:'Players'},null,d),/Reserved/));
test('new chair has no default player',()=>assert(!Object.hasOwn(c.adminValidate_('Chairs',{...r},null,d),'DefaultPlayerID')));
test('duplicate show time rejected',()=>{const p={PerformanceID:'p2',ShowID:'demo',Date:'2026-11-06',Curtain:'19:30',Call:'19:00',EndDate:'2026-11-06',End:'22:00',Status:'Scheduled'};assert.throws(()=>c.adminValidate_('Performances',p,null,{...d,Performances:[{...p,PerformanceID:'p1'}]}),/already occupies/)});
test('stale record rejected before write',()=>{c.editorContext_=()=>({isAdmin:true});c.editorLock_=f=>f();c.book_=()=>({getSheetByName:()=>({})});c.raw_=()=>[['PlayerID','DisplayName','GoogleEmail']];c.rows_=()=>d.Players;c.adminToken_=()=> 'fresh';assert.throws(()=>c.saveAdminRecord({table:'Players',row:2,token:'stale'}),/record changed/)});
test('arbitrary table cannot be written',()=>assert.throws(()=>c.saveAdminRecord({table:'Access'}),/Unknown table/));console.log(n+' administration checks passed');

test('checkbox boolean stays native',()=>assert.equal(c.editorCell_(true).userEnteredValue.boolValue,true));
