// ===================================================================
// CRYPTO — Native Web Crypto (AES-GCM-256 + PBKDF2) at-rest encryption
// and Session PIN Lock Screen for Data Privacy Act (DPA) compliance.
// ===================================================================

var PCRP_CRYPTO = (function () {
  var SALT = new Uint8Array([112, 99, 114, 112, 45, 115, 101, 99, 117, 114, 105, 116, 121, 45, 118, 49]); // "pcrp-security-v1"
  var _activeKey = null;
  var _idleTimer = null;
  var IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes default

  function getCrypto() {
    return typeof window !== 'undefined' && window.crypto ? window.crypto : (typeof crypto !== 'undefined' ? crypto : null);
  }

  function isAvailable() {
    var c = getCrypto();
    return !!(c && c.subtle);
  }

  var _memoryStorage = {};
  function getStorage() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) {}
    return {
      getItem: function (k) { return _memoryStorage[k] || null; },
      setItem: function (k, v) { _memoryStorage[k] = String(v); },
      removeItem: function (k) { delete _memoryStorage[k]; }
    };
  }

  function getSecurityPrefs() {
    try {
      var raw = getStorage().getItem('pcrp-security:v1');
      return raw ? JSON.parse(raw) : { enabled: false, pinHash: '', autoLockMinutes: 15 };
    } catch (e) {
      return { enabled: false, pinHash: '', autoLockMinutes: 15 };
    }
  }

  function saveSecurityPrefs(prefs) {
    try {
      getStorage().setItem('pcrp-security:v1', JSON.stringify(prefs));
    } catch (e) {}
  }

  // Derive AES-GCM key from PIN
  async function deriveKey(pin) {
    if (!isAvailable()) return null;
    var c = getCrypto();
    var enc = new TextEncoder();
    var keyMaterial = await c.subtle.importKey(
      'raw',
      enc.encode(pin),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return await c.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: SALT,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Fast hash for PIN verification
  async function hashPin(pin) {
    if (!isAvailable()) return pin;
    var c = getCrypto();
    var enc = new TextEncoder();
    var hashBuffer = await c.subtle.digest('SHA-256', enc.encode(pin + '-pcrp-salt'));
    var hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // Encrypt string/object
  async function encrypt(data) {
    if (!_activeKey || !isAvailable()) return JSON.stringify(data);
    var c = getCrypto();
    var enc = new TextEncoder();
    var iv = c.getRandomValues(new Uint8Array(12));
    var plaintext = enc.encode(typeof data === 'string' ? data : JSON.stringify(data));
    var ciphertext = await c.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      _activeKey,
      plaintext
    );
    return JSON.stringify({
      encrypted: true,
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(ciphertext))
    });
  }

  // Decrypt string/object
  async function decrypt(payloadStr) {
    try {
      var payload = JSON.parse(payloadStr);
      if (!payload || !payload.encrypted) return payload; // Not encrypted
      if (!_activeKey || !isAvailable()) throw new Error('Security key not loaded.');
      var c = getCrypto();

      var iv = new Uint8Array(payload.iv);
      var ciphertext = new Uint8Array(payload.data);
      var decrypted = await c.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        _activeKey,
        ciphertext
      );
      var dec = new TextDecoder();
      return JSON.parse(dec.decode(decrypted));
    } catch (e) {
      console.warn('[Crypto] Decrypt failed, returning raw payload:', e.message);
      return typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;
    }
  }

  function resetIdleTimer() {
    if (_idleTimer) clearTimeout(_idleTimer);
    var p = getSecurityPrefs();
    if (!p.enabled || !_activeKey) return;
    var timeout = (p.autoLockMinutes || 15) * 60 * 1000;
    _idleTimer = setTimeout(function () {
      lockSession('Inactivity timeout reached (15m).');
    }, timeout);
  }

  function lockSession(reason) {
    var p = getSecurityPrefs();
    if (!p.enabled) return;
    _activeKey = null;
    if (typeof document !== 'undefined') {
      var lockOverlay = document.getElementById('lock-overlay');
      if (lockOverlay) {
        lockOverlay.classList.add('active');
        var reasonEl = document.getElementById('lock-reason');
        if (reasonEl) reasonEl.textContent = reason || 'Workstation session is locked for Data Privacy compliance.';
        var pinInp = document.getElementById('lock-pin-input');
        if (pinInp) { pinInp.value = ''; pinInp.focus(); }
      }
    }
  }

  async function unlockSession(pin) {
    var p = getSecurityPrefs();
    if (!p.enabled) return true;
    var hashed = await hashPin(pin);
    if (hashed !== p.pinHash) {
      return false; // Wrong PIN
    }
    _activeKey = await deriveKey(pin);
    if (typeof document !== 'undefined') {
      var lockOverlay = document.getElementById('lock-overlay');
      if (lockOverlay) lockOverlay.classList.remove('active');
    }
    resetIdleTimer();
    return true;
  }

  async function setPin(newPin) {
    if (!newPin || newPin.length < 4) throw new Error('PIN must be at least 4 digits.');
    var hashed = await hashPin(newPin);
    var p = getSecurityPrefs();
    p.enabled = true;
    p.pinHash = hashed;
    saveSecurityPrefs(p);
    _activeKey = await deriveKey(newPin);
    resetIdleTimer();
  }

  function disableSecurity() {
    var p = getSecurityPrefs();
    p.enabled = false;
    p.pinHash = '';
    saveSecurityPrefs(p);
    _activeKey = null;
    if (_idleTimer) clearTimeout(_idleTimer);
  }

  // Setup user activity listeners for auto-lock
  if (typeof window !== 'undefined') {
    ['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(function (evt) {
      window.addEventListener(evt, resetIdleTimer, { passive: true });
    });
  }

  return {
    isAvailable: isAvailable,
    getSecurityPrefs: getSecurityPrefs,
    hashPin: hashPin,
    deriveKey: deriveKey,
    encrypt: encrypt,
    decrypt: decrypt,
    lockSession: lockSession,
    unlockSession: unlockSession,
    setPin: setPin,
    disableSecurity: disableSecurity,
    resetIdleTimer: resetIdleTimer
  };
})();
