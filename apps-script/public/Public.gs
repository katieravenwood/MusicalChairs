/** Standalone public project. Read-only scope; never add editing functions here. */
function publicBook_() {
  const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  check_(id && /^[a-zA-Z0-9_-]+$/.test(id),'Set the SPREADSHEET_ID script property before deploying.');
  return id;
}
function readTable_(book,name,headers) {
  // SpreadsheetApp.openById requires a write-capable scope even for reads.
  // The advanced Sheets API supports the project's spreadsheets.readonly scope.
  // Preserve booleans/numbers, but render dates and times using the template's
  // yyyy-mm-dd / hh:mm formats instead of receiving spreadsheet serial numbers.
  const range="'"+name.replace(/'/g,"''")+"'";
  const response=Sheets.Spreadsheets.Values.get(book,range,{
    valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'FORMATTED_STRING'
  });
  const values=(response.values||[]).map(row=>row.map(v=>typeof v==='string'?v.trim():v));
  return objects_(values,headers);
}
function loadPublic_() {
  const book=publicBook_(),config={};readTable_(book,'Settings',['Key','Value']).forEach(r=>config[r.Key]=r.Value);
  const chairs=readTable_(book,'Chairs',['ShowID','ChairID','Label','Instrumentation','TabName']);
  const assignments={};chairs.forEach(c=>assignments[c.TabName]=readTable_(book,c.TabName,PC_ASSIGNMENT_HEADERS_));
  const model={shows:readTable_(book,'Shows',['ShowID','Title','Venue','Published']),players:readTable_(book,'Players',['PlayerID','DisplayName']),performances:readTable_(book,'Performances',PC_PERFORMANCE_HEADERS_),chairs,assignments,zone:config.TimeZone,revision:config.ScheduleRevision,changedAt:config.LastEditAt};
  // No configuration rows, editor addresses or source workbook identifiers leave this boundary.
  const events=publicEvents_(model);
  // Keep registered players even when their last assignment is removed, so their feed becomes empty normally.
  const players=model.players.map(p=>({id:p.PlayerID,name:p.DisplayName}));
  let appUrl=str_(config.PublicAppURL);
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(appUrl))appUrl='';
  let instructionsUrl=str_(config.InstructionsURL);
  if(!/^https:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]+\/(?:edit|view)(?:[?#].*)?$/.test(instructionsUrl))instructionsUrl='';
  let staffingEditorUrl=str_(config.StaffingEditorURL);
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(staffingEditorUrl))staffingEditorUrl='';
  return {staffingEditorUrl,title:config.CalendarTitle||'[Theatre Name] — Pit Calendar',zone:config.TimeZone||'America/New_York',appUrl,instructionsUrl,players,events,loadedAt:new Date().toISOString(),version:PC_VERSION_};
}
function doGet(e) {
  const p=(e&&e.parameter)||{};
  const data=loadPublic_();
  if(p.mode==='ics') {
    const player=data.players.find(x=>x.id===p.player);
    check_(player,'Unknown player or no published assignments.');
    return ContentService.createTextOutput(makeIcs_(data.events,player.id,{title:data.title,playerName:player.name})).setMimeType(ContentService.MimeType.ICAL);
  }
  if(p.mode==='json')return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  const template=HtmlService.createTemplateFromFile('Calendar');
  template.payload=JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return template.evaluate().setTitle(data.title).addMetaTag('viewport','width=device-width, initial-scale=1');
}
// Deliberately no doPost or public google.script.run write methods.
