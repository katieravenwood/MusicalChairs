const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({Date,Intl,Set,Map,JSON,Number,String,Array,Math,Error});
vm.runInContext(fs.readFileSync('apps-script/Core.gs','utf8'),ctx);
const base={PerformanceID:'p-note',ShowID:'demo',Date:'2026-11-07',EndDate:'2026-11-09',Call:'',Curtain:'',End:'',Status:'Scheduled',EventType:'Note',AllDay:true,TimeTBD:false,StaffingRequired:false,EventTitle:'Press night note'};
const times=ctx.performanceTimes_(base,'America/New_York');assert.equal(times.start,'2026-11-07');assert.equal(times.end,'2026-11-10');
assert.throws(()=>ctx.performanceTimes_({...base,Call:'12:00'},'America/New_York'),/leave Call/);
assert.throws(()=>ctx.performanceTimes_({...base,EndDate:'2026-11-06'},'America/New_York'),/precedes/);
assert.equal(ctx.performanceTimes_({...base,AllDay:false,TimeTBD:true},'America/New_York').allDay,true);
const model={shows:[{ShowID:'demo',Title:'Training Show',Venue:'[Theatre Name]',Published:true}],players:[],chairs:[],performances:[base],assignments:{},zone:'America/New_York',revision:1};
const events=ctx.publicEvents_(model);assert.equal(events.length,1);assert.equal(events[0].eventOnly,true);assert.equal(events[0].needsCover,false);
assert(!ctx.makeIcs_(events,'alex',{title:'[Theatre Name]',playerName:'Alex'}).includes('BEGIN:VEVENT'));
const staffed={...events[0],eventOnly:false,playerId:'alex',player:'Alex',chair:'Keys',assignmentStatus:'Confirmed',instrumentation:'Piano'};
const ics=ctx.makeIcs_([staffed],'alex',{title:'[Theatre Name]',playerName:'Alex'});assert(ics.includes('DTSTART;VALUE=DATE:20261107'));assert(ics.includes('DTEND;VALUE=DATE:20261110'));
const timed=ctx.performanceTimes_({...base,AllDay:false,Date:'2026-12-13',EndDate:'2026-12-13',Call:'11:50',Curtain:'12:20',End:''},'America/New_York');assert.equal(timed.end,null);assert.equal(timed.start,'2026-12-13T16:50:00.000Z');
for(const file of ['deployment/Authenticated-Code.gs','deployment/Workbook-Code.gs']){
 const code=fs.readFileSync(file,'utf8');
 for(const col of [4,5])assert(code.includes('IF(VLOOKUP($A${r},Performances!$A$2:$L,'+col+',FALSE)="","",VLOOKUP'));
}
console.log('All-day spans, TBD, bare notes, individual feeds, unknown finish and blank-time Sync checks passed');
