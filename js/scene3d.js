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
      exit: doc.getElementById('vault-exit'),
      forged: doc.getElementById('vault-forged'),
      skip: doc.getElementById('vault-skip')
    };
  }

  // The molten-metal loader: real steps, never a fake timer.
  var shown = 0;
  function vaultProgress(f, label) {
    var e = vaultEls();
    var fill = doc.getElementById('vl-fill');
    var to = Math.max(shown, f);
    var apply = function (v) {
      var h = 46 * v;
      fill.setAttribute('y', String(58 - h));
      fill.setAttribute('height', String(h));
      doc.getElementById('vl-pct').textContent = Math.round(v * 100) + '%';
      e.loading.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    };
    if (label) doc.getElementById('vl-label').textContent = label;
    if (root.gsap) {
      var o = { v: shown };
      root.gsap.to(o, { v: to, duration: 0.45, ease: 'power2.out', onUpdate: function () { apply(o.v); } });
    } else apply(to);
    shown = to;
    if (f >= 1) {
      setTimeout(function () {
        if (root.gsap) root.gsap.to(e.loading, { autoAlpha: 0, duration: 0.5, delay: 0.15, onComplete: function () { e.loading.hidden = true; } });
        else e.loading.hidden = true;
      }, 250);
    }
  }

  function vaultFail() {
    vault.failed = true;
    var e = vaultEls();
    e.vault.classList.add('no3d');
    e.loading.hidden = true;
  }

  function vaultStart() {
    if (vault.api || vault.failed || vault.mounting) return;
    vault.mounting = true;
    vaultProgress(status === 'ready' ? 0.35 : 0.08, 'Loading the 3D engine');
    load(function (ok) {
      if (!ok) return vaultFail();
      if (vault.api) return;
      vaultProgress(0.35, 'Loading the 3D engine');
      var api = root.SF.vault3d;
      // Feed it state first, so the scene is built with your alloys before the reveal.
      api.update(vault.state, true);
      api.setVisible(vault.visible);
      Promise.resolve(api.mount(vaultEls(), { onProgress: vaultProgress, onForge: vault.onForge }))
        .then(function () { vault.api = api; api.update(vault.state); api.setVisible(vault.visible); })
        .catch(function (e) { console.error(e); vaultFail(); });
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

  // Quietly fetch the 3D bundle while the browser is idle, so the Vault and forge open fast.
  function preload() {
    if (status !== 'idle' || !webglAvailable()) return;
    var go = function () { load(function () {}); };
    if ('requestIdleCallback' in root) root.requestIdleCallback(go, { timeout: 8000 });
    else setTimeout(go, 2500);
  }

  root.SF = root.SF || {};
  root.SF.scene3d = { preload: preload };
  root.SF.vault = {
    setVisible: function (on) {
      vault.visible = on;
      if (on) vaultStart();
      if (vault.api) vault.api.setVisible(on);
    },
    update: function (state) {
      vault.state = state;
      if (vault.api) vault.api.update(state);
    },
    setHandlers: function (h) {
      vault.onForge = h.onForge;
      if (vault.api) vault.api.setHandlers(h);
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
    },
    finale: function (kind, alloyId) {
      return forge.api && !forge.calm ? forge.api.finale(kind, alloyId) : false;
    },
    finaleSkip: function () {
      if (forge.api) forge.api.finaleSkip();
    }
  };
})(window);
