const fs=require('node:fs'),assert=require('node:assert/strict');
for(const [name,files] of Object.entries({
 'Public-Code.gs':['apps-script/Core.gs','apps-script/public/Public.gs'],
 'Authenticated-Code.gs':['apps-script/Core.gs','apps-script/authenticated/Editor.gs','apps-script/authenticated/AdminWeb.gs'],
 'Workbook-Code.gs':['apps-script/Core.gs','apps-script/editor/Admin.gs']
}))assert.equal(fs.readFileSync('deployment/'+name,'utf8'),files.map(f=>fs.readFileSync(f,'utf8').trimEnd()).join('\n\n')+'\n','Regenerate '+name);
console.log('All deployment bundles match canonical sources.');
