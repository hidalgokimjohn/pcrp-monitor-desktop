const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
function context(){
 const c={console,TextDecoder,TextEncoder,Blob,Response,Date,DataView,Uint8Array,ArrayBuffer,setTimeout,clearTimeout,
  document:{addEventListener(){}},navigator:{},STATE:{computed:false,stage:1,page:'profile'},S:{overview:null},LOADED:{},IMPORT_ERRORS:[],
  preferences:{},prefs:()=>c.preferences,savePrefs:p=>{c.preferences=p;},today:()=> '2026-11-05',
  isMunicipalUser:()=>c.preferences.role==='pea_mdm',homeKey:()=>c.preferences.homeKey||'',homeLabel:()=>c.preferences.homeKey||'Region',
  $:()=>null,toast(){},go:p=>{c.STATE.page=p;},renderStatus(){},loadReferenceTables(){},setTabsEnabled(){},renderImport(){},updateTabBadges(){},
  n:v=>v==null?'—':String(v),normSearch:v=>String(v||'').trim().toLowerCase(),BUILT_IN:{monitorVersion:'test'},PEOPLE:null};
 c.pctText=v=>v==null?'—':(Math.round(v*1000)/10).toFixed(1)+'%';
 c.activityProgressSum=items=>items.reduce((t,x)=>{['expected','encoded','complete','movsReady','movBacklog'].forEach(k=>t[k]+=x[k]||0);return t;},{expected:0,encoded:0,complete:0,movsReady:0,movBacklog:0});
 c.window=c;vm.createContext(c);
 ['vendor/monitor/Code.js','vendor/monitor/Store.js','vendor/monitor/WebApp.js','src/runtime.js','src/activity-tracker.js','src/mov-core.js','src/people.js','src/verify.js','src/mov-ui.js','src/municipality-profile.js','src/kpis.js'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c,{filename:f}));
 vm.runInContext(fs.readFileSync(path.join(ROOT,'vendor/monitor/JS_Health.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
 c.baselineMunis=()=>c.profileIndex().base.muniList.map(m=>({province:m.province,municipality:m.municipality}));
 c.TABS.Baseline={headers:['Province','Municipality','Barangay','Monitored','Stage 2 Prioritized'],rows:[['Province A','Town','Village A','Yes','Yes'],['Province B','Town','Village B','Yes','Yes']]};
 c.TABS.Activities={headers:['Seq','Code','KCIS Name','Label','Level','Households','Field conduct','Stage','Prioritized'],rows:c.DEFAULT_ACTIVITIES.map(a=>[a.seq,a.code,a.name,a.label,a.level,a.households?'Yes':'No',a.field,a.stage,a.prioOnly?'Yes':'No'])};
 return c;
}
function tracker(c,changes={}){const v={Region:'Region',Province:'Province A','City / Municipality':'Town',Barangay:'Village A',Modality:'PCRP','CRIP/MC09 Activity':'1st BA','Activity Title':'Assembly','Actual Start':'2026-10-01','Actual End':'2026-10-02','Participants - Male':3,'Participants - Female':7,'Participants - Unspecified':0,'Participants - Total':10,...changes};return Array.from(c.ACTIVITY_TRACKER_HEADERS,h=>v[h]??'');}
function load(c,rows=[tracker(c)]){c.TABS.Raw_Activity_Tracker={headers:Array.from(c.ACTIVITY_TRACKER_HEADERS),rows};c.LOADED.activityTracker={};c.computeAll('2026-11-05');c.STATE.computed=true;c.S.overview=c.apiOverview('');}
function metric(data,id){return data.groups.flatMap(g=>g.cards).find(c=>c.id===id);}
function households(c, province='Province A', listed=100, present=80, code='1st BA') {
 return tracker(c,{Province:province,Barangay:province==='Province A'?'Village A':'Village B','CRIP/MC09 Activity':code,
  'BA Participation - Total HH in Barangay':listed,'BA Participation - Total HH Represented':present});
}
test('KPI groups and exports retain only SM7 indicators, with manual references',()=>{
 const c=context();load(c,[households(c),households(c,'Province B',200,100)]);
 const d=c.kpiCollect('',1);
 assert.deepEqual(Array.from(d.groups,g=>g.id),['households','mrest']);
 assert.deepEqual(Array.from(d.groups.flatMap(g=>g.cards),m=>m.id),['quorum-BA1','mrestInstitutionalized']);
 assert.equal(metric(d,'quorum-BA1').value,'60.0%');
 for(const section of ['households','mrest']) {
  const rows=c.kpiExportRows(d,section);assert.equal(rows.length,2);
  assert.equal(rows[0][6],'Manual reference');assert.match(rows[1][6],/SM7/);
  assert.doesNotMatch(JSON.stringify(rows),/Composite readiness|MOV backlog|Rows matching|Encoded activities/);
 }
});
test('municipal scope is enforced in calculations and CSV exports',()=>{
 const c=context();load(c,[households(c),households(c,'Province B',200,100)]);
 c.preferences={role:'pea_mdm',homeKey:'Province A|Town'};c.KPI_UI.scope='m:Province B|Town';
 assert.equal(c.kpiScope(),'m:Province A|Town');
 const d=c.kpiCollect('m:Province B|Town',1);assert.equal(d.models.length,1);
 assert.equal(metric(d,'quorum-BA1').value,'80.0%');
 assert.ok(c.kpiExportRows(d,'households').slice(1).every(r=>r[0]==='m:Province A|Town'));
});
test('stage-specific household rates keep separate denominators and preserve profile navigation',()=>{
 const c=context();load(c,[households(c,'Province A',100,80,'2nd BA'),households(c,'Province A',200,100,'3rd BA')]);
 c.PROFILE_STATE.stage=1;const d=c.kpiCollect('m:Province A|Town',2);
 assert.equal(metric(d,'quorum-BA2').value,'80.0%');assert.equal(metric(d,'quorum-BA3').value,'50.0%');
 assert.equal(metric(d,'quorum-BA1'),undefined);assert.equal(c.PROFILE_STATE.stage,1);
});
test('missing imports and partial denominators stay unassessed; reported zero remains zero',()=>{
 const c=context();assert.equal(metric(c.kpiCollect('',1),'quorum-BA1').value,null);
 load(c,[households(c,'Province A',100,0)]);
 assert.equal(metric(c.kpiCollect('m:Province A|Town',1),'quorum-BA1').value,'0.0%');
 const partial=metric(c.kpiCollect('',1),'quorum-BA1');assert.equal(partial.value,null);assert.match(partial.detail,/1\/2 barangays reporting/);
 load(c,[]);assert.equal(metric(c.kpiCollect('',1),'quorum-BA1').value,null);
});
test('committee rosters and EO verification do not establish MResT institutionalization',()=>{
 const c=context();load(c);c.LOADED.volunteers={};
 c.profileKpis=()=>{throw Error('Must not substitute committee composition for LDC membership');};
 const card=metric(c.kpiCollect('',1),'mrestInstitutionalized');
 assert.equal(card.value,null);assert.match(card.detail,/regular Local Development Council members/);
 assert.equal(c.kpiExportRows(c.kpiCollect('',2),'mrest')[1][1],'All stages');
});
test('old saved sections migrate and removed operational sections have no KPI shortcut',()=>{
 const c=context();c.preferences.kpiDashboard={section:'quality',scope:'p:Province A',stage:2,form:'att'};
 c.kpiRestore();assert.equal(c.KPI_UI.section,'households');assert.equal(c.KPI_UI.stage,2);
 for(const section of ['movs','verification','quality','volunteers','brest','cspmc']) assert.equal(c.kpiPageLink(section,''),'');
 c.openKpiPage('mrest','Province A|Town');assert.equal(c.KPI_UI.section,'mrest');assert.equal(c.STATE.page,'kpis');
 c.openKpiPage('activities');assert.equal(c.KPI_UI.section,'households');
});
test('KPI rendering exposes only retained tabs and manual-backed cards',()=>{
 const c=context();load(c,[households(c)]);const body={innerHTML:''};c.$=id=>id==='kpi-body'?body:null;c.refreshIcons=()=>{};c.esc=v=>String(v??'');c.attr=c.esc;
 c.KPI_UI.scope='m:Province A|Town';c.renderKpis();
 assert.match(body.innerHTML,/80.0%/);assert.match(body.innerHTML,/Indicator Documentation/);
 assert.doesNotMatch(body.innerHTML,/data-v="(?:quality|verification|movs|volunteers)"|Composite readiness/);
 c.KPI_UI.section='mrest';c.renderKpis();assert.match(body.innerHTML,/Not assessed/);assert.match(body.innerHTML,/Local Development Council/);
});
