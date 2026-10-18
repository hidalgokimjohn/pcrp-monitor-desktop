// ===================================================================
// STORE — Reactive state container and unidirectional event bus.
// Decouples application state from imperative DOM rendering.
// ===================================================================

var PCRP_STORE = (function () {
  var _listeners = {};

  var _state = {
    page: 'settings',
    stage: 1,
    prov: '',
    muni: '',
    muniSearch: '',
    muniSort: { col: 'muni', dir: 'asc' },
    brgySearch: '',
    brgyFilter: 'all',
    brgySort: { col: 'brgy', dir: 'asc' },
    ovSearch: '',
    ovSort: { col: 'seq', dir: 'asc' },
    settingsSearch: '',
    settingsSort: { col: 'seq', dir: 'asc' },
    computed: false,
    computedAt: null,
    ms: 0,
    role: null,           // 'pea_mdm' | 'rpmo'
    lockedMuni: null,     // { province, municipality } for PEA/MDM
    securityLocked: false // true when PIN lock is active
  };

  function on(event, callback) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(callback);
    return function unsubscribe() {
      _listeners[event] = _listeners[event].filter(function (fn) { return fn !== callback; });
    };
  }

  function emit(event, payload) {
    var list = _listeners[event] || [];
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](payload, _state);
      } catch (err) {
        console.error('[Store] Error in listener for "' + event + '":', err);
      }
    }
  }

  function get(key) {
    return key ? _state[key] : Object.assign({}, _state);
  }

  function set(updates, silent) {
    if (!updates || typeof updates !== 'object') return;
    var changed = {};
    var hasChanges = false;
    for (var k in updates) {
      if (Object.prototype.hasOwnProperty.call(updates, k)) {
        if (_state[k] !== updates[k]) {
          _state[k] = updates[k];
          changed[k] = updates[k];
          hasChanges = true;
        }
      }
    }
    if (hasChanges && !silent) {
      emit('state:changed', changed);
      for (var prop in changed) {
        emit('change:' + prop, changed[prop]);
      }
    }
  }

  return {
    on: on,
    emit: emit,
    get: get,
    set: set,
    raw: _state
  };
})();
