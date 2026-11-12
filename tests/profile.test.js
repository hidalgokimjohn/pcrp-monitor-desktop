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
  c.icon=()=>'<span class="ico"></span>';
  c.pctText=v=>v===null||v===undefined?'—':(Math.round(v*1000)/10).toFixed(1)+'%';
  c.activityProgressSum=items=>items.reduce((t,x)=>{['expected','encoded','complete','movsReady','movSubmitted','movRequired','movBacklog'].forEach(k=>{t[k]+=x[k]||0;});return t;},{expected:0,encoded:0,complete:0,movsReady:0,movSubmitted:0,movRequired:0,movBacklog:0});
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

test('swimlane uses Actual End independently of attendance and counts each target once',()=>{
 const c=context(),mrest=c.DEFAULT_ACTIVITIES.find(a=>a.code==='MREST').name;
 const m=load(c,[tracker(c,{Barangay:'','CRIP/MC09 Activity':mrest}),tracker(c,{'Participants - Total':0}),tracker(c,{'Participants - Total':0}),tracker(c,{Barangay:'Village B','Actual End':''})]);
 const d=c.profileSwimlaneData(m),ba=d.cells.find(x=>x.activity.code==='BA1');
 assert.equal(d.current,'BA1');assert.equal(ba.target,2);assert.equal(ba.completed,1);assert.equal(ba.status,'partial');
 assert.equal(m.byCode.BA1.tally.complete,1,'existing attendance metric remains independent');
 assert.equal(d.cells[0].status,'complete');assert.equal(d.cells.some(x=>x.activity.appraisal),false);
});

test('swimlane keeps the first gap while displaying later completions and rejects invalid dates',()=>{
 const c=context(),m=load(c,[tracker(c),tracker(c,{Barangay:'Village B'}),tracker(c,{'CRIP/MC09 Activity':c.DEFAULT_ACTIVITIES.find(a=>a.code==='PROFILE').name,'Actual End':'2026-02-30'})]);
 const d=c.profileSwimlaneData(m);
 assert.equal(d.current,'MREST');assert.equal(d.cells.find(x=>x.activity.code==='BA1').status,'complete');
 assert.equal(d.cells.find(x=>x.activity.code==='PROFILE').completed,0);
 for (const date of ['',null,'nonsense','2026-13-01','2026-02-30']) {
   m.byCode.BA1.rows[0].attendance.dateEnd=date;
   assert.equal(c.profileSwimlaneData(m).cells.find(x=>x.activity.code==='BA1').completed,1,String(date));
 }
 c.esc=v=>String(v??'');c.attr=c.esc;
 const html=c.profileSwimlaneHtml(c.profileDirectoryRows());
 assert.match(html,/aria-current="step"/);assert.match(html,/data-code="BA1"/);assert.match(html,/Actual End/);
});

test('swimlane respects priority targets, stage changes and zero-target activities',()=>{
 const c=context(),m=load(c,[]),ba2=c.DEFAULT_ACTIVITIES.find(a=>a.code==='BA2');
 load(c,[tracker(c,{'CRIP/MC09 Activity':ba2.name}),tracker(c,{Barangay:'Village B','CRIP/MC09 Activity':ba2.name})]);
 const fresh=c.profileModel(m.key),d=c.profileSwimlaneData(fresh,2);
 assert.equal(d.cells[0].target,1);assert.equal(d.cells[0].completed,1);assert.equal(d.current,'TR_CSPMC');
 assert.ok(d.cells.every(x=>x.activity.stage===2));
 fresh.byCode.BA2.rows.forEach(r=>r.expected=false);
 assert.equal(c.profileSwimlaneData(fresh,2).current,'TR_CSPMC');
 fresh.activities.filter(a=>a.stage===2).forEach(a=>a.rows.forEach(r=>r.expected=false));
 assert.equal(c.profileSwimlaneData(fresh,2).status,'na');assert.equal(c.profileSwimlaneData(fresh,2).current,'');
});

test('swimlane finishes only when every applicable activity is completed',()=>{
 const c=context();
 const trs=c.DEFAULT_ACTIVITIES.filter(a=>a.stage===1).flatMap(a=>(a.level==='Municipal'?['']:a.prioOnly?['Village A']:['Village A','Village B']).map(b=>tracker(c,{Barangay:b,'CRIP/MC09 Activity':a.name})));
 const m=load(c,trs),d=c.profileSwimlaneData(m);
 assert.equal(d.status,'complete');assert.equal(d.current,'');
 c.esc=v=>String(v??'');c.attr=c.esc;
 // Across all stages the same municipality has cleared Stage 1 and waits at the first Stage 2 activity.
 const whole=c.profileSwimlaneData(m,'all');assert.equal(whole.cells.length,c.DEFAULT_ACTIVITIES.length);assert.equal(whole.status,'active');assert.equal(whole.current,'BA2');
 assert.equal(c.profileRaceStanding(whole).position,d.cells.length);
 let html=c.profileSwimlaneHtml(c.profileDirectoryRows());
 assert.doesNotMatch(html,/class="psw-finished-marker"/);assert.match(html,/style="grid-column:span 9">Stage 1</);assert.match(html,/class="psw-leg psw-leg-start" style="grid-column:span 6">Stage 2</);
 assert.match(html,/psw-current psw-leg-start" data-act="profile-dir-cell" data-v="Province A\|Town" data-code="BA2"/);assert.match(html,/All stages complete/);
 c.PROFILE_DIR.scope='stage';
 assert.match(c.profileSwimlaneHtml(c.profileDirectoryRows()),/class="psw-finished-marker"/);
 m.byCode.MREST.rows[0].attendance.dateEnd=null;
 assert.equal(c.profileSwimlaneData(m).status,'active');assert.equal(c.profileSwimlaneData(m).current,'MREST');
});

test('swimlane race places run without gaps: municipalities level with each other share a place and the next one follows',()=>{
 const c=context();
 const positions={A:3,B:2,C:2,D:1,E:1,F:0.5};
 c.profileSwimlaneData=model=>model;c.profileRaceStanding=model=>({racing:model.municipality!=='G',position:positions[model.municipality]||0,overall:0});
 const rows=['D','B','A','F','C','E','G'].map(k=>({key:k,model:{province:'P',municipality:k}}));
 const field=c.profileRaceField(rows),rank=Object.fromEntries(field.map(f=>[f.entry.key,f.rank]));
 assert.deepEqual(rank,{A:1,B:2,C:2,D:3,E:3,F:4,G:0});
});

test('swimlane race places each municipality by cleared activities plus the share of the current one',()=>{
 const c=context(),mrest=c.DEFAULT_ACTIVITIES.find(a=>a.code==='MREST').name;c.esc=v=>String(v??'');c.attr=c.esc;
 // Province A's Town clears MResT and half of the 1st BA; Province B's Town has nothing completed.
 const m=load(c,[tracker(c,{Barangay:'','CRIP/MC09 Activity':mrest}),tracker(c)]);
 const s=c.profileRaceStanding(c.profileSwimlaneData(m));
 assert.equal(s.at,1);assert.equal(s.share,0.5);assert.equal(s.position,1.5);assert.equal(s.done,2);
 const field=c.profileRaceField(c.profileDirectoryRows()),a=field.find(f=>f.entry.key==='Province A|Town'),b=field.find(f=>f.entry.key==='Province B|Town');
 assert.equal(a.rank,1);assert.equal(b.rank,2);assert.equal(b.standing.position,0);
 assert.deepEqual([1,2,3,4,11,12,13,21,22,103,111].map(c.profileOrdinal),['1st','2nd','3rd','4th','11th','12th','13th','21st','22nd','103rd','111th']);
 const rows=c.profileDirectoryRows();let html=c.profileSwimlaneHtml(rows,rows);
 assert.match(html,/style="--at:1;--f:0.5"/);assert.match(html,/<strong>1st<\/strong>/);assert.match(html,/psw-race psw-go/);
 assert.ok(html.indexOf('data-v="Province A|Town"')<html.indexOf('data-v="Province B|Town"'),'leader first');
 // The race board lists the leaders and puts one dot per municipality over its current activity.
 assert.match(html,/<ol class="psw-podium"><li><span class="psw-rank psw-rank-1">1<\/span>/);assert.equal((html.match(/class="psw-dot[ "]/g)||[]).length,2);
 assert.match(html,/class="psw-dot psw-rank-1" data-act="profile-race-focus" data-v="Province A\|Town" title="Town, Province A · 1st place · show its lane"/);
 assert.match(html,/class="psw-lane psw-is-active" role="listitem" data-key="Province A\|Town"/);
 // A search keeps the place earned against the whole field, and a re-render does not replay the race.
 html=c.profileSwimlaneHtml(rows.filter(r=>r.key==='Province B|Town'),rows);
 assert.match(html,/<strong>2nd<\/strong>/);assert.doesNotMatch(html,/psw-go/);
 c.PROFILE_DIR.order='province';assert.match(c.profileSwimlaneHtml(rows,rows),/class="psw-province"><span>Province A</);
 c.profileDirSaveView();c.PROFILE_DIR.order='rank';c.PROFILE_DIR.viewLoaded=false;c.profileDirLoadView();assert.equal(c.PROFILE_DIR.order,'province');
});

test('swimlane has no marker without Tracker, filters provinces, and preserves directory preference',()=>{
 const c=context();c.esc=v=>String(v??'');c.attr=c.esc;
 const m=c.profileModel('Province A|Town');assert.equal(c.profileSwimlaneData(m).status,'unassessed');
 assert.equal(c.profileSwimlaneData(m).current,'');
 let html=c.profileSwimlaneHtml(c.profileDirectoryRows());
 assert.match(html,/Not assessed/);assert.doesNotMatch(html,/class="psw-marker"/);
 c.profileDirLoadView();assert.equal(c.PROFILE_DIR.view,'matrix');
 c.PROFILE_DIR.view='swimlane';c.profileDirSaveView();c.PROFILE_DIR.view='list';c.PROFILE_DIR.viewLoaded=false;c.profileDirLoadView();
 assert.equal(c.PROFILE_DIR.view,'swimlane');
 html=c.profileDirectoryHtml();assert.match(html,/data-v="Province A\|Town"/);assert.match(html,/data-v="Province B\|Town"/);
 c.PROFILE_DIR.search='province b';html=c.profileDirectoryHtml();assert.doesNotMatch(html,/data-v="Province A\|Town"/);assert.match(html,/data-v="Province B\|Town"/);
 c.PROFILE_DIR.search='missing municipality';assert.match(c.profileDirectoryHtml(),/No municipalities match/);
 // The course covers every stage unless narrowed to the stage in view; the choice is remembered.
 c.PROFILE_DIR.search='';c.PROFILE_STATE.stage=2;assert.match(c.profileDirectoryHtml(),/Activity 6/);assert.match(c.profileDirectoryHtml(),/>1st Barangay Assembly/);
 c.PROFILE_DIR.scope='stage';assert.match(c.profileDirectoryHtml(),/Activity 6/);assert.doesNotMatch(c.profileDirectoryHtml(),/>1st Barangay Assembly/);
 c.profileDirSaveView();c.PROFILE_DIR.scope='all';c.PROFILE_DIR.viewLoaded=false;c.profileDirLoadView();assert.equal(c.PROFILE_DIR.scope,'stage');
});

test('swimlane preserves municipal workspace restrictions and handles empty stages',()=>{
 const c=context();c.esc=v=>String(v??'');c.attr=c.esc;load(c);
 c.preferences.role='pea_mdm';c.preferences.homeKey='Province A|Town';
 assert.equal(c.profileModel('Province B|Town'),null);assert.equal(c.profileSwimlaneHtml(c.profileDirectoryRows()),'');
 c.preferences.role='rpmo';const rows=c.profileDirectoryRows();rows.forEach(r=>r.model.activities=[]);
 assert.match(c.profileSwimlaneHtml(rows),/No activities are configured/);
});

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
test('grid states preserve credited candidates, applicability, pending activity and lacking',()=>{
 const c=context(),m=load(c,[tracker(c)],[attachment(c,'30',{Activity_ID:16})]);
 const row=m.byCode.BA1.rows[0];assert.equal(c.profileRequirementStatus(m,row,'minutes'),'Submitted');assert.equal(c.profileRequirementStatus(m,row,'attendance'),'Lacking');
 const b=m.byCode.BDC.rows[0],conditional=b.group.requirements.find(r=>r.conditional);assert.equal(c.profileRequirementStatus(m,b,conditional.id),b.place.stage2Prio?'Pending activity':'Not applicable');assert.equal(c.profileRequirementStatus(m,b,'action_plan'),'Pending activity');
});
test('MOV progress counts each submitted form, so partial uploads show before a checklist is complete',()=>{
 const c=context(),m=load(c,[tracker(c)],[attachment(c,'29'),attachment(c,'30')]);c.esc=v=>String(v??'');c.attr=c.esc;
 // Two expected barangays with four BA1 forms each; Village A has uploaded two of its four.
 const a=m.byCode.BA1;assert.equal(a.tally.movsReady,0);assert.equal(a.tally.movSubmitted,2);assert.equal(a.tally.movRequired,8);
 assert.match(c.profileDonuts(m,a),/MOV forms submitted: 2 of 8 \(25%\)/);
 const t=c.activityProgressSum(c.profileStageActivities(m,1).map(x=>x.tally));
 assert.match(c.profileMeasures(m,t,1),/MOVs submitted <b>2\/\d+ forms<\/b>/);assert.match(c.profileMeasures(m,t,1),/MOVs ready <b>0\//);
 assert.match(c.profileMeasures(m,t,2),/MOVs submitted <b>Not assessed<\/b>/);
});
test('municipal Activity & MOV checklist: municipalities as rows, activity groups of encoded, attendees and MOVs, as x/y or %',()=>{
 const c=context(),m=load(c,[tracker(c)],[attachment(c,'29'),attachment(c,'30')]);c.esc=v=>String(v??'');c.attr=c.esc;
 const rows=[{key:m.key,model:m}];
 const cols=c.profileDirMatrixColumns([m]);
 // Overall comes first, then the stage's activities in sequence.
 assert.deepEqual(plain(cols.map(x=>x.act.code)),['__overall'].concat(plain(c.profileStageActivities(m,1).map(a=>a.code))));
 // Overall is one column: the equal-weight average of the stage's Encoded, With attendees and MOVs rates.
 assert.deepEqual(plain(cols[0].measures.map(x=>x[0])),['overall']);assert.deepEqual(plain(cols[0].parts.map(x=>x[0])),['encoded','attendees','movs']);
 const sum=c.activityProgressSum(c.profileStageActivities(m,1).map(a=>a.tally)),o=c.profileDirMatrixValues(m,'__overall').overall;
 const expected=(sum.encoded/sum.expected+sum.complete/sum.expected+sum.movSubmitted/sum.movRequired)/3;
 assert.equal(o.assessed,true);assert.ok(Math.abs(o.rate-expected)<1e-9);
 assert.equal(c.profileDirMatrixText(o,'frac'),Math.round(expected*100)+'%','Overall is a percentage in either format');
 assert.deepEqual(plain(cols.find(x=>x.act.code==='BA1').measures.map(x=>x[0])),['encoded','attendees','movs']);
 const v=c.profileDirMatrixValues(m,'BA1');
 assert.deepEqual(plain(v),{encoded:{v:1,t:2,assessed:true},attendees:{v:1,t:2,assessed:true},movs:{v:2,t:8,assessed:true}});
 c.PROFILE_DIR.format='frac';let html=c.profileDirMatrixHtml(rows,rows);
 assert.match(html,/<th scope="col" rowspan="2" class="pdm-name">Municipality<\/th>/);assert.match(html,/class="pdm-measure pdm-first" title="Encoded"><abbr[^>]*>Enc<\/abbr><\/th><th scope="col" class="pdm-measure" title="With attendees"><abbr[^>]*>Att<\/abbr><\/th><th scope="col" class="pdm-measure" title="MOVs"><abbr[^>]*>MOV<\/abbr><\/th>/);
 assert.match(html,/<th scope="col" rowspan="2" class="pdm-act pdm-overall pdm-overall-end pdm-first"[^>]*><span class="pdm-seq">Stage 1<\/span><span class="pdm-label">Overall<\/span>/);
 assert.match(html,/pdm-overall pdm-overall-end"><button type="button" data-act="profile-dir-cell" data-v="[^"]*" data-code="" title="Town · Overall: \d+%, the average of Encoded \d+% \(\d+ of \d+\), With attendees \d+% \(\d+ of \d+\), MOVs \d+% \(2 of \d+\)"[^>]*>\d+%</);
 assert.match(html,/data-code="BA1" title="Town · [^"]*Encoded: 1 of 2"[^>]*>1\/2</);assert.match(html,/MOVs: 2 of 8 required MOV forms"[^>]*>2\/8</);assert.match(html,/Region total/);
 c.PROFILE_DIR.format='pct';html=c.profileDirMatrixHtml(rows,rows);
 assert.match(html,/Encoded: 1 of 2"[^>]*>50%</);assert.match(html,/MOVs: 2 of 8 required MOV forms"[^>]*>25%</);
 // Stage 2 has no MOV requirements: its activity groups carry only the two attendance measures.
 c.PROFILE_STATE.stage=2;const s2=c.profileDirMatrixColumns([m]);
 assert.ok(s2.slice(1).every(x=>x.measures.length===2));assert.deepEqual(plain(s2[0].parts.map(x=>x[0])),['encoded','attendees']);
 assert.equal(c.profileDirMatrixValues(m,'__overall').overall.keys.length,2,'Stage 2 Overall averages only the two attendance measures');c.PROFILE_STATE.stage=1;
 assert.equal(c.profileDirMatrixExportRows()[0][2],'Overall (Stage 1) %');
 // Without a MOV import the MOV figures read as not assessed, never as zero.
 const noMov=load(context(),[tracker(c)]);assert.equal(c.profileDirMatrixText(c.profileDirMatrixValues(noMov,'BA1').movs,'frac'),'—');
 // The export keeps counts and targets in their own columns, whatever the on-screen format.
 const ex=c.profileDirMatrixExportRows(),head=ex[0],ba1=c.profileStageActivities(m,1).find(a=>a.code==='BA1'),label=ba1.seq+' '+ba1.label;
 const town=ex.find(r=>r[0]==='Province A'&&r[1]==='Town');
 assert.deepEqual([head.indexOf(label+' · Encoded'),head.indexOf(label+' · MOV forms required')].map(i=>i>1),[true,true]);
 assert.deepEqual([town[head.indexOf(label+' · Encoded')],town[head.indexOf(label+' · Target')],town[head.indexOf(label+' · MOV forms submitted')],town[head.indexOf(label+' · MOV forms required')]],[1,2,2,8]);
});
test('checklist summary, below-100% filter and lowest-first order work on the same figures as the cells',()=>{
 const c=context();c.esc=v=>String(v??'');c.attr=c.esc;
 // Province A's Town has one of two 1st BAs encoded; Province B's Town has nothing.
 load(c,[tracker(c)],[attachment(c,'29')]);
 const all=c.profileDirectoryRows().sort((a,b)=>a.model.province.localeCompare(b.model.province));
 let html=c.profileDirMatrixHtml(all,all);
 assert.match(html,/class="pdm-summary" aria-label="Region summary, Stage 1"/);assert.match(html,/Region overall · Stage 1<\/span><strong>\d+%<\/strong>/);assert.match(html,/0 of 2 municipalities at 100%/);
 assert.match(html,/>Encoded<\/span><strong>\d+%<\/strong>[\s\S]*?<small>1 of \d+ activity targets<\/small>/);assert.match(html,/MOVs submitted<\/span>[\s\S]*?<small>1 of \d+ required MOV forms<\/small>/);
 assert.match(html,/data-act="profile-dir-matrix-show" data-v="behind" aria-pressed="false">Below 100% <b>2<\/b>/);
 assert.match(html,/class="pdm-prov"><th scope="rowgroup" colspan="\d+"><span>Province A <small>1<\/small>/);assert.match(html,/<i class="pdm-bar" aria-hidden="true"><b style="width:\d+%">/);
 assert.ok(html.indexOf('data-v="Province A|Town"')<html.indexOf('data-v="Province B|Town"'));
 // Lowest first drops the province groups, names the province on each row and puts the weakest on top.
 c.PROFILE_DIR.msort='low';html=c.profileDirMatrixHtml(all,all);
 assert.doesNotMatch(html,/class="pdm-prov"/);assert.match(html,/<span class="pdm-sub">Province B<\/span>/);
 assert.ok(html.indexOf('data-v="Province B|Town"')<html.indexOf('data-v="Province A|Town"'));
 // A municipality at 100% leaves the below-100% list, and the footer then totals only what is shown.
 const done=all[0].model;c.profileStageActivities(done,1).forEach(a=>{a.tally.encoded=a.tally.complete=a.tally.expected;a.tally.movSubmitted=a.tally.movRequired;});
 c.PROFILE_DIR.mshow='behind';html=c.profileDirMatrixHtml(all,all);
 assert.match(html,/1 of 2 municipalities at 100%/);assert.match(html,/Total shown/);assert.doesNotMatch(html,/data-act="profile-open-muni" data-v="Province A\|Town"/);
 c.profileDirSaveView();c.PROFILE_DIR.mshow='all';c.PROFILE_DIR.msort='province';c.PROFILE_DIR.viewLoaded=false;c.profileDirLoadView();
 assert.equal(c.PROFILE_DIR.mshow,'behind');assert.equal(c.PROFILE_DIR.msort,'low');
 // Without a MOV import the MOV columns and tile are left out rather than shown as dashes.
 const c2=context();c2.esc=v=>String(v??'');c2.attr=c2.esc;load(c2,[tracker(c2)]);const r2=c2.profileDirectoryRows();html=c2.profileDirMatrixHtml(r2,r2);
 assert.doesNotMatch(html,/>MOV<\/abbr>/);assert.doesNotMatch(html,/MOVs submitted<\/span>/);assert.match(html,/The MOV columns appear once they are imported/);
});
test('profile caches refresh after a MOV replacement and reuse the existing attendance result',()=>{
 const c=context(),m=load(c,[tracker(c)],[attachment(c,'30',{Activity_ID:16})]);assert.equal(c.profileModel(m.key),m);
 c.TABS.Raw_MOVs={headers:Array.from(c.MOV_HEADERS),rows:[attachment(c,'30')]};c.MOV_CACHE=null;c.computeAll('2026-11-05');
 const next=c.profileModel(m.key);assert.notEqual(next,m);assert.equal(c.profileRequirementStatus(next,next.byCode.BA1.rows[0],'minutes'),'Submitted');assert.equal(next.byCode.BA1.tally.complete,m.byCode.BA1.tally.complete);assert.equal(next.byCode.BA1.tally.backlog,m.byCode.BA1.tally.backlog);
});
test('the evidence panel lists only the activity requirements, with no review controls',()=>{
 const c=context(),m=load(c,[tracker(c)],[attachment(c)]),row=m.byCode.BA1.rows[0];
 c.esc=v=>String(v??'');c.attr=c.esc;c.MOV_UI.requirement='minutes';
 const html=c.movRenderGroup(m.mov,row.group);
 assert.match(html,/All 4 requirements for this activity/);assert.match(html,/<tr class="mov-selected"><td>Barangay Activity Minutes Form<\/td>/);
 assert.doesNotMatch(html,/data-act="mov-back"|data-act="profile-from-mov"/);
 assert.doesNotMatch(html,/data-act="mov-approve"|data-act="mov-requirement"|Review|<details|Source attachments and supplementary files/);
 assert.equal(c.renderMovs,undefined);assert.equal(c.movApproveAssignment,undefined);
});
test('scope checks block other municipalities, including same-name towns and exported rows',()=>{
 const c=context();load(c);const other=c.profileModel('Province B|Town');c.preferences={role:'pea_mdm',homeKey:'Province A|Town'};
 assert.equal(c.profileModel(other.key),null);assert.deepEqual(plain(c.profileExportRows(other,other.byCode.BA1,{},'status')),[]);
 const m=c.profileModel('Province A|Town');assert.ok(m.byCode.BA1.rows.every(r=>r.place.province==='Province A'));
 assert.equal(c.openMunicipalityProfile('Province B|Town'),false);
});
test('restored profile selections and panel identities are validated against stage and scope',()=>{
 const c=context();load(c);c.preferences={role:'pea_mdm',homeKey:'Province A|Town',municipalityProfile:{municipality:'Province B|Town',stage:2,activity:'BA1',view:'bad',panel:{row:'elsewhere',kind:'movs'},filters:{BA1:{search:'Village A'}}}};
 c.STATE.stage=2;   // the header's global stage switch, restored at start-up from the saved stage
 const m=c.profileValidate();assert.equal(c.PROFILE_STATE.stage,2);assert.equal(m.key,'Province A|Town');assert.equal(c.PROFILE_STATE.activity,'');assert.equal(c.PROFILE_STATE.panel,null);assert.equal(c.PROFILE_STATE.view,'status');assert.equal(c.PROFILE_STATE.filters.BA1.search,'Village A');
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
test('activity stepper shows three nested donuts and attendance reads as one line',()=>{
 const c=context(),mrest=c.DEFAULT_ACTIVITIES.find(a=>a.code==='MREST').name,m=load(c,[tracker(c),tracker(c,{Barangay:'Village B','Participants - Total':0}),tracker(c,{Barangay:'','CRIP/MC09 Activity':mrest,'Target Start':'2026-09-30','Target End':'2026-09-30','Actual Start':'2026-10-01','Actual End':'2026-10-01'})],['29','30','31','37'].map(t=>attachment(c,t)));
 c.esc=v=>String(v??'');c.attr=c.esc;
 const html=c.profileDonuts(m,m.byCode.BA1);
 assert.equal((html.match(/class="pdonut /g)||[]).length,3);assert.match(html,/Encoded: 2 of 2 \(100%\)/);assert.match(html,/With attendees: 1 of 2 \(50%\)/);assert.match(html,/MOV forms submitted: 4 of 8 \(50%\)/);assert.match(html,/<small>MOV<\/small>/);
 assert.equal(c.profileCountLine({total:100,male:50,female:50,unspecified:0}),'<span class="patt-line">Total: <b>100</b> (M: 50, F: 50, U: 0)</span>');
 const muni=c.profileMunicipalHtml(m,m.byCode.MREST);assert.match(muni,/Target date<\/span><strong>2026-09-30<\/strong>[\s\S]*Actual date<\/span><strong>2026-10-01<\/strong>[\s\S]*Participants<\/span><span class="patt-line">Total: <b>10<\/b> \(M: 3, F: 7, U: 0\)/);assert.doesNotMatch(muni,/source records/);assert.match(muni,/class="pfile pf-/);
});
function volunteers(c, rows) {
  const H=['Region Name','Province Name','City Name','Barangay Name','Sequence No','Name','First Name','Middle Name','Last Name','Sex Description','Is Ip','city_psgc','brgy_psgc','volunteer_committee','volunteer_committee_position','vol_start_date','vol_end_date','PWD'];
  const row=(brgy,psgc,first,last,committee,position,sex)=>['Region','Province A','Town',brgy,2,'1st BA',first,'M',last,sex,false,'1000',psgc,committee,position,46220,'',false];
  c.TABS.Raw_Volunteers={headers:Array.from(c.volunteerHeaders(H)),rows:rows.map(r=>row(...r))};c.LOADED.volunteers={};c.PEOPLE=null;
}
test('Community Volunteer checklist: barangays as rows, Stage 1 committees as columns, each person once',()=>{
 const c=context(),SF='Stakeholders Feedback Mechanism Sub Committee (SFMSC - Barangay)',BR='Barangay Resilience Team';
 volunteers(c,[['Village A','1001','Ana','Cruz',BR,'Member','female'],['Village A','1001','Ana','Cruz',BR,'Member','female'],
   ['Village A','1001','Ben','Reyes',SF,'Chairperson','male'],['Village A','1001','Cara','Lim',SF,'Member','female'],['Village A','1001','Dan','Uy',SF,'Member','male'],
   ['Village A','1001','Eve','Go','','','female'],['Village B','1002','Fay','Tan',SF,'Member','female'],
   ['Village B','1002','Gus','Ong','Stakeholders Feedback Mechanism Committee (SFMC - Municipal)','Member','male']]);
 const m=load(c,[tracker(c),tracker(c,{Barangay:'Village B','CRIP/MC09 Activity':'1st BA'})]);
 const d=c.profileCvData(m,1);
 assert.deepEqual(plain(d.bodies.map(b=>b.id)),['BREST','SFMSC']);
 assert.deepEqual(plain(d.lines.map(l=>l.name)),['Village A','Village B']);
 const a=d.lines[0],b=d.lines[1];
 assert.equal(a.cells[0].css,'ok');assert.equal(a.cells[0].members,1,'the repeated BResT row counts once');
 assert.equal(a.cells[1].css,'ok');assert.equal(a.cells[1].members,3);
 assert.equal(a.cells[1].chairs,1);assert.equal(a.cells[1].others,2);assert.equal(a.cells[1].chairCss,'ok');assert.equal(a.cells[1].memberCss,'ok');
 assert.equal(a.cells[0].chairs,0);assert.equal(a.cells[0].chairCss,'na','BResT has no Chairperson rule');assert.equal(a.cells[0].memberCss,'ok');
 assert.equal(a.untagged,1);assert.equal(a.total,5);assert.equal(a.women,3);assert.equal(a.ok,2);
 assert.equal(b.cells[0].css,'due','BResT not encoded although the 1st BA is');
 assert.equal(b.cells[1].css,'review');assert.match(b.cells[1].reasons.join(' '),/Chairperson/);
 assert.equal(b.cells[1].chairCss,'review');assert.equal(b.cells[1].memberCss,'review','one Member of the two the SFMSC needs');
 assert.equal(b.cells[0].chairCss,'due');assert.equal(b.cells[0].memberCss,'due');
 assert.equal(d.municipal.sfmc.length,1);
 c.esc=v=>String(v??'');c.attr=c.esc;const html=c.profileCvMapHtml(m);
 assert.match(html,/Community Volunteer checklist/);assert.match(html,/data-body="SFMSC" data-position="chair"/);assert.match(html,/data-body="SFMSC" data-position="member"/);
 assert.equal((html.match(/>Chairperson<\/th>/g)||[]).length,2);assert.equal((html.match(/>Member<\/th>/g)||[]).length,2);
 assert.match(html,/data-body="nocommittee"/);assert.match(html,/SFMC \(Municipal\)/);
 c.profileCvFilters().show='due';assert.deepEqual(plain(c.profileCvLines(d,c.profileCvFilters()).map(l=>l.name)),['Village B']);
 c.profileCvFilters().show='';
 const rows=c.profileCvExportRows(m);
 assert.deepEqual(plain(rows[0]),['Province','Municipality','Barangay','BResT status','BResT Chairperson','BResT Member','SFMSC status','SFMSC Chairperson','SFMSC Member','No committee','Total CVs','Women','Committees meeting the rules']);
 assert.deepEqual(plain(rows[1].slice(3,9)),['Encoded',0,1,'Encoded',1,2]);assert.match(rows[2][6],/^Needs fixing: /);assert.deepEqual(plain(rows[2].slice(7,9)),[0,1]);
 const brest=c.profileCvBodies(1)[0];
 assert.equal(c.profileCvRoleCss(brest,{members:3,chairs:1,others:2,memberRole:2,css:'ok'},'chair'),'na','SM1 paras 19-22: an encoded BResT Chairperson is not credited');
 assert.match(c.profileCvRuleText(brest,'chair'),/no Chairperson required, SM1 paras 19/);
 const s2b=c.profileCvBodies(2);
 assert.deepEqual(plain(s2b.filter(x=>x.minMembers!==3).map(x=>x.id)),['BOOKKEEPER'],'SM1 para. 43: the CSPMC and each sub-committee have at least three CVs');
 const ppsc=s2b.find(x=>x.id==='PPSC');
 assert.equal(c.profileCvRoleCss(ppsc,{members:2,chairs:1,others:1,memberRole:1,css:'review'},'member'),'review');
 assert.equal(c.profileCvRoleCss(ppsc,{members:3,chairs:1,others:2,memberRole:2,css:'ok'},'member'),'ok');
 const s2=c.profileCvData(m,2);assert.ok(s2.bodies.some(x=>x.id==='CMSC'&&x.minMembers===3));assert.equal(s2.lines[0].cells.every(x=>x.css!=='ok'),true);assert.equal(s2.lines[0].total,0,'Stage 1 volunteers are not Stage 2 CVs');
});
test('Community Volunteer checklist reads as not assessed before the Volunteer List is imported',()=>{
 const c=context(),m=load(c);c.esc=v=>String(v??'');c.attr=c.esc;
 const d=c.profileCvData(m,1);assert.equal(d.loaded,false);assert.equal(d.lines[0].cells[0].css,'none');
 assert.match(c.profileCvMapHtml(m),/Import the Community Volunteer List/);
 c.PROFILE_STATE.municipality=m.key;c.PROFILE_STATE.home='cvmap';c.profileCvFilters().sort='least';c.profilePersist();
 c.PROFILE_STATE.filters={};c.PROFILE_STATE.home='sequence';c.PROFILE_RESTORED=false;c.profileRestore();
 assert.equal(c.PROFILE_STATE.home,'cvmap');assert.equal(c.profileCvFilters().sort,'least');
});
