/* StudyForge — rendering. Reads state, writes DOM; no game rules live here. */
(function (root) {
  'use strict';

  var L = root.SF.logic;
  var S = root.SF.session;
  var doc = root.document;

  function $(id) { return doc.getElementById(id); }

  function el(tag, attrs, children) {
    var n = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c != null) n.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    });
    return n;
  }

  var MODE_NAMES = { stopwatch: 'Stopwatch', timer: 'Study Timer', exam: 'Exam Timer' };
  var MODE_DESC = {
    stopwatch: 'Free Forging — unlimited time, pause whenever you need. Heat rises steadily with Studied time. Best for long revision or note-making.',
    timer: 'Structured work and break blocks that switch automatically. Finish a work block with under 10% distraction for +' + L.BLOCK_BONUS + ' bonus Ingots.',
    exam: 'Final Forge — a strict countdown with no pause. Go full screen. Finish with under 1 min distracted for a Legendary Attempt (+' + L.LEGENDARY_ATTEMPT_BONUS + ' Ingots).'
  };

  var WEEK_MS = 7 * 24 * 3600 * 1000;

  function fmtDate(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function titleName(id) {
    var t = L.TITLES.filter(function (x) { return x.id === id; })[0];
    return t ? t.name : L.TITLES[0].name;
  }

  function studiedToday(state, now) {
    var today = L.dayKey(now);
    return state.sessions.reduce(function (sum, r) {
      return L.dayKey(r.endedAt) === today ? sum + r.studied : sum;
    }, 0);
  }

  // ---------- Top bar ----------
  function renderTop(state, now) {
    $('top-title').textContent = titleName(state.equippedTitle);
    $('top-ingots').textContent = state.totalIngots;
    $('top-streak').textContent = L.currentStreak(state.streak, L.dayKey(now));
  }

  // ---------- Dashboard ----------
  function renderLauncher(launch) {
    doc.querySelectorAll('.mode-tab').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.mode === launch.mode));
    });
    $('mode-desc').textContent = MODE_DESC[launch.mode];
    doc.querySelectorAll('.mode-opts').forEach(function (o) { o.hidden = o.dataset.for !== launch.mode; });

    var sel = $('subject-select');
    if (!sel.options.length) {
      L.SUBJECTS.forEach(function (s) { sel.appendChild(el('option', { value: s, text: s })); });
    }
    sel.value = launch.subject;

    var timerPreset = false;
    doc.querySelectorAll('#timer-presets .preset').forEach(function (b) {
      var on = b.hasAttribute('data-custom') ? launch.timerCustom
        : !launch.timerCustom && +b.dataset.work === launch.workMin && +b.dataset.break === launch.breakMin;
      if (on) timerPreset = true;
      b.setAttribute('aria-pressed', String(on));
    });
    $('timer-custom').hidden = !launch.timerCustom && timerPreset;
    $('work-min').value = launch.workMin;
    $('break-min').value = launch.breakMin;

    var examPreset = false;
    doc.querySelectorAll('#exam-presets .preset').forEach(function (b) {
      var on = b.hasAttribute('data-custom') ? launch.examCustom : !launch.examCustom && +b.dataset.exam === launch.examMin;
      if (on) examPreset = true;
      b.setAttribute('aria-pressed', String(on));
    });
    $('exam-custom').hidden = !launch.examCustom && examPreset;
    $('exam-min').value = launch.examMin;
    $('strict-toggle').checked = launch.strict;
  }

  function renderSmith(state, now) {
    var stats = S.statsOf(state);
    var idx = L.alloyIndex(stats);
    var alloy = L.ALLOYS[idx];
    var next = L.ALLOYS[idx + 1];
    var streak = L.currentStreak(state.streak, L.dayKey(now));

    $('alloy-badge').dataset.alloy = alloy.id;
    $('alloy-name').textContent = alloy.name;
    $('smith-title').textContent = titleName(state.equippedTitle);
    if (next) {
      $('alloy-next').textContent = 'Next: ' + next.name + ' — ' + next.desc;
      var prev = alloy.ingots;
      $('alloy-progress').style.width = Math.min(100, (state.totalIngots - prev) / (next.ingots - prev) * 100) + '%';
    } else {
      $('alloy-next').textContent = 'You have reached the highest alloy.';
      $('alloy-progress').style.width = '100%';
    }
    $('stat-ingots').textContent = state.totalIngots;
    $('stat-streak').textContent = streak + (streak === 1 ? ' day' : ' days');
    $('stat-mult').textContent = L.streakMultiplier(streak).toFixed(1) + 'x';
    $('stat-today').textContent = L.formatMinutes(studiedToday(state, now));

    var todayDone = state.streak.lastDay === L.dayKey(now);
    $('streak-note').textContent = todayDone
      ? 'Today counts toward your streak. Keep the fire burning tomorrow.'
      : 'Finish a session with ' + state.settings.streakMinMin + '+ min Studied today to ' + (streak ? 'keep' : 'start') + ' your streak.';
  }

  function renderSubjects(state, now, onPick) {
    var totals = L.subjectTotals(state.sessions, now - WEEK_MS);
    var top = L.topSubject(totals);
    var max = Math.max.apply(null, [1].concat(Object.keys(totals).map(function (k) { return totals[k]; })));
    var grid = $('subject-grid');
    grid.textContent = '';
    L.SUBJECTS.forEach(function (name) {
      var ms = totals[name] || 0;
      var tile = el('button', { class: 'subject' + (name === top ? ' top' : ''), type: 'button', title: 'Forge ' + name,
        onclick: function () { onPick(name); } }, [
        el('span', { class: 'flame' }),
        el('b', { text: name }),
        el('small', { text: ms ? L.formatMinutes(ms) : 'Cold' })
      ]);
      tile.style.setProperty('--flame', String(0.25 + 0.75 * ms / max));
      grid.appendChild(tile);
    });
  }

  function triNode(r) {
    return el('span', { class: 'tri' }, [
      el('span', { class: 's', text: L.formatMinutes(r.studied) }), ' · ',
      el('span', { class: 'i', text: L.formatMinutes(r.intentional) }), ' · ',
      el('span', { class: 'd', text: L.formatMinutes(r.distracted) })
    ]);
  }

  function renderRecent(state) {
    var box = $('recent-list');
    box.textContent = '';
    var list = state.sessions.slice(-4).reverse();
    if (!list.length) {
      box.appendChild(el('p', { class: 'muted', text: 'No sessions yet. Pick a subject and start forging.' }));
      return;
    }
    var wrap = el('div', { class: 'recent' });
    list.forEach(function (r) {
      wrap.appendChild(el('div', { class: 'recent-item' }, [
        el('b', { text: r.subject + ' — ' + MODE_NAMES[r.mode] }),
        el('span', { text: '+' + r.ingots + ' Ingots' }),
        el('span', { class: 'meta', text: fmtDate(r.endedAt) + ' · Peak ' + L.HEAT_STAGES[r.peakStage].name }),
        triNode(r)
      ]));
    });
    box.appendChild(wrap);
  }

  function renderDashboard(state, launch, now, onPickSubject) {
    renderLauncher(launch);
    renderSmith(state, now);
    renderSubjects(state, now, onPickSubject);
    renderRecent(state);
  }

  // ---------- Session ----------
  var lastVals = {};

  function setCounter(id, ms) {
    var node = $(id);
    var txt = L.formatClock(ms);
    if (node.textContent !== txt) {
      // Bump animation when a counter jumps (e.g. after classification), not on every second.
      if (lastVals[id] != null && ms - lastVals[id] > 5000) {
        node.parentNode.classList.remove('bump');
        void node.parentNode.offsetWidth;
        node.parentNode.classList.add('bump');
      }
      node.textContent = txt;
    }
    lastVals[id] = ms;
  }

  function timerLabel(s) {
    switch (s.status) {
      case 'ready': return 'Press Start (Space) when you are ready';
      case 'paused': return 'Paused — the forge holds its heat';
      case 'ofs': return s.ofs.expired ? 'Window over — come back to resume' : 'Intentional time remaining';
      case 'away': case 'classify': return 'Away from the forge…';
    }
    if (s.mode === 'timer') {
      return (s.phase === 'work' ? 'Work block ' : 'Break before block ') + (s.blocksDone + 1) + ' · ' + s.blocksDone + ' done';
    }
    if (s.mode === 'exam') return 'Exam time remaining';
    return 'Total session time';
  }

  function renderSession(s) {
    var view = $('view-session');
    var stageIdx = S.stageOf(s);
    var stage = L.HEAT_STAGES[stageIdx];
    var heat = S.heatOf(s);

    view.dataset.stage = stage.id;
    view.dataset.cracks = String(s.cracks);
    view.classList.toggle('paused', s.status === 'paused' || s.status === 'ready');
    view.classList.toggle('on-break', s.mode === 'timer' && s.phase === 'break' && s.status !== 'ofs');
    view.classList.toggle('in-ofs', s.status === 'ofs');

    $('sess-mode').textContent = MODE_NAMES[s.mode];
    $('sess-subject').textContent = s.subject;
    var phase = $('sess-phase');
    phase.hidden = s.mode !== 'timer';
    phase.textContent = s.phase === 'work' ? 'Work' : 'Break';
    phase.classList.toggle('break', s.phase === 'break');
    $('sess-strict').hidden = !(s.mode === 'exam' && s.config.strict);

    var clock = new Date();
    $('sess-clock').textContent = clock.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    $('sess-clock').dateTime = clock.toISOString();

    $('sess-timer').textContent = L.formatClock(S.mainClockMs(s));
    $('sess-timer-label').textContent = timerLabel(s);

    $('ofs-banner').hidden = s.status !== 'ofs';
    if (s.status === 'ofs') $('ofs-label').textContent = s.ofs.label;

    setCounter('cnt-studied', s.studied);
    setCounter('cnt-intentional', s.intentional);
    setCounter('cnt-distracted', s.distracted);

    $('heat-stage').textContent = stage.name;
    $('heat-fill').style.width = (L.heatFill(heat) * 100) + '%';
    $('heat-meter').setAttribute('aria-valuenow', String(Math.round(heat)));
    $('heat-meter').setAttribute('aria-valuetext', stage.name);
    $('heat-meta').textContent = stage.mult.toFixed(2).replace(/0$/, '') + 'x · Ingots so far: ' +
      Math.floor(s.ingotAccum) + (s.bonusIngots ? ' (+' + s.bonusIngots + ' bonus)' : '');

    var toggle = $('ctl-toggle');
    toggle.hidden = s.mode === 'exam' && s.status !== 'ready';
    var toggleText = s.status === 'ready' ? 'Start' : s.status === 'paused' ? 'Resume' : 'Pause';
    $('ctl-toggle-text').textContent = toggleText;
    toggle.setAttribute('aria-label', toggleText);
    setIcon(toggle, toggleText === 'Pause' ? 'i-pause' : 'i-play');
    toggle.disabled = s.status !== 'ready' && !S.canPause(s);
    // In a running exam there is no pause button, so Stop takes the highlighted spot.
    $('ctl-stop').classList.toggle('is-active', toggle.hidden);
    var ofsBtn = $('ctl-ofs');
    ofsBtn.hidden = s.mode === 'exam';
    ofsBtn.disabled = !S.canOpenForStudy(s);
    var fs = $('ctl-fs');
    var fsText = doc.fullscreenElement ? 'Exit full screen' : 'Full screen';
    fs.querySelector('.lbl-text').textContent = fsText;
    fs.setAttribute('aria-label', fsText);
    setIcon(fs, doc.fullscreenElement ? 'i-shrink' : 'i-expand');
  }

  function setIcon(btn, id) {
    var use = btn.querySelector('.ico use');
    if (use.getAttribute('href') !== '#' + id) use.setAttribute('href', '#' + id);
  }

  function resetSessionView() { lastVals = {}; }

  // ---------- History ----------
  function renderHistory(state) {
    var body = $('history-body');
    body.textContent = '';
    var list = state.sessions.slice().reverse();
    $('history-empty').hidden = list.length > 0;
    list.forEach(function (r) {
      var result = r.legendary ? el('span', { class: 'tag legend', text: 'Legendary' })
        : r.completed ? el('span', { class: 'tag ok', text: 'Complete' })
        : el('span', { class: 'tag fail', text: r.failReason === 'strict' ? 'Strict fail' : 'Incomplete' });
      body.appendChild(el('tr', {}, [
        el('td', { text: fmtDate(r.endedAt) }),
        el('td', { text: MODE_NAMES[r.mode] }),
        el('td', { text: r.subject }),
        el('td', { class: 'num s', text: L.formatMinutes(r.studied) }),
        el('td', { class: 'num i', text: L.formatMinutes(r.intentional) }),
        el('td', { class: 'num d', text: L.formatMinutes(r.distracted) }),
        el('td', { text: L.HEAT_STAGES[r.peakStage].name }),
        el('td', { class: 'num', text: '+' + r.ingots }),
        el('td', {}, [result])
      ]));
    });
  }

  // ---------- Forge Hall ----------
  function renderHall(state, onEquip) {
    var idx = L.alloyIndex(S.statsOf(state));
    var row = $('alloy-row');
    row.textContent = '';
    L.ALLOYS.forEach(function (a, i) {
      row.appendChild(el('div', { class: 'alloy-card' + (i > idx ? ' locked' : '') }, [
        el('div', { class: 'alloy-badge', 'data-alloy': a.id }, [el('span', { text: a.name })]),
        el('b', { text: a.name + (i === idx ? ' (current)' : '') }),
        el('p', { text: a.desc })
      ]));
    });

    var titles = $('title-list');
    titles.textContent = '';
    L.TITLES.forEach(function (t) {
      var unlocked = t.alloy <= idx;
      var equipped = state.equippedTitle === t.id;
      var btn = unlocked && !equipped
        ? el('button', { class: 'btn', type: 'button', text: 'Equip', onclick: function () { onEquip(t.id); } })
        : el('span', { class: 'muted small', text: equipped ? 'Equipped' : 'Unlocks at ' + L.ALLOYS[t.alloy].name });
      titles.appendChild(el('div', { class: 'title-item' + (equipped ? ' equipped' : '') + (unlocked ? '' : ' locked') }, [
        el('b', { text: t.name }), btn
      ]));
    });

    var grid = $('ach-grid');
    grid.textContent = '';
    L.ACHIEVEMENTS.forEach(function (a) {
      var at = state.achievements[a.id];
      grid.appendChild(el('div', { class: 'ach' + (at ? ' got' : '') }, [
        el('b', { text: a.name }),
        el('span', { text: a.desc }),
        at ? el('small', { text: 'Unlocked ' + new Date(at).toLocaleDateString() }) : null
      ]));
    });
  }

  // ---------- Settings ----------
  function fillSettings(state) {
    var f = $('settings-form');
    var st = state.settings;
    ['workMin', 'breakMin', 'examMin', 'streakMinMin'].forEach(function (k) { f.elements[k].value = st[k]; });
    ['strictExam', 'sound', 'notifications', 'fxCursor', 'fxRadio'].forEach(function (k) { f.elements[k].checked = !!st[k]; });
  }

  // ---------- Dialogs ----------
  function buildCategories(onPick) {
    var grid = $('cat-grid');
    if (grid.childNodes.length) return;
    var hints = {
      allowed: 'Counts as Studied', office: 'Counts as Intentional', youtube: 'Blocked — Distracted',
      instagram: 'Blocked — Distracted', roblox: 'Blocked — Distracted', other: 'You choose'
    };
    L.CATEGORIES.forEach(function (c) {
      grid.appendChild(el('button', {
        type: 'button', class: 'cat', 'data-cat': c.id, 'data-bucket': c.bucket || '',
        onclick: function () { onPick(c); }
      }, [el('b', { text: c.label }), el('small', { text: hints[c.id] })]));
    });
  }

  function showReward(result, s) {
    var r = result.record;
    var alloy = L.ALLOYS[result.alloyAfter];
    var title;
    if (s.failReason === 'strict') title = 'The forge went cold';
    else if (r.legendary) title = 'Legendary Attempt!';
    else if (!r.completed) title = 'Unfinished ' + alloy.name + ' Ingot';
    else title = alloy.name + ' Ingot Forged!';
    $('reward-title').textContent = title;
    $('reward-ingot').dataset.alloy = alloy.id;

    var list = $('reward-list');
    list.textContent = '';
    function row(label, value, cls) {
      list.appendChild(el('dt', { text: label }));
      list.appendChild(el('dd', { class: cls || '', text: value }));
    }
    row('Subject', r.subject);
    row('Studied', L.formatMinutes(r.studied), 's');
    row('Intentional', L.formatMinutes(r.intentional), 'i');
    row('Distracted', L.formatMinutes(r.distracted), 'd');
    row('Peak Heat', L.HEAT_STAGES[r.peakStage].name);
    if (r.mode === 'timer') row('Work blocks', String(r.blocksDone));
    row('Ingots earned', '+' + result.ingots.total, 'big');
    if (result.ingots.bonus) row('Includes bonus', '+' + result.ingots.bonus);
    row('Streak', result.streakDays ? 'Day ' + result.streakDays + ' (' + result.ingots.mult.toFixed(1) + 'x)' : 'Not yet started');

    var extra = $('reward-extra');
    extra.textContent = '';
    if (s.failReason === 'strict') {
      extra.appendChild(el('p', { class: 'muted', text: 'Strict Mode: you left the exam for more than 10 seconds, so this attempt is marked incomplete.' }));
    } else if (!result.qualifies && r.completed) {
      extra.appendChild(el('p', { class: 'muted small', text: 'Sessions need a little more Studied time to count toward your daily streak.' }));
    }
    if (result.alloyAfter > result.alloyBefore) {
      extra.appendChild(el('div', { class: 'unlock', text: 'New alloy: ' + alloy.name + '! New title unlocked in the Forge Hall.' }));
    }
    result.newAchievements.forEach(function (id) {
      var a = L.ACHIEVEMENTS.filter(function (x) { return x.id === id; })[0];
      extra.appendChild(el('div', { class: 'unlock', text: 'Achievement: ' + a.name + ' — ' + a.desc }));
    });
    $('dlg-reward').showModal();
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3500);
  }

  function confirmDialog(title, text, okLabel) {
    return new Promise(function (resolve) {
      var d = $('dlg-confirm');
      $('confirm-title').textContent = title;
      $('confirm-text').textContent = text;
      $('confirm-ok').textContent = okLabel || 'OK';
      d.returnValue = '';
      d.addEventListener('close', function handler() {
        d.removeEventListener('close', handler);
        resolve(d.returnValue === 'ok');
      });
      d.showModal();
      $('confirm-cancel').focus();
    });
  }

  root.SF.ui = {
    $: $,
    MODE_NAMES: MODE_NAMES,
    renderTop: renderTop,
    renderDashboard: renderDashboard,
    renderLauncher: renderLauncher,
    renderSession: renderSession,
    resetSessionView: resetSessionView,
    renderHistory: renderHistory,
    renderHall: renderHall,
    fillSettings: fillSettings,
    buildCategories: buildCategories,
    showReward: showReward,
    toast: toast,
    confirm: confirmDialog
  };
})(window);
