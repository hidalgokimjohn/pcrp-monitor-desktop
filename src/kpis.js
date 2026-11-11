// Official PCRP KPIs only: SM7 section 2.4, Results Matrix and Indicator Documentation.
var KPI_UI = { scope: '', stage: 1, section: 'households' };
var KPI_RESTORED = false;
var KPI_SECTIONS = { households: 'Household participation', mrest: 'MResT institutionalization' };
function kpiSection(section) { return section === 'mrest' || section === 'volunteers' ? 'mrest' : 'households'; }
function kpiScope() {
  if (isMunicipalUser()) return homeKey() ? 'm:' + homeKey() : 'unassigned';
  var scope = KPI_UI.scope || '', munis = baselineMunis();
  if (!scope || munis.some(function (m) { return scope === 'm:' + m.province + '|' + m.municipality || scope === 'p:' + m.province; })) return scope;
  return '';
}
function kpiInScope(p, scope) {
  if (!scope) return true;
  if (scope.indexOf('m:') === 0) return p.province + '|' + p.municipality === scope.slice(2);
  if (scope.indexOf('p:') === 0) return p.province === scope.slice(2);
  return false;
}
function kpiRestore() {
  if (KPI_RESTORED) return;
  KPI_RESTORED = true;
  var saved = prefs().kpiDashboard || {};
  ['scope', 'section'].forEach(function (k) { if (typeof saved[k] === 'string') KPI_UI[k] = saved[k]; });
  KPI_UI.stage = saved.stage === 2 ? 2 : 1;
  KPI_UI.section = kpiSection(KPI_UI.section);
}
function kpiPersist() { var p = prefs(); p.kpiDashboard = Object.assign({}, KPI_UI); savePrefs(p); }
function openKpiPage(section, municipality, scope) {
  kpiRestore();
  KPI_UI.section = kpiSection(section);
  if (scope !== undefined) KPI_UI.scope = scope;
  else if (municipality !== undefined) KPI_UI.scope = municipality ? 'm:' + municipality : '';
  KPI_UI.stage = typeof PROFILE_STATE !== 'undefined' && PROFILE_STATE.stage === 2 ? 2 : 1;
  KPI_UI.scope = kpiScope(); kpiPersist(); go('kpis');
}
function kpiPageLink(section, municipality) {
  if (['activities', 'households', 'mrest'].indexOf(section) === -1) return '';
  return '<div class="kpi-page-link"><button type="button" class="link" data-act="kpi-context" data-section="' + attr(section) + '" data-scope="' + attr(municipality ? 'm:' + municipality : '') + '">View PCRP KPIs →</button></div>';
}
function kpiCollect(scope, stage) {
  scope = isMunicipalUser() ? (homeKey() ? 'm:' + homeKey() : 'unassigned') : scope || '';
  stage = stage === 2 ? 2 : 1;
  var models = baselineMunis().filter(function (m) { return kpiInScope(m, scope); }).map(function (m) { return profileModel(m.province + '|' + m.municipality); }).filter(Boolean);
  var tracker = !!LOADED.activityTracker && STATE.computed;
  var cards = profileQuorumCodes(stage).map(function (code) {
    var q = models.reduce(function (t, m) {
      var a = profileQuorum(m, code);
      ['listed', 'present', 'reporting', 'barangays'].forEach(function (k) { t[k] += a[k]; });
      return t;
    }, { listed: 0, present: 0, reporting: 0, barangays: 0 });
    // Do not report a partial denominator as the whole area's official KPI.
    var complete = tracker && q.listed > 0 && q.reporting === q.barangays;
    return { id: 'quorum-' + code, label: 'Household participation in barangay assemblies · ' + code,
      value: complete ? pctText(q.present / q.listed) : null,
      detail: tracker ? q.present + '/' + q.listed + ' reported households · ' + q.reporting + '/' + q.barangays + ' barangays reporting · 70% target' + (complete ? '' : ' · Complete household counts required') : 'Import Activity Tracker with household counts',
      source: 'SM7 §2.4, p. 27; Results Matrix, p. 56; Indicator Documentation, p. 68' };
  });
  return { scope: scope, stage: stage, models: models, groups: [
    { id: 'households', label: 'Household participation in barangay assemblies for community resilience planning', target: 'profile', cards: cards },
    { id: 'mrest', label: 'Institutional support for local resilience', target: 'mrest', cards: [
      { id: 'mrestInstitutionalized', label: 'Municipalities with institutionalized Municipal Resilience Teams', value: null,
        detail: 'Requires Municipal Council resolutions and LDC meeting records confirming MResTs as regular Local Development Council members. Current imports do not capture this evidence.',
        source: 'SM7 §2.4, p. 27; Results Matrix, p. 59; Indicator Documentation, p. 79' }
    ] }
  ] };
}
function kpiVisibleGroups(data, section) {
  return data.groups.filter(function (g) { return g.id === kpiSection(section); });
}
function kpiExportRows(data, section) {
  var rows = [['Area', 'Stage / form scope', 'Section', 'Indicator', 'Value', 'Details', 'Manual reference']];
  kpiVisibleGroups(data, section).forEach(function (g) {
    g.cards.forEach(function (c) { rows.push([data.scope || 'Whole region', g.id === 'households' ? data.stage : 'All stages', g.label, c.label, c.value === null ? 'Not assessed' : c.value, c.detail, c.source]); });
  });
  return rows;
}
function kpiOpenTarget(target) {
  var scope = kpiScope(), key = scope.indexOf('m:') === 0 ? scope.slice(2) : '';
  if (scope.indexOf('p:') === 0) {
    PROFILE_STATE.municipality = ''; PROFILE_STATE.stage = KPI_UI.stage; PROFILE_DIR.search = scope.slice(2);
    profilePersist(); go('profile'); return;
  }
  if (target === 'profile') {
    STATE.stage = KPI_UI.stage; PROFILE_STATE.stage = KPI_UI.stage;
    if (key) openMunicipalityProfile(key); else { PROFILE_STATE.municipality = ''; profilePersist(); go('profile'); }
  } else if (target === 'mrest') { MRT_STATE.muni = key; MRT_STATE.brgy = ''; MRT_STATE.search = ''; go('mrest'); }
}
function renderKpis() {
  var body = $('kpi-body'); if (!body) return;
  kpiRestore(); KPI_UI.scope = kpiScope();
  KPI_UI.stage = STATE.stage === 2 ? 2 : 1;   // the header's global stage switch
  KPI_UI.section = kpiSection(KPI_UI.section);
  if (KPI_UI.scope === 'unassigned') { body.innerHTML = '<div class="msg info">Choose your municipality in Settings &amp; Setup to view its KPIs.</div>'; return; }
  var scope = KPI_UI.scope, muniOptions = movOption('', 'Whole region', !scope), province = '';
  baselineMunis().forEach(function (m) {
    if (province !== m.province) { if (province) muniOptions += '</optgroup>'; province = m.province; muniOptions += '<optgroup label="' + attr(province) + '">' + movOption('p:' + province, 'All of ' + province, scope === 'p:' + province); }
    var key = 'm:' + m.province + '|' + m.municipality; muniOptions += movOption(key, m.municipality, scope === key);
  });
  if (province) muniOptions += '</optgroup>';
  var area = isMunicipalUser() ? '<span class="pill idle">' + esc(homeLabel()) + ' · assigned scope</span>' : '<label class="field"><span>Area</span><select data-act="kpi-scope">' + muniOptions + '</select></label>';
  var data = kpiCollect(scope, KPI_UI.stage);
  body.innerHTML = '<div class="page-banner"><div><span class="eyebrow">Performance monitoring</span><h1>KPI</h1><p class="muted">PCRP indicators retained from the SM7 Monitoring and Evaluation manual. Each indicator includes its manual reference.</p></div><button class="btn ghost" data-act="kpi-export">Export this section</button></div>' +
    '<div class="kpi-controls">' + area +
    '<span class="tiny muted">Pull date: ' + esc(prefs().evalDate || today()) + '</span></div><p class="tiny muted">The Stage switch in the header selects the household participation breakdown by assembly. MResT institutionalization applies across stages. These assembly rates are not a cumulative annual result.</p>' +
    '<nav class="kpi-section-tabs" aria-label="KPI sections">' + Object.keys(KPI_SECTIONS).map(function (k) { return '<button type="button" class="btn ghost" data-act="kpi-section" data-v="' + k + '" aria-pressed="' + (KPI_UI.section === k) + '">' + esc(KPI_SECTIONS[k]) + '</button>'; }).join('') + '</nav>' +
    kpiVisibleGroups(data, KPI_UI.section).map(function (g) {
      var content = '<div class="kpi-group-heading"><h2>' + esc(g.label) + '</h2><button class="btn ghost btn-sm" data-act="kpi-target" data-v="' + g.target + '">' + (scope.indexOf('p:') === 0 ? 'Choose municipality →' : 'Open monitoring →') + '</button></div><div class="grid-kpi kpi-dashboard-grid">' + g.cards.map(function (c) {
        return '<article class="kpi kpi-dashboard-card' + (c.value === null ? ' is-unassessed' : '') + '" data-metric="' + c.id + '"><h3 class="kpi-label">' + esc(c.label) + '</h3><div class="kpi-value">' + (c.value === null ? 'Not assessed' : esc(typeof c.value === 'number' ? n(c.value) : c.value)) + '</div><p class="kpi-sub">' + esc(c.detail) + '</p><p class="tiny muted">' + esc(c.source) + '</p></article>';
      }).join('') + '</div>';
      return '<section class="kpi-group">' + content + '</section>';
    }).join('');
  kpiPersist(); refreshIcons(body);
}
document.addEventListener('click', function (event) {
  var el = event.target.closest('[data-act]'); if (!el) return;
  var action = el.getAttribute('data-act'), value = el.getAttribute('data-v');
  if (action === 'kpi-context') openKpiPage(el.getAttribute('data-section'), undefined, el.getAttribute('data-scope') || '');
  else if (action === 'kpi-section') { KPI_UI.section = value; kpiPersist(); renderKpis(); }
  else if (action === 'kpi-target') kpiOpenTarget(value);
  else if (action === 'kpi-export') downloadCsv('PCRP_KPI_' + KPI_UI.section + '_' + stamp() + '.csv', csvOf(kpiExportRows(kpiCollect(kpiScope(), KPI_UI.stage), KPI_UI.section)));
});
document.addEventListener('change', function (event) {
  var action = event.target.getAttribute('data-act');
  if (action === 'kpi-scope') KPI_UI.scope = event.target.value;
  else return;
  kpiPersist(); renderKpis();
});
