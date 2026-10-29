'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

const MIN = L.MIN;

test('heat stages follow the spec thresholds', () => {
  assert.equal(L.HEAT_STAGES[L.heatStageIndex(0)].id, 'cold');
  assert.equal(L.HEAT_STAGES[L.heatStageIndex(4.99)].id, 'cold');
  assert.equal(L.HEAT_STAGES[L.heatStageIndex(5)].id, 'warm');
  assert.equal(L.HEAT_STAGES[L.heatStageIndex(15)].id, 'hot');
  assert.equal(L.HEAT_STAGES[L.heatStageIndex(40)].id, 'blazing');
  assert.equal(L.HEAT_STAGES[L.heatStageIndex(70)].id, 'legendary');
  assert.equal(L.HEAT_STAGES[L.heatStageIndex(500)].id, 'legendary');
});

test('distraction cools the forge, intentional is neutral', () => {
  assert.equal(L.heatMinutes(20 * MIN, 0), 20);
  assert.equal(L.heatMinutes(20 * MIN, 5 * MIN), 10);
  assert.equal(L.heatMinutes(5 * MIN, 10 * MIN), 0);
});

test('ingots: 1 per 5 clean minutes, scaled by heat', () => {
  assert.equal(L.ingotsFor(5 * MIN, 0), 1);
  assert.equal(L.ingotsFor(10 * MIN, 4), 3);
  assert.ok(Math.abs(L.ingotsFor(5 * MIN, 2) - 1.1) < 1e-9);
});

test('streak multiplier table', () => {
  assert.equal(L.streakMultiplier(0), 1.0);
  assert.equal(L.streakMultiplier(2), 1.0);
  assert.equal(L.streakMultiplier(3), 1.2);
  assert.equal(L.streakMultiplier(6), 1.2);
  assert.equal(L.streakMultiplier(7), 1.4);
  assert.equal(L.streakMultiplier(13), 1.4);
  assert.equal(L.streakMultiplier(14), 1.6);
});

test('dayDiff handles month boundaries', () => {
  assert.equal(L.dayDiff('2026-01-31', '2026-02-01'), 1);
  assert.equal(L.dayDiff('2026-03-01', '2026-03-01'), 0);
  assert.equal(L.dayDiff('2025-12-31', '2026-01-02'), 2);
});

test('streak advances on consecutive days and resets after a gap', () => {
  let s = L.advanceStreak(null, '2026-05-01');
  assert.deepEqual(s, { count: 1, lastDay: '2026-05-01', best: 1 });
  s = L.advanceStreak(s, '2026-05-01');
  assert.equal(s.count, 1);
  s = L.advanceStreak(s, '2026-05-02');
  s = L.advanceStreak(s, '2026-05-03');
  assert.equal(s.count, 3);
  s = L.advanceStreak(s, '2026-05-05');
  assert.equal(s.count, 1);
  assert.equal(s.best, 3);
});

test('current streak is alive today and yesterday only', () => {
  const s = { count: 4, lastDay: '2026-05-10', best: 4 };
  assert.equal(L.currentStreak(s, '2026-05-10'), 4);
  assert.equal(L.currentStreak(s, '2026-05-11'), 4);
  assert.equal(L.currentStreak(s, '2026-05-12'), 0);
});

test('alloys require ingots plus milestone conditions, in order', () => {
  const base = { totalIngots: 0, longestStudiedMin: 0, bestStreak: 0 };
  assert.equal(L.alloyIndex(base), 0);
  assert.equal(L.alloyIndex({ ...base, totalIngots: 100 }), 1);
  assert.equal(L.alloyIndex({ ...base, totalIngots: 400 }), 1, 'gold needs a 40-min session');
  assert.equal(L.alloyIndex({ ...base, totalIngots: 400, longestStudiedMin: 45 }), 2);
  assert.equal(L.alloyIndex({ totalIngots: 2000, longestStudiedMin: 45, bestStreak: 7 }), 3);
  assert.equal(L.alloyIndex({ totalIngots: 2000, longestStudiedMin: 45, bestStreak: 14 }), 4);
  assert.equal(L.alloyIndex({ totalIngots: 2000, longestStudiedMin: 10, bestStreak: 14 }), 1);
});

test('titles unlock with alloys', () => {
  assert.deepEqual(L.unlockedTitles(0).map(t => t.id), ['novice']);
  assert.equal(L.unlockedTitles(4).length, 5);
});

test('block bonus needs distracted under 10% of the block', () => {
  assert.equal(L.blockBonus(25 * MIN, 0), L.BLOCK_BONUS);
  assert.equal(L.blockBonus(25 * MIN, 2 * MIN), L.BLOCK_BONUS);
  assert.equal(L.blockBonus(25 * MIN, 2.5 * MIN), 0);
});

test('session ingots apply streak multiplier and legendary bonus', () => {
  const s = { mode: 'exam', completed: true, distracted: 30000, ingotAccum: 10, bonusIngots: 0 };
  const r = L.sessionIngots(s, 7);
  assert.equal(r.base, 14);
  assert.equal(r.bonus, L.LEGENDARY_ATTEMPT_BONUS);
  assert.equal(r.total, 14 + L.LEGENDARY_ATTEMPT_BONUS);
  const r2 = L.sessionIngots({ ...s, completed: false }, 0);
  assert.equal(r2.total, 10);
});

test('streak qualification uses the minimum studied setting', () => {
  assert.ok(L.qualifiesForStreak({ completed: true, studied: 20 * MIN }, 20));
  assert.ok(!L.qualifiesForStreak({ completed: true, studied: 19 * MIN }, 20));
  assert.ok(!L.qualifiesForStreak({ completed: false, studied: 60 * MIN }, 20));
});

test('achievements unlock once and pay their reward', () => {
  const state = {
    totalIngots: 12, totalIntentional: 0, streak: { count: 1, lastDay: null, best: 1 },
    achievements: {}, achievementsPaid: {},
    sessions: [{ mode: 'stopwatch', subject: 'Physics', completed: true, studied: 45 * MIN, intentional: 0,
      distracted: 0, peakStage: 3, cracks: 0, blocksDone: 0, startedAt: Date.UTC(2026, 4, 1, 12), endedAt: Date.UTC(2026, 4, 1, 13) }]
  };
  const r = L.unlockAchievements(state, 1);
  for (const id of ['first_ingot', 'warm_forge', 'blazing_session', 'distraction_slayer']) assert.ok(r.ids.includes(id), id);
  const expected = r.ids.reduce((sum, id) => sum + L.TIERS[L.achievementById(id).tier].ingots, 0);
  assert.equal(r.ingots, expected);
  assert.equal(state.totalIngots, 12 + expected);
  assert.deepEqual(L.unlockAchievements(state, 2).ids, []);
});

test('achievements unlocked before rewards existed are paid once', () => {
  const state = { totalIngots: 0, streak: { best: 0 }, sessions: [], achievements: { first_ingot: 1 } };
  const r = L.unlockAchievements(state, 1);
  assert.equal(r.backPay, L.TIERS.common.ingots);
  assert.equal(L.unlockAchievements(state, 2).backPay, 0);
});

test('top subject of the week', () => {
  const sessions = [
    { subject: 'Physics', studied: 30 * MIN, endedAt: 100 },
    { subject: 'Chemistry', studied: 50 * MIN, endedAt: 100 },
    { subject: 'Physics', studied: 40 * MIN, endedAt: 100 },
    { subject: 'Hindi', studied: 500 * MIN, endedAt: 1 }
  ];
  const totals = L.subjectTotals(sessions, 50);
  assert.equal(L.topSubject(totals), 'Physics');
});

test('clock formatting', () => {
  assert.equal(L.formatClock(0), '00:00');
  assert.equal(L.formatClock(65000), '01:05');
  assert.equal(L.formatClock(3725000), '1:02:05');
});
