const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname,'..');
function context() {
  const c = {console, TextDecoder, TextEncoder, Blob, Response, Date, DataView, Uint8Array, ArrayBuffer, setTimeout, clearTimeout,
    document:{addEventListener(){}}, navigator:{}, STATE:{computed:false, stage:1, page:'profile'}, S:{overview:null}, LOADED:{}, IMPORT_ERRORS:[],
    preferences:{}, prefs:()=>c.preferences, savePrefs:p=>{c.preferences=p;}, today:()=> '2026-11-05',
    isMunicipalUser:()=>c.preferences.role==='pea_mdm', homeKey:()=>c.preferences.homeKey||'',
    $:()=>null, toast(){}, go(){}, renderStatus(){}, loadReferenceTables(){},setTabsEnabled(){},renderImport(){},updateTabBadges(){},
    n:v=>v==null?'—':String(v),normSearch:v=>String(v||'').trim().toLowerCase(), BUILT_IN:{monitorVersion:'test'}, PEOPLE:null};
  // Same as app.js, which this context does not load.
  c.pctText=v=>v===null||v===undefined?'—':(Math.round(v*1000)/10).toFixed(1)+'%';
  c.activityProgressSum=items=>items.reduce((t,x)=>{['expected','encoded','complete','movsReady','movBacklog'].forEach(k=>{t[k]+=x[k]||0;});return t;},{expected:0,encoded:0,complete:0,movsReady:0,movBacklog:0});
  c.window=c;vm.createContext(c);
  ['vendor/monitor/Code.js','vendor/monitor/Store.js','vendor/monitor/WebApp.js','src/runtime.js','src/activity-tracker.js','src/mov-core.js','src/people.js','src/mov-ui.js','src/municipality-profile.js'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c,{filename:f}));
  c.TABS.Baseline={headers:['Province','Municipality','Barangay','Monitored','Stage 2 Prioritized','lib_city.code_correspondence','lib_brgy.code_correspondence'],rows:[
    ['Province A','Town','Village A','Yes','Yes','1000','1001'],['Province A','Town','Village B','Yes','No','1000','1002'],['Province B','Town','Other village','Yes','Yes','2000','2001']]};
  c.TABS.Activities={headers:['Seq','Code','KCIS Name','Label','Level','Households','Field conduct','Stage','Prioritized'],rows:c.DEFAULT_ACTIVITIES.map(a=>[a.seq,a.code,a.name,a.label,a.level,a.households?'Yes':'No',a.field,a.stage,a.prioOnly?'Yes':'No'])};
  return c;
}
function tracker(c, changes={}) {
  const values={Region:'Region',Province:'Province A','City / Municipality':'Town',Barangay:'Village A',Modality:'PCRP','CRIP/MC09 Activity':'1st BA','Activity Title':'Assembly',
    'Actual Start':'2026-10-01','Actual End':'2026-10-02','Participants - Male':3,'Participants - Female':7,'Participants - Unspecified':0,'Participants - Total':10,...changes};
  return Array.from(c.ACTIVITY_TRACKER_HEADERS,h=>values[h]??'');
}
function attachment(c,type='29',changes={}) {
  const values={'Province Name':'Province A','City Name':'Town','Barangay Name':'Village A',Activity_ID:2,Activity_Category:'1st BA','Date Start':'2026-10-01','Date End':'2026-10-02',Attachment_Type_ID:type,'File Name':c.MOV_TYPES[type]||'Uncertain document','File Path':'attachments/'+type+'.pdf','lib_city.code_correspondence':'1000','lib_brgy.code_correspondence':'1001',...changes};
  return Array.from(c.MOV_HEADERS,h=>values[h]??'');
}
function load(c, trs=[tracker(c)], movs) {
  c.TABS.Raw_Activity_Tracker={headers:Array.from(c.ACTIVITY_TRACKER_HEADERS),rows:trs};c.LOADED.activityTracker={};
  if(movs!==undefined){c.TABS.Raw_MOVs={headers:Array.from(c.MOV_HEADERS),rows:movs};c.LOADED.movs={};}
  c.computeAll('2026-11-05');c.STATE.computed=true;c.S.overview=c.apiOverview('');return c.profileModel('Province A|Town');
}
const plain=v=>JSON.parse(JSON.stringify(v));

test('profile activities are in numeric sequence and keep municipal and appraisal levels distinct',()=>{
 const c=context(),m=load(c);
 const seq=m.activities.filter(a=>!a.appraisal&&a.stage===1).map(a=>Number(a.seq));
 assert.deepEqual(plain(seq),[1,2,3.1,3.2,3.3,3.4,3.5,4,5]);
 assert.equal(m.byCode.MREST.rows.length,1);assert.equal(m.byCode.MREST.level,'Municipal');
 assert.equal(m.byCode.BA1.rows.length,2);assert.equal(m.byCode.APPRAISAL.tally.expected,0);
});
test('every profile activity tally reconciles with the canonical scoped pipeline',()=>{
 const c=context(),m=load(c,[tracker(c),tracker(c),tracker(c,{Barangay:'Village B','Participants - Total':0})],['29','30','31','37'].map(t=>attachment(c,t)));
 const matrix=c.apiMatrix().rows.find(r=>r.province==='Province A');
 m.activities.filter(a=>!a.appraisal).forEach(a=>{const t=matrix.cells[a.code];for(const k of ['expected','encoded','complete','movsReady','movBacklog'])assert.equal(a.tally[k],t[k],a.code+' '+k);assert.equal(a.tally.backlog,t.backlog,a.code+' backlog');});
 assert.equal(m.byCode.BA1.rows[0].attendance.participants.total,20);assert.equal(m.byCode.BA1.tally.complete,1);
});
test('all barangays remain visible for priority-only activities with additional BDC obligations',()=>{
 const c=context(),m=load(c,[],[]),a=m.byCode.BDC;
 assert.equal(a.rows.length,2);assert.equal(a.tally.expected,1);
 const other=a.rows.find(r=>r.name==='Village B');assert.equal(other.expected,false);assert.ok(other.group.requirements.some(r=>r.id==='action_plan'));
 assert.equal(c.profileFilterRows(m,a,{scope:'additional'}).length,1);
});
test('encoding, attendance and MOV filters combine identically for either view',()=>{
 const c=context(),m=load(c,[tracker(c),tracker(c,{Barangay:'Village B','Participants - Total':0})],['29','30','31','37'].map(t=>attachment(c,t)));
 const a=m.byCode.BA1;
 assert.equal(c.profileFilterRows(m,a,{encoding:'encoded'}).length,2);
 assert.equal(c.profileFilterRows(m,a,{attendance:'positive',mov:'ready',search:'Village A'}).length,1);
 assert.equal(c.profileFilterRows(m,a,{attendance:'zero',mov:'due'}).length,1);
 assert.equal(c.profileFilterRows(m,a,{backlog:'due'}).length,1);
 const f={search:'Village B'},status=c.profileExportRows(m,a,f,'status'),grid=c.profileExportRows(m,a,f,'checklist');
 assert.equal(status.length,2);assert.equal(grid.length,2);assert.equal(status[1][2],grid[1][2]);assert.equal(grid[0].length,status[0].length+4);
});
test('MOV-only and Tracker-only profiles preserve unassessed rather than zero statuses',()=>{
 const c=context();c.TABS.Raw_MOVs={headers:Array.from(c.MOV_HEADERS),rows:['29','30','31','37'].map(t=>attachment(c,t))};c.LOADED.movs={};
 let m=c.profileModel('Province A|Town'),r=m.byCode.BA1.rows[0];assert.equal(m.trackerImported,false);assert.equal(c.profileEncodingLabel(m,r),'Not assessed');assert.equal(m.byCode.BA1.tally.movsReady,1);assert.equal(m.byCode.BA1.tally.complete,0);
 delete c.TABS.Raw_MOVs;delete c.LOADED.movs;c.MOV_CACHE=null;m=load(c);r=m.byCode.BA1.rows[0];
 assert.equal(c.profileMovLabel(m,r),'Not assessed');assert.equal(m.byCode.BA1.tally.complete,1);
});
test('grid states preserve review, applicability, pending activity, lacking and not applicable',()=>{
 const c=context(),m=load(c,[tracker(c)],[attachment(c,'30',{Activity_ID:16})]);
 const row=m.byCode.BA1.rows[0];assert.equal(c.profileRequirementStatus(m,row,'minutes'),'Needs review');assert.equal(c.profileRequirementStatus(m,row,'attendance'),'Lacking');
 const b=m.byCode.BDC.rows[0],conditional=b.group.requirements.find(r=>r.conditional);assert.equal(c.profileRequirementStatus(m,b,conditional.id),'Needs applicability');assert.equal(c.profileRequirementStatus(m,b,'action_plan'),'Pending activity');
 c.MOV_UI.municipality=m.key;c.movSetApplicability(conditional.key,'notApplicable',{reviewer:'QA',note:'Year 1'});c.MOV_CACHE=null;c.computeAll('2026-11-05');
 const next=c.profileModel(m.key);assert.equal(c.profileRequirementStatus(next,next.byCode.BDC.rows[0],conditional.id),'Not applicable');
});
test('profile caches refresh after review or replacement and reuse the existing attendance result',()=>{
 const c=context(),m=load(c,[tracker(c)],[attachment(c,'30',{Activity_ID:16})]);assert.equal(c.profileModel(m.key),m);
 const r=m.byCode.BA1.rows[0],req=r.group.requirements.find(r=>r.id==='minutes'),a=c.SNAP.movs.attachments[0];
 c.MOV_UI.municipality=m.key;c.movApproveAssignment(req.key,a.key,{reviewer:'QA',note:'Reviewed correct minutes'});c.computeAll('2026-11-05');
 const next=c.profileModel(m.key);assert.notEqual(next,m);assert.equal(c.profileRequirementStatus(next,next.byCode.BA1.rows[0],'minutes'),'Submitted');assert.equal(next.byCode.BA1.tally.complete,m.byCode.BA1.tally.complete);assert.equal(next.byCode.BA1.tally.backlog,m.byCode.BA1.tally.backlog);
});
test('embedded evidence opens the selected requirement first and keeps standalone navigation out of the panel',()=>{
 const c=context(),m=load(c,[tracker(c)],[attachment(c)]),row=m.byCode.BA1.rows[0];
 c.esc=v=>String(v??'');c.attr=c.esc;c.MOV_UI.requirement='minutes';
 const html=c.movRenderGroup(m.mov,row.group,{embedded:true});
 assert.ok(html.indexOf('Barangay Activity Minutes Form')<html.indexOf('Review:'));
 assert.doesNotMatch(html,/data-act="mov-back"|data-act="profile-from-mov"/);
 assert.match(html,/<details class="card">/);assert.match(html,/data-act="mov-approve"/);
 const standalone=c.movRenderGroup(m.mov,row.group);assert.match(standalone,/data-act="mov-back"/);
});
test('scope checks block other municipalities, including same-name towns and exported rows',()=>{
 const c=context();load(c);const other=c.profileModel('Province B|Town');c.preferences={role:'pea_mdm',homeKey:'Province A|Town'};
 assert.equal(c.profileModel(other.key),null);assert.deepEqual(plain(c.profileExportRows(other,other.byCode.BA1,{},'status')),[]);
 const m=c.profileModel('Province A|Town');assert.ok(m.byCode.BA1.rows.every(r=>r.place.province==='Province A'));
 assert.equal(c.openMunicipalityProfile('Province B|Town'),false);
});
test('restored profile selections and panel identities are validated against stage and scope',()=>{
 const c=context();load(c);c.preferences={role:'pea_mdm',homeKey:'Province A|Town',municipalityProfile:{municipality:'Province B|Town',stage:2,activity:'BA1',view:'bad',panel:{row:'elsewhere',kind:'movs'},filters:{BA1:{search:'Village A'}}}};
 const m=c.profileValidate();assert.equal(m.key,'Province A|Town');assert.equal(c.PROFILE_STATE.activity,'');assert.equal(c.PROFILE_STATE.panel,null);assert.equal(c.PROFILE_STATE.view,'status');assert.equal(c.PROFILE_STATE.filters.BA1.search,'Village A');
});
test('later stages retain attendance monitoring without fabricated MOV requirements',()=>{
 const c=context(),name=c.DEFAULT_ACTIVITIES.find(a=>a.code==='BA2').name,m=load(c,[tracker(c,{'CRIP/MC09 Activity':name})],[]);
 const a=m.byCode.BA2;assert.equal(a.tally.complete,1);assert.equal(a.requirements.length,0);assert.equal(c.profileMovLabel(m,a.rows[0]),'Not configured for this stage');
});
test('stacked activity mix partitions the target and reconciles with the independent tallies',()=>{
 const c=context(),m=load(c,[tracker(c),tracker(c,{Barangay:'Village B','Participants - Total':0})],['29','30','31','37'].map(t=>attachment(c,t)));
 m.activities.filter(a=>!a.appraisal).forEach(a=>{const x=c.profileMix(m,a);
  assert.equal(x.complete+x.attendees+x.encoded+x.none,a.tally.expected,a.code+' partition');
  assert.equal(x.complete+x.attendees,a.tally.complete,a.code+' with attendees');
  if(x.movs)assert.ok(x.complete<=a.tally.movsReady,a.code+' complete needs MOVs');});
 const ba1=c.profileMix(m,m.byCode.BA1);assert.deepEqual(plain(ba1),{total:2,complete:1,attendees:0,encoded:1,none:0,movs:true});
});
test('without a MOV import the stack tops out at with-attendees and never claims completion',()=>{
 const c=context(),m=load(c),x=c.profileMix(m,m.byCode.BA1);
 assert.equal(x.movs,false);assert.equal(x.complete,1);assert.equal(c.profileSegments(x)[0].label,'With attendees');
 c.esc=v=>String(v??'');c.attr=c.esc;assert.doesNotMatch(c.profileStack(x,{tracker:true,head:true}),/Complete/);
 assert.match(c.profileStack(x,{tracker:false}),/Not assessed/);
});
test('MOV checklist lists every required document, with municipal activities on their own line',()=>{
 const c=context(),m=load(c,[tracker(c)],['29','30','31','37'].map(t=>attachment(c,t))),d=c.profileMapData(m);
 assert.ok(d.brgyActs.every(a=>a.level!=='Municipal'));assert.deepEqual(plain(d.muniActs.map(a=>a.code)),['MREST','MRP','APPRAISAL']);
 assert.equal(d.lines.length,2);assert.ok(d.muni.municipal);
 const a=d.lines.find(l=>l.name==='Village A'),ba1=a.groups.find(g=>g.act.code==='BA1');
 assert.equal(ba1.cells.length,m.byCode.BA1.requirements.length);assert.ok(ba1.cells.every(x=>x.status==='Submitted'));assert.equal(ba1.state.css,'ok');
 const forms=d.acts.reduce((s,x)=>s+x.requirements.length,0),rows=c.profileMapExportRows(m);
 assert.equal(rows.length,1+forms+2*c.profileMapData(m,true).acts.length);assert.equal(rows[0].length,5+3+1);assert.equal(rows[0][5],'Town (municipal level)');assert.deepEqual(plain(rows[0].slice(6,8)),['Village A','Village B']);
 const ba1Row=rows.find(r=>r[3]===m.byCode.BA1.label&&r[4]===m.byCode.BA1.requirements[0].name);assert.equal(ba1Row[5],'');assert.equal(ba1Row[6],'Submitted');assert.equal(ba1Row[8],'1/2');
 const mrestRow=rows.find(r=>r[3]===m.byCode.MREST.label);assert.notEqual(mrestRow[5],'');assert.equal(mrestRow[6],'');
 assert.equal(c.profileMapLines(d,{search:'village b',show:'',sort:'name'}).length,1);
 assert.ok(c.profileMapLines(d,{search:'',show:'due',sort:'name'}).every(l=>l.due));
 assert.ok(a.submitted<=a.required);
});
test('quick-filter chips set exactly one filter and toggle back to all',()=>{
 const c=context(),m=load(c,[tracker(c),tracker(c,{Barangay:'Village B','Participants - Total':0})],['29','30','31','37'].map(t=>attachment(c,t))),a=m.byCode.BA1;
 const f=c.profileDefaults();c.profileApplyQuick(f,'zero');assert.equal(f.attendance,'zero');assert.equal(c.profileQuickActive(f),'zero');
 assert.equal(c.profileFilterRows(m,a,f).length,1);
 c.profileApplyQuick(f,'movdue');assert.equal(f.attendance,'');assert.equal(f.mov,'due');
 c.profileApplyQuick(f,'movdue');assert.equal(c.profileQuickActive(f),'');
});test('MOV map evidence panel is limited to the map view and the current stage',()=>{
 const c=context(),m=load(c,[tracker(c)],[attachment(c)]),key=m.byCode.BA1.rows[0].key;
 c.PROFILE_STATE.activity='';c.PROFILE_STATE.home='movmap';assert.equal(c.profilePanelAllowed(m,key),true);
 c.PROFILE_STATE.home='sequence';assert.equal(c.profilePanelAllowed(m,key),false);
 c.PROFILE_STATE.home='movmap';c.PROFILE_STATE.stage=2;assert.equal(c.profilePanelAllowed(m,key),false);
 c.PROFILE_STATE.stage=1;c.PROFILE_STATE.activity='WALK';assert.equal(c.profilePanelAllowed(m,key),false);
});
test('regional users without a valid selection get the directory; municipal users never do',()=>{
 const c=context();load(c);c.esc=v=>String(v??'');c.attr=c.esc;
 c.preferences={role:'rpmo',municipalityProfile:{municipality:'Nowhere|Town'}};
 assert.equal(c.profileValidate(),null);assert.equal(c.PROFILE_STATE.municipality,'');
 const html=c.profileDirectoryHtml();assert.match(html,/data-v="Province A\|Town"/);assert.match(html,/data-v="Province B\|Town"/);
 c.PROFILE_DIR.search='province b';assert.doesNotMatch(c.profileDirectoryHtml(),/data-v="Province A\|Town"/);
 const dir=c.profileDirectoryRows();assert.deepEqual(plain(c.profileDirectorySort(dir,'province',-1).map(r=>r.model.province)),['Province B','Province A']);
 c.preferences={role:'pea_mdm',homeKey:'Province A|Town'};assert.equal(c.profileValidate().key,'Province A|Town');
});test('barangay profile lists its barangay-level activities in sequence and reconciles with the municipality',()=>{
 const c=context(),m=load(c,[tracker(c),tracker(c,{Barangay:'Village B','Participants - Total':0})],['29','30','31','37'].map(t=>attachment(c,t)));
 const key=c.profileKey(m.barangays.find(b=>b.barangay==='Village A')),b=c.profileBarangayModel(m,key);
 assert.equal(b.name,'Village A');assert.ok(b.items.every(i=>i.act.level!=='Municipal'));
 assert.deepEqual(plain(b.items.map(i=>Number(i.act.seq))),[2,3.1,3.2,3.3,3.4,3.5,5]);
 assert.equal(b.items.find(i=>i.act.code==='BA1').mix.complete,1);assert.equal(c.profileItemState(m,b.items[0]).label,'Complete');
 const vb=c.profileBarangayModel(m,c.profileKey(m.barangays.find(x=>x.barangay==='Village B')));
 assert.equal(c.profileItemState(m,vb.items.find(i=>i.act.code==='BA1')).label,'Encoded only');
 assert.equal(c.profileBarangayModel(m,'province a|town|nowhere'),null);
});
test('barangay profile drawer and restored selections stay within that barangay',()=>{
 const c=context(),m=load(c,[tracker(c)],[attachment(c)]),a=m.byCode.BA1.rows.find(r=>r.name==='Village A'),b=m.byCode.BA1.rows.find(r=>r.name==='Village B');
 c.PROFILE_STATE.barangay=c.profileKey(a.place);c.PROFILE_STATE.activity='WALK';
 assert.equal(c.profilePanelAllowed(m,a.key),true);assert.equal(c.profilePanelAllowed(m,b.key),false);
 c.PROFILE_STATE.barangay='province a|town|gone';c.profileValidate();assert.equal(c.PROFILE_STATE.barangay,'');
});
test('printable report covers the sequence, MOV checklist and follow-ups for the scoped municipality only',()=>{
 const c=context(),m=load(c,[tracker(c),tracker(c,{Barangay:'Village B','Participants - Total':0})],['29','30','31','37'].map(t=>attachment(c,t)));
 c.esc=v=>String(v??'');c.attr=c.esc;c.PROFILE_STATE.municipality=m.key;
 const html=c.profileReportHtml(m);
 assert.match(html,/Town, Province A/);assert.match(html,/Activities in sequence/);assert.match(html,/MOV checklist/);assert.match(html,/Barangays needing follow-up/);
 assert.match(html,/<strong>Village B<\/strong> — /);assert.doesNotMatch(html,/Other village/);
 assert.equal((html.match(/<span class="prep-vert">Village /g)||[]).length,2);assert.match(html,/Seq 2 · 1st Barangay Assembly/);
 assert.match(html,/<th class="prep-formcol">Barangay Activity Minutes Form<\/th><td class="prep-ok">✓<\/td>/);
 c.PROFILE_REPORT_COLUMNS=1;const split=c.profileReportHtml(m);assert.match(split,/Barangays 1–1 of 2/);assert.match(split,/Barangays 2–2 of 2/);
});test('household quorum matches the monitor: present ÷ listed per assembly, met at 70%, all barangays counted',()=>{
 const c=context(),m=load(c,[tracker(c,{'BA Participation - Total HH in Barangay':100,'BA Participation - Total HH Represented':80}),tracker(c,{Barangay:'Village B','BA Participation - Total HH in Barangay':50,'BA Participation - Total HH Represented':20})]);
 const q=c.profileQuorum(m,'BA1');assert.equal(q.reporting,2);assert.equal(q.listed,150);assert.equal(q.present,100);assert.equal(q.met,1);assert.ok(Math.abs(q.rate-100/150)<1e-9);
 const a=m.byCode.BA1;assert.equal(a.households,true);assert.equal(m.byCode.PROFILE.households,false);
 assert.equal(a.rows.find(r=>r.name==='Village B').hh.status,'below');
 assert.equal(c.profileFilterRows(m,a,{quorum:'below'}).length,1);assert.equal(c.profileFilterRows(m,a,{quorum:'met'})[0].name,'Village A');
 const rows=c.profileExportRows(m,a,{},'status');assert.ok(rows[0].includes('Household quorum'));assert.equal(rows.find(r=>r[2]==='Village B')[rows[0].indexOf('Quorum status')],'Below 70%');
});
test('municipal operational summaries no longer calculate or render a custom composite',()=>{
 const c=context(),m=load(c,[tracker(c,{'BA Participation - Total HH in Barangay':100,'BA Participation - Total HH Represented':80})]);
 c.LOADED.volunteers={};c.esc=v=>String(v??'');const k=c.profileKpis(m);
 assert.equal(k.volunteersLoaded,true);assert.equal(k.brest.encoded,0);
 assert.equal(Object.hasOwn(k,'composite'),false);
 assert.ok(c.PROFILE_DIR_COLUMNS.every(col=>col[0]!=='composite'));
 assert.doesNotMatch(c.profileReportKpis(m),/Composite|weighted index/);
 assert.equal((c.profileDirKpiCells(k).match(/<td/g)||[]).length,3);
});

test('deep links from DQA and other modules open the matching barangay, activity and attendance panel',()=>{
 const c=context(),m=load(c);let page='';c.go=p=>{page=p;};
 assert.equal(c.profileOpenLocation('Province A|Town|Village A','BA1',true),true);assert.equal(page,'profile');
 assert.equal(c.PROFILE_STATE.barangay,c.profileKey(m.barangays.find(b=>b.barangay==='Village A')));assert.equal(c.PROFILE_STATE.activity,'BA1');
 assert.equal(c.PROFILE_STATE.panel.row,m.byCode.BA1.rows.find(r=>r.name==='Village A').key);assert.equal(c.profilePanelAllowed(m,c.PROFILE_STATE.panel.row),true);
 c.profileOpenLocation('Province A|Town','MREST',true);assert.equal(c.PROFILE_STATE.barangay,'');assert.equal(c.PROFILE_STATE.panel.row,m.byCode.MREST.rows[0].key);
 c.preferences={role:'pea_mdm',homeKey:'Province A|Town'};assert.equal(c.profileOpenLocation('Province B|Town|Other village','BA1',true),false);
});

test('combined checks keep encoding, zero attendance and credited MOV counts independent',()=>{
 const c=context(),m=load(c,[tracker(c),tracker(c,{Barangay:'Village B','Participants - Total':0})],[attachment(c),attachment(c)]);
 const rows=m.byCode.BA1.rows,a=rows[0],b=rows[1];
 assert.equal(c.profileCheck(m,a,'encoding').value,'Encoded');
 assert.equal(c.profileCheck(m,a,'attendees').value,'With attendees');assert.equal(c.profileCheck(m,a,'attendees').text,'✓');
 assert.equal(c.profileCheck(m,b,'attendees').text,'○');
 assert.equal(c.profileCheck(m,a,'movs').text,'1/4');
 assert.equal(c.profileCheckTotal(m,rows,'encoding'),'2/2');assert.equal(c.profileCheckTotal(m,rows,'attendees'),'1/2');
 assert.equal(c.profileCheckTotal(m,rows,'movs'),'1/8');
 const out=c.profileMapExportRows(m).filter(r=>r[3]===m.byCode.BA1.label);
 assert.equal(out.find(r=>r[4]==='Encoding')[6],'Encoded');
 assert.equal(out.find(r=>r[4]==='With attendees')[7],'No reported attendees');
 assert.equal(out.find(r=>r[4]==='MOVs submitted / required'),undefined);
 c.PROFILE_STATE.filters.__map={search:'Village A',show:'',sort:'name'};
 assert.equal(c.profileMapExportRows(m).find(r=>r[4]==='With attendees'&&r[3]===m.byCode.BA1.label).at(-1),'1/1');
});
test('combined checklist preserves missing-source, appraisal, and outside-target states',()=>{
 const c=context(),m=load(c,undefined,[]);c.esc=v=>String(v??'');c.attr=c.esc;
 const bdc=m.byCode.BDC.rows,extra=bdc.find(r=>!r.expected);
 assert.equal(c.profileCheckTotal(m,bdc,'encoding'),'0/1');
 assert.match(c.profileCheckRows(m,bdc,m.byCode.BDC),/outside/);
 assert.equal(c.profileCheck(m,m.byCode.APPRAISAL.rows[0],'encoding').value,'Not an attendance activity');
 m.trackerImported=false;assert.equal(c.profileCheck(m,extra,'encoding').value,'Not assessed');
 m.movImported=false;assert.equal(c.profileCheck(m,extra,'movs').value,'Not assessed');
 assert.equal(c.profileCheckTotal(m,bdc,'movs'),'Not assessed');
});
test('stage 2 checklist lists all activities and can open attendance without MOV definitions',()=>{
 const c=context(),m=load(c,[tracker(c,{'CRIP/MC09 Activity':'2nd BA'})]);
 c.PROFILE_STATE.stage=2;c.PROFILE_STATE.home='movmap';c.PROFILE_STATE.activity='';
 const d=c.profileMapData(m,true);assert.equal(d.acts.length,c.profileStageActivities(m).length);
 const row=m.byCode.BA2.rows[0];assert.equal(c.profilePanelAllowed(m,row.key),true);
 assert.equal(c.profileCheck(m,row,'movs').value,'Not configured');
 c.esc=v=>String(v??'');c.attr=c.esc;const html=c.profileMovMapHtml(m);
 assert.match(html,/Encoding/);assert.match(html,/With attendees/);assert.match(html,/MOV requirements are not configured/);
 assert.doesNotMatch(html,/0 of .* MOV-ready|profile-map-details/);
});
test('individual MOV forms always remain visible, including after restoring older collapsed settings',()=>{
 const c=context(),m=load(c,undefined,[attachment(c)]);c.esc=v=>String(v??'');c.attr=c.esc;
 c.profileMapFilters().details=false;
 const html=c.profileMovMapHtml(m);assert.doesNotMatch(html,/Show MOV forms|Hide MOV forms|profile-map-details/);assert.match(html,/id="profile-cell-/);
 assert.doesNotMatch(html,/MOVs submitted \/ required|data-act="profile-map-show"/);
 assert.match(html,/pcheck-row pcheck-divider/);assert.match(html,/aria-label="Show barangays"/);
 assert.equal((html.match(/id="profile-cell-/g)||[]).length,c.profileMapData(m,true).acts.reduce((total,a)=>total+a.rows.length*a.requirements.length,0));
 const ids=Array.from(html.matchAll(/id="([^"]+)"/g),m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 c.PROFILE_STATE.municipality=m.key;c.PROFILE_STATE.home='movmap';c.profileMapFilters().search='Village';c.profilePersist();
 c.PROFILE_STATE.filters={};c.PROFILE_RESTORED=false;c.profileRestore();assert.equal(c.profileMapFilters().details,undefined);assert.equal(c.profileMapFilters().search,'Village');assert.match(c.profileMovMapHtml(m),/id="profile-cell-/);
 const d=c.profileMapData(m,true);assert.ok(c.profileMapLines(d,{show:'notEncoded'}).every(l=>l.notEncoded));
 const other=c.profileModel('Province B|Town');c.preferences={role:'pea_mdm',homeKey:m.key};assert.deepEqual(plain(c.profileMapExportRows(other)),[]);
});
