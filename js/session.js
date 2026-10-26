/* StudyForge — session engine (no DOM). Every function takes `now` explicitly so the
   engine is deterministic and testable; the app feeds it Date.now() and visibility events. */
(function (root) {
  'use strict';

  var L = (typeof module !== 'undefined' && module.exports) ? require('./logic.js') : root.SF.logic;

  // Away periods shorter than this are alt-tab jitter, not a real absence.
  var SHORT_AWAY_MS = 3000;
  // Exam Strict Mode: leaving for longer than this ends the attempt.
  var STRICT_LIMIT_MS = 10000;
  // Sessions shorter than this are discarded instead of logged.
  var MIN_SESSION_MS = 60000;

  function createSession(opts, now) {
    var cfg = opts.config || {};
    return {
      id: 's' + now.toString(36) + Math.random().toString(36).slice(2, 6),
      mode: opts.mode,
      subject: opts.subject,
      config: {
        workMs: (cfg.workMin || 25) * L.MIN,
        breakMs: (cfg.breakMin || 5) * L.MIN,
        examMs: (cfg.examMin || 60) * L.MIN,
        strict: !!cfg.strict
      },
      status: 'ready',
      createdAt: now,
      startedAt: null,
      endedAt: null,
      lastTick: now,
      hidden: false,
      studied: 0,
      intentional: 0,
      distracted: 0,
      breakTotal: 0,
      pendingMs: 0,
      awayStart: null,
      frozen: false,
      ingotAccum: 0,
      bonusIngots: 0,
      peakStage: 0,
      cracks: 0,
      phase: 'work',
      phaseElapsed: 0,
      blocksDone: 0,
      blockDistracted: 0,
      deferredBlock: null,
      examElapsed: 0,
      ofs: null,
      completed: false,
      failReason: null,
      log: []
    };
  }

  function stageOf(s) {
    return L.heatStageIndex(L.heatMinutes(s.studied, s.distracted));
  }

  function heatOf(s) {
    return L.heatMinutes(s.studied, s.distracted);
  }

  function phaseLen(s) {
    return s.phase === 'work' ? s.config.workMs : s.config.breakMs;
  }

  function isActive(s) {
    return s.status === 'running' || s.status === 'away' || s.status === 'classify';
  }

  function updatePeak(s, events) {
    var st = stageOf(s);
    if (st > s.peakStage) {
      events.push({ type: 'stage-up', stage: st });
      s.peakStage = st;
    }
  }

  function addDistracted(s, ms, events) {
    s.distracted += ms;
    if (ms >= L.CRACK_THRESHOLD_MS && s.cracks < L.MAX_CRACKS) {
      s.cracks++;
      events.push({ type: 'crack', cracks: s.cracks });
    }
  }

  // Time in a work phase / stopwatch / exam: Studied when present, pending when away.
  function accrue(s, ms) {
    if (s.status === 'running') {
      s.ingotAccum += L.ingotsFor(ms, stageOf(s));
      s.studied += ms;
    } else {
      s.pendingMs += ms;
    }
  }

  function endWorkBlock(s, events) {
    s.blocksDone++;
    if (s.pendingMs === 0) {
      var bonus = L.blockBonus(s.config.workMs, s.blockDistracted);
      s.bonusIngots += bonus;
      events.push({ type: 'block-done', bonus: bonus });
    } else if (!s.deferredBlock) {
      // Can't judge the block until the away time is classified.
      s.deferredBlock = { distracted: s.blockDistracted, pending: s.pendingMs };
    }
    s.blockDistracted = 0;
  }

  function advanceTimer(s, dt, now, events) {
    while (dt > 0) {
      var chunk = Math.min(dt, phaseLen(s) - s.phaseElapsed);
      if (s.phase === 'work') accrue(s, chunk);
      else s.breakTotal += chunk;
      s.phaseElapsed += chunk;
      dt -= chunk;
      if (s.phaseElapsed >= phaseLen(s)) {
        if (s.phase === 'work') {
          endWorkBlock(s, events);
          s.phase = 'break';
        } else {
          s.phase = 'work';
          // Break ended while the smith is elsewhere: that's now away time.
          if (s.hidden && s.status === 'running') {
            s.status = 'away';
            s.awayStart = now - dt;
          }
        }
        s.phaseElapsed = 0;
        events.push({ type: 'phase', phase: s.phase });
      }
    }
  }

  function advanceExam(s, dt, events) {
    var chunk = Math.min(dt, s.config.examMs - s.examElapsed);
    accrue(s, chunk);
    s.examElapsed += chunk;
    if (s.examElapsed >= s.config.examMs) {
      s.completed = true;
      if (s.status === 'running') {
        events.push({ type: 'exam-complete' });
      } else {
        // Freeze pending time; the smith classifies it on return, then the exam ends.
        s.frozen = true;
      }
    }
  }

  function advanceOfs(s, dt, events) {
    var o = s.ofs;
    var within = Math.max(0, Math.min(dt, o.durationMs - o.elapsed));
    o.elapsed += dt;
    s.intentional += within;
    if (!o.expired && o.elapsed >= o.durationMs) {
      o.expired = true;
      events.push({ type: 'ofs-expired' });
    }
  }

  function tick(s, now) {
    var events = [];
    var dt = now - s.lastTick;
    if (dt <= 0) return events;
    s.lastTick = now;

    if (s.status === 'ofs') {
      advanceOfs(s, dt, events);
      return events;
    }
    if (!isActive(s) || s.frozen) return events;

    if (s.mode === 'timer') advanceTimer(s, dt, now, events);
    else if (s.mode === 'exam') advanceExam(s, dt, events);
    else accrue(s, dt);

    updatePeak(s, events);

    if (s.mode === 'exam' && s.config.strict && s.status === 'away' &&
        now - s.awayStart > STRICT_LIMIT_MS) {
      events.push({ type: 'strict-fail' });
    }
    return events;
  }

  function start(s, now) {
    if (s.status !== 'ready') return;
    s.status = s.hidden ? 'away' : 'running';
    s.awayStart = s.hidden ? now : null;
    s.startedAt = now;
    s.lastTick = now;
  }

  function canPause(s) {
    return s.mode !== 'exam' && (s.status === 'running' || s.status === 'paused');
  }

  function togglePause(s, now) {
    if (!canPause(s)) return;
    tick(s, now);
    s.status = s.status === 'running' ? 'paused' : 'running';
    s.lastTick = now;
  }

  // Tab hidden or window blurred.
  function leave(s, now) {
    s.hidden = true;
    var events = tick(s, now);
    var onBreak = s.mode === 'timer' && s.phase === 'break';
    // Leaving again with the return popup still open keeps the same pending time.
    if ((s.status === 'running' && !onBreak) || s.status === 'classify') {
      s.status = 'away';
      s.awayStart = now;
    }
    return events;
  }

  // Tab visible and focused again.
  function returnTo(s, now) {
    var events = tick(s, now);
    s.hidden = false;
    if (s.status === 'away') {
      var awayMs = now - s.awayStart;
      if (s.mode === 'exam' && s.config.strict && awayMs > STRICT_LIMIT_MS) {
        events.push({ type: 'strict-fail' });
        return dedupe(events);
      }
      if (s.pendingMs === 0 || (awayMs < SHORT_AWAY_MS && s.pendingMs < SHORT_AWAY_MS)) {
        // Nothing to classify (all away time fell in a break) or just jitter.
        s.status = 'running';
        if (s.pendingMs > 0) resolvePending(s, 'studied', null, null, now, events);
        if (s.frozen) events.push({ type: 'exam-complete' });
      } else {
        s.status = 'classify';
        events.push({ type: 'classify', ms: s.pendingMs });
      }
    } else if (s.status === 'ofs' && s.ofs.expired) {
      endOpenForStudy(s, now, events);
    }
    return dedupe(events);
  }

  function dedupe(events) {
    var seen = {};
    return events.filter(function (e) {
      if (e.type !== 'strict-fail') return true;
      if (seen[e.type]) return false;
      seen[e.type] = true;
      return true;
    });
  }

  function resolvePending(s, bucket, categoryId, label, now, events) {
    var ms = s.pendingMs;
    s.pendingMs = 0;
    if (bucket === 'studied') {
      s.ingotAccum += L.ingotsFor(ms, stageOf(s));
      s.studied += ms;
    } else if (bucket === 'intentional') {
      s.intentional += ms;
    } else {
      addDistracted(s, ms, events);
    }

    var d = s.deferredBlock;
    if (d) {
      var blockDist = d.distracted + (bucket === 'distracted' ? d.pending : 0);
      var bonus = L.blockBonus(s.config.workMs, blockDist);
      s.bonusIngots += bonus;
      events.push({ type: 'block-done', bonus: bonus });
      if (bucket === 'distracted') s.blockDistracted += Math.max(0, ms - d.pending);
      s.deferredBlock = null;
    } else if (bucket === 'distracted') {
      s.blockDistracted += ms;
    }

    if (categoryId) {
      s.log.push({ at: now, kind: 'away', category: categoryId, label: label || '', bucket: bucket, ms: ms });
    }
    updatePeak(s, events);
  }

  // The smith answers the return popup.
  function classify(s, bucket, categoryId, label, now) {
    var events = tick(s, now);
    if (s.status !== 'classify') return events;
    resolvePending(s, bucket, categoryId, label, now, events);
    s.status = 'running';
    if (s.frozen) events.push({ type: 'exam-complete' });
    return events;
  }

  function canOpenForStudy(s) {
    if (s.mode === 'exam') return false;
    if (s.mode === 'timer' && s.phase === 'break') return false;
    return s.status === 'running' || s.status === 'paused';
  }

  function openForStudy(s, label, minutes, now) {
    if (!canOpenForStudy(s)) return false;
    tick(s, now);
    s.status = 'ofs';
    s.ofs = { label: label, durationMs: minutes * L.MIN, elapsed: 0, expired: false, startedAt: now };
    s.lastTick = now;
    return true;
  }

  function endOpenForStudy(s, now, events) {
    events = events || [];
    if (s.status !== 'ofs') return events;
    tick(s, now).forEach(function (e) { events.push(e); });
    var o = s.ofs;
    var used = Math.min(o.elapsed, o.durationMs);
    var overrun = Math.max(0, o.elapsed - o.durationMs);
    s.log.push({ at: now, kind: 'ofs', label: o.label, bucket: 'intentional', ms: used });
    if (overrun > SHORT_AWAY_MS) {
      addDistracted(s, overrun, events);
      s.blockDistracted += overrun;
      s.log.push({ at: now, kind: 'overrun', label: o.label, bucket: 'distracted', ms: overrun });
    }
    events.push({ type: 'ofs-finished', overrun: overrun > SHORT_AWAY_MS ? overrun : 0 });
    s.ofs = null;
    s.status = 'running';
    s.lastTick = now;
    updatePeak(s, events);
    return events;
  }

  function finish(s, now, opts) {
    opts = opts || {};
    var events = [];
    if (s.status === 'ofs') endOpenForStudy(s, now, events);
    else tick(s, now);
    if (s.pendingMs > 0) resolvePending(s, 'distracted', 'unclassified', 'Left during session', now, events);
    if (s.mode !== 'exam') s.completed = true;
    if (opts.failReason) {
      s.completed = false;
      s.failReason = opts.failReason;
    }
    s.status = 'ended';
    s.endedAt = now;
    return events;
  }

  // The big number on the session screen.
  function mainClockMs(s) {
    if (s.status === 'ofs') return Math.max(0, s.ofs.durationMs - s.ofs.elapsed);
    if (s.mode === 'timer') return phaseLen(s) - s.phaseElapsed;
    if (s.mode === 'exam') return s.config.examMs - s.examElapsed;
    return s.studied + s.intentional + s.distracted + s.pendingMs;
  }

  function totalMs(s) {
    return s.studied + s.intentional + s.distracted;
  }

  // Fold a finished session into persistent state. Mutates `state`, returns the reward summary.
  function applyResult(state, s) {
    if (totalMs(s) < MIN_SESSION_MS) return { discarded: true };

    var today = L.dayKey(s.endedAt);
    var qualifies = L.qualifiesForStreak(s, state.settings.streakMinMin);
    if (qualifies) state.streak = L.advanceStreak(state.streak, today);
    var streakDays = L.currentStreak(state.streak, today);
    var ingots = L.sessionIngots(s, streakDays);

    var alloyBefore = L.alloyIndex(statsOf(state));
    state.totalIngots += ingots.total;
    state.totalIntentional = (state.totalIntentional || 0) + s.intentional;

    var record = {
      id: s.id,
      mode: s.mode,
      subject: s.subject,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      studied: s.studied,
      intentional: s.intentional,
      distracted: s.distracted,
      peakStage: s.peakStage,
      cracks: s.cracks,
      completed: s.completed,
      failReason: s.failReason,
      blocksDone: s.blocksDone,
      legendary: L.isLegendaryAttempt(s),
      ingots: ingots.total
    };
    state.sessions.push(record);

    var stats = statsOf(state);
    var alloyAfter = L.alloyIndex(stats);
    var ach = L.newAchievements(state.achievements, { session: s, stats: stats, alloyIdx: alloyAfter });
    ach.forEach(function (id) { state.achievements[id] = s.endedAt; });

    return {
      discarded: false,
      record: record,
      ingots: ingots,
      streakDays: streakDays,
      qualifies: qualifies,
      alloyBefore: alloyBefore,
      alloyAfter: alloyAfter,
      newAchievements: ach
    };
  }

  function statsOf(state) {
    var longest = 0;
    state.sessions.forEach(function (r) { longest = Math.max(longest, r.studied); });
    return {
      totalIngots: state.totalIngots,
      totalIntentional: state.totalIntentional || 0,
      longestStudiedMin: longest / L.MIN,
      bestStreak: (state.streak && state.streak.best) || 0
    };
  }

  var api = {
    SHORT_AWAY_MS: SHORT_AWAY_MS,
    STRICT_LIMIT_MS: STRICT_LIMIT_MS,
    MIN_SESSION_MS: MIN_SESSION_MS,
    createSession: createSession,
    start: start,
    tick: tick,
    togglePause: togglePause,
    canPause: canPause,
    leave: leave,
    returnTo: returnTo,
    classify: classify,
    canOpenForStudy: canOpenForStudy,
    openForStudy: openForStudy,
    endOpenForStudy: endOpenForStudy,
    finish: finish,
    stageOf: stageOf,
    heatOf: heatOf,
    mainClockMs: mainClockMs,
    totalMs: totalMs,
    applyResult: applyResult,
    statsOf: statsOf
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SF = root.SF || {};
  root.SF.session = api;
})(typeof window !== 'undefined' ? window : globalThis);
