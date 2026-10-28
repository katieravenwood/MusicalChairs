// Offline DOM integration tests; no browser or network access.
const {JSDOM,VirtualConsole}=require('jsdom');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const html=execFileSync('python',['-c','from demo_preview import build_demo; print(build_demo())'],{encoding:'utf8',maxBuffer:2e6});
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
const setup=w=>{w.confirm=()=>true;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};};
const shell=new JSDOM(html,{runScripts:'dangerously',url:'https://demo.invalid',virtualConsole:vc,beforeParse:setup});
const delay=()=>new Promise(r=>setTimeout(r,30));
let child;
async function screen(){if(child)child.window.close();child=new JSDOM(shell.window.document.querySelector('#app').srcdoc,{runScripts:'dangerously',url:'https://demo.invalid',virtualConsole:vc,beforeParse(w){setup(w);Object.defineProperty(w,'parent',{value:shell.window});}});await delay();return child.window.document;}
(async()=>{
 let d=await screen();assert(d.querySelector('.performance'));assert(d.querySelector('.subscription').textContent.includes('snapshot'));assert(!d.querySelector('.subscription').textContent.includes('Subscription URL'));
 shell.window.document.querySelector('#staffing').click();d=await screen();assert(d.querySelector('.calendar-performance'));assert.equal(d.querySelector('#tab-admin').hidden,false);
 assert(d.querySelector('#staffing-grid').textContent.includes('Call Time:'));assert(d.querySelector('#staffing-grid').textContent.includes('Places/Show Start:'));assert(d.querySelector('#staffing-grid').textContent.includes('PM'));
 const note=d.querySelector('.calendar-performance.all-day');assert(note);note.click();assert(d.querySelector('#seats').textContent.includes('no staffing seats'));assert.equal(d.querySelectorAll('#seats button').length,0);d.querySelector('#close-seat').click();
 const buttons=d.querySelectorAll('.calendar-performance:not(.all-day)');buttons[0].click();const firstTitle=d.querySelector('#seat-heading').textContent;assert(d.querySelector('#seat-dialog').open);assert.equal(d.querySelectorAll('#seats .seat').length,3);
 d.querySelector('#close-seat').click();buttons[1].click();assert.notEqual(d.querySelector('#seat-heading').textContent,firstTitle);assert.equal(d.querySelectorAll('#seats .seat').length,3);d.querySelector('#close-seat').click();
 d.querySelector('#tab-admin').click();await delay();assert(d.querySelector('#admin-table').options.length===5);assert(d.querySelector('#admin-form input'));assert.equal(d.querySelector('#admin-panel').hidden,false);
 const role=shell.window.document.querySelector('#identity-demo');role.value='sambrown@example.invalid';role.dispatchEvent(new shell.window.Event('change'));d=await screen();assert(d.querySelector('#tab-admin').hidden);d.querySelector('.calendar-performance:not(.all-day)').click();assert.equal(d.querySelectorAll('#seats .seat').length,1);assert(!d.querySelector('#seats').textContent.includes('AlexSmith'));
 const card=d.querySelector('#seats .seat'),select=card.querySelector('select');select.value='SamBrown';select.dispatchEvent(new child.window.Event('change'));card.querySelector('button').click();await delay();assert(card.textContent.includes('Saved.'));
 d.querySelector('#close-seat').click();d.querySelector('#view-calendar').click();d=await screen();assert(d.querySelector('#calendar'));assert(d.querySelector('#calendar').textContent.includes('Sam'));
 const admin=shell.window.PitDemo.call;
 role.value='admin@example.invalid';role.dispatchEvent(new shell.window.Event('change'));
 const record=admin('getAdminState').tables.Shows.records[0];
 admin('saveAdminRecord',{table:'Shows',row:record.values._row,token:record.token,values:{...record.values,Title:'<script>window.bad=true</script> & Orchestra'}});
 shell.window.document.querySelector('#public').click();d=await screen();assert(d.querySelector('#calendar').textContent.includes('<script>window.bad=true</script> & Orchestra'));assert.equal(child.window.bad,undefined);
 assert.equal(errors.length,0,errors.map(e=>e.message).join('\n'));
 child.window.close();shell.window.close();console.log('Actual HTML DOM integration: public view, isolated popup, admin autoload, role gating, first names, save and return navigation passed.');
})().catch(e=>{console.error(e);if(child)child.window.close();shell.window.close();process.exitCode=1});
