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
 ['vendor/monitor/Code.js','src/runtime.js','src/sfm.js','src/sfm-report.js'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c,{filename:f}));
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

test('the place table searches by name or province and sorts by any column, with empty places last',()=>{
 const c=context();seq=0;
 const d=build(c,[entry(),entry(),entry({'Status':'Pending','Date Addressed':'','Resolution':'','Date Encoded':'2026-07-08'}),entry({'City / Municipality':'Town Two','Date of Intake':'2026-07-01','Date Addressed':'2026-07-01','Date Encoded':'2026-09-01'})]);
 const names=ui=>Array.from(c.sfmPlaceRows(d,ui),g=>g.name);
 assert.deepEqual(names({}),['Town One','Town Two','Quiet Town']);                       // province grouping by default
 assert.deepEqual(names({q:'province b'}),['Quiet Town']);assert.deepEqual(names({q:'two'}),['Town Two']);assert.deepEqual(names({q:'zzz'}),[]);
 assert.deepEqual(names({sort:'n',dir:-1}),['Town One','Town Two','Quiet Town']);
 assert.deepEqual(names({sort:'n',dir:1}),['Town Two','Town One','Quiet Town']);          // a place with no entries stays last
 assert.deepEqual(names({sort:'medianLag',dir:-1}),['Town Two','Town One','Quiet Town']);
 assert.deepEqual(names({sort:'latest',dir:1}),['Town Two','Town One','Quiet Town']);
 assert.deepEqual(names({sort:'name',dir:-1}),['Town Two','Town One','Quiet Town']);
 const body={innerHTML:''};c.$=id=>id==='sfm-body'?body:null;
 c.TABS.Raw_SFM={headers:HEAD.slice(),rows:[entry(),entry({'City / Municipality':'Town Two'})]};c.LOADED.sfm={rows:2};
 c.SFM_UI.view='places';c.renderSfm();
 assert.match(body.innerHTML,/id="sfm-place-search"/);assert.match(body.innerHTML,/class="sfm-prov"/);assert.match(body.innerHTML,/data-act="sfm-place-sort" data-v="open"/);
 assert.match(body.innerHTML,/<b>3<\/b> of 3 municipalities/);
 c.SFM_UI.places={q:'one',sort:'n',dir:-1};c.renderSfm();
 assert.doesNotMatch(body.innerHTML,/class="sfm-prov"/);assert.match(body.innerHTML,/aria-sort="descending"/);assert.match(body.innerHTML,/Total shown/);
 assert.match(body.innerHTML,/sorted by entries, highest first/);assert.match(body.innerHTML,/Group by province/);assert.doesNotMatch(body.innerHTML,/undefined|NaN/);
});

test('a province and a period by date of intake narrow the entries and the monitored list',()=>{
 const c=context();seq=0;
 const rows=[entry({'Date of Intake':'2026-06-30','Date Addressed':'2026-06-30'}),entry(),entry({'Date of Intake':'2026-08-03','Date Addressed':'2026-08-03','Date Encoded':'2026-08-10'}),entry({'Date of Intake':''})];
 const july=build(c,rows,{from:'2026-07-01',to:'2026-07-31'});
 assert.deepEqual(Array.from(july.entries,e=>e.ref),['000002']);assert.equal(july.asOf,'2026-08-10');assert.equal(july.from,'2026-07-01');
 assert.equal(build(c,rows,{from:'2026-07-01'}).entries.length,2);assert.equal(build(c,rows,{}).entries.length,4);
 const b=build(c,rows,{province:'Province B'});
 assert.equal(b.entries.length,0);assert.equal(b.summary.monitored,1);assert.deepEqual(Array.from(b.summary.silent),['Quiet Town']);
});

test('numbers are spelled out with the figure in parentheses',()=>{
 const c=context();
 assert.equal(c.sfmWords(0),'zero');assert.equal(c.sfmWords(12),'twelve');assert.equal(c.sfmWords(70),'seventy');assert.equal(c.sfmWords(401),'four hundred one');
 assert.equal(c.sfmWords(1581),'one thousand five hundred eighty-one');assert.equal(c.sfmWords(20000),'twenty thousand');assert.equal(c.sfmWords(1000000),'one million');
 assert.equal(c.sfmNum(1581),'one thousand five hundred eighty-one (1,581)');
 assert.equal(c.sfmCount(1,'entry','entries'),'one (1) entry');assert.equal(c.sfmLongDate('2026-11-12'),'12 November 2026');
 assert.equal(c.sfmList(['A','B','C']),'A, B and C');assert.equal(c.sfmList(['A']),'A');
});

test('the memorandum states the same figures as the page, withholds names, and reads the same as HTML, text and Word',()=>{
 const c=context();seq=0;
 const d=build(c,[entry({'Status':'Pending','Date Addressed':'','Resolution':'','Date Encoded':'2026-07-20'}),entry({'Date Addressed':''}),entry({'Nature of Issue':'Type B','City / Municipality':'Town Two','Feedback':''}),entry({'Sex':'male'})]);
 const m=c.sfmReportModel(d,{memoFor:'The Regional Director',sender:'The RPMO',name:'Juan Dela Cruz',position:'Project Evaluation Officer',date:'2026-11-12',source:'masterlist.xlsx'});
 assert.deepEqual(Array.from(m.sections,s=>s.title),['PURPOSE','STATUS OF ENTRIES','NATURE OF THE FEEDBACK','STATUS PER MUNICIPALITY','COMPLETENESS OF THE RECORDS','ENTRIES REQUIRING ACTION','RECOMMENDATIONS','BASIS OF THE FIGURES']);
 assert.deepEqual(Array.from(m.sections,s=>s.no),[1,2,3,4,5,6,7,8]);
 assert.deepEqual(Array.from(m.address,r=>r[0]),['FOR','FROM','SUBJECT','DATE']);                 // THRU is left out when blank
 assert.match(m.address[2][1],/^STATUS OF THE STAKEHOLDERS FEEDBACK MECHANISM \(SFM\) ENTRIES, CARAGA REGION, 6 JULY 2026$/);
 const text=c.sfmReportText(m),html=c.sfmReportHtml(m),word=c.sfmReportWord(m);
 assert.match(text,/A total of four \(4\) entries were encoded, coming from two \(2\) of the three \(3\) monitored municipalities\./);
 assert.match(text,/Three \(3\) entries, or 75 percent, are marked Resolved, while one \(1\) remains open\. Of the open entries, one \(1\) has exceeded/);
 assert.match(text,/three \(3\) are Type A, one \(1\) Type B and zero \(0\) Type C/);
 assert.match(text,/Of the three \(3\) entries that carry a feedback rating, three \(3\), or 100 percent, were rated Satisfied or Very Satisfied\. One \(1\) entry carries no rating/);
 assert.match(text,/One \(1\) monitored municipality has no entry in the KCIS for this coverage: Quiet Town\./);
 assert.match(text,/Resolved without a Date Addressed: one \(1\) entry \(in Town One\)/);
 assert.match(text,/That the one \(1\) open entry be acted upon, and its status/);
 assert.match(text,/That the Area Coordinating Team of Quiet Town confirm whether feedback was received/);
 assert.match(text,/Town One, Province A\t3\t1\t0\t1\t1\t/);assert.match(text,/Quiet Town, Province B\tNo entry/);assert.match(text,/Total\t4\t1\t1\t1\t2\t/);
 assert.match(text,/000001\tTown One\tVillage A\t6 July 2026\tSimple\t10/);assert.match(text,/000003\tTown Two\tType B\tCommunity Participation\tResolved\t6 July 2026/);
 assert.match(text,/\(masterlist\.xlsx\), as of 20 July 2026/);assert.match(text,/Juan Dela Cruz\nProject Evaluation Officer$/);
 for(const out of [text,html,word]) assert.doesNotMatch(out,/Ana Reyes Cruz|Maria Santos Lopez|undefined|NaN/);                    // no sender or officer names
 const plain=s=>s.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/\s+/g,' ');
 for(const sentence of ['A total of four (4) entries were encoded','One (1) monitored municipality has no entry','In view of the foregoing, the following are respectfully recommended:','For the information, consideration and appropriate action of Management.'])
  for(const out of [text.replace(/\s+/g,' '),plain(html),plain(word)]) assert.ok(out.includes(sentence),sentence);
 assert.match(html,/<h1>MEMORANDUM<\/h1>/);assert.match(html,/<td class="r">3<\/td>/);assert.match(word,/urn:schemas-microsoft-com:office:word/);assert.match(word,/@page\{size:8\.5in 11in/);
});

test('report sections can be left out, an empty coverage says so, and a municipal memorandum goes by barangay',()=>{
 const c=context();seq=0;
 const rows=[entry(),entry({'City / Municipality':'Town Two','Barangay':'Village C'})];
 const lean=c.sfmReportModel(build(c,rows),{sections:{nature:false,places:false,records:false,action:false,recommend:false}});
 assert.deepEqual(Array.from(lean.sections,s=>s.no+' '+s.title),['1 PURPOSE','2 STATUS OF ENTRIES','3 BASIS OF THE FIGURES']);
 assert.match(c.sfmReportText(lean),/All two \(2\) entries are marked Resolved\. No entry is open\./);
 const none=c.sfmReportModel(build(c,rows,{from:'2027-01-01',to:'2027-01-31'}),{});
 assert.deepEqual(Array.from(none.sections,s=>s.title),['PURPOSE','STATUS OF ENTRIES','BASIS OF THE FIGURES']);
 assert.match(c.sfmReportText(none),/No SFM entry falls within the coverage and period of this Memorandum\./);
 assert.match(c.sfmReportText(none),/covering feedback received from 1 January 2027 to 31 January 2027/);
 const town=c.sfmReportModel(build(c,rows,{home:'Province A|Town Two'}),{});
 assert.ok(Array.from(town.sections,s=>s.title).includes('STATUS PER BARANGAY'));assert.equal(town.letterhead[3],'Area Coordinating Team, Town Two, Province A');
 const text=c.sfmReportText(town);assert.match(text,/for the Municipality of Town Two, Province A/);assert.match(text,/A total of one \(1\) entry was encoded\./);assert.match(text,/Village C\t1\t0/);
 assert.doesNotMatch(text,/monitored municipalit/);
});

test('the Report tab narrows its coverage and period, and keeps the address block between sessions',()=>{
 const c=context();seq=0;
 const body={innerHTML:''};c.$=id=>id==='sfm-body'?body:null;
 c.TABS.Raw_SFM={headers:HEAD.slice(),rows:[entry(),entry({'Date of Intake':'2026-08-03','Date Addressed':'2026-08-03','Date Encoded':'2026-08-10','City / Municipality':'Town Two'})]};c.LOADED.sfm={rows:2,file:'list.xlsx'};
 c.SFM_UI.view='report';c.renderSfm();
 assert.match(body.innerHTML,/Report settings/);assert.match(body.innerHTML,/<b>2<\/b> entries covered/);assert.match(body.innerHTML,/<option value="2026-08">August 2026<\/option>/);
 assert.match(body.innerHTML,/data-act="sfm-report-print"/);assert.match(body.innerHTML,/A total of two \(2\) entries were encoded/);
 c.sfmReportSet('period','2026-08');
 assert.equal(c.SFM_UI.report.from,'2026-08-01');assert.equal(c.SFM_UI.report.to,'2026-08-31');
 assert.match(body.innerHTML,/<b>1<\/b> entry covered/);assert.match(body.innerHTML,/covering feedback received from 1 August 2026 to 31 August 2026/);
 c.sfmReportSet('to','2026-08-15');assert.equal(c.SFM_UI.report.period,'custom');
 c.sfmReportSet('period','all');c.sfmReportSet('scope','p:Province B');
 assert.match(body.innerHTML,/<b>0<\/b> entries covered/);assert.match(body.innerHTML,/for the Province of Province B/);
 c.sfmReportSet('memoFor','The Regional Director');c.sfmReportSet('sec:nature',false);
 assert.equal(c.preferences.sfmReport.memoFor,'The Regional Director');assert.equal(c.preferences.sfmReport.sections.nature,false);
 c.SFM_UI.report=null;c.renderSfm();
 assert.match(body.innerHTML,/value="The Regional Director"/);assert.doesNotMatch(body.innerHTML,/NATURE OF THE FEEDBACK|undefined|NaN/);
 // A PEA / MDM workspace cannot widen the coverage beyond its own municipality.
 c.preferences={...c.preferences,role:'pea_mdm',homeKey:'Province A|Town Two'};c.SFM_UI.report=null;c.SFM_UI.report=Object.assign(c.sfmReportState(),{scope:''});
 assert.equal(c.sfmReportData().entries.length,1);c.renderSfm();assert.doesNotMatch(body.innerHTML,/data-k="scope"/);
});
