// ===================================================================
// APP — import, pages and export. All figures come from the monitor's own
// functions (apiOverview, apiMatrix, barangay rows, Data Health checks).
// ===================================================================

var PREFS_KEY = 'pcrp-desktop:v1';
var LOADED = {};          // kind -> { file, sheet, rows }
var IMPORT_ERRORS = [];   // { file, error }
var STATE = { page: 'settings', stage: 1, prov: '', muniSearch: '', muniFilter: 'all', muniSort: { col: 'muni', dir: 'asc' }, muni: '', brgySearch: '', brgyFilter: 'all', brgySort: { col: 'brgy', dir: 'asc' }, ovSearch: '', ovSort: { col: 'seq', dir: 'asc' }, ovFilter: 'all', ovSeqFilter: '', settingsSearch: '', settingsSort: { col: 'seq', dir: 'asc' }, computed: false, computedAt: null, ms: 0, dqaOrigin: null };
var FIELD_VALUES = ['Not started', 'On-going', 'Completed'];

var APP_VERSION = '@@VERSION@@';
var DEFAULT_UPDATE_URL = 'https://raw.githubusercontent.com/hidalgokimjohn/pcrp-monitor-desktop/main/version.json';
var UPDATE_STATE = {
  checking: false,
  downloading: false,
  downloadProgress: '',
  result: null,
  error: null,
  lastChecked: null
};

function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;
  var parse = function (v) {
    return String(v).replace(/^v/i, '').split('.').map(function (x) { return parseInt(x, 10) || 0; });
  };
  var a = parse(v1), b = parse(v2);
  var len = Math.max(a.length, b.length);
  for (var i = 0; i < len; i++) {
    var p1 = a[i] || 0, p2 = b[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

function renderBrandUpdateStatus() {
  var el = $('brand-update-status');
  if (!el) return;

  if (UPDATE_STATE.checking) {
    el.innerHTML = '<span class="brand-status-chip checking" title="Checking GitHub feed for latest version…">' +
      '<span class="status-pulse-dot spin"></span>' +
      '<span>Checking updates…</span>' +
    '</span>';
    return;
  }

  if (UPDATE_STATE.result && UPDATE_STATE.result.updateAvailable) {
    var v = UPDATE_STATE.result.remote ? UPDATE_STATE.result.remote.version : '';
    el.innerHTML = '<button type="button" class="brand-status-chip has-update" data-act="open-updates" title="New version v' + esc(v) + ' available! Click to view release notes and download.">' +
      '<span class="status-pulse-dot alert"></span>' +
      '<span>🎉 Update available: <strong>v' + esc(v) + '</strong></span>' +
      '<span class="brand-status-arrow">↗</span>' +
    '</button>';
    return;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    el.innerHTML = '<span class="brand-status-chip offline" title="Working offline (100% field ready). Connect to internet to check for updates.">' +
      '<span class="status-pulse-dot idle"></span>' +
      '<span>Field Offline</span>' +
    '</span>';
    return;
  }

  // Default / up to date
  el.innerHTML = '<span class="brand-status-chip up-to-date" data-act="update-check" title="Your app is up to date (v' + esc(APP_VERSION) + '). Click to check for updates now.">' +
    '<span class="status-pulse-dot good"></span>' +
    '<span>Your app is up to date!</span>' +
  '</span>';
}

function checkForUpdates(manual) {
  if (UPDATE_STATE.checking) return;

  var p = prefs();
  var feedUrl = (p.updateUrl || DEFAULT_UPDATE_URL).trim();

  if (!navigator.onLine) {
    UPDATE_STATE.checking = false;
    UPDATE_STATE.error = 'You are currently offline. Connect to Wi-Fi or mobile data to check for updates.';
    if (manual) toast(UPDATE_STATE.error);
    renderSettings();
    renderBrandUpdateStatus();
    return;
  }

  UPDATE_STATE.checking = true;
  UPDATE_STATE.error = null;
  renderSettings();
  renderBrandUpdateStatus();

  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
  var opts = { cache: 'no-store' };
  if (controller) opts.signal = controller.signal;

  fetch(feedUrl, opts)
    .then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Update feed (version.json) was not found on GitHub (HTTP 404). It has not been committed & pushed to the main branch yet.');
        }
        throw new Error('Server returned HTTP ' + res.status);
      }
      return res.json();
    })
    .then(function (data) {
      UPDATE_STATE.checking = false;
      var now = new Date();
      UPDATE_STATE.lastChecked = now;
      p.lastUpdateCheck = now.toISOString();
      savePrefs(p);

      if (!data || !data.version) {
        throw new Error('Invalid update feed format (missing version).');
      }

      var isNewer = compareVersions(data.version, APP_VERSION) > 0;
      UPDATE_STATE.result = {
        updateAvailable: isNewer,
        remote: data
      };

      if (isNewer) {
        toast('Update available: v' + data.version + '! Click the update badge in the header to view.');
      } else {
        if (manual) toast('You are on the latest version (v' + APP_VERSION + ').');
      }
      renderSettings();
      updateTabBadges();
      renderStatus();
      renderBrandUpdateStatus();
    })
    .catch(function (err) {
      if (timer) clearTimeout(timer);
      UPDATE_STATE.checking = false;
      var msg = err.name === 'AbortError'
        ? 'Connection timed out. Please check your internet connection.'
        : ('Could not check for updates: ' + (err.message || 'Network error'));
      UPDATE_STATE.error = msg;
      if (manual) toast(msg);
      renderSettings();
      renderBrandUpdateStatus();
    });
}

function downloadAppUpdate() {
  if (!UPDATE_STATE.result || !UPDATE_STATE.result.remote) return;
  var remote = UPDATE_STATE.result.remote;
  var url = remote.downloadUrl;
  if (!url) {
    if (remote.releaseUrl) window.open(remote.releaseUrl, '_blank');
    return;
  }

  if (UPDATE_STATE.downloading) return;
  UPDATE_STATE.downloading = true;
  UPDATE_STATE.downloadProgress = 'Downloading v' + remote.version + '…';
  renderSettings();
  toast('Starting download of v' + remote.version + '…');

  fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' downloading update');
      return res.blob();
    })
    .then(function (blob) {
      UPDATE_STATE.downloading = false;
      UPDATE_STATE.downloadProgress = '';
      var filename = 'PCRP_Encoding_and_Data_Quality_Assessment_Tool_v' + remote.version + '.html';
      saveBlob(blob, filename);
      toast('Update downloaded! Open the new file from your Downloads folder.');
      renderSettings();
    })
    .catch(function (err) {
      UPDATE_STATE.downloading = false;
      UPDATE_STATE.downloadProgress = '';
      toast('Direct download failed: ' + err.message + '. Opening download page…');
      if (remote.releaseUrl) {
        window.open(remote.releaseUrl, '_blank');
      } else {
        window.open(url, '_blank');
      }
      renderSettings();
    });
}

// ---- small helpers ---------------------------------------------------------

// Settings are remembered in browser storage when it is available; otherwise
// (blocked storage, some locked-down PCs) they are kept in memory for this
// window, so the app never gets stuck.
var MEM_PREFS = null, PREFS_WARNED = false;
function prefs() {
  try {
    var s = localStorage.getItem(PREFS_KEY);
    if (s !== null) return JSON.parse(s);
  } catch (e) { /* storage blocked */ }
  return MEM_PREFS ? clone(MEM_PREFS) : {};
}
function savePrefs(p) {
  MEM_PREFS = clone(p);
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); }
  catch (e) {
    if (!PREFS_WARNED) { PREFS_WARNED = true; toast('This browser blocks saved settings: they apply until this window is closed.'); }
  }
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function attr(s) { return esc(s).replace(/'/g, '&#39;'); }
function pctOf(a, b) { return b ? a / b : null; }
function pctText(v) { return v === null || v === undefined ? '—' : (Math.round(v * 1000) / 10).toFixed(1) + '%'; }
function today() { return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

function bindSearch(id, fn) {
  var el = $(id);
  if (!el) return;
  el.addEventListener('input', function () {
    var v = el.value, pos = el.selectionStart;
    fn(v);
    var again = $(id);
    if (again) { again.focus({ preventScroll: true }); try { again.setSelectionRange(pos, pos); } catch (e) {} }
  });
}

function cmpValues(a, b) {
  if (a === b) return 0;
  var aEmpty = a === null || a === undefined || a === '' || a === '—';
  var bEmpty = b === null || b === undefined || b === '' || b === '—';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === 'number' && typeof b === 'number') {
    if (isNaN(a)) return 1;
    if (isNaN(b)) return -1;
    return a - b;
  }
  var na = Number(a), nb = Number(b);
  if (!isNaN(na) && !isNaN(nb) && typeof a !== 'boolean' && typeof b !== 'boolean') {
    return na - nb;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function tblSort(list, col, dir, extractors) {
  var ext = (extractors && extractors[col]) || (typeof col === 'function' ? col : function (r) { return r ? r[col] : undefined; });
  var mult = dir === 'desc' ? -1 : 1;
  return list.slice().sort(function (a, b) {
    var va = ext(a), vb = ext(b);
    var aEmpty = va === null || va === undefined || va === '' || va === '—';
    var bEmpty = vb === null || vb === undefined || vb === '' || vb === '—';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    return cmpValues(va, vb) * mult;
  });
}

// ===================================================================
// FLOATING HELPER TOOLTIP POPOVER SYSTEM & PCRP GLOSSARY
// ===================================================================

var PCRP_GLOSSARY = {
  'k2': {
    title: 'BA HH Rate (Barangay Assembly Household Participation Rate)',
    badge: 'Quorum Target: ≥70%',
    desc: 'Barangay Assembly Household Participation Rate: The percentage of all listed households in the barangay present at the assembly. Kalahi-CIDSS policy requires at least 70% household representation for a valid quorum. Calculated as: Total Households Represented ÷ Total Households in Barangay.',
    ref: 'SM1 §4.2 · Household Quorum'
  },
  'k2_ba2': {
    title: 'BA HH Rate · 2nd BA Quorum (Selection of CSPMC & Sub-Projects)',
    badge: 'Quorum Target: ≥70%',
    desc: '2nd Barangay Assembly Household Participation Rate: Selection of CSPMC, Planning for SP Implementation & Concept Note. Kalahi-CIDSS policy requires at least 70% household representation for a valid assembly quorum.',
    ref: 'SM1 §5.1 · 2nd BA Quorum'
  },
  'k2_ba3': {
    title: 'BA HH Rate · 3rd BA Quorum (Sub-Project Proposal Approval)',
    badge: 'Quorum Target: ≥70%',
    desc: '3rd Barangay Assembly Household Participation Rate: Presentation and Approval of Community Resilience Sub-Project Proposal. Kalahi-CIDSS policy requires at least 70% household representation for proposal approval.',
    ref: 'SM1 §5.4 · 3rd BA Quorum'
  },
  'lacking': {
    title: 'Activity Backlog (Unencoded / Attendance Not Encoded)',
    badge: 'Field Compliance',
    desc: 'Activities conducted in the field with missing KCIS records or zero reported participants after the existing encoding window. Review the source records.',
    ref: 'SM7 §4 · Encoding Timeliness'
  },
  'sfmsc': {
    title: 'Stakeholder & Feedback Mechanism Sub-Committee (SFMSC)',
    badge: 'Stage 1 Body',
    desc: 'Community volunteer sub-committee elected during the 1st Barangay Assembly to handle community transparency, grievance handling, and citizen feedback.',
    ref: 'SM1 §4.1 · Governance'
  },
  'brest': {
    title: 'Barangay Resilience Team (BResT)',
    badge: 'Stage 1 Body',
    desc: 'Community volunteer team formed in the 1st BA to lead disaster risk assessment, hazard spot mapping, and resilience planning. Must include at least 30% marginalized representation (women, IP, PWD). No chairperson needed.',
    ref: 'SM1 §3.1 & BResT Policy'
  },
  'cspmc': {
    title: 'CSPMC (CRSPMC)',
    badge: 'Stage 2 Body',
    desc: 'Community Resilience Sub-Project Management Committee: Community body executing and managing sub-projects, comprising 8 specialized sub-committees (PIT, PT, AIT, O&MT, CMSC, etc.).',
    ref: 'SM1 §5 · Sub-Project Dev.'
  },
  'mrest': {
    title: 'Municipal Resilience Team (MResT)',
    badge: 'LGU Executive Body',
    desc: 'Municipal multi-sectoral body established via Mayor\'s Executive Order (EO) to coordinate, review, and support community resilience projects across all barangays.',
    ref: 'SM1 §2.3 · Municipal EO'
  },
  'prva': {
    title: 'PRVA (Risk Assessment)',
    badge: 'Stage 1 Milestone',
    desc: 'Participatory Risk & Vulnerability Assessment: Community-driven hazard identification, spot mapping, and vulnerability profiling conducted by the BResT with community sectors.',
    ref: 'SM1 §4.3 · PRVA Workshop'
  },
  'dqa': {
    title: 'Data Quality Assessment (DQA)',
    badge: 'SM7 Table 8',
    desc: 'Verification of electronic KCIS data against physical paper source forms across 6 dimensions: Accuracy, Reliability, Completeness, Precision, Timeliness, and Integrity.',
    ref: 'SM7 §6 · M&E Verification'
  },
  'kcis': {
    title: 'KCIS Management System',
    badge: 'Core Database',
    desc: 'KALAHI-CIDSS Comprehensive Information System: National online repository for recording participant attendance, household profiles, volunteer registries, and sub-projects.',
    ref: 'MIS Operational Guidelines'
  },
  'crip': {
    title: 'CRIP Operational Cycle',
    badge: '4-Stage Process',
    desc: 'Community Resilience Implementation Process: Stage 1 (Assessment & Planning), Stage 2 (Sub-Project Development), Stage 3 (Community Implementation), and Stage 4 (Monitoring & Accountability).',
    ref: 'Program Operations Manual'
  },
  'ba1': {
    title: '1st Barangay Assembly (BA1)',
    badge: 'Orientation & Selection',
    desc: 'First community assembly: Project orientation, formation of the Barangay Resilience Team (BResT), and election of the Stakeholder & Feedback Mechanism Sub-Committee (SFMSC).',
    ref: 'SM1 §4.1 · BA1 Guidelines'
  },
  'ba2': {
    title: '2nd Barangay Assembly (BA2)',
    badge: 'PRVA Validation',
    desc: 'Community assembly where the BResT presents PRVA findings and spot maps to the community for validation and committee formation.',
    ref: 'SM1 §4.4 · BA2 Guidelines'
  },
  'ba3': {
    title: '3rd Barangay Assembly (BA3)',
    badge: 'Sub-Project Approval',
    desc: 'Stage 2 community assembly convened to review and formally approve the community resilience sub-project proposal before technical review.',
    ref: 'SM1 §5.3 · BA3 Guidelines'
  },
  'ba4': {
    title: '4th Barangay Assembly (BA4)',
    badge: 'Accountability Reporting',
    desc: 'Final assembly (Barangay Accountability Reporting / BAR): Community volunteers report on completed sub-projects, financial audits, physical turnover, and O&M plans.',
    ref: 'SM1 §6.2 · Accountability'
  },
  'cmsc': {
    title: 'Community Monitoring Sub-Committee (CMSC)',
    badge: 'Independent Oversight',
    desc: 'Independent committee under CSPMC that inspects civil works, monitors procurement, and verifies labor payments. Policy encourages inclusion of Stage 1 BResT alumni.',
    ref: 'SM7 p. 15 · Annex L'
  },
  'pit': {
    title: 'Project Implementation Team (PIT)',
    badge: 'CSPMC Sub-Committee',
    desc: 'Technical sub-committee supervising daily construction, managing on-site materials, maintaining labor logs, and reporting physical milestones.',
    ref: 'SM1 §5.2 · Technical Execution'
  },
  'pt': {
    title: 'Community Procurement Team (PT)',
    badge: 'CSPMC Sub-Committee',
    desc: 'Sub-committee handling canvassing, public bidding, quotation evaluations, and purchase orders in strict accordance with community procurement guidelines.',
    ref: 'Community Procurement Manual'
  },
  'ait': {
    title: 'Audit & Inventory Team (AIT)',
    badge: 'CSPMC Sub-Committee',
    desc: 'Independent oversight body reviewing cash vouchers, bank reconciliations, inventory deliveries, and warehouse stock records.',
    ref: 'Financial Management Manual'
  },
  'omt': {
    title: 'Operations & Maintenance Team (O&MT)',
    badge: 'Sustainability Body',
    desc: 'Community team creating the upkeep schedule, collecting maintenance funds, and preserving sub-project functionality after formal turnover.',
    ref: 'O&M Sustainability Guidelines'
  },
  'sfmsc': {
    title: 'Stakeholder & Feedback Mechanism (SFMSC)',
    badge: 'Grievance Redress',
    desc: 'Sub-committee managing the Grievance Redress System (GRS): installs suggestion boxes, records community concerns, logs feedback, and facilitates resolution.',
    ref: 'SM1 §4.1 · GRS Framework'
  },
  'spdw': {
    title: 'Sub-Project Development Workshop (SPDW)',
    badge: 'Stage 2 Workshop',
    desc: 'Technical workshop where volunteers and technical facilitators formulate Detailed Engineering Designs (DED), Program of Works (POW), and procurement plans.',
    ref: 'SM1 §5.1 · SPDW Manual'
  },
  '7day': {
    title: '7-Day Encoding Rule',
    badge: 'Timeliness Standard',
    desc: 'Data Health standard: field activity proceedings and attendance sheets must be encoded into the KCIS within 7 calendar days of the event conduct date.',
    ref: 'SM7 §4 · Encoding Timeliness'
  },
  'marginalized': {
    title: 'Marginalized Sector Quota',
    badge: 'Policy: ≥30% Target',
    desc: 'Affirmative action requirement: at least 30% of volunteer committee members must be from vulnerable sectors (Indigenous Peoples, PWD, solo parents, elderly).',
    ref: 'BResT Composition Policy'
  },
  'femaleratio': {
    title: 'Gender Inclusion Target',
    badge: 'Target: ≥50% Women',
    desc: 'Promotes women\'s leadership and active participation, aiming for at least 50% female representation in community assemblies and committees.',
    ref: 'Gender & Development (GAD)'
  },
  'lacking': {
    title: 'Lacking Encoding Status',
    badge: 'Field Compliance',
    desc: 'Activity marked as Completed in field conduct but missing from the KCIS database, or past the permissible encoding window.',
    ref: 'Encoding Pipeline Rules'
  },
  'nosheet': {
    title: 'Attendance Encoding Status',
    badge: 'Zero Reported Participants',
    desc: 'Activity Tracker reports zero participants. This does not establish whether a signed attendance sheet is attached.',
    ref: 'Data Health Validation'
  }
};

function helper(termKey, text, extraClass) {
  var t = PCRP_GLOSSARY[termKey];
  if (!t) return text || '';
  return '<span class="helper-term' + (extraClass ? ' ' + extraClass : '') + '" data-term="' + attr(termKey) + '">' +
    (text || esc(t.title)) + '</span>';
}

var _activeTooltipTarget = null;
var _tooltipHideTimer = null;

function showAppTooltip(target) {
  var tip = $('app-tooltip');
  if (!tip || !target) return;

  var term = target.getAttribute('data-term');
  var tipText = target.getAttribute('data-tooltip') || target.dataset.popoverTitle || target.getAttribute('title');
  var tipTitle = target.getAttribute('data-tooltip-title') || '';
  var tipBadge = target.getAttribute('data-tooltip-badge') || '';
  var tipRef = target.getAttribute('data-tooltip-ref') || '';

  // If term matches glossary, enrich it
  if (term && PCRP_GLOSSARY[term]) {
    var g = PCRP_GLOSSARY[term];
    tipTitle = tipTitle || g.title;
    tipBadge = tipBadge || g.badge;
    tipText = tipText || g.desc;
    tipRef = tipRef || g.ref;
  } else if (!tipTitle && tipText) {
    // If tipText mentions a known glossary keyword as standalone or prefix
    var lowerText = tipText.toLowerCase().trim();
    for (var k in PCRP_GLOSSARY) {
      if (lowerText === k || lowerText.indexOf(k + ' ') === 0 || lowerText === PCRP_GLOSSARY[k].title.toLowerCase()) {
        tipTitle = PCRP_GLOSSARY[k].title;
        tipBadge = PCRP_GLOSSARY[k].badge;
        tipRef = PCRP_GLOSSARY[k].ref;
        break;
      }
    }
  }

  if (!tipText && !tipTitle) return;

  if (_activeTooltipTarget && _activeTooltipTarget !== target && _activeTooltipTarget.dataset.popoverTitle) {
    _activeTooltipTarget.setAttribute('title', _activeTooltipTarget.dataset.popoverTitle);
    delete _activeTooltipTarget.dataset.popoverTitle;
  }

  var html = '';
  if (tipTitle) {
    html += '<div class="app-tooltip-header">' +
      '<span class="app-tooltip-title">' + esc(tipTitle) + '</span>' +
      (tipBadge ? '<span class="app-tooltip-badge">' + esc(tipBadge) + '</span>' : '') +
    '</div>';
  }
  if (tipText) {
    html += '<div class="app-tooltip-body">' + esc(tipText) + '</div>';
  }
  if (tipRef) {
    html += '<div class="app-tooltip-footer"><span class="app-tooltip-footer-icon">📖</span> ' + esc(tipRef) + '</div>';
  }

  tip.innerHTML = '<div class="app-tooltip-arrow" id="app-tooltip-arrow"></div><div class="app-tooltip-content">' + html + '</div>';

  _activeTooltipTarget = target;
  if (_tooltipHideTimer) { clearTimeout(_tooltipHideTimer); _tooltipHideTimer = null; }

  tip.style.visibility = 'hidden';
  tip.style.display = 'block';
  tip.classList.add('is-visible');

  positionAppTooltip(target, tip);
  tip.style.visibility = 'visible';

  if (typeof gsap !== 'undefined' && !prefersReducedMotion) {
    gsap.killTweensOf(tip);
    gsap.fromTo(tip, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.15, ease: 'power2.out' });
  }
}

function positionAppTooltip(target, tip) {
  var tRect = target.getBoundingClientRect();
  var tipRect = tip.getBoundingClientRect();
  var arrow = $('app-tooltip-arrow');

  var pad = 8;
  var top = tRect.top - tipRect.height - pad;
  var placement = 'top';

  if (top < 10) {
    top = tRect.bottom + pad;
    placement = 'bottom';
  }

  var left = tRect.left + (tRect.width / 2) - (tipRect.width / 2);
  var maxLeft = window.innerWidth - tipRect.width - 12;
  var minLeft = 12;
  left = Math.max(minLeft, Math.min(left, maxLeft));

  tip.style.top = Math.round(top) + 'px';
  tip.style.left = Math.round(left) + 'px';

  tip.classList.remove('placement-top', 'placement-bottom');
  tip.classList.add('placement-' + placement);

  if (arrow) {
    var targetCenterX = tRect.left + (tRect.width / 2);
    var arrowLeft = targetCenterX - left - 4;
    arrowLeft = Math.max(10, Math.min(arrowLeft, tipRect.width - 18));
    arrow.style.left = Math.round(arrowLeft) + 'px';
  }
}

function hideAppTooltip() {
  var tip = $('app-tooltip');
  if (!tip) return;
  if (_activeTooltipTarget && _activeTooltipTarget.dataset.popoverTitle) {
    _activeTooltipTarget.setAttribute('title', _activeTooltipTarget.dataset.popoverTitle);
    delete _activeTooltipTarget.dataset.popoverTitle;
  }
  _activeTooltipTarget = null;
  tip.classList.remove('is-visible');
  tip.style.display = 'none';
}

function initTooltipEngine() {
  if ($('app-tooltip')) return;
  var tip = document.createElement('div');
  tip.id = 'app-tooltip';
  tip.className = 'app-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  tip.style.display = 'none';
  document.body.appendChild(tip);

  document.addEventListener('mouseover', function (e) {
    if (e.target.closest('nav.tabs, .tabs, .nav-tab-group, .nav-tab-dropdown, header.top, .top-actions, .settings-menu, .sub-nav-tabs')) {
      hideAppTooltip();
      return;
    }

    var target = e.target.closest('[data-term], [data-tooltip], [data-helper], [title], .helper-term');
    if (!target) return;

    if (target.hasAttribute('title')) {
      target.dataset.popoverTitle = target.getAttribute('title');
      target.removeAttribute('title');
    }

    showAppTooltip(target);
  }, { passive: true });

  document.addEventListener('mouseout', function (e) {
    var target = e.target.closest('[data-term], [data-tooltip], [data-helper], [data-popover-title], .helper-term');
    if (!target) return;
    if (_tooltipHideTimer) clearTimeout(_tooltipHideTimer);
    _tooltipHideTimer = setTimeout(function () {
      hideAppTooltip();
    }, 60);
  }, { passive: true });

  window.addEventListener('scroll', function () {
    if (_activeTooltipTarget) hideAppTooltip();
  }, { passive: true });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && _activeTooltipTarget) hideAppTooltip();
  });
}

function sortTh(opts) {
  var isSorted = opts.curCol === opts.col;
  var ariaSort = isSorted ? (opts.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  var cls = ['sortable'];
  if (opts.num) cls.push('num');
  if (opts.sticky) cls.push('sticky');
  if (opts.extraClass) cls.push(opts.extraClass);
  if (isSorted) cls.push(opts.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
  var icoName = isSorted ? (opts.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'chevrons-up-down';
  return '<th class="' + cls.join(' ') + '" data-act="' + attr(opts.act) + '" data-col="' + attr(opts.col) + '"' +
    ' tabindex="0" role="button" aria-sort="' + ariaSort + '"' +
    (opts.title ? ' title="' + attr(opts.title) + '"' : '') +
    (opts.tooltip ? ' data-tooltip="' + attr(opts.tooltip) + '"' : '') +
    (opts.term ? ' data-term="' + attr(opts.term) + '"' : '') +
    (opts.tooltipTitle ? ' data-tooltip-title="' + attr(opts.tooltipTitle) + '"' : '') +
    (opts.tooltipBadge ? ' data-tooltip-badge="' + attr(opts.tooltipBadge) + '"' : '') +
    (opts.tooltipRef ? ' data-tooltip-ref="' + attr(opts.tooltipRef) + '"' : '') + '>' +
    '<div class="th-content">' +
      '<span class="th-label">' + opts.label + (opts.sub ? '<div class="tiny" style="text-transform:none">' + opts.sub + '</div>' : '') + '</span>' +
      '<span class="sort-ico">' + icon(icoName) + '</span>' +
    '</div></th>';
}

// ---- GSAP Motion Engine -----------------------------------------------------
var prefersReducedMotion = false;
if (window.matchMedia) {
  var _mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  prefersReducedMotion = _mql.matches;
  if (_mql.addEventListener) {
    _mql.addEventListener('change', function (e) { prefersReducedMotion = e.matches; });
  }
}

function hasGsap() {
  return typeof gsap !== 'undefined' && !prefersReducedMotion;
}

var toastTimer = null;
function toast(msg) {
  var t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  if (hasGsap()) {
    gsap.killTweensOf(t);
    gsap.fromTo(t,
      { autoAlpha: 0, y: 22, scale: 0.94 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: 'back.out(1.6)', clearProps: 'transform' }
    );
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      gsap.to(t, {
        autoAlpha: 0,
        y: -10,
        duration: 0.22,
        ease: 'power2.in',
        onComplete: function () {
          t.hidden = true;
          gsap.set(t, { clearProps: 'all' });
        }
      });
    }, 4000);
  } else {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }
}

function animatePageIn(pageEl) {
  if (!pageEl || !hasGsap()) return;
  gsap.killTweensOf(pageEl);
  gsap.fromTo(pageEl,
    { autoAlpha: 0, y: 10 },
    { autoAlpha: 1, y: 0, duration: 0.28, ease: 'power2.out', clearProps: 'transform,opacity,visibility' }
  );

  var cards = pageEl.querySelectorAll('.kpi, .role-card, .brest-card, .mrest-hero, .step-card');
  if (cards.length && cards.length <= 24) {
    gsap.from(cards, {
      autoAlpha: 0,
      y: 12,
      duration: 0.32,
      stagger: 0.035,
      ease: 'power1.out',
      clearProps: 'transform,opacity,visibility'
    });
  }

  animateCounters(pageEl);
}

function animateCounters(container) {
  if (!hasGsap()) return;
  var els = (container || document).querySelectorAll('.kpi-num, .kpi-value, .stat-tile .num, .mrest-val');
  Array.prototype.forEach.call(els, function (el) {
    if (el.getAttribute('data-animated')) return;
    var rawText = (el.innerText || '').trim();
    if (!rawText || rawText === '—' || rawText === 'None') return;
    var isPct = rawText.indexOf('%') !== -1;
    var isFraction = rawText.indexOf('/') !== -1;
    if (isFraction) {
      var parts = rawText.split('/');
      var n1 = parseFloat(parts[0].replace(/[^0-9.-]/g, ''));
      var n2 = parseFloat(parts[1].replace(/[^0-9.-]/g, ''));
      if (!isNaN(n1) && !isNaN(n2)) {
        el.setAttribute('data-animated', 'true');
        var obj = { v: 0 };
        gsap.to(obj, {
          v: n1,
          duration: 0.5,
          ease: 'power2.out',
          onUpdate: function () {
            el.innerHTML = Math.round(obj.v) + ' <span class="tiny">/ ' + n2 + '</span>';
          }
        });
      }
      return;
    }
    var num = parseFloat(rawText.replace(/,/g, '').replace(/%/g, ''));
    if (isNaN(num) || num === 0) return;
    el.setAttribute('data-animated', 'true');
    var o = { v: 0 };
    gsap.to(o, {
      v: num,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: function () {
        if (isPct) {
          el.innerText = o.v.toFixed(0) + '%';
        } else if (num % 1 === 0) {
          el.innerText = Math.round(o.v).toLocaleString();
        } else {
          el.innerText = o.v.toFixed(1);
        }
      }
    });
  });
}

function openModalAnimated(dlg) {
  if (!dlg) return;
  dlg.showModal();
  refreshIcons(dlg);
  if (hasGsap()) {
    gsap.killTweensOf(dlg);
    gsap.fromTo(dlg,
      { autoAlpha: 0, scale: 0.94, y: 14 },
      { autoAlpha: 1, scale: 1, y: 0, duration: 0.26, ease: 'power3.out', clearProps: 'transform,opacity,visibility' }
    );
  }
}

function openLackingModal(bkey, customFindings, customTitle, customSub) {
  var dlg = $('lacking-dialog');
  if (!dlg) return;
  var titleEl = $('lacking-dialog-title');
  var subEl = $('lacking-dialog-sub');
  var bodyEl = $('lacking-dialog-body');
  var copyBtn = $('lacking-copy');

  var findings = customFindings || [];
  var brgyRow = null;
  if (!customFindings && bkey) {
    brgyRow = (SNAP.barangayRows || []).filter(function (x) {
      return (x.province + '|' + x.municipality + '|' + x.barangay) === bkey;
    })[0];
    if (brgyRow) {
      findings = brgyRow.todo || [];
    }
  }

  var title = customTitle || (brgyRow ? brgyRow.barangay + ' · Lacking Findings' : 'Lacking Findings');
  var sub = customSub || (brgyRow ? brgyRow.municipality + ', ' + brgyRow.province + ' · ' + findings.length + ' lacking finding' + (findings.length === 1 ? '' : 's') : (findings.length + ' item' + (findings.length === 1 ? '' : 's')));

  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;

  if (!findings || findings.length === 0) {
    bodyEl.innerHTML =
      '<div class="empty-state" style="padding:28px 16px;text-align:center;">' +
        '<div style="font-size:32px;margin-bottom:8px">🎉</div>' +
        '<strong>No lacking findings!</strong>' +
        '<div class="muted tiny" style="margin-top:4px">All monitored activities have reported attendance.</div>' +
      '</div>';
    if (copyBtn) copyBtn.style.display = 'none';
  } else {
    var itemsHtml = findings.map(function (f, idx) {
      var parts = String(f).split(': ');
      var actPart = parts.length > 1 ? parts[0] : '';
      var issuePart = parts.length > 1 ? parts.slice(1).join(': ') : String(f);
      var isWarn = issuePart.toLowerCase().indexOf('window') !== -1 || issuePart.toLowerCase().indexOf('reasons') !== -1;
      return '<div class="lacking-item-card' + (isWarn ? ' warn' : '') + '">' +
        '<div class="lacking-item-head">' +
          '<span class="lacking-item-title">' + icon(isWarn ? 'alert-triangle' : 'alert-circle') + ' ' +
            esc(actPart ? actPart : ('Finding #' + (idx + 1))) +
          '</span>' +
          '<span class="pill ' + (isWarn ? 'warn' : 'bad') + ' tiny">' + (isWarn ? 'Attention' : 'Lacking') + '</span>' +
        '</div>' +
        '<div class="lacking-item-desc">' + esc(issuePart) + '</div>' +
      '</div>';
    }).join('');

    bodyEl.innerHTML = '<div class="lacking-list">' + itemsHtml + '</div>';

    if (copyBtn) {
      copyBtn.style.display = '';
      copyBtn.onclick = function () {
        var textToCopy = title + '\n' + sub + '\n\n' + findings.map(function (f, i) {
          return (i + 1) + '. ' + f;
        }).join('\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(textToCopy).then(function () {
            toast('Copied ' + findings.length + ' findings to clipboard.');
          });
        } else {
          toast('Copied to clipboard.');
        }
      };
    }
  }

  openModalAnimated(dlg);
}

// Crisp offline SVG icon paths matching Lucide icon names used across Data Health and the app shell.
var ICON_SVG = {
  'check': '<path d="M20 6 9 17l-5-5"/>',
  'check-circle-2': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  'upload-cloud': '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/>',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  'map-pin-off': '<path d="M5.43 5.43A8.06 8.06 0 0 0 4 10c0 6 8 12 8 12a29.94 29.94 0 0 0 5-5"/><path d="M19.18 13.52A8.66 8.66 0 0 0 20 10a8 8 0 0 0-8-8 7.88 7.88 0 0 0-3.52.82"/><path d="M9.13 9.13A2.99 2.99 0 0 0 9 10a3 3 0 0 0 3 3c.3 0 .59-.04.87-.13"/><line x1="2" x2="22" y1="2" y2="22"/>',
  'list-checks': '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  'building-2': '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  'help-circle': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  'scale': '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  'git-merge': '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  'user-round-x': '<path d="M2 21a8 8 0 0 1 11.873-7"/><circle cx="10" cy="8" r="5"/><path d="m17 17 5 5"/><path d="m22 17-5 5"/>',
  'user-x': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/>',
  'copy': '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  'git-compare': '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/>',
  'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  'users-round': '<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>',
  'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'tag': '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  'clipboard-x': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m15 11-6 6"/><path d="m9 11 6 6"/>',
  'clipboard-check': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  'clipboard': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  'clock-alert': '<path d="M12 6v6l4 2"/><path d="M16 21.16a10 10 0 1 1 5-8.66"/><path d="M20 15v4"/><path d="M20 21h.01"/>',
  'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'calendar-x': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m14 14-4 4"/><path d="m10 14 4 4"/>',
  'calendar-range': '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M17 14h-6"/><path d="M13 18H7"/>',
  'files': '<path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/>',
  'spell-check': '<path d="m6 16 6-12 6 12"/><path d="M8 12h8"/><path d="m16 20 2 2 4-4"/>',
  'cake': '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/>',
  'gauge': '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  'list-todo': '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  'repeat': '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  'crosshair': '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
  'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  'circle-alert': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  'layout-dashboard': '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  'settings': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  'moon': '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  'trash-2': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  'database': '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  'arrow-down': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  'chevrons-up-down': '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  'calendar': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  'calendar-check': '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  'home': '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'shield': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  'award': '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
  'layers': '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  'grid': '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>'
};

var ICON_GLYPH = {
  'check': '✓', 'check-circle-2': '✓', 'chevron-down': '⌄', 'download': '⤓', 'file-text': '▤', 'lock': '🔒', 'info': 'ⓘ',
  'map-pin': '⌖', 'map-pin-off': '⌖', 'list-checks': '☰', 'building-2': '▦', 'help-circle': '?', 'scale': '⚖', 'git-merge': '⇵',
  'user-round-x': '✕', 'user-x': '✕', 'copy': '⧉', 'git-compare': '⇆', 'user-plus': '+', 'users-round': '☷', 'tag': '#',
  'clipboard-x': '✕', 'search': '⌕', 'x': '✕', 'alert-triangle': '⚠', 'external-link': '↗',
  'clock-alert': '⏱', 'calendar-x': '✕', 'files': '⧉', 'users': '☷', 'spell-check': 'Aa', 'cake': '✱', 'gauge': '◔',
  'list-todo': '☑', 'target': '◎', 'repeat': '↻', 'crosshair': '⌖', 'clock': '⏱', 'shield-check': '✓', 'circle-alert': '!', 'clipboard-check': '☑', 'clipboard': '☐',
  'arrow-up': '▲', 'arrow-down': '▼', 'chevrons-up-down': '↕', 'calendar': '📅', 'calendar-check': '☑', 'home': '⌂', 'shield': '⛊', 'award': '★', 'user-check': '✓', 'layers': '≡', 'grid': '▦'
};

function icon(name, extraClass) {
  var body = ICON_SVG[name] || ICON_SVG['info'];
  return '<span class="ico' + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true"><svg viewBox="0 0 24 24">' + body + '</svg></span>';
}

function refreshIcons(root) {
  Array.prototype.forEach.call((root && root.querySelectorAll ? root : document).querySelectorAll('i[data-lucide]'), function (el) {
    var name = el.getAttribute('data-lucide');
    var cls = el.getAttribute('class') || '';
    var s = document.createElement('span');
    s.className = ('ico ' + cls).trim();
    s.setAttribute('aria-hidden', 'true');
    if (ICON_SVG[name]) {
      s.innerHTML = '<svg viewBox="0 0 24 24">' + ICON_SVG[name] + '</svg>';
    } else {
      s.textContent = ICON_GLYPH[name] || '•';
    }
    el.replaceWith(s);
  });
}

// Theme management: supports explicit user choice ('light' | 'dark') or system default
function applyTheme() {
  var p = prefs();
  var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  var isDark = p.theme ? p.theme === 'dark' : !!(mq && mq.matches);
  document.documentElement.classList.toggle('dark', isDark);
  var btn = $('btn-theme');
  if (btn) {
    btn.innerHTML = icon(isDark ? 'sun' : 'moon');
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  }
}
function toggleTheme() {
  var isDark = document.documentElement.classList.contains('dark');
  var p = prefs();
  p.theme = isDark ? 'light' : 'dark';
  savePrefs(p);
  applyTheme();
  toast((p.theme === 'dark' ? 'Dark' : 'Light') + ' theme active.');
}
(function () {
  var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  applyTheme();
  if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);
})();

// ---- reference tables (baseline, activities) -------------------------------

function loadReferenceTables() {
  var p = prefs();
  TABS.Baseline = p.baseline ? p.baseline.table : clone(BUILT_IN.Baseline);
  TABS.Activities = p.activities ? p.activities.table : clone(BUILT_IN.Activities);
  if (p.field) {
    var seen = {};
    TABS.Activities.rows.forEach(function (r) {
      var code = String(r[1] || '').trim();
      seen[code] = true;
      if (p.field[code]) r[6] = p.field[code];
    });
    // An activity missing from the tab (readActivities falls back to its default)
    // gets a row, so its field conduct setting still applies.
    DEFAULT_ACTIVITIES.forEach(function (d) {
      if (!seen[d.code] && p.field[d.code]) {
        TABS.Activities.rows.push([d.seq, d.code, d.name, d.label, d.level, d.households ? 'Yes' : 'No', p.field[d.code], d.stage || 1, d.prioOnly ? 'Yes' : 'No']);
      }
    });
  }
}

function baselineSummary() {
  var b = readBaseline();
  var munis = {};
  b.rows.forEach(function (r) { if (b.monitored.indexOf(r.municipality) !== -1) munis[r.province + '|' + r.municipality] = true; });
  var monitoredBrgys = b.rows.filter(function (r) { return b.monitored.indexOf(r.municipality) !== -1; }).length;
  return { rows: b.rows.length, munis: Object.keys(munis).length, brgys: monitoredBrgys };
}

// ---- your municipality ---------------------------------------------------------
// The users are MDMs and PEAs: each works one municipality. It is chosen once,
// before import, and every page, the memo and the export open on it. RPMO
// staff can choose "All municipalities" for the regional view.

// ---- role & municipality scoping ------------------------------------------------
// PEA and MDM work strictly on their assigned municipality. When PEA/MDM mode is
// active, all data, dropdowns, barangay lists, and exports from other municipalities
// are removed from their view. Regional Project Evaluation Officers (RPMO) retain
// full region-wide oversight, cross-municipality comparison, and provincial filters.

/** User role: 'pea_mdm' (Municipal Field Staff) or 'rpmo' (Regional Project Evaluation Officer). */
function userRole() {
  var p = prefs();
  if (p.role) return p.role;
  return (p.home && p.home.region) ? 'rpmo' : 'pea_mdm';
}
function isRegionalUser() {
  return userRole() === 'rpmo';
}
function isMunicipalUser() {
  return !isRegionalUser();
}

/** { province, municipality } | { region: true } | null when not chosen yet. */
function home() { return prefs().home || null; }
function homeKey() { var h = home(); return h && !h.region ? h.province + '|' + h.municipality : ''; }
function homeLabel() {
  var h = home();
  if (!h) return '';
  if (isRegionalUser()) return 'RPMO Regional View (All Municipalities)';
  return h.municipality + ' (' + h.province + ')';
}
function homeRoleBadge() {
  return isRegionalUser()
    ? '<span class="role-badge region">RPMO Regional</span>'
    : '<span class="role-badge field">PEA / MDM</span>';
}

/** Monitored municipalities from the baseline loaded now, by province. */
function baselineMunis() {
  var b = readBaseline(), seen = {}, out = [];
  b.rows.forEach(function (r) {
    if (b.monitored.indexOf(r.municipality) === -1) return;
    var k = r.province + '|' + r.municipality;
    if (!seen[k]) { seen[k] = { province: r.province, municipality: r.municipality, barangays: 0 }; out.push(seen[k]); }
    seen[k].barangays++;
  });
  return out.sort(function (a, b) { return a.province.localeCompare(b.province) || a.municipality.localeCompare(b.municipality); });
}

function renderHome() {
  var h = home(), card = $('home-card');
  if (h && !STATE.editHome) {
    var list = baselineMunis();
    var mInfo = !h.region ? list.filter(function (m) { return m.province === h.province && m.municipality === h.municipality; })[0] : null;
    card.innerHTML = '<div class="home-set"><div>' +
      '<div class="tiny"><span class="step-no done">✓</span> Section 1 · Municipal Scope &amp; Role</div>' +
      '<div class="home-name" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0">' +
        homeRoleBadge() + ' <span>' + esc(homeLabel()) + '</span>' +
        (mInfo ? ' <span class="pill idle">' + n(mInfo.barangays) + ' monitored barangays</span>' : ' <span class="pill good">516 monitored barangays</span>') +
      '</div>' +
      '<div class="muted">' + (isRegionalUser()
        ? 'Regional RPMO oversight: full access to every monitored municipality, cross-LGU comparisons, and provincial filters.'
        : 'Dedicated PEA / MDM workspace: scoped strictly to <strong>' + esc(h.municipality) + '</strong>. All other municipalities are excluded from your view.') + '</div>' +
      '</div>' +
      '<div class="row-actions" style="margin:0"><button class="btn ghost" data-act="home-edit">' + icon('map-pin') + ' <span>Switch Role / Municipality</span></button></div></div>';
  } else {
    var curRole = STATE.pendingRole || userRole() || 'pea_mdm';
    var curKey = STATE.pendingMuni !== undefined ? STATE.pendingMuni : homeKey();
    var list2 = baselineMunis(), opts = '<option value="">Select your assigned municipality…</option>', prov = '';
    list2.forEach(function (m) {
      if (m.province !== prov) { opts += (prov ? '</optgroup>' : '') + '<optgroup label="' + attr(m.province) + '">'; prov = m.province; }
      var v = m.province + '|' + m.municipality;
      opts += '<option value="' + attr(v) + '"' + (curKey === v ? ' selected' : '') + '>' + esc(m.municipality) + ' (' + m.barangays + ' barangays)</option>';
    });
    opts += (prov ? '</optgroup>' : '');

    card.innerHTML = '<h2><span class="step-no">1</span> Select your Role &amp; Municipality</h2>' +
      '<p class="muted">Tailors the dashboard and data access to your assigned duties. PEA &amp; MDM staff work exclusively in their assigned municipality; RPMO officers have region-wide access.</p>' +
      '<div class="role-grid">' +
        '<div class="role-card' + (curRole === 'pea_mdm' ? ' active' : '') + '" data-act="role-pick" data-v="pea_mdm" role="button" tabindex="0">' +
          '<div class="role-card-head"><span class="role-card-title">' + icon('map-pin') + ' PEA / MDM Workspace</span><span class="role-badge field">Municipal Field</span></div>' +
          '<div class="role-card-desc">For Project Evaluation Assistants &amp; Municipal Data Monitors. Scopes the entire tool strictly to your municipality; removes all other LGUs from your view.</div>' +
        '</div>' +
        '<div class="role-card' + (curRole === 'rpmo' ? ' active' : '') + '" data-act="role-pick" data-v="rpmo" role="button" tabindex="0">' +
          '<div class="role-card-head"><span class="role-card-title">' + icon('building-2') + ' Regional RPMO</span><span class="role-badge region">Regional Oversight</span></div>' +
          '<div class="role-card-desc">For Regional Monitoring &amp; Evaluation Officers. Full region-wide access, cross-municipality comparison matrix, and provincial filters.</div>' +
        '</div>' +
      '</div>' +
      (curRole === 'pea_mdm' ?
        '<div class="filters" style="margin-bottom:12px"><label class="field" style="min-width:320px;flex:1"><span>Your Municipality</span><select id="home-select">' + opts + '</select></label></div>'
        : '<div class="msg ok" style="margin-bottom:12px">' + icon('check-circle-2') + ' <div><strong>Regional RPMO mode selected</strong>: All 516 monitored barangays across Caraga Region will be visible with full comparison analytics.</div></div>') +
      '<div class="row-actions" style="margin:0">' +
        '<button class="btn primary" data-act="home-save">' + icon('check') + ' <span>Save Workspace &amp; Proceed</span></button>' +
        (h ? '<button class="btn ghost" data-act="home-cancel">Cancel</button>' : '') +
      '</div>';
  }
  var locked = !h || STATE.editHome;
  $('import-card').classList.toggle('locked', locked);
  $('import-card').setAttribute('aria-disabled', locked);
  $('file-input').disabled = locked;
  var chip = $('home-chip');
  if (chip) {
    chip.hidden = !h;
    if (h) {
      chip.innerHTML = (isRegionalUser() ? icon('building-2') : icon('map-pin')) + ' ' + homeRoleBadge() + ' <span>' + esc(homeLabel()) + '</span>';
      chip.title = 'Click to switch role or change municipality scope';
    }
  }
  var footerPill = $('footer-scope-pill');
  if (footerPill) {
    if (h) {
      footerPill.innerHTML = '<button type="button" class="footer-scope-btn" data-act="open-scope" title="Active Scope: ' + esc(homeLabel()) + '. Click to switch scope.">' +
        (isRegionalUser() ? '<span class="role-badge region">' + icon('building-2') + ' RPMO Regional</span>' : '<span class="role-badge field">' + icon('map-pin') + ' PEA / MDM Scope</span>') +
        ' <span style="font-family:var(--font-mono);font-size:11px;font-weight:600;color:var(--text-main);">' + esc(isRegionalUser() ? 'Caraga Region' : h.municipality) + '</span>' +
      '</button><span class="brand-sep" aria-hidden="true">·</span>';
      footerPill.hidden = false;
    } else {
      footerPill.hidden = true;
    }
  }
}

function openScopeDialog() {
  var dlg = $('scope-dialog'), body = $('scope-dialog-body');
  if (!dlg || !body) return;
  var curRole = userRole(), curKey = homeKey();
  var list = baselineMunis(), opts = '<option value="">Select your assigned municipality…</option>', prov = '';
  list.forEach(function (m) {
    if (m.province !== prov) { opts += (prov ? '</optgroup>' : '') + '<optgroup label="' + attr(m.province) + '">'; prov = m.province; }
    var v = m.province + '|' + m.municipality;
    opts += '<option value="' + attr(v) + '"' + (curKey === v ? ' selected' : '') + '>' + esc(m.municipality) + ' (' + m.barangays + ' barangays)</option>';
  });
  opts += (prov ? '</optgroup>' : '');

  body.innerHTML = '<div class="role-grid">' +
      '<div class="role-card' + (curRole === 'pea_mdm' ? ' active' : '') + '" data-act="dlg-role-pick" data-v="pea_mdm" role="button" tabindex="0">' +
        '<div class="role-card-head"><span class="role-card-title">' + icon('map-pin') + ' PEA / MDM</span><span class="role-badge field">Municipal</span></div>' +
        '<div class="role-card-desc">Restricted view: assigned municipality only.</div>' +
      '</div>' +
      '<div class="role-card' + (curRole === 'rpmo' ? ' active' : '') + '" data-act="dlg-role-pick" data-v="rpmo" role="button" tabindex="0">' +
        '<div class="role-card-head"><span class="role-card-title">' + icon('building-2') + ' Regional RPMO</span><span class="role-badge region">Regional</span></div>' +
        '<div class="role-card-desc">Full region view &amp; comparison matrix.</div>' +
      '</div>' +
    '</div>' +
    '<div id="dlg-muni-wrap" style="' + (curRole === 'pea_mdm' ? '' : 'display:none;') + 'margin-bottom:14px">' +
      '<label class="field" style="width:100%"><span>Municipality</span><select id="dlg-home-select">' + opts + '</select></label>' +
    '</div>' +
    '<div class="row-actions dialog-foot">' +
      '<button class="btn primary" type="button" id="dlg-scope-save">' + icon('check') + ' <span>Apply Workspace Scope</span></button>' +
      '<button class="btn ghost" type="button" value="close" onclick="$(\'scope-dialog\').close()">Cancel</button>' +
    '</div>';

  openModalAnimated(dlg);

  var cards = dlg.querySelectorAll('.role-card');
  Array.prototype.forEach.call(cards, function (c) {
    c.addEventListener('click', function () {
      var r = c.getAttribute('data-v');
      Array.prototype.forEach.call(cards, function (x) { x.classList.toggle('active', x === c); });
      if (hasGsap()) gsap.fromTo(c, { scale: 0.97 }, { scale: 1, duration: 0.22, ease: 'back.out(2)', clearProps: 'transform' });
      $('dlg-muni-wrap').style.display = r === 'pea_mdm' ? '' : 'none';
    });
  });

  $('dlg-scope-save').onclick = function () {
    var activeCard = dlg.querySelector('.role-card.active');
    var selectedRole = activeCard ? activeCard.getAttribute('data-v') : 'pea_mdm';
    if (selectedRole === 'pea_mdm') {
      var selVal = $('dlg-home-select').value;
      if (!selVal) { toast('Please choose your assigned municipality.'); return; }
      saveHome(selVal, 'pea_mdm');
    } else {
      saveHome('REGION', 'rpmo');
    }
    dlg.close();
  };
}

function saveHome(v, forceRole) {
  var p = prefs();
  var role = forceRole || STATE.pendingRole || userRole() || 'pea_mdm';
  if (role === 'pea_mdm') {
    if (!v) { toast('Choose your municipality first.'); return; }
    var parts = v.split('|');
    p.role = 'pea_mdm';
    p.home = { province: parts[0], municipality: parts[1] };
  } else {
    p.role = 'rpmo';
    p.home = { region: true };
  }
  savePrefs(p);
  STATE.editHome = false;
  STATE.pendingRole = null;
  STATE.pendingMuni = null;
  applyHomeScope();
  renderHome();
  if (STATE.computed) {
    renderPage();
    renderStatus();
    updateTabBadges();
  }
  toast(isRegionalUser() ? 'Role set to Regional RPMO oversight.' : 'Municipality set: ' + homeLabel() + ' (PEA/MDM view).');
}

/** Point every page at the chosen municipality or regional scope. */
function applyHomeScope() {
  var h = home(), key = homeKey();
  STATE.muni = key || STATE.muni;
  STATE.prov = h && !h.region ? h.province : '';
  S.healthScope = key ? 'm:' + key : '';
  S.healthPage = {};
}

/** How much of the chosen municipality the Activity Tracker covers. */
function homeCoverage() {
  var key = homeKey();
  if (!key || !SNAP) return null;
  var brs = SNAP.barangayRows.filter(function (b) { return b.province + '|' + b.municipality === key; });
  var enc = brs.filter(function (b) {
    return Object.keys(b.activities).some(function (k) { var s = b.activities[k].status; return s === 'Complete' || s === 'No Attendees'; });
  }).length;
  return { barangays: brs.length, encoded: enc };
}

function coverageBanner() {
  var c = homeCoverage();
  if (!c) return '';
  if (!c.encoded) {
    return '<div class="msg warn">' + icon('alert-triangle') + ' <div>The Activity Tracker has <strong>no records for ' + esc(homeLabel()) + '</strong>. Check that it is the right export, or that your municipality is set correctly (<button class="link" data-act="home-edit">Import › Change</button>).</div></div>';
  }
  return '';
}

// ---- navigation & live tab badges --------------------------------------------

function updateTabBadges() {
  var setBadge = function (id, text, cls) {
    var el = $('badge-' + id) || $(id);
    if (!el) return;
    if (!text && text !== 0) { el.hidden = true; el.textContent = ''; el.className = 'tab-badge'; return; }
    el.hidden = false;
    el.textContent = text;
    el.className = 'tab-badge' + (cls ? ' ' + cls : '');
  };
  var loadedCount = ['activityTracker', 'volunteers', 'movs'].filter(function (k) { return !!LOADED[k]; }).length;
  setBadge('import', loadedCount ? loadedCount + '/3' : '', loadedCount === 3 ? 'good' : '');
  setBadge('sni-badge-import', loadedCount ? loadedCount + '/3' : '', loadedCount === 3 ? 'good' : '');

  if (!STATE.computed || !S.overview || !SNAP) {
    ['volunteers', 'brest', 'mrest', 'verify', 'movs', 'health', 'group-volunteers'].forEach(function (id) { setBadge(id, ''); });
    return;
  }
  var key = homeKey();
  var brgysInScope = (SNAP.barangayRows || []).filter(function (b) { return !key || (b.province + '|' + b.municipality === key); });
  if (SNAP.movs) {
    var movLacking = SNAP.movs.groups.filter(function (g) { return inOverviewScope(g) && g.lacking; }).length;
    setBadge('movs', SNAP.movs.imported ? (movLacking ? n(movLacking) + ' lacking' : '✓') : 'Needed', SNAP.movs.imported ? (movLacking ? 'warn' : 'good') : 'warn');
  }

  try {
    var P = people(), inScope = pScopeTest();
    var volCount = P.volunteers.filter(inScope).length;
    setBadge('volunteers', volCount ? n(volCount) : '');

    var brestEncoded = brgysInScope.filter(function (b) { return b.volunteers && b.volunteers.BREST && b.volunteers.BREST.status === 'Encoded'; }).length;
    var brestIssues = brgysInScope.filter(function (b) { return b.volunteers && b.volunteers.BREST && b.volunteers.BREST.status === 'Needs fixing'; }).length;
    setBadge('brest', brestIssues ? brestIssues + ' to fix' : (brestEncoded ? brestEncoded + '/' + brgysInScope.length : ''), brestIssues ? 'warn' : 'good');

    var s2Vols = P.volunteers.filter(function (v) { return v.isStage2 && inScope(v); });
    var s2Formed = 0, s2Issues = 0;
    brgysInScope.forEach(function (b) {
      var bv = s2Vols.filter(function (v) { return v.barangay === b.barangay && v.municipality === b.municipality; });
      if (!bv.length) return;
      var cmsc = bv.filter(function (v) { return v.stage2Body === 'CMSC'; });
      var cmscChair = cmsc.filter(function (v) { return v.chair; })[0];
      var cspmcChair = bv.filter(function (v) { return (v.stage2Body === 'CSPMC' && v.chair) || (v.chair && !v.stage2Body); })[0];
      if (!cspmcChair || cmsc.length < 3 || !cmscChair) s2Issues++;
      else s2Formed++;
    });
    setBadge('cspmc', s2Issues ? s2Issues + ' to fix' : (s2Formed ? s2Formed + '/' + brgysInScope.length : (s2Vols.length ? n(s2Vols.length) : '')), s2Issues ? 'warn' : (s2Formed ? 'good' : ''));

    var totalIssues = brestIssues + s2Issues;
    if (totalIssues) {
      setBadge('group-volunteers', totalIssues + ' to fix', 'warn');
    } else if (volCount) {
      setBadge('group-volunteers', n(volCount), '');
    } else {
      setBadge('group-volunteers', '');
    }

    var mrestRows = P.mrest || [];
    var mrestInScope = mrestRows.filter(inScope);
    setBadge('mrest', mrestInScope.length ? '✓ ' + mrestInScope.length : '○');
  } catch (e) {}

  if (typeof VERIFY !== 'undefined' && VERIFY.tags && VERIFY.tags.records) {
    var vCnt = Object.keys(VERIFY.tags.records).length;
    setBadge('verify', vCnt ? n(vCnt) : '', vCnt ? 'good' : '');
  }
  try {
    var keep = S.healthScope;
    S.healthScope = key ? 'm:' + key : (STATE.prov ? 'p:' + STATE.prov : '');
    var evs = dhEvaluateAll(S.overview, '').filter(function (e) { return !e.outOfScope; });
    S.healthScope = keep;
    var crit = evs.filter(function (e) { return e.status === 'critical'; }).length;
    var ver = evs.filter(function (e) { return e.status === 'verify'; }).length;
    var openTot = crit + ver;
    setBadge('health', openTot ? n(openTot) : '✓', crit ? 'bad' : (ver ? 'warn' : 'good'));
    setBadge('group-dqa', openTot ? openTot + ' to fix' : '✓', openTot ? (crit ? 'bad' : 'warn') : 'good');
  } catch (e) {}

  if (UPDATE_STATE.result && UPDATE_STATE.result.updateAvailable) {
    setBadge('settings', 'Update', 'good');
    setBadge('sni-badge-updates', 'Update', 'good');
  } else {
    setBadge('settings', loadedCount ? loadedCount + '/3' : '', loadedCount === 3 ? 'good' : '');
    setBadge('sni-badge-updates', '');
  }
  renderBrandUpdateStatus();
}

function go(page) {
  if (page === 'import') page = 'settings';
  if (page === 'dqa' || page === 'data-health') page = 'health';
  if (page === 'kpisummary') page = 'kpis';
  // Operational summaries remain in the Municipality Profile; aggregate cards live on KPI.
  if (['overview', 'munis', 'brgys', 'attendees', 'households', 'people'].indexOf(page) !== -1) page = 'profile';
  if (typeof profileBeforeNavigate === 'function') profileBeforeNavigate(page);
  STATE.page = page;
  try {
    sessionStorage.setItem('pcrp_active_page', page);
    localStorage.setItem('pcrp_active_page', page);
  } catch (e) {}
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
    var on = b.getAttribute('data-page') === page;
    b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
    if (on && hasGsap()) {
      gsap.fromTo(b, { scale: 0.94 }, { scale: 1, duration: 0.22, ease: 'back.out(2)', clearProps: 'transform' });
    }
  });

  var btnSettingsTop = $('btn-import-top');
  if (btnSettingsTop) {
    var isSettings = (page === 'settings');
    btnSettingsTop.classList.toggle('on', isSettings);
    btnSettingsTop.setAttribute('aria-selected', isSettings);
    if (isSettings && hasGsap()) {
      gsap.fromTo(btnSettingsTop, { scale: 0.94 }, { scale: 1, duration: 0.22, ease: 'back.out(2)', clearProps: 'transform' });
    }
  }

  // Highlight parent group triggers if active page is inside group
  var isVolunteersGroup = (page === 'volunteers' || page === 'brest' || page === 'cspmc');
  var isDqaGroup = (page === 'health' || page === 'verify' || page === 'movs');
  var grpVol = $('tab-group-volunteers');
  if (grpVol) grpVol.classList.toggle('on', isVolunteersGroup);
  var grpDqa = $('tab-group-dqa');
  if (grpDqa) grpDqa.classList.toggle('on', isDqaGroup);

  // Close open dropdowns
  Array.prototype.forEach.call(document.querySelectorAll('.nav-tab-group.open'), function (g) {
    g.classList.remove('open');
  });

  Array.prototype.forEach.call(document.querySelectorAll('.page'), function (s) { s.classList.toggle('on', s.id === 'page-' + page); });
  renderPage();
  updateTabBadges();
  window.scrollTo(0, 0);
  animatePageIn($('page-' + page));
}

function renderPage() {
  if (STATE.page === 'profile') renderMunicipalityProfile();
  else if (STATE.page === 'kpis') renderKpis();
  else if (STATE.page === 'volunteers') renderVolunteers();
  else if (STATE.page === 'brest') renderBrest();
  else if (STATE.page === 'cspmc') renderCspmc();
  else if (STATE.page === 'mrest') renderMrest();
  else if (STATE.page === 'verify') renderVerify();
  else if (STATE.page === 'movs') renderMovs();
  else if (STATE.page === 'health') renderHealth();
  else if (STATE.page === 'settings' || STATE.page === 'import') renderSettings();
  else renderSettings();
}

function setTabsEnabled(on) {
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
    var p = b.getAttribute('data-page');
    if (p !== 'import' && p !== 'settings') b.disabled = !on;
  });
  var grpVol = $('tab-group-volunteers');
  if (grpVol) grpVol.disabled = !on;
  var grpDqa = $('tab-group-dqa');
  if (grpDqa) grpDqa.disabled = !on;
  $('btn-export').disabled = !on || !LOADED.activityTracker;
}

// Hooks the Data Health page calls.
function openMuni(mKey) { openMunicipalityProfile(mKey); }
function openPasskeyModal() {}

function renderDqaBreadcrumb() {
  if (!STATE.dqaOrigin) return '';
  var orig = STATE.dqaOrigin;
  var bName = orig.bkey ? (orig.bkey.split('|')[2] || orig.bkey) : '';
  return '<div class="dqa-nav-breadcrumb msg info" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
    '<div style="display:flex;align-items:center;gap:8px">' +
      icon('info') +
      '<div>Inspecting records from <strong>DQA Audit: ' + esc(orig.label) + '</strong>' +
        (bName ? ' · <span>' + esc(bName) + '</span>' : '') +
        (orig.count ? ' <span class="pill warn tiny" style="font-weight:700">' + n(orig.count) + ' items</span>' : '') +
      '.</div>' +
    '</div>' +
    '<button type="button" class="btn ghost btn-sm" data-act="dqa-return">' +
      icon('arrow-left') + ' <span>Return to DQA Audit</span>' +
    '</button>' +
  '</div>';
}

function renderExecutiveMemoHtml(text) {
  if (!text) return '<p class="muted">No memo text available.</p>';
  var lines = text.split('\n');
  var out = [];
  var inSummary = false;
  var inActionItems = false;
  var currentAction = false;
  var footerLines = [];
  var headerTitle = '';
  var headerDate = '';

  for (var h = 0; h < Math.min(lines.length, 10); h++) {
    var hl = lines[h].trim();
    if (hl.indexOf('DATA QUALITY') !== -1) headerTitle = hl;
    if (hl.indexOf('Date of audit:') !== -1) headerDate = hl;
  }
  if (!headerTitle) headerTitle = 'Data Quality Assessment (DQA) Audit Memo';
  out.push('<div style="text-align:center;padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--border-subtle);">' +
    '<div class="tiny text-muted" style="text-transform:uppercase;font-weight:700;letter-spacing:0.04em">DSWD Field Office Caraga · Kalahi-CIDSS PCRP</div>' +
    '<h2 style="margin:4px 0 2px;font-size:16px;color:var(--text-main);">' + esc(headerTitle) + '</h2>' +
    (headerDate ? '<div class="tiny text-muted">' + esc(headerDate) + '</div>' : '') +
  '</div>');

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.indexOf('====') === 0) continue;

    if (line.indexOf('DSWD FIELD OFFICE') !== -1 || line.indexOf('DATA QUALITY') !== -1 || line.indexOf('Date of audit:') !== -1) {
      continue;
    }

    if (line.indexOf('I. SUMMARY') === 0) {
      inSummary = true;
      inActionItems = false;
      out.push('<h3>I. Audit Summary</h3><ul class="memo-summary-list">');
      continue;
    }
    if (line.indexOf('II. ACTION ITEMS') === 0) {
      if (inSummary) { out.push('</ul>'); inSummary = false; }
      inActionItems = true;
      out.push('<h3>II. Priority Action Items</h3><div class="memo-action-items">');
      continue;
    }

    if (inSummary) {
      if (line.indexOf('• Status:') === 0) {
        var isGood = line.indexOf('All checks passed') !== -1;
        var isCrit = line.indexOf('Needs attention') !== -1;
        var badgeCls = isGood ? 'pill good' : (isCrit ? 'pill bad' : 'pill warn');
        out.push('<li><strong>Overall Status:</strong> <span class="' + badgeCls + ' text-[10px] font-bold">' + esc(line.replace('• Status:', '').trim()) + '</span></li>');
      } else if (line.indexOf('• ') === 0) {
        out.push('<li>' + esc(line.slice(2)) + '</li>');
      }
      continue;
    }

    if (inActionItems) {
      if (/^\[\d+\]/.test(line)) {
        if (currentAction) out.push('</div>');
        var isCrit = line.indexOf('Critical') !== -1;
        out.push('<div class="memo-action-box' + (isCrit ? ' critical' : '') + '">' +
          '<div style="font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
            '<span>' + esc(line) + '</span>' +
            '<span class="pill ' + (isCrit ? 'bad' : 'warn') + ' text-[10px] font-bold">' + (isCrit ? 'CRITICAL' : 'TO VERIFY') + '</span>' +
          '</div>');
        currentAction = true;
      } else if (line.indexOf('What to do:') === 0) {
        out.push('<div style="font-size:12px;margin:4px 0 6px;color:var(--text-main);"><strong>SOP Guidance:</strong> ' + esc(line.replace('What to do:', '').trim()) + '</div>');
      } else if (line.indexOf('- ') === 0) {
        out.push('<div class="tiny muted" style="padding-left:12px;margin-bottom:2px;">• ' + esc(line.slice(2)) + '</div>');
      } else if (line.indexOf('… and') === 0) {
        out.push('<div class="tiny text-dim" style="padding-left:12px;font-style:italic;">' + esc(line) + '</div>');
      } else if (line.indexOf('No open items') !== -1) {
        out.push('<div class="p-3 text-good"><i data-lucide="check-circle-2"></i> All checks passed! No open action items.</div>');
      } else {
        footerLines.push(line);
      }
      continue;
    }

    footerLines.push(line);
  }

  if (inSummary) out.push('</ul>');
  if (inActionItems && currentAction) out.push('</div></div>');
  if (footerLines.length) {
    out.push('<div style="margin-top:16px;padding-top:10px;border-top:1px solid var(--border-subtle);font-size:11.5px;color:var(--text-muted);font-style:italic;">' +
      footerLines.map(esc).join('<br>') + '</div>');
  }

  return out.join('');
}

function openHealthMemoModal() {
  var text = (typeof dhMemoText === 'function') ? dhMemoText() : 'No memo available.';
  var ta = $('memo-text');
  if (ta) ta.value = text;
  var prevEl = $('memo-preview');
  if (prevEl) prevEl.innerHTML = renderExecutiveMemoHtml(text);
  var tabPrev = $('memo-tab-preview'), tabRaw = $('memo-tab-raw');
  if (tabPrev && tabRaw && ta && prevEl) {
    tabPrev.classList.add('active');
    tabRaw.classList.remove('active');
    prevEl.style.display = 'block';
    ta.style.display = 'none';
  }
  openModalAnimated($('memo-dialog'));
  refreshIcons($('memo-dialog'));
}

// ---- import --------------------------------------------------------------

function setProgress(msg) {
  var el = $('import-progress');
  el.hidden = !msg;
  el.innerHTML = msg ? '<span class="spin"></span> ' + esc(msg) : '';
}

function acceptTable(item) {
  var info = KIND_INFO[item.kind];
  if (item.missing.length) {
    IMPORT_ERRORS.push({ file: item.file, error: info.label + ' is missing required columns: ' + item.missing.join(', ') + '. Nothing was loaded from it.' });
    return;
  }
  if (item.kind === 'baseline' || item.kind === 'activities') {
    var p = prefs();
    p[item.kind] = { file: item.file, at: new Date().toISOString(), table: item.table };
    if (item.kind === 'activities') delete p.field;   // the workbook's own field conduct
    savePrefs(p);
    loadReferenceTables();
    if (item.kind === 'activities') TABS.Activities = item.table;
    if (item.kind === 'baseline') TABS.Baseline = item.table;
  } else {
    if (item.kind === 'activityTracker') {
      validateTrackerTable(item.table);
      delete TABS.Raw_Participants; delete TABS.Raw_HH_Participation;
      delete LOADED.participants; delete LOADED.households;
    }
    TABS[info.sheet] = item.table;
    PEOPLE = null; VERIFY.cache = null;
    if (typeof MOV_CACHE !== 'undefined') MOV_CACHE = null;
    savedNewExports(item.kind);
  }
  LOADED[item.kind] = { file: item.file, sheet: item.sheet, rows: item.table.rows.length };
}

function handleFiles(fileList) {
  var files = Array.prototype.slice.call(fileList || []);
  if (!files.length) return;
  if (!home() || STATE.editHome) { toast('Choose your municipality first (step 1).'); return; }
  IMPORT_ERRORS = IMPORT_ERRORS.filter(function (e) { return !files.some(function (f) { return f.name === e.file; }); });
  // A saved .pcrp file is the whole session: open it on its own.
  var save = files.filter(function (f) { return /.pcrp$/i.test(f.name); })[0];
  if (save) {
    setProgress('Opening ' + save.name + '…');
    savedFromFile(save).catch(function (e) { setProgress(''); IMPORT_ERRORS.push({ file: save.name, error: e.message }); renderImport(); });
    return;
  }
  files.reduce(function (pr, f) {
    return pr.then(function () {
      setProgress('Reading ' + f.name + '…');
      return readDataFile(f, setProgress).then(function (found) { found.forEach(acceptTable); })
        .catch(function (e) { IMPORT_ERRORS.push({ file: f.name, error: e.message }); });
    });
  }, Promise.resolve()).then(function () {
    setProgress('');
    renderImport(); renderStatus(); updateTabBadges();
    if (typeof savedSaveCurrent === 'function') savedSaveCurrent();
    if (LOADED.activityTracker) {
      computeAndShow(STATE.computed ? null : 'profile');
    } else {
      setTabsEnabled(true);
    }
  });
}

function computeAndShow(thenPage) {
  if (!LOADED.activityTracker) { toast('Load the Activity Tracker first.'); return; }
  setProgress('Computing the findings… (a few seconds for a full regional export)');
  setTimeout(function () {
    try {
      var t0 = Date.now();
      computeAll(prefs().evalDate || '');
      PEOPLE = null;                    // the People index is rebuilt on first use
      S.overview = apiOverview('');
      S.matrix = apiMatrix();
      S.healthOpen = null;
      STATE.computed = true; STATE.computedAt = new Date(); STATE.ms = Date.now() - t0;
      applyHomeScope();
      setProgress('');
      setTabsEnabled(true);
      renderStatus();
      renderImport();   // shows how much of the chosen municipality the export covers
      updateTabBadges();
      if (thenPage) go(thenPage); else renderPage();
      savedAfterCompute();
      var cov = homeCoverage();
      toast(cov && !cov.encoded
        ? 'Findings ready, but the export has no records for ' + homeLabel() + '. Check the file.'
        : 'Findings ready for ' + homeLabel() + ' (' + (STATE.ms / 1000).toFixed(1) + ' s).');
    } catch (e) {
      setProgress('');
      IMPORT_ERRORS.push({ file: 'Computation', error: e.message });
      renderImport();
      console.error(e);
    }
  }, 30);
}

function renderImport() {
  renderHome();
  renderSavedBar();
  var kinds = [
    { k: 'activityTracker', ico: 'calendar-check', desc: 'Activity attendance summaries and household participation counts in one file.' },
    { k: 'movs', ico: 'files', desc: 'Assessed separately from attendance: uploaded MOV attachment records from KCIS.' },
    { k: 'volunteers', ico: 'list-checks', desc: 'Needed for 1st BA BResT / SFMSC & MResT tracking.' }
  ];
  var p = prefs();
  var cards = kinds.map(function (item) {
    var k = item.k, l = LOADED[k], info = KIND_INFO[k];
    return '<div class="slot-card' + (l ? ' loaded' : '') + '">' +
      '<div class="slot-head">' +
        '<div class="slot-title">' + icon(item.ico) + ' <span>' + esc(info.label) + '</span></div>' +
        '<span class="status-chip ' + (l ? 'ok' : (k === 'activityTracker' ? 'off' : '')) + '">' + (l ? '✓ Loaded' : ((k === 'activityTracker' || k === 'movs') ? 'Required' : 'Optional')) + '</span>' +
      '</div>' +
      '<div class="slot-meta">' + (l
        ? esc(l.file) + (l.sheet && l.sheet !== 'Sheet1' ? ' · sheet ' + esc(l.sheet) : '') + ' · <strong>' + n(l.rows) + ' rows</strong>'
        : esc(item.desc)) + '</div>' +
    '</div>';
  });
  var refs = '<div class="import-item">' +
    '<span class="status-chip ok">✓ ' + (p.baseline ? 'Custom loaded' : 'Built-in') + '</span>' +
    '<div><div class="what">Baseline (monitored barangays)</div><div class="where">' +
    (p.baseline ? esc(p.baseline.file) : 'From ' + esc(BUILT_IN.source)) + ' · configurable in <a class="link" href="#sec-baseline" data-target="sec-baseline">Baseline Masterlist below</a></div></div><span></span></div>';
  var errs = IMPORT_ERRORS.map(function (e) {
    return '<div class="msg bad" style="margin-top:10px;margin-bottom:0">' + icon('alert-triangle') + ' <div><strong>' + esc(e.file) + '</strong>: ' + esc(e.error) + '</div></div>';
  });
  var cov = homeCoverage();
  var covLine = cov ? '<div class="msg ' + (cov.encoded ? 'ok' : 'warn') + '" style="margin-top:10px;margin-bottom:0">' +
    icon(cov.encoded ? 'check-circle-2' : 'alert-triangle') + ' <div>' + (cov.encoded
    ? '<strong>' + esc(homeLabel()) + '</strong>: ' + n(cov.encoded) + ' of ' + n(cov.barangays) + ' monitored barangays have records in this export.'
    : 'This export has <strong>no records for ' + esc(homeLabel()) + '</strong>. Is it the right file, and is your municipality set correctly?') + '</div></div>' : '';
  var pullLine = LOADED.activityTracker ? '<div class="toolbar-row" style="margin-top:12px;margin-bottom:0">' +
    '<label class="field"><span>KCIS pull date of these exports</span><input type="date" data-act="im-evaldate" value="' + attr(p.evalDate || today()) + '"></label>' +
    '<span class="tiny" style="flex:1 1 240px">The day the exports were pulled from KCIS. Set it whenever you drop a newer pull: the 3-day attendance window and the Fix list (new, still open, resolved) go by this date.</span></div>' : '';
  var lockNotice = (!home() || STATE.editHome) ? (
    '<div class="msg warn" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        icon('alert-triangle') +
        '<div><strong>Workspace scope required:</strong> Select your Role &amp; Municipality in Section 1 above to unlock data import.</div>' +
      '</div>' +
      '<a class="btn primary btn-sm" href="#sec-scope" data-target="sec-scope">Set Scope in Section 1 ↑</a>' +
    '</div>'
  ) : '';
  $('import-list').innerHTML = lockNotice + '<div class="import-grid">' + cards.join('') + '</div>' + refs + errs.join('') + covLine + pullLine;
  var btnCompute = $('btn-compute');
  if (btnCompute) {
    btnCompute.disabled = !LOADED.activityTracker;
    btnCompute.innerHTML = icon('layout-dashboard') + ' <span>' + (STATE.computed ? 'Recompute findings' : 'Show findings') + '</span>';
  }
  var btnComputeSide = $('btn-compute-side');
  if (btnComputeSide) {
    btnComputeSide.disabled = !LOADED.activityTracker;
    btnComputeSide.innerHTML = icon('layout-dashboard') + ' <span>' + (STATE.computed ? 'Recompute findings' : 'Show findings') + '</span>';
  }
}

function renderStatus() {}

// ---- scope helpers ---------------------------------------------------------

function actSeqNum(s) {
  if (typeof s === 'number') return s;
  var n = parseFloat(s);
  return isNaN(n) ? 999 : n;
}

function stageActs() {
  var list = (S.overview && S.overview.activities ? S.overview.activities : []).filter(function (a) {
    return (a.stage || 1) === STATE.stage;
  });
  return list.slice().sort(function (a, b) {
    return actSeqNum(a.seq) - actSeqNum(b.seq);
  });
}
function matrixRows() {
  if (isMunicipalUser()) {
    var key = homeKey();
    return (S.matrix.rows || []).filter(function (r) { return r.province + '|' + r.municipality === key; });
  }
  return (S.matrix.rows || []).filter(function (r) { return !STATE.prov || r.province === STATE.prov; });
}
/** The rows the Overview and the export summarise: the chosen municipality, else the province filter. */
function overviewRows() {
  if (isMunicipalUser()) {
    var key = homeKey();
    return (S.matrix.rows || []).filter(function (r) { return r.province + '|' + r.municipality === key; });
  }
  var key = homeKey();
  return key ? (S.matrix.rows || []).filter(function (r) { return r.province + '|' + r.municipality === key; }) : matrixRows();
}
function inOverviewScope(p) {
  if (isMunicipalUser()) {
    var key = homeKey();
    return p.province + '|' + p.municipality === key;
  }
  var key = homeKey();
  return key ? p.province + '|' + p.municipality === key : (!STATE.prov || p.province === STATE.prov);
}

/** Activity tallies for the Overview scope, from the matrix rows. */
function scopedPipeline() {
  var rows = overviewRows();
  return stageActs().map(function (a) {
    var t = { expected: 0, complete: 0, noAttendees: 0, notEncoded: 0, backlog: 0, attendees: 0, attendanceEncoded: 0 };
    rows.forEach(function (r) {
      var c = r.cells[a.code];
      if (!c) return;
      t.expected += c.expected || 0; t.complete += c.complete || 0; t.noAttendees += c.noAttendees || 0;
      t.encoded = (t.encoded || 0) + (c.encoded || 0); t.movsReady = (t.movsReady || 0) + (c.movsReady || 0); t.movBacklog = (t.movBacklog || 0) + (c.movBacklog || 0); t.attendanceEncoded += c.attendanceEncoded || 0;
      t.notEncoded += c.notEncoded || 0; t.backlog += c.backlog || 0; t.attendees += c.attendees || 0;
    });
    return Object.assign({ a: a }, t);
  });
}
function progressBar(ok, warn, total) {
  var w = function (v) { return total ? Math.max(0, Math.min(100, v / total * 100)).toFixed(1) : 0; };
  return '<span class="bar" role="img" aria-label="' + attr(ok + ' compliant, ' + warn + ' needing review, of ' + total) + '">' +
    (ok ? '<i class="ok" style="width:' + w(ok) + '%"></i>' : '') + (warn ? '<i class="warn" style="width:' + w(warn) + '%"></i>' : '') + '</span>';
}

function activityProgressSum(items) {
  return items.reduce(function (t, x) {
    ['expected', 'encoded', 'complete', 'movsReady', 'movBacklog'].forEach(function (k) { t[k] += x[k] || 0; });
    return t;
  }, { expected: 0, encoded: 0, complete: 0, movsReady: 0, movBacklog: 0 });
}
function activityProgressBars(t, stage) {
  t = t || {}; stage = stage || STATE.stage;
  var target = t.expected || 0, tracker = !!LOADED.activityTracker, mov = !!(SNAP && SNAP.movs && SNAP.movs.imported);
  var rows = [{ label: 'Encoded', count: t.encoded || 0, assessed: tracker, css: 'encoding' },
    { label: 'With attendees', count: t.complete || 0, assessed: tracker, css: 'attendance' },
    { label: 'MOVs ready', count: t.movsReady || 0, assessed: stage === 1 && mov, css: 'movs', reason: stage !== 1 ? 'Not assessed for this stage' : 'Not assessed' }];
  return '<div class="activity-progress-stack">' + rows.map(function (r) {
    var rate = target ? Math.max(0, Math.min(100, r.count / target * 100)) : 0;
    var value = r.assessed ? n(r.count) + '/' + n(target) + ' · ' + (target ? rate.toFixed(1).replace(/\.0$/, '') + '%' : 'N/A') : r.reason || 'Not assessed';
    return '<div class="activity-progress-row ' + r.css + '"><div class="activity-progress-label"><span>' + r.label + '</span><span>' + value + '</span></div>' +
      '<div class="activity-progress-track" role="img" aria-label="' + attr(r.label + ': ' + value) + '"><i style="width:' + (r.assessed ? rate : 0) + '%"></i></div></div>';
  }).join('') + '</div>';
}
function quotaMiniProgressBar(count, total, targetRate, targetLabel) {
  if (!total || total <= 0) {
    return '<span class="tiny text-muted">—</span>';
  }
  var rate = count / total;
  var pct = Math.max(0, Math.min(100, Math.round(rate * 100)));
  var isMet = rate >= targetRate;
  var statusCls = isMet ? 'is-met' : 'is-below';
  var colorVar = isMet ? 'var(--good-text)' : 'var(--warn-text)';
  var targetPct = Math.round(targetRate * 100);

  return (
    '<div class="quota-mini-cell" title="' + attr(n(count) + ' of ' + n(total) + ' (' + pct + '%). ' + targetLabel) + '">' +
      '<div class="quota-label-row">' +
        '<strong style="color:' + colorVar + '">' + n(count) + ' <span class="tiny" style="font-size:10.5px">(' + pct + '%)</span></strong>' +
        '<span class="tiny muted" style="font-size:9.5px">' + targetPct + '% req</span>' +
      '</div>' +
      '<div class="quota-progress-wrap">' +
        '<div class="quota-progress-bar ' + statusCls + '" style="width:' + pct + '%;' + (isMet ? 'background:var(--good);' : 'background:var(--warn);') + '"></div>' +
        '<div class="quota-threshold-marker" style="left:' + targetPct + '%;" title="Target: ' + targetPct + '%"></div>' +
      '</div>' +
    '</div>'
  );
}

// ---- settings ----------------------------------------------------------------

function renderSettings() {
  renderImport();

  var p = prefs(), bs = baselineSummary();
  var acts = readActivities();

  // 1. Baseline Reference Masterlist
  var baseEl = $('st-baseline-container');
  if (baseEl) {
    baseEl.innerHTML =
      '<div class="card">' +
        '<div class="card-head" style="margin-bottom:8px">' +
          '<div>' +
            '<h2>Baseline Reference Masterlist</h2>' +
            '<div class="muted">Official masterlist of monitored municipalities and barangays.</div>' +
          '</div>' +
          '<span class="pill good">' + icon('database') + ' Reference Masterlist</span>' +
        '</div>' +
        '<p class="muted">' + (p.baseline ? 'Loaded from <strong>' + esc(p.baseline.file) + '</strong> on ' + esc(new Date(p.baseline.at).toLocaleString()) + '.'
          : 'Built in from <strong>' + esc(BUILT_IN.source) + '</strong> (built ' + esc(new Date(BUILT_IN.builtAt).toLocaleDateString()) + ').') +
        ' ' + n(bs.rows) + ' barangays listed; ' + n(bs.brgys) + ' monitored in ' + n(bs.munis) + ' municipalities.</p>' +
        '<div class="row-actions" style="margin-top:12px">' +
          '<label class="btn ghost">' + icon('upload-cloud') + ' <span>Load a newer baseline…</span><input type="file" id="st-baseline" accept=".xlsx,.csv" hidden></label>' +
          (p.baseline ? '<button class="btn ghost" data-act="baseline-reset">' + icon('rotate-ccw') + ' <span>Use built-in baseline</span></button>' : '') +
        '</div>' +
        '<p class="tiny" style="margin-top:8px">A Baseline file needs Province, Municipality, and Barangay columns (PSGC codes and Monitored are used when present). The monitor workbook works too.</p>' +
      '</div>';

    var bf = $('st-baseline');
    if (bf) bf.addEventListener('change', function () {
      var f = bf.files[0]; if (!f) return;
      readDataFile(f).then(function (found) {
        var b = found.filter(function (x) { return x.kind === 'baseline'; })[0];
        if (!b) throw new Error(f.name + ' has no Baseline (Province, Municipality, Barangay) table.');
        acceptTable(b);
        toast('Baseline loaded: ' + n(b.table.rows.length) + ' barangays.');
        afterSettingsChange();
      }).catch(function (e) { toast(e.message); });
    });
  }

  // 2. Field Conduct Rules
  var condEl = $('st-conduct-container');
  if (condEl) {
    var q = normSearch(STATE.settingsSearch || '');
    var filteredActs = acts.filter(function (a) {
      if (!q) return true;
      return normSearch(a.seq + ' ' + a.code + ' ' + a.label + ' Stage ' + a.stage + ' ' + a.field).indexOf(q) !== -1;
    });
    var curCol = (STATE.settingsSort && STATE.settingsSort.col) || 'seq';
    var curDir = (STATE.settingsSort && STATE.settingsSort.dir) || 'asc';
    var stExtractors = {
      seq: function (a) { return actSeqNum(a.seq); },
      activity: function (a) { return a.label; },
      stage: function (a) { return a.stage || 1; },
      field: function (a) { return a.field; }
    };
    var sortedActs = tblSort(filteredActs, curCol, curDir, stExtractors);
    var th = function (col, label, num) {
      return sortTh({ col: col, curCol: curCol, dir: curDir, label: label, num: num, act: 'st-sort' });
    };
    var actRows = sortedActs.map(function (a) {
      return '<tr><td class="num">' + esc(a.seq) + '</td><td><strong>' + esc(a.label) + '</strong></td><td>Stage ' + esc(a.stage) + '</td><td><select data-act="field" data-v="' + attr(a.code) + '">' +
        FIELD_VALUES.map(function (f) { return '<option' + (a.field === f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></td></tr>';
    }).join('');

    condEl.innerHTML =
      '<div class="card">' +
        '<div class="card-head" style="margin-bottom:8px">' +
          '<div>' +
            '<h2>Field Conduct Rules per Activity</h2>' +
            '<div class="muted">A record not in KCIS counts as lacking only when its activity is marked <strong>Completed</strong> in the field. ' +
              (p.activities ? 'Taken from <strong>' + esc(p.activities.file) + '</strong>.' : 'Starts from built-in monitor settings.') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="toolbar-row" style="margin-top:10px;margin-bottom:12px"><div class="filters" style="margin:0;flex:1">' +
          '<label class="field" style="flex:1"><span>Filter activities</span><input type="search" id="st-act-search" value="' + attr(STATE.settingsSearch) + '" placeholder="Search sequence, activity name, stage, field conduct…"></label>' +
          (STATE.settingsSearch ? '<button type="button" class="btn ghost btn-sm" data-act="st-reset">' + icon('rotate-ccw') + ' <span>Reset</span></button>' : '') +
        '</div><span class="tiny">Showing <strong>' + n(sortedActs.length) + '</strong> of <strong>' + n(acts.length) + '</strong> activities</span></div>' +
        '<div class="table-wrap"><table class="grid"><thead><tr>' +
          th('seq', 'Seq', true) +
          th('activity', 'Activity') +
          th('stage', 'Stage') +
          th('field', 'Field conduct') +
        '</tr></thead><tbody>' + (actRows || '<tr><td colspan="4" class="empty-state">No activity matches your search.</td></tr>') + '</tbody></table></div>' +
      '</div>';

    bindSearch('st-act-search', function (v) { STATE.settingsSearch = v; renderSettings(); });
  }

  // 3. KCIS Pull Date
  var pullEl = $('st-pulldate-container');
  if (pullEl) {
    pullEl.innerHTML =
      '<div class="card">' +
        '<div class="card-head" style="margin-bottom:8px">' +
          '<div>' +
            '<h2>KCIS Pull Date</h2>' +
            '<div class="muted">The date the exports were pulled from KCIS. A record with zero reported participants counts as lacking from the 3rd day after the activity, judged on this date.</div>' +
          '</div>' +
          '<span class="pill neutral">' + icon('calendar') + ' ' + esc(p.evalDate || today()) + '</span>' +
        '</div>' +
        '<div class="filters" style="margin-top:12px">' +
          '<label class="field"><span>Pull date</span><input type="date" id="st-evaldate" value="' + attr(p.evalDate || '') + '"></label>' +
          '<button class="btn ghost" data-act="evaldate-clear">Use today</button>' +
        '</div>' +
      '</div>';

    var ed = $('st-evaldate');
    if (ed) ed.addEventListener('change', function () { var q = prefs(); q.evalDate = ed.value || ''; delete q.evalDateFromSave; savePrefs(q); afterSettingsChange(); });
  }

  // 4. App Version & Semi-Offline Updates
  var updEl = $('st-updates-container');
  if (updEl) {
    var isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    var notesBox = '';
    if (UPDATE_STATE.result && UPDATE_STATE.result.updateAvailable && UPDATE_STATE.result.remote) {
      var rem = UPDATE_STATE.result.remote;
      if (rem.notes && rem.notes.length) {
        notesBox = '<div class="update-notes-box"><div class="update-notes-title">What\'s New in v' + esc(rem.version) + ':</div><ul class="update-notes-list">' +
          rem.notes.map(function (note) { return '<li>' + esc(note) + '</li>'; }).join('') +
        '</ul></div>';
      }
    }
    updEl.innerHTML =
      '<div class="card update-settings-card">' +
        '<div class="card-head" style="margin-bottom:8px">' +
          '<div>' +
            '<h2>App Version &amp; Semi-Offline Updates</h2>' +
            '<div class="muted">Runs 100% offline in field barangays. Connect to Wi-Fi or mobile hotspot when in town to check or download updates.</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span class="pill ' + (isOnline ? 'good' : 'idle') + '" id="net-status-badge">' +
              '<span class="status-dot" style="background:' + (isOnline ? '#16a34a' : 'var(--idle-text)') + '"></span> ' +
              (isOnline ? 'Online' : 'Offline (Field Mode)') +
            '</span>' +
            '<span class="pill neutral">Installed: v' + APP_VERSION + '</span>' +
          '</div>' +
        '</div>' +

        (UPDATE_STATE.checking ? '<div class="msg info" style="margin:10px 0 0"><span class="spin"></span> <strong>Checking for updates…</strong> Connecting to update server.</div>' : '') +
        (UPDATE_STATE.error ? '<div class="msg warn" style="margin:10px 0 0">' + icon('alert-triangle') + ' <div>' + esc(UPDATE_STATE.error) + '</div></div>' : '') +

        (UPDATE_STATE.result && UPDATE_STATE.result.updateAvailable ? (
          '<div class="update-banner-card">' +
            '<div class="update-banner-head">' +
              '<div class="update-banner-title">' +
                '<span class="pill good" style="font-weight:800;font-size:10px;letter-spacing:0.04em">NEW VERSION AVAILABLE</span>' +
                '<h3 style="margin:6px 0 2px;font-size:16px">' + esc(UPDATE_STATE.result.remote.title || ('v' + UPDATE_STATE.result.remote.version)) + '</h3>' +
                '<div class="tiny muted">Released on ' + esc(UPDATE_STATE.result.remote.releaseDate || 'recently') + (UPDATE_STATE.result.remote.fileSize ? ' · ' + esc(UPDATE_STATE.result.remote.fileSize) : '') + '</div>' +
              '</div>' +
              '<div class="row-actions" style="margin:0">' +
                '<button type="button" class="btn primary" data-act="update-download"' + (UPDATE_STATE.downloading ? ' disabled' : '') + '>' +
                  (UPDATE_STATE.downloading ? '<span class="spin"></span>' : icon('download')) +
                  ' <span>' + (UPDATE_STATE.downloading ? esc(UPDATE_STATE.downloadProgress) : 'Download Update (.html)') + '</span>' +
                '</button>' +
                (UPDATE_STATE.result.remote.releaseUrl ? '<a href="' + attr(UPDATE_STATE.result.remote.releaseUrl) + '" target="_blank" rel="noopener noreferrer" class="btn ghost btn-sm">' + icon('external-link') + ' <span>Release Page</span></a>' : '') +
              '</div>' +
            '</div>' +
            notesBox +
            '<div class="update-banner-tip">' +
              icon('info') +
              '<span><strong>Seamless local data transfer:</strong> All your municipal scopes, verification tags, and saved sessions in IndexedDB are automatically kept when opening the new file on this PC.</span>' +
            '</div>' +
          '</div>'
        ) : (UPDATE_STATE.result && !UPDATE_STATE.result.updateAvailable ? (
          '<div class="msg ok" style="margin:10px 0 0">' + icon('check-circle-2') + ' <div><strong>Your app is up to date!</strong> Version v' + APP_VERSION + ' is the latest release.</div></div>'
        ) : '')) +

        '<div class="row-actions" style="margin-top:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<button type="button" class="btn ' + (UPDATE_STATE.result && UPDATE_STATE.result.updateAvailable ? 'ghost' : 'primary') + '" data-act="update-check"' + (UPDATE_STATE.checking ? ' disabled' : '') + '>' +
              (UPDATE_STATE.checking ? '<span class="spin"></span>' : icon('rotate-ccw')) +
              ' <span>' + (UPDATE_STATE.checking ? 'Checking…' : 'Check for updates now') + '</span>' +
            '</button>' +
            '<button type="button" class="btn ghost btn-sm" data-act="update-feed-toggle">' + icon('settings') + ' <span>Feed Server</span></button>' +
          '</div>' +
          '<div class="tiny muted">' +
            (p.lastUpdateCheck ? 'Last checked: ' + new Date(p.lastUpdateCheck).toLocaleString() : 'Never checked') +
          '</div>' +
        '</div>' +

        '<div id="update-feed-config" style="display:none;margin-top:12px;padding-top:12px;border-top:1px dashed var(--border-subtle)">' +
          '<label class="field" style="max-width:100%">' +
            '<span>Update Feed URL (for Regional IT / Custom Server)</span>' +
            '<input type="url" id="st-update-url" value="' + attr(p.updateUrl || DEFAULT_UPDATE_URL) + '" placeholder="https://raw.githubusercontent.com/.../version.json">' +
          '</label>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">' +
            '<button type="button" class="btn ghost btn-sm" data-act="update-feed-save">Save Feed URL</button>' +
            '<button type="button" class="btn ghost btn-sm" data-act="update-feed-reset">Reset to Official Feed</button>' +
            '<button type="button" class="btn ghost btn-sm" data-act="update-demo" title="Preview the update experience with simulated release notes">Preview / Test Update</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // 5. About & Privacy + Workstation Security (DPA)
  var abtEl = $('st-about-container');
  if (abtEl) {
    var sec = typeof PCRP_CRYPTO !== 'undefined' ? PCRP_CRYPTO.getSecurityPrefs() : { enabled: false };
    abtEl.innerHTML =
      '<div class="card note-card">' +
        '<div class="card-head" style="margin-bottom:8px">' +
          '<div>' +
            '<h3>About &amp; Data Privacy Notice</h3>' +
            '<div class="tiny muted">Local execution &amp; compliance guidelines</div>' +
          '</div>' +
          '<span class="pill good">' + icon('shield-check') + ' Privacy Compliant</span>' +
        '</div>' +
        '<ul style="margin:8px 0 0;padding-left:18px;line-height:1.6">' +
          '<li><strong>PCRP Encoding and Data Quality Assessment Tool</strong> runs the Encoding Monitor v' + esc(BUILT_IN.monitorVersion) + ' rules on this computer. Files are never uploaded.</li>' +
          '<li><strong>Caraga Region Implementation</strong> · Vibe coded by: <strong>kjahidalgo</strong>.</li>' +
          '<li>The loaded exports, the findings of earlier pulls, and the verification tags are kept in this browser until you choose "Forget saved data" on the Import card; settings above are remembered too.</li>' +
          '<li>Attendee and volunteer names appear in the app, as for an editor of the web monitor. Handle the exports and any downloaded file under the Data Privacy Act.</li>' +
        '</ul>' +
      '</div>' +
      '<div class="card" style="margin-top:16px">' +
        '<div class="card-head" style="margin-bottom:8px">' +
          '<div>' +
            '<h2>Workstation Security &amp; Session Lock</h2>' +
            '<div class="muted">Protect sensitive participant and household records on shared LGU field laptops with AES-GCM at-rest encryption.</div>' +
          '</div>' +
          '<span class="pill ' + (sec.enabled ? 'good' : 'idle') + '">' +
            (sec.enabled ? icon('shield-check') + ' PIN Lock Active' : icon('shield') + ' No PIN Set') +
          '</span>' +
        '</div>' +
        '<div class="row-actions" style="margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
          (sec.enabled ? (
            '<button type="button" class="btn primary btn-sm" data-act="sec-lock-now">' + icon('shield') + ' <span>Lock Workspace Now</span></button>' +
            '<button type="button" class="btn ghost btn-sm" data-act="sec-change-pin">' + icon('settings') + ' <span>Change PIN</span></button>' +
            '<button type="button" class="btn ghost btn-sm" data-act="sec-disable">' + icon('trash-2') + ' <span>Disable PIN Lock</span></button>'
          ) : (
            '<button type="button" class="btn primary btn-sm" data-act="sec-setup-pin">' + icon('shield-check') + ' <span>Enable PIN Lock &amp; Encryption</span></button>'
          )) +
        '</div>' +
        '<p class="tiny muted" style="margin-top:8px">When active, the workstation session automatically locks after 15 minutes of inactivity and encrypts saved records at rest using 256-bit AES-GCM.</p>' +
      '</div>';
  }

  refreshIcons($('page-settings'));
}

function afterSettingsChange() {
  loadReferenceTables();
  if (STATE.computed) computeAndShow(null);
  renderSettings();
}

// ---- export ------------------------------------------------------------------

function pipelineTable() {
  return [['Seq', 'Activity', 'Level', 'Field conduct', 'Target', 'With attendees', 'Zero participants', 'Not encoded', 'Encoded', 'MOVs ready', 'MOV backlog', 'Attendance backlog', '% complete']]
    .concat(scopedPipeline().map(function (p) { return [p.a.seq, p.a.label, p.a.level, p.a.field, p.expected, p.complete, p.noAttendees, p.notEncoded, p.encoded, STATE.stage === 1 && SNAP.movs && SNAP.movs.imported ? p.movsReady : 'Not assessed', STATE.stage === 1 && SNAP.movs && SNAP.movs.imported ? p.movBacklog : 'Not assessed', p.backlog, p.expected ? Math.round(p.complete / p.expected * 1000) / 10 : '']; }));
}
function muniTable(allStages) {
  var acts = allStages ? S.overview.activities : stageActs();
  var cvOn = S.overview.volunteers && S.overview.volunteers.imported;
  var head = ['Province', 'Municipality'];
  acts.forEach(function (a) { head.push(a.code + ' with attendees', a.code + ' target', a.code + ' zero participants', a.code + ' attendance backlog', a.code + ' encoded', a.code + ' MOVs ready', a.code + ' MOV backlog'); });
  head.push('K2 HH in barangay', 'K2 HH represented', 'K2 %');
  if (cvOn) head.push('BResT encoded', 'BResT target', 'SFMSC encoded', 'SFMSC to fix', 'SFMSC target');
  // the export compares the chosen municipality with the rest of its province
  var h = home(), exportRows = S.matrix.rows.filter(function (r) { return !h || h.region || r.province === h.province; });
  var rows = exportRows.map(function (r) {
    var line = [r.province, r.municipality];
    acts.forEach(function (a) { var c = r.cells[a.code] || {}; line.push(c.complete || 0, c.expected || 0, c.noAttendees || 0, c.backlog || 0, c.encoded || 0, a.stage === 1 && SNAP.movs && SNAP.movs.imported ? c.movsReady || 0 : 'Not assessed', a.stage === 1 && SNAP.movs && SNAP.movs.imported ? c.movBacklog || 0 : 'Not assessed'); });
    var h = r.households || {};
    line.push(h.listed || 0, h.present || 0, h.listed ? Math.round(h.present / h.listed * 1000) / 10 : '');
    if (cvOn) { var v = r.volunteers || {}, B = v.BREST || {}, F = v.SFMSC || {}; line.push(B.encoded || 0, B.expected || 0, F.encoded || 0, F.needsFix || 0, F.expected || 0); }
    return line;
  });
  return [head].concat(rows);
}
function brgyTable(rows, allStages) {
  var acts = allStages ? S.overview.activities : stageActs();
  var cvOn = S.overview.volunteers && S.overview.volunteers.imported;
  var head = ['Province', 'Municipality', 'Barangay', 'PSGC'].concat(acts.map(function (a) { return a.code + ' (Seq ' + a.seq + ')'; }))
    .concat(acts.reduce(function (out, a) { return out.concat([a.code + ' encoded', a.code + ' with attendees', a.code + ' MOVs ready', a.code + ' MOV backlog']); }, []))
    .concat(['K2 HH in barangay', 'K2 HH represented', 'K2 %', '4Ps HH represented', 'IP HH represented', 'SLP HH represented',
             'Individuals female', 'Individuals male', 'Individuals total']).concat(cvOn ? ['BResT', 'BResT volunteers', 'SFMSC', 'SFMSC volunteers', 'SFMSC to fix'] : []).concat(['Attendance backlog']);
  var st = function (x) { return !x || x.notApplicable || x.status === 'N/A' ? 'N/A' : x.status === 'Complete' ? 'Complete (' + x.attendees + ')' : x.status === 'No Attendees' ? 'Attendance not encoded' : 'Not encoded'; };
  return [head].concat(rows.map(function (b) {
    var line = [b.province, b.municipality, b.barangay, b.psgcBrgy || ''].concat(acts.map(function (a) { return st(b.activities[a.code]); }))
      .concat(acts.reduce(function (out, a) { var x = b.activities[a.code], applies = x && !x.notApplicable && x.status !== 'N/A'; var assessed = a.stage === 1 && SNAP.movs && SNAP.movs.imported; return out.concat([applies ? (x.status !== 'Not Encoded' ? 1 : 0) : 'N/A', applies ? (x.attendees > 0 ? 1 : 0) : 'N/A', applies && assessed ? (x.mov && x.mov.ready ? 1 : 0) : 'Not assessed', applies && assessed ? (x.mov && x.mov.lacking ? 1 : 0) : 'Not assessed']); }, []))
      .concat([b.hhListed || 0, b.hhPresent || 0, b.hhListed ? Math.round(b.hhRate * 1000) / 10 : ''])
      .concat(['hh4Ps', 'hhIp', 'hhSlp', 'indivFemale', 'indivMale', 'indivTotal'].map(function (k) {
        var d = b.hhDetail;   // the 1st BA breakdown, when KCIS has it
        return d && d[k] !== null && d[k] !== undefined ? d[k] : '';
      }));
    if (cvOn) {
      var v = b.volunteers || {}, B = v.BREST || {}, F = v.SFMSC || {};
      line = line.concat([B.status || '', B.members || 0, F.status || '', F.members || 0, (F.reasons || []).join('; ')]);
    }
    return line.concat([(b.todo || []).join(' | ')]);
  }));
}
function healthTable() {
  var keep = S.healthScope; S.healthScope = homeKey() ? 'm:' + homeKey() : '';
  var evs = dhEvaluateAll(S.overview, '');
  var lines = [['Check', 'Severity', 'Province', 'Municipality', 'Barangay', 'Detail']];
  evs.forEach(function (e) {
    if (e.pending || e.outOfScope) return;
    var c = e.check;
    if (!e.rows.length && e.count) { lines.push([c.name, DH_SEV[c.severity].label, '', '', '', e.count + ' ' + c.unit[e.count === 1 ? 0 : 1] + ' (count only)']); return; }
    e.rows.forEach(function (r) {
      // the place inside the chosen municipality
      var p = c.places(r).filter(dhInScope)[0] || c.places(r)[0] || {};
      lines.push([c.name, DH_SEV[c.severity].label, p.province || '', p.municipality || '', p.barangay || '', c.detail(r)]);
    });
  });
  S.healthScope = keep;
  return lines;
}
function csvOf(rows) {
  return rows.map(function (r) {
    return r.map(function (v) { var s = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
  }).join('\n');
}
function stamp() { return new Date().toISOString().slice(0, 10); }

function exportExcel() {
  var keepStage = STATE.stage, keepProv = STATE.prov;
  var isMuni = isMunicipalUser();
  var summary = [['PCRP Encoding and Data Quality Assessment Tool — findings'],
    ['User Scope', isMuni ? 'PEA / MDM (Field Municipal Workspace)' : 'Project Evaluation Officer (Region Level) RPMO'],
    ['Municipality', homeLabel()],
    ['Generated', new Date().toLocaleString()],
    ['Pull date', prefs().evalDate || today()],
    ['Monitor rules', 'v' + BUILT_IN.monitorVersion],
    ['Activity Tracker file', LOADED.activityTracker ? LOADED.activityTracker.file : ''],
    ['Volunteer file', LOADED.volunteers ? LOADED.volunteers.file : ''],
    ['MOV file', LOADED.movs ? LOADED.movs.file : ''],
    ['Progress measures', 'Encoded, With attendees and MOVs ready are independent. Attendance backlog and MOV backlog are separate.'], []];
  STATE.prov = '';
  [1, 2].forEach(function (s) { STATE.stage = s; summary.push(['Stage ' + s]); summary = summary.concat(pipelineTable()); summary.push([]); });
  STATE.stage = keepStage; STATE.prov = keepProv;
  var sheets = [
    { name: 'Summary', rows: summary }
  ];
  if (!isMuni) {
    sheets.push({ name: 'Municipalities', rows: muniTable(true) });
  }
  sheets.push({ name: 'Barangays', rows: brgyTable((SNAP.barangayRows || []).filter(function (b) { return !homeKey() || inOverviewScope(b); }), true) });
  sheets.push({ name: 'DQA Audit', rows: healthTable() });
  sheets.push({ name: 'Stage 1 MOVs', rows: movExportRows(movGetData(), inOverviewScope) });
  sheets.push({ name: 'MOV Attachments', rows: movAttachmentExportRows(movGetData(), inOverviewScope) });
  var attendance = (SNAP.attendanceRows || []).filter(inOverviewScope);
  sheets.push({ name: 'Attendance Summary', rows: [['Province', 'Municipality', 'Barangay', 'Activity', 'Target Start', 'Target End', 'Actual Start', 'Actual End',
    'Participants Male', 'Participants Female', 'Participants Unspecified', 'Participants Total', 'Person Volunteers Male', 'Person Volunteers Female', 'Person Volunteers Unspecified', 'Person Volunteers Total', 'Source Rows', 'Repeated']].concat(attendance.map(function (r) {
      return [r.province, r.municipality, r.barangay, r.actLabel, r.targetStart, r.targetEnd, r.dateStart, r.dateEnd,
        r.participants.male, r.participants.female, r.participants.unspecified, r.participants.total,
        r.personVolunteers.male, r.personVolunteers.female, r.personVolunteers.unspecified, r.personVolunteers.total,
        r.sourceRows.map(function (x) { return x.sourceRow; }).join('; '), r.repeated ? 'Included; review DQA' : 'No'];
    })) });
  var fname = 'PCRP_findings_' + (homeKey() ? (isMuni ? home().municipality.replace(/[^A-Za-z0-9]+/g, '_') + '_' : '') : 'Regional_') + stamp() + '.xlsx';
  saveBlob(makeXlsx(sheets), fname);
  toast('Saved ' + fname + ' (' + sheets.length + ' sheets).');
}

// ---- events -------------------------------------------------------------------

document.addEventListener('click', function (ev) {
  var t = ev.target.closest('[data-act]');
  if (!t) return;
  var act = t.getAttribute('data-act'), v = t.getAttribute('data-v');
  if (t.tagName === 'SELECT') return;
  if (act === 'stage') { STATE.stage = Number(v); renderPage(); }
  else if (act === 'prov') { STATE.prov = v || ''; renderPage(); updateTabBadges(); }
  else if (act === 'go') go(v);
  else if (act === 'muni') openMuni(v);
  else if (act === 'health-open') {
    S.healthOpen = {}; S.healthOpen[v] = true;
    S.healthScope = homeKey() ? 'm:' + homeKey() : (STATE.prov ? 'p:' + STATE.prov : '');
    S.healthView = 'check'; S.healthSeverity = 'all'; go('health');
  }
  else if (act === 'home-edit') { openScopeDialog(); }
  else if (act === 'home-cancel') { STATE.editHome = false; renderHome(); }
  else if (act === 'role-pick') { STATE.pendingRole = v; renderHome(); }
  else if (act === 'home-save') {
    var sel = $('home-select');
    var r = STATE.pendingRole || userRole() || 'pea_mdm';
    if (r === 'pea_mdm') {
      saveHome(sel ? sel.value : '', 'pea_mdm');
    } else {
      saveHome('REGION', 'rpmo');
    }
  }
  else if (act === 'p-open') {
    var parts = (v || '').split('#');
    var targetTab = parts[0] || 'attendees';
    var bkey = parts[1] || '';
    var sub = parts[2] || '';
    if (targetTab === 'attendees' || targetTab === 'households') {
      profileOpenLocation(bkey, sub, !!sub);
    } else if (targetTab === 'volunteers') {
      if (sub === 'BREST') {
        if (typeof BRT_STATE !== 'undefined') { BRT_STATE.brgy = bkey; }
        go('brest');
      } else if (sub === 'CSPMC' || sub === 'CMSC' || sub === 'STAGE2') {
        if (typeof CSPMC_STATE !== 'undefined') { CSPMC_STATE.brgy = bkey; }
        go('cspmc');
      } else {
        if (typeof VOL_STATE !== 'undefined') { VOL_STATE.brgy = bkey; VOL_STATE.body = sub || 'all'; }
        go('volunteers');
      }
    } else {
      go(targetTab);
    }
  }
  else if (act === 'dqa-jump') {
    var checkId = t.getAttribute('data-check') || '';
    var bkey = t.getAttribute('data-brgy') || '';
    var muniKey = t.getAttribute('data-muni') || '';
    var actCode = t.getAttribute('data-actcode') || '';
    var nameVal = t.getAttribute('data-name') || t.getAttribute('data-search') || '';
    var source = t.getAttribute('data-source') || '';
    var bodyVal = t.getAttribute('data-body') || '';
    var problem = t.getAttribute('data-problem') || '';
    var count = t.getAttribute('data-count') || '';

    var checkLabel = (typeof DH_SHORT !== 'undefined' && DH_SHORT[checkId]) ? DH_SHORT[checkId] : checkId;
    STATE.dqaOrigin = {
      checkId: checkId,
      bkey: bkey,
      muniKey: muniKey,
      label: checkLabel,
      count: count
    };

    if (checkId.indexOf('mov_') === 0) {
      MOV_UI.municipality = muniKey; MOV_UI.activity = actCode; MOV_UI.search = ''; MOV_UI.status = ''; MOV_UI.open = '';
      var parts = (bkey || (muniKey + '|')).split('|');
      var groupKey = movGroupKey({ province: parts[0] || '', municipality: parts[1] || '', barangay: parts[2] || '' }, actCode);
      MOV_UI.requirement = t.getAttribute('data-requirement') || ''; MOV_UI.note = null; MOV_UI.limit = 60;
      if (movGetData().byKey[groupKey]) MOV_UI.open = groupKey;
      else { MOV_UI.view = 'attachments'; MOV_UI.search = t.getAttribute('data-path') || ''; }
      go('movs');
    } else if (checkId === 'quorum' || checkId === 'hhcounts' || checkId === 'hhattendance') {
      profileOpenLocation(bkey || muniKey, actCode || 'BA1', !!bkey);
    } else if (checkId === 'activityrepeat' || checkId === 'summaryfigures' || checkId === 'late' || checkId === 'dates' || checkId === 'multidate' || checkId === 'attdup' || checkId === 'sex' || checkId === 'unmapped') {
      // The profile's attendance panel shows the source rows, dates and counts behind these findings.
      profileOpenLocation(bkey || muniKey, actCode, !!actCode);
    } else if (checkId === 'names') {
      if (source === 'Volunteers') {
        if (typeof VOL_STATE !== 'undefined') {
          if (bkey) VOL_STATE.brgy = bkey;
        }
        go('volunteers');
      } else profileOpenLocation(bkey || muniKey, actCode, !!actCode);
    } else if (checkId === 'sequence') {
      profileOpenLocation(bkey || muniKey, '', false);
    } else if (checkId === 'cv_missing') {
      if (typeof BRT_STATE !== 'undefined' && bkey) {
        BRT_STATE.brgy = bkey;
        BRT_STATE.status = 'all';
      }
      go('brest');
    } else if (checkId === 'cv_sfmsc' || checkId === 'cv_tagging' || checkId === 'cv_gaps') {
      if (typeof VOL_STATE !== 'undefined') {
        if (bkey) VOL_STATE.brgy = bkey;
        if (bodyVal) VOL_STATE.body = bodyVal;
        if (problem === 'No committee') VOL_STATE.flag = 'nocommittee';
        else if (problem && problem.indexOf('Tagged to') !== -1) VOL_STATE.flag = 'otherbody';
        else if (problem === 'No name') VOL_STATE.flag = 'noname';
        else if (problem === 'Sex not recorded') VOL_STATE.flag = 'nosex';
        else if (problem) VOL_STATE.flag = 'has_flags';
      }
      go('volunteers');
    } else if (checkId === 'baseline') {
      go('settings');
      var sec = $('sec-baseline');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      go('health');
    }
    toast('Inspecting findings from DQA Audit (' + checkLabel + ').');
  }
  else if (act === 'dqa-return') {
    var orig = STATE.dqaOrigin;
    STATE.dqaOrigin = null;
    go('health');
    if (orig && orig.checkId && typeof S !== 'undefined') {
      S.healthOpen = S.healthOpen || {};
      S.healthOpen[orig.checkId] = true;
      if (typeof renderHealth === 'function') renderHealth();
      setTimeout(function () {
        var el = document.querySelector('.dh-check.sev-critical.is-open, .dh-check.sev-verify.is-open, .dh-check.is-open');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }
  else if (act === 'st-sort') {
    var col = t.getAttribute('data-col');
    if (STATE.settingsSort.col === col) {
      STATE.settingsSort.dir = STATE.settingsSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      STATE.settingsSort.col = col;
      STATE.settingsSort.dir = 'asc';
    }
    renderSettings();
  }
  else if (act === 'st-reset') { STATE.settingsSearch = ''; renderSettings(); }
  else if (act === 'baseline-reset') { var p = prefs(); delete p.baseline; savePrefs(p); toast('Using the built-in baseline.'); afterSettingsChange(); }
  else if (act === 'evaldate-clear') { var q = prefs(); delete q.evalDate; delete q.evalDateFromSave; savePrefs(q); afterSettingsChange(); }
  else if (act === 'update-check') { checkForUpdates(true); }
  else if (act === 'update-download') { downloadAppUpdate(); }
  else if (act === 'open-updates') {
    go('settings');
    setTimeout(function () {
      var sec = $('sec-updates');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }
  else if (act === 'update-feed-toggle') {
    var cfg = $('update-feed-config');
    if (cfg) cfg.style.display = cfg.style.display === 'none' ? 'block' : 'none';
  }
  else if (act === 'update-feed-save') {
    var inp = $('st-update-url');
    if (inp) {
      var p = prefs();
      p.updateUrl = inp.value.trim();
      savePrefs(p);
      toast('Update feed URL saved.');
      renderSettings();
    }
  }
  else if (act === 'update-feed-reset') {
    var p = prefs();
    delete p.updateUrl;
    savePrefs(p);
    toast('Reset to official update feed.');
    renderSettings();
  }
  else if (act === 'update-demo') {
    UPDATE_STATE.checking = false;
    UPDATE_STATE.error = null;
    UPDATE_STATE.result = {
      updateAvailable: true,
      remote: {
        version: '2.17.0',
        releaseDate: today(),
        title: 'PCRP Encoding and Data Quality Assessment Tool v2.17.0',
        fileSize: '1125 KB',
        notes: [
          'Preview simulation: next-generation real-time multi-user telemetry and export sync',
          'Automated data validation rules for Stage 3 community procurement sub-projects'
        ],
        downloadUrl: 'https://raw.githubusercontent.com/hidalgokimjohn/pcrp-monitor-desktop/main/dist/PCRP%20Encoding%20and%20Data%20Quality%20Assessment%20Tool.html',
        releaseUrl: 'https://github.com/hidalgokimjohn/pcrp-monitor-desktop'
      }
    };
    toast('Simulated v2.17.0 update available!');
    renderSettings();
    updateTabBadges();
    renderStatus();
    renderBrandUpdateStatus();
  }
  else if (act === 'sec-lock-now') {
    if (typeof PCRP_CRYPTO !== 'undefined') PCRP_CRYPTO.lockSession('Manual lock triggered by user.');
  }
  else if (act === 'sec-setup-pin' || act === 'sec-change-pin') {
    var p1 = prompt('Enter a 4-to-8 digit PIN to protect this workstation session:');
    if (!p1) return;
    if (p1.length < 4) { alert('PIN must be at least 4 digits.'); return; }
    var p2 = prompt('Confirm your 4-to-8 digit PIN:');
    if (p1 !== p2) { alert('PIN confirmation did not match.'); return; }
    PCRP_CRYPTO.setPin(p1).then(function () {
      toast('Workstation security PIN enabled (AES-GCM-256 active).');
      renderSettings();
    }).catch(function (e) { toast(e.message); });
  }
  else if (act === 'sec-disable') {
    if (confirm('Disable PIN lock and storage encryption for this browser?')) {
      PCRP_CRYPTO.disableSecurity();
      toast('PIN lock disabled.');
      renderSettings();
    }
  }
  else if (act === 'open-lacking') {
    var bkey = t.getAttribute('data-brgy') || (t.closest('[data-brgy]') && t.closest('[data-brgy]').getAttribute('data-brgy'));
    openLackingModal(bkey);
  }
});
document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'lock-pin-input') {
    var btn = $('btn-unlock-session');
    if (btn) btn.click();
    return;
  }
  if (ev.key === 'Enter' || ev.key === ' ') {
    var th = ev.target && ev.target.closest && ev.target.closest('th.sortable');
    if (th) { ev.preventDefault(); th.click(); return; }
  }
});
document.addEventListener('change', function (ev) {
  var t = ev.target;
  var act = t.getAttribute && t.getAttribute('data-act');
  if (act === 'prov-select') { STATE.prov = t.value; renderPage(); updateTabBadges(); }
  else if (act === 'im-evaldate') {
    var q = prefs(); q.evalDate = t.value || ''; delete q.evalDateFromSave; savePrefs(q);
    if (STATE.computed) computeAndShow(null); else renderImport();
  }
  else if (act === 'field') {
    var p = prefs(); p.field = p.field || {}; p.field[t.getAttribute('data-v')] = t.value; savePrefs(p);
    toast('Field conduct saved' + (STATE.computed ? '; recomputing.' : '.')); afterSettingsChange();
  }
});

// Close <dialog> when clicking its backdrop
['memo-dialog', 'person-dialog', 'scope-dialog', 'delta-dialog', 'lacking-dialog'].forEach(function (id) {
  var dlg = $(id);
  if (dlg) dlg.addEventListener('click', function (ev) {
    if (ev.target === dlg) dlg.close();
  });
});

if ($('btn-theme')) $('btn-theme').addEventListener('click', toggleTheme);
// Masthead utility row: today's date, as in the Apps Script UI kit.
if ($('masthead-date')) $('masthead-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
// The sticky tab band wraps to two rows on narrower laptops: publish its real height
// (--band-h) so the sticky Settings sidebar and section anchors clear it.
if (typeof ResizeObserver === 'function' && $('tabs')) {
  new ResizeObserver(function () { document.documentElement.style.setProperty('--band-h', $('tabs').offsetHeight + 'px'); }).observe($('tabs'));
}
$('tabs').addEventListener('click', function (ev) {
  var trigger = ev.target.closest('.tab-group-trigger');
  if (trigger && !trigger.disabled) {
    var group = trigger.closest('.nav-tab-group');
    if (group) {
      var wasOpen = group.classList.contains('open');
      Array.prototype.forEach.call(document.querySelectorAll('.nav-tab-group.open'), function (g) {
        g.classList.remove('open');
      });
      if (!wasOpen) group.classList.add('open');
    }
    return;
  }
  var b = ev.target.closest('button[data-page]');
  if (b && !b.disabled) {
    Array.prototype.forEach.call(document.querySelectorAll('.nav-tab-group.open'), function (g) {
      g.classList.remove('open');
    });
    go(b.getAttribute('data-page'));
  }
});

document.addEventListener('click', function (ev) {
  // Close nav-tab-group dropdowns if clicking outside
  if (!ev.target.closest('.nav-tab-group')) {
    Array.prototype.forEach.call(document.querySelectorAll('.nav-tab-group.open'), function (g) {
      g.classList.remove('open');
    });
  }
  // In-page sub-navigation tabs quick switch
  var subBtn = ev.target.closest('.sub-nav-btn[data-go]');
  if (subBtn) {
    var target = subBtn.getAttribute('data-go');
    if (target) go(target);
    return;
  }
  // Settings sidebar menu anchor links
  var navItem = ev.target.closest('.settings-nav-item, a[data-target^="sec-"]');
  if (navItem) {
    var targetId = navItem.getAttribute('data-target') || (navItem.getAttribute('href') || '').replace('#', '');
    var targetSec = targetId ? $(targetId) : null;
    if (targetSec) {
      ev.preventDefault();
      Array.prototype.forEach.call(document.querySelectorAll('.settings-nav-item'), function (el) {
        var match = el === navItem || el.getAttribute('data-target') === targetId;
        el.classList.toggle('active', match);
      });
      targetSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  // Unlock workspace button in lock overlay
  if (ev.target && (ev.target.id === 'btn-unlock-session' || ev.target.closest('#btn-unlock-session'))) {
    var inp = $('lock-pin-input');
    var pin = inp ? inp.value.trim() : '';
    if (!pin) return;
    if (typeof PCRP_CRYPTO !== 'undefined') {
      PCRP_CRYPTO.unlockSession(pin).then(function (ok) {
        if (ok) {
          toast('Workspace unlocked.');
          var err = $('lock-error');
          if (err) err.style.display = 'none';
          if (typeof savedRestore === 'function') {
            savedRestore().then(function (restored) {
              if (restored && SAVED.current) {
                setTimeout(function () {
                  toast('Opened the data saved on this PC: as of ' + SAVED.current.pullDate + '.');
                }, 600);
              }
            });
          }
        } else {
          var err2 = $('lock-error');
          if (err2) {
            err2.textContent = 'Incorrect PIN. Please try again.';
            err2.style.display = 'block';
          }
          if (inp) { inp.value = ''; inp.focus(); }
        }
      });
    }
    return;
  }
});
$('btn-import-top').addEventListener('click', function () { go('settings'); });
$('btn-export').addEventListener('click', exportExcel);
$('btn-compute').addEventListener('click', function () { computeAndShow('profile'); });
var btnComputeSide = $('btn-compute-side');
if (btnComputeSide) btnComputeSide.addEventListener('click', function () { computeAndShow('profile'); });
$('btn-clear').addEventListener('click', function () {
  delete TABS.Raw_MOVs; MOV_STATE = { referenceVersion: MOV_REFERENCE_VERSION, assignments: {}, applicability: {} }; MOV_CACHE = null; delete TABS.Raw_Activity_Tracker; delete TABS.Raw_Participants; delete TABS.Raw_HH_Participation; delete TABS.Raw_Volunteers;
  LOADED = {}; IMPORT_ERRORS = []; STATE.computed = false; SNAP = null; S.overview = null; S.matrix = null; PEOPLE = null;
  // The saved exports go too; earlier pulls and verification tags stay until "Forget saved data".
  SAVED.current = null;
  if (typeof savedTx === 'function') savedTx('readwrite', function (s) { s.delete('current'); }).then(renderSavedBar).catch(function () {});
  try {
    localStorage.removeItem('pcrp_save_current');
    sessionStorage.removeItem('pcrp_save_current');
  } catch (e) {}
  setTabsEnabled(false); renderStatus(); renderImport(); updateTabBadges();
});
$('file-input').addEventListener('change', function () { handleFiles(this.files); this.value = ''; });
var drop = $('drop');
['dragenter', 'dragover'].forEach(function (e) {
  drop.addEventListener(e, function (ev) {
    ev.preventDefault();
    drop.classList.add('over');
    if (hasGsap()) gsap.to(drop, { scale: 1.012, duration: 0.2, ease: 'power1.out' });
  });
});
['dragleave', 'drop'].forEach(function (e) {
  drop.addEventListener(e, function (ev) {
    ev.preventDefault();
    drop.classList.remove('over');
    if (hasGsap()) gsap.to(drop, { scale: 1, duration: 0.2, ease: 'power1.out', clearProps: 'transform' });
  });
});
drop.addEventListener('drop', function (ev) { handleFiles(ev.dataTransfer && ev.dataTransfer.files); });
// a file dropped anywhere on the window should not open in the browser
['dragover', 'drop'].forEach(function (e) { window.addEventListener(e, function (ev) { ev.preventDefault(); }); });
$('memo-copy').addEventListener('click', function () {
  var ta = $('memo-text'); ta.select();
  (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(function () { toast('Memo copied.'); })
    .catch(function () { document.execCommand('copy'); toast('Memo copied.'); });
});
$('memo-save').addEventListener('click', function () {
  saveBlob(new Blob([$('memo-text').value], { type: 'text/plain;charset=utf-8' }), 'PCRP_data_health_memo_' + stamp() + '.txt');
});

var tabPrev = $('memo-tab-preview'), tabRaw = $('memo-tab-raw'), pnlPrev = $('memo-preview'), taText = $('memo-text');
if (tabPrev && tabRaw && pnlPrev && taText) {
  tabPrev.addEventListener('click', function () {
    tabPrev.classList.add('active');
    tabRaw.classList.remove('active');
    pnlPrev.style.display = 'block';
    taText.style.display = 'none';
  });
  tabRaw.addEventListener('click', function () {
    tabRaw.classList.add('active');
    tabPrev.classList.remove('active');
    pnlPrev.style.display = 'none';
    taText.style.display = 'block';
    taText.select();
  });
}
var btnPrint = $('memo-print');
if (btnPrint) {
  btnPrint.addEventListener('click', function () {
    window.print();
  });
}

var homeChip = $('home-chip');
if (homeChip) {
  homeChip.addEventListener('click', function () { openScopeDialog(); });
}
var footerScopePill = $('footer-scope-pill');
if (footerScopePill) {
  footerScopePill.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-act="open-scope"]')) openScopeDialog();
  });
}

function initSettingsScrollSpy() {
  if (typeof IntersectionObserver === 'undefined') return;
  var sections = document.querySelectorAll('.settings-section');
  if (!sections.length) return;
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var id = entry.target.id;
        Array.prototype.forEach.call(document.querySelectorAll('.settings-nav-item'), function (item) {
          item.classList.toggle('active', item.getAttribute('data-target') === id);
        });
      }
    });
  }, {
    rootMargin: '-15% 0px -60% 0px'
  });
  sections.forEach(function (sec) { observer.observe(sec); });

  window.addEventListener('scroll', function () {
    if (STATE.page !== 'settings') return;
    if ((window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 48)) {
      Array.prototype.forEach.call(document.querySelectorAll('.settings-nav-item'), function (item) {
        item.classList.toggle('active', item.getAttribute('data-target') === 'sec-about');
      });
    }
  }, { passive: true });
}

// ---- start ----------------------------------------------------------------------
refreshIcons(document);
applyTheme();
loadReferenceTables();
applyHomeScope();
renderSettings();
renderStatus();
updateTabBadges();
renderBrandUpdateStatus();
initSettingsScrollSpy();
initTooltipEngine();
var secPrefs = typeof PCRP_CRYPTO !== 'undefined' ? PCRP_CRYPTO.getSecurityPrefs() : null;
if (secPrefs && secPrefs.enabled && secPrefs.pinHash) {
  PCRP_CRYPTO.lockSession('Workstation session protected by PIN.');
}
// after the computation's own 'Findings ready' message, so this one is the one left on screen
savedRestore().then(function (restored) {
  if (restored === true) {
    setTimeout(function () {
      toast('Opened the data saved on this PC: as of ' + (SAVED.current ? SAVED.current.pullDate : '') + '. Drop newer exports to replace it.');
    }, 800);
  }
});

// Auto-flush pending data when navigating away or refreshing
window.addEventListener('beforeunload', function () {
  if (typeof savedSaveCurrent === 'function') savedSaveCurrent();
});
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden' && typeof savedSaveCurrent === 'function') {
    savedSaveCurrent();
  }
});

// Network listeners for offline/online transitions and background update check
window.addEventListener('online', function () {
  toast('Internet connection detected.');
  var badge = $('net-status-badge');
  if (badge) {
    badge.className = 'pill good';
    badge.innerHTML = '<span class="status-dot" style="background:#16a34a"></span> Online';
  }
  renderBrandUpdateStatus();
  checkForUpdates(false);
});

window.addEventListener('offline', function () {
  toast('Offline mode active (field ready).');
  var badge = $('net-status-badge');
  if (badge) {
    badge.className = 'pill idle';
    badge.innerHTML = '<span class="status-dot" style="background:var(--idle-text)"></span> Offline (Field Mode)';
  }
  renderBrandUpdateStatus();
});

// Always check for updates on startup when online
if (typeof navigator !== 'undefined' && navigator.onLine) {
  setTimeout(function () {
    checkForUpdates(false);
  }, 1200);
}

// Background poll: automatically check for new modules/versions every 30 minutes when online
setInterval(function () {
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    checkForUpdates(false);
  }
}, 30 * 60 * 1000);
