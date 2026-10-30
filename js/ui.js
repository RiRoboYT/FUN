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

  var MODE_NAMES = { stopwatch: 'Stopwatch', timer: 'Study Timer', exam: 'Exam Timer', manual: 'Logged' };

  function modeName(r) {
    return r.mode === 'manual' ? 'Logged · ' + (r.kind || 'Other') : MODE_NAMES[r.mode];
  }
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

  // The equipped title, as long as its alloy has been forged; otherwise the best one that has.
  function currentTitle(state) {
    var forged = L.forgedIndex(state);
    var t = L.TITLES.filter(function (x) { return x.id === state.equippedTitle; })[0];
    if (t && t.alloy <= forged) return t.name;
    var best = L.TITLES.filter(function (x) { return x.alloy <= forged; }).pop();
    return best ? best.name : L.TITLES[0].name;
  }

  function studiedToday(state, now) {
    var today = L.dayKey(now);
    return state.sessions.reduce(function (sum, r) {
      return L.dayKey(r.endedAt) === today ? sum + r.studied : sum;
    }, 0);
  }

  // ---------- Top bar ----------
  function renderTop(state, now) {
    $('top-title').textContent = currentTitle(state);
    $('top-ingots').textContent = state.totalIngots;
    $('top-streak').textContent = L.currentStreak(state.streak, L.dayKey(now));
    $('top-score').textContent = L.forgeScore(state);
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
    var reached = L.alloyIndex(stats);
    var idx = L.forgedIndex(state);
    var alloy = L.ALLOYS[idx];
    var next = L.ALLOYS[reached + 1];
    var streak = L.currentStreak(state.streak, L.dayKey(now));
    var ready = L.readyToForge(state, reached);

    $('alloy-badge').dataset.alloy = alloy.id;
    $('alloy-name').textContent = alloy.name;
    $('smith-title').textContent = currentTitle(state);
    var tag = $('ready-tag');
    tag.hidden = !ready.length;
    if (ready.length) tag.textContent = L.ALLOYS[ready[0]].name + ' is ready to forge →';
    if (next) {
      alloy = L.ALLOYS[reached];
      $('alloy-next').textContent = 'Next: ' + next.name + ' — ' + next.desc;
      var prev = alloy.ingots;
      $('alloy-progress').style.width = Math.min(100, (state.totalIngots - prev) / (next.ingots - prev) * 100) + '%';
    } else {
      $('alloy-next').textContent = 'You have reached the highest alloy.';
      $('alloy-progress').style.width = '100%';
    }
    $('stat-ingots').textContent = state.totalIngots.toLocaleString();
    $('stat-score').textContent = L.forgeScore(state) + 'G';
    $('ingot-mark').textContent = INGOT_MARKS[L.ALLOYS[idx].id];
    var d = new Date(now);
    var hr = d.getHours();
    $('hero-date').textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    $('hero-greeting').textContent = hr < 5 ? 'Burning the midnight oil' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    var name = (state.settings.smithName || '').trim();
    $('hero-name').textContent = name ? ', ' + name : '';
    $('stat-streak').textContent = streak + (streak === 1 ? ' day' : ' days');
    $('stat-mult').textContent = L.streakMultiplier(streak).toFixed(1) + 'x';
    $('stat-today').textContent = L.formatMinutes(studiedToday(state, now));

    var todayDone = state.streak.lastDay === L.dayKey(now);
    $('streak-note').textContent = todayDone
      ? 'Today counts toward your streak. Keep the fire burning tomorrow.'
      : 'Finish a session with ' + state.settings.streakMinMin + '+ min Studied today to ' + (streak ? 'keep' : 'start') + ' your streak.';
  }

  var INGOT_MARKS = { bronze: 'CU · SN', silver: 'AG 999', gold: 'AU 999.9', platinum: 'PT 950', mythril: 'MI ∞' };

  function rgb(arr) { return arr.map(function (v) { return Math.round(v * 255); }).join(','); }

  // A day tile that glows hotter the more was studied that day.
  function glowTile(tile, studiedMs) {
    var t = L.dayGlow(studiedMs);
    tile.style.setProperty('--t', t.toFixed(3));
    tile.style.setProperty('--c', rgb(L.dayColor(t)));
    tile.classList.toggle('lit', t > 0);
  }

  function renderWeek(state, now) {
    var days = L.dailyTotals(state.sessions);
    var strip = $('week-strip');
    strip.textContent = '';
    var total = 0, studiedDays = 0, best = 0;
    for (var i = 6; i >= 0; i--) {
      var ts = L.addDays(now, -i);
      var key = L.dayKey(ts);
      var ms = days[key] ? days[key].studied : 0;
      total += ms;
      if (ms > 0) studiedDays++;
      best = Math.max(best, ms);
      var dt = new Date(ts);
      var tile = el('div', { class: 'wk-day' + (i === 0 ? ' today' : ''), title: dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) + ' · ' + L.formatMinutes(ms) }, [
        el('span', { class: 'wk-name', text: dt.toLocaleDateString(undefined, { weekday: 'short' }) }),
        el('span', { class: 'wk-tile' }, [el('b', { text: String(dt.getDate()) })]),
        el('span', { class: 'wk-min', text: ms ? L.formatMinutes(ms) : '—' })
      ]);
      glowTile(tile.querySelector('.wk-tile'), ms);
      strip.appendChild(tile);
    }
    var mini = $('week-mini');
    mini.textContent = '';
    [['Last 7 days', L.formatMinutes(total)], ['Days studied', studiedDays + ' / 7'], ['Best day', best ? L.formatMinutes(best) : '—']].forEach(function (p) {
      mini.appendChild(el('div', {}, [el('dt', { text: p[0] }), el('dd', { text: p[1] })]));
    });
  }

  // ---------- Calendar ----------
  function renderCalendar(state, monthTs, selectedKey, now, onPick) {
    var days = L.dailyTotals(state.sessions);
    var first = new Date(monthTs);
    first.setDate(1);
    first.setHours(0, 0, 0, 0);
    var year = first.getFullYear(), month = first.getMonth();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var lead = (first.getDay() + 6) % 7; // Monday first
    var todayKey = L.dayKey(now);
    var thisMonth = new Date(now).getFullYear() === year && new Date(now).getMonth() === month;
    $('cal-label').textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    $('cal-next').disabled = thisMonth || first.getTime() > now;

    var grid = $('cal-grid');
    grid.textContent = '';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) {
      grid.appendChild(el('span', { class: 'cal-dow', text: d }));
    });
    for (var i = 0; i < lead; i++) grid.appendChild(el('span', { class: 'cal-pad' }));

    var total = 0, studied = 0, bestMs = 0, bestDay = null, run = 0, bestRun = 0;
    for (var day = 1; day <= daysInMonth; day++) {
      var date = new Date(year, month, day);
      var key = L.dayKey(date.getTime());
      var info = days[key];
      var ms = info ? info.studied : 0;
      var future = key > todayKey;
      total += ms;
      if (ms > 0) { studied++; run++; bestRun = Math.max(bestRun, run); } else if (!future) run = 0;
      if (ms > bestMs) { bestMs = ms; bestDay = date; }
      var label = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + (ms ? L.formatMinutes(ms) + ' studied' : 'no study');
      var tile = el('button', {
        type: 'button', class: 'cal-day' + (key === todayKey ? ' today' : '') + (key === selectedKey ? ' sel' : '') + (future ? ' future' : ''),
        'aria-label': label, 'aria-pressed': String(key === selectedKey), title: label
      }, [el('b', { text: String(day) }), ms ? el('small', { text: L.formatMinutes(ms) }) : null]);
      if (future) tile.disabled = true;
      glowTile(tile, ms);
      (function (k) { tile.addEventListener('click', function () { onPick(k); }); })(key);
      grid.appendChild(tile);
    }

    var sum = $('cal-summary');
    sum.textContent = '';
    [['Studied this month', L.formatMinutes(total)], ['Days studied', String(studied)],
      ['Best day', bestDay ? bestDay.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' · ' + L.formatMinutes(bestMs) : '—'],
      ['Longest run', bestRun + (bestRun === 1 ? ' day' : ' days')]].forEach(function (p) {
      sum.appendChild(el('div', {}, [el('dt', { text: p[0] }), el('dd', { text: p[1] })]));
    });

    var detail = $('cal-detail');
    detail.textContent = '';
    if (!selectedKey) {
      detail.appendChild(el('p', { class: 'muted small', text: 'Click a day to see what you studied.' }));
      return;
    }
    var parts = selectedKey.split('-').map(Number);
    var sel = new Date(parts[0], parts[1] - 1, parts[2]);
    var dInfo = days[selectedKey];
    detail.appendChild(el('h3', { text: sel.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) }));
    if (!dInfo) {
      detail.appendChild(el('p', { class: 'muted small', text: 'No study logged this day.' }));
      return;
    }
    detail.appendChild(el('p', { class: 'cal-day-total' }, [el('b', { text: L.formatMinutes(dInfo.studied) }), ' studied · ' + dInfo.sessions.length + (dInfo.sessions.length === 1 ? ' session' : ' sessions')]));
    var list = el('ul', { class: 'cal-sessions' });
    dInfo.sessions.slice().sort(function (a, b) { return a.endedAt - b.endedAt; }).forEach(function (r) {
      list.appendChild(el('li', {}, [
        el('span', { class: 'cs-time', text: new Date(r.endedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) }),
        el('span', { class: 'cs-main' }, [el('b', { text: r.subject }), ' ' + modeName(r) + ' · ' + L.formatMinutes(r.studied)]),
        r.note ? el('span', { class: 'cs-note', text: r.note }) : null
      ]));
    });
    detail.appendChild(list);
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
      glowTile(tile, ms);
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
        el('b', { text: r.subject + ' — ' + modeName(r) }),
        el('span', { text: '+' + r.ingots + ' Ingots' }),
        el('span', { class: 'meta', text: fmtDate(r.endedAt) + (r.mode === 'manual' ? '' : ' · Peak ' + L.HEAT_STAGES[r.peakStage].name) }),
        triNode(r),
        r.note ? el('span', { class: 'recent-note', text: '📝 ' + r.note }) : null
      ]));
    });
    box.appendChild(wrap);
  }

  function renderDashboard(state, launch, now, onPickSubject) {
    renderLauncher(launch);
    renderSmith(state, now);
    renderWeek(state, now);
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

    renderClock(s);

    $('sess-timer').textContent = L.formatClock(S.mainClockMs(s));
    $('sess-timer-label').textContent = timerLabel(s);

    $('ofs-banner').hidden = s.status !== 'ofs';
    if (s.status === 'ofs') $('ofs-label').textContent = s.ofs.label;

    setCounter('cnt-studied', s.studied);
    setCounter('cnt-intentional', s.intentional);
    setCounter('cnt-distracted', s.distracted);

    renderHeat(s, view, stage, heat);
    renderSplit(s);

    var np = $('sess-np');
    var radio = $('radio');
    var playing = radio && !radio.hidden && radio.classList.contains('playing');
    np.hidden = !playing;
    if (playing) np.textContent = $('radio-name').textContent.replace(/^♪\s*/, '♪ ');

    if (root.SF.forge) {
      root.SF.forge.update({
        sessionId: s.id, heatMin: heat, stage: S.stageOf(s), cracks: s.cracks, mode: s.mode,
        phase: s.phase, status: s.status, ingots: Math.floor(s.ingotAccum)
      });
    }

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

  // ---------- Big wall clock (12-hour, no seconds) ----------
  function clockParts(d) {
    var h = d.getHours(), m = d.getMinutes();
    return { h: String(h % 12 || 12), m: (m < 10 ? '0' : '') + m, ap: h < 12 ? 'AM' : 'PM' };
  }

  function renderClock(s) {
    var d = new Date();
    var p = clockParts(d);
    if ($('ck-h').textContent !== p.h) $('ck-h').textContent = p.h;
    if ($('ck-m').textContent !== p.m) $('ck-m').textContent = p.m;
    if ($('ck-ap').textContent !== p.ap) $('ck-ap').textContent = p.ap;
    $('sess-clock').dateTime = d.toISOString();
    $('sess-clock').setAttribute('aria-label', p.h + ':' + p.m + ' ' + p.ap);
    $('ck-date').textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    var ends = $('ck-ends');
    var examLive = s.mode === 'exam' && s.status !== 'ready' && s.status !== 'ended';
    ends.hidden = !examLive;
    if (examLive) {
      var e = clockParts(new Date(Date.now() + Math.max(0, s.config.examMs - s.examElapsed)));
      ends.textContent = 'Exam ends at ' + e.h + ':' + e.m + ' ' + e.ap;
    }
  }

  // ---------- Heat ring & split bar ----------
  var RING_C = 2 * Math.PI * 108;
  var ringMarksBuilt = false;

  function buildRingMarks() {
    var g = $('ring-marks');
    var NS = 'http://www.w3.org/2000/svg';
    L.TEMP_MARKS.forEach(function (m) {
      var a = (m.c / L.MAX_TEMP) * Math.PI * 2 - Math.PI / 2;
      var x1 = 120 + Math.cos(a) * 99, y1 = 120 + Math.sin(a) * 99;
      var x2 = 120 + Math.cos(a) * 117, y2 = 120 + Math.sin(a) * 117;
      var line = doc.createElementNS(NS, 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('class', 'ring-mark');
      var t = doc.createElementNS(NS, 'text');
      t.setAttribute('x', 120 + Math.cos(a) * 129);
      t.setAttribute('y', 120 + Math.sin(a) * 129 + 3);
      t.setAttribute('class', 'ring-label');
      t.setAttribute('text-anchor', 'middle');
      t.textContent = m.label + ' ' + m.c + '°';
      var title = doc.createElementNS(NS, 'title');
      title.textContent = m.name + ' at ' + m.c + ' °C';
      line.appendChild(title);
      g.appendChild(line);
      g.appendChild(t);
    });
    ringMarksBuilt = true;
  }

  function renderHeat(s, view, stage, heat) {
    if (!ringMarksBuilt) buildRingMarks();
    var temp = L.tempFromHeat(heat);
    var glow = L.glowAmount(temp);
    var bb = L.heatColor(temp);
    var onBreak = s.mode === 'timer' && s.phase === 'break';
    var frac, color;
    if (s.mode === 'exam') {
      // Exam: the ring is the countdown.
      frac = Math.max(0, 1 - s.examElapsed / s.config.examMs);
      color = '#dfe7f2';
    } else if (onBreak) {
      frac = Math.max(0, 1 - s.phaseElapsed / s.config.breakMs);
      color = '#8fb4e8';
    } else {
      frac = temp / L.MAX_TEMP;
      color = glow > 0.04 ? 'rgb(' + bb.map(function (v) { return Math.round(v * 255); }).join(',') + ')' : '#7d766e';
    }
    view.dataset.mode = s.mode === 'timer' && onBreak ? 'break' : s.mode;
    view.style.setProperty('--heat-rgb', bb.map(function (v) { return Math.round(v * 255); }).join(','));
    view.style.setProperty('--heat-glow', glow.toFixed(3));
    view.style.setProperty('--ring-color', color);
    var ring = $('ring-fill');
    ring.style.strokeDasharray = RING_C.toFixed(1);
    ring.style.strokeDashoffset = (RING_C * (1 - frac)).toFixed(1);

    $('sess-temp').textContent = Math.round(temp).toLocaleString();
    $('heat-stage').textContent = stage.name;
    var meter = $('heat-meter');
    meter.setAttribute('aria-valuenow', String(Math.round(temp)));
    meter.setAttribute('aria-valuetext', Math.round(temp) + ' degrees Celsius, ' + stage.name);
    $('heat-meta').textContent = stage.mult.toFixed(2).replace(/0$/, '') + 'x · ' + Math.floor(s.ingotAccum) + ' Ingots' +
      (s.bonusIngots ? ' (+' + s.bonusIngots + ' bonus)' : '');
  }

  function renderSplit(s) {
    var total = s.studied + s.intentional + s.distracted;
    var pct = function (v) { return total ? (v / total * 100).toFixed(2) + '%' : '0%'; };
    $('seg-s').style.width = total ? pct(s.studied) : '100%';
    $('seg-s').classList.toggle('empty', !total);
    $('seg-i').style.width = pct(s.intentional);
    $('seg-d').style.width = pct(s.distracted);
  }

  function setIcon(btn, id) {
    var use = btn.querySelector('.ico use');
    if (use.getAttribute('href') !== '#' + id) use.setAttribute('href', '#' + id);
  }

  function resetSessionView() { lastVals = {}; }

  // ---------- History ----------
  function renderHistory(state, onDelete) {
    var body = $('history-body');
    body.textContent = '';
    var list = state.sessions.slice().reverse();
    $('history-empty').hidden = list.length > 0;
    list.forEach(function (r) {
      var result = r.mode === 'manual' ? el('span', { class: 'tag logged', text: 'Logged' })
        : r.legendary ? el('span', { class: 'tag legend', text: 'Legendary' })
        : r.completed ? el('span', { class: 'tag ok', text: 'Complete' })
        : el('span', { class: 'tag fail', text: r.failReason === 'strict' ? 'Strict fail' : 'Incomplete' });
      body.appendChild(el('tr', {}, [
        el('td', { text: fmtDate(r.endedAt) }),
        el('td', { text: modeName(r) }),
        el('td', { text: r.subject }),
        el('td', { class: 'num s', text: L.formatMinutes(r.studied) }),
        el('td', { class: 'num i', text: L.formatMinutes(r.intentional) }),
        el('td', { class: 'num d', text: L.formatMinutes(r.distracted) }),
        el('td', { text: r.mode === 'manual' ? '—' : L.HEAT_STAGES[r.peakStage].name }),
        el('td', { class: 'num', text: '+' + r.ingots }),
        el('td', {}, [result]),
        el('td', { class: 'note-cell', text: r.note || '', title: r.note || '' }),
        el('td', {}, [r.mode === 'manual'
          ? el('button', { class: 'btn btn-danger btn-small', type: 'button', text: 'Delete', 'aria-label': 'Delete logged entry',
              onclick: function () { onDelete(r); } })
          : null])
      ]));
    });
  }

  // ---------- Weekly stats ----------
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, text) {
    var n = doc.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }

  var DISTRACTION_NAMES = {
    youtube: 'YouTube', instagram: 'Instagram', roblox: 'Roblox', other: 'Other sites/apps',
    overrun: 'Open for Study overrun', unclassified: 'Left during session'
  };

  function hoursLabel(ms) {
    var m = Math.round(ms / L.MIN);
    if (!m) return '0m';
    return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
  }

  function renderChart(days, todayKey) {
    var W = 720, H = 280, left = 44, right = 10, top = 22, bottom = 34;
    var maxMs = Math.max(L.MIN * 60, Math.max.apply(null, days.map(function (d) {
      return d.studied + d.intentional + d.distracted;
    })));
    var maxH = Math.ceil(maxMs / (60 * L.MIN));
    var stepH = maxH > 8 ? 2 : 1;
    maxH = Math.ceil(maxH / stepH) * stepH;
    var plotH = H - top - bottom, plotW = W - left - right;
    var y = function (ms) { return top + plotH - (ms / (maxH * 60 * L.MIN)) * plotH; };

    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img',
      'aria-label': 'Studied, intentional and distracted time for each day of the week' });
    for (var h = 0; h <= maxH; h += stepH) {
      var gy = y(h * 60 * L.MIN);
      root.appendChild(svg('line', { x1: left, x2: W - right, y1: gy, y2: gy, class: 'grid' }));
      root.appendChild(svg('text', { x: left - 8, y: gy + 4, class: 'axis', 'text-anchor': 'end' }, h + 'h'));
    }
    var slot = plotW / 7, bw = Math.min(56, slot * 0.6);
    days.forEach(function (d, i) {
      var x = left + slot * i + (slot - bw) / 2;
      var base = top + plotH;
      var g = svg('g', { class: 'bar' + (d.key === todayKey ? ' today' : '') });
      [['studied', 's'], ['intentional', 'i'], ['distracted', 'd']].forEach(function (p) {
        var ms = d[p[0]];
        if (!ms) return;
        var hgt = (ms / (maxH * 60 * L.MIN)) * plotH;
        base -= hgt;
        g.appendChild(svg('rect', { x: x, y: base, width: bw, height: Math.max(1, hgt), rx: 3, class: 'seg ' + p[1] }));
      });
      var total = d.studied + d.intentional + d.distracted;
      g.appendChild(svg('title', {}, new Date(d.ts).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) +
        '\nStudied ' + hoursLabel(d.studied) + '\nIntentional ' + hoursLabel(d.intentional) + '\nDistracted ' + hoursLabel(d.distracted)));
      if (total) g.appendChild(svg('text', { x: x + bw / 2, y: base - 6, class: 'val', 'text-anchor': 'middle' }, hoursLabel(d.studied)));
      var dt = new Date(d.ts);
      g.appendChild(svg('text', { x: x + bw / 2, y: H - 12, class: 'axis day', 'text-anchor': 'middle' },
        dt.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + dt.getDate()));
      root.appendChild(g);
    });
    return root;
  }

  function renderHBars(box, entries, cls, emptyText) {
    box.textContent = '';
    if (!entries.length) {
      box.appendChild(el('p', { class: 'muted', text: emptyText }));
      return;
    }
    var max = entries[0][1];
    entries.forEach(function (e) {
      var fill = el('div', { class: 'hbar-fill ' + cls });
      fill.style.width = Math.max(2, e[1] / max * 100) + '%';
      box.appendChild(el('div', { class: 'hbar' }, [
        el('span', { class: 'hbar-name', text: e[0] }),
        el('div', { class: 'hbar-track' }, [fill]),
        el('span', { class: 'hbar-val', text: hoursLabel(e[1]) })
      ]));
    });
  }

  function sortedEntries(obj, rename) {
    return Object.keys(obj).filter(function (k) { return obj[k] > 0; })
      .map(function (k) { return [rename ? (rename[k] || k) : k, obj[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
  }

  function renderStats(state, startTs, now) {
    var w = L.weekStats(state.sessions, startTs);
    var prev = L.weekStats(state.sessions, L.addDays(startTs, -7));
    var thisWeek = L.weekStart(now) === startTs;
    var end = new Date(L.addDays(startTs, 6));
    var fmt = { day: 'numeric', month: 'short' };
    $('week-label').textContent = thisWeek ? 'This week' :
      new Date(startTs).toLocaleDateString(undefined, fmt) + ' – ' + end.toLocaleDateString(undefined, fmt);
    $('week-next').disabled = thisWeek;

    var daysSoFar = thisWeek ? Math.floor((now - startTs) / 86400000) + 1 : 7;
    var best = w.days.reduce(function (a, d) { return d.studied > a.studied ? d : a; }, w.days[0]);
    var change = prev.totals.studied
      ? Math.round((w.totals.studied - prev.totals.studied) / prev.totals.studied * 100) : null;
    var t = w.totals;
    var focus = t.studied + t.distracted ? Math.round(t.studied / (t.studied + t.distracted) * 100) : null;

    var box = $('week-totals');
    box.textContent = '';
    [
      ['Studied', hoursLabel(t.studied)],
      ['Daily average', hoursLabel(t.studied / daysSoFar)],
      ['Best day', best.studied ? new Date(best.ts).toLocaleDateString(undefined, { weekday: 'long' }) + ' · ' + hoursLabel(best.studied) : '—'],
      ['Distracted', hoursLabel(t.distracted)],
      ['Focus score', focus == null ? '—' : focus + '%'],
      ['vs last week', change == null ? '—' : (change >= 0 ? '+' : '') + change + '%'],
      ['Logged (tuition etc.)', hoursLabel(t.logged)],
      ['Sessions', String(t.sessions)]
    ].forEach(function (p) {
      box.appendChild(el('div', {}, [el('dt', { text: p[0] }), el('dd', { text: p[1] })]));
    });

    var chart = $('week-chart');
    chart.textContent = '';
    chart.appendChild(renderChart(w.days, L.dayKey(now)));

    renderHBars($('week-subjects'), sortedEntries(w.subjects), 's', 'No studying logged this week yet.');
    renderHBars($('week-distractions'), sortedEntries(w.distractions, DISTRACTION_NAMES), 'd',
      t.distracted ? 'Distraction from sessions before v2.1 isn\'t broken down by source.' : 'No distractions this week. 🔥');
  }

  // ---------- Forge Hall ----------
  function renderHall(state, onEquip) {
    var idx = L.forgedIndex(state);
    var reached = L.alloyIndex(S.statsOf(state));
    var row = $('alloy-row');
    row.textContent = '';
    L.ALLOYS.forEach(function (a, i) {
      var ready = i > idx && i <= reached;
      row.appendChild(el('div', { class: 'alloy-card' + (i > idx && !ready ? ' locked' : '') }, [
        el('div', { class: 'alloy-badge', 'data-alloy': a.id }, [el('span', { text: a.name })]),
        el('b', { text: a.name + (i === idx ? ' (current)' : ready ? ' (ready to forge)' : '') }),
        el('p', { text: a.desc })
      ]));
    });

    var titles = $('title-list');
    titles.textContent = '';
    L.TITLES.forEach(function (t) {
      var unlocked = t.alloy <= idx;
      var equipped = state.equippedTitle === t.id && unlocked;
      var btn = unlocked && !equipped
        ? el('button', { class: 'btn', type: 'button', text: 'Equip', onclick: function () { onEquip(t.id); } })
        : el('span', { class: 'muted small', text: equipped && unlocked ? 'Equipped' : 'Forge ' + L.ALLOYS[t.alloy].name + ' to unlock' });
      titles.appendChild(el('div', { class: 'title-item' + (equipped ? ' equipped' : '') + (unlocked ? '' : ' locked') }, [
        el('b', { text: t.name }), btn
      ]));
    });

    renderAchievements(state);
  }

  function progressOf(a, t) {
    if (!a.progress) return null;
    var p = a.progress(t);
    var cur = Math.min(p[0], p[1]);
    var shown = p[2] === 'h' ? cur.toFixed(1).replace(/\.0$/, '') : Math.floor(cur);
    return { frac: cur / p[1], text: shown + ' / ' + p[1] + ' ' + p[2] };
  }

  function renderAchievements(state) {
    var t = L.achievementStats(state);
    var got = state.achievements;
    var total = L.ACHIEVEMENTS.length;
    var unlocked = L.ACHIEVEMENTS.filter(function (a) { return got[a.id]; }).length;
    var maxScore = L.ACHIEVEMENTS.reduce(function (sum, a) { return sum + L.TIERS[a.tier].points; }, 0);

    var sum = $('ach-summary');
    sum.textContent = '';
    var bar = el('div', { class: 'progress' }, [el('div', { class: 'progress-fill' })]);
    bar.firstChild.style.width = (unlocked / total * 100) + '%';
    sum.appendChild(el('div', { class: 'ach-score' }, [
      el('b', { text: '🏆 ' + L.forgeScore(state) + 'G' }),
      el('span', { class: 'muted', text: ' / ' + maxScore + 'G · ' + unlocked + ' of ' + total + ' unlocked' })
    ]));
    sum.appendChild(bar);

    // Unlocked first (newest first), then locked by how close they are, secrets last.
    var list = L.ACHIEVEMENTS.slice().sort(function (a, b) {
      var ga = got[a.id] || 0, gb = got[b.id] || 0;
      if (ga || gb) return gb - ga;
      if (!!a.secret !== !!b.secret) return a.secret ? 1 : -1;
      var pa = progressOf(a, t), pb = progressOf(b, t);
      return (pb ? pb.frac : 0) - (pa ? pa.frac : 0);
    });

    var grid = $('ach-grid');
    grid.textContent = '';
    list.forEach(function (a) {
      var at = got[a.id];
      var tier = L.TIERS[a.tier];
      var hidden = a.secret && !at;
      var prog = !at && !hidden ? progressOf(a, t) : null;
      var progNode = null;
      if (prog) {
        var pb = el('div', { class: 'progress' }, [el('div', { class: 'progress-fill' })]);
        pb.firstChild.style.width = (prog.frac * 100) + '%';
        progNode = el('div', { class: 'ach-progress' }, [pb, el('small', { text: prog.text })]);
      }
      grid.appendChild(el('div', { class: 'ach tier-' + a.tier + (at ? ' got' : ' locked') + (hidden ? ' secret' : '') }, [
        el('div', { class: 'ach-icon', 'aria-hidden': 'true', text: hidden ? '?' : a.icon }),
        el('div', { class: 'ach-info' }, [
          el('b', { text: hidden ? 'Secret achievement' : a.name }),
          el('span', { class: 'ach-desc', text: hidden ? 'Keep forging to discover this one.' : a.desc }),
          el('div', { class: 'ach-meta' }, [
            el('span', { class: 'tier-tag', text: tier.name }),
            el('span', { text: tier.points + 'G' }),
            el('span', { text: '+' + tier.ingots + ' Ingots' })
          ]),
          progNode,
          at ? el('small', { class: 'ach-date', text: 'Unlocked ' + new Date(at).toLocaleDateString() }) : null
        ])
      ]));
    });
  }

  // ---------- Xbox-style achievement pop-up ----------
  var achQueue = [];
  var achBusy = false;

  function topHost() {
    var open = doc.querySelectorAll('dialog[open]');
    return open.length ? open[open.length - 1] : doc.body;
  }

  function achievementToast(id) {
    achQueue.push(id);
    if (!achBusy) nextAchievement();
  }

  function nextAchievement() {
    var id = achQueue.shift();
    if (!id) { achBusy = false; return; }
    achBusy = true;
    var a = L.achievementById(id);
    var tier = L.TIERS[a.tier];
    var node = el('div', { class: 'xa tier-' + a.tier, role: 'status', 'aria-live': 'polite' }, [
      el('div', { class: 'xa-orb' }, [el('span', { class: 'xa-icon', text: a.icon })]),
      el('div', { class: 'xa-body' }, [
        el('small', { text: a.secret ? 'Secret achievement unlocked' : 'Achievement unlocked' }),
        el('b', { text: tier.points + 'G – ' + a.name }),
        el('span', { class: 'xa-reward', text: '+' + tier.ingots + ' Ingots' })
      ])
    ]);
    topHost().appendChild(node);
    root.SF.sound.play('achievement');
    void node.offsetWidth;
    node.classList.add('in');
    setTimeout(function () { node.classList.add('open'); }, 450);
    setTimeout(function () { node.classList.remove('open'); }, 5200);
    setTimeout(function () { node.classList.add('out'); }, 5700);
    setTimeout(function () { node.remove(); nextAchievement(); }, 6150);
  }

  // Keep a showing pop-up above modal dialogs as they open and close.
  new MutationObserver(function () {
    var node = doc.querySelector('.xa');
    if (node && node.parentNode !== topHost()) topHost().appendChild(node);
  }).observe(doc.body, { attributes: true, attributeFilter: ['open'], subtree: true });

  // ---------- Settings ----------
  function fillSettings(state) {
    var f = $('settings-form');
    var st = state.settings;
    ['workMin', 'breakMin', 'examMin', 'streakMinMin', 'smithName'].forEach(function (k) { f.elements[k].value = st[k]; });
    ['strictExam', 'sound', 'notifications', 'fxCursor', 'fxRadio', 'calmForge'].forEach(function (k) { f.elements[k].checked = !!st[k]; });
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
    $('reward-note').value = '';
    $('dlg-reward').dataset.recordId = r.id;
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
      var a = L.achievementById(id);
      var tier = L.TIERS[a.tier];
      extra.appendChild(el('div', { class: 'unlock tier-' + a.tier }, [
        el('span', { class: 'unlock-icon', text: a.icon }),
        el('span', { text: a.name + ' — ' + tier.points + 'G · +' + tier.ingots + ' Ingots' })
      ]));
    });
    if (result.achievementIngots) {
      row('Achievement rewards', '+' + result.achievementIngots, 'big');
    }
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
    renderStats: renderStats,
    renderCalendar: renderCalendar,
    modeName: modeName,
    renderHall: renderHall,
    achievementToast: achievementToast,
    fillSettings: fillSettings,
    buildCategories: buildCategories,
    showReward: showReward,
    toast: toast,
    confirm: confirmDialog
  };
})(window);
