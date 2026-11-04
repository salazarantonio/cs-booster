import test from 'node:test';
import assert from 'node:assert/strict';
import { planMitigations, profiles } from './seguranca-avancada.mjs';

test('all twelve supplied profiles remain represented', () => {
  assert.equal(profiles.length, 12);
});
test('Windows default removes overrides instead of writing zero', () => {
  const plan = planMitigations({vendor: 'Intel', profileIds: ['padrao']});
  assert.equal(plan.operation, 'remove-overrides');
  assert.equal(plan.mask, null);
});
test('AMD combination preserves bits rather than summing duplicate flags', () => {
  const plan = planMitigations({vendor: 'AMD', profileIds: ['amd-btc', 'amd-inception', 'ssbd', 'ssbd']});
  assert.equal(plan.override, 83886152);
  assert.equal(plan.profileIds.length, 3);
  assert.equal(plan.effectiveState, 'unknown-until-kernel-verification');
});
test('cross-vendor and contradictory combinations are rejected', () => {
  for (const profileIds of [['intel-bhi'], ['padrao','ssbd'], ['desligar-tudo','ssbd'], ['invalid']]) {
    assert.throws(() => planMitigations({vendor: 'AMD', profileIds}));
  }
  assert.throws(() => planMitigations({vendor: 'Unknown', profileIds: ['padrao']}));
});
test('reduced security is explicit and makes no FPS claim', () => {
  const plan = planMitigations({vendor: 'Intel', profileIds: ['desligar-tudo']});
  assert.equal(plan.reducedSecurity, true);
  assert.equal(plan.fpsGain, null);
  assert.equal(plan.backupRequired, true);
});
