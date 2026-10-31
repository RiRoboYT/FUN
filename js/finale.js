/* StudyForge v3 — the session-end finale. A ~7 second GSAP-timed sequence: the forge quenches
   your work (3D, when available), then the tally builds line by line, Ingots fly into your bank,
   the peak-heat seal stamps down and the card settles into a summary. Skippable at any moment. */
(function (root) {
  'use strict';

  var doc = root.document;
  var L = root.SF.logic;
  var sound = root.SF.sound;
  var reducedMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(id) { return doc.getElementById(id); }

  var tl = null;
  var active = false;
  var settled = false;
  var opts = null;
  var finals = null;

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function sessionUi() {
    return Array.prototype.slice.call(doc.querySelectorAll(
      '#view-session .session-strip, #view-session .dial, #view-session .split, #view-session .controls, #view-session .ofs-banner, #radio'));
  }

  function rgb(arr) { return arr.map(function (v) { return Math.round(v * 255); }).join(','); }

  // What the tally says, derived from the finished session.
  function build(result, s, state) {
    var r = result.record;
    var kind = s.failReason === 'strict' ? 'fail' : !s.completed ? 'unfinished' : 'complete';
    var forged = L.ALLOYS[L.forgedIndex(state)];
    var stage = L.HEAT_STAGES[r.peakStage];
    var achIngots = result.achievementIngots || 0;
    var total = result.ingots.total + achIngots;
    var rows = [{
      label: 'Heat yield', detail: L.formatMinutes(r.studied) + ' studied · peak ' + stage.name,
      value: Math.floor(s.ingotAccum), prefix: '+'
    }, {
      label: 'Streak', detail: result.streakDays ? 'Day ' + result.streakDays : 'Start a streak with 20+ min a day',
      value: result.ingots.mult, prefix: '×', decimals: 1
    }];
    if (result.ingots.bonus) {
      var parts = [];
      if (s.bonusIngots) parts.push(s.blocksDone + ' clean work block' + (s.blocksDone === 1 ? '' : 's'));
      if (r.legendary) parts.push('Legendary Attempt');
      rows.push({ label: 'Bonuses', detail: parts.join(' · ') || 'Bonus', value: result.ingots.bonus, prefix: '+' });
    }
    if (achIngots) {
      rows.push({ label: 'Achievements', detail: result.newAchievements.length + ' unlocked', value: achIngots, prefix: '+' });
    }

    var title = kind === 'fail' ? 'The metal gave way'
      : kind === 'unfinished' ? 'An unfinished ingot'
      : r.legendary ? 'Legendary Attempt'
      : forged.name + ' ingot forged';

    var reached = L.alloyIndex({ totalIngots: state.totalIngots, longestStudiedMin: longest(state), bestStreak: (state.streak && state.streak.best) || 0 });
    var next = L.ALLOYS[reached + 1];
    var bankAfter = root.SF.shop ? root.SF.shop.wallet(state) : state.totalIngots, bankBefore = Math.max(0, bankAfter - total);
    var progress = null;
    if (next) {
      var lo = L.ALLOYS[reached].ingots, span = next.ingots - lo;
      progress = {
        label: next.name,
        from: Math.max(0, Math.min(1, (bankBefore - lo) / span)),
        to: Math.max(0, Math.min(1, (bankAfter - lo) / span)),
        text: Math.min(bankAfter, next.ingots) + ' / ' + next.ingots + ' Ingots'
      };
    }
    var ready = L.readyToForge(state, reached);
    var temp = L.tempFromHeat(stage.min + 1);
    return {
      kind: kind, title: title, rows: rows, total: total, bankBefore: bankBefore, bankAfter: bankAfter,
      stage: stage, sealRgb: rgb(L.heatColor(Math.max(temp, 520))), progress: progress,
      ready: ready.length ? L.ALLOYS[ready[0]].name : null,
      eyebrow: (root.SF.ui.MODE_NAMES[r.mode] || 'Session') + ' · ' + r.subject,
      meta: [['s', 'Studied', r.studied], ['i', 'Intentional', r.intentional], ['d', 'Distracted', r.distracted]],
      extras: result.newAchievements.map(function (id) {
        var a = L.achievementById(id);
        return a ? a.icon + ' ' + a.name + ' · ' + L.TIERS[a.tier].points + 'G' : null;
      }).filter(Boolean)
    };
  }

  function longest(state) {
    return state.sessions.reduce(function (m, r) { return Math.max(m, r.studied); }, 0) / L.MIN;
  }

  function fmt(row, v) {
    return row.prefix + (row.decimals ? v.toFixed(row.decimals) : Math.round(v).toLocaleString());
  }

  // ---------- Render ----------
  function prepare(f) {
    var card = $('fin-card');
    card.dataset.kind = f.kind;
    $('fin-eyebrow').textContent = f.eyebrow;
    $('fin-title').textContent = f.kind === 'fail' ? 'The forge went cold…' : 'Into the quench…';
    var meta = $('fin-meta');
    meta.textContent = '';
    f.meta.forEach(function (m) {
      var chip = el('span', 'fin-chip ' + m[0]);
      chip.appendChild(el('i'));
      chip.appendChild(doc.createTextNode(m[1] + ' '));
      chip.appendChild(el('b', null, L.formatMinutes(m[2])));
      meta.appendChild(chip);
    });
    var tally = $('fin-tally');
    tally.textContent = '';
    f.rows.forEach(function (row) {
      var li = el('li', 'fin-row');
      var left = el('div', 'fin-row-text');
      left.appendChild(el('b', null, row.label));
      left.appendChild(el('span', null, row.detail));
      li.appendChild(left);
      var val = el('span', 'fin-row-val', fmt(row, 0));
      li.appendChild(val);
      row.node = li;
      row.valNode = val;
      tally.appendChild(li);
    });
    $('fin-total').textContent = '+0';
    $('fin-bank').textContent = f.bankBefore.toLocaleString();
    var seal = $('fin-seal');
    seal.style.setProperty('--seal-rgb', f.sealRgb);
    $('fin-seal-name').textContent = f.kind === 'fail' ? 'Cracked' : f.stage.name;
    var prog = $('fin-progress');
    prog.hidden = !f.progress;
    if (f.progress) {
      $('fin-alloy-label').textContent = 'Toward ' + f.progress.label;
      $('fin-alloy-val').textContent = f.progress.text;
      $('fin-alloy-fill').style.width = (f.progress.from * 100) + '%';
    }
    $('fin-ready').hidden = true;
    if (f.ready) $('fin-ready-text').textContent = f.ready + ' is ready to forge';
    var extra = $('fin-extra');
    extra.textContent = '';
    f.extras.forEach(function (t) { extra.appendChild(el('span', 'fin-extra-item', t)); });
    $('fin-note').value = '';
  }

  // The end state, applied directly (used by skip and by reduced motion).
  function finalize() {
    var f = finals;
    $('fin-title').textContent = f.title;
    f.rows.forEach(function (row) { row.valNode.textContent = fmt(row, row.value); });
    $('fin-total').textContent = '+' + f.total.toLocaleString();
    $('fin-bank').textContent = f.bankAfter.toLocaleString();
    if (f.progress) $('fin-alloy-fill').style.width = (f.progress.to * 100) + '%';
    $('fin-ready').hidden = !f.ready;
    doc.querySelectorAll('.fly-ingot').forEach(function (n) { n.remove(); });
  }

  function settle() {
    if (settled) return;
    settled = true;
    finalize();
    var all = ['#fin-card', '.fin-head > *', '.fin-row', '.fin-total', '#fin-seal', '#fin-progress', '#fin-extra', '.fin-note', '.fin-actions', '.finale-veil'];
    if (root.gsap) {
      root.gsap.set(all, { clearProps: 'transform' });
      root.gsap.set(all, { autoAlpha: 1 });
      root.gsap.to('#fin-skip', { autoAlpha: 0, duration: 0.25 });
    }
    if (finals.ready) $('fin-ready').hidden = false;
    $('fin-done').focus({ preventScroll: true });
    if (opts.onSettled) opts.onSettled();
  }

  function flyIngots(f) {
    var from = $('fin-total').getBoundingClientRect();
    var to = $('fin-bank').getBoundingClientRect();
    var n = Math.min(8, Math.max(3, Math.round(f.total / 3)));
    var g = root.gsap.timeline();
    for (var i = 0; i < n; i++) {
      var ing = el('i', 'ingot-icon fly-ingot');
      ing.style.left = (from.left + from.width / 2) + 'px';
      ing.style.top = (from.top + from.height / 2) + 'px';
      doc.body.appendChild(ing);
      (function (node, k) {
        g.fromTo(node, { x: 0, y: 0, scale: 0.6, autoAlpha: 0 }, {
          keyframes: [
            { autoAlpha: 1, scale: 1.3, x: (Math.random() - 0.5) * 40, y: -30 - Math.random() * 30, duration: 0.22, ease: 'power2.out' },
            { x: to.left - from.left - from.width / 2 + 10, y: to.top - from.top - from.height / 2 + 6, scale: 0.7, duration: 0.42, ease: 'power3.in' },
            { autoAlpha: 0, duration: 0.08 }
          ],
          onComplete: function () { node.remove(); if (k % 2 === 0) sound.play('tick'); }
        }, k * 0.06);
      })(ing, i);
    }
    return g;
  }

  // ---------- Play ----------
  function play(o) {
    opts = o;
    finals = build(o.result, o.session, o.state);
    prepare(finals);
    var root$ = $('finale');
    root$.hidden = false;
    root$.dataset.kind = finals.kind;
    active = true;
    settled = false;
    var gsap = root.gsap;

    // The 3D forge plays the quench (or the crack) behind the card, when it's available.
    var forged = L.ALLOYS[L.forgedIndex(o.state)];
    if (root.SF.forge && root.SF.forge.finale) root.SF.forge.finale(finals.kind, forged.id);

    if (!gsap || reducedMotion) {
      sessionUi().forEach(function (n) { n.style.visibility = 'hidden'; });
      settle();
      return;
    }

    var ui = sessionUi();
    gsap.set(['#fin-card', '.fin-head > *', '.fin-row', '.fin-total', '#fin-seal', '#fin-progress', '#fin-extra', '.fin-note', '.fin-actions'], { autoAlpha: 0 });
    gsap.set('.finale-veil', { autoAlpha: 0 });
    gsap.set('#fin-skip', { autoAlpha: 0 });

    tl = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: settle });
    tl.to(ui, { autoAlpha: 0, y: 8, duration: 0.6, ease: 'power2.inOut' }, 0)
      .to('.finale-veil', { autoAlpha: 1, duration: 1.0 }, 0)
      .to('#fin-skip', { autoAlpha: 1, duration: 0.4 }, 0.4)
      .call(function () { sound.play('whoosh'); }, null, 0.55)
      .fromTo('#fin-card', { autoAlpha: 0, x: -36, scale: 0.98 }, { autoAlpha: 1, x: 0, scale: 1, duration: 0.8 }, 0.6)
      .fromTo('.fin-head > *', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.1 }, 0.8)
      // The reveal: the quenched metal comes out of the steam and the title resolves.
      .to('#fin-title', { autoAlpha: 0, y: -8, filter: 'blur(4px)', duration: 0.25, ease: 'power2.in' }, 2.75)
      .call(function () { $('fin-title').textContent = finals.title; }, null, 3.0)
      .fromTo('#fin-title', { autoAlpha: 0, y: 10, filter: 'blur(6px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.5 }, 3.0);

    // Tally rows, one after another, each counting up with a tick.
    var t = 3.2;
    finals.rows.forEach(function (row) {
      tl.fromTo(row.node, { autoAlpha: 0, x: -14 }, { autoAlpha: 1, x: 0, duration: 0.35 }, t);
      var counter = { v: 0 };
      tl.to(counter, {
        v: row.value, duration: 0.38, ease: 'power2.out',
        onUpdate: function () { row.valNode.textContent = fmt(row, counter.v); },
        onStart: function () { sound.play('tick'); }
      }, t + 0.06);
      t += 0.42;
    });

    // The total counts up, then the Ingots fly into the bank.
    var tot = { v: 0 }, bank = { v: finals.bankBefore };
    tl.fromTo('.fin-total', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35 }, t)
      .to(tot, {
        v: finals.total, duration: 0.6, ease: 'power3.out',
        onUpdate: function () { $('fin-total').textContent = '+' + Math.round(tot.v).toLocaleString(); }
      }, t + 0.05)
      .call(function () { if (finals.total > 0) flyIngots(finals); }, null, t + 0.5)
      .to(bank, {
        v: finals.bankAfter, duration: 0.55, ease: 'power2.inOut',
        onUpdate: function () { $('fin-bank').textContent = Math.round(bank.v).toLocaleString(); }
      }, t + 0.75);
    t += 1.0;

    // The seal stamps down.
    tl.fromTo('#fin-seal', { autoAlpha: 0, scale: 2.6, rotation: -28 }, { autoAlpha: 1, scale: 1, rotation: -9, duration: 0.32, ease: 'power4.in' }, t)
      .call(function () { sound.play('thud'); }, null, t + 0.3)
      .fromTo('#fin-card', { x: 0 }, { keyframes: [{ x: -4, duration: 0.04 }, { x: 4, duration: 0.05 }, { x: -2, duration: 0.05 }, { x: 0, duration: 0.05 }] }, t + 0.3);
    t += 0.5;

    if (finals.progress) {
      tl.fromTo('#fin-progress', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.35 }, t)
        .to('#fin-alloy-fill', { width: (finals.progress.to * 100) + '%', duration: 0.7, ease: 'power2.inOut' }, t + 0.1);
      t += 0.55;
    }
    if (finals.ready) {
      tl.call(function () { $('fin-ready').hidden = false; }, null, t)
        .fromTo('#fin-ready', { autoAlpha: 0, scale: 0.96 }, { autoAlpha: 1, scale: 1, duration: 0.4 }, t);
      t += 0.2;
    }
    tl.to('#fin-extra', { autoAlpha: 1, duration: 0.3 }, t)
      .fromTo(['.fin-note', '.fin-actions'], { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.08 }, t + 0.05);
  }

  function skip() {
    if (!active || settled) return;
    if (tl) tl.progress(1, true);
    if (root.SF.forge && root.SF.forge.finaleSkip) root.SF.forge.finaleSkip();
    settle();
  }

  function close(target) {
    if (!active) return;
    if (!settled) skip();
    var note = $('fin-note').value.trim();
    var finish = function () {
      $('finale').hidden = true;
      active = false;
      sessionUi().forEach(function (n) { n.style.removeProperty('visibility'); });
      if (root.gsap) root.gsap.set(sessionUi(), { clearProps: 'opacity,visibility,transform' });
      var cb = opts.onClose;
      opts = null;
      if (cb) cb(note, target);
    };
    if (root.gsap && !reducedMotion) root.gsap.to('#finale', { autoAlpha: 0, duration: 0.35, onComplete: function () { root.gsap.set('#finale', { clearProps: 'all' }); finish(); } });
    else finish();
  }

  function wire() {
    $('fin-skip').addEventListener('click', skip);
    $('fin-done').addEventListener('click', function () { close('dashboard'); });
    $('fin-vault').addEventListener('click', function () { close('hall'); });
    $('finale').addEventListener('click', function (e) {
      if (!settled && !e.target.closest('button, textarea')) skip();
    });
    doc.addEventListener('keydown', function (e) {
      if (!active) return;
      if (e.target.tagName === 'TEXTAREA') return;
      if (!settled && (e.code === 'Space' || e.key === 'Escape' || e.key === 'Enter')) { e.preventDefault(); e.stopPropagation(); skip(); }
      else if (settled && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close('dashboard'); }
    }, true);
  }

  wire();
  // A hitch (a shader compiling, a tab switch) pauses the animations instead of skipping
  // ahead, so nothing is missed; ordinary slow frames still run in real time.
  if (root.gsap) root.gsap.ticker.lagSmoothing(250, 33);
  root.SF = root.SF || {};
  root.SF.finale = { play: play, skip: skip, isActive: function () { return active; } };
})(window);
