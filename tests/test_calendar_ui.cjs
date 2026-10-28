const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('apps-script/authenticated/Editor.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const pub=fs.readFileSync('apps-script/public/Calendar.html','utf8');
new vm.Script(pub.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/<\?[\s\S]*?\?>/g,'{}'));
const ctx=vm.createContext({});
for(const name of ['rowTitle','staffingDayOrder','performanceKey','performanceSeats','monthDates','staffingGroups','playerLabel','clock12','isShowEntry','callAndPlaces','rowTiming','openPerformance'])vm.runInContext(script.split('\n').find(l=>l.startsWith('function '+name+'(')),ctx);
assert.equal(ctx.monthDates('2026-11')[0],'2026-10-26');
assert.equal(ctx.monthDates('2026-11').at(-1),'2026-12-06');
assert.ok(ctx.monthDates('2028-02').includes('2028-02-29'));
assert.equal(ctx.monthDates('2027-02').length,28);
const rows=[{showId:'a',chairId:'drums',performanceId:'p1',date:'2026-11-07',curtain:'14:00',coverage:'Covered'}, {showId:'a',chairId:'bass',performanceId:'p1',date:'2026-11-07',curtain:'14:00',coverage:'Open'}, {showId:'a',chairId:'drums',performanceId:'p2',date:'2026-11-07',curtain:'19:30',coverage:'Open',cancelled:true}];
assert.equal(ctx.staffingGroups(rows,'','',false).length,2);
assert.equal(ctx.staffingGroups(rows,'','',false)[0].length,2);
assert.equal(ctx.staffingGroups(rows,'','a|bass',false)[0].length,1);
assert.equal(ctx.staffingGroups(rows,'','',true).length,1);
vm.runInContext("var state={players:[{id:'MikeSmith',name:'Mike'},{id:'MikeJones',name:'Mike'}]}",ctx);
assert.equal(ctx.playerLabel('MikeSmith'),'Mike');assert.equal(ctx.playerLabel('MikeJones'),'Mike');
assert.equal(ctx.playerLabel('missing'),'Unknown player');
console.log('Calendar layout, grouping, first-name labels and HTML scripts passed');

// A popup includes every authorized chair of the selected performance only.
const mixed=[...rows,{...rows[0],showId:'b'}, {...rows[0],date:'2026-11-08'}, {...rows[0],curtain:'19:30'}];
assert.equal(ctx.staffingGroups(mixed,'','',false).length,5);
assert.equal(ctx.performanceSeats(mixed,rows[0]).length,2);
const rendered=[];let clears=0,opens=0;
ctx.$=id=>id==='seats'?{replaceChildren(){rendered.length=0;clears++}}:id==='seat-dialog'?{showModal(){opens++}}:{};
ctx.renderSeat=row=>rendered.push(row);ctx.confirmDiscard=()=>true;
ctx.state.rows=mixed;ctx.pendingSaves=0;ctx.dirtySeats=new Set();
ctx.openPerformance(rows[0]);assert.equal(rendered.length,2);
ctx.openPerformance(rows[2]);assert.equal(rendered.length,1);assert.equal(rendered[0].performanceId,'p2');
assert.equal(clears,2);assert.equal(opens,2);
console.log('Popup isolates show/date/time and clears the preceding performance');

for(let minute=0;minute<1440;minute++){const h=Math.floor(minute/60),m=String(minute%60).padStart(2,'0');assert.equal(ctx.clock12(String(h).padStart(2,'0')+':'+m),(h%12||12)+':'+m+' '+(h<12?'AM':'PM'));}
assert.equal(ctx.callAndPlaces({allDay:true,timeTBD:true}),'Time TBD');
assert(!ctx.callAndPlaces({type:'Rehearsal',call:'19:00',curtain:'19:30'}).includes('Places'));
assert(ctx.callAndPlaces({type:'Performance',call:'19:00',curtain:'19:30'}).includes('Places/Show Start: 7:30 PM'));
