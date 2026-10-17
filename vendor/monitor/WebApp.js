/**
 * WebApp.gs — serving and permissions.
 *
 * Deploy with "Execute as: Me" and "Who has access: Anyone within <your
 * organisation>". Everyone then reads through this account's permissions, and
 * the EDITORS list below decides who may change anything.
 */

var _ACTIVE_REQUEST_PASSKEY = '';
function setActivePasskey_(passkey) {
  _ACTIVE_REQUEST_PASSKEY = String(passkey || '').trim();
}

function getEditorPasskey_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('EDITOR_PASSKEY');
    if (raw && raw.trim()) return raw.trim();
  } catch (e) {}
  return '';
}

/** Emails allowed to import, set field conduct, and edit the baseline via Google Account. */
function editors_() {
  var raw = PropertiesService.getScriptProperties().getProperty('EDITORS') || '';
  return raw.split(',').map(function (e) { return e.trim().toLowerCase(); })
            .filter(String);
}

function currentUser_() {
  try {
    var active = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    if (active) return active;
  } catch (e) {}
  try {
    var eff = (Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
    if (eff) return eff;
  } catch (e) {}
  return '';
}

function isWhitelistedGoogleUser_() {
  var list = editors_();
  if (!list.length) return false;
  var active = '';
  try { active = (Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) {}
  if (active && list.indexOf(active) !== -1) return true;
  return false;
}

function isEditor_(passkey) {
  // 1. Logged-in Google account whitelist check
  if (isWhitelistedGoogleUser_()) return true;

  // 2. In-App Passkey verification
  var keyToCheck = String(passkey !== undefined && passkey !== null ? passkey : _ACTIVE_REQUEST_PASSKEY).trim();
  var expectedKey = getEditorPasskey_();
  if (keyToCheck && keyToCheck === expectedKey) return true;

  return false;
}

function requireEditor_(passkey) {
  if (passkey) setActivePasskey_(passkey);
  if (!isEditor_(passkey)) {
    throw new Error('Access restricted: You have read-only access. Unlock Editor Mode with the passkey to perform this action.');
  }
}

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('PCRP Encoding Monitor')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// ===================================================================
// ENDPOINTS  (everything the browser calls)
// ===================================================================

/**
 * High-performance single-roundtrip boot endpoint.
 * Returns Overview, Matrix, and Runway Trail together to reduce startup time by 3x.
 */
function apiInit(passkey) {
  if (passkey) setActivePasskey_(passkey);
  return {
    overview: apiOverview(passkey),
    matrix: apiMatrix(),
    runwayTrail: apiRunwayTrail()
  };
}

/** Everything the dashboard needs, in one round trip. */
function apiOverview(passkey) {
  if (passkey) setActivePasskey_(passkey);
  var snap = getSnapshot(false);
  var ssUrl = '';
  var lastImportAt = '';
  try { lastImportAt = PropertiesService.getScriptProperties().getProperty('LAST_IMPORT_AT') || ''; } catch (e) {}
  var isEd = isEditor_(passkey);
  var isGoogle = isWhitelistedGoogleUser_();
  var targets = readTargets();
  return {
    generatedAt: snap.generatedAt,
    lastImportAt: lastImportAt || snap.generatedAt,
    spreadsheetUrl: ssUrl,
    editor: isEd,
    editorAuthType: isEd ? (isGoogle ? 'google' : 'passkey') : 'none',
    user: currentUser_(),
    editorsConfigured: true,
    baseline: snap.baseline,
    region: snap.region,
    pipeline: snap.pipeline,
    k2: snap.k2,
    k2_ba2: snap.k2_ba2,
    k2_ba3: snap.k2_ba3,
    // 1st BA volunteers: region roll-up only (per municipality comes with the matrix)
    volunteers: snap.volunteers ? {
      imported: snap.volunteers.imported, rows: snap.volunteers.rows, bodies: snap.volunteers.bodies,
      rules: snap.volunteers.rules, pipeline: snap.volunteers.pipeline,
      otherActivityRows: snap.volunteers.otherActivityRows, notInBaseline: snap.volunteers.notInBaseline
    } : null,
    health: snap.health,
    noAttendeesRecords: snap.noAttendeesRecords || [],
    activities: snap.activities.map(function (a) {
      return { seq: a.seq, code: a.code, label: a.label, level: a.level,
               field: a.field, stage: a.stage || 1, prioOnly: !!a.prioOnly,
               households: !!a.households };
    }),
    municipalities: snap.municipalRows.map(function (m) {
      return { province: m.province, municipality: m.municipality,
               batch: m.batch, focalArea: m.focalArea || '' };
    }),
    // includes the switched-off ones, so the admin screen can switch them back on
    allMunicipalities: readAllMunicipalities(),
    snapshots: historyDates(),
    targets: targets,
    deadlines: targetsAsDeadlineMap(targets),
    appraisal: readAppraisal(),
    appraisalStatuses: APPRAISAL_STATUSES,
    recipientDirectory: apiGetRecipientDirectory()
  };
}

/**
 * Ultra-fast dedicated triage endpoint returning strictly records with no attendees (~200 bytes, <150ms).
 * Avoids any heavy regional calculations when opening the Quick Triage modal.
 */
function apiNoAttendeesRecords() {
  var snap = getSnapshot(false);
  var recs = snap.noAttendeesRecords || [];
  if (!recs.length && snap.barangayRows) {
    snap.barangayRows.forEach(function (b) {
      Object.keys(b.activities || {}).forEach(function (k) {
        var act = b.activities[k];
        if (act && (act.status === 'No Attendees' || (act.attendees === 0 && (act.dateStart || act.fieldDate)))) {
          var actMeta = (snap.activities && snap.activities.find(function (a) { return a.code === k; })) || null;
          recs.push({
            province: b.province || '',
            municipality: b.municipality || '',
            barangay: b.barangay || '',
            actCode: k,
            seq: actMeta ? actMeta.seq : '',
            actLabel: actMeta ? actMeta.label : k,
            level: 'Barangay',
            dateStart: act.dateStart || '',
            dateEnd: act.dateEnd || '',
            fieldDate: act.fieldDate || act.dateStart || ''
          });
        }
      });
    });
  }
  return recs;
}

/**
 * Household roster checks for Data Health: rows with no name, duplicate
 * listings in one barangay, and household heads found in more than one barangay.
 * The web app is open to anonymous viewers, so names and birthdates go only to
 * editors; everyone else gets the places and counts.
 */
function apiHouseholdIssues(passkey) {
  if (passkey) setActivePasskey_(passkey);
  var iss = getHouseholdIssues();
  var snap = getSnapshot(false);
  var editor = isEditor_(passkey);
  var out = {
    editor: editor,
    summary: (snap.health && snap.health.householdRoster) || null,
    blank: iss.blank
  };
  if (editor) {
    out.duplicates = iss.duplicates;
    out.crossBarangay = iss.crossBarangay;
    return out;
  }
  out.duplicates = iss.duplicates.map(function (d) {
    return { province: d.province, municipality: d.municipality, barangay: d.barangay,
             actCode: d.actCode, times: d.times, presentCount: d.presentCount };
  });
  out.crossBarangay = iss.crossBarangay.map(function (c) {
    return {
      confidence: c.confidence, acrossMunicipalities: c.acrossMunicipalities,
      barangays: c.barangays.map(function (b) {
        return { province: b.province, municipality: b.municipality, barangay: b.barangay,
                 actCode: b.actCode, present: b.present, times: b.times };
      })
    };
  });
  return out;
}

/**
 * The Fix list: every open Data Health item that belongs to a place, with its
 * status against the previous pull (new, still open since, better, worse) and
 * what was resolved since. Places and counts only, so it goes to every viewer.
 * The current data is the latest saved pull; the ledger comparison leaves it out.
 */
function apiFixList() {
  var snap = getSnapshot(false);
  var current = dqaFindings(snap.health, getHouseholdIssues());
  var dates = historyDates();
  var latest = dates.length ? dates[dates.length - 1] : '';
  var res = dqaCompare(current, readFindingsLedger(latest));
  res.current = latest;
  res.generatedAt = snap.generatedAt;
  return res;
}

/** The municipality x activity grid. */
function apiMatrix() {
  var snap = getSnapshot(false);
  return {
    activities: snap.pipeline.map(function (p) {
      // field + level are additive: the matrix colours "not encoded" by the activity's field status
      return { seq: p.seq, code: p.code, label: p.label, field: p.field, level: p.level,
               stage: p.stage || 1, prioOnly: !!p.prioOnly, households: !!p.households };
    }),
    rows: snap.municipalRows.map(function (m) {
      var cells = {};
      var mKey = m.province + '|' + m.municipality;
      snap.pipeline.forEach(function (p) {
        var t = (snap.byMuniActivity[mKey] || snap.byMuniActivity[m.municipality] || {})[p.code];
        // noAttendees and notEncoded are NOT the same thing and must not be
        // collapsed: an activity created in KCIS with no attendance sheet is
        // encoded work missing its participants, while "not encoded" means
        // nothing exists at all. On 19 Aug 2026 that was 49 assemblies being
        // reported as unencoded when they were sitting in the system.
        cells[p.code] = t ? { pct: t.expected ? t.complete / t.expected : null,
                              backlog: t.backlog, attendees: t.attendees,
                              expected: t.expected, complete: t.complete,
                              noAttendees: t.noAttendees, notEncoded: t.notEncoded }
                          : null;
      });
      // Household participation belongs to Assemblies (BA1, BA2, BA3) and is
      // not carried in byMuniActivity, so it is summed from the barangay rows.
      var hh = { listed: 0, present: 0, reporting: 0, complete: 0, noList: 0, gt30: 0, lt30: 0, zero: 0, quorumMet: 0, quorumNotMet: 0 };
      var hh_ba2 = { listed: 0, present: 0, reporting: 0, complete: 0, noList: 0, gt30: 0, lt30: 0, zero: 0, quorumMet: 0, quorumNotMet: 0 };
      var hh_ba3 = { listed: 0, present: 0, reporting: 0, complete: 0, noList: 0, gt30: 0, lt30: 0, zero: 0, quorumMet: 0, quorumNotMet: 0 };
      snap.barangayRows.forEach(function (b) {
        if (b.municipality !== m.municipality || b.province !== m.province) return;
        // BA1 (Seq 2)
        if (b.hhListed > 0) {
          hh.reporting++;
          hh.listed += b.hhListed;
          hh.present += b.hhPresent;
          if (b.hhRate >= 0.7) hh.quorumMet++;
          else hh.quorumNotMet++;
        }
        var lVal = b.hhListed || 0;
        if (lVal > 30) hh.gt30++;
        else if (lVal > 0) hh.lt30++;
        else hh.zero++;
        var ba = b.activities && b.activities['BA1'];
        if (ba && ba.status === 'Complete') {
          hh.complete++;
          if (!b.hhListed) hh.noList++;
        }

        // BA2 (Seq 6)
        var ba2Act = b.activities && b.activities['BA2'];
        if (ba2Act && ba2Act.hhListed > 0) {
          hh_ba2.reporting++;
          hh_ba2.listed += ba2Act.hhListed;
          hh_ba2.present += ba2Act.hhPresent;
          if (ba2Act.hhRate >= 0.7) hh_ba2.quorumMet++;
          else hh_ba2.quorumNotMet++;
        }
        var lVal2 = (ba2Act && ba2Act.hhListed) || 0;
        if (lVal2 > 30) hh_ba2.gt30++;
        else if (lVal2 > 0) hh_ba2.lt30++;
        else hh_ba2.zero++;
        if (ba2Act && ba2Act.status === 'Complete') {
          hh_ba2.complete++;
          if (!ba2Act.hhListed) hh_ba2.noList++;
        }

        // BA3 (Seq 9)
        var ba3Act = b.activities && b.activities['BA3'];
        if (ba3Act && ba3Act.hhListed > 0) {
          hh_ba3.reporting++;
          hh_ba3.listed += ba3Act.hhListed;
          hh_ba3.present += ba3Act.hhPresent;
          if (ba3Act.hhRate >= 0.7) hh_ba3.quorumMet++;
          else hh_ba3.quorumNotMet++;
        }
        var lVal3 = (ba3Act && ba3Act.hhListed) || 0;
        if (lVal3 > 30) hh_ba3.gt30++;
        else if (lVal3 > 0) hh_ba3.lt30++;
        else hh_ba3.zero++;
        if (ba3Act && ba3Act.status === 'Complete') {
          hh_ba3.complete++;
          if (!ba3Act.hhListed) hh_ba3.noList++;
        }
      });
      var cv = snap.volunteers && snap.volunteers.imported ? (snap.volunteers.byMuni[mKey] || null) : null;
      return { province: m.province, municipality: m.municipality,
               batch: m.batch, focalArea: m.focalArea || '',
               households: hh, households_ba2: hh_ba2, households_ba3: hh_ba3, cells: cells,
               volunteers: cv };
    })
  };
}

/** One municipality: the PEA / MDE worklist. */
function apiMunicipality(name, province) {
  var snap = getSnapshot(false);
  var targetMuni = String(name || '').trim(), targetProv = String(province || '').trim();

  // If no municipality selected or 'REGION', return Region-Wide rollup
  if (!targetMuni || targetMuni.toUpperCase() === 'REGION' || targetMuni.toUpperCase() === 'ALL') {
    var bRows = snap.barangayRows;
    if (targetProv && targetProv.toUpperCase() !== 'ALL' && targetProv.toUpperCase() !== 'REGION') {
      var pAlpha = normAlpha(targetProv);
      bRows = bRows.filter(function (r) {
        return normAlpha(r.province) === pAlpha;
      });
    }

    var summary = snap.pipeline.map(function (p) {
      if (!targetProv || targetProv.toUpperCase() === 'ALL' || targetProv.toUpperCase() === 'REGION') {
        var cond = (p.complete || 0) + (p.noAttendees || 0);
        return {
          seq: p.seq, code: p.code, label: p.label, level: p.level, field: p.field,
          stage: p.stage || 1, prioOnly: !!p.prioOnly, households: !!p.households,
          expected: p.expected, conducted: cond, complete: p.complete, noAttendees: p.noAttendees,
          notEncoded: p.notEncoded, attendees: p.attendees, backlog: p.backlog,
          pct: p.expected ? p.complete / p.expected : null,
          conductPct: p.expected ? cond / p.expected : null
        };
      } else {
        var pAlpha = normAlpha(targetProv);
        var exp = 0, comp = 0, noAtt = 0, notEnc = 0, att = 0, bl = 0;
        if (p.level === 'Barangay') {
          bRows.forEach(function (r) {
            // Same rule as the region pipeline: a prioritized-only step is owed
            // by prioritized barangays only, so the province total reconciles.
            if (p.prioOnly && !r.stage2Prio) return;
            var x = r.activities[p.code];
            if (x) {
              exp++;
              if (x.status === STATUS.COMPLETE) comp++;
              else if (x.status === STATUS.NO_ATTENDEES) noAtt++;
              else notEnc++;
              att += (x.attendees || 0);
            }
          });
          bl = bRows.filter(function (r) {
            return (r.todo || []).some(function (t) { return t.indexOf(p.code) !== -1 || t.indexOf(p.label) !== -1; });
          }).length;
        } else {
          snap.municipalRows.forEach(function (m) {
            if (normAlpha(m.province) === pAlpha) {
              var mKey = m.province + '|' + m.municipality;
              var t = (snap.byMuniActivity[mKey] || snap.byMuniActivity[m.municipality] || {})[p.code];
              if (t) {
                exp += t.expected; comp += t.complete; noAtt += t.noAttendees;
                notEnc += t.notEncoded; att += t.attendees; bl += t.backlog;
              }
            }
          });
        }
        var mCond = comp + noAtt;
        return {
          seq: p.seq, code: p.code, label: p.label, level: p.level, field: p.field,
          stage: p.stage || 1, prioOnly: !!p.prioOnly, households: !!p.households,
          expected: exp, conducted: mCond, complete: comp, noAttendees: noAtt,
          notEncoded: notEnc, attendees: att, backlog: bl,
          pct: exp ? comp / exp : null,
          conductPct: exp ? mCond / exp : null
        };
      }
    });

    var mList = snap.municipalRows;
    if (targetProv && targetProv.toUpperCase() !== 'ALL' && targetProv.toUpperCase() !== 'REGION') {
      var pAlpha = normAlpha(targetProv);
      mList = mList.filter(function (m) {
        return normAlpha(m.province) === pAlpha;
      });
    }

    var computedMunis = mList.map(function (m) {
      var mKey = m.province + '|' + m.municipality;
      var bgs = snap.barangayRows.filter(function (b) {
        return b.municipality === m.municipality && b.province === m.province;
      });
      var mOwed = bgs.reduce(function (s, b) { return s + (b.owed || 0); }, 0);
      var mExp = 0, mComp = 0, mNoAtt = 0, mAtt = 0;
      var mActs = {};
      snap.pipeline.forEach(function (p) {
        var t = (snap.byMuniActivity[mKey] || snap.byMuniActivity[m.municipality] || {})[p.code];
        if (t) {
          mExp += t.expected;
          mComp += t.complete;
          mNoAtt += (t.noAttendees || 0);
          mAtt += t.attendees;
          var cond = (t.complete || 0) + (t.noAttendees || 0);
          mActs[p.code] = {
            expected: t.expected,
            conducted: cond,
            complete: t.complete,
            noAttendees: t.noAttendees,
            notEncoded: t.notEncoded,
            attendees: t.attendees,
            backlog: t.backlog,
            pct: t.expected ? t.complete / t.expected : null,
            conductPct: t.expected ? cond / t.expected : null
          };
        } else {
          mActs[p.code] = {
            expected: 0,
            conducted: 0,
            complete: 0,
            noAttendees: 0,
            notEncoded: 0,
            attendees: 0,
            backlog: 0,
            pct: null,
            conductPct: null
          };
        }
      });
      var hhListed = 0, hhPresent = 0, hhReporting = 0, hhMet = 0;
      var baGt30 = 0, baLt30 = 0, baZero = 0;
      bgs.forEach(function (b) {
        if (b.hhListed > 0) {
          hhReporting++;
          hhListed += b.hhListed;
          hhPresent += b.hhPresent;
          if (b.hhRate >= 0.7) hhMet++;
        }
        var listedCount = b.hhListed || 0;
        if (listedCount > 30) {
          baGt30++;
        } else if (listedCount > 0) {
          baLt30++;
        } else {
          baZero++;
        }
      });
      return {
        province: m.province,
        municipality: m.municipality,
        batch: m.batch,
        focalArea: m.focalArea || '',
        totalBarangays: bgs.length,
        owed: mOwed,
        expected: mExp,
        conducted: mComp + mNoAtt,
        complete: mComp,
        noAttendees: mNoAtt,
        pct: mExp ? mComp / mExp : null,
        conductPct: mExp ? (mComp + mNoAtt) / mExp : null,
        attendees: mAtt,
        activities: mActs,
        hhListed: hhListed,
        hhPresent: hhPresent,
        hhReporting: hhReporting,
        hhMet: hhMet,
        hhRate: hhListed ? hhPresent / hhListed : null,
        baGt30: baGt30,
        baLt30: baLt30,
        baZero: baZero
      };
    });

    return {
      municipality: 'Entire Region',
      province: (targetProv && targetProv.toUpperCase() !== 'ALL' && targetProv.toUpperCase() !== 'REGION') ? targetProv : 'Caraga Region',
      batch: 'All Batches',
      focalArea: 'Region-Wide',
      isRegion: true,
      totalMunicipalities: snap.municipalRows.length,
      activities: snap.pipeline.map(function (p) {
        return { seq: p.seq, code: p.code, label: p.label, level: p.level };
      }),
      summary: summary,
      municipalities: computedMunis,
      noAttendeesRecords: snap.noAttendeesRecords || [],
      barangays: bRows,
      owed: bRows.reduce(function (s, r) { return s + r.owed; }, 0)
    };
  }

  // Handle "Province|Municipality"
  if (targetMuni.indexOf('|') !== -1) {
    var parts = targetMuni.split('|');
    targetProv = parts[0].trim();
    targetMuni = parts[1].trim();
  } else if (targetMuni.indexOf('(') !== -1 && targetMuni.indexOf(')') !== -1) {
    // Handle "Municipality (Province)"
    var match = targetMuni.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      targetMuni = match[1].trim();
      targetProv = match[2].trim();
    }
  }

  var targetMuniAlpha = normAlpha(targetMuni);
  var targetProvAlpha = targetProv ? normAlpha(targetProv) : '';

  // Exact or normalized match in barangayRows
  var rows = snap.barangayRows.filter(function (r) {
    var mMatch = (normKey(r.municipality) === normKey(targetMuni)) || (normAlpha(r.municipality) === targetMuniAlpha);
    var pMatch = targetProv ? ((normKey(r.province) === normKey(targetProv)) || (normAlpha(r.province) === targetProvAlpha)) : true;
    return mMatch && pMatch;
  });

  // If no rows with province filter, match by municipality name alone
  if (!rows.length && targetMuniAlpha) {
    rows = snap.barangayRows.filter(function (r) {
      return (normKey(r.municipality) === normKey(targetMuni)) || (normAlpha(r.municipality) === targetMuniAlpha);
    });
  }

  if (rows.length) {
    targetMuni = rows[0].municipality;
    targetProv = rows[0].province;
    targetMuniAlpha = normAlpha(targetMuni);
    targetProvAlpha = normAlpha(targetProv);
    // A bare name such as "Loreto" matches two municipalities. Keep the barangay
    // list to the one the summary below describes.
    rows = rows.filter(function (r) {
      return r.municipality === targetMuni && r.province === targetProv;
    });
  }

  var mKey = targetProv ? targetProv + '|' + targetMuni : targetMuni;
  var muniTally = snap.byMuniActivity[mKey] ||
                  snap.byMuniActivity[normKey(targetProv) + '|' + normKey(targetMuni)] ||
                  snap.byMuniActivity[targetProvAlpha + '|' + targetMuniAlpha] ||
                  snap.byMuniActivity[targetMuni] ||
                  snap.byMuniActivity[normKey(targetMuni)] ||
                  snap.byMuniActivity[targetMuniAlpha];

  // Fuzzy/partial fallback search across municipal rows
  if (!rows.length && !muniTally) {
    for (var i = 0; i < snap.municipalRows.length; i++) {
      var mr = snap.municipalRows[i];
      var mrAlpha = normAlpha(mr.municipality);
      if (mrAlpha.indexOf(targetMuniAlpha) !== -1 || targetMuniAlpha.indexOf(mrAlpha) !== -1) {
        targetMuni = mr.municipality;
        targetProv = mr.province;
        targetMuniAlpha = normAlpha(targetMuni);
        targetProvAlpha = normAlpha(targetProv);
        rows = snap.barangayRows.filter(function (r) {
          return r.municipality === targetMuni && r.province === targetProv;
        });
        mKey = targetProv + '|' + targetMuni;
        muniTally = snap.byMuniActivity[mKey] || snap.byMuniActivity[targetProvAlpha + '|' + targetMuniAlpha];
        break;
      }
    }
  }

  if (!rows.length && !muniTally) {
    throw new Error('Municipality "' + name + '" is not found in the monitored baseline. Please check Import & Setup > Baseline.');
  }

  var summary = snap.pipeline.map(function (p) {
    var t = (muniTally || {})[p.code] ||
            { expected: 0, complete: 0, noAttendees: 0, notEncoded: 0,
              attendees: 0, backlog: 0 };
    var cond = (t.complete || 0) + (t.noAttendees || 0);
    return { seq: p.seq, code: p.code, label: p.label, level: p.level,
             field: p.field, expected: t.expected,
             conducted: cond,
             complete: t.complete,
             noAttendees: t.noAttendees, notEncoded: t.notEncoded,
             attendees: t.attendees, backlog: t.backlog,
             pct: t.expected ? t.complete / t.expected : null,
             conductPct: t.expected ? cond / t.expected : null };
  });

  var muni = null;
  snap.municipalRows.forEach(function (m) {
    if ((normAlpha(m.municipality) === targetMuniAlpha) && (!targetProvAlpha || normAlpha(m.province) === targetProvAlpha)) {
      muni = m;
    }
  });

  var cvMuni = snap.volunteers && snap.volunteers.imported
    ? (snap.volunteers.byMuni[(muni ? muni.province : targetProv) + '|' + (muni ? muni.municipality : targetMuni)] || null) : null;
  return {
    volunteers: cvMuni,
    municipality: muni ? muni.municipality : targetMuni,
    province: muni ? muni.province : targetProv,
    batch: muni ? muni.batch : '',
    focalArea: muni ? (muni.focalArea || '') : '',
    activities: snap.pipeline.map(function (p) {
      return { seq: p.seq, code: p.code, label: p.label, level: p.level,
               stage: p.stage || 1, prioOnly: !!p.prioOnly, households: !!p.households };
    }),
    summary: summary,
    noAttendeesRecords: (snap.noAttendeesRecords || []).filter(function (r) {
      var mMatch = normAlpha(r.municipality) === targetMuniAlpha;
      var pMatch = targetProvAlpha ? normAlpha(r.province) === targetProvAlpha : true;
      return mMatch && pMatch;
    }),
    barangays: rows,
    owed: rows.reduce(function (s, r) { return s + r.owed; }, 0)
  };
}

/**
 * Trend, optionally narrowed to one activity or municipality.
 *
 * The chart series is built from EVERY history row before anything is
 * truncated. Truncating first and charting the remainder silently drops the
 * oldest snapshots and draws a shorter, flatter line than the truth.
 */
function apiHistory(activity, municipality) {
  var recs = readHistory({
    activity: activity || null,
    municipality: municipality || null
  });

  var allDates = historyDates();
  var byDate = {};

  // Initialize every known snapshot date so none are ever dropped
  allDates.forEach(function (d) {
    byDate[d] = { date: d, expected: 0, complete: 0, backlog: 0, attendees: 0 };
  });

  if (municipality && municipality !== 'REGION') {
    // Specific municipality selected
    recs.forEach(function (r) {
      if (byDate[r.date]) {
        byDate[r.date].expected  += r.expected;
        byDate[r.date].complete  += r.complete;
        byDate[r.date].backlog   += r.backlog;
        byDate[r.date].attendees += r.attendees;
      }
    });
  } else {
    // Regional total: check if REGION rows exist for each date
    var regionRecs = recs.filter(function (r) { return r.municipality === 'REGION'; });
    var datesWithRegion = {};
    regionRecs.forEach(function (r) {
      datesWithRegion[r.date] = true;
      if (byDate[r.date]) {
        byDate[r.date].expected  += r.expected;
        byDate[r.date].complete  += r.complete;
        byDate[r.date].backlog   += r.backlog;
        byDate[r.date].attendees += r.attendees;
      }
    });

    // If any date did not have REGION rows, aggregate from municipal rows for that date
    var muniRecs = recs.filter(function (r) { return r.municipality !== 'REGION'; });
    muniRecs.forEach(function (r) {
      if (!datesWithRegion[r.date] && byDate[r.date]) {
        byDate[r.date].expected  += r.expected;
        byDate[r.date].complete  += r.complete;
        byDate[r.date].backlog   += r.backlog;
        byDate[r.date].attendees += r.attendees;
      }
    });
  }

  var series = Object.keys(byDate).sort().map(function (d) { return byDate[d]; });

  // Aggregate municipal totals per date across activities (for Triage Deck & breakdown)
  var muniByDate = {};
  allDates.forEach(function (d) {
    muniByDate[d] = {};
  });

  recs.forEach(function (r) {
    if (r.municipality === 'REGION' || r.municipality === 'Caraga Region Total') return;
    var d = r.date;
    if (!muniByDate[d]) return;
    var key = (r.province ? r.province + '|' : '') + r.municipality;
    if (!muniByDate[d][key]) {
      muniByDate[d][key] = {
        province: r.province || '',
        municipality: r.municipality,
        dComplete: 0,
        dAttendees: 0,
        complete: 0,
        expected: 0,
        backlog: 0
      };
    }
    muniByDate[d][key].dComplete  += (r.dComplete || 0);
    muniByDate[d][key].dAttendees += (r.dAttendees || 0);
    muniByDate[d][key].complete   += (r.complete || 0);
    muniByDate[d][key].expected   += (r.expected || 0);
    muniByDate[d][key].backlog    += (r.backlog || 0);
  });

  // Group latest cycle progress per municipality for Fast / Slow / Zero triage fallback
  var latestDate = allDates[allDates.length - 1];
  var muniSummary = {};
  var allMunis = readAllMunicipalities().filter(function (m) { return m.monitored; });
  allMunis.forEach(function (m) {
    var key = m.province + '|' + m.municipality;
    muniSummary[key] = {
      province: m.province,
      municipality: m.municipality,
      dComplete: 0,
      dAttendees: 0,
      complete: 0,
      expected: 0,
      backlog: 0
    };
  });

  recs.forEach(function (r) {
    if (r.date === latestDate && r.municipality !== 'REGION') {
      var key = r.province + '|' + r.municipality;
      if (!muniSummary[key]) {
        muniSummary[key] = {
          province: r.province,
          municipality: r.municipality,
          dComplete: 0,
          dAttendees: 0,
          complete: 0,
          expected: 0,
          backlog: 0
        };
      }
      muniSummary[key].dComplete += (r.dComplete || 0);
      muniSummary[key].dAttendees += (r.dAttendees || 0);
      muniSummary[key].complete += (r.complete || 0);
      muniSummary[key].expected += (r.expected || 0);
      muniSummary[key].backlog += (r.backlog || 0);
    }
  });

  var muniDeltas = Object.keys(muniSummary).map(function (k) { return muniSummary[k]; });
  if (municipality && municipality !== 'REGION') {
    var selProv = '', selMuni = municipality;
    if (municipality.indexOf('|') !== -1) {
      var sParts = municipality.split('|');
      selProv = sParts[0].trim();
      selMuni = sParts[1].trim();
    } else if (municipality.indexOf('(') !== -1 && municipality.indexOf(')') !== -1) {
      var sMatch = municipality.match(/^(.*?)\s*\((.*?)\)$/);
      if (sMatch) {
        selMuni = sMatch[1].trim();
        selProv = sMatch[2].trim();
      }
    }
    var sMuniKey = normKey(selMuni);
    var sProvKey = selProv ? normKey(selProv) : '';
    muniDeltas = muniDeltas.filter(function (m) {
      var mMatch = (normKey(m.municipality) === sMuniKey) || (normAlpha(m.municipality) === normAlpha(selMuni));
      var pMatch = sProvKey ? ((normKey(m.province) === sProvKey) || (normAlpha(m.province) === normAlpha(selProv))) : true;
      return mMatch && pMatch;
    });
  }

  // Only municipality rows that actually moved are worth a line in the table (exclude regional aggregate)
  var moved = recs.filter(function (r) {
    return r.prevDate && r.municipality !== 'REGION' && (r.dComplete || r.dAttendees || r.dNotEncoded);
  }).sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return Math.abs(b.dComplete) - Math.abs(a.dComplete);
  });

  return {
    dates: allDates,
    series: series,
    matched: recs.length,
    muniByDate: muniByDate,
    muniDeltas: muniDeltas,
    rows: moved.slice(0, 400),
    rowsTotal: moved.length,
    stalled: stalled(2)
  };
}

/**
 * Time-series history across all saved snapshot dates for the Runway's multi-waypoint
 * ghost trails, progression timeline, and interactive time-travel playback.
 */
function apiRunwayTrail() {
  var dates = historyDates();
  var byMuniDate = {};
  var prev = dates.length >= 2 ? dates[dates.length - 2] : null;
  var latest = dates.length ? dates[dates.length - 1] : null;
  var legacyPrevCells = {};

  readHistory(null).forEach(function (r) {
    if (r.municipality === 'REGION' || r.municipality === 'Caraga Region Total') return;
    var k = r.province ? r.province + '|' + r.municipality : r.municipality;
    if (!byMuniDate[k]) byMuniDate[k] = {};
    if (!byMuniDate[k][r.date]) byMuniDate[k][r.date] = {};
    byMuniDate[k][r.date][r.activity] = {
      complete: r.complete || 0,
      expected: r.expected || 0,
      backlog: r.backlog || 0,
      attendees: r.attendees || 0,
      noAttendees: r.noAttendees !== undefined ? r.noAttendees : 0,
      notEncoded: r.notEncoded !== undefined ? r.notEncoded : 0
    };

    if (r.date === prev) {
      if (!legacyPrevCells[k]) legacyPrevCells[k] = {};
      legacyPrevCells[k][r.activity] = {
        complete: r.complete || 0,
        expected: r.expected || 0,
        backlog: r.backlog || 0,
        attendees: r.attendees || 0,
        noAttendees: r.noAttendees !== undefined ? r.noAttendees : 0,
        notEncoded: r.notEncoded !== undefined ? r.notEncoded : 0
      };
    }
  });

  return {
    dates: dates,
    prevDate: prev,
    latestDate: latest,
    cells: legacyPrevCells,
    byMuniDate: byMuniDate,
    snapshots: dates.length
  };
}

function apiVerifyPasskey(passkey, userName) {
  var key = String(passkey || '').trim();
  var expected = getEditorPasskey_();
  if (key && key === expected) {
    setActivePasskey_(key);
    return { ok: true, editor: true, token: key, userName: userName || 'Editor' };
  }
  return { ok: false, error: 'Incorrect editor passkey. Please check with your team administrator.' };
}

function apiChangePasskey(currentPasskey, newPasskey) {
  requireEditor_(currentPasskey);
  var newKey = String(newPasskey || '').trim();
  if (!newKey || newKey.length < 4) {
    throw new Error('New passkey must be at least 4 characters long.');
  }
  PropertiesService.getScriptProperties().setProperty('EDITOR_PASSKEY', newKey);
  setActivePasskey_(newKey);
  return { ok: true, message: 'Editor passkey updated successfully.' };
}

function apiSetFieldConduct(code, value, passkey) {
  if (passkey) setActivePasskey_(passkey);
  setFieldConduct(code, value, passkey);
  return apiOverview(passkey);
}

function apiSetAllFieldConduct(value, passkey) {
  if (passkey) setActivePasskey_(passkey);
  setAllFieldConduct(value, passkey);
  return apiOverview(passkey);
}

function apiSetMonitored(municipality, on, passkey) {
  if (passkey) setActivePasskey_(passkey);
  setMonitored(municipality, on, passkey);
  return apiOverview(passkey);
}

function apiSetAllMonitored(on, passkey) {
  if (passkey) setActivePasskey_(passkey);
  setAllMonitored(on, passkey);
  return apiOverview(passkey);
}

function apiRefresh(passkey) {
  if (passkey) setActivePasskey_(passkey);
  getSnapshot(true);
  return apiOverview(passkey);
}

function apiSetAppraisal(province, municipality, status, dateIso, passkey) {
  if (passkey) setActivePasskey_(passkey);
  setAppraisal(province, municipality, status, dateIso, passkey);
  return apiOverview(passkey);
}

function apiSaveDeadlines(deadlines, passkey) {
  requireEditor_(passkey);
  saveSettings(deadlines);
  return apiOverview(passkey);
}

/** Saves the full deadline list (Import & Setup › Management Target Deadlines). */
function apiSaveTargets(list, editorName, passkey) {
  requireEditor_(passkey);
  saveTargets(list, editorName);
  return apiOverview(passkey);
}

// ===================================================================
// REPORTING CENTER & FIELD DISPATCH ENDPOINTS
// ===================================================================

function apiGetRecipientDirectory() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('RECIPIENT_DIRECTORY') || '{}';
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function apiSaveRecipientDirectory(data, passkey) {
  requireEditor_(passkey);
  try {
    PropertiesService.getScriptProperties().setProperty('RECIPIENT_DIRECTORY', JSON.stringify(data || {}));
    return { success: true, directory: data };
  } catch (e) {
    throw new Error('Failed to save recipient directory: ' + e.message);
  }
}

function apiSendFieldReport(payload, passkey) {
  requireEditor_(passkey);
  if (!payload || !payload.to) {
    throw new Error('Recipient email (To) is required.');
  }
  if (!payload.subject) {
    throw new Error('Email subject is required.');
  }

  var to = (payload.to || '').trim();
  var cc = (payload.cc || '').trim();
  var subject = payload.subject.trim();
  var htmlBody = payload.htmlBody || '';
  var body = payload.plainTextBody || 'Please view this monitoring advisory in an HTML-compatible email client.';

  var mailOptions = {
    to: to,
    subject: subject,
    body: body,
    htmlBody: htmlBody,
    name: 'DSWD PCRP Encoding Monitor'
  };
  if (cc) mailOptions.cc = cc;

  try {
    MailApp.sendEmail(mailOptions);
  } catch (err) {
    if (err.message && (err.message.indexOf('permission') !== -1 || err.message.indexOf('Authorization') !== -1 || err.message.indexOf('script.send_mail') !== -1)) {
      throw new Error('Email authorization required: Please open the Google Sheet, click "🚀 PCRP Monitor > 🔑 Authorize Email Sending & Test" to grant email permission to the system.');
    }
    throw new Error('Email dispatch failed: ' + err.message);
  }

  // Also persist to directory if user checked "Save as Default"
  if (payload.saveAsDefault && payload.targetKey) {
    try {
      var dir = apiGetRecipientDirectory();
      dir[payload.targetKey] = { to: to, cc: cc, updatedAt: new Date().toISOString() };
      PropertiesService.getScriptProperties().setProperty('RECIPIENT_DIRECTORY', JSON.stringify(dir));
    } catch (e) {}
  }

  return {
    success: true,
    sentAt: new Date().toISOString(),
    to: to,
    cc: cc,
    subject: subject
  };
}

/**
 * Automatically creates a custom menu in the Google Sheet when opened.
 * Provides a 1-click way to trigger Google's native OAuth consent dialog.
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🚀 PCRP Monitor')
      .addItem('🔑 Authorize Email (Opens Google Popup)', 'triggerEmailAuthorization')
      .addToUi();
  } catch (e) {
    // Silently ignore if running in an execution context without spreadsheet UI
  }
}

/**
 * FORCE AUTHORIZATION FUNCTION (NO TRY-CATCH).
 * 
 * IMPORTANT: This function deliberately does NOT use try-catch around MailApp.
 * When an unhandled MailApp call is executed, Google Apps Script intercepts it
 * and displays the native "Authorization Required -> Review Permissions" popup modal!
 */
function triggerEmailAuthorization() {
  var userEmail = '';
  try {
    userEmail = Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail();
  } catch (e) {}
  var target = userEmail || 'authorized-encoder@dswd.gov.ph';

  // Raw invocation forces Google Apps Script OAuth prompt
  MailApp.sendEmail(
    target,
    '✅ DSWD PCRP Encoding Monitor — Email Permissions Granted',
    'Email dispatch has been successfully authorized for your Google account!\n\nYou can now send emails directly from the Web App.'
  );

  try {
    SpreadsheetApp.getUi().alert(
      'Authorization Successful',
      '✅ Email sending permissions have been successfully granted!\n\nA verification email was sent to: ' + target,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {
    Logger.log('Authorized for: ' + target);
  }
}
