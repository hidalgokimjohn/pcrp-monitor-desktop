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

var MOV_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'YYYY-MM-DD HH:MM' as "13 Aug 2026 · 3:02 PM". */
function movUploadText(at) {
  if (!at) return '';
  var h = +at.slice(11, 13), mm = at.slice(14, 16);
  return +at.slice(8, 10) + ' ' + MOV_MONTHS[+at.slice(5, 7) - 1] + ' ' + at.slice(0, 4) + ' · ' + ((h % 12) || 12) + ':' + mm + ' ' + (h < 12 ? 'AM' : 'PM');
}
/** The uploaded files of a requirement, earliest upload first. */
function movRequirementFiles(data, req) {
  return req.attachmentKeys.map(function (key) { return data.byAttachmentKey[key]; }).filter(Boolean)
    .sort(function (a, b) { return (a.uploaded || '9') < (b.uploaded || '9') ? -1 : (a.uploaded || '9') > (b.uploaded || '9') ? 1 : 0; });
}
/** The profile's evidence panel: every requirement of the activity with its status and the date each file was uploaded. */
function movRenderGroup(data, group) {
  var noColumn = data.imported && !(data.stats && data.stats.uploadedColumn);
  var listed = group.requirements.map(function (req) {
    var files = movRequirementFiles(data, req).map(function (a) {
      var when = a.uploaded ? '<time datetime="' + attr(a.uploaded.replace(' ', 'T')) + '">' + esc(movUploadText(a.uploaded)) + '</time>' : '<span class="tiny muted">' + (noColumn ? 'Date not in this export' : 'No upload date') + '</span>';
      return '<div class="mov-upload" title="' + attr(a.filename) + '">' + when + ' <button class="link" data-act="mov-copy" data-key="' + attr(a.key) + '">Copy path</button></div>';
    }).join('');
    return '<tr' + (req.id === MOV_UI.requirement ? ' class="mov-selected"' : '') + '><td>' + esc(req.name) + '</td><td>' + movPill(data.imported ? req.status : 'MOVs not assessed') + '</td><td>' + (files || '<span class="tiny">Not uploaded</span>') + '</td></tr>';
  }).join('');
  return '<div class="card mov-panel-list"><h3>All ' + group.requirements.length + ' requirements for this activity</h3>' +
    (data.imported ? '<p class="tiny muted">' + group.submitted + ' of ' + group.required + ' submitted</p>' : '') +
    '<p class="tiny muted">This tool tracks uploaded MOVs only. Document contents are checked outside the tool.' + (noColumn ? ' This MOV export has no Uploaded Date column; export a newer one to see when files were uploaded.' : '') + '</p>' +
    '<div class="table-wrap"><table class="grid"><thead><tr><th>Required MOV</th><th>Submission status</th><th>Uploaded date</th></tr></thead><tbody>' + listed + '</tbody></table></div></div>';
}

function movExportRows(data, scope) {
  var rows = [['Province', 'Municipality', 'Barangay', 'Activity', 'Required MOV', 'Status', 'Due', 'Actual end / MRP follow-up', 'Uploaded dates', 'Credited paths', 'Reference row']];
  data.groups.filter(scope).forEach(function (g) { g.requirements.forEach(function (r) {
    var files = movRequirementFiles(data, r);
    rows.push([g.province, g.municipality, g.barangay, g.actLabel, r.name, data.imported ? r.status : 'MOVs not assessed', g.due ? 'Yes' : 'No', g.dateEnd || '',
      files.map(function (a) { return a.uploaded || ''; }).filter(Boolean).join('\n'), files.map(function (a) { return a.path; }).join('\n'), r.sourceRow]);
  }); }); return rows;
}
function movAttachmentExportRows(data, scope) {
  return [['Province', 'Municipality', 'Barangay', 'Filed activity', 'Activity ID', 'Attachment type ID', 'KCIS label', 'Actual filename', 'File type', 'Source start', 'Source end', 'Uploaded date', 'File path', 'Source rows']].concat(data.attachments.filter(scope).map(function (a) {
    return [a.province, a.municipality, a.barangay, a.category, a.activityId, a.typeId, a.label, a.filename, a.mime, a.dateStart, a.dateEnd, a.uploaded || '', a.path, a.sourceRows.join('; ')];
  }));
}
document.addEventListener('click', function (event) {
  var el = event.target.closest('[data-act="mov-copy"]'); if (!el) return;
  var a = movGetData().byAttachmentKey[el.getAttribute('data-key')];
  if (a && movInScope(a)) navigator.clipboard.writeText(a.path).then(function () { toast('KCIS path copied.'); }).catch(function () { toast(a.path); });
});
