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
    title: 'Activity Backlog (Unencoded / Missing Sheets)',
    badge: 'Field Compliance',
    desc: 'Activities conducted in the field more than 3 days ago that are not yet encoded in KCIS, or activities encoded without an attached physical attendance sheet. Requires immediate municipal facilitator encoding.',
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
    title: 'No Sheet Status',
    badge: 'Missing Attendance MOV',
    desc: 'Activity encoded in KCIS with zero registered attendees, indicating that the physical paper attendance sheet has not yet been scanned and encoded.',
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
        '<div class="muted tiny" style="margin-top:4px">All monitored activities have encoded data or attendance sheets.</div>' +
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
    if (isMunicipalUser() && STATE.page === 'munis') STATE.page = 'overview';
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

/** How much of the chosen municipality the participants export covers. */
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
    return '<div class="msg warn">' + icon('alert-triangle') + ' <div>The participants export has <strong>no records for ' + esc(homeLabel()) + '</strong>. Check that it is the right export, or that your municipality is set correctly (<button class="link" data-act="home-edit">Import › Change</button>).</div></div>';
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
  var loadedCount = ['participants', 'households', 'volunteers'].filter(function (k) { return !!LOADED[k]; }).length;
  setBadge('import', loadedCount ? loadedCount + '/3' : '', loadedCount === 3 ? 'good' : '');
  setBadge('sni-badge-import', loadedCount ? loadedCount + '/3' : '', loadedCount === 3 ? 'good' : '');

  var tabMunis = $('tab-munis');
  if (tabMunis) tabMunis.style.display = isMunicipalUser() ? 'none' : '';

  if (!STATE.computed || !S.overview || !SNAP) {
    ['munis', 'brgys', 'attendees', 'households', 'volunteers', 'brest', 'mrest', 'people', 'verify', 'health', 'group-attendance', 'group-volunteers'].forEach(function (id) { setBadge(id, ''); });
    return;
  }
  var key = homeKey();
  if (!isMunicipalUser()) {
    setBadge('munis', n((S.matrix && S.matrix.rows ? S.matrix.rows : []).filter(function (r) { return !STATE.prov || r.province === STATE.prov; }).length));
  }
  var brgysInScope = (SNAP.barangayRows || []).filter(function (b) { return !key || (b.province + '|' + b.municipality === key); });
  var lackingBrgys = brgysInScope.filter(function (b) { return (b.owed || 0) > 0; }).length;
  setBadge('brgys', lackingBrgys ? lackingBrgys + ' lacking' : n(brgysInScope.length), lackingBrgys ? 'bad' : 'good');

  try {
    var P = people(), inScope = pScopeTest();
    var attCount = P.attendees.filter(inScope).length;
    setBadge('attendees', attCount ? n(attCount) : '', 'good');

    var k2 = scopedK2();
    if (k2.rate !== null) {
      setBadge('households', pctText(k2.rate), k2.rate >= 0.7 ? 'good' : 'warn');
      setBadge('group-attendance', pctText(k2.rate), k2.rate >= 0.7 ? 'good' : 'warn');
    } else {
      setBadge('households', '');
      setBadge('group-attendance', attCount ? n(attCount) : '', 'good');
    }

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
    var kpiPipe = scopedPipeline();
    var kpiTot = kpiPipe.reduce(function (acc, p) { acc.c += p.complete || 0; acc.e += p.expected || 0; return acc; }, { c: 0, e: 0 });
    var kpiPct = kpiTot.e > 0 ? Math.round((kpiTot.c / kpiTot.e) * 100) + '%' : '';
    setBadge('kpisummary', kpiPct, kpiTot.e > 0 && (kpiTot.c / kpiTot.e) >= 0.8 ? 'good' : (kpiTot.c > 0 ? 'warn' : ''));
  } catch (e) {}
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
  if (isMunicipalUser() && page === 'munis') page = 'overview';
  if (page === 'people') page = 'attendees';
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
  var isAttendanceGroup = (page === 'attendees' || page === 'households');
  var isVolunteersGroup = (page === 'volunteers' || page === 'brest' || page === 'cspmc');
  var isDqaGroup = (page === 'health' || page === 'verify');
  var grpAtt = $('tab-group-attendance');
  if (grpAtt) grpAtt.classList.toggle('on', isAttendanceGroup);
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
  if (STATE.page === 'overview') renderOverview();
  else if (STATE.page === 'munis') { if (isMunicipalUser()) go('overview'); else renderMunis(); }
  else if (STATE.page === 'brgys') renderBrgys();
  else if (STATE.page === 'attendees') renderAttendees();
  else if (STATE.page === 'households') renderHouseholds();
  else if (STATE.page === 'volunteers') renderVolunteers();
  else if (STATE.page === 'brest') renderBrest();
  else if (STATE.page === 'cspmc') renderCspmc();
  else if (STATE.page === 'mrest') renderMrest();
  else if (STATE.page === 'kpisummary') renderKpiSummary();
  else if (STATE.page === 'people') renderPeople();
  else if (STATE.page === 'verify') renderVerify();
  else if (STATE.page === 'health') renderHealth();
  else if (STATE.page === 'settings' || STATE.page === 'import') renderSettings();
  else renderSettings();
}

function setTabsEnabled(on) {
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
    var p = b.getAttribute('data-page');
    if (p !== 'import' && p !== 'settings') b.disabled = !on;
  });
  var grpAtt = $('tab-group-attendance');
  if (grpAtt) grpAtt.disabled = !on;
  var grpVol = $('tab-group-volunteers');
  if (grpVol) grpVol.disabled = !on;
  var grpDqa = $('tab-group-dqa');
  if (grpDqa) grpDqa.disabled = !on;
  $('btn-export').disabled = !on;
}

// Hooks the Data Health page calls.
function openMuni(mKey) { STATE.muni = mKey; STATE.brgyFilter = 'all'; STATE.brgySearch = ''; go('brgys'); }
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
    TABS[info.sheet] = item.table;
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
    if (LOADED.participants) {
      computeAndShow(STATE.computed ? null : 'overview');
    } else {
      setTabsEnabled(true);
    }
  });
}

function computeAndShow(thenPage) {
  if (!LOADED.participants) { toast('Load the participants export first.'); return; }
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
    { k: 'participants', ico: 'users', desc: 'Needed for every activity & attendance finding.' },
    { k: 'households', ico: 'building-2', desc: 'Needed for K2 quorum: households in barangay and households represented, counted per assembly.' },
    { k: 'volunteers', ico: 'list-checks', desc: 'Needed for 1st BA BResT / SFMSC & MResT tracking.' }
  ];
  var p = prefs();
  var cards = kinds.map(function (item) {
    var k = item.k, l = LOADED[k], info = KIND_INFO[k];
    return '<div class="slot-card' + (l ? ' loaded' : '') + '">' +
      '<div class="slot-head">' +
        '<div class="slot-title">' + icon(item.ico) + ' <span>' + esc(info.label) + '</span></div>' +
        '<span class="status-chip ' + (l ? 'ok' : (k === 'participants' ? 'off' : '')) + '">' + (l ? '✓ Loaded' : (k === 'participants' ? 'Required' : 'Optional')) + '</span>' +
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
  var pullLine = LOADED.participants ? '<div class="toolbar-row" style="margin-top:12px;margin-bottom:0">' +
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
    btnCompute.disabled = !LOADED.participants;
    btnCompute.innerHTML = icon('layout-dashboard') + ' <span>' + (STATE.computed ? 'Recompute findings' : 'Show findings') + '</span>';
  }
  var btnComputeSide = $('btn-compute-side');
  if (btnComputeSide) {
    btnComputeSide.disabled = !LOADED.participants;
    btnComputeSide.innerHTML = icon('layout-dashboard') + ' <span>' + (STATE.computed ? 'Recompute findings' : 'Show findings') + '</span>';
  }
}

function renderStatus() {}

// ---- scope helpers ---------------------------------------------------------

function provinces() {
  var p = {};
  (S.overview.municipalities || []).forEach(function (m) { p[m.province] = true; });
  return Object.keys(p).sort();
}
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
    var t = { expected: 0, complete: 0, noAttendees: 0, notEncoded: 0, backlog: 0, attendees: 0 };
    rows.forEach(function (r) {
      var c = r.cells[a.code];
      if (!c) return;
      t.expected += c.expected || 0; t.complete += c.complete || 0; t.noAttendees += c.noAttendees || 0;
      t.notEncoded += c.notEncoded || 0; t.backlog += c.backlog || 0; t.attendees += c.attendees || 0;
    });
    return Object.assign({ a: a }, t);
  });
}
function scopedK2(asm) {
  var code = asm || (STATE.stage === 2 ? 'BA2' : 'BA1');
  var prop = code === 'BA2' ? 'households_ba2' : (code === 'BA3' ? 'households_ba3' : 'households');
  var t = { listed: 0, present: 0, reporting: 0, met: 0, asm: code };
  var rows = overviewRows();
  if (rows && rows.length) {
    rows.forEach(function (r) {
      var h = (r && r[prop]) || {};
      t.listed += h.listed || 0; t.present += h.present || 0; t.reporting += h.reporting || 0; t.met += h.quorumMet || 0;
    });
  } else if (typeof SNAP !== 'undefined' && SNAP && SNAP.barangayRows) {
    var brgys = SNAP.barangayRows.filter(inOverviewScope);
    brgys.forEach(function (b) {
      var h = (typeof hhOf === 'function') ? hhOf(b, code) : ((b.activities && b.activities[code]) || {});
      var listed = h.hhListed || 0;
      if (listed > 0) {
        t.reporting++;
        t.listed += listed;
        t.present += (h.hhPresent || 0);
        if ((h.hhRate || 0) >= 0.7) t.met++;
      }
    });
  }
  t.rate = t.listed ? t.present / t.listed : null;
  return t;
}
function scopedVolunteers() {
  var v = S.overview.volunteers;
  if (!v || !v.imported) return null;
  var out = {};
  (v.bodies || []).forEach(function (b) { out[b.code] = { expected: 0, encoded: 0, needsFix: 0, notEncoded: 0, pending: 0 }; });
  overviewRows().forEach(function (r) {
    if (!r.volunteers) return;
    Object.keys(out).forEach(function (k) {
      var x = r.volunteers[k] || {}, t = out[k];
      t.expected += x.expected || 0; t.encoded += x.encoded || 0; t.needsFix += x.needsFix || 0; t.notEncoded += x.notEncoded || 0; t.pending += x.pending || 0;
    });
  });
  var iss = S.overview.health.volunteerIssues;
  out.missing = iss ? iss.missing.filter(inOverviewScope).length : 0;
  return out;
}

function stageSwitch() {
  var allActs = (S.overview && S.overview.activities) || [];
  return '<div class="filters" style="margin-bottom:12px"><div class="seg-control" role="group" aria-label="Stage">' +
    [1, 2].map(function (s) {
      var cnt = allActs.filter(function (a) { return (a.stage || 1) === s; }).length;
      return '<button type="button" class="seg-btn' + (STATE.stage === s ? ' active' : '') + '" data-act="stage" data-v="' + s + '">' +
        '<span>Stage ' + s + (s === 1 ? ' · Assessment & Planning' : ' · Sub-Project Development') + '</span>' +
        '<span class="chip-count">' + cnt + '</span></button>';
    }).join('') + '</div></div>';
}
function provChips() {
  return '<div class="filters" role="group" aria-label="Province">' +
    [''].concat(provinces()).map(function (p) {
      return '<button type="button" class="filter-chip' + (STATE.prov === p ? ' active' : '') + '" data-act="prov" data-v="' + attr(p) + '">' + (p ? esc(p) : 'Whole region') + '</button>';
    }).join('') + '</div>';
}
function progressBar(ok, warn, total) {
  var w = function (v) { return total ? Math.max(0, Math.min(100, v / total * 100)).toFixed(1) : 0; };
  return '<span class="bar" role="img" aria-label="' + attr(ok + ' with attendance sheet, ' + warn + ' without, of ' + total) + '">' +
    (ok ? '<i class="ok" style="width:' + w(ok) + '%"></i>' : '') + (warn ? '<i class="warn" style="width:' + w(warn) + '%"></i>' : '') + '</span>';
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

// ---- Executive & Operational Overview Helpers ---------------------------------

function getScopedCompositeMetrics() {
  var isMuni = isMunicipalUser(), key = homeKey();
  var h = (typeof home === 'function' ? home() : {}) || {};
  var pipe = scopedPipeline();
  var pipeTot = pipe.reduce(function (acc, p) {
    acc.e += p.expected || 0;
    acc.c += p.complete || 0;
    acc.na += p.noAttendees || 0;
    acc.ne += p.notEncoded || 0;
    acc.b += p.backlog || 0;
    return acc;
  }, { e: 0, c: 0, na: 0, ne: 0, b: 0 });
  var pipeRate = pipeTot.e > 0 ? (pipeTot.c / pipeTot.e) : 0;

  var k2 = scopedK2();
  var k2_ba2 = scopedK2('BA2');
  var k2_ba3 = scopedK2('BA3');

  var k2RateForIndex = k2.rate;
  if (STATE.stage === 2) {
    var reportedRates = [];
    if (k2_ba2.rate !== null) reportedRates.push(k2_ba2.rate);
    if (k2_ba3.rate !== null) reportedRates.push(k2_ba3.rate);
    k2RateForIndex = reportedRates.length > 0 ? (reportedRates.reduce(function (a, b) { return a + b; }, 0) / reportedRates.length) : null;
  }

  var P = (typeof people === 'function') ? people() : { volunteers: [], mrest: [] };
  var inScope = (typeof pScopeTest === 'function') ? pScopeTest() : function () { return true; };
  var brgysInScope = (SNAP.barangayRows || []).filter(function (b) {
    return isMuni ? (b.province + '|' + b.municipality === key) : (!STATE.prov || b.province === STATE.prov);
  });
  var totalBrgys = brgysInScope.length;
  var brestCompliant = brgysInScope.filter(function (b) { return b.volunteers && b.volunteers.BREST && b.volunteers.BREST.status === 'Encoded'; }).length;
  var brestRate = totalBrgys > 0 ? (brestCompliant / totalBrgys) : 0;

  var munisList = (typeof baselineMunis === 'function') ? baselineMunis().filter(function (m) { return !STATE.prov || m.province === STATE.prov; }) : [];
  // MResT formed per its composition (mrestComposition), not merely encoded in KCIS
  var regionalMrestFormed = munisList.filter(function (m) { return mrestStatusOf(m.province, m.municipality).status === 'complete'; }).length;

  var compositeIndex = isMuni
    ? Math.round(0.4 * (pipeRate * 100) + 0.3 * ((k2RateForIndex ? Math.min(1, k2RateForIndex / 0.7) : 0) * 100) + 0.3 * (brestRate * 100))
    : Math.round(0.35 * (pipeRate * 100) + 0.25 * ((k2RateForIndex ? Math.min(1, k2RateForIndex / 0.7) : 0) * 100) + 0.25 * (brestRate * 100) + 0.15 * ((regionalMrestFormed / (munisList.length || 1)) * 100));

  return {
    isMuni: isMuni,
    key: key,
    h: h,
    pipe: pipe,
    pipeTot: pipeTot,
    pipeRate: pipeRate,
    k2: k2,
    k2_ba2: k2_ba2,
    k2_ba3: k2_ba3,
    totalBrgys: totalBrgys,
    brgysInScope: brgysInScope,
    brestCompliant: brestCompliant,
    brestRate: brestRate,
    munisList: munisList,
    regionalMrestFormed: regionalMrestFormed,
    compositeIndex: isNaN(compositeIndex) ? 0 : compositeIndex
  };
}

function getScopedTriageSummary(metrics) {
  var brgys = metrics.brgysInScope || [];
  var lackingBrgys = brgys.filter(function (b) { return (b.todo && b.todo.length > 0); });
  var k2Ba1RiskBrgys = brgys.filter(function (b) {
    var h = (typeof hhOf === 'function') ? hhOf(b, 'BA1') : ((b.activities && b.activities['BA1']) || b || {});
    return h.hhListed > 0 && h.hhRate < 0.7;
  });
  var k2Ba2RiskBrgys = brgys.filter(function (b) {
    var h = (typeof hhOf === 'function') ? hhOf(b, 'BA2') : ((b.activities && b.activities['BA2']) || {});
    return h.hhListed > 0 && h.hhRate < 0.7;
  });
  var k2Ba3RiskBrgys = brgys.filter(function (b) {
    var h = (typeof hhOf === 'function') ? hhOf(b, 'BA3') : ((b.activities && b.activities['BA3']) || {});
    return h.hhListed > 0 && h.hhRate < 0.7;
  });

  // Data health critical/verify in scope
  var o = S.overview;
  var keepScope = S.healthScope;
  S.healthScope = metrics.key ? 'm:' + metrics.key : (STATE.prov ? 'p:' + STATE.prov : '');
  var evs = (typeof dhEvaluateAll === 'function' && o) ? dhEvaluateAll(o, '').filter(function (e) { return !e.outOfScope; }) : [];
  S.healthScope = keepScope;
  var criticalEvs = evs.filter(function (e) { return e.status === 'critical'; });
  var verifyEvs = evs.filter(function (e) { return e.status === 'verify'; });

  return {
    lackingCount: lackingBrgys.length,
    k2RiskCount: STATE.stage === 2 ? (k2Ba2RiskBrgys.length + k2Ba3RiskBrgys.length) : k2Ba1RiskBrgys.length,
    k2Ba1RiskCount: k2Ba1RiskBrgys.length,
    k2Ba2RiskCount: k2Ba2RiskBrgys.length,
    k2Ba3RiskCount: k2Ba3RiskBrgys.length,
    pendingSheetsTot: metrics.pipeTot.na,
    lackingTot: metrics.pipeTot.b,
    dqaCriticalCount: criticalEvs.reduce(function (s, e) { return s + (e.count || 0); }, 0),
    dqaVerifyCount: verifyEvs.reduce(function (s, e) { return s + (e.count || 0); }, 0)
  };
}

function renderOverviewTriageTray(triage) {
  var items = [];
  if (triage.lackingCount > 0) {
    items.push(
      '<button type="button" class="triage-item triage-bad" data-act="kpi-brgy" data-v="lacking" title="Filter barangays with lacking records">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(triage.lackingCount) + '</span>' +
          '<span class="triage-item-label">Barangays with Backlog (&gt;3d)</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }
  if (STATE.stage === 2) {
    if (triage.k2Ba2RiskCount > 0) {
      items.push(
        '<button type="button" class="triage-item triage-warn" data-act="kpi-brgy" data-v="k2_ba2" title="Filter barangays failing 2nd BA quorum">' +
          '<div class="triage-item-info">' +
            '<span class="triage-item-count">' + n(triage.k2Ba2RiskCount) + '</span>' +
            '<span class="triage-item-label">Barangays Below 2nd BA Quorum (&lt;70%)</span>' +
          '</div>' +
          '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
        '</button>'
      );
    }
    if (triage.k2Ba3RiskCount > 0) {
      items.push(
        '<button type="button" class="triage-item triage-warn" data-act="kpi-brgy" data-v="k2_ba3" title="Filter barangays failing 3rd BA quorum">' +
          '<div class="triage-item-info">' +
            '<span class="triage-item-count">' + n(triage.k2Ba3RiskCount) + '</span>' +
            '<span class="triage-item-label">Barangays Below 3rd BA Quorum (&lt;70%)</span>' +
          '</div>' +
          '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
        '</button>'
      );
    }
  } else if (triage.k2Ba1RiskCount > 0) {
    items.push(
      '<button type="button" class="triage-item triage-warn" data-act="kpi-brgy" data-v="k2" title="Filter barangays failing 1st BA quorum">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(triage.k2Ba1RiskCount) + '</span>' +
          '<span class="triage-item-label">Barangays Below 1st BA Quorum (&lt;70%)</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }
  if (triage.pendingSheetsTot > 0) {
    items.push(
      '<button type="button" class="triage-item triage-warn" data-act="kpi-brgy" data-v="nosheet" title="Filter barangays missing signed attendance sheet">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(triage.pendingSheetsTot) + '</span>' +
          '<span class="triage-item-label">Activities Pending Signed Sheet</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }
  if (triage.dqaCriticalCount > 0) {
    items.push(
      '<button type="button" class="triage-item triage-bad" data-act="go" data-v="health" title="Open DQA Audit Scorecard to inspect critical errors">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(triage.dqaCriticalCount) + '</span>' +
          '<span class="triage-item-label">Critical DQA Errors to Fix</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  var isAllGood = items.length === 0;
  var trayCls = isAllGood ? 'triage-tray all-good' : (triage.lackingCount > 0 || triage.dqaCriticalCount > 0 ? 'triage-tray has-critical' : 'triage-tray');
  var badgeHtml = isAllGood
    ? '<span class="triage-badge">All Optimal</span>'
    : '<span class="triage-badge">' + items.length + ' Focus ' + (items.length === 1 ? 'Area' : 'Areas') + '</span>';

  return (
    '<div class="' + trayCls + '">' +
      '<div class="triage-head">' +
        '<div class="triage-title">' +
          icon(isAllGood ? 'check-circle-2' : 'alert-circle') +
          '<span>Operational Action Center (Immediate Priorities)</span> ' +
          badgeHtml +
        '</div>' +
        (!isAllGood ? '<span class="tiny muted">Click any triage card to drill down directly into the affected records</span>' : '') +
      '</div>' +
      (isAllGood
        ? '<div class="msg ok" style="margin:0">' + icon('check-circle-2') + ' <span><strong>Optimal Field State:</strong> Zero activity backlog, all physical attendance sheets attached, and K2 household quorum thresholds met.</span></div>'
        : '<div class="triage-grid">' + items.join('') + '</div>'
      ) +
    '</div>'
  );
}

function renderMilestoneStepper(pipe) {
  if (!pipe || !pipe.length) return '';

  var minRate = 1.0;
  var bottleneckCode = '';
  pipe.forEach(function (p) {
    if (p.expected > 0) {
      var r = p.complete / p.expected;
      if (r < minRate || (r === minRate && p.backlog > 0)) {
        minRate = r;
        bottleneckCode = p.a.code;
      }
    }
  });

  var stepsHtml = pipe.map(function (p) {
    var rate = p.expected > 0 ? (p.complete / p.expected) : 1;
    var pct = Math.round(rate * 100);
    var isComplete = rate >= 1 && p.expected > 0;
    var isBottleneck = !isComplete && p.a.code === bottleneckCode && p.expected > 0;
    var isFiltered = STATE.ovSeqFilter === p.a.code;
    var stepCls = 'milestone-step' + (isComplete ? ' is-complete' : (isBottleneck ? ' is-bottleneck' : '')) + (isFiltered ? ' active' : '');

    return (
      '<button type="button" class="' + stepCls + '" data-act="ov-filter-seq" data-v="' + attr(p.a.code) + '" title="' + attr(p.a.label + ': ' + pctText(rate) + ' with signed sheet (' + n(p.complete) + ' of ' + n(p.expected) + ')') + '">' +
        '<div class="step-top">' +
          '<span class="step-seq-pill">Seq ' + esc(p.a.seq) + '</span>' +
          '<span class="step-rate">' + pct + '%</span>' +
        '</div>' +
        '<div class="step-name">' + esc(p.a.label) + '</div>' +
        '<div class="step-progress-mini"><div class="step-progress-mini-bar" style="width:' + pct + '%"></div></div>' +
      '</button>'
    );
  }).join('');

  return (
    '<div class="milestone-stepper-card">' +
      '<div class="milestone-stepper-head">' +
        '<div class="milestone-stepper-title">' +
          icon('git-commit') + ' <span>Stage ' + STATE.stage + ' Milestone Sequence Flow &amp; Bottlenecks</span>' +
        '</div>' +
        '<div class="tiny muted">' + (STATE.ovSeqFilter ? 'Filtering to Seq ' + esc(STATE.ovSeqFilter) + ' · Click again to show all milestones' : 'Click any milestone to filter the activities table below') + '</div>' +
      '</div>' +
      '<div class="milestone-stepper-track">' + stepsHtml + '</div>' +
    '</div>'
  );
}

// ---- overview -----------------------------------------------------------------

function renderOverview() {
  var o = S.overview, pipe = scopedPipeline(), k2 = scopedK2(), cv = scopedVolunteers();
  var metrics = getScopedCompositeMetrics();
  var triage = getScopedTriageSummary(metrics);
  var tot = pipe.reduce(function (s, p) {
    s.e += p.expected; s.c += p.complete; s.na += p.noAttendees; s.ne += p.notEncoded; s.b += p.backlog; return s;
  }, { e: 0, c: 0, na: 0, ne: 0, b: 0 });
  var munis = overviewRows().length;
  var brgys = (SNAP.barangayRows || []).filter(inOverviewScope).length;
  var key = homeKey();
  var isMuni = isMunicipalUser();
  var scopeName = isMuni
    ? (home().municipality + ' (' + home().province + ')')
    : (key ? homeLabel() : (STATE.prov || 'Caraga Region'));

  var kpiCard = function (opts) {
    var tag = opts.act ? 'button type="button"' : 'div';
    var closeTag = opts.act ? 'button' : 'div';
    return '<' + tag + ' class="kpi ' + (opts.accent || '') + (opts.act ? ' clickable' : '') + '"' +
      (opts.act ? ' data-act="' + opts.act + '" data-v="' + attr(opts.v || '') + '"' : '') +
      (opts.title ? ' title="' + attr(opts.title) + '"' : '') +
      (opts.tooltip ? ' data-tooltip="' + attr(opts.tooltip) + '"' : '') +
      (opts.term ? ' data-term="' + attr(opts.term) + '"' : '') +
      (opts.tooltipTitle ? ' data-tooltip-title="' + attr(opts.tooltipTitle) + '"' : '') +
      (opts.tooltipBadge ? ' data-tooltip-badge="' + attr(opts.tooltipBadge) + '"' : '') +
      (opts.tooltipRef ? ' data-tooltip-ref="' + attr(opts.tooltipRef) + '"' : '') + '>' +
      '<div><div class="kpi-top"><div class="kpi-label">' + opts.label + '</div>' +
      (opts.ico ? '<span class="kpi-icon">' + icon(opts.ico) + '</span>' : '') + '</div>' +
      '<div class="kpi-value">' + opts.value + '</div>' +
      '<div class="kpi-sub">' + opts.sub + '</div></div>' +
      (opts.bar ? '<div class="kpi-bar">' + opts.bar + '</div>' : '') +
    '</' + closeTag + '>';
  };

  // Data Health in the same scope as the page
  var keepScope = S.healthScope;
  S.healthScope = key ? 'm:' + key : (STATE.prov ? 'p:' + STATE.prov : '');
  var evs = dhEvaluateAll(o, '').filter(function (e) { return !e.outOfScope; });
  S.healthScope = keepScope;
  var open = evs.filter(function (e) { return e.status === 'critical' || e.status === 'verify'; });
  var sevCount = { critical: 0, verify: 0, passed: 0 };
  evs.forEach(function (e) { if (sevCount[e.status] !== undefined) sevCount[e.status]++; });

  var q = normSearch(STATE.ovSearch || '');
  var currentOvFilter = STATE.ovFilter || 'all';
  var filteredPipe = pipe.filter(function (p) {
    if (currentOvFilter === 'lacking' && p.backlog <= 0) return false;
    if (currentOvFilter === 'nosheet' && p.noAttendees <= 0) return false;
    if (currentOvFilter === 'complete' && (p.expected <= 0 || p.complete < p.expected)) return false;
    if (STATE.ovSeqFilter && p.a.code !== STATE.ovSeqFilter) return false;
    if (!q) return true;
    var hay = normSearch(p.a.seq + ' ' + p.a.code + ' ' + p.a.label + ' ' + p.a.level + ' ' + p.a.field);
    return hay.indexOf(q) !== -1;
  });

  var curCol = (STATE.ovSort && STATE.ovSort.col) || 'seq';
  var curDir = (STATE.ovSort && STATE.ovSort.dir) || 'asc';
  var ovExtractors = {
    seq: function (p) { return actSeqNum(p.a.seq); },
    activity: function (p) { return p.a.label; },
    expected: function (p) { return p.expected; },
    complete: function (p) { return p.complete; },
    noAttendees: function (p) { return p.noAttendees; },
    notEncoded: function (p) { return p.notEncoded; },
    backlog: function (p) { return p.backlog; },
    progress: function (p) { return p.expected ? p.complete / p.expected : -1; }
  };
  var sortedPipe = tblSort(filteredPipe, curCol, curDir, ovExtractors);

  var rows = sortedPipe.map(function (p) {
    var cond = p.complete + p.noAttendees;
    return '<tr><td class="num">' + esc(p.a.seq) + '</td><td><strong>' + esc(p.a.label) + '</strong>' + (p.a.prioOnly ? ' <span class="pill idle">Prioritized only</span>' : '') +
      '<div class="tiny">' + esc(p.a.level) + ' level · field: ' + esc(p.a.field) + '</div></td>' +
      '<td class="num">' + n(p.expected) + '</td><td class="num">' + n(p.complete) + '</td><td class="num">' + n(p.noAttendees) + '</td>' +
      '<td class="num">' + n(p.notEncoded) + '</td><td class="num">' + (p.backlog ? '<strong style="color:var(--bad-text)">' + n(p.backlog) + '</strong>' : '0') + '</td>' +
      '<td><div class="cell-pct"><span>' + pctText(pctOf(p.complete, p.expected)) + ' <span class="tiny">(' + pctText(pctOf(cond, p.expected)) + ' recorded)</span></span>' + progressBar(p.complete, p.noAttendees, p.expected) + '</div></td></tr>';
  }).join('');

  var totalCond = tot.c + tot.na;
  var totalRow = '<tr class="total"><td class="num"></td><td>Total · Stage ' + STATE.stage + '</td>' +
    '<td class="num">' + n(tot.e) + '</td><td class="num">' + n(tot.c) + '</td><td class="num">' + n(tot.na) + '</td>' +
    '<td class="num">' + n(tot.ne) + '</td><td class="num">' + (tot.b ? '<span style="color:var(--bad-text)">' + n(tot.b) + '</span>' : '0') + '</td>' +
    '<td><div class="cell-pct"><span>' + pctText(pctOf(tot.c, tot.e)) + ' <span class="tiny">(' + pctText(pctOf(totalCond, tot.e)) + ' recorded)</span></span>' + progressBar(tot.c, tot.na, tot.e) + '</div></td></tr>';

  var th = function (col, label, num, extra) {
    var opts = { col: col, curCol: curCol, dir: curDir, label: label, num: num, act: 'ov-sort' };
    if (extra) {
      if (extra.tooltip) opts.tooltip = extra.tooltip;
      if (extra.term) opts.term = extra.term;
    }
    return sortTh(opts);
  };

  var isStage2 = STATE.stage === 2;
  var baLabel = isStage2 ? '2nd BA' : '1st BA';
  var baFullTitle = isStage2 ? '2nd Barangay Assembly (BA2)' : '1st Barangay Assembly (BA1)';

  var cvHtml = cv ? (S.overview.volunteers.bodies || []).map(function (b) {
    var t = cv[b.code];
    return '<div class="cv-row"><strong>' + esc(b.short) + '</strong>' + progressBar(t.encoded, t.needsFix, t.expected) +
      '<span class="num">' + n(t.encoded) + '/' + n(t.expected) + (t.needsFix ? ' <span class="tiny" style="color:var(--warn-text)">+' + n(t.needsFix) + ' to fix</span>' : '') + '</span></div>';
  }).join('') + (cv.missing ? '<p class="tiny" style="color:var(--warn-text);font-weight:700;margin-top:8px">⚠ ' + n(cv.missing) + ' barangays: 1st BA encoded, volunteers not encoded. <button class="link" data-act="health-open" data-v="cv_missing">See the list</button></p>' : '')
    : '<p class="muted">Load the Community Volunteer List to track the BResT and SFMSC.</p>';

  var cvStage2Html = '';
  if (isStage2) {
    if (LOADED.volunteers) {
      try {
        var P_s2 = (typeof people === 'function') ? people() : { volunteers: [] };
        var brgys_s2 = (SNAP.barangayRows || []).filter(inOverviewScope);
        var s2Vols_s2 = (P_s2.volunteers || []).filter(function (v) { return v.isStage2 && inOverviewScope(v); });
        var evalMap_s2 = {};
        brgys_s2.forEach(function (b) {
          var bkey = b.province + '|' + b.municipality + '|' + b.barangay;
          var bv = s2Vols_s2.filter(function (v) { return v.barangay === b.barangay && v.municipality === b.municipality; });
          evalMap_s2[bkey] = (typeof evaluateCspmcBarangay === 'function') ? evaluateCspmcBarangay(b, bv) : null;
        });
        var s2Summary = (typeof getCspmcTriageSummary === 'function') ? getCspmcTriageSummary(brgys_s2, evalMap_s2, s2Vols_s2) : null;
        if (s2Summary) {
          cvStage2Html =
            '<div class="cv-row"><strong>CSPMC Formed</strong>' + progressBar(s2Summary.compliantBrgys, s2Summary.needsFixBrgys, s2Summary.totalBrgys) +
              '<span class="num">' + n(s2Summary.compliantBrgys) + '/' + n(s2Summary.totalBrgys) + (s2Summary.needsFixBrgys ? ' <span class="tiny" style="color:var(--warn-text)">+' + n(s2Summary.needsFixBrgys) + ' to fix</span>' : '') + '</span></div>' +
            '<div class="cv-row"><strong>CMSC Quorum</strong>' + progressBar(s2Summary.cmscQuorumBrgys, 0, s2Summary.totalBrgys) +
              '<span class="num">' + n(s2Summary.cmscQuorumBrgys) + '/' + n(s2Summary.totalBrgys) + '</span></div>' +
            '<div class="cv-row"><strong>2nd BA Volunteers</strong><span style="flex:1"></span><span class="num"><strong>' + n(s2Vols_s2.length) + '</strong> encoded</span></div>' +
            (s2Summary.notEncodedBrgys ? '<p class="tiny" style="color:var(--warn-text);font-weight:700;margin-top:8px">⚠ ' + n(s2Summary.notEncodedBrgys) + ' barangays: 2nd BA committees pending in KCIS. <button class="link" data-act="go" data-v="cspmc">Open CSPMC</button></p>' : '');
        }
      } catch (err) {
        console.error('Error rendering Stage 2 volunteer overview:', err);
      }
    }
    if (!cvStage2Html) {
      cvStage2Html = '<p class="muted">Load the Community Volunteer List to track 2nd BA CSPMC &amp; 8 Sub-Committees.</p>';
    }
  }

  var ovFilters = [
    { id: 'all', label: 'All Activities', count: pipe.length, cls: '' },
    { id: 'lacking', label: 'Lacking / Backlog', count: pipe.filter(function (p) { return p.backlog > 0; }).length, cls: 'chip-bad' },
    { id: 'nosheet', label: 'Pending Signed Sheet', count: pipe.filter(function (p) { return p.noAttendees > 0; }).length, cls: 'chip-warn' },
    { id: 'complete', label: 'Complete (100%)', count: pipe.filter(function (p) { return p.expected > 0 && p.complete >= p.expected; }).length, cls: '' }
  ];

  var quickChipsHtml =
    '<div class="quick-filter-bar">' +
      ovFilters.map(function (f) {
        var isAct = currentOvFilter === f.id && !STATE.ovSeqFilter;
        return '<button type="button" class="quick-filter-chip' + (f.cls ? ' ' + f.cls : '') + (isAct ? ' active' : '') + '" data-act="ov-filter" data-v="' + f.id + '">' +
          '<span>' + esc(f.label) + '</span>' +
          '<span class="quick-filter-count">' + n(f.count) + '</span>' +
        '</button>';
      }).join('') +
      (STATE.ovSeqFilter ? '<button type="button" class="quick-filter-chip active" data-act="ov-filter-seq" data-v="' + attr(STATE.ovSeqFilter) + '"><span>Filtered: Seq ' + esc(STATE.ovSeqFilter) + '</span> ✕</button>' : '') +
    '</div>';

  $('ov-body').innerHTML =
    coverageBanner() +
    '<div class="page-banner"><div><h2>Overview · ' + esc(scopeName) + '</h2>' +
      '<div class="muted">' + (isMuni ? '' : (key ? '' : n(munis) + ' municipalities · ')) + n(brgys) + ' barangays monitored · KCIS pull date: <strong>' + esc(prefs().evalDate || today() + ' (today)') + '</strong></div></div>' +
      '<div class="row-actions" style="margin:0">' +
        '<button class="btn ghost" data-act="go-brgys">' + icon('map-pin') + ' <span>See the barangays</span></button>' +
        (!isMuni ? '<button class="btn ghost" data-act="go" data-v="munis">' + icon('building-2') + ' <span>See municipalities</span></button>' : '') +
        '<button class="btn ghost" data-act="go" data-v="health">' + icon('shield-check') + ' <span>Data Quality Assessment (DQA)</span></button>' +
      '</div></div>' +
    stageSwitch() + (isMuni ? '' : provChips()) +
    '<div class="grid-kpi">' +
      kpiCard({
        label: 'Overall Readiness Index',
        value: metrics.compositeIndex + '%',
        sub: metrics.compositeIndex >= 80 ? 'Optimal implementation readiness' : (metrics.compositeIndex >= 60 ? 'Moderate compliance; address gaps' : 'High priority risk; immediate support'),
        ico: 'gauge',
        accent: metrics.compositeIndex >= 80 ? 'accent-good' : (metrics.compositeIndex >= 60 ? 'accent-warn' : 'accent-bad'),
        tooltip: 'Weighted strategic readiness index across Pipeline completion, K2 quorum, and volunteer teams',
        act: 'go', v: 'kpisummary', title: 'Open Executive KPI Scorecard'
      }) +
      kpiCard({
        label: 'With attendance sheet',
        value: pctText(pctOf(tot.c, tot.e)),
        sub: n(tot.c) + ' of ' + n(tot.e) + ' Stage ' + STATE.stage + ' records complete',
        ico: 'check-circle-2',
        accent: tot.c === tot.e && tot.e > 0 ? 'accent-good' : '',
        bar: progressBar(tot.c, tot.na, tot.e),
        tooltip: 'Total activities encoded with verified physical attendance sheet attached',
        act: 'kpi-brgy', v: 'all', title: 'Open Barangays view'
      }) +
      kpiCard({
        label: 'Pending signed sheet',
        value: n(tot.na),
        sub: 'Encoded in KCIS, attendance sheet still missing',
        ico: 'clock-alert',
        accent: tot.na > 0 ? 'accent-warn' : 'accent-good',
        term: 'nosheet',
        act: 'kpi-brgy', v: 'nosheet', title: 'Filter barangays recorded without a sheet'
      }) +
      kpiCard({
        label: 'Critical backlog (lacking)',
        value: n(tot.b),
        sub: 'Past the 3-day window, or not encoded where field conduct is Completed',
        ico: 'alert-triangle',
        accent: tot.b > 0 ? 'accent-bad' : 'accent-good',
        term: 'lacking',
        act: 'kpi-brgy', v: 'lacking', title: 'Filter barangays with activity backlog'
      }) +
      (isStage2 ? (
        kpiCard({
          label: 'BA HH Rate · 2nd BA Quorum',
          value: pctText(metrics.k2_ba2.rate),
          sub: metrics.k2_ba2.listed ? n(metrics.k2_ba2.present) + ' of ' + n(metrics.k2_ba2.listed) + ' households present (≥70% target)' : 'Not reported: load 2nd BA Household Participation export',
          ico: 'users',
          accent: metrics.k2_ba2.rate === null ? 'accent-idle' : (metrics.k2_ba2.rate >= 0.7 ? 'accent-good' : 'accent-warn'),
          bar: metrics.k2_ba2.listed ? progressBar(metrics.k2_ba2.present, 0, metrics.k2_ba2.listed) : '',
          tooltip: 'Barangay Assembly Household Participation Rate for 2nd Barangay Assembly (BA2) · Quorum Target: ≥70%',
          term: 'k2_ba2',
          act: metrics.k2_ba2.listed ? 'kpi-brgy' : '', v: 'k2_ba2', title: 'Filter barangays with 2nd BA HH Rate below 70%'
        }) +
        kpiCard({
          label: 'BA HH Rate · 3rd BA Quorum',
          value: pctText(metrics.k2_ba3.rate),
          sub: metrics.k2_ba3.listed ? n(metrics.k2_ba3.present) + ' of ' + n(metrics.k2_ba3.listed) + ' households present (≥70% target)' : 'Not reported: load 3rd BA Household Participation export',
          ico: 'users',
          accent: metrics.k2_ba3.rate === null ? 'accent-idle' : (metrics.k2_ba3.rate >= 0.7 ? 'accent-good' : 'accent-warn'),
          bar: metrics.k2_ba3.listed ? progressBar(metrics.k2_ba3.present, 0, metrics.k2_ba3.listed) : '',
          tooltip: 'Barangay Assembly Household Participation Rate for 3rd Barangay Assembly (BA3) · Quorum Target: ≥70%',
          term: 'k2_ba3',
          act: metrics.k2_ba3.listed ? 'kpi-brgy' : '', v: 'k2_ba3', title: 'Filter barangays with 3rd BA HH Rate below 70%'
        })
      ) : (
        kpiCard({
          label: 'BA HH Rate · 1st BA Quorum',
          value: pctText(k2.rate),
          sub: k2.listed ? n(k2.present) + ' of ' + n(k2.listed) + ' households present (≥70% target)' : 'Not reported: load 1st BA Household Participation export',
          ico: 'users',
          accent: k2.rate === null ? 'accent-idle' : (k2.rate >= 0.7 ? 'accent-good' : 'accent-warn'),
          bar: k2.listed ? progressBar(k2.present, 0, k2.listed) : '',
          tooltip: 'Barangay Assembly Household Participation Rate for 1st Barangay Assembly (BA1) · Quorum Target: ≥70%',
          term: 'k2',
          act: k2.listed ? 'kpi-brgy' : '', v: 'k2', title: 'Filter barangays with 1st BA HH Rate below 70%'
        })
      )) +
    '</div>' +
    renderOverviewTriageTray(triage) +
    renderMilestoneStepper(pipe) +
    '<div class="two-col">' +
      '<div class="card"><div class="card-head"><div><h3>Stage ' + STATE.stage + ' activities</h3><div class="tiny">Target vs. encoded records per activity</div></div>' +
        '<button class="btn ghost btn-sm" data-act="csv-pipeline">' + icon('download') + ' <span>CSV</span></button></div>' +
        quickChipsHtml +
        '<div class="toolbar-row" style="margin-top:10px;margin-bottom:12px"><div class="filters" style="margin:0;flex:1">' +
          '<label class="field" style="flex:1"><span>Search activities</span><input type="search" id="ov-search" value="' + attr(STATE.ovSearch) + '" placeholder="Search activity, sequence, code, level…"></label>' +
          (STATE.ovSearch || STATE.ovFilter !== 'all' || STATE.ovSeqFilter ? '<button type="button" class="btn ghost btn-sm" data-act="ov-reset">' + icon('rotate-ccw') + ' <span>Reset filters</span></button>' : '') +
        '</div><span class="tiny">Showing <strong>' + n(sortedPipe.length) + '</strong> of <strong>' + n(pipe.length) + '</strong></span></div>' +
        '<div class="legend"><span class="pill good">With attendance sheet</span><span class="pill warn">Recorded, pending sheet</span><span>Not encoded means not in KCIS yet, not "not conducted".</span></div>' +
        '<div class="table-wrap"><table class="grid"><thead><tr>' +
          th('seq', 'Seq', true, { tooltip: 'Standard activity sequence number in CRIP' }) +
          th('activity', 'Activity', false, { tooltip: 'Official assembly or workshop milestone' }) +
          th('expected', 'Target', true, { tooltip: 'Expected total activities for monitored barangays' }) +
          th('complete', 'With sheet', true, { tooltip: 'Activities encoded with verified attendance sheet' }) +
          th('noAttendees', 'Pending Sheet', true, { term: 'nosheet', tooltip: 'Encoded in KCIS, physical signed attendance sheet pending attachment' }) +
          th('notEncoded', 'Not encoded', true, { tooltip: 'Activities not yet recorded in the KCIS database' }) +
          th('backlog', 'Lacking', true, { term: 'lacking' }) +
          th('progress', 'Progress', false, { tooltip: 'Completion percentage against targeted activities' }) +
        '</tr></thead><tbody>' + (rows || '<tr><td colspan="8" class="empty-state">No activity matches your search.</td></tr>') + totalRow + '</tbody></table></div></div>' +
      '<div>' +
        '<div class="card"><div class="card-head" style="margin-bottom:8px"><h3>' + (isStage2 ? '2nd BA community volunteers' : '1st BA community volunteers') + '</h3>' +
          ((isStage2 || cv) ? '<button class="link tiny" data-act="go" data-v="' + (isStage2 ? 'cspmc' : 'people') + '">Open ' + (isStage2 ? 'CSPMC' : 'People') + ' ›</button>' : '') + '</div>' + (isStage2 ? cvStage2Html : cvHtml) + '</div>' +
        '<div class="card"><div class="card-head" style="margin-bottom:8px"><h3>Data Quality Assessment (DQA)</h3><button class="link tiny" data-act="go" data-v="health">Open DQA Scorecard ›</button></div>' +
        '<div class="muted" style="margin-bottom:10px"><strong style="color:var(--bad-text)">' + sevCount.critical + '</strong> critical · <strong style="color:var(--warn-text)">' + sevCount.verify + '</strong> to verify · <strong style="color:var(--good-text)">' + sevCount.passed + '</strong> passed · ' + esc(scopeName) + '</div>' +
        (open.length ? open.map(function (e) {
          return '<div class="sev-line"><span><span class="pill ' + (e.status === 'critical' ? 'bad' : 'warn') + '">' + (e.status === 'critical' ? 'Critical' : 'To verify') + '</span> ' + esc(e.check.name) + '</span>' +
            '<button class="link" data-act="health-open" data-v="' + attr(e.check.id) + '">' + n(e.count) + ' ' + esc(e.count === 1 ? e.check.unit[0] : e.check.unit[1]) + '</button></div>';
        }).join('') : '<div class="msg ok" style="margin:0">' + icon('check-circle-2') + ' <span>All automated checks passed in ' + esc(scopeName) + '.</span></div>') +
      '</div>' +
    '</div>' +
  '</div>';
  bindSearch('ov-search', function (v) { STATE.ovSearch = v; renderOverview(); });
  refreshIcons($('ov-body'));
}

// ---- municipalities ---------------------------------------------------------

function muniK2(r, asm) {
  var code = asm || (STATE.stage === 2 ? 'BA2' : 'BA1');
  var prop = code === 'BA2' ? 'households_ba2' : (code === 'BA3' ? 'households_ba3' : 'households');
  var h = (r && r[prop]) || (code === 'BA1' && r && r.households) || {};
  return h.listed ? h.present / h.listed : null;
}
function cvCell(v, code) {
  if (!v || !v[code]) return '<span class="tiny">—</span>';
  var x = v[code];
  return n(x.encoded) + '/' + n(x.expected) + (x.needsFix ? ' <span class="tiny" style="color:var(--warn-text)">+' + n(x.needsFix) + '⚠</span>' : '');
}

function muniProgress(r, acts) {
  var aList = acts || stageActs();
  var totExp = 0, totComp = 0;
  aList.forEach(function (a) {
    var c = (r.cells && r.cells[a.code]) || {};
    totExp += (c.expected || 0);
    totComp += (c.complete || 0);
  });
  return totExp > 0 ? (totComp / totExp) : 0;
}

function getMuniTriageSummary(rows, acts, cvOn) {
  var aList = acts || stageActs();
  var isCv = (cvOn !== undefined) ? cvOn : (STATE.stage === 1 && S.overview && S.overview.volunteers && S.overview.volunteers.imported);
  var lackingFn = function (r) {
    return aList.reduce(function (s, a) { return s + (((r.cells && r.cells[a.code]) || {}).backlog || 0); }, 0);
  };
  var noSheetFn = function (r) {
    return aList.reduce(function (s, a) { return s + (((r.cells && r.cells[a.code]) || {}).noAttendees || 0); }, 0);
  };

  var withBacklog = 0, totalLacking = 0;
  var withNoSheet = 0, totalNoSheet = 0;
  var k2Issues = 0;
  var k2Ba2Issues = 0;
  var k2Ba3Issues = 0;
  var cvIssues = 0;
  var compliant = 0;

  (rows || []).forEach(function (r) {
    var b = lackingFn(r);
    var ns = noSheetFn(r);
    var kBad = false;
    if (STATE.stage === 2) {
      var k2 = muniK2(r, 'BA2');
      var k3 = muniK2(r, 'BA3');
      var bad2 = (k2 !== null && k2 < 0.7);
      var bad3 = (k3 !== null && k3 < 0.7);
      if (bad2) k2Ba2Issues++;
      if (bad3) k2Ba3Issues++;
      kBad = bad2 || bad3;
    } else {
      var k = muniK2(r, 'BA1');
      kBad = (k !== null && k < 0.7);
    }
    var cvBad = false;
    if (isCv && r.volunteers) {
      var B = r.volunteers.BREST, S = r.volunteers.SFMSC;
      cvBad = (B && (B.encoded < B.expected || B.needsFix > 0)) || (S && (S.encoded < S.expected || S.needsFix > 0));
    }

    if (b > 0) { withBacklog++; totalLacking += b; }
    if (ns > 0) { withNoSheet++; totalNoSheet += ns; }
    if (kBad) k2Issues++;
    if (cvBad) cvIssues++;
    if (b === 0 && ns === 0 && !kBad && !cvBad) compliant++;
  });

  return {
    totalMunis: (rows || []).length,
    munisWithBacklog: withBacklog,
    totalLackingRecords: totalLacking,
    munisWithNoSheet: withNoSheet,
    totalNoSheetRecords: totalNoSheet,
    munisK2Issue: k2Issues,
    munisK2Ba2Issue: k2Ba2Issues,
    munisK2Ba3Issue: k2Ba3Issues,
    munisCvIssue: cvIssues,
    munisCompliant: compliant
  };
}

function renderMuniTriageTray(summary, cvOn) {
  var isCv = (cvOn !== undefined) ? cvOn : (STATE.stage === 1 && S.overview && S.overview.volunteers && S.overview.volunteers.imported);
  var items = [];
  var total = summary.totalMunis;

  // 1. All Monitored LGUs
  items.push(
    '<button type="button" class="triage-item' + ((!STATE.muniFilter || STATE.muniFilter === 'all') ? ' active-triage' : '') + '" data-act="mu-filter" data-v="all" title="View all monitored municipalities in scope">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + n(total) + '</span>' +
        '<span class="triage-item-label">Monitored LGUs</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 2. Backlog
  if (summary.munisWithBacklog > 0) {
    items.push(
      '<button type="button" class="triage-item triage-bad' + (STATE.muniFilter === 'lacking' ? ' active-triage' : '') + '" data-act="mu-filter" data-v="lacking" title="Filter municipalities with unencoded backlog records (>3 days overdue)">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(summary.munisWithBacklog) + '</span>' +
          '<span class="triage-item-label">LGUs with Backlog (' + n(summary.totalLackingRecords) + ' records)</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  // 3. Pending Sheets
  if (summary.munisWithNoSheet > 0) {
    items.push(
      '<button type="button" class="triage-item triage-warn' + (STATE.muniFilter === 'nosheet' ? ' active-triage' : '') + '" data-act="mu-filter" data-v="nosheet" title="Filter municipalities with activities recorded without signed attendance sheets">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(summary.munisWithNoSheet) + '</span>' +
          '<span class="triage-item-label">Pending Signed Sheets (' + n(summary.totalNoSheetRecords) + ')</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  // 4. K2 Quorum Alert
  if (STATE.stage === 2) {
    if (summary.munisK2Ba2Issue > 0) {
      items.push(
        '<button type="button" class="triage-item triage-warn' + (STATE.muniFilter === 'k2_ba2' ? ' active-triage' : '') + '" data-act="mu-filter" data-v="k2_ba2" title="Filter municipalities where 2nd BA household quorum is below 70%">' +
          '<div class="triage-item-info">' +
            '<span class="triage-item-count">' + n(summary.munisK2Ba2Issue) + '</span>' +
            '<span class="triage-item-label">LGUs Below 2nd BA Quorum</span>' +
          '</div>' +
          '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
        '</button>'
      );
    }
    if (summary.munisK2Ba3Issue > 0) {
      items.push(
        '<button type="button" class="triage-item triage-warn' + (STATE.muniFilter === 'k2_ba3' ? ' active-triage' : '') + '" data-act="mu-filter" data-v="k2_ba3" title="Filter municipalities where 3rd BA household quorum is below 70%">' +
          '<div class="triage-item-info">' +
            '<span class="triage-item-count">' + n(summary.munisK2Ba3Issue) + '</span>' +
            '<span class="triage-item-label">LGUs Below 3rd BA Quorum</span>' +
          '</div>' +
          '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
        '</button>'
      );
    }
  } else if (summary.munisK2Issue > 0) {
    items.push(
      '<button type="button" class="triage-item triage-warn' + (STATE.muniFilter === 'k2' ? ' active-triage' : '') + '" data-act="mu-filter" data-v="k2" title="Filter municipalities where 1st BA household quorum is below 70%">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(summary.munisK2Issue) + '</span>' +
          '<span class="triage-item-label">LGUs Below 1st BA Quorum</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  // 5. Volunteer Gaps (Stage 1 with cvOn)
  if (isCv && summary.munisCvIssue > 0) {
    items.push(
      '<button type="button" class="triage-item triage-warn' + (STATE.muniFilter === 'cv' ? ' active-triage' : '') + '" data-act="mu-filter" data-v="cv" title="Filter municipalities with missing or invalid BResT/SFMSC volunteer records">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(summary.munisCvIssue) + '</span>' +
          '<span class="triage-item-label">LGUs with Volunteer Gaps</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  // 6. Compliant LGUs
  items.push(
    '<button type="button" class="triage-item triage-good' + (STATE.muniFilter === 'compliant' ? ' active-triage' : '') + '" data-act="mu-filter" data-v="compliant" title="Filter municipalities with zero backlog and all milestone standards met">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + n(summary.munisCompliant) + '</span>' +
        '<span class="triage-item-label">Fully Compliant LGUs</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  var isAllGood = summary.munisWithBacklog === 0 && summary.munisWithNoSheet === 0 && summary.munisK2Issue === 0 && (!isCv || summary.munisCvIssue === 0);
  var trayCls = isAllGood ? 'triage-tray all-good' : (summary.munisWithBacklog > 0 ? 'triage-tray has-critical' : 'triage-tray');
  var issuesCount = (summary.munisWithBacklog > 0 ? 1 : 0) + (summary.munisWithNoSheet > 0 ? 1 : 0) + (summary.munisK2Issue > 0 ? 1 : 0) + (isCv && summary.munisCvIssue > 0 ? 1 : 0);
  var badgeHtml = isAllGood
    ? '<span class="triage-badge">All LGUs Compliant</span>'
    : '<span class="triage-badge">' + issuesCount + ' Focus ' + (issuesCount === 1 ? 'Area' : 'Areas') + '</span>';

  return (
    '<div class="' + trayCls + '">' +
      '<div class="triage-head">' +
        '<div class="triage-title">' +
          icon(isAllGood ? 'check-circle-2' : 'alert-circle') +
          '<span>Municipal Operations Triage & Performance</span> ' +
          badgeHtml +
        '</div>' +
        (!isAllGood ? '<span class="tiny muted">Click any triage metric to isolate the affected municipalities</span>' : '') +
      '</div>' +
      '<div class="triage-grid">' + items.join('') + '</div>' +
    '</div>'
  );
}

function muniTableData() {
  var q = normSearch(STATE.muniSearch);
  var acts = stageActs();
  var cvOn = STATE.stage === 1 && S.overview && S.overview.volunteers && S.overview.volunteers.imported;
  var lacking = function (r) { return acts.reduce(function (s, a) { return s + (((r.cells && r.cells[a.code]) || {}).backlog || 0); }, 0); };
  var noSheet = function (r) { return acts.reduce(function (s, a) { return s + (((r.cells && r.cells[a.code]) || {}).noAttendees || 0); }, 0); };
  var filter = STATE.muniFilter || 'all';

  var filtered = matrixRows().filter(function (r) {
    if (q && normSearch(r.municipality + ' ' + r.province).indexOf(q) === -1) return false;
    if (filter === 'lacking') return lacking(r) > 0;
    if (filter === 'nosheet') return noSheet(r) > 0;
    if (filter === 'k2') {
      if (STATE.stage === 2) {
        var k2 = muniK2(r, 'BA2'), k3 = muniK2(r, 'BA3');
        return (k2 !== null && k2 < 0.7) || (k3 !== null && k3 < 0.7);
      }
      var k1 = muniK2(r, 'BA1'); return k1 !== null && k1 < 0.7;
    }
    if (filter === 'k2_ba2') { var k2 = muniK2(r, 'BA2'); return k2 !== null && k2 < 0.7; }
    if (filter === 'k2_ba3') { var k3 = muniK2(r, 'BA3'); return k3 !== null && k3 < 0.7; }
    if (filter === 'cv') {
      if (!r.volunteers) return false;
      var B = r.volunteers.BREST, S = r.volunteers.SFMSC;
      return (B && (B.encoded < B.expected || B.needsFix > 0)) || (S && (S.encoded < S.expected || S.needsFix > 0));
    }
    if (filter === 'compliant') {
      var kIssue = false;
      if (STATE.stage === 2) {
        var k2 = muniK2(r, 'BA2'), k3 = muniK2(r, 'BA3');
        kIssue = (k2 !== null && k2 < 0.7) || (k3 !== null && k3 < 0.7);
      } else {
        var k = muniK2(r, 'BA1');
        kIssue = (k !== null && k < 0.7);
      }
      var cvIssue = false;
      if (cvOn && r.volunteers) {
        var B = r.volunteers.BREST, S = r.volunteers.SFMSC;
        cvIssue = (B && (B.encoded < B.expected || B.needsFix > 0)) || (S && (S.encoded < S.expected || S.needsFix > 0));
      }
      return lacking(r) === 0 && noSheet(r) === 0 && !kIssue && !cvIssue;
    }
    return true;
  });

  var curCol = (STATE.muniSort && STATE.muniSort.col) || 'muni';
  var curDir = (STATE.muniSort && STATE.muniSort.dir) || 'asc';
  var extractors = {
    muni: function (r) { return r.municipality + ' ' + r.province; },
    lacking: function (r) { return lacking(r); },
    k2: function (r) { return muniK2(r); },
    k2_ba2: function (r) { return muniK2(r, 'BA2'); },
    k2_ba3: function (r) { return muniK2(r, 'BA3'); },
    rate: function (r) { return muniProgress(r, acts); },
    BREST: function (r) { var x = (r.volunteers && r.volunteers.BREST); return x ? x.encoded : null; },
    SFMSC: function (r) { var x = (r.volunteers && r.volunteers.SFMSC); return x ? x.encoded : null; }
  };
  acts.forEach(function (a) {
    extractors['act_' + a.code] = function (r) {
      var c = r.cells && r.cells[a.code];
      return c ? (c.complete || 0) : null;
    };
  });
  return tblSort(filtered, curCol, curDir, extractors);
}

function renderMunis() {
  var acts = stageActs();
  var baseRows = matrixRows();
  var cvOn = STATE.stage === 1 && S.overview && S.overview.volunteers && S.overview.volunteers.imported;
  var summary = getMuniTriageSummary(baseRows, acts, cvOn);
  var rows = muniTableData();

  var lacking = function (r) { return acts.reduce(function (s, a) { return s + (((r.cells && r.cells[a.code]) || {}).backlog || 0); }, 0); };
  var cell = function (c, a) {
    if (!c || (a.prioOnly && !c.expected)) return '<td class="num tiny">—</td>';
    return '<td><div class="cell-pct"><span class="num">' + n(c.complete) + '/' + n(c.expected) +
      (c.noAttendees ? ' <span class="tiny" style="color:var(--warn-text)" title="' + n(c.noAttendees) + ' records pending signed attendance sheet">+' + n(c.noAttendees) + '</span>' : '') +
      '</span>' +
      progressBar(c.complete, c.noAttendees, c.expected) + '</div></td>';
  };

  var body = rows.map(function (r) {
    var k = muniK2(r);
    var pRate = muniProgress(r, acts);
    var pPct = Math.round(pRate * 100);
    var mine = homeKey() === r.province + '|' + r.municipality;
    return '<tr class="click' + (mine ? ' mine' : '') + '" data-act="muni" data-v="' + attr(r.province + '|' + r.municipality) + '" tabindex="0">' +
      '<td class="sticky">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">' +
          '<strong>' + esc(r.municipality) + '</strong>' +
          (mine ? ' <span class="pill good">Yours</span>' : '') +
        '</div>' +
        '<div class="tiny text-muted">' + esc(r.province) + '</div>' +
        '<div style="margin-top:4px">' +
          '<div class="step-progress-mini" style="height:3px" title="' + pPct + '% stage pipeline complete">' +
            '<div class="step-progress-mini-bar" style="width:' + pPct + '%;' + (pRate >= 1 ? 'background:var(--good);' : '') + '"></div>' +
          '</div>' +
          '<div class="tiny" style="color:var(--text-dim);margin-top:2px;font-size:10px;display:flex;justify-content:space-between">' +
            '<span>' + pPct + '% complete</span>' +
            '<span class="link" style="font-size:9.5px">Drill down →</span>' +
          '</div>' +
        '</div>' +
      '</td>' +
      acts.map(function (a) { return cell(r.cells && r.cells[a.code], a); }).join('') +
      '<td class="num">' + (lacking(r) ? '<strong style="color:var(--bad-text)">' + n(lacking(r)) + '</strong>' : '0') + '</td>' +
      (STATE.stage === 2 ? (
        (function () {
          var k2 = muniK2(r, 'BA2');
          var k3 = muniK2(r, 'BA3');
          var c2 = '<td class="num">' + (k2 === null ? '<span class="tiny">not reported</span>' : '<span style="' + (k2 >= 0.7 ? 'color:var(--good-text)' : 'color:var(--warn-text)') + ';font-weight:700">' + pctText(k2) + '</span>') + '</td>';
          var c3 = '<td class="num">' + (k3 === null ? '<span class="tiny">not reported</span>' : '<span style="' + (k3 >= 0.7 ? 'color:var(--good-text)' : 'color:var(--warn-text)') + ';font-weight:700">' + pctText(k3) + '</span>') + '</td>';
          return c2 + c3;
        })()
      ) : (
        '<td class="num">' + (k === null ? '<span class="tiny">not reported</span>' : '<span style="' + (k >= 0.7 ? 'color:var(--good-text)' : 'color:var(--warn-text)') + ';font-weight:700">' + pctText(k) + '</span>') + '</td>'
      )) +
      (cvOn ? '<td class="num">' + cvCell(r.volunteers, 'BREST') + '</td><td class="num">' + cvCell(r.volunteers, 'SFMSC') + '</td>' : '') +
    '</tr>';
  }).join('');

  var hasFilter = !!(STATE.prov || STATE.muniSearch || (STATE.muniFilter && STATE.muniFilter !== 'all'));
  var curCol = (STATE.muniSort && STATE.muniSort.col) || 'muni';
  var curDir = (STATE.muniSort && STATE.muniSort.dir) || 'asc';
  var th = function (col, label, num, sub, title, sticky, term) {
    return sortTh({ col: col, curCol: curCol, dir: curDir, label: label, num: num, sub: sub, title: title, sticky: sticky, term: term, act: 'mu-sort' });
  };

  var baLabel = STATE.stage === 2 ? '2nd BA' : '1st BA';
  var quickFilters = [
    { id: 'all', label: 'All LGUs', count: summary.totalMunis, cls: '' },
    { id: 'lacking', label: '🚨 With Backlog', count: summary.munisWithBacklog, cls: 'chip-bad' },
    { id: 'nosheet', label: '⚠️ Pending Sheet', count: summary.munisWithNoSheet, cls: 'chip-warn' }
  ];
  if (STATE.stage === 2) {
    quickFilters.push({ id: 'k2_ba2', label: '👥 2nd BA HH Rate < 70%', count: summary.munisK2Ba2Issue, cls: 'chip-warn' });
    quickFilters.push({ id: 'k2_ba3', label: '👥 3rd BA HH Rate < 70%', count: summary.munisK2Ba3Issue, cls: 'chip-warn' });
  } else {
    quickFilters.push({ id: 'k2', label: '👥 1st BA HH Rate < 70%', count: summary.munisK2Issue, cls: 'chip-warn' });
  }
  if (cvOn) {
    quickFilters.push({ id: 'cv', label: '🎗️ Volunteer Gaps', count: summary.munisCvIssue, cls: 'chip-warn' });
  }
  quickFilters.push({ id: 'compliant', label: '✓ On Track', count: summary.munisCompliant, cls: 'chip-good' });

  var activeFilter = STATE.muniFilter || 'all';
  var quickChipsHtml = '<div class="quick-filter-bar">' +
    '<span class="tiny text-muted" style="font-weight:700;margin-right:4px;">Quick Presets:</span>' +
    quickFilters.map(function (f) {
      var isActive = activeFilter === f.id;
      return '<button type="button" class="quick-filter-chip' + (f.cls ? ' ' + f.cls : '') + (isActive ? ' active' : '') + '" data-act="mu-filter" data-v="' + f.id + '">' +
        '<span>' + f.label + '</span>' +
        '<span class="tiny" style="opacity:0.85">(' + n(f.count) + ')</span>' +
      '</button>';
    }).join('') +
  '</div>';

  var isMuni = isMunicipalUser();

  $('mu-body').innerHTML =
    renderMuniTriageTray(summary, cvOn) +
    '<div class="card">' +
      '<div class="card-head">' +
        '<div>' +
          '<h2>Municipalities</h2>' +
          '<div class="muted">Records with signed attendance sheet / expected target per activity (+ recorded without sheet). Click any municipality row to drill down into its barangays.</div>' +
        '</div>' +
        '<button class="btn ghost btn-sm" data-act="csv-munis">' + icon('download') + ' <span>CSV</span></button>' +
      '</div>' +
      stageSwitch() +
      '<div class="toolbar-row">' +
        '<div class="filters" style="margin:0">' +
          (!isMuni ? '<label class="field"><span>Province</span><select data-act="prov-select">' + ['<option value="">Whole region</option>'].concat(provinces().map(function (p) {
            return '<option value="' + attr(p) + '"' + (STATE.prov === p ? ' selected' : '') + '>' + esc(p) + '</option>'; })).join('') + '</select></label>' : '') +
          '<label class="field"><span>Search</span><input type="search" id="mu-search" value="' + attr(STATE.muniSearch) + '" placeholder="Municipality or province…"></label>' +
          (hasFilter ? '<button type="button" class="btn ghost btn-sm" data-act="muni-reset">' + icon('rotate-ccw') + ' <span>Reset filters</span></button>' : '') +
        '</div>' +
        '<span class="tiny">Showing <strong>' + n(rows.length) + '</strong> of <strong>' + n(baseRows.length) + '</strong> ' + (baseRows.length === 1 ? 'municipality' : 'municipalities') + '</span>' +
      '</div>' +
      quickChipsHtml +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        th('muni', 'Municipality (' + rows.length + ')', false, 'LGU Scope', 'Click row to view barangays in this municipality', true) +
        acts.map(function (a) { return th('act_' + a.code, esc(a.code), false, 'Seq ' + esc(a.seq), a.label); }).join('') +
        th('lacking', 'Backlog', true, 'Missing Items', 'Unencoded records (conducted in field > 3 days ago but missing in KCIS)', false, '', 'lacking') +
        (STATE.stage === 2 ? (
          th('k2_ba2', '2nd BA Rate', true, '2nd BA Quorum', '2nd BA Household Quorum (Threshold: ≥ 70%)', false, 'k2_ba2') +
          th('k2_ba3', '3rd BA Rate', true, '3rd BA Quorum', '3rd BA Household Quorum (Threshold: ≥ 70%)', false, 'k2_ba3')
        ) : (
          th('k2', 'BA HH Rate', true, '1st BA Quorum', '1st BA Household Quorum (Threshold: ≥ 70%)', false, 'k2')
        )) +
        (cvOn ? th('BREST', 'BResT', true, 'Resilience Team', 'Barangay Resiliency Team volunteer composition', false, '', 'brest') + th('SFMSC', 'SFMSC', true, 'Feedback Comm.', 'Stakeholder & Feedback Mechanism Sub-Committee volunteers', false, '', 'sfmsc') : '') +
      '</tr></thead><tbody>' + (body || '<tr><td colspan="30" class="empty-state">No municipality matches your active filter or search criteria.</td></tr>') + '</tbody></table></div>' +
    '</div>';

  bindSearch('mu-search', function (v) { STATE.muniSearch = v; renderMunis(); });
  refreshIcons($('mu-body'));
}

// ---- barangays ---------------------------------------------------------------

var BRGY_FILTERS = [
  { id: 'all', label: 'All barangays', test: function () { return true; } },
  { id: 'lacking', label: 'Lacking records', test: function (b) { return ((b.todo && b.todo.length) || (b.owed || 0)) > 0; } },
  { id: 'nosheet', label: 'Recorded without sheet', test: function (b) { return Object.keys(b.activities || {}).some(function (k) { return b.activities[k].status === 'No Attendees' && !b.activities[k].notApplicable; }); } },
  { id: 'k2', label: 'BA HH Rate below 70%', test: function (b) {
    if (STATE.stage === 2) {
      var h2 = (typeof hhOf === 'function') ? hhOf(b, 'BA2') : ((b.activities && b.activities['BA2']) || {});
      var h3 = (typeof hhOf === 'function') ? hhOf(b, 'BA3') : ((b.activities && b.activities['BA3']) || {});
      return (h2.hhListed > 0 && h2.hhRate < 0.7) || (h3.hhListed > 0 && h3.hhRate < 0.7);
    }
    var h = (typeof hhOf === 'function') ? hhOf(b, 'BA1') : ((b.activities && b.activities['BA1']) || b || {});
    return h.hhListed > 0 && h.hhRate < 0.7;
  } },
  { id: 'k2_ba2', label: '2nd BA HH Rate below 70%', test: function (b) {
    var h = (typeof hhOf === 'function') ? hhOf(b, 'BA2') : ((b.activities && b.activities['BA2']) || {});
    return h.hhListed > 0 && h.hhRate < 0.7;
  } },
  { id: 'k2_ba3', label: '3rd BA HH Rate below 70%', test: function (b) {
    var h = (typeof hhOf === 'function') ? hhOf(b, 'BA3') : ((b.activities && b.activities['BA3']) || {});
    return h.hhListed > 0 && h.hhRate < 0.7;
  } },
  { id: 'cv', label: 'Volunteers missing', test: function (b) { return !!b.volunteers && Object.keys(b.volunteers).some(function (k) { return b.volunteers[k].status === 'Not encoded'; }); } },
  { id: 'sfmsc', label: 'SFMSC to fix', test: function (b) { return !!b.volunteers && b.volunteers.SFMSC && b.volunteers.SFMSC.status === 'Needs fixing'; } },
  { id: 'compliant', label: 'Compliant / On-track', test: function (b) {
    var hasLacking = ((b.todo && b.todo.length) || (b.owed || 0)) > 0;
    var hasNoSheet = Object.keys(b.activities || {}).some(function (k) { return b.activities[k].status === 'No Attendees' && !b.activities[k].notApplicable; });
    var k2Bad = false;
    if (STATE.stage === 2) {
      var h2 = (typeof hhOf === 'function') ? hhOf(b, 'BA2') : ((b.activities && b.activities['BA2']) || {});
      var h3 = (typeof hhOf === 'function') ? hhOf(b, 'BA3') : ((b.activities && b.activities['BA3']) || {});
      k2Bad = (h2.hhListed > 0 && h2.hhRate < 0.7) || (h3.hhListed > 0 && h3.hhRate < 0.7);
    } else {
      var h = (typeof hhOf === 'function') ? hhOf(b, 'BA1') : ((b.activities && b.activities['BA1']) || b || {});
      k2Bad = (h.hhListed > 0 && h.hhRate < 0.7);
    }
    var cvBad = (STATE.stage === 1 && !!b.volunteers && Object.keys(b.volunteers).some(function (k) { return b.volunteers[k].status === 'Not encoded' || b.volunteers[k].status === 'Needs fixing'; }));
    return !hasLacking && !hasNoSheet && !k2Bad && !cvBad;
  } }
];

function brgyStatusPill(x, a) {
  if (!x || x.notApplicable || x.status === 'N/A') return '<span class="tiny">—</span>';
  if (x.status === 'Complete') return '<span class="pill good" title="' + attr(n(x.attendees) + ' attendees recorded with signed attendance sheet') + '">✓ ' + n(x.attendees) + '</span>';
  if (x.status === 'No Attendees') return '<span class="pill warn" title="Activity encoded in KCIS, signed physical attendance sheet pending upload">Pending Sheet</span>';
  return '<span class="pill ' + (a.field === 'Completed' ? 'bad' : 'idle') + '" title="Not in KCIS' + (a.field === 'Completed' ? ' (field conduct: Completed)' : '') + '">○</span>';
}
function cvPill(v, code) {
  if (!v || !v[code]) return '<span class="tiny">—</span>';
  var x = v[code], cls = x.status === 'Encoded' ? 'good' : x.status === 'Needs fixing' ? 'warn' : 'bad';
  return '<span class="pill ' + cls + '" title="' + attr(x.status + (x.reasons && x.reasons.length ? ': ' + x.reasons.join(', ') : '')) + '">' + esc(x.status === 'Encoded' ? '✓ ' + x.members : x.status === 'Needs fixing' ? '⚠ ' + x.members : '○') + '</span>' +
    (x.reasons && x.reasons.length ? '<div class="tiny">' + esc(x.reasons.join(' · ')) + '</div>' : '');
}

function brgyProgress(b, acts) {
  var aList = acts || stageActs();
  var exp = 0, comp = 0;
  aList.forEach(function (a) {
    if (a.level === 'Municipal') return;
    var x = b.activities && b.activities[a.code];
    if (!x || x.notApplicable || x.status === 'N/A') return;
    exp++;
    if (x.status === 'Complete') comp++;
  });
  return exp > 0 ? comp / exp : 0;
}

function getBrgyTriageSummary(all, acts, cvOn) {
  var isCv = (cvOn !== undefined) ? cvOn : (STATE.stage === 1 && S.overview && S.overview.volunteers && S.overview.volunteers.imported);

  var lackingCount = 0, totalLacking = 0;
  var noSheetCount = 0, totalNoSheet = 0;
  var k2RiskCount = 0;
  var k2Ba2RiskCount = 0;
  var k2Ba3RiskCount = 0;
  var cvGapsCount = 0;
  var sfmscFixCount = 0;
  var compliantCount = 0;

  (all || []).forEach(function (b) {
    var lackItems = ((b.todo && b.todo.length) || 0) + (b.owed || 0);
    var hasLacking = lackItems > 0;

    var noSheetActs = 0;
    Object.keys(b.activities || {}).forEach(function (k) {
      var act = b.activities[k];
      if (act && act.status === 'No Attendees' && !act.notApplicable) noSheetActs++;
    });
    var hasNoSheet = noSheetActs > 0;

    var k2Risk = false;
    if (STATE.stage === 2) {
      var h2 = (typeof hhOf === 'function') ? hhOf(b, 'BA2') : ((b.activities && b.activities['BA2']) || {});
      var h3 = (typeof hhOf === 'function') ? hhOf(b, 'BA3') : ((b.activities && b.activities['BA3']) || {});
      var bad2 = (h2.hhListed > 0 && h2.hhRate < 0.7);
      var bad3 = (h3.hhListed > 0 && h3.hhRate < 0.7);
      if (bad2) k2Ba2RiskCount++;
      if (bad3) k2Ba3RiskCount++;
      k2Risk = bad2 || bad3;
    } else {
      var h1 = (typeof hhOf === 'function') ? hhOf(b, 'BA1') : ((b.activities && b.activities['BA1']) || b || {});
      k2Risk = (h1.hhListed > 0 && h1.hhRate < 0.7);
    }

    var cvGaps = false, sfmscFix = false;
    if (isCv && b.volunteers) {
      if (b.volunteers.BREST && b.volunteers.BREST.status === 'Not encoded') cvGaps = true;
      if (b.volunteers.SFMSC) {
        if (b.volunteers.SFMSC.status === 'Not encoded') cvGaps = true;
        if (b.volunteers.SFMSC.status === 'Needs fixing') sfmscFix = true;
      }
    }

    if (hasLacking) { lackingCount++; totalLacking += lackItems; }
    if (hasNoSheet) { noSheetCount++; totalNoSheet += noSheetActs; }
    if (k2Risk) k2RiskCount++;
    if (cvGaps) cvGapsCount++;
    if (sfmscFix) sfmscFixCount++;

    if (!hasLacking && !hasNoSheet && !k2Risk && !cvGaps && !sfmscFix) {
      compliantCount++;
    }
  });

  return {
    totalBrgys: (all || []).length,
    lackingBrgys: lackingCount,
    totalLackingItems: totalLacking,
    noSheetBrgys: noSheetCount,
    totalNoSheetActivities: totalNoSheet,
    k2RiskBrgys: k2RiskCount,
    k2Ba2RiskBrgys: k2Ba2RiskCount,
    k2Ba3RiskBrgys: k2Ba3RiskCount,
    cvGapsBrgys: cvGapsCount,
    sfmscFixBrgys: sfmscFixCount,
    compliantBrgys: compliantCount
  };
}

function renderBrgyTriageTray(summary, cvOn) {
  var isCv = (cvOn !== undefined) ? cvOn : (STATE.stage === 1 && S.overview && S.overview.volunteers && S.overview.volunteers.imported);
  var items = [];
  var total = summary.totalBrgys;

  // 1. All Monitored Barangays
  items.push(
    '<button type="button" class="triage-item' + ((!STATE.brgyFilter || STATE.brgyFilter === 'all') ? ' active-triage' : '') + '" data-act="brgy-filter" data-v="all" title="View all monitored barangays in this municipality">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + n(total) + '</span>' +
        '<span class="triage-item-label">Monitored Barangays</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 2. Backlog
  if (summary.lackingBrgys > 0) {
    items.push(
      '<button type="button" class="triage-item triage-bad' + (STATE.brgyFilter === 'lacking' ? ' active-triage' : '') + '" data-act="brgy-filter" data-v="lacking" title="Filter barangays with unencoded activities (>3 days overdue)">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(summary.lackingBrgys) + '</span>' +
          '<span class="triage-item-label">Barangays with Backlog (' + n(summary.totalLackingItems) + ' items)</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  // 3. Pending Sheets
  if (summary.noSheetBrgys > 0) {
    items.push(
      '<button type="button" class="triage-item triage-warn' + (STATE.brgyFilter === 'nosheet' ? ' active-triage' : '') + '" data-act="brgy-filter" data-v="nosheet" title="Filter barangays with activities recorded without signed attendance sheets">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(summary.noSheetBrgys) + '</span>' +
          '<span class="triage-item-label">Pending Signed Sheets (' + n(summary.totalNoSheetActivities) + ')</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  // 4. K2 Quorum Alert
  if (STATE.stage === 2) {
    if (summary.k2Ba2RiskBrgys > 0) {
      items.push(
        '<button type="button" class="triage-item triage-warn' + (STATE.brgyFilter === 'k2_ba2' ? ' active-triage' : '') + '" data-act="brgy-filter" data-v="k2_ba2" title="Filter barangays where 2nd BA household quorum is below 70%">' +
          '<div class="triage-item-info">' +
            '<span class="triage-item-count">' + n(summary.k2Ba2RiskBrgys) + '</span>' +
            '<span class="triage-item-label">Barangays Below 2nd BA Quorum</span>' +
          '</div>' +
          '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
        '</button>'
      );
    }
    if (summary.k2Ba3RiskBrgys > 0) {
      items.push(
        '<button type="button" class="triage-item triage-warn' + (STATE.brgyFilter === 'k2_ba3' ? ' active-triage' : '') + '" data-act="brgy-filter" data-v="k2_ba3" title="Filter barangays where 3rd BA household quorum is below 70%">' +
          '<div class="triage-item-info">' +
            '<span class="triage-item-count">' + n(summary.k2Ba3RiskBrgys) + '</span>' +
            '<span class="triage-item-label">Barangays Below 3rd BA Quorum</span>' +
          '</div>' +
          '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
        '</button>'
      );
    }
  } else if (summary.k2RiskBrgys > 0) {
    items.push(
      '<button type="button" class="triage-item triage-warn' + (STATE.brgyFilter === 'k2' ? ' active-triage' : '') + '" data-act="brgy-filter" data-v="k2" title="Filter barangays where 1st BA household quorum is below 70%">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(summary.k2RiskBrgys) + '</span>' +
          '<span class="triage-item-label">Barangays Below 1st BA Quorum</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  // 5. Volunteer Gaps & Fixes (Stage 1 with cvOn)
  if (isCv && (summary.cvGapsBrgys > 0 || summary.sfmscFixBrgys > 0)) {
    var vCount = summary.cvGapsBrgys + summary.sfmscFixBrgys;
    items.push(
      '<button type="button" class="triage-item triage-warn' + (STATE.brgyFilter === 'cv' || STATE.brgyFilter === 'sfmsc' ? ' active-triage' : '') + '" data-act="brgy-filter" data-v="cv" title="Filter barangays with missing or invalid BResT/SFMSC volunteer records">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(vCount) + '</span>' +
          '<span class="triage-item-label">Volunteer Gaps & Fixes</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  // 6. Compliant Barangays
  items.push(
    '<button type="button" class="triage-item triage-good' + (STATE.brgyFilter === 'compliant' ? ' active-triage' : '') + '" data-act="brgy-filter" data-v="compliant" title="Filter barangays with zero backlog and all milestone standards met">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + n(summary.compliantBrgys) + '</span>' +
        '<span class="triage-item-label">Fully Compliant Barangays</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  var isAllGood = summary.lackingBrgys === 0 && summary.noSheetBrgys === 0 && summary.k2RiskBrgys === 0 && (!isCv || (summary.cvGapsBrgys === 0 && summary.sfmscFixBrgys === 0));
  var trayCls = isAllGood ? 'triage-tray all-good' : (summary.lackingBrgys > 0 ? 'triage-tray has-critical' : 'triage-tray');
  var issuesCount = (summary.lackingBrgys > 0 ? 1 : 0) + (summary.noSheetBrgys > 0 ? 1 : 0) + (summary.k2RiskBrgys > 0 ? 1 : 0) + (isCv && (summary.cvGapsBrgys > 0 || summary.sfmscFixBrgys > 0) ? 1 : 0);
  var badgeHtml = isAllGood
    ? '<span class="triage-badge">All Barangays Compliant</span>'
    : '<span class="triage-badge">' + issuesCount + ' Focus ' + (issuesCount === 1 ? 'Area' : 'Areas') + '</span>';

  return (
    '<div class="' + trayCls + '">' +
      '<div class="triage-head">' +
        '<div class="triage-title">' +
          icon(isAllGood ? 'check-circle-2' : 'alert-circle') +
          '<span>Barangay Operations Triage & Pipeline Status</span> ' +
          badgeHtml +
        '</div>' +
        (!isAllGood ? '<span class="tiny muted">Click any triage card or quick filter chip below to isolate specific barangays</span>' : '') +
      '</div>' +
      '<div class="triage-grid">' + items.join('') + '</div>' +
    '</div>'
  );
}

function brgyRows(displayActsOverride) {
  var key = STATE.muni, q = normSearch(STATE.brgySearch);
  var f = BRGY_FILTERS.filter(function (x) { return x.id === STATE.brgyFilter; })[0] || BRGY_FILTERS[0];
  var filtered = (SNAP.barangayRows || []).filter(function (b) {
    return (!key || b.province + '|' + b.municipality === key) && (!q || normSearch(b.barangay).indexOf(q) !== -1) && f.test(b);
  });
  var acts = displayActsOverride || (STATE.brgyHideMuni !== false ? stageActs().filter(function (a) { return a.level !== 'Municipal'; }) : stageActs());
  var curCol = (STATE.brgySort && STATE.brgySort.col) || 'brgy';
  var curDir = (STATE.brgySort && STATE.brgySort.dir) || 'asc';
  var extractors = {
    brgy: function (b) { return b.barangay; },
    k2: function (b) {
      var curAsm = STATE.stage === 2 ? 'BA2' : 'BA1';
      var h = (typeof hhOf === 'function') ? hhOf(b, curAsm) : ((b.activities && b.activities[curAsm]) || b || {});
      return h.hhListed ? h.hhRate : null;
    },
    k2_ba2: function (b) {
      var h = (typeof hhOf === 'function') ? hhOf(b, 'BA2') : ((b.activities && b.activities['BA2']) || {});
      return h.hhListed ? h.hhRate : null;
    },
    k2_ba3: function (b) {
      var h = (typeof hhOf === 'function') ? hhOf(b, 'BA3') : ((b.activities && b.activities['BA3']) || {});
      return h.hhListed ? h.hhRate : null;
    },
    rate: function (b) { return brgyProgress(b, acts); },
    BREST: function (b) { var v = b.volunteers && b.volunteers.BREST; return v ? (v.status === 'Encoded' ? 2 : v.status === 'Needs fixing' ? 1 : 0) : null; },
    SFMSC: function (b) { var v = b.volunteers && b.volunteers.SFMSC; return v ? (v.status === 'Encoded' ? 2 : v.status === 'Needs fixing' ? 1 : 0) : null; },
    lacking: function (b) { return (b.todo && b.todo.length) || (b.owed || 0); }
  };
  acts.forEach(function (a) {
    extractors['act_' + a.code] = function (b) {
      if (a.level === 'Municipal') return -2;
      var x = b.activities[a.code];
      if (!x || x.notApplicable || x.status === 'N/A') return -1;
      if (x.status === 'Complete') return 100000 + (x.attendees || 0);
      if (x.status === 'No Attendees') return 50000;
      return 0;
    };
  });
  return tblSort(filtered, curCol, curDir, extractors);
}

function renderBrgys() {
  var munis = (S.overview.municipalities || []).slice().sort(function (a, b) { return a.province.localeCompare(b.province) || a.municipality.localeCompare(b.municipality); });
  var isMuni = isMunicipalUser();
  if (isMuni) {
    STATE.muni = homeKey();
  } else if (!STATE.muni && munis.length) {
    STATE.muni = munis[0].province + '|' + munis[0].municipality;
  }
  var acts = stageActs(), cvOn = STATE.stage === 1 && S.overview.volunteers && S.overview.volunteers.imported;
  var hideMuni = STATE.brgyHideMuni !== false;
  var displayActs = hideMuni ? acts.filter(function (a) { return a.level !== 'Municipal'; }) : acts;
  var all = (SNAP.barangayRows || []).filter(function (b) { return b.province + '|' + b.municipality === STATE.muni; });
  var summary = getBrgyTriageSummary(all, acts, cvOn);
  var rows = brgyRows(displayActs);
  var opts = '', lastProv = '';
  munis.forEach(function (m) {
    if (m.province !== lastProv) { opts += (lastProv ? '</optgroup>' : '') + '<optgroup label="' + attr(m.province) + '">'; lastProv = m.province; }
    var v = m.province + '|' + m.municipality;
    opts += '<option value="' + attr(v) + '"' + (STATE.muni === v ? ' selected' : '') + '>' + esc(m.municipality) + '</option>';
  });
  opts += '</optgroup>';

  var curAsm = STATE.stage === 2 ? 'BA2' : 'BA1';
  var baLabel = STATE.stage === 2 ? '2nd BA' : '1st BA';

  var quickFilters = [
    { id: 'all', label: 'All Barangays', count: summary.totalBrgys, cls: '' },
    { id: 'lacking', label: '🚨 With Backlog', count: summary.lackingBrgys, cls: 'chip-bad' },
    { id: 'nosheet', label: '⚠️ Pending Sheet', count: summary.noSheetBrgys, cls: 'chip-warn' }
  ];
  if (STATE.stage === 2) {
    quickFilters.push({ id: 'k2_ba2', label: '👥 2nd BA HH Rate < 70%', count: summary.k2Ba2RiskBrgys, cls: 'chip-warn' });
    quickFilters.push({ id: 'k2_ba3', label: '👥 3rd BA HH Rate < 70%', count: summary.k2Ba3RiskBrgys, cls: 'chip-warn' });
  } else {
    quickFilters.push({ id: 'k2', label: '👥 1st BA HH Rate < 70%', count: summary.k2RiskBrgys, cls: 'chip-warn' });
  }
  if (cvOn) {
    quickFilters.push({ id: 'cv', label: '🎗️ Missing Volunteers', count: summary.cvGapsBrgys, cls: 'chip-warn' });
    if (summary.sfmscFixBrgys > 0) {
      quickFilters.push({ id: 'sfmsc', label: '⚙️ SFMSC to Fix', count: summary.sfmscFixBrgys, cls: 'chip-warn' });
    }
  }
  quickFilters.push({ id: 'compliant', label: '✓ On Track', count: summary.compliantBrgys, cls: 'chip-good' });

  var activeFilter = STATE.brgyFilter || 'all';
  var quickChipsHtml = '<div class="quick-filter-bar">' +
    '<span class="tiny text-muted" style="font-weight:700;margin-right:4px;">Quick Presets:</span>' +
    quickFilters.map(function (f) {
      var isActive = activeFilter === f.id;
      return '<button type="button" class="quick-filter-chip' + (f.cls ? ' ' + f.cls : '') + (isActive ? ' active' : '') + '" data-act="brgy-filter" data-v="' + f.id + '">' +
        '<span>' + f.label + '</span>' +
        '<span class="tiny" style="opacity:0.85">(' + n(f.count) + ')</span>' +
      '</button>';
    }).join('') +
  '</div>';

  // every cell opens the people behind it in the dedicated module
  var link = function (v, html, title) { return '<button type="button" class="cell-link" data-act="p-open" data-v="' + attr(v) + '" title="' + attr(title) + '">' + html + '</button>'; };
  var body = rows.map(function (b) {
    var bkey = b.province + '|' + b.municipality + '|' + b.barangay;
    var lackCount = (b.todo && b.todo.length) || (b.owed || 0);
    var lackCell = lackCount > 0
      ? '<button type="button" class="btn bad btn-xs lacking-btn" data-act="open-lacking" data-brgy="' + attr(bkey) + '" title="Click to view all ' + lackCount + ' lacking items and data quality findings">' +
          icon('alert-circle') + ' <span>' + n(lackCount) + ' lacking</span>' +
        '</button>'
      : '<span class="pill good tiny" title="All monitored activities encoded">✓ 0 lacking</span>';

    var pRate = brgyProgress(b, displayActs);
    var pPct = Math.round(pRate * 100);

    var baHhCells = '';
    if (STATE.stage === 2) {
      var h2 = (typeof hhOf === 'function') ? hhOf(b, 'BA2') : ((b.activities && b.activities['BA2']) || {});
      var h3 = (typeof hhOf === 'function') ? hhOf(b, 'BA3') : ((b.activities && b.activities['BA3']) || {});
      var ba2Cell = '<td class="num">' + (h2.hhListed
        ? link('households#' + bkey + '#BA2', '<span style="' + (h2.hhRate >= 0.7 ? 'color:var(--good-text)' : 'color:var(--warn-text)') + ';font-weight:700">' + pctText(h2.hhRate) + '</span><div class="tiny">' + n(h2.hhPresent) + '/' + n(h2.hhListed) + ' HH</div>', '2nd BA Household Quorum: ' + n(h2.hhPresent) + ' of ' + n(h2.hhListed) + ' households present (' + pctText(h2.hhRate) + ' · target ≥70%)')
        : '<span class="tiny">' + (h2.hhIncomplete ? 'counts incomplete' : 'not reported') + '</span>') + '</td>';
      var ba3Cell = '<td class="num">' + (h3.hhListed
        ? link('households#' + bkey + '#BA3', '<span style="' + (h3.hhRate >= 0.7 ? 'color:var(--good-text)' : 'color:var(--warn-text)') + ';font-weight:700">' + pctText(h3.hhRate) + '</span><div class="tiny">' + n(h3.hhPresent) + '/' + n(h3.hhListed) + ' HH</div>', '3rd BA Household Quorum: ' + n(h3.hhPresent) + ' of ' + n(h3.hhListed) + ' households present (' + pctText(h3.hhRate) + ' · target ≥70%)')
        : '<span class="tiny">' + (h3.hhIncomplete ? 'counts incomplete' : 'not reported') + '</span>') + '</td>';
      baHhCells = ba2Cell + ba3Cell;
    } else {
      var h1 = (typeof hhOf === 'function') ? hhOf(b, 'BA1') : ((b.activities && b.activities['BA1']) || b || {});
      baHhCells = '<td class="num">' + (h1.hhListed
        ? link('households#' + bkey + '#BA1', '<span style="' + (h1.hhRate >= 0.7 ? 'color:var(--good-text)' : 'color:var(--warn-text)') + ';font-weight:700">' + pctText(h1.hhRate) + '</span><div class="tiny">' + n(h1.hhPresent) + '/' + n(h1.hhListed) + ' HH</div>', '1st BA Household Quorum: ' + n(h1.hhPresent) + ' of ' + n(h1.hhListed) + ' households present (' + pctText(h1.hhRate) + ' · target ≥70%)')
        : '<span class="tiny">' + (h1.hhIncomplete ? 'counts incomplete' : 'not reported') + '</span>') + '</td>';
    }

    return '<tr><td class="sticky">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">' +
          '<strong>' + esc(b.barangay) + '</strong>' +
          (b.stage2Prio && STATE.stage === 2 ? ' <span class="pill idle">Prio</span>' : '') +
        '</div>' +
        '<div style="margin-top:4px">' +
          '<div class="step-progress-mini" style="height:3px" title="' + pPct + '% stage activities completed">' +
            '<div class="step-progress-mini-bar" style="width:' + pPct + '%;' + (pRate >= 1 ? 'background:var(--good);' : '') + '"></div>' +
          '</div>' +
          '<div class="tiny" style="color:var(--text-dim);margin-top:2px;font-size:10px;display:flex;justify-content:space-between;align-items:center">' +
            '<span>' + pPct + '% complete</span>' +
            '<button type="button" class="link tiny" data-act="p-open" data-v="' + attr('attendees#' + bkey) + '" style="font-size:9.5px">Attendees ›</button>' +
          '</div>' +
        '</div>' +
      '</td>' +
      displayActs.map(function (a) {
        if (a.level === 'Municipal') {
          return '<td class="cell-muni-muted" title="' + attr(a.label + ' is conducted at the Municipal level') + '"><span class="tiny">—</span></td>';
        }
        var x = b.activities[a.code], pill = brgyStatusPill(x, a);
        return '<td>' + (x && x.status !== 'Not Encoded' && x.status !== 'N/A' ? link('attendees#' + bkey + '#' + a.code, pill, 'See the attendees') : pill) + '</td>';
      }).join('') +
      baHhCells +
      (cvOn ? '<td>' + link('volunteers#' + bkey + '#BREST', cvPill(b.volunteers, 'BREST'), 'See BResT') + '</td><td>' + link('volunteers#' + bkey + '#SFMSC', cvPill(b.volunteers, 'SFMSC'), 'See SFMSC') + '</td>' : '') +
      '<td>' + lackCell + '</td></tr>';
  }).join('');

  var parts = STATE.muni.split('|');
  var hasFilter = !!(STATE.brgySearch || (STATE.brgyFilter && STATE.brgyFilter !== 'all'));
  var curCol = (STATE.brgySort && STATE.brgySort.col) || 'brgy';
  var curDir = (STATE.brgySort && STATE.brgySort.dir) || 'asc';
  var th = function (col, label, num, sub, title, sticky, extraClass, term, tooltip) {
    return sortTh({ col: col, curCol: curCol, dir: curDir, label: label, num: num, sub: sub, title: title, sticky: sticky, act: 'bg-sort', extraClass: extraClass, term: term, tooltip: tooltip });
  };
  var muniControl = isMuni
    ? '<div class="static-val">' + icon('map-pin') + ' <span>Municipality: <strong>' + esc(parts[1] || '') + '</strong> (' + esc(parts[0] || '') + ')</span></div>'
    : '<label class="field"><span>Municipality</span><select data-act="muni-select">' + opts + '</select></label>';

  $('bg-body').innerHTML =
    renderDqaBreadcrumb() +
    renderBrgyTriageTray(summary, cvOn) +
    '<div class="card"><div class="card-head"><div><h2>Barangays · ' + esc(parts[1] || '') + ' <span class="muted" style="font-weight:400">(' + esc(parts[0] || '') + ')</span></h2>' +
      '<div class="muted">' + n(all.length) + ' monitored barangays. Click any cell to inspect the attendees, household counts, or volunteers.</div></div>' +
      '<button class="btn ghost btn-sm" data-act="csv-brgys">' + icon('download') + ' <span>CSV</span></button></div>' +
      stageSwitch() +
      '<div class="toolbar-row"><div class="filters" style="margin:0">' +
        muniControl +
        '<label class="field"><span>Search</span><input type="search" id="bg-search" value="' + attr(STATE.brgySearch) + '" placeholder="Barangay name…"></label>' +
        '<label class="field-toggle-inline" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;user-select:none;margin-top:auto;padding-bottom:8px" title="Toggle between completely hiding municipal activities and showing them grayed out">' +
          '<input type="checkbox" id="chk-hide-muni" data-act="toggle-hide-muni"' + (hideMuni ? ' checked' : '') + '> <span>Hide municipal activities</span>' +
        '</label>' +
        (hasFilter ? '<button type="button" class="btn ghost btn-sm" data-act="brgy-reset">' + icon('rotate-ccw') + ' <span>Reset filters</span></button>' : '') +
      '</div><div class="legend" style="margin:0">' +
        '<span class="pill good">✓ Attendees</span>' +
        '<span class="pill warn">Pending Sheet</span>' +
        '<span class="pill idle">○ Not in KCIS</span>' +
        (!hideMuni ? '<span class="pill idle" style="opacity:0.65">— Municipal (N/A)</span>' : '') +
      '</div></div>' +
      '<div class="toolbar-row" style="margin-top:0;margin-bottom:6px"><span class="tiny">Showing <strong>' + n(rows.length) + '</strong> of <strong>' + n(all.length) + '</strong> ' + (all.length === 1 ? 'barangay' : 'barangays') + '</span></div>' +
      quickChipsHtml +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        th('brgy', 'Barangay (' + rows.length + ')', false, 'Community', 'Monitored barangay name', true) +
        displayActs.map(function (a) {
          var isM = a.level === 'Municipal';
          var sub = 'Seq ' + esc(a.seq) + (isM ? ' · Muni' : '');
          return th('act_' + a.code, esc(a.code), false, sub, a.label + (isM ? ' (Municipal Level)' : ''), false, isM ? 'th-muni-muted' : '');
        }).join('') +
        (STATE.stage === 2 ? (
          th('k2_ba2', '2nd BA Rate', true, '2nd BA Quorum', '2nd Barangay Assembly Household Participation Rate (Threshold: ≥ 70% Quorum required)', false, '', 'k2_ba2', 'Barangay Assembly Household Participation Rate for 2nd Barangay Assembly (BA2). Target: ≥ 70%.') +
          th('k2_ba3', '3rd BA Rate', true, '3rd BA Quorum', '3rd Barangay Assembly Household Participation Rate (Threshold: ≥ 70% Quorum required)', false, '', 'k2_ba3', 'Barangay Assembly Household Participation Rate for 3rd Barangay Assembly (BA3). Target: ≥ 70%.')
        ) : (
          th('k2', 'BA HH Rate', true, '1st BA Quorum', 'Barangay Assembly Household Participation Rate (Threshold: ≥ 70% Quorum required)', false, '', 'k2', 'Barangay Assembly Household Participation Rate for 1st Barangay Assembly (BA1). Target: ≥ 70%.')
        )) +
        (cvOn ? th('BREST', 'BResT', false, 'Resilience Team', 'Barangay Resiliency Team volunteers', false, '', 'brest') + th('SFMSC', 'SFMSC', false, 'Feedback Comm.', 'Stakeholder & Feedback Mechanism Sub-Committee volunteers', false, '', 'sfmsc') : '') +
        th('lacking', 'Backlog', true, 'Missing Items', 'Unencoded activities conducted in field > 3 days ago or missing attendance sheets', false, '', 'lacking', 'Activity backlog: unencoded field activities conducted > 3 days ago or missing physical attendance sheets.') +
      '</tr></thead><tbody>' + (body || '<tr><td colspan="30" class="empty-state">No barangay matches your active filter or search criteria.</td></tr>') + '</tbody></table></div>' +
    '</div>';
  bindSearch('bg-search', function (v) { STATE.brgySearch = v; renderBrgys(); });
  refreshIcons($('bg-body'));
}


// ---- KPI Summary -------------------------------------------------------------

var KPI_STATE = { search: '', filter: 'all', sortCol: 'score', sortDir: 'desc' };

function renderKpiSummary() {
  var body = $('kpi-body');
  if (!body) return;
  if (!STATE.computed) {
    body.innerHTML = '<div class="card"><p class="muted">Load KCIS exports on the Import tab first to calculate KPIs.</p></div>';
    return;
  }

  var metrics = getScopedCompositeMetrics();
  var isMuni = metrics.isMuni, key = metrics.key, h = metrics.h;
  var scopeTitle = isMuni
    ? (h.municipality ? h.municipality + ' (' + h.province + ')' : 'Assigned Municipality')
    : (STATE.prov ? STATE.prov + ' Province' : 'Caraga Region (All Monitored LGUs)');

  var pipe = metrics.pipe, pipeTot = metrics.pipeTot, pipeRate = metrics.pipeRate;
  var k2 = metrics.k2, totalBrgys = metrics.totalBrgys, brgysInScope = metrics.brgysInScope;
  var brestCompliant = metrics.brestCompliant, brestRate = metrics.brestRate;
  var munisList = metrics.munisList, regionalMrestFormed = metrics.regionalMrestFormed, compositeIndex = metrics.compositeIndex;

  var P = people(), inScope = pScopeTest();
  var volsInScope = P.volunteers.filter(inScope);
  var totVols = volsInScope.length;
  var womenVols = volsInScope.filter(function (v) { return v.sex === 'female'; }).length;
  var margVols = volsInScope.filter(function (v) { return v.sex === 'female' || v.ip || v.pwd; }).length;
  var chairVols = volsInScope.filter(function (v) { return v.chair; }).length;

  var brestIssues = brgysInScope.filter(function (b) { return b.volunteers && b.volunteers.BREST && b.volunteers.BREST.status === 'Needs fixing'; }).length;
  var mrestList = (P.mrest || []).filter(inScope);
  var mrestComp = isMuni ? mrestStatusOf(h.province || '', h.municipality || '') : null;
  var eoTag = isMuni ? ((typeof vfTag === 'function') ? vfTag('mrest|' + (h.province || '') + '|' + (h.municipality || '') + '||MREST') : null) : null;
  var eoVerified = eoTag && eoTag.rows && Object.keys(eoTag.rows).length > 0;

  // Executive Header Hero
  var heroHtml =
    '<div class="kpi-summary-hero">' +
      '<div>' +
        '<h2 style="margin:0 0 6px;font-size:22px">Executive KPI Scorecard</h2>' +
        '<div class="muted">Strategic indicators, quorum compliance &amp; field health for <strong>' + esc(scopeTitle) + '</strong> · Stage ' + STATE.stage + '</div>' +
      '</div>' +
      '<div class="row-actions" style="margin:0">' +
        '<button class="btn primary btn-sm" data-act="kpi-export">' + icon('download') + ' <span>Export Executive Scorecard CSV</span></button>' +
      '</div>' +
    '</div>';

  // 6 Tier 1 Strategic KPI Mini-Cards
  var cardsHtml =
    '<div class="kpi-section-title">' + icon('gauge') + ' <span>Tier 1 Strategic Performance Index</span></div>' +
    '<div class="kpi-mini-grid">' +
      '<div class="kpi-mini-card ' + (pipeRate >= 0.8 ? 'accent-good' : (pipeRate >= 0.5 ? 'accent-warn' : 'accent-bad')) + '" data-tooltip="Percentage of expected Stage ' + STATE.stage + ' activities encoded with verified physical attendance sheet">' +
        '<div class="kpi-mini-label">Pipeline Completion (Attn Sheet)</div>' +
        '<div class="kpi-mini-val">' + pctText(pipeRate) + '</div>' +
        '<div class="kpi-mini-sub">' + n(pipeTot.c) + ' of ' + n(pipeTot.e) + ' Stage ' + STATE.stage + ' target activities</div>' +
      '</div>' +
      (function () {
        if (STATE.stage === 2) {
          var k2_2 = metrics.k2_ba2 || scopedK2('BA2');
          var k2_3 = metrics.k2_ba3 || scopedK2('BA3');
          return '<div class="kpi-mini-card ' + (k2_2.rate !== null && k2_2.rate >= 0.7 ? 'accent-good' : (k2_2.rate !== null ? 'accent-warn' : 'accent-idle')) + '" data-term="k2_ba2">' +
            '<div class="kpi-mini-label">2nd BA Quorum (≥70% Target)</div>' +
            '<div class="kpi-mini-val">' + (k2_2.rate !== null ? pctText(k2_2.rate) : '—') + '</div>' +
            '<div class="kpi-mini-sub">' + (k2_2.listed ? n(k2_2.present) + ' of ' + n(k2_2.listed) + ' households present (' + n(k2_2.met) + ' brgys met ≥70%)' : 'Load 2nd BA Household Participation export') + '</div>' +
          '</div>' +
          '<div class="kpi-mini-card ' + (k2_3.rate !== null && k2_3.rate >= 0.7 ? 'accent-good' : (k2_3.rate !== null ? 'accent-warn' : 'accent-idle')) + '" data-term="k2_ba3">' +
            '<div class="kpi-mini-label">3rd BA Quorum (≥70% Target)</div>' +
            '<div class="kpi-mini-val">' + (k2_3.rate !== null ? pctText(k2_3.rate) : '—') + '</div>' +
            '<div class="kpi-mini-sub">' + (k2_3.listed ? n(k2_3.present) + ' of ' + n(k2_3.listed) + ' households present (' + n(k2_3.met) + ' brgys met ≥70%)' : 'Load 3rd BA Household Participation export') + '</div>' +
          '</div>';
        }
        var kpiBaLabel = '1st BA';
        return '<div class="kpi-mini-card ' + (k2.rate !== null && k2.rate >= 0.7 ? 'accent-good' : (k2.rate !== null ? 'accent-warn' : 'accent-idle')) + '" data-term="k2">' +
          '<div class="kpi-mini-label">' + kpiBaLabel + ' Quorum (≥70% Target)</div>' +
          '<div class="kpi-mini-val">' + (k2.rate !== null ? pctText(k2.rate) : '—') + '</div>' +
          '<div class="kpi-mini-sub">' + (k2.listed ? n(k2.present) + ' of ' + n(k2.listed) + ' households present (' + n(k2.met) + ' brgys met ≥70%)' : 'Load ' + kpiBaLabel + ' Household Participation export') + '</div>' +
        '</div>';
      })() +
      '<div class="kpi-mini-card accent-good" data-term="femaleratio">' +
        '<div class="kpi-mini-label">Volunteer Inclusion &amp; Leadership</div>' +
        '<div class="kpi-mini-val">' + (totVols ? pctText(pctOf(womenVols, totVols)) : '—') + '</div>' +
        '<div class="kpi-mini-sub">' + n(womenVols) + ' women (' + pctText(pctOf(margVols, totVols || 1)) + ' marginalized) · ' + n(chairVols) + ' chairs</div>' +
      '</div>' +
      '<div class="kpi-mini-card ' + (brestCompliant === totalBrgys && totalBrgys > 0 ? 'accent-good' : (brestRate >= 0.5 ? 'accent-warn' : 'accent-bad')) + '" data-term="brest">' +
        '<div class="kpi-mini-label">BResT Formation Compliance</div>' +
        '<div class="kpi-mini-val">' + pctText(brestRate) + '</div>' +
        '<div class="kpi-mini-sub">' + n(brestCompliant) + ' of ' + n(totalBrgys) + ' teams compliant with active lead</div>' +
      '</div>' +
      '<div class="kpi-mini-card ' + (isMuni ? (mrestComp.status === 'complete' ? (eoVerified ? 'accent-good' : 'accent-warn') : (mrestComp.status === 'incomplete' ? 'accent-warn' : 'accent-bad')) : (regionalMrestFormed === munisList.length ? 'accent-good' : 'accent-warn')) + '" data-term="mrest">' +
        '<div class="kpi-mini-label">MResT Institutionalization</div>' +
        '<div class="kpi-mini-val">' + (isMuni ? (mrestComp.status === 'complete' ? (eoVerified ? '✓ Formed · EO Verified' : '✓ Formed') : (mrestComp.status === 'incomplete' ? '⚠ Incomplete' : '○ Pending')) : n(regionalMrestFormed) + ' / ' + n(munisList.length)) + '</div>' +
        '<div class="kpi-mini-sub">' + (isMuni ? (mrestComp.status === 'complete' ? (eoVerified ? 'Matched against Mayor\'s EO' : 'Pending EO precision tag') : (mrestComp.status === 'incomplete' ? 'Missing: ' + esc(mrestComp.gaps.join('; ')) : 'No MResT committee in KCIS')) : 'LGUs with MResT formed per composition') + '</div>' +
      '</div>' +
      '<div class="kpi-mini-card ' + (compositeIndex >= 80 ? 'accent-good' : (compositeIndex >= 60 ? 'accent-warn' : 'accent-bad')) + '" data-tooltip="Weighted composite performance index across Pipeline completion, K2 Quorum, BResT formation, and MResT institutionalization" data-tooltip-title="Overall Composite Readiness" data-tooltip-badge="Strategic Metric">' +
        '<div class="kpi-mini-label">Overall Composite Readiness</div>' +
        '<div class="kpi-mini-val" style="color:' + (compositeIndex >= 80 ? 'var(--good-text)' : (compositeIndex >= 60 ? 'var(--warn-text)' : 'var(--bad-text)')) + '">' + compositeIndex + '%</div>' +
        '<div class="kpi-mini-sub">' + (compositeIndex >= 80 ? 'Optimal implementation readiness' : (compositeIndex >= 60 ? 'Moderate compliance; address gaps' : 'Requires high priority field support')) + '</div>' +
      '</div>' +
    '</div>';

  // Section 2: Milestone Pipeline Heatmap Table
  var milestoneRows = pipe.map(function (p) {
    var prate = p.expected > 0 ? (p.complete / p.expected) : 0;
    return '<tr>' +
      '<td class="num"><strong>' + esc(p.a.seq) + '</strong></td>' +
      '<td><strong>' + esc(p.a.label) + '</strong><div class="tiny">' + esc(p.a.level) + ' level · field: ' + esc(p.a.field) + '</div></td>' +
      '<td class="num">' + n(p.expected) + '</td>' +
      '<td class="num"><strong style="color:var(--good-text)">' + n(p.complete) + '</strong></td>' +
      '<td class="num">' + (p.noAttendees ? '<strong style="color:var(--warn-text)">' + n(p.noAttendees) + '</strong>' : '0') + '</td>' +
      '<td class="num">' + (p.backlog ? '<strong style="color:var(--bad-text)">' + n(p.backlog) + '</strong>' : '0') + '</td>' +
      '<td style="min-width:180px"><div class="cell-pct"><span><strong>' + pctText(prate) + '</strong></span>' + progressBar(p.complete, p.noAttendees, p.expected) + '</div></td>' +
    '</tr>';
  }).join('');

  var pipelineTableHtml =
    '<div class="card" style="margin-bottom:20px">' +
      '<div class="card-head"><div><h3>Stage ' + STATE.stage + ' Milestone Pipeline Execution</h3><div class="tiny">Detailed delivery progress with signed attendance sheets (attn sheet) per activity</div></div></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        '<th class="num">Seq</th><th>Activity</th><th class="num">Target</th><th class="num">With Attn Sheet</th><th class="num">No Sheet</th><th class="num">Lacking</th><th>Progress Rate</th>' +
      '</tr></thead><tbody>' + milestoneRows + '</tbody></table></div>' +
    '</div>';

  // Section 3: Performance Scorecard Table (Barangay level for PEA/MDM, Municipal level for RPMO)
  var q = normSearch((KPI_STATE.search || '').trim());
  var tableHtml = '';

  if (isMuni) {
    // ---- BARANGAY SCORECARD (PEA / MDM) ----
    var brgyScoreList = brgysInScope.map(function (b) {
      var bActs = Object.keys(b.activities).map(function (k) { return b.activities[k]; });
      var bExp = bActs.filter(function (x) { return !x.notApplicable && x.status !== 'N/A'; }).length;
      var bComp = bActs.filter(function (x) { return x.status === 'Complete'; }).length;
      var bNoSheet = bActs.filter(function (x) { return x.status === 'No Attendees'; }).length;
      var pScore = bExp > 0 ? (bComp / bExp) * 100 : 100;
      var curAsm = STATE.stage === 2 ? 'BA2' : 'BA1';
      var hCur = (typeof hhOf === 'function') ? hhOf(b, curAsm) : ((b.activities && b.activities[curAsm]) || b || {});
      var k2Score = hCur.hhListed > 0 ? Math.min(100, (hCur.hhPresent / hCur.hhListed) / 0.7 * 100) : 0;
      var brstObj = b.volunteers && b.volunteers.BREST;
      var bScore = brstObj ? (brstObj.status === 'Encoded' ? 100 : (brstObj.status === 'Needs fixing' ? 50 : 0)) : 0;
      var compScore = Math.round(0.4 * pScore + 0.3 * k2Score + 0.3 * bScore);
      return {
        b: b,
        brgy: b.barangay,
        expected: bExp,
        complete: bComp,
        noSheet: bNoSheet,
        pipeRate: bExp > 0 ? bComp / bExp : 0,
        hhListed: hCur.hhListed || 0,
        hhPresent: hCur.hhPresent || 0,
        hhRate: hCur.hhListed ? hCur.hhRate : null,
        brestStatus: brstObj ? brstObj.status : 'Not encoded',
        owed: (b.owed || 0) + ((b.todo && b.todo.length) || 0),
        score: compScore
      };
    });

    var baseBrgys = brgyScoreList.filter(function (item) {
      if (q && normSearch(item.brgy).indexOf(q) === -1) return false;
      return true;
    });

    var cBAll = baseBrgys.length;
    var cBHigh = baseBrgys.filter(function (x) { return x.score >= 80; }).length;
    var cBMod = baseBrgys.filter(function (x) { return x.score >= 50 && x.score < 80; }).length;
    var cBLow = baseBrgys.filter(function (x) { return x.score < 50; }).length;

    var filterCards = [
      ['all', 'All Barangays', cBAll, ''],
      ['high', 'High Readiness (≥80%)', cBHigh, 'fc-good'],
      ['mod', 'Moderate (50-79%)', cBMod, 'fc-warn'],
      ['low', 'Needs Support (<50%)', cBLow, 'fc-bad']
    ].map(function (x) {
      return '<button type="button" class="filter-card' + (x[3] ? ' ' + x[3] : '') + (KPI_STATE.filter === x[0] ? ' active' : '') + '" data-act="kpi-filter" data-v="' + x[0] + '">' +
        '<span class="fc-label">' + esc(x[1]) + '</span>' +
        '<span class="fc-count">' + n(x[2]) + '</span>' +
      '</button>';
    }).join('');

    var filteredList = baseBrgys.filter(function (x) {
      if (KPI_STATE.filter === 'high' && x.score < 80) return false;
      if (KPI_STATE.filter === 'mod' && (x.score < 50 || x.score >= 80)) return false;
      if (KPI_STATE.filter === 'low' && x.score >= 50) return false;
      return true;
    });

    var curCol = KPI_STATE.sortCol || 'score';
    var curDir = KPI_STATE.sortDir || 'desc';
    var bExtractors = {
      brgy: function (x) { return x.brgy; },
      pipe: function (x) { return x.pipeRate; },
      nosheet: function (x) { return x.noSheet; },
      k2: function (x) { return x.hhRate === null ? -1 : x.hhRate; },
      brest: function (x) { return x.brestStatus === 'Encoded' ? 2 : (x.brestStatus === 'Needs fixing' ? 1 : 0); },
      lacking: function (x) { return x.owed; },
      score: function (x) { return x.score; }
    };
    var sortedList = tblSort(filteredList, curCol, curDir, bExtractors);

    var th = function (col, label, num) {
      return sortTh({ col: col, curCol: curCol, dir: curDir, label: label, num: num, act: 'kpi-sort' });
    };

    var bRowsHtml = sortedList.map(function (x) {
      var bkey = x.b.province + '|' + x.b.municipality + '|' + x.b.barangay;
      var k2Pill = x.hhListed === 0
        ? '<span class="tiny">—</span>'
        : (x.hhRate >= 0.7 ? '<span class="pill good">✓ ' + pctText(x.hhRate) + '</span>' : '<span class="pill warn">⚠ ' + pctText(x.hhRate) + '</span>');
      var bPill = x.brestStatus === 'Encoded'
        ? '<span class="pill good">✓ Compliant</span>'
        : (x.brestStatus === 'Needs fixing' ? '<span class="pill warn">⚠ Needs Fixing</span>' : '<span class="pill bad">○ Not Encoded</span>');
      var scoreBadge = x.score >= 80
        ? '<span class="pill good"><strong>' + x.score + '%</strong> High</span>'
        : (x.score >= 50 ? '<span class="pill warn"><strong>' + x.score + '%</strong> Moderate</span>' : '<span class="pill bad"><strong>' + x.score + '%</strong> Needs Support</span>');

      return '<tr>' +
        '<td><strong>' + esc(x.brgy) + '</strong></td>' +
        '<td><div class="cell-pct"><span>' + pctText(x.pipeRate) + ' <span class="tiny">(' + x.complete + '/' + x.expected + ')</span></span>' + progressBar(x.complete, x.noSheet, x.expected) + '</div></td>' +
        '<td class="num">' + (x.noSheet ? '<strong style="color:var(--warn-text)">' + x.noSheet + '</strong>' : '0') + '</td>' +
        '<td class="num">' + k2Pill + '</td>' +
        '<td>' + bPill + '</td>' +
        '<td class="num">' + (x.owed ? '<strong style="color:var(--bad-text)">' + x.owed + '</strong>' : '0') + '</td>' +
        '<td>' + scoreBadge + '</td>' +
        '<td><button type="button" class="btn ghost btn-sm" data-act="p-open" data-v="' + attr('attendees#' + bkey) + '">' + icon('search') + ' <span>Inspect</span></button></td>' +
      '</tr>';
    }).join('');

    tableHtml =
      '<div class="card">' +
        '<div class="card-head"><div><h3>Barangay Performance &amp; Readiness Scorecard</h3><div class="tiny">Composite evaluation combining Activity Attendance Sheets, K2 Quorum (≥70%), and BResT formation</div></div></div>' +
        '<div class="toolbar-row"><div class="filters" style="margin:0;flex:1">' +
          '<label class="field" style="flex:1"><span>Search Barangay</span><input type="search" id="kpi-search" value="' + attr(KPI_STATE.search) + '" placeholder="Barangay name…"></label>' +
          (KPI_STATE.search || KPI_STATE.filter !== 'all' ? '<button type="button" class="btn ghost btn-sm" data-act="kpi-reset">' + icon('rotate-ccw') + ' <span>Reset</span></button>' : '') +
        '</div><span class="tiny">Showing <strong>' + n(sortedList.length) + '</strong> of <strong>' + n(brgyScoreList.length) + '</strong></span></div>' +
        '<div class="filter-cards" style="margin:8px 0 12px">' + filterCards + '</div>' +
        '<div class="table-wrap"><table class="grid"><thead><tr>' +
          th('brgy', 'Barangay', false, 'Community') +
          th('pipe', 'Pipeline Progress', false, 'Activities') +
          th('nosheet', 'Missing Sheet', true, 'Pending') +
          th('k2', 'BA HH Rate', true, '≥70% Target') +
          th('brest', 'BResT Status', false, 'Resilience') +
          th('lacking', 'Backlog', true, 'Missing') +
          th('score', 'Composite Score', true, 'Index') +
          '<th>Action</th>' +
        '</tr></thead><tbody>' + (bRowsHtml || '<tr><td colspan="8" class="empty-state">No barangays match these filters.</td></tr>') + '</tbody></table></div>' +
      '</div>';
  } else {
    // ---- REGIONAL MUNICIPAL LEAGUE TABLE (RPMO) ----
    var mRows = overviewRows();
    var muniScoreList = mRows.map(function (r) {
      var mKey = r.province + '|' + r.municipality;
      var mBrgys = (SNAP.barangayRows || []).filter(function (b) { return b.province + '|' + b.municipality === mKey; });
      var totExp = 0, totComp = 0, totOwed = 0;
      mBrgys.forEach(function (b) {
        Object.keys(b.activities).forEach(function (k) {
          var act = b.activities[k];
          if (!act.notApplicable && act.status !== 'N/A') {
            totExp++;
            if (act.status === 'Complete') totComp++;
          }
        });
        totOwed += (b.owed || 0) + ((b.todo && b.todo.length) || 0);
      });
      var pScore = totExp > 0 ? (totComp / totExp) * 100 : 100;
      var hProp = STATE.stage === 2 ? 'households_ba2' : 'households';
      var h = (r && r[hProp]) || (r && r.households) || {};
      var k2Score = h.listed > 0 ? Math.min(100, (h.present / h.listed) / 0.7 * 100) : 0;
      var k2Rate = h.listed ? (h.present / h.listed) : null;
      var brestEnc = mBrgys.filter(function (b) { return b.volunteers && b.volunteers.BREST && b.volunteers.BREST.status === 'Encoded'; }).length;
      var bRate = mBrgys.length > 0 ? (brestEnc / mBrgys.length) : 0;
      var mRecKey = 'mrest|' + r.province + '|' + r.municipality + '||MREST';
      var mTag = (typeof vfTag === 'function') ? vfTag(mRecKey) : null;
      var mVer = mTag && mTag.rows && Object.keys(mTag.rows).length > 0;
      var mComp = mrestStatusOf(r.province, r.municipality);
      var mScore = mComp.status === 'complete' ? (mVer ? 100 : 75) : (mComp.status === 'incomplete' ? 25 : 0);

      var compScore = Math.round(0.35 * pScore + 0.25 * k2Score + 0.25 * (bRate * 100) + 0.15 * mScore);
      return {
        r: r,
        muni: r.municipality,
        prov: r.province,
        brgysCount: mBrgys.length,
        pipeRate: totExp > 0 ? totComp / totExp : 0,
        pipeComp: totComp,
        pipeExp: totExp,
        k2Rate: k2Rate,
        brestCompliant: brestEnc,
        brestRate: bRate,
        mrestComp: mComp,
        mrestVer: mVer,
        owed: totOwed,
        score: compScore
      };
    });

    var baseMunis = muniScoreList.filter(function (x) {
      if (q && normSearch(x.muni + ' ' + x.prov).indexOf(q) === -1) return false;
      return true;
    });

    var cMAll = baseMunis.length;
    var cMHigh = baseMunis.filter(function (x) { return x.score >= 80; }).length;
    var cMMod = baseMunis.filter(function (x) { return x.score >= 50 && x.score < 80; }).length;
    var cMLow = baseMunis.filter(function (x) { return x.score < 50; }).length;

    var filterCards2 = [
      ['all', 'All Municipalities', cMAll, ''],
      ['high', 'Top Performers (≥80%)', cMHigh, 'fc-good'],
      ['mod', 'Moderate (50-79%)', cMMod, 'fc-warn'],
      ['low', 'Needs Support (<50%)', cMLow, 'fc-bad']
    ].map(function (x) {
      return '<button type="button" class="filter-card' + (x[3] ? ' ' + x[3] : '') + (KPI_STATE.filter === x[0] ? ' active' : '') + '" data-act="kpi-filter" data-v="' + x[0] + '">' +
        '<span class="fc-label">' + esc(x[1]) + '</span>' +
        '<span class="fc-count">' + n(x[2]) + '</span>' +
      '</button>';
    }).join('');

    var filteredMunisList = baseMunis.filter(function (x) {
      if (KPI_STATE.filter === 'high' && x.score < 80) return false;
      if (KPI_STATE.filter === 'mod' && (x.score < 50 || x.score >= 80)) return false;
      if (KPI_STATE.filter === 'low' && x.score >= 50) return false;
      return true;
    });

    var curCol2 = KPI_STATE.sortCol || 'score';
    var curDir2 = KPI_STATE.sortDir || 'desc';
    var mExtractors = {
      muni: function (x) { return x.muni; },
      brgys: function (x) { return x.brgysCount; },
      pipe: function (x) { return x.pipeRate; },
      k2: function (x) { return x.k2Rate === null ? -1 : x.k2Rate; },
      brest: function (x) { return x.brestRate; },
      mrest: function (x) { return { complete: 2, incomplete: 1, none: 0 }[x.mrestComp.status] + (x.mrestVer ? 0.5 : 0); },
      lacking: function (x) { return x.owed; },
      score: function (x) { return x.score; }
    };
    var sortedMunisList = tblSort(filteredMunisList, curCol2, curDir2, mExtractors);

    var th2 = function (col, label, num) {
      return sortTh({ col: col, curCol: curCol2, dir: curDir2, label: label, num: num, act: 'kpi-sort' });
    };

    var mRowsHtml = sortedMunisList.map(function (x) {
      var mKey = x.prov + '|' + x.muni;
      var k2Pill = x.k2Rate === null
        ? '<span class="tiny">—</span>'
        : (x.k2Rate >= 0.7 ? '<span class="pill good">✓ ' + pctText(x.k2Rate) + '</span>' : '<span class="pill warn">⚠ ' + pctText(x.k2Rate) + '</span>');
      var mrestPill = mrestStatusPill(x.mrestComp) + (x.mrestVer ? ' <span class="pill good">✓ EO Verified</span>' : '');
      var scoreBadge = x.score >= 80
        ? '<span class="pill good"><strong>' + x.score + '%</strong> High</span>'
        : (x.score >= 50 ? '<span class="pill warn"><strong>' + x.score + '%</strong> Moderate</span>' : '<span class="pill bad"><strong>' + x.score + '%</strong> Critical</span>');

      return '<tr>' +
        '<td><strong>' + esc(x.muni) + '</strong> <span class="tiny muted">' + esc(x.prov) + '</span></td>' +
        '<td class="num">' + n(x.brgysCount) + '</td>' +
        '<td><div class="cell-pct"><span>' + pctText(x.pipeRate) + '</span>' + progressBar(x.pipeComp, 0, x.pipeExp) + '</div></td>' +
        '<td class="num">' + k2Pill + '</td>' +
        '<td class="num">' + pctText(x.brestRate) + ' <span class="tiny">(' + x.brestCompliant + '/' + x.brgysCount + ')</span></td>' +
        '<td>' + mrestPill + '</td>' +
        '<td class="num">' + (x.owed ? '<strong style="color:var(--bad-text)">' + x.owed + '</strong>' : '0') + '</td>' +
        '<td>' + scoreBadge + '</td>' +
        '<td><button type="button" class="btn ghost btn-sm" data-act="muni" data-v="' + attr(mKey) + '">' + icon('map-pin') + ' <span>Barangays</span></button></td>' +
      '</tr>';
    }).join('');

    tableHtml =
      '<div class="card">' +
        '<div class="card-head"><div><h3>Regional Municipal Performance League Table</h3><div class="tiny">Cross-municipality composite scoring for Caraga Region oversight</div></div></div>' +
        '<div class="toolbar-row"><div class="filters" style="margin:0;flex:1">' +
          '<label class="field" style="flex:1"><span>Search Municipality / Province</span><input type="search" id="kpi-search" value="' + attr(KPI_STATE.search) + '" placeholder="Search…"></label>' +
          (KPI_STATE.search || KPI_STATE.filter !== 'all' ? '<button type="button" class="btn ghost btn-sm" data-act="kpi-reset">' + icon('rotate-ccw') + ' <span>Reset</span></button>' : '') +
        '</div><span class="tiny">Showing <strong>' + n(sortedMunisList.length) + '</strong> of <strong>' + n(muniScoreList.length) + '</strong></span></div>' +
        '<div class="filter-cards" style="margin:8px 0 12px">' + filterCards2 + '</div>' +
        '<div class="table-wrap"><table class="grid"><thead><tr>' +
          th2('muni', 'Municipality', false, 'LGU Scope') +
          th2('brgys', 'Brgys', true, 'Count') +
          th2('pipe', 'Pipeline Completion', false, 'Activities') +
          th2('k2', 'BA HH Rate', true, '≥70% Target') +
          th2('brest', 'BResT Rate', true, 'Resilience') +
          th2('mrest', 'MResT Status', false, 'Executive') +
          th2('lacking', 'Backlog', true, 'Missing') +
          th2('score', 'Composite Score', true, 'Index') +
          '<th>Action</th>' +
        '</tr></thead><tbody>' + (mRowsHtml || '<tr><td colspan="9" class="empty-state">No municipalities match these filters.</td></tr>') + '</tbody></table></div>' +
      '</div>';
  }

  body.innerHTML =
    coverageBanner() +
    heroHtml +
    stageSwitch() + (isMuni ? '' : provChips()) +
    cardsHtml +
    pipelineTableHtml +
    tableHtml;

  bindSearch('kpi-search', function (v) { KPI_STATE.search = v; renderKpiSummary(); });
  refreshIcons(body);
}

function exportKpiSummaryCsv() {
  var isMuni = isMunicipalUser(), key = homeKey();
  var P = people();
  var h = home() || {};

  if (isMuni) {
    var brgys = (SNAP.barangayRows || []).filter(function (b) { return b.province + '|' + b.municipality === key; });
    var head = ['Barangay', 'Municipality', 'Province', 'Activities Expected', 'With Attn Sheet', 'Missing Attn Sheet', 'Pipeline Completion %', 'K2 HH in Barangay', 'K2 HH Represented', 'K2 Quorum %', 'BResT Status', 'Lacking Records', 'Composite Score %'];
    var rows = brgys.map(function (b) {
      var bActs = Object.keys(b.activities).map(function (k) { return b.activities[k]; });
      var bExp = bActs.filter(function (x) { return !x.notApplicable && x.status !== 'N/A'; }).length;
      var bComp = bActs.filter(function (x) { return x.status === 'Complete'; }).length;
      var bNoSheet = bActs.filter(function (x) { return x.status === 'No Attendees'; }).length;
      var pScore = bExp > 0 ? (bComp / bExp) * 100 : 100;
      var k2Score = b.hhListed > 0 ? Math.min(100, (b.hhPresent / b.hhListed) / 0.7 * 100) : 0;
      var brstObj = b.volunteers && b.volunteers.BREST;
      var bScore = brstObj ? (brstObj.status === 'Encoded' ? 100 : (brstObj.status === 'Needs fixing' ? 50 : 0)) : 0;
      var compScore = Math.round(0.4 * pScore + 0.3 * k2Score + 0.3 * bScore);
      var owed = (b.owed || 0) + ((b.todo && b.todo.length) || 0);

      return [
        b.barangay, b.municipality, b.province,
        bExp, bComp, bNoSheet, (bExp > 0 ? (bComp / bExp * 100).toFixed(1) + '%' : '100%'),
        b.hhListed || 0, b.hhPresent || 0, (b.hhListed ? (b.hhRate * 100).toFixed(1) + '%' : 'N/A'),
        brstObj ? brstObj.status : 'Not encoded',
        owed, compScore + '%'
      ];
    });
    downloadCsv('PCRP_KPI_Summary_' + (h.municipality || 'muni').replace(/[^A-Za-z0-9]+/g, '_') + '_' + stamp() + '.csv', csvOf([head].concat(rows)));
  } else {
    var mRows = overviewRows();
    var head = ['Municipality', 'Province', 'Monitored Barangays', 'Pipeline Target', 'With Attn Sheet', 'Pipeline Completion %', 'K2 HH in Barangay', 'K2 HH Represented', 'K2 Quorum %', 'BResT Compliant', 'BResT Rate %', 'MResT Status', 'Lacking Records', 'Composite Score %'];
    var rows = mRows.map(function (r) {
      var mKey = r.province + '|' + r.municipality;
      var mBrgys = (SNAP.barangayRows || []).filter(function (b) { return b.province + '|' + b.municipality === mKey; });
      var totExp = 0, totComp = 0, totOwed = 0;
      mBrgys.forEach(function (b) {
        Object.keys(b.activities).forEach(function (k) {
          var act = b.activities[k];
          if (!act.notApplicable && act.status !== 'N/A') {
            totExp++;
            if (act.status === 'Complete') totComp++;
          }
        });
        totOwed += (b.owed || 0) + ((b.todo && b.todo.length) || 0);
      });
      var pScore = totExp > 0 ? (totComp / totExp) * 100 : 100;
      var h = r.households || {};
      var k2Score = h.listed > 0 ? Math.min(100, (h.present / h.listed) / 0.7 * 100) : 0;
      var k2Rate = h.listed ? (h.present / h.listed) : null;
      var brestEnc = mBrgys.filter(function (b) { return b.volunteers && b.volunteers.BREST && b.volunteers.BREST.status === 'Encoded'; }).length;
      var bRate = mBrgys.length > 0 ? (brestEnc / mBrgys.length) : 0;
      var mRecKey = 'mrest|' + r.province + '|' + r.municipality + '||MREST';
      var mTag = (typeof vfTag === 'function') ? vfTag(mRecKey) : null;
      var mVer = mTag && mTag.rows && Object.keys(mTag.rows).length > 0;
      var mComp = mrestStatusOf(r.province, r.municipality);
      var mScore = mComp.status === 'complete' ? (mVer ? 100 : 75) : (mComp.status === 'incomplete' ? 25 : 0);
      var compScore = Math.round(0.35 * pScore + 0.25 * k2Score + 0.25 * (bRate * 100) + 0.15 * mScore);

      return [
        r.municipality, r.province, mBrgys.length,
        totExp, totComp, (totExp > 0 ? (totComp / totExp * 100).toFixed(1) + '%' : '100%'),
        h.listed || 0, h.present || 0, (k2Rate !== null ? (k2Rate * 100).toFixed(1) + '%' : 'N/A'),
        brestEnc, (bRate * 100).toFixed(1) + '%',
        ({ complete: 'Formed', incomplete: 'Incomplete (missing: ' + mComp.gaps.join('; ') + ')', none: 'Not in KCIS' }[mComp.status] + (mVer ? ' · EO Verified' : '')),
        totOwed, compScore + '%'
      ];
    });
    downloadCsv('PCRP_Regional_KPI_Summary_' + stamp() + '.csv', csvOf([head].concat(rows)));
  }
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
            '<div class="muted">The date the exports were pulled from KCIS. A record with no attendance sheet counts as lacking from the 3rd day after the activity, judged on this date.</div>' +
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
  return [['Seq', 'Activity', 'Level', 'Field conduct', 'Target', 'With attendance sheet', 'Recorded without sheet', 'Not encoded', 'Lacking', '% with sheet']]
    .concat(scopedPipeline().map(function (p) {
      return [p.a.seq, p.a.label, p.a.level, p.a.field, p.expected, p.complete, p.noAttendees, p.notEncoded, p.backlog, p.expected ? Math.round(p.complete / p.expected * 1000) / 10 : ''];
    }));
}
function muniTable(allStages) {
  var acts = allStages ? S.overview.activities : stageActs();
  var cvOn = S.overview.volunteers && S.overview.volunteers.imported;
  var head = ['Province', 'Municipality'];
  acts.forEach(function (a) { head.push(a.code + ' with sheet', a.code + ' target', a.code + ' no sheet', a.code + ' lacking'); });
  head.push('K2 HH in barangay', 'K2 HH represented', 'K2 %');
  if (cvOn) head.push('BResT encoded', 'BResT target', 'SFMSC encoded', 'SFMSC to fix', 'SFMSC target');
  // the export compares the chosen municipality with the rest of its province
  var h = home(), exportRows = S.matrix.rows.filter(function (r) { return !h || h.region || r.province === h.province; });
  var rows = (allStages ? exportRows : muniTableData()).map(function (r) {
    var line = [r.province, r.municipality];
    acts.forEach(function (a) { var c = r.cells[a.code] || {}; line.push(c.complete || 0, c.expected || 0, c.noAttendees || 0, c.backlog || 0); });
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
    .concat(['K2 HH in barangay', 'K2 HH represented', 'K2 %', '4Ps HH represented', 'IP HH represented', 'SLP HH represented',
             'Individuals female', 'Individuals male', 'Individuals total']).concat(cvOn ? ['BResT', 'BResT volunteers', 'SFMSC', 'SFMSC volunteers', 'SFMSC to fix'] : []).concat(['Lacking']);
  var st = function (x) { return !x || x.notApplicable || x.status === 'N/A' ? 'N/A' : x.status === 'Complete' ? 'With sheet (' + x.attendees + ')' : x.status === 'No Attendees' ? 'No sheet' : 'Not encoded'; };
  return [head].concat(rows.map(function (b) {
    var line = [b.province, b.municipality, b.barangay, b.psgcBrgy || ''].concat(acts.map(function (a) { return st(b.activities[a.code]); }))
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
    ['Participants file', LOADED.participants ? LOADED.participants.file : ''],
    ['Household participation file', LOADED.households ? LOADED.households.file : ''],
    ['Volunteer file', LOADED.volunteers ? LOADED.volunteers.file : ''], []];
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
  else if (act === 'muni-reset') { STATE.prov = ''; STATE.muniSearch = ''; STATE.muniFilter = 'all'; renderMunis(); updateTabBadges(); }
  else if (act === 'brgy-filter') { STATE.brgyFilter = v; renderBrgys(); }
  else if (act === 'brgy-reset') { STATE.brgyFilter = 'all'; STATE.brgySearch = ''; renderBrgys(); }
  else if (act === 'kpi-brgy') { STATE.muni = homeKey() || STATE.muni; STATE.brgyFilter = v || 'all'; go('brgys'); }
  else if (act === 'health-open') {
    S.healthOpen = {}; S.healthOpen[v] = true;
    S.healthScope = homeKey() ? 'm:' + homeKey() : (STATE.prov ? 'p:' + STATE.prov : '');
    S.healthView = 'check'; S.healthSeverity = 'all'; go('health');
  }
  else if (act === 'go-brgys') { STATE.muni = homeKey() || STATE.muni; STATE.brgyFilter = 'all'; go('brgys'); }
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
    if (targetTab === 'attendees') {
      if (typeof ATT_STATE !== 'undefined') { ATT_STATE.brgy = bkey; ATT_STATE.act = sub; }
      go('attendees');
    } else if (targetTab === 'households') {
      if (typeof HH_STATE !== 'undefined') { HH_STATE.brgy = bkey; HH_STATE.quorum = 'all'; if (sub) HH_STATE.asm = sub; }
      go('households');
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

    if (checkId === 'quorum' || checkId === 'hhcounts') {
      if (typeof HH_STATE !== 'undefined') {
        HH_STATE.quorum = 'all';
        HH_STATE.search = '';
        HH_STATE.brgy = bkey || '';
        if (actCode) HH_STATE.asm = actCode;
      }
      go('households');
    } else if (checkId === 'late' || checkId === 'dates' || checkId === 'multidate' || checkId === 'attdup' || checkId === 'sex' || checkId === 'unmapped') {
      if (typeof ATT_STATE !== 'undefined') {
        if (bkey) ATT_STATE.brgy = bkey;
        if (actCode) ATT_STATE.act = actCode;
        if (nameVal) ATT_STATE.search = nameVal;
        if (checkId === 'sex') { ATT_STATE.sex = 'all'; ATT_STATE.flag = 'all'; }
        if (checkId === 'attdup') { ATT_STATE.flag = 'duplicate'; }
      }
      go('attendees');
    } else if (checkId === 'names') {
      if (source === 'Volunteers') {
        if (typeof VOL_STATE !== 'undefined') {
          if (bkey) VOL_STATE.brgy = bkey;
        }
        go('volunteers');
      } else {
        if (typeof ATT_STATE !== 'undefined') {
          if (bkey) ATT_STATE.brgy = bkey;
          if (actCode) ATT_STATE.act = actCode;
        }
        go('attendees');
      }
    } else if (checkId === 'sequence') {
      if (muniKey) STATE.muni = muniKey;
      var bParts = bkey.split('|');
      if (bParts[2]) STATE.brgySearch = bParts[2];
      go('brgys');
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
  else if (act === 'csv-pipeline') downloadCsv('PCRP_activities_stage' + STATE.stage + '_' + stamp() + '.csv', csvOf(pipelineTable()));
  else if (act === 'csv-munis') downloadCsv('PCRP_municipalities_stage' + STATE.stage + '_' + stamp() + '.csv', csvOf(muniTable(false)));
  else if (act === 'csv-brgys') downloadCsv('PCRP_barangays_' + STATE.muni.replace(/[^A-Za-z0-9]+/g, '_') + '_' + stamp() + '.csv', csvOf(brgyTable(brgyRows(), false)));
  else if (act === 'ov-sort') {
    var col = t.getAttribute('data-col');
    if (STATE.ovSort.col === col) {
      STATE.ovSort.dir = STATE.ovSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      STATE.ovSort.col = col;
      STATE.ovSort.dir = (col === 'seq' || col === 'activity') ? 'asc' : 'desc';
    }
    renderOverview();
  }
  else if (act === 'ov-filter') {
    STATE.ovFilter = t.getAttribute('data-v') || 'all';
    STATE.ovSeqFilter = '';
    renderOverview();
  }
  else if (act === 'ov-filter-seq') {
    var seqCode = t.getAttribute('data-v') || '';
    STATE.ovSeqFilter = (STATE.ovSeqFilter === seqCode) ? '' : seqCode;
    STATE.ovFilter = 'all';
    renderOverview();
  }
  else if (act === 'ov-reset') {
    STATE.ovSearch = '';
    STATE.ovFilter = 'all';
    STATE.ovSeqFilter = '';
    renderOverview();
  }
  else if (act === 'mu-sort') {
    var col = t.getAttribute('data-col');
    if (STATE.muniSort.col === col) {
      STATE.muniSort.dir = STATE.muniSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      STATE.muniSort.col = col;
      STATE.muniSort.dir = (col === 'muni') ? 'asc' : 'desc';
    }
    renderMunis();
  }
  else if (act === 'mu-filter') {
    STATE.muniFilter = v || 'all';
    renderMunis();
  }
  else if (act === 'bg-sort') {
    var col = t.getAttribute('data-col');
    if (STATE.brgySort.col === col) {
      STATE.brgySort.dir = STATE.brgySort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      STATE.brgySort.col = col;
      STATE.brgySort.dir = (col === 'brgy') ? 'asc' : 'desc';
    }
    renderBrgys();
  }
  else if (act === 'kpi-filter') { KPI_STATE.filter = v; renderKpiSummary(); }
  else if (act === 'kpi-reset') { KPI_STATE.filter = 'all'; KPI_STATE.search = ''; renderKpiSummary(); }
  else if (act === 'kpi-sort') {
    var kCol = t.getAttribute('data-col');
    if (KPI_STATE.sortCol === kCol) {
      KPI_STATE.sortDir = KPI_STATE.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      KPI_STATE.sortCol = kCol;
      KPI_STATE.sortDir = (kCol === 'brgy' || kCol === 'muni') ? 'asc' : 'desc';
    }
    renderKpiSummary();
  }
  else if (act === 'kpi-export') exportKpiSummaryCsv();
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
  if (ev.key !== 'Enter') return;
  var t = ev.target.closest && ev.target.closest('tr[data-act="muni"]');
  if (t) openMuni(t.getAttribute('data-v'));
});
document.addEventListener('change', function (ev) {
  var t = ev.target;
  var act = t.getAttribute && t.getAttribute('data-act');
  if (act === 'prov-select') { STATE.prov = t.value; renderPage(); updateTabBadges(); }
  else if (act === 'im-evaldate') {
    var q = prefs(); q.evalDate = t.value || ''; delete q.evalDateFromSave; savePrefs(q);
    if (STATE.computed) computeAndShow(null); else renderImport();
  }
  else if (act === 'muni-select') { STATE.muni = t.value; STATE.brgyFilter = 'all'; renderBrgys(); }
  else if (act === 'toggle-hide-muni') {
    STATE.brgyHideMuni = t.checked;
    renderBrgys();
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
$('btn-compute').addEventListener('click', function () { computeAndShow('overview'); });
var btnComputeSide = $('btn-compute-side');
if (btnComputeSide) btnComputeSide.addEventListener('click', function () { computeAndShow('overview'); });
$('btn-clear').addEventListener('click', function () {
  delete TABS.Raw_Participants; delete TABS.Raw_HH_Participation; delete TABS.Raw_Volunteers;
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
