/* StudyForge — app controller: views, events, keyboard, timers, persistence. */
(function (root) {
  'use strict';

  var L = root.SF.logic;
  var S = root.SF.session;
  var store = root.SF.storage;
  var sound = root.SF.sound;
  var ui = root.SF.ui;
  var $ = ui.$;
  var doc = root.document;

  var TICK_MS = 250;
  var SAVE_EVERY_MS = 5000;
  var BASE_TITLE = 'StudyForge';

  var state = store.load();
  var s = null;              // active session
  var currentView = 'dashboard';
  var lastSave = 0;
  var flashTimer = null;
  var launch = initialLaunch();

  function now() { return Date.now(); }

  function initialLaunch() {
    var st = state.settings;
    var timerPreset = (st.workMin === 25 && st.breakMin === 5) || (st.workMin === 50 && st.breakMin === 10);
    return {
      mode: state.lastMode || 'stopwatch',
      subject: state.lastSubject || L.SUBJECTS[0],
      workMin: st.workMin,
      breakMin: st.breakMin,
      examMin: st.examMin,
      strict: !!st.strictExam,
      timerCustom: !timerPreset,
      examCustom: [30, 60, 90, 120].indexOf(st.examMin) < 0
    };
  }

  function save() {
    state.active = s && s.status !== 'ended' ? s : null;
    store.save(state);
    lastSave = now();
  }

  // ---------- Views ----------
  function showView(name) {
    currentView = name;
    ['dashboard', 'session', 'history', 'hall', 'settings'].forEach(function (v) {
      $('view-' + v).hidden = v !== name;
    });
    doc.querySelectorAll('.nav-btn').forEach(function (b) {
      if (b.dataset.view === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    doc.body.classList.toggle('in-session', name === 'session');
    renderView();
    root.scrollTo(0, 0);
  }

  function renderView() {
    var t = now();
    ui.renderTop(state, t);
    if (currentView === 'dashboard') ui.renderDashboard(state, launch, t, pickSubject);
    else if (currentView === 'history') ui.renderHistory(state);
    else if (currentView === 'hall') ui.renderHall(state, equipTitle);
    else if (currentView === 'settings') ui.fillSettings(state);
    else if (currentView === 'session' && s) ui.renderSession(s);
  }

  function pickSubject(name) {
    launch.subject = name;
    ui.renderLauncher(launch);
    $('subject-select').focus();
    root.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function equipTitle(id) {
    state.equippedTitle = id;
    save();
    renderView();
  }

  // ---------- Presence ----------
  function isPresent() {
    return doc.visibilityState === 'visible' && doc.hasFocus();
  }

  function onPresenceChange() {
    if (!s || s.status === 'ended') return;
    var present = isPresent();
    if (!present && !s.hidden) {
      handle(S.leave(s, now()));
      save();
    } else if (present && s.hidden) {
      stopTitleFlash();
      handle(S.returnTo(s, now()));
    }
    ui.renderSession(s);
  }

  // ---------- Notifications & title ----------
  function maybeAskNotifications() {
    if (!state.settings.notifications || !('Notification' in root)) return;
    if (Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) { /* older browsers */ }
    }
  }

  function notify(title, body) {
    if (!state.settings.notifications || !('Notification' in root) || Notification.permission !== 'granted') return;
    if (isPresent()) return;
    try {
      var n = new Notification(title, { body: body, icon: 'icons/icon.svg', tag: 'studyforge' });
      n.onclick = function () { root.focus(); n.close(); };
    } catch (e) { /* notifications are best-effort */ }
  }

  function flashTitle(msg) {
    stopTitleFlash();
    var on = false;
    flashTimer = setInterval(function () {
      on = !on;
      doc.title = on ? msg : BASE_TITLE;
    }, 1000);
  }

  function stopTitleFlash() {
    if (flashTimer) clearInterval(flashTimer);
    flashTimer = null;
  }

  function updateDocTitle() {
    if (flashTimer) return;
    if (!s || s.status === 'ready') { doc.title = BASE_TITLE; return; }
    var stage = L.HEAT_STAGES[S.stageOf(s)].name;
    var prefix = s.status === 'paused' ? '⏸ ' : s.status === 'ofs' ? '📖 ' : '🔥 ';
    doc.title = prefix + L.formatClock(S.mainClockMs(s)) + ' · ' + stage + ' — ' + BASE_TITLE;
  }

  // ---------- Engine events ----------
  function handle(events) {
    events.forEach(function (e) {
      if (!s) return; // an earlier event already finished the session
      switch (e.type) {
        case 'stage-up':
          sound.play('stageUp');
          ui.toast('The forge is now ' + L.HEAT_STAGES[e.stage].name + ' — ' + L.HEAT_STAGES[e.stage].mult + 'x Ingots');
          break;
        case 'crack':
          sound.play('crack');
          ui.toast('Your work cracked from distraction (' + e.cracks + '/' + L.MAX_CRACKS + ').');
          break;
        case 'phase':
          sound.play('chime');
          if (e.phase === 'break') {
            ui.toast('Work block done — take your break.');
            notify('Break time', 'Work block finished. Rest for ' + Math.round(s.config.breakMs / L.MIN) + ' min.');
            if (!isPresent()) flashTitle('☕ Break time — StudyForge');
          } else {
            ui.toast('Break over — back to the anvil.');
            notify('Back to work', 'Your break is over. Return to StudyForge.');
            if (!isPresent()) flashTitle('🔨 Back to work — StudyForge');
          }
          break;
        case 'block-done':
          if (e.bonus) ui.toast('Clean work block! +' + e.bonus + ' bonus Ingots.');
          break;
        case 'ofs-expired':
          sound.play('chime');
          if (isPresent()) {
            handle(S.endOpenForStudy(s, now()));
          } else {
            notify('Open for Study window over', '"' + s.ofs.label + '" time is up. Return to StudyForge — extra time counts as Distracted.');
            flashTitle('⏰ Time\'s up — return to StudyForge');
          }
          break;
        case 'ofs-finished':
          stopTitleFlash();
          ui.toast(e.overrun
            ? 'Welcome back. ' + L.formatMinutes(e.overrun) + ' over the window went to Distracted.'
            : 'Welcome back — session resumed.');
          break;
        case 'classify':
          openClassify();
          break;
        case 'exam-complete':
          finishSession({});
          break;
        case 'strict-fail':
          notify('Exam attempt ended', 'Strict Mode: you left for more than 10 seconds.');
          finishSession({ failReason: 'strict' });
          break;
      }
    });
  }

  // ---------- Session lifecycle ----------
  function startSession() {
    sound.unlock();
    var cfg = {
      workMin: launch.workMin, breakMin: launch.breakMin,
      examMin: launch.examMin, strict: launch.mode === 'exam' && launch.strict
    };
    state.lastMode = launch.mode;
    state.lastSubject = launch.subject;
    s = S.createSession({ mode: launch.mode, subject: launch.subject, config: cfg }, now());
    s.hidden = !isPresent();
    ui.resetSessionView();
    if (launch.mode === 'timer') maybeAskNotifications();
    showView('session');
    if (launch.mode !== 'exam') beginSession();
    else ui.toast('Go full screen (F), then press Start (Space). There is no pause.', 5000);
    save();
  }

  function beginSession() {
    S.start(s, now());
    sound.play('start');
    save();
    ui.renderSession(s);
  }

  function toggleRun() {
    if (!s) return;
    if (s.status === 'ready') return beginSession();
    if (!S.canPause(s)) return;
    S.togglePause(s, now());
    sound.play(s.status === 'paused' ? 'pause' : 'start');
    save();
    ui.renderSession(s);
  }

  function requestStop() {
    if (!s) return;
    if (s.status === 'ready') {
      s = null;
      save();
      showView('dashboard');
      return;
    }
    var exam = s.mode === 'exam';
    ui.confirm(
      exam ? 'End the exam early?' : 'Stop forging?',
      exam ? 'Ending now marks this attempt incomplete. Your Ingots so far are kept.'
        : 'Your session will be quenched and turned into Ingots.',
      exam ? 'End attempt' : 'Stop & forge'
    ).then(function (ok) {
      if (ok && s) finishSession(exam ? { failReason: 'stopped' } : {});
    });
  }

  function finishSession(opts) {
    if (!s || s.status === 'ended') return;
    var classifyDlg = $('dlg-classify');
    if (classifyDlg.open) classifyDlg.close();
    stopTitleFlash();
    var done = s;
    S.finish(done, now(), opts);
    var result = S.applyResult(state, done);
    s = null;
    save();
    if (doc.fullscreenElement && doc.exitFullscreen) doc.exitFullscreen().catch(function () {});
    showView('dashboard');
    doc.title = BASE_TITLE;
    if (result.discarded) {
      ui.toast('Sessions under a minute are not logged.');
      return;
    }
    sound.play(done.failReason === 'strict' ? 'fail' : 'reward');
    ui.showReward(result, done);
  }

  // ---------- Return classification ----------
  var pendingCategory = null;

  function openClassify() {
    var d = $('dlg-classify');
    ui.buildCategories(pickCategory);
    pendingCategory = null;
    $('other-box').hidden = true;
    $('other-text').value = '';
    $('away-time').textContent = L.formatClock(s.pendingMs);
    if (!d.open) d.showModal();
    sound.play('anvil');
  }

  function pickCategory(cat) {
    if (cat.bucket) return applyClassification(cat.bucket, cat.id, cat.label);
    pendingCategory = cat;
    $('other-box').hidden = false;
    $('other-text').focus();
  }

  function applyClassification(bucket, catId, label) {
    if (!s) return;
    var d = $('dlg-classify');
    var ms = s.pendingMs;
    var events = S.classify(s, bucket, catId, label, now());
    d.close();
    var names = { studied: 'Studied', intentional: 'Intentional', distracted: 'Distracted' };
    ui.toast('+' + L.formatClock(ms) + ' → ' + names[bucket]);
    save();
    handle(events);
    if (s) ui.renderSession(s);
  }

  // ---------- Open for Study ----------
  function openOfsDialog() {
    if (!s || !S.canOpenForStudy(s)) return;
    var d = $('dlg-ofs');
    $('ofs-name').value = '';
    d.returnValue = '';
    d.showModal();
    $('ofs-name').focus();
  }

  function onOfsClose() {
    var d = $('dlg-ofs');
    if (d.returnValue !== 'ok' || !s) return;
    var label = $('ofs-name').value.trim() || 'Study app';
    var min = Math.max(1, Math.min(120, parseInt($('ofs-min').value, 10) || 5));
    maybeAskNotifications();
    if (S.openForStudy(s, label, min, now())) {
      sound.play('start');
      ui.toast('Window open for ' + min + ' min — switch to "' + label + '" now. We\'ll ping you when time is up.', 5000);
      save();
      ui.renderSession(s);
    }
  }

  // ---------- Full screen ----------
  function toggleFullscreen() {
    if (!doc.fullscreenEnabled) return ui.toast('Full screen is not available here.');
    if (doc.fullscreenElement) doc.exitFullscreen().catch(function () {});
    else doc.documentElement.requestFullscreen().catch(function () { ui.toast('Full screen was blocked by the browser.'); });
  }

  // ---------- Keyboard ----------
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (doc.querySelector('dialog[open]')) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (currentView !== 'session' || !s) return;

    if (e.code === 'Space') { e.preventDefault(); toggleRun(); }
    else if (e.key === 'Escape') { e.preventDefault(); requestStop(); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); }
    else if (e.key === 'o' || e.key === 'O') { e.preventDefault(); openOfsDialog(); }
  }

  // ---------- Main loop ----------
  function loop() {
    if (!s) return;
    var t = now();
    handle(S.tick(s, t));
    if (!s) return;
    if ($('dlg-classify').open) $('away-time').textContent = L.formatClock(s.pendingMs);
    if (currentView === 'session') ui.renderSession(s);
    updateDocTitle();
    if (t - lastSave > SAVE_EVERY_MS) save();
  }

  // ---------- Recovery ----------
  function recoverSession() {
    var r = state.active;
    if (!r || r.status === 'ended') { state.active = null; return; }
    // Keep `s` unset while the prompt is open so the loop doesn't tick the gap as Studied.
    ui.confirm(
      'Unfinished session found',
      ui.MODE_NAMES[r.mode] + ' — ' + r.subject + ', ' + L.formatMinutes(S.totalMs(r)) +
        ' forged. Resume it, or end it and collect the Ingots earned so far?',
      'Resume'
    ).then(function (resume) {
      if (!resume) {
        S.finish(r, r.lastTick, r.mode === 'exam' && !r.completed ? { failReason: 'stopped' } : {});
        var result = S.applyResult(state, r);
        save();
        renderView();
        if (!result.discarded) ui.showReward(result, r);
        return;
      }
      // Time since the last snapshot is unknown: treat it as away time and ask about it.
      if (r.status === 'running' || r.status === 'away' || r.status === 'classify') {
        if (r.status === 'running') r.awayStart = r.lastTick;
        r.status = 'away';
        r.hidden = true;
      } else if (r.status === 'paused' || r.status === 'ready') {
        r.lastTick = now();
      }
      s = r;
      ui.resetSessionView();
      showView('session');
      if (s.hidden) handle(S.returnTo(s, now()));
      if (s) ui.renderSession(s);
    });
  }

  // ---------- Wiring ----------
  function wire() {
    doc.querySelectorAll('.nav-btn').forEach(function (b) {
      b.addEventListener('click', function () { showView(b.dataset.view); });
    });

    doc.querySelectorAll('.mode-tab').forEach(function (b) {
      b.addEventListener('click', function () { launch.mode = b.dataset.mode; ui.renderLauncher(launch); });
    });
    $('subject-select').addEventListener('change', function (e) { launch.subject = e.target.value; });
    doc.querySelectorAll('#timer-presets .preset').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.hasAttribute('data-custom')) launch.timerCustom = true;
        else { launch.timerCustom = false; launch.workMin = +b.dataset.work; launch.breakMin = +b.dataset.break; }
        ui.renderLauncher(launch);
      });
    });
    doc.querySelectorAll('#exam-presets .preset').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.hasAttribute('data-custom')) launch.examCustom = true;
        else { launch.examCustom = false; launch.examMin = +b.dataset.exam; }
        ui.renderLauncher(launch);
      });
    });
    function numInput(id, key, max) {
      $(id).addEventListener('change', function (e) {
        launch[key] = Math.max(1, Math.min(max, parseInt(e.target.value, 10) || launch[key]));
        e.target.value = launch[key];
      });
    }
    numInput('work-min', 'workMin', 240);
    numInput('break-min', 'breakMin', 60);
    numInput('exam-min', 'examMin', 300);
    $('strict-toggle').addEventListener('change', function (e) { launch.strict = e.target.checked; });
    $('start-btn').addEventListener('click', startSession);

    function control(id, fn) {
      $(id).addEventListener('click', function (e) { e.currentTarget.blur(); fn(); });
    }
    control('ctl-toggle', toggleRun);
    control('ctl-stop', requestStop);
    control('ctl-fs', toggleFullscreen);
    control('ctl-ofs', openOfsDialog);
    $('ofs-back').addEventListener('click', function () {
      if (s && s.status === 'ofs') { handle(S.endOpenForStudy(s, now())); save(); ui.renderSession(s); }
    });

    // Return popup: it must be answered, never dismissed with Esc.
    $('dlg-classify').addEventListener('cancel', function (e) { e.preventDefault(); });
    doc.querySelectorAll('.bucket-pick button').forEach(function (b) {
      b.addEventListener('click', function () {
        var label = $('other-text').value.trim() || 'Other';
        applyClassification(b.dataset.bucket, 'other', label);
      });
    });

    $('dlg-ofs').addEventListener('close', onOfsClose);
    doc.querySelectorAll('#ofs-presets .preset').forEach(function (b) {
      b.addEventListener('click', function () { $('ofs-min').value = b.dataset.min; });
    });

    $('settings-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target.elements;
      var st = state.settings;
      function int(name, max) { return Math.max(1, Math.min(max, parseInt(f[name].value, 10) || st[name])); }
      st.workMin = int('workMin', 240);
      st.breakMin = int('breakMin', 60);
      st.examMin = int('examMin', 300);
      st.streakMinMin = int('streakMinMin', 300);
      st.strictExam = f.strictExam.checked;
      st.sound = f.sound.checked;
      st.notifications = f.notifications.checked;
      sound.setEnabled(st.sound);
      if (st.notifications) maybeAskNotifications();
      save();
      launch = initialLaunch();
      ui.fillSettings(state);
      $('settings-saved').hidden = false;
      setTimeout(function () { $('settings-saved').hidden = true; }, 2000);
    });

    $('reset-btn').addEventListener('click', function () {
      ui.confirm('Erase everything?', 'All sessions, Ingots, streaks, achievements and settings will be deleted from this browser. This cannot be undone.', 'Erase')
        .then(function (ok) {
          if (!ok) return;
          state = store.reset();
          launch = initialLaunch();
          sound.setEnabled(true);
          ui.toast('All data erased. A fresh forge awaits.');
          showView('dashboard');
        });
    });

    doc.addEventListener('keydown', onKey);
    doc.addEventListener('visibilitychange', onPresenceChange);
    root.addEventListener('blur', onPresenceChange);
    root.addEventListener('focus', onPresenceChange);
    root.addEventListener('pagehide', function () { if (s) save(); });
    doc.addEventListener('fullscreenchange', function () { if (s) ui.renderSession(s); });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('StudyForge: service worker not registered', e);
    });
  }

  function boot() {
    sound.setEnabled(state.settings.sound);
    wire();
    showView('dashboard');
    recoverSession();
    setInterval(loop, TICK_MS);
    registerServiceWorker();
  }

  // Exposed for debugging and automated tests.
  root.SF.app = {
    get state() { return state; },
    get session() { return s; }
  };

  boot();
})(window);
