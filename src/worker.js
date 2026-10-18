// ===================================================================
// WORKER BRIDGE — Background thread execution for high-volume parsing
// and heavy computation to keep the main UI fluid at 60 FPS.
// ===================================================================

var PCRP_WORKER = (function () {
  var _worker = null;
  var _taskId = 0;
  var _callbacks = {};

  function isWorkerSupported() {
    return typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof Blob !== 'undefined';
  }

  // The inline worker code executed inside the background thread
  var workerCode = [
    'self.onmessage = function(e) {',
    '  var data = e.data;',
    '  var id = data.id;',
    '  var type = data.type;',
    '  var payload = data.payload;',
    '',
    '  try {',
    '    if (type === "PARSE_CSV") {',
    '      self.postMessage({ id: id, type: "PROGRESS", msg: "Tokenizing CSV rows in background..." });',
    '      var text = payload.text || "";',
    '      var lines = text.split(/\\r?\\n/);',
    '      var rows = [];',
    '      for (var i = 0; i < lines.length; i++) {',
    '        if (!lines[i]) continue;',
    '        // Quick CSV line parser',
    '        var cells = lines[i].split(",").map(function(c) { return c.replace(/^["\']|["\']$/g, "").trim(); });',
    '        rows.push(cells);',
    '      }',
    '      self.postMessage({ id: id, type: "SUCCESS", result: rows });',
    '    } else if (type === "HEAVY_FILTER") {',
    '      self.postMessage({ id: id, type: "PROGRESS", msg: "Filtering large dataset..." });',
    '      var items = payload.items || [];',
    '      var q = (payload.query || "").toLowerCase();',
    '      var filtered = items.filter(function(it) {',
    '        return JSON.stringify(it).toLowerCase().indexOf(q) !== -1;',
    '      });',
    '      self.postMessage({ id: id, type: "SUCCESS", result: filtered });',
    '    } else {',
    '      self.postMessage({ id: id, type: "SUCCESS", result: null });',
    '    }',
    '  } catch (err) {',
    '    self.postMessage({ id: id, type: "ERROR", error: err.message });',
    '  }',
    '};'
  ].join('\n');

  function initWorker() {
    if (_worker || !isWorkerSupported()) return _worker;
    try {
      var blob = new Blob([workerCode], { type: 'application/javascript' });
      var blobUrl = URL.createObjectURL(blob);
      _worker = new Worker(blobUrl);

      _worker.onmessage = function (ev) {
        var msg = ev.data;
        var cb = _callbacks[msg.id];
        if (!cb) return;

        if (msg.type === 'PROGRESS' && cb.onProgress) {
          cb.onProgress(msg.msg);
        } else if (msg.type === 'SUCCESS') {
          delete _callbacks[msg.id];
          cb.resolve(msg.result);
        } else if (msg.type === 'ERROR') {
          delete _callbacks[msg.id];
          cb.reject(new Error(msg.error));
        }
      };

      _worker.onerror = function (err) {
        console.warn('[Worker] Worker thread error, falling back to main thread:', err);
      };
    } catch (e) {
      console.warn('[Worker] Could not initialize Web Worker, using main thread fallback:', e);
      _worker = null;
    }
    return _worker;
  }

  function runTask(type, payload, onProgress) {
    var id = ++_taskId;
    var w = initWorker();

    return new Promise(function (resolve, reject) {
      if (!w) {
        // Fallback: Synchronous execution on main thread
        try {
          if (type === 'PARSE_CSV') {
            var text = payload.text || '';
            var lines = text.split(/\r?\n/);
            var rows = [];
            for (var i = 0; i < lines.length; i++) {
              if (!lines[i]) continue;
              rows.push(lines[i].split(',').map(function (c) { return c.replace(/^["']|["']$/g, '').trim(); }));
            }
            resolve(rows);
          } else if (type === 'HEAVY_FILTER') {
            var items = payload.items || [];
            var q = (payload.query || '').toLowerCase();
            var filtered = items.filter(function (it) {
              return JSON.stringify(it).toLowerCase().indexOf(q) !== -1;
            });
            resolve(filtered);
          } else {
            resolve(null);
          }
        } catch (e) {
          reject(e);
        }
        return;
      }

      _callbacks[id] = { resolve: resolve, reject: reject, onProgress: onProgress };
      w.postMessage({ id: id, type: type, payload: payload });
    });
  }

  return {
    isSupported: isWorkerSupported,
    runTask: runTask
  };
})();
