'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');
const S = require('../js/session.js');

const MIN = L.MIN;
const T0 = Date.UTC(2026, 4, 10, 10, 0, 0);

function newState() {
  return {
    totalIngots: 0, totalIntentional: 0,
    streak: { count: 0, lastDay: null, best: 0 },
    sessions: [], achievements: {},
    settings: { streakMinMin: 20 }
  };
}

function types(events) { return events.map(e => e.type); }

test('stopwatch accrues studied time and heats up', () => {
  const s = S.createSession({ mode: 'stopwatch', subject: 'Physics' }, T0);
  S.start(s, T0);
  const ev = S.tick(s, T0 + 16 * MIN);
  assert.equal(s.studied, 16 * MIN);
  assert.equal(S.stageOf(s), 2);
  assert.ok(types(ev).includes('stage-up'));
  assert.equal(S.mainClockMs(s), 16 * MIN);
});

test('pause stops the clock', () => {
  const s = S.createSession({ mode: 'stopwatch', subject: 'Physics' }, T0);
  S.start(s, T0);
  S.togglePause(s, T0 + MIN);
  S.tick(s, T0 + 10 * MIN);
  assert.equal(s.studied, MIN);
  S.togglePause(s, T0 + 10 * MIN);
  S.tick(s, T0 + 11 * MIN);
  assert.equal(s.studied, 2 * MIN);
});

test('away time is pending until classified', () => {
  const s = S.createSession({ mode: 'stopwatch', subject: 'Math' }, T0);
  S.start(s, T0);
  S.leave(s, T0 + 10 * MIN);
  S.tick(s, T0 + 12 * MIN);
  assert.equal(s.studied, 10 * MIN);
  assert.equal(s.pendingMs, 2 * MIN);
  const ev = S.returnTo(s, T0 + 13 * MIN);
  assert.equal(s.status, 'classify');
  assert.equal(ev[0].type, 'classify');
  assert.equal(ev[0].ms, 3 * MIN);
  const ev2 = S.classify(s, 'distracted', 'youtube', '', T0 + 13 * MIN + 5000);
  assert.equal(s.distracted, 3 * MIN + 5000);
  assert.equal(s.cracks, 1);
  assert.ok(types(ev2).includes('crack'));
  assert.equal(s.status, 'running');
});

test('short away is treated as studied without a popup', () => {
  const s = S.createSession({ mode: 'stopwatch', subject: 'Math' }, T0);
  S.start(s, T0);
  S.leave(s, T0 + MIN);
  const ev = S.returnTo(s, T0 + MIN + 2000);
  assert.deepEqual(types(ev), []);
  assert.equal(s.status, 'running');
  assert.equal(s.studied, MIN + 2000);
});

test('allowed classification counts as studied, office as intentional', () => {
  const s = S.createSession({ mode: 'stopwatch', subject: 'Math' }, T0);
  S.start(s, T0);
  S.leave(s, T0);
  S.returnTo(s, T0 + 5 * MIN);
  S.classify(s, 'studied', 'allowed', '', T0 + 5 * MIN);
  assert.equal(s.studied, 5 * MIN);
  S.leave(s, T0 + 5 * MIN);
  S.returnTo(s, T0 + 8 * MIN);
  S.classify(s, 'intentional', 'office', '', T0 + 8 * MIN);
  assert.equal(s.intentional, 3 * MIN);
  assert.equal(s.log.length, 2);
});

test('open for study: intentional within window, overrun becomes distracted', () => {
  const s = S.createSession({ mode: 'stopwatch', subject: 'Physics' }, T0);
  S.start(s, T0);
  S.tick(s, T0 + 10 * MIN);
  assert.ok(S.openForStudy(s, 'Selina PDF', 5, T0 + 10 * MIN));
  S.leave(s, T0 + 10 * MIN);
  assert.equal(s.status, 'ofs', 'leaving during OFS is expected');
  const ev = S.tick(s, T0 + 15 * MIN + 1000);
  assert.ok(types(ev).includes('ofs-expired'));
  const back = S.returnTo(s, T0 + 18 * MIN);
  assert.ok(types(back).includes('ofs-finished'));
  assert.equal(s.intentional, 5 * MIN);
  assert.equal(s.distracted, 3 * MIN);
  assert.equal(s.studied, 10 * MIN);
  assert.equal(s.status, 'running');
});

test('open for study ended early counts only time used', () => {
  const s = S.createSession({ mode: 'stopwatch', subject: 'Physics' }, T0);
  S.start(s, T0);
  S.openForStudy(s, 'Excel', 10, T0);
  S.endOpenForStudy(s, T0 + 4 * MIN);
  assert.equal(s.intentional, 4 * MIN);
  assert.equal(s.distracted, 0);
  assert.equal(s.status, 'running');
});

test('open for study is not available in exam mode', () => {
  const s = S.createSession({ mode: 'exam', subject: 'Physics', config: { examMin: 30 } }, T0);
  S.start(s, T0);
  assert.equal(S.openForStudy(s, 'x', 5, T0), false);
  assert.equal(S.canPause(s), false);
});

test('study timer switches phases and awards clean block bonus', () => {
  const s = S.createSession({ mode: 'timer', subject: 'Chemistry', config: { workMin: 25, breakMin: 5 } }, T0);
  S.start(s, T0);
  const ev = S.tick(s, T0 + 26 * MIN);
  assert.ok(types(ev).includes('phase'));
  assert.equal(s.phase, 'break');
  assert.equal(s.blocksDone, 1);
  assert.equal(s.bonusIngots, L.BLOCK_BONUS);
  assert.equal(s.studied, 25 * MIN);
  assert.equal(s.breakTotal, MIN);
  S.tick(s, T0 + 31 * MIN);
  assert.equal(s.phase, 'work');
  assert.equal(s.studied, 26 * MIN);
});

test('leaving during a break is free; break ending while away starts away time', () => {
  const s = S.createSession({ mode: 'timer', subject: 'Chemistry', config: { workMin: 25, breakMin: 5 } }, T0);
  S.start(s, T0);
  S.tick(s, T0 + 25 * MIN);
  S.leave(s, T0 + 26 * MIN);
  assert.equal(s.status, 'running');
  S.tick(s, T0 + 32 * MIN);
  assert.equal(s.status, 'away');
  assert.equal(s.pendingMs, 2 * MIN);
  const ev = S.returnTo(s, T0 + 32 * MIN);
  assert.equal(ev[0].ms, 2 * MIN);
});

test('block that ends while away is judged after classification', () => {
  const s = S.createSession({ mode: 'timer', subject: 'Chemistry', config: { workMin: 25, breakMin: 5 } }, T0);
  S.start(s, T0);
  S.leave(s, T0 + 20 * MIN);
  S.tick(s, T0 + 27 * MIN);
  assert.ok(s.deferredBlock);
  S.returnTo(s, T0 + 27 * MIN);
  S.classify(s, 'distracted', 'roblox', '', T0 + 27 * MIN);
  assert.equal(s.bonusIngots, 0);
  assert.equal(s.distracted, 5 * MIN);
  assert.equal(s.deferredBlock, null);
});

test('exam completes when the countdown ends', () => {
  const s = S.createSession({ mode: 'exam', subject: 'Math', config: { examMin: 30 } }, T0);
  S.start(s, T0);
  const ev = S.tick(s, T0 + 31 * MIN);
  assert.ok(types(ev).includes('exam-complete'));
  assert.equal(s.studied, 30 * MIN);
  S.finish(s, T0 + 31 * MIN);
  assert.equal(s.completed, true);
  assert.ok(L.isLegendaryAttempt(s));
});

test('exam ending while away waits for classification', () => {
  const s = S.createSession({ mode: 'exam', subject: 'Math', config: { examMin: 30 } }, T0);
  S.start(s, T0);
  S.leave(s, T0 + 29 * MIN);
  S.tick(s, T0 + 35 * MIN);
  assert.equal(s.frozen, true);
  assert.equal(s.pendingMs, MIN);
  S.returnTo(s, T0 + 35 * MIN);
  const ev = S.classify(s, 'studied', 'allowed', '', T0 + 36 * MIN);
  assert.ok(types(ev).includes('exam-complete'));
  assert.equal(s.studied, 30 * MIN);
});

test('strict exam fails after 10 seconds away', () => {
  const s = S.createSession({ mode: 'exam', subject: 'Math', config: { examMin: 30, strict: true } }, T0);
  S.start(s, T0);
  S.leave(s, T0 + MIN);
  assert.deepEqual(types(S.returnTo(s, T0 + MIN + 8000)), ['classify'], 'under the limit: just classify');
  S.classify(s, 'studied', 'allowed', '', T0 + MIN + 8000);
  S.leave(s, T0 + 2 * MIN);
  const ev = S.tick(s, T0 + 2 * MIN + 11000);
  assert.ok(types(ev).includes('strict-fail'));
  S.finish(s, T0 + 2 * MIN + 11000, { failReason: 'strict' });
  assert.equal(s.completed, false);
  assert.equal(s.distracted, 11000);
});

test('applyResult records session, streak, ingots and achievements', () => {
  const state = newState();
  const s = S.createSession({ mode: 'stopwatch', subject: 'Physics' }, T0);
  S.start(s, T0);
  S.tick(s, T0 + 45 * MIN);
  S.finish(s, T0 + 45 * MIN);
  const r = S.applyResult(state, s);
  assert.equal(r.discarded, false);
  assert.equal(state.sessions.length, 1);
  assert.equal(state.streak.count, 1);
  assert.ok(r.ingots.total >= 9);
  assert.equal(state.totalIngots, r.ingots.total + r.achievementIngots, "session Ingots plus achievement rewards");
  assert.ok(r.newAchievements.includes('first_ingot'));
  assert.ok(r.newAchievements.includes('blazing_session'));
});

test('tiny sessions are discarded', () => {
  const state = newState();
  const s = S.createSession({ mode: 'stopwatch', subject: 'Physics' }, T0);
  S.start(s, T0);
  S.finish(s, T0 + 30000);
  assert.equal(S.applyResult(state, s).discarded, true);
  assert.equal(state.sessions.length, 0);
});
