var MOV_UI = { municipality: '', requirement: '' };
var MOV_CACHE = null;

function movGetData() {
  if (STATE.computed && SNAP && SNAP.movs) return SNAP.movs;
  if (MOV_CACHE && MOV_CACHE.table === TABS.Raw_MOVs && MOV_CACHE.baseline === TABS.Baseline) return MOV_CACHE.data;
  var bl = readBaseline(), base = buildBaseline(bl.rows, bl.monitored), index = buildActivityIndex(readActivities());
  var data = movBuild(base, index, {}, TABS.Raw_MOVs || null, prefs().evalDate || today(), false);
  MOV_CACHE = { table: TABS.Raw_MOVs, baseline: TABS.Baseline, data: data };
  return data;
}
function movInScope(row) { return pScopeTest(isMunicipalUser() ? homeKey() : MOV_UI.municipality)(row); }
function movPill(status) { return '<span class="pill ' + (status === 'Submitted' ? 'good' : status === 'Lacking' ? 'bad' : status === 'Not applicable' ? 'idle' : 'warn') + '">' + esc(status) + '</span>'; }
function movOption(value, text, selected) { return '<option value="' + attr(value) + '"' + (selected ? ' selected' : '') + '>' + esc(text) + '</option>'; }

/** The profile's evidence panel: every requirement of the activity with its status and credited files. */
function movRenderGroup(data, group) {
  var listed = group.requirements.map(function (req) {
    var files = req.attachmentKeys.map(function (key) {
      var a = data.byAttachmentKey[key];
      return '<div class="mov-filename">' + esc(a.filename) + ' <button class="link" data-act="mov-copy" data-key="' + attr(key) + '">Copy path</button></div>';
    }).join('');
    return '<tr' + (req.id === MOV_UI.requirement ? ' class="mov-selected"' : '') + '><td>' + esc(req.name) + '</td><td>' + movPill(data.imported ? req.status : 'MOVs not assessed') + '</td><td>' + (files || '<span class="tiny">No credited attachment</span>') + '</td></tr>';
  }).join('');
  return '<div class="card mov-panel-list"><h3>All ' + group.requirements.length + ' requirements for this activity</h3>' +
    (data.imported ? '<p class="tiny muted">' + group.submitted + ' of ' + group.required + ' submitted</p>' : '') +
    '<p class="tiny muted">This tool tracks uploaded MOVs only. Document contents are checked outside the tool.</p>' +
    '<div class="table-wrap"><table class="grid"><thead><tr><th>Required MOV</th><th>Submission status</th><th>Credited evidence</th></tr></thead><tbody>' + listed + '</tbody></table></div></div>';
}

function movExportRows(data, scope) {
  var rows = [['Province', 'Municipality', 'Barangay', 'Activity', 'Required MOV', 'Status', 'Due', 'Actual end / MRP follow-up', 'Credited paths', 'Reference row']];
  data.groups.filter(scope).forEach(function (g) { g.requirements.forEach(function (r) {
    rows.push([g.province, g.municipality, g.barangay, g.actLabel, r.name, data.imported ? r.status : 'MOVs not assessed', g.due ? 'Yes' : 'No', g.dateEnd || '', r.submittedPaths.join('\n'), r.sourceRow]);
  }); }); return rows;
}
function movAttachmentExportRows(data, scope) {
  return [['Province', 'Municipality', 'Barangay', 'Filed activity', 'Activity ID', 'Attachment type ID', 'KCIS label', 'Actual filename', 'File type', 'Source start', 'Source end', 'File path', 'Source rows']].concat(data.attachments.filter(scope).map(function (a) {
    return [a.province, a.municipality, a.barangay, a.category, a.activityId, a.typeId, a.label, a.filename, a.mime, a.dateStart, a.dateEnd, a.path, a.sourceRows.join('; ')];
  }));
}
document.addEventListener('click', function (event) {
  var el = event.target.closest('[data-act="mov-copy"]'); if (!el) return;
  var a = movGetData().byAttachmentKey[el.getAttribute('data-key')];
  if (a && movInScope(a)) navigator.clipboard.writeText(a.path).then(function () { toast('KCIS path copied.'); }).catch(function () { toast(a.path); });
});
