// ===================================================================
// SFM REPORT — a status memorandum written from the SFM Masterlist.
// One model (sfmReportModel) feeds the on-screen preview, the printed page,
// the Word file and the plain text, so a figure cannot differ between them.
// The memorandum follows the DSWD format: letterhead, address block, numbered
// paragraphs, figures spelled out with the number in parentheses. Names of
// senders are never written into it.
// ===================================================================

var SFM_ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
var SFM_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
var SFM_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** A whole number in words: 1581 -> "one thousand five hundred eighty-one". */
function sfmWords(v) {
  v = Math.round(Number(v) || 0);
  if (v < 0) return 'minus ' + sfmWords(-v);
  if (v < 20) return SFM_ONES[v];
  if (v < 100) return SFM_TENS[Math.floor(v / 10)] + (v % 10 ? '-' + SFM_ONES[v % 10] : '');
  if (v < 1000) return SFM_ONES[Math.floor(v / 100)] + ' hundred' + (v % 100 ? ' ' + sfmWords(v % 100) : '');
  if (v < 1000000) return sfmWords(Math.floor(v / 1000)) + ' thousand' + (v % 1000 ? ' ' + sfmWords(v % 1000) : '');
  return sfmWords(Math.floor(v / 1000000)) + ' million' + (v % 1000000 ? ' ' + sfmWords(v % 1000000) : '');
}
/** "twelve (12)": the register of a DSWD memorandum. */
function sfmNum(v) { return sfmWords(v) + ' (' + n(v) + ')'; }
function sfmCount(v, one, many) { return sfmNum(v) + ' ' + (v === 1 ? one : many); }
function sfmLongDate(iso) { return iso ? +iso.slice(8, 10) + ' ' + SFM_MONTH_NAMES[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4) : ''; }
function sfmList(items) { return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]; }

/**
 * The memorandum as data: { letterhead, address, sections: [{ no, title, items }], closing, signature }.
 * An item is { no, text, sub: [..] } or { table: { caption, head, rows, num } }.
 * o: { memoFor, thru, sender, name, position, date, source, sections: { nature, places, records, action, recommend } }
 */
function sfmReportModel(data, o) {
  o = o || {};
  var s = data.summary, pick = o.sections || {}, on = function (k) { return pick[k] !== false; };
  var check = {};
  data.checks.forEach(function (c) { check[c.id] = c; });
  var homeParts = data.home ? data.home.split('|') : null;
  var area = homeParts ? 'the Municipality of ' + homeParts[1] + ', ' + homeParts[0] : data.province ? 'the Province of ' + data.province : 'the Caraga Region';
  var areaShort = homeParts ? homeParts[1] + ', ' + homeParts[0] : data.province || 'Caraga Region';
  var from = data.from || s.first, to = data.to || s.last;
  var period = from && to ? (from === to ? 'on ' + sfmLongDate(from) : 'from ' + sfmLongDate(from) + ' to ' + sfmLongDate(to)) : '';
  var pct = function (a, b) { return sfmPct(a, b) + ' percent'; };
  // Where a finding is concentrated; entries with no municipality cannot be named as a place.
  var most = function (c) {
    var named = c.top.filter(function (t) { return t[0].charAt(0) !== '('; }).map(function (t) { return t[0]; });
    return data.home || !named.length ? '' : ' (' + (c.top.length === 1 && c.top[0][1] === c.count ? 'in ' : 'most in ') + sfmList(named) + ')';
  };
  var sections = [];
  function section(title, build) {
    var no = sections.length + 1, items = [], k = 0;
    var sec = { no: no, title: title, items: items };
    build({
      para: function (text, sub) { items.push({ no: no + '.' + (++k), text: text, sub: sub || [] }); },
      table: function (caption, head, rows, num) { if (rows.length) items.push({ table: { caption: caption, head: head, rows: rows, num: num || [] } }); }
    });
    sections.push(sec);
  }
  var tableNo = 0;
  function caption(text) { return 'Table ' + (++tableNo) + '. ' + text; }

  section('PURPOSE', function (w) {
    w.para('This Memorandum respectfully submits, for the information and appropriate action of Management, the status of the entries in the Stakeholders Feedback Mechanism (SFM) of the KALAHI-CIDSS Philippine Community Resilience Project (PCRP) for ' + area +
      (period ? ', covering feedback received ' + period : '') + ', as encoded in the KALAHI-CIDSS Information System (KCIS) as of ' + sfmLongDate(data.asOf) + '.');
    w.para('It is respectfully emphasized that the figures herein reflect only what has been encoded in the KCIS. Feedback received in the field but not yet encoded is not included, and an area without entries should not be read as an area without feedback.');
  });

  if (!s.total) {
    section('STATUS OF ENTRIES', function (w) { w.para('No SFM entry falls within the coverage and period of this Memorandum.'); });
  } else {
    section('STATUS OF ENTRIES', function (w) {
      w.para('A total of ' + sfmCount(s.total, 'entry was', 'entries were') + ' encoded' + (data.home ? '' : ', coming from ' + sfmNum(s.municipalities) + ' of the ' + sfmCount(s.monitored, 'monitored municipality', 'monitored municipalities')) + '.');
      w.para(s.open ? sfmCount(s.resolved, 'entry', 'entries').replace(/^./, function (c) { return c.toUpperCase(); }) + ', or ' + pct(s.resolved, s.total) + ', ' + (s.resolved === 1 ? 'is' : 'are') + ' marked Resolved, while ' + sfmNum(s.open) + ' ' + (s.open === 1 ? 'remains' : 'remain') + ' open.' +
        (s.overdue ? ' Of the open entries, ' + sfmNum(s.overdue) + ' ' + (s.overdue === 1 ? 'has' : 'have') + ' exceeded the processing time allowed for ' + (s.overdue === 1 ? 'its' : 'their') + ' classification under the Ease of Doing Business (EODB) Act.' : '') +
        (s.oldestOpen ? ' The oldest open entry has been open for ' + sfmCount(s.oldestOpen, 'working day', 'working days') + '.' : '')
        : 'All ' + sfmNum(s.total) + ' ' + (s.total === 1 ? 'entry is' : 'entries are') + ' marked Resolved. No entry is open.');
      w.para('By nature of issue, ' + sfmNum(s.typeA) + ' ' + (s.typeA === 1 ? 'is' : 'are') + ' Type A, ' + sfmNum(s.typeB) + ' Type B and ' + sfmNum(s.typeC) + ' Type C.' +
        (s.total - s.typeA - s.typeB - s.typeC ? ' The type of ' + sfmNum(s.total - s.typeA - s.typeB - s.typeC) + ' could not be read.' : ''));
      w.para(s.rated ? 'Of the ' + sfmCount(s.rated, 'entry that carries', 'entries that carry') + ' a feedback rating, ' + sfmNum(s.satisfied) + ', or ' + pct(s.satisfied, s.rated) + ', ' + (s.satisfied === 1 ? 'was' : 'were') + ' rated Satisfied or Very Satisfied.' +
        (s.total - s.rated ? ' ' + sfmCount(s.total - s.rated, 'entry carries', 'entries carry').replace(/^./, function (c) { return c.toUpperCase(); }) + ' no rating and ' + (s.total - s.rated === 1 ? 'is' : 'are') + ' not included in this proportion.' : '')
        : 'No entry carries a feedback rating; satisfaction is therefore not reported, and should not be read as zero.');
      if (s.medianLag !== null) w.para('The median interval between the date of intake and the date of encoding is ' + sfmCount(s.medianLag, 'calendar day', 'calendar days') + '.');
      var months = {};
      data.entries.forEach(function (e) {
        if (e.intake) { var a = e.intake.slice(0, 7); (months[a] = months[a] || [0, 0])[0]++; }
        if (e.encoded) { var b = e.encoded.slice(0, 7); (months[b] = months[b] || [0, 0])[1]++; }
      });
      w.table(caption('Entries received and entries encoded per month. Entries encoded in a later month than they were received show the delay in encoding.'), ['Month', 'Received', 'Encoded'],
        Object.keys(months).sort().map(function (k) { return [SFM_MONTH_NAMES[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4), months[k][0], months[k][1]]; }), [1, 2]);
    });

    if (on('nature')) section('NATURE OF THE FEEDBACK', function (w) {
      function breakdown(field, heading, limit) {
        var tally = sfmTally(data.entries, field), named = tally.filter(function (t) { return t[0]; }), blank = tally.filter(function (t) { return !t[0]; })[0];
        var rows = named.slice(0, limit).map(function (t) { return [t[0], t[1], sfmPct(t[1], s.total) + '%']; });
        var rest = named.slice(limit).reduce(function (x, t) { return x + t[1]; }, 0);
        if (rest) rows.push(['Others (' + (named.length - limit) + ')', rest, sfmPct(rest, s.total) + '%']);
        if (blank) rows.push(['Not stated', blank[1], sfmPct(blank[1], s.total) + '%']);
        return rows.length ? { head: [heading, 'Entries', 'Share'], rows: rows, top: named[0] } : null;
      }
      var cat = breakdown('category', 'Category of concern', 8), subj = breakdown('subject', 'Subject of complaint', 8), who = breakdown('designation', 'Sender', 8);
      if (cat) {
        w.para(cat.top ? 'The most common category of concern is ' + cat.top[0] + ', with ' + sfmCount(cat.top[1], 'entry', 'entries') + ', or ' + pct(cat.top[1], s.total) + ' of the total.' : 'No entry carries a category of concern.');
        w.table(caption('Entries by category of concern.'), cat.head, cat.rows, [1, 2]);
      }
      if (subj) w.table(caption('Entries by subject of complaint.'), subj.head, subj.rows, [1, 2]);
      if (who) w.table(caption('Entries by designation of the sender.'), who.head, who.rows, [1, 2]);
      if (data.has('Sex')) {
        var female = data.entries.filter(function (e) { return e.sex === 'female'; }).length, male = data.entries.filter(function (e) { return e.sex === 'male'; }).length, none = s.total - female - male;
        w.para('Of the senders, ' + sfmNum(female) + ' ' + (female === 1 ? 'is' : 'are') + ' female and ' + sfmNum(male) + ' ' + (male === 1 ? 'is' : 'are') + ' male.' + (none ? ' The sex of the sender is not stated in ' + sfmCount(none, 'entry', 'entries') + '.' : ''));
      }
      var filing = sfmTally(data.entries, 'filing').filter(function (t) { return t[0]; }).slice(0, 3);
      if (filing.length) w.para('By mode of filing, the entries were mostly received through ' + sfmList(filing.map(function (t) { return t[0] + ' (' + n(t[1]) + ')'; })) + '.');
    });

    var by = data.home ? 'barangay' : 'municipality', groups = sfmGroups(data, by);
    if (on('places') && groups.length) section('STATUS PER ' + (data.home ? 'BARANGAY' : 'MUNICIPALITY'), function (w) {
      var total = [0, 0, 0, 0, 0];
      var rows = groups.map(function (g) {
        [g.n, g.open, g.bc, g.noDate, g.fix].forEach(function (v, i) { total[i] += v; });
        var name = by === 'municipality' && !data.province && g.monitored ? g.name + ', ' + g.province : g.name;
        return g.n ? [name, g.n, g.open, g.bc, g.noDate, g.fix, g.medianLag === null ? '—' : g.medianLag] : [name, 'No entry', '', '', '', '', ''];
      });
      rows.push(['Total', total[0], total[1], total[2], total[3], total[4], s.medianLag === null ? '—' : s.medianLag]);
      w.para('The status of the entries per ' + by + ' is shown below.');
      w.table(caption('Entries per ' + by + '. "No Date Addressed" counts resolved entries whose Date Addressed is blank or invalid; "To complete" counts entries with at least one blank or invalid field; "Days to encode" is the median number of calendar days from intake to encoding.'),
        [data.home ? 'Barangay' : 'Municipality', 'Entries', 'Open', 'Type B/C', 'No Date Addressed', 'To complete', 'Days to encode'], rows, [1, 2, 3, 4, 5, 6]);
      if (s.silent.length) w.para(sfmCount(s.silent.length, 'monitored municipality has', 'monitored municipalities have').replace(/^./, function (c) { return c.toUpperCase(); }) + ' no entry in the KCIS for this coverage: ' + sfmList(s.silent) +
        '. Whether feedback was received in ' + (s.silent.length === 1 ? 'this area' : 'these areas') + ' could not be established from the system.');
    });

    if (on('records')) section('COMPLETENESS OF THE RECORDS', function (w) {
      var fix = data.checks.filter(function (c) { return c.sev === 'fix' && c.count; }).sort(function (a, b) { return b.count - a.count; });
      var review = data.checks.filter(function (c) { return c.sev === 'review' && c.count && c.id !== 'type_bc'; }).sort(function (a, b) { return b.count - a.count; });
      var line = function (c) { return c.label + ': ' + sfmCount(c.count, 'entry', 'entries') + most(c); };
      if (fix.length) w.para(sfmCount(s.toFix, 'entry', 'entries').replace(/^./, function (c) { return c.toUpperCase(); }) + ', or ' + pct(s.toFix, s.total) + ' of the total, ' + (s.toFix === 1 ? 'has' : 'have') + ' at least one field that is blank or invalid. An entry may fall under more than one of the following:', fix.map(line));
      else w.para('No blank or invalid field was found in the entries.');
      if (review.length) w.para('Attention is respectfully invited to the following, which are not errors by themselves but merit review:', review.map(line));
    });

    if (on('action')) section('ENTRIES REQUIRING ACTION', function (w) {
      var open = data.entries.filter(function (e) { return e.open; }).sort(function (a, b) { return (b.age || 0) - (a.age || 0); });
      var bc = data.entries.filter(function (e) { return e.type === 'B' || e.type === 'C'; });
      if (open.length) {
        w.para(sfmCount(open.length, 'entry remains', 'entries remain').replace(/^./, function (c) { return c.toUpperCase(); }) + ' open as of ' + sfmLongDate(data.asOf) + ', listed below from the oldest.');
        w.table(caption('Open entries. Working days are counted from the date of intake, Monday to Friday; holidays are not deducted.'), ['Reference ID', 'Municipality', 'Barangay', 'Date of intake', 'EODB classification', 'Working days open'],
          open.map(function (e) { return [e.ref, e.municipality || 'Not stated', e.barangay || '—', sfmLongDate(e.intake) || 'Not stated', e.eodb || 'Not stated', e.age === null ? '—' : e.age]; }), [5]);
      } else w.para('No entry is open.');
      if (bc.length) {
        w.para(sfmCount(bc.length, 'entry is', 'entries are').replace(/^./, function (c) { return c.toUpperCase(); }) + ' classified as Type B or Type C. Being few, each may be read to confirm its classification and the completeness of its resolution.');
        w.table(caption('Type B and Type C entries.'), ['Reference ID', 'Municipality', 'Type', 'Category of concern', 'Status', 'Date addressed'],
          bc.map(function (e) { return [e.ref, e.municipality || 'Not stated', 'Type ' + e.type, e.category || 'Not stated', e.status, e.addressed ? sfmLongDate(e.addressed) : 'Not entered']; }));
      } else w.para('No entry is classified as Type B or Type C.');
      w.para('The names of the senders are withheld from this Memorandum in observance of the Data Privacy Act of 2012. The Reference ID identifies each entry in the KCIS.');
    });

    if (on('recommend')) section('RECOMMENDATIONS', function (w) {
      var recs = [], dates = check.no_date.count + check.bad_date.count;
      var others = ['no_place', 'no_level', 'no_category', 'no_sender', 'no_feedback', 'no_form', 'ip_group', 'bad_intake'].some(function (id) { return check[id].count; });
      if (s.open) recs.push('That the ' + sfmCount(s.open, 'open entry', 'open entries') + ' be acted upon, and ' + (s.open === 1 ? 'its' : 'their') + ' status, resolution and Date Addressed be updated in the KCIS');
      if (dates) recs.push('That the Date Addressed be entered or corrected for the ' + sfmCount(dates, 'resolved entry', 'resolved entries') + ' concerned' + most(check.no_date.count ? check.no_date : check.bad_date));
      if (check.no_resolution.count) recs.push('That the resolution be written out for the ' + sfmCount(check.no_resolution.count, 'entry', 'entries') + ' where it is blank or reads only "None" or "N/A"');
      if (others) recs.push('That the other blank fields identified in this Memorandum be completed, so that the entries may be counted in the breakdowns');
      if (check.duplicate.count) recs.push('That the ' + sfmCount(check.duplicate.count, 'possible duplicate entry', 'possible duplicate entries') + ' be reviewed, and only one entry be kept for each feedback, unless several persons raised the same point');
      if (check.self.count) recs.push('That the ' + sfmCount(check.self.count, 'entry', 'entries') + ' naming the same person as complainant and as intake officer be corrected');
      if (s.silent.length) recs.push('That the Area Coordinating ' + (s.silent.length === 1 ? 'Team' : 'Teams') + ' of ' + sfmList(s.silent) + ' confirm whether feedback was received and, if so, encode it');
      if (s.medianLag) recs.push('That entries be encoded closer to the date of intake, the median interval at present being ' + sfmCount(s.medianLag, 'calendar day', 'calendar days'));
      if (recs.length) w.para('In view of the foregoing, the following are respectfully recommended:', recs.map(function (r, i) { return r + (i === recs.length - 1 ? '.' : ';'); }));
      else w.para('No corrective action is recommended at this time.');
    });
  }

  section('BASIS OF THE FIGURES', function (w) {
    w.para('All figures are counted from the SFM Masterlist exported from the KCIS' + (o.source ? ' (' + o.source + ')' : '') + ', as of ' + sfmLongDate(data.asOf) + ', the latest date of encoding in the file.' +
      (data.from || data.to ? ' The period is applied to the date of intake; an entry without a date of intake is not included.' : ''));
    w.para('An entry is counted as open when its status is not Resolved. Its age is counted in working days from the date of intake, against the entry\'s own EODB classification: three (3) working days for Simple, seven (7) for Complex and twenty (20) for Highly Technical.');
    w.para('The proportion rated satisfied counts the ratings Satisfied and Very Satisfied over the entries that carry a rating. A possible duplicate is an entry that has the same municipality, barangay, date of intake and narrative as another entry.');
  });

  var address = [['FOR', o.memoFor || ''], ['THRU', o.thru || ''], ['FROM', o.sender || ''],
    ['SUBJECT', ('Status of the Stakeholders Feedback Mechanism (SFM) entries, ' + areaShort + (period ? ', ' + period.replace(/^(from|on) /, '') : '')).toUpperCase()],
    ['DATE', sfmLongDate(o.date || data.asOf)]].filter(function (r) { return r[0] !== 'THRU' || r[1]; });
  return {
    letterhead: ['Republic of the Philippines', 'DEPARTMENT OF SOCIAL WELFARE AND DEVELOPMENT', 'Field Office Caraga',
      homeParts ? 'Area Coordinating Team, ' + homeParts[1] + ', ' + homeParts[0] : 'Regional Project Management Office', 'KALAHI-CIDSS Philippine Community Resilience Project (PCRP)'],
    address: address, sections: sections, area: areaShort,
    closing: 'For the information, consideration and appropriate action of Management.',
    signature: { name: o.name || '', position: o.position || '' }
  };
}

// One stylesheet for the preview, the printed page and the Word file. Every rule sits under .sfm-doc.
var SFM_DOC_CSS = '.sfm-doc{font-family:Cambria,"Times New Roman",serif;font-size:11pt;line-height:1.45;color:#111;}' +
  '.sfm-doc p{margin:0 0 8pt;text-align:justify;}' +
  '.sfm-doc .sfm-doc-head p{margin:0;text-align:center;font-size:10.5pt;line-height:1.3;}' +
  '.sfm-doc .sfm-doc-head p.b{font-weight:bold;font-size:11.5pt;}' +
  '.sfm-doc .sfm-doc-rule{border:0;border-top:3px double #111;margin:8pt 0 12pt;}' +
  '.sfm-doc h1{font-family:Cambria,"Times New Roman",serif;font-size:13pt;font-weight:bold;text-align:center;letter-spacing:.25em;margin:0 0 12pt;color:#111;}' +
  '.sfm-doc h2{font-family:Cambria,"Times New Roman",serif;font-size:11pt;font-weight:bold;margin:14pt 0 6pt;color:#111;letter-spacing:0;text-transform:none;}' +
  '.sfm-doc table.sfm-doc-addr{border-collapse:collapse;margin:0 0 4pt;width:100%;}' +
  '.sfm-doc table.sfm-doc-addr td{border:0;padding:2pt 4pt 2pt 0;vertical-align:top;font-size:11pt;}' +
  '.sfm-doc table.sfm-doc-addr td.k{width:70pt;font-weight:bold;}.sfm-doc table.sfm-doc-addr td.c{width:10pt;}' +
  '.sfm-doc table.sfm-doc-addr td.blank{border-bottom:1px solid #999;}' +
  '.sfm-doc p.sfm-doc-p{padding-left:30pt;text-indent:-30pt;}' +
  '.sfm-doc ol.sfm-doc-sub{margin:0 0 8pt 30pt;padding-left:18pt;}.sfm-doc ol.sfm-doc-sub li{margin:0 0 3pt;text-align:justify;}' +
  '.sfm-doc table.sfm-doc-table{border-collapse:collapse;width:100%;margin:4pt 0 3pt;font-family:Calibri,Arial,sans-serif;font-size:9.5pt;line-height:1.3;}' +
  '.sfm-doc table.sfm-doc-table th,.sfm-doc table.sfm-doc-table td{border:1px solid #7f8794;padding:3pt 6pt;text-align:left;vertical-align:top;color:#111;background:#fff;}' +
  '.sfm-doc table.sfm-doc-table th{background:#E8EEF7;font-weight:bold;}' +
  '.sfm-doc table.sfm-doc-table .r{text-align:right;}.sfm-doc table.sfm-doc-table tr.t td{font-weight:bold;background:#f3f5f9;}' +
  '.sfm-doc p.sfm-doc-cap{font-family:Calibri,Arial,sans-serif;font-size:9pt;font-style:italic;text-align:left;margin:0 0 10pt;}' +
  '.sfm-doc .sfm-doc-sign{margin:26pt 0 0 55%;}.sfm-doc .sfm-doc-sign p{text-align:left;margin:0;}' +
  '.sfm-doc .sfm-doc-sign .line{margin-top:30pt;border-top:1px solid #111;padding-top:2pt;font-weight:bold;}';

function sfmReportHtml(model) {
  var out = '<div class="sfm-doc"><div class="sfm-doc-head">' + model.letterhead.map(function (l, i) { return '<p' + (i === 1 ? ' class="b"' : '') + '>' + esc(l) + '</p>'; }).join('') + '</div><hr class="sfm-doc-rule">' +
    '<h1>MEMORANDUM</h1><table class="sfm-doc-addr">' + model.address.map(function (r) {
      return '<tr><td class="k">' + esc(r[0]) + '</td><td class="c">:</td><td' + (r[1] ? (r[0] === 'SUBJECT' ? ' style="font-weight:bold"' : '') : ' class="blank"') + '>' + (esc(r[1]) || '&nbsp;') + '</td></tr>';
    }).join('') + '</table><hr class="sfm-doc-rule">';
  model.sections.forEach(function (sec) {
    out += '<h2>' + sec.no + '. ' + esc(sec.title) + '</h2>';
    sec.items.forEach(function (it) {
      if (it.table) {
        var t = it.table, last = t.rows.length - 1;
        out += '<table class="sfm-doc-table"><thead><tr>' + t.head.map(function (h, i) { return '<th' + (t.num.indexOf(i) !== -1 ? ' class="r"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          t.rows.map(function (r, ri) { return '<tr' + (ri === last && r[0] === 'Total' ? ' class="t"' : '') + '>' + r.map(function (v, i) { return '<td' + (t.num.indexOf(i) !== -1 ? ' class="r"' : '') + '>' + esc(typeof v === 'number' ? n(v) : v) + '</td>'; }).join('') + '</tr>'; }).join('') +
          '</tbody></table><p class="sfm-doc-cap">' + esc(t.caption) + '</p>';
      } else {
        out += '<p class="sfm-doc-p"><b>' + it.no + '</b>&nbsp;&nbsp;&nbsp;' + esc(it.text) + '</p>' +
          (it.sub.length ? '<ol class="sfm-doc-sub" type="a">' + it.sub.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : '');
      }
    });
  });
  return out + '<p style="margin-top:14pt">' + esc(model.closing) + '</p><div class="sfm-doc-sign"><p>Respectfully submitted:</p><p class="line">' + (esc(model.signature.name) || '&nbsp;') + '</p><p>' + (esc(model.signature.position) || '&nbsp;') + '</p></div></div>';
}
function sfmReportText(model) {
  var lines = model.letterhead.concat(['', 'MEMORANDUM', '']);
  model.address.forEach(function (r) { lines.push(r[0] + (r[0].length < 7 ? '\t' : '') + '\t: ' + (r[1] || '____________________')); });
  model.sections.forEach(function (sec) {
    lines.push('', sec.no + '. ' + sec.title, '');
    sec.items.forEach(function (it) {
      if (it.table) {
        lines.push(it.table.head.join('\t'));
        it.table.rows.forEach(function (r) { lines.push(r.map(function (v) { return typeof v === 'number' ? n(v) : v; }).join('\t')); });
        lines.push(it.table.caption, '');
      } else {
        lines.push(it.no + '  ' + it.text);
        it.sub.forEach(function (x, i) { lines.push('     ' + String.fromCharCode(97 + i) + '. ' + x); });
        lines.push('');
      }
    });
  });
  return lines.concat([model.closing, '', 'Respectfully submitted:', '', model.signature.name || '____________________', model.signature.position || '']).join('\n');
}
/** A Word-readable file: the same HTML, wrapped the way Word opens it as a document. */
function sfmReportWord(model) {
  return '﻿<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>SFM status memorandum</title>' +
    '<style>@page{size:8.5in 11in;margin:.75in;}body{margin:0;}' + SFM_DOC_CSS + '</style></head><body>' + sfmReportHtml(model) + '</body></html>';
}

// ---- the Report tab -----------------------------------------------------------

var SFM_REPORT_SECTIONS = [['nature', 'Nature of the feedback'], ['places', 'Status per municipality or barangay'], ['records', 'Completeness of the records'], ['action', 'Entries requiring action'], ['recommend', 'Recommendations']];
var SFM_REPORT_CACHE = null;
function sfmReportState() {
  if (!SFM_UI.report) {
    var saved = prefs().sfmReport || {};
    SFM_UI.report = { scope: '', period: 'all', from: '', to: '', memoFor: saved.memoFor || '', thru: saved.thru || '', sender: saved.sender || '', name: saved.name || '', position: saved.position || '', sections: saved.sections || {} };
  }
  return SFM_UI.report;
}
/** The entries the report covers: the chosen area and period, inside the workspace's own scope. */
function sfmReportData() {
  var r = sfmReportState(), t = TABS.Raw_SFM, home = isMunicipalUser() ? homeKey() : (r.scope.indexOf('m:') === 0 ? r.scope.slice(2) : '');
  var province = !home && r.scope.indexOf('p:') === 0 ? r.scope.slice(2) : '', munis = baselineMunis(), key = [home, province, r.from, r.to, munis.length].join('|');
  if (SFM_REPORT_CACHE && SFM_REPORT_CACHE.table === t && SFM_REPORT_CACHE.key === key) return SFM_REPORT_CACHE.data;
  SFM_REPORT_CACHE = { table: t, key: key, data: sfmBuild(t, { munis: munis, home: home, province: province, from: r.from, to: r.to, today: today() }) };
  return SFM_REPORT_CACHE.data;
}
function sfmReportCurrent() {
  var r = sfmReportState();
  return sfmReportModel(sfmReportData(), { memoFor: r.memoFor, thru: r.thru, sender: r.sender, name: r.name, position: r.position, date: today(), source: LOADED.sfm ? LOADED.sfm.file : '', sections: r.sections });
}
function sfmReportSet(key, value, soft) {
  var r = sfmReportState();
  if (key.indexOf('sec:') === 0) r.sections[key.slice(4)] = !!value;
  else if (key === 'period') {
    r.period = value;
    if (value === 'all') { r.from = ''; r.to = ''; }
    else if (/^\d{4}-\d{2}$/.test(value)) { r.from = value + '-01'; r.to = value + '-' + sfmPad(new Date(Date.UTC(+value.slice(0, 4), +value.slice(5, 7), 0)).getUTCDate()); }
  }
  else if (key === 'from' || key === 'to') { r[key] = sfmDate(value); r.period = r.from || r.to ? 'custom' : 'all'; }
  else r[key] = value;
  var p = prefs();
  p.sfmReport = { memoFor: r.memoFor, thru: r.thru, sender: r.sender, name: r.name, position: r.position, sections: r.sections };
  savePrefs(p);
  // Typing in a text box redraws the page only, so the box keeps its focus.
  var host = soft && $('sfm-doc-host');
  if (host) host.innerHTML = sfmReportHtml(sfmReportCurrent()); else renderSfm();
}
function sfmReportView(whole) {
  var r = sfmReportState(), data = sfmReportData(), model = sfmReportCurrent();
  var scope = [['', 'Whole region']], province = '';
  whole.munis.forEach(function (m) {
    if (m.province !== province) { province = m.province; scope.push(['p:' + province, 'All of ' + province]); }
    scope.push(['m:' + m.province + '|' + m.municipality, '  ' + m.municipality]);
  });
  var periods = [['all', 'All dates in the file']].concat(sfmTally(whole.entries, 'month').filter(function (t) { return t[0]; }).map(function (t) { return t[0]; }).sort().map(function (k) { return [k, SFM_MONTH_NAMES[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4)]; }), [['custom', 'Custom dates']]);
  var text = function (key, label, hint) { return '<label class="field"><span>' + esc(label) + '</span><input type="text" data-act="sfm-rt" data-k="' + key + '" value="' + attr(r[key]) + '" placeholder="' + attr(hint) + '"></label>'; };
  var date = function (key, label) { return '<label class="field"><span>' + label + '</span><input type="date" data-act="sfm-r" data-k="' + key + '" value="' + attr(r[key]) + '"></label>'; };
  return '<div class="sfm-report"><aside class="sfm-report-side" aria-label="Report settings">' +
    '<h2>Report settings</h2>' +
    (whole.home ? '<p class="tiny muted">Coverage: ' + esc(homeLabel()) + '</p>' : '<label class="field"><span>Coverage</span><select data-act="sfm-r" data-k="scope">' + scope.map(function (o) { return movOption(o[0], o[1], r.scope === o[0]); }).join('') + '</select></label>') +
    '<label class="field"><span>Period, by date of intake</span><select data-act="sfm-r" data-k="period">' + periods.map(function (o) { return movOption(o[0], o[1], r.period === o[0]); }).join('') + '</select></label>' +
    '<div class="sfm-report-dates">' + date('from', 'From') + date('to', 'To') + '</div>' +
    '<p class="sfm-report-n"><b>' + n(data.summary.total) + '</b> ' + (data.summary.total === 1 ? 'entry' : 'entries') + ' covered</p>' +
    '<h3>Address block</h3>' + text('memoFor', 'For', 'Name and position of the addressee') + text('thru', 'Thru (optional)', 'Leave blank to omit') + text('sender', 'From', 'Office or officer sending') +
    text('name', 'Submitted by', 'Name') + text('position', 'Position', 'Position or designation') +
    '<h3>Sections</h3><p class="tiny muted">Purpose, Status of entries and Basis of the figures are always included.</p>' + SFM_REPORT_SECTIONS.map(function (x) {
      return '<label class="sfm-report-check"><input type="checkbox" data-act="sfm-r" data-k="sec:' + x[0] + '"' + (r.sections[x[0]] !== false ? ' checked' : '') + '> <span>' + esc(x[1]) + '</span></label>';
    }).join('') +
    '<div class="sfm-report-actions"><button type="button" class="btn primary" data-act="sfm-report-print">' + icon('file-text') + ' <span>Print or save as PDF</span></button>' +
    '<button type="button" class="btn ghost" data-act="sfm-report-word">' + icon('download') + ' <span>Download for Word</span></button>' +
    '<button type="button" class="btn ghost" data-act="sfm-report-copy">' + icon('copy') + ' <span>Copy as text</span></button></div>' +
    '<p class="tiny muted">The memorandum is written from the figures on this page. Names of senders are left out. Read it before sending: the wording is a draft for you to edit.</p></aside>' +
    '<section class="sfm-paper" aria-label="Report preview"><style>' + SFM_DOC_CSS + '</style><div id="sfm-doc-host">' + sfmReportHtml(model) + '</div></section></div>';
}
function sfmReportAction(name) {
  var model = sfmReportCurrent(), slug = model.area.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (name === 'word') {
    var file = 'SFM_Status_Memo_' + slug + '_' + stamp() + '.doc';
    saveBlob(new Blob([sfmReportWord(model)], { type: 'application/msword' }), file);
    toast('Saved ' + file + '. Open it in Word to edit and sign.');
  } else if (name === 'copy') {
    var text = sfmReportText(model), done = function () { toast('Memorandum copied as text.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast('Copying is blocked in this browser. Use Download for Word instead.'); });
    else toast('Copying is not available in this browser. Use Download for Word instead.');
  } else if (name === 'print') {
    var host = $('sfm-print');
    if (!host) { host = document.createElement('div'); host.id = 'sfm-print'; document.body.appendChild(host); }
    host.innerHTML = '<style>' + SFM_DOC_CSS + '</style>' + sfmReportHtml(model);
    var root = document.documentElement, done2 = function () { root.classList.remove('sfm-printing'); window.removeEventListener('afterprint', done2); };
    root.classList.add('sfm-printing'); window.addEventListener('afterprint', done2);
    window.print();
  }
}
