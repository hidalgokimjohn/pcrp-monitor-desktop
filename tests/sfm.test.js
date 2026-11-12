const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
const HEAD=['Reference ID','Date of Intake','Region','Province','City / Municipality','Barangay','Intake Level','Mode of Filing','GRS Form','Feedback','Type of Sender','Complainant','Sex','IP','IP Group','Designation','Nature of Issue','EODB Classification','Subject of Complaint','Category of Concern','SP Red Flag','Narrative Summary','Resolution','Intake Officer','Status','Date Addressed','Resolution Duration (days)','Encoded By','Date Encoded'];
function context(){
 const c={console,TextDecoder,TextEncoder,Blob,Response,Date,DataView,Uint8Array,ArrayBuffer,setTimeout,clearTimeout,
  document:{addEventListener(){}},navigator:{},STATE:{computed:false,stage:1,page:'sfm'},S:{overview:null},LOADED:{},IMPORT_ERRORS:[],
  preferences:{},prefs:()=>c.preferences,savePrefs:p=>{c.preferences=p;},today:()=> '2026-11-12',
  isMunicipalUser:()=>c.preferences.role==='pea_mdm',homeKey:()=>c.preferences.homeKey||'',homeLabel:()=>c.preferences.homeKey||'Region',
  $:()=>null,toast(){},go:p=>{c.STATE.page=p;},
  n:v=>v==null?'—':Number(v).toLocaleString('en-US'),normSearch:v=>String(v||'').trim().toLowerCase(),
  esc:s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')};
 c.attr=c.esc;c.icon=()=>'';c.refreshIcons=()=>{};c.movOption=(v,t,s)=>'<option value="'+c.esc(v)+'"'+(s?' selected':'')+'>'+c.esc(t)+'</option>';
 c.baselineMunis=()=>[{province:'Province A',municipality:'Town One',barangays:2},{province:'Province A',municipality:'Town Two',barangays:1},{province:'Province B',municipality:'Quiet Town',barangays:1}];
 c.window=c;vm.createContext(c);
 ['vendor/monitor/Code.js','src/runtime.js','src/sfm.js'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c,{filename:f}));
 return c;
}
let seq=0;
function entry(changes={}){
 const v={'Reference ID':String(++seq).padStart(6,'0'),'Date of Intake':'2026-07-06','Region':'Region','Province':'Province A','City / Municipality':'Town One','Barangay':'Village A','Mode of Filing':'BA','GRS Form':'Grievance',
  'Feedback':'Satisfied','Type of Sender':'Individual','Complainant':'Ana Reyes Cruz','Sex':'female','IP':'No','Designation':'Community members','Nature of Issue':'Type A','EODB Classification':'Simple',
  'Subject of Complaint':'DSWD Staff','Category of Concern':'Community Participation','SP Red Flag':'No','Narrative Summary':'Question number '+seq,'Resolution':'Answered by the facilitator during the assembly.',
  'Intake Officer':'Maria Santos Lopez','Status':'Resolved','Date Addressed':'2026-07-06','Resolution Duration (days)':0,'Encoded By':'pea@example.test','Date Encoded':'2026-07-10 09:00:00',...changes};
 return HEAD.map(h=>v[h]??'');
}
function build(c,rows,opts={}){return c.sfmBuild({headers:HEAD.slice(),rows},{munis:c.baselineMunis(),today:'2026-11-12',...opts});}
const flagsOf=(d,ref)=>Array.from(d.entries.find(e=>e.ref===ref).flags);
const check=(d,id)=>d.checks.find(x=>x.id===id);

test('the SFM Masterlist is recognised from its headers and needs only its core columns',()=>{
 const c=context();
 assert.equal(c.detectKind(HEAD,''),'sfm');
 assert.equal(c.detectKind(['Reference ID','Date of Intake','City / Municipality','Nature of Issue','Status'],''),'sfm');
 assert.equal(c.detectKind(['Province','Municipality','Barangay'],''),'baseline');
 assert.equal(c.KIND_INFO.sfm.sheet,'Raw_SFM');
 assert.doesNotThrow(()=>c.sfmValidateTable({headers:HEAD.slice(),rows:[entry()]}));
 assert.throws(()=>c.sfmValidateTable({headers:['Reference ID','Status'],rows:[]}),/Date of Intake/);
});

test('dates: ISO text, Excel serials and US dates are read; placeholders and junk are not',()=>{
 const c=context();
 assert.equal(c.sfmDate('2026-07-12'),'2026-07-12');
 assert.equal(c.sfmDate('2026-11-09 11:07:02'),'2026-11-09');
 assert.equal(c.sfmDate(46215),'2026-07-12');
 assert.equal(c.sfmDate('7/12/2026'),'2026-07-12');
 assert.equal(c.sfmDate('1970-01-01'),'');
 assert.equal(c.sfmDate(''),'');assert.equal(c.sfmDate('soon'),'');
 // Monday 6 July to Monday 13 July 2026 is five working days; a weekend adds none.
 assert.equal(c.sfmWorkdays('2026-07-06','2026-07-13'),5);
 assert.equal(c.sfmWorkdays('2026-07-10','2026-07-12'),0);
 assert.equal(c.sfmWorkdays('2026-07-06','2026-07-06'),0);
});

test('an open entry is judged against its own EODB classification, as of the latest encoding date in the file',()=>{
 const c=context();seq=0;
 const d=build(c,[
  entry({'Status':'Pending','Resolution':'','Date Addressed':'','Date of Intake':'2026-07-07','Date Encoded':'2026-07-20 08:00:00'}),          // 9 working days, Simple allows 3
  entry({'Status':'Pending','Resolution':'','Date Addressed':'','Date of Intake':'2026-07-07','EODB Classification':'Highly Technical'}),      // 9 of 20
  entry({'Status':'Pending','Date Addressed':'','Date of Intake':'2026-07-17','Date Encoded':'2026-07-18'}),                                                            // answered, never closed
  entry()]);
 assert.equal(d.asOf,'2026-07-20');
 assert.deepEqual(flagsOf(d,'000001'),['overdue']);
 assert.equal(d.entries[0].age,9);
 assert.deepEqual(flagsOf(d,'000002'),['open']);
 assert.deepEqual(flagsOf(d,'000003'),['open','open_answered']);
 assert.deepEqual(flagsOf(d,'000004'),[]);
 assert.equal(d.summary.open,3);assert.equal(d.summary.overdue,1);assert.equal(d.summary.resolved,1);assert.equal(d.summary.oldestOpen,9);
 assert.equal(d.entries[0].sev,'act');assert.equal(d.entries[3].sev,'');
});

test('record gaps on resolved entries are each reported once, with the municipalities that carry most of them',()=>{
 const c=context();seq=0;
 const d=build(c,[
  entry({'Date Addressed':''}),
  entry({'Date Addressed':'1970-01-01','City / Municipality':'Town Two'}),
  entry({'Date Addressed':'2026-07-01'}),                       // before the intake date
  entry({'Resolution':'None.'}),entry({'Resolution':'N/A'}),
  entry({'Feedback':''}),entry({'Category of Concern':''}),entry({'Sex':''}),entry({'Sex':'','Type of Sender':'Group'}),
  entry({'GRS Form':''}),entry({'IP':'Yes'}),entry({'IP':'Yes','IP Group':'Manobo'}),
  entry({'Province':'','City / Municipality':''}),
  entry({'Barangay':''}),entry({'Barangay':'','Intake Level':'Municipal'}),
  entry({'Date of Intake':'2026-08-01','Date Addressed':'2026-08-01'}),                     // received after it was encoded
  entry({'Date Addressed':'2026-07-20'})]);                     // 10 working days for a Simple entry
 const one=(ref,id)=>assert.deepEqual(flagsOf(d,ref),[id],ref);
 one('000001','no_date');one('000002','bad_date');one('000003','bad_date');one('000004','no_resolution');one('000005','no_resolution');
 one('000006','no_feedback');one('000007','no_category');one('000008','no_sender');assert.deepEqual(flagsOf(d,'000009'),[]);
 one('000010','no_form');one('000011','ip_group');assert.deepEqual(flagsOf(d,'000012'),[]);
 one('000013','no_place');one('000014','no_level');assert.deepEqual(flagsOf(d,'000015'),[]);
 one('000016','bad_intake');one('000017','late_resolved');
 assert.equal(check(d,'bad_date').count,2);
 assert.deepEqual(Array.from(check(d,'bad_date').top,t=>t.join(':')),['Town One:1','Town Two:1']);
 assert.equal(d.summary.toFix,13);assert.equal(d.summary.open,0);
 assert.equal(d.entries.find(e=>e.ref==='000017').days,10);
});

test('entries worth a second look: Type B/C, possible duplicates, sender recorded as intake officer, places off the monitored list',()=>{
 const c=context();seq=0;
 const d=build(c,[
  entry({'Nature of Issue':'Type B'}),entry({'Nature of Issue':'Type C','SP Red Flag':'Yes'}),
  entry({'Narrative Summary':'Pila ang grant?','Complainant':'Hermes Sotelliza'}),entry({'Narrative Summary':'pila ang GRANT ?','Complainant':'Hernes Sotelliza'}),
  entry({'Narrative Summary':'Pila ang grant?','Barangay':'Village B'}),
  entry({'Complainant':'RICHARD CASEÑAS LAUD','Intake Officer':'Richard C. Laud'}),
  entry({'City / Municipality':'Elsewhere'}),
  entry({'Province':'','City / Municipality':'town two','Barangay':'Village C'})]);
 assert.deepEqual(flagsOf(d,'000001'),['type_bc']);
 assert.deepEqual(flagsOf(d,'000002'),['redflag','type_bc']);
 assert.deepEqual(flagsOf(d,'000003'),['duplicate']);assert.deepEqual(Array.from(d.entries[2].dup),['000004']);
 assert.deepEqual(flagsOf(d,'000004'),['duplicate']);assert.deepEqual(flagsOf(d,'000005'),[]);
 assert.deepEqual(flagsOf(d,'000006'),['self']);
 assert.deepEqual(flagsOf(d,'000007'),['off_list']);
 // A unique municipality name is matched even without its province, but the missing province is still a gap.
 assert.equal(d.entries[7].key,'Province A|Town Two');assert.deepEqual(flagsOf(d,'000008'),['no_place']);
 assert.equal(d.summary.typeB,1);assert.equal(d.summary.typeC,1);
 assert.deepEqual(Array.from(d.summary.silent),['Quiet Town']);assert.equal(d.summary.municipalities,2);assert.equal(d.summary.monitored,3);
});

test('a check whose column is absent from the export is skipped, not reported for every entry',()=>{
 const c=context();seq=0;
 const core=['Reference ID','Date of Intake','City / Municipality','Nature of Issue','Status'];
 const d=c.sfmBuild({headers:core,rows:[['1','2026-07-06','Town Two','Type A','Resolved'],['2','2026-07-06','Town Two','Type A','Pending']]},{munis:c.baselineMunis()});
 assert.deepEqual(flagsOf(d,'1'),[]);assert.deepEqual(flagsOf(d,'2'),['open']);
 assert.equal(d.asOf,'2026-07-06');
 assert.equal(d.summary.rated,0);assert.equal(d.summary.medianLag,null);
});

test('satisfaction, encoding lag and the per-municipality table are counted from the entries',()=>{
 const c=context();seq=0;
 const d=build(c,[entry(),entry({'Feedback':'Very Satisfied','Date Encoded':'2026-07-26'}),entry({'Feedback':'No Comment','City / Municipality':'Town Two','Date Encoded':'2026-09-04'}),entry({'Feedback':''})]);
 assert.equal(d.summary.rated,3);assert.equal(d.summary.satisfied,2);
 assert.equal(d.summary.medianLag,12);                        // lags 4, 20, 60, 4
 const groups=c.sfmGroups(d,'municipality');
 assert.deepEqual(Array.from(groups,g=>g.name+':'+g.n),['Town One:3','Town Two:1','Quiet Town:0']);
 assert.equal(groups[0].fix,1);assert.equal(groups[0].barangayCount,1);assert.equal(groups[1].medianLag,60);
 assert.deepEqual(Array.from(c.sfmTally(d.entries,'feedback'),t=>t.join(':')),['No Comment:1','Satisfied:1','Very Satisfied:1',':1']);
 assert.deepEqual(Array.from(c.sfmTally(d.entries,'month'),t=>t.join(':')),['2026-07:4']);
});

test('a PEA / MDM workspace sees its own municipality only; duplicates are still matched across the whole file',()=>{
 const c=context();seq=0;
 const rows=[entry({'Status':'Pending','Date Addressed':'','Resolution':''}),entry({'City / Municipality':'Town Two','Date Addressed':''}),entry({'City / Municipality':'Town Two'})];
 const d=build(c,rows,{home:'Province A|Town Two'});
 assert.equal(d.all,3);assert.equal(d.entries.length,2);assert.equal(d.summary.open,0);assert.equal(check(d,'no_date').count,1);
 assert.equal(d.summary.monitored,1);assert.deepEqual(Array.from(d.summary.silent),[]);
 assert.deepEqual(Array.from(c.sfmGroups(d,'barangay'),g=>g.name+':'+g.n),['Village A:2']);
 c.TABS.Raw_SFM={headers:HEAD.slice(),rows};c.LOADED.sfm={};
 c.preferences={role:'pea_mdm',homeKey:'Province A|Town Two'};
 assert.equal(c.sfmData().entries.length,2);assert.deepEqual({...c.sfmBadge()},{text:'1 to fix',cls:'warn'});
 c.preferences={};
 assert.equal(c.sfmData().entries.length,3);assert.deepEqual({...c.sfmBadge()},{text:'1 open',cls:'bad'});
});

test('filters, order and the export follow the findings',()=>{
 const c=context();seq=0;
 const d=build(c,[entry({'Date of Intake':'2026-07-01','Date Addressed':'2026-07-01'}),entry({'Status':'Pending','Date Addressed':'','Resolution':''}),entry({'Date Addressed':'','Nature of Issue':'Type B','City / Municipality':'Town Two','Category of Concern':'Financial Management'})]);
 const refs=list=>Array.from(list,e=>e.ref);
 assert.deepEqual(refs(c.sfmFilter(d,{flag:'attention'})),['000002','000003']);
 assert.deepEqual(refs(c.sfmFilter(d,{flag:'fix'})),['000003']);assert.deepEqual(refs(c.sfmFilter(d,{flag:'type_bc'})),['000003']);
 assert.deepEqual(refs(c.sfmFilter(d,{status:'open'})),['000002']);assert.deepEqual(refs(c.sfmFilter(d,{muni:'Province A|Town Two'})),['000003']);
 assert.deepEqual(refs(c.sfmFilter(d,{field:'category',value:'Financial Management'})),['000003']);
 assert.deepEqual(refs(c.sfmFilter(d,{},'question number 1')),['000001']);
 assert.deepEqual(refs(c.sfmSort(d.entries,'flags')),['000002','000003','000001']);
 assert.deepEqual(refs(c.sfmSort(d.entries,'old')),['000001','000002','000003']);
 const sheets=c.sfmExportSheets(d);
 assert.deepEqual(Array.from(sheets,s=>s.name),['Summary','Needs attention','Municipalities','Entries']);
 assert.equal(sheets[1].rows.length,1+d.entries.reduce((t,e)=>t+e.flags.length,0));
 assert.equal(sheets[3].rows.length,4);assert.match(sheets[3].rows[3][17],/Resolved without a Date Addressed; Type B and Type C entries/);
 assert.ok(sheets[0].rows.some(r=>r[0]==='Open'&&r[1]===1));
});

test('the page renders its three views and an empty state without the Activity Tracker',()=>{
 const c=context();seq=0;
 const body={innerHTML:''};c.$=id=>id==='sfm-body'?body:null;
 c.renderSfm();assert.match(body.innerHTML,/No SFM Masterlist loaded/);
 c.TABS.Raw_SFM={headers:HEAD.slice(),rows:[entry({'Status':'Pending','Date Addressed':'','Resolution':''}),entry({'Date Addressed':''}),entry({'City / Municipality':'Town Two'})]};c.LOADED.sfm={rows:3};
 c.renderSfm();
 assert.match(body.innerHTML,/Needs attention/);assert.match(body.innerHTML,/data-act="sfm-flag" data-v="no_date"/);assert.match(body.innerHTML,/Quiet Town/);
 assert.match(body.innerHTML,/Received and encoded, by month/);assert.doesNotMatch(body.innerHTML,/undefined|NaN/);
 c.SFM_UI.view='entries';c.SFM_UI.f.flag='no_date';c.renderSfm();
 assert.match(body.innerHTML,/<b>1<\/b> of 3 entries/);assert.match(body.innerHTML,/No date addressed/);assert.doesNotMatch(body.innerHTML,/undefined|NaN/);
 c.SFM_UI.view='places';c.renderSfm();
 assert.match(body.innerHTML,/No entries in this file/);assert.match(body.innerHTML,/data-act="sfm-place" data-k="muni" data-v="Province A\|Town One"/);assert.doesNotMatch(body.innerHTML,/undefined|NaN/);
});
