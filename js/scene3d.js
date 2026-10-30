/* StudyForge — 3D loader. The Vault (Forge Hall) and the live forge (session screen) live in one
   bundle built from src/ (npm run build:3d). It's loaded the first time either is needed; without
   WebGL 2 the app keeps its 2D look. */
(function (root) {
  'use strict';

  var doc = root.document;
  var status = 'idle'; // idle | loading | ready | failed
  var waiting = [];

  function webglAvailable() {
    try { return !!doc.createElement('canvas').getContext('webgl2'); } catch (e) { return false; }
  }

  function load(cb) {
    if (status === 'ready') return cb(true);
    if (status === 'failed') return cb(false);
    waiting.push(cb);
    if (status === 'loading') return;
    if (!webglAvailable()) return finish(false, 'WebGL 2 unavailable');
    status = 'loading';
    var s = doc.createElement('script');
    s.src = 'vendor/studyforge3d.bundle.js';
    s.onload = function () { finish(!!(root.SF.vault3d && root.SF.forge3d), 'bundle did not register'); };
    s.onerror = function () { finish(false, 'bundle failed to load'); };
    doc.head.appendChild(s);
  }

  function finish(ok, reason) {
    status = ok ? 'ready' : 'failed';
    if (!ok) console.info('StudyForge: 3D unavailable, using the 2D look (' + reason + ')');
    var list = waiting;
    waiting = [];
    list.forEach(function (cb) { cb(ok); });
  }

  // ---------- Vault (Forge Hall) ----------
  var vault = { visible: false, state: null, api: null, failed: false };

  function vaultEls() {
    return {
      vault: doc.getElementById('vault'),
      stage: doc.getElementById('vault-stage'),
      labels: doc.getElementById('vault-labels'),
      panel: doc.getElementById('vault-panel'),
      loading: doc.getElementById('vault-loading'),
      exit: doc.getElementById('vault-exit')
    };
  }

  function vaultFail() {
    vault.failed = true;
    var e = vaultEls();
    e.vault.classList.add('no3d');
    e.loading.hidden = true;
  }

  function vaultStart() {
    if (vault.api || vault.failed) return;
    load(function (ok) {
      if (!ok) return vaultFail();
      if (vault.api) return;
      try { root.SF.vault3d.mount(vaultEls()); } catch (e) { console.error(e); return vaultFail(); }
      vault.api = root.SF.vault3d;
      if (vault.state) vault.api.update(vault.state, true);
      vault.api.setVisible(vault.visible);
    });
  }

  // ---------- Forge (session screen) ----------
  var forge = { active: false, snap: null, calm: false, api: null, failed: false };

  function forgeStart() {
    if (forge.api || forge.failed) return;
    load(function (ok) {
      var stage = doc.getElementById('forge-stage');
      if (!ok) { forge.failed = true; doc.body.classList.add('no3d-forge'); return; }
      if (forge.api) return;
      try { root.SF.forge3d.mount(stage); } catch (e) {
        console.error(e);
        forge.failed = true;
        doc.body.classList.add('no3d-forge');
        return;
      }
      forge.api = root.SF.forge3d;
      forge.api.setCalm(forge.calm);
      if (forge.snap) forge.api.update(forge.snap);
      forge.api.setActive(forge.active);
      stage.classList.add('ready');
    });
  }

  root.SF = root.SF || {};
  root.SF.vault = {
    setVisible: function (on) {
      vault.visible = on;
      if (on) vaultStart();
      if (vault.api) vault.api.setVisible(on);
    },
    update: function (state) {
      vault.state = state;
      if (vault.api) vault.api.update(state);
    }
  };
  root.SF.forge = {
    setActive: function (on) {
      forge.active = on;
      if (on) forgeStart();
      if (forge.api) forge.api.setActive(on);
    },
    update: function (snap) {
      forge.snap = snap;
      if (forge.api) forge.api.update(snap);
    },
    setCalm: function (on) {
      forge.calm = !!on;
      if (forge.api) forge.api.setCalm(forge.calm);
    }
  };
})(window);
