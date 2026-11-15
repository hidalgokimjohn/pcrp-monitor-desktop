const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
const BA_HEAD=['Region Name','Province Name','City Name','Barangay Name','Name','Activity Title','Is Copy Plan','region_psgc','province_psgc','city_psgc','brgy_psgc','Crip Mc09 Activity Id',
 'Individual Female','Individual Female Pct','Individual Male','Individual Male Pct','Individual Total','Total 4Ps Families Represented','Total 4Ps Hh Represented','Total Hh In Barangay','Total Hh Represented',
 'Total Ip Hh Represented','Total Slp Families Represented','Total Slp Hh Represented','Hh Participation Rate'];
function context(){
 const c={console,TextDecoder,TextEncoder,Blob,Response,Date,DataView,Uint8Array,ArrayBuffer,setTimeout,clearTimeout,
  document:{addEventListener(){}},navigator:{},STATE:{computed:false,stage:1,page:'profile'},S:{overview:null},LOADED:{},IMPORT_ERRORS:[],
  preferences:{},prefs:()=>c.preferences,savePrefs:p=>{c.preferences=p;},today:()=> '2026-11-15'};
 c.window=c;vm.createContext(c);
 ['vendor/monitor/Code.js','vendor/monitor/Store.js','vendor/monitor/WebApp.js','src/runtime.js','src/activity-tracker.js','src/mov-core.js'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c,{filename:f}));
 vm.runInContext(fs.readFileSync(path.join(ROOT,'vendor/monitor/JS_Health.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
 c.TABS.Baseline={headers:['Province','Municipality','Barangay','Monitored','Stage 2 Prioritized'],rows:[['Province A','Town','Village A','Yes','Yes'],['Province A','Town','Village B','Yes','Yes'],['Province A','Town','Village C','Yes','No']]};
 c.TABS.Activities={headers:['Seq','Code','KCIS Name','Label','Level','Households','Field conduct','Stage','Prioritized'],rows:c.DEFAULT_ACTIVITIES.map(a=>[a.seq,a.code,a.name,a.label,a.level,a.households?'Yes':'No',a.field,a.stage,a.prioOnly?'Yes':'No'])};
 return c;
}
const BA2=()=>vm.runInContext("DEFAULT_ACTIVITIES.find(function(a){return a.code==='BA2';}).name",context());
function tracker(c,changes={}){const v={Region:'Region',Province:'Province A','City / Municipality':'Town',Barangay:'Village A',Modality:'PCRP','CRIP/MC09 Activity':'1st BA','Activity Title':'Assembly','Actual Start':'2026-10-01','Actual End':'2026-10-02','Participants - Male':30,'Participants - Female':70,'Participants - Unspecified':0,'Participants - Total':100,
 'BA Participation - Total HH in Barangay':200,'BA Participation - Total HH Represented':90,...changes};return Array.from(c.ACTIVITY_TRACKER_HEADERS,h=>v[h]??'');}
function ba(changes={}){const v={'Region Name':'Region XIII (Caraga)','Province Name':'Province A','City Name':'Town','Barangay Name':'Village A','Name':'1st BA','Activity Title':'1st Barangay Assembly','Is Copy Plan':1,'Crip Mc09 Activity Id':2,
 'Individual Female':120,'Individual Male':80,'Individual Total':200,'Total Hh In Barangay':250,'Total Hh Represented':180,'Total 4Ps Hh Represented':40,'Total Ip Hh Represented':5,'Total Slp Hh Represented':2,'Hh Participation Rate':72,...changes};return BA_HEAD.map(h=>v[h]===undefined?'':v[h]);}
function run(c,trackerRows,baRows){
 c.TABS.Raw_Activity_Tracker={headers:Array.from(c.ACTIVITY_TRACKER_HEADERS),rows:trackerRows};c.LOADED.activityTracker={};
 if(baRows){c.TABS.Raw_BA_Participation={headers:BA_HEAD.slice(),rows:baRows};c.LOADED.baParticipation={};}else{delete c.TABS.Raw_BA_Participation;delete c.LOADED.baParticipation;}
 return c.computeAll('2026-11-15');
}
const act=(s,brgy,code)=>s.barangayRows.find(r=>r.barangay===brgy).activities[code];

test('the BA Household Participation export is recognised by its individual and household columns; the older household export is still refused',()=>{
 const c=context();
 assert.equal(c.detectKind(BA_HEAD,''),'baParticipation');assert.equal(c.KIND_INFO.baParticipation.sheet,'Raw_BA_Participation');
 assert.equal(c.detectKind(['Province Name','City Name','Barangay Name','Name','Total Hh In Barangay','Total Hh Represented'],''),'households');
 assert.equal(c.detectKind(Array.from(c.ACTIVITY_TRACKER_HEADERS),''),'activityTracker');
 assert.doesNotThrow(()=>c.validateBaParticipationTable({headers:BA_HEAD.slice(),rows:[ba()]}));
 assert.throws(()=>c.validateBaParticipationTable({headers:['Province Name','Name'],rows:[]}),/Individual Total/);
});

test('assemblies take attendance and households from the BA export; every other activity keeps the Activity Tracker',()=>{
 const c=context();
 const rows=[tracker(c),tracker(c,{'CRIP/MC09 Activity':'PRVA - Community Profiling','Participants - Male':4,'Participants - Female':6,'Participants - Total':10})];
 let s=run(c,rows);
 assert.equal(act(s,'Village A','BA1').attendees,100);assert.equal(act(s,'Village A','BA1').hhRate,90/200);assert.equal(act(s,'Village A','BA1').attendanceSource,'tracker');
 assert.equal(s.health.householdCounts.source,'tracker');
 s=run(c,rows,[ba()]);
 const a=act(s,'Village A','BA1');
 assert.equal(a.attendees,200);assert.equal(a.status,'Complete');assert.equal(a.attendanceSource,'ba');
 assert.deepEqual({...a.baAttendance},{female:120,male:80,total:200,conflict:false});assert.equal(a.trackerParticipants,100);
 assert.equal(a.hhListed,250);assert.equal(a.hhPresent,180);assert.equal(a.hhRate,180/250);assert.equal(a.hhDetail.hh4Ps,40);
 assert.equal(act(s,'Village A','PROFILE').attendees,10);
 assert.equal(s.health.householdCounts.source,'ba');assert.equal(s.region.ba1Male,80);assert.equal(s.region.ba1Female,120);
 const sum=s.attendanceRows.find(r=>r.act==='BA1');assert.deepEqual({...sum.participants},{male:80,female:120,unspecified:0,total:200});
 assert.equal(s.attendanceRows.find(r=>r.act==='PROFILE').participants.total,10);
});

test('an assembly with tracker participants but no individual counts in the BA summary reads as no attendees and is flagged',()=>{
 const c=context();
 const s=run(c,[tracker(c),tracker(c,{Barangay:'Village B'})],[ba(),ba({'Barangay Name':'Village B','Individual Female':'','Individual Male':'','Individual Total':''})]);
 const b=act(s,'Village B','BA1');
 assert.equal(b.attendees,0);assert.equal(b.status,'No Attendees');assert.equal(b.hhListed,250);
 assert.deepEqual(Array.from(s.health.baAttendanceMissing,r=>r.barangay+':'+r.trackerParticipants),['Village B:100']);
 assert.equal(c.dqaFindings(s.health).filter(f=>f.check==='baindiv').length,1);
 // Encoding still comes from the Activity Tracker: a BA record alone does not make an assembly encoded.
 const c2=context();const s2=run(c2,[tracker(c2)],[ba(),ba({'Barangay Name':'Village B'})]);
 assert.equal(act(s2,'Village B','BA1').status,'Not Encoded');assert.equal(act(s2,'Village B','BA1').attendees,0);
});

test('several BA records for one assembly: copies collapse, the record with the households in use wins, different counts are a conflict',()=>{
 const c=context();
 assert.deepEqual(JSON.parse(JSON.stringify(c.resolveBaAttendance([{total:250,represented:180,detail:{indivFemale:120,indivMale:80,indivTotal:200}},{total:250,represented:180,detail:{indivFemale:'120',indivMale:'80',indivTotal:'200'}},{total:null,represented:null,detail:{}}],{total:250,represented:180}))),
  {female:120,male:80,total:200,records:3,conflict:false,variants:[{female:120,male:80,total:200}]});
 const r=c.resolveBaAttendance([{total:300,represented:100,detail:{indivFemale:200,indivMale:200,indivTotal:400}},{total:250,represented:180,detail:{indivFemale:120,indivMale:80,indivTotal:200}}],{total:250,represented:180});
 assert.equal(r.total,200);assert.equal(r.conflict,true);
 assert.equal(c.resolveBaAttendance([{detail:{indivFemale:5,indivMale:4,indivTotal:''}}],null).total,9);
 assert.equal(c.resolveBaAttendance([{detail:{}}],null).total,null);
 const s=run(c,[tracker(c)],[ba(),ba({'Individual Female':10,'Individual Male':10,'Individual Total':20,'Total Hh In Barangay':'','Total Hh Represented':''})]);
 assert.equal(act(s,'Village A','BA1').attendees,200);
 assert.ok(s.health.householdFlags.some(f=>f.kind==='Conflicting records'&&/individual counts/.test(f.issue)));
});

test('the BA export is read by its activity name: PRVA rows and activity id 0 never become assemblies; the 2nd BA follows prioritization',()=>{
 const c=context(),name2=BA2();
 const s=run(c,[tracker(c),tracker(c,{'CRIP/MC09 Activity':name2}),tracker(c,{'CRIP/MC09 Activity':'PRVA - Community Profiling'})],
  [ba(),ba({'Name':'PRVA - Community Profiling','Activity Title':'Barangay Assembly profiling','Individual Total':999}),ba({'Name':'1st BA','Crip Mc09 Activity Id':0,'Barangay Name':'Village B'}),
   ba({'Name':name2,'Individual Female':30,'Individual Male':20,'Individual Total':50,'Total Hh In Barangay':100,'Total Hh Represented':75})]);
 assert.equal(act(s,'Village A','PROFILE').attendees,100);
 assert.equal(act(s,'Village B','BA1').hhListed,0);
 assert.equal(act(s,'Village A','BA2').attendees,50);assert.equal(act(s,'Village A','BA2').hhRate,0.75);
 assert.equal(act(s,'Village C','BA2').notApplicable,true);
});

test('the DQA page lists the missing BA attendance and names the BA export in its steps',()=>{
 const c=context();
 const s=run(c,[tracker(c),tracker(c,{Barangay:'Village B'})],[ba(),ba({'Barangay Name':'Village B','Individual Total':'','Individual Female':'','Individual Male':''})]);
 c.esc=v=>String(v??'');c.n=v=>String(v);c.dhFindingLink=(id,r,text)=>text;
 const checks=c.dhChecks({health:s.health,region:s.region,municipalRows:s.municipalRows,barangayRows:s.barangayRows});
 const miss=checks.find(x=>x.id==='baindiv');
 assert.ok(miss);assert.equal(miss.total,1);assert.match(miss.steps.join(' '),/BA Household Participation export/);
 assert.match(checks.find(x=>x.id==='hhcounts').steps.join(' '),/BA Household Participation export/);
 const s2=run(c,[tracker(c)]);
 const old=c.dhChecks({health:s2.health,region:s2.region,municipalRows:s2.municipalRows,barangayRows:s2.barangayRows});
 assert.equal(old.find(x=>x.id==='baindiv'),undefined);assert.match(old.find(x=>x.id==='hhcounts').steps.join(' '),/Activity Tracker/);
});
