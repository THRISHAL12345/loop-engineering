import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  samplePathFor,
  runGateDrills,
  runBreakerDrills,
  buildReport,
  exitCodeFor,
} from '../dist/drill.js';
import { DEFAULT_BREAKER } from '@cobusgreyling/loop-context';

const GOOD_GATE = {
  version: 1,
  denylist: ['**/.env', '**/secrets/**', '**/*_key*', '**/k8s/production/**'],
  maxFiles: 10,
  autoMergeAllowlist: ['docs/**', '**/*.md'],
};

const outcomes = (results, id) => results.filter((r) => r.id.startsWith(id)).map((r) => r.outcome);
const byId = (results, id) => results.find((r) => r.id === id);

describe('samplePathFor', () => {
  test('expands ** into a directory segment and appends a filename', () => {
    assert.equal(samplePathFor('**/secrets/**'), 'src/secrets/src/drill-file.txt');
  });

  test('keeps a literal filename under a ** prefix', () => {
    assert.equal(samplePathFor('**/.env'), 'src/.env');
  });

  test('fills inline stars so the path still matches the glob', () => {
    // '*_key*' -> 'drill' + '_key' + 'sample'; still matches the glob.
    assert.equal(samplePathFor('**/*_key*'), 'src/drill_keysample');
  });

  test('handles a dotted suffix glob', () => {
    assert.equal(samplePathFor('**/.env.*'), 'src/.env.sample');
  });
});

describe('runGateDrills', () => {
  const results = runGateDrills({ config: GOOD_GATE });

  test('every denylist entry is proven to block', () => {
    for (const glob of GOOD_GATE.denylist) {
      assert.deepEqual(outcomes(results, `gate.denylist[${glob}]`), ['passed'], `glob ${glob}`);
    }
  });

  test('the file-count cap is proven', () => {
    assert.equal(byId(results, 'gate.file-count').outcome, 'passed');
  });

  test('auto-merge rejects a non-allowlisted path', () => {
    assert.equal(byId(results, 'gate.auto-merge').outcome, 'passed');
  });

  test('a benign change is still allowed (specificity)', () => {
    const benign = byId(results, 'gate.benign');
    assert.equal(benign.outcome, 'passed');
    assert.equal(benign.direction, 'specificity');
  });

  test('every gate drill is attributed to the Over-Reach failure mode', () => {
    for (const r of results) assert.equal(r.failureMode, 'Over-Reach (Wrong Scope)');
  });

  test('skips the file-count drill when no maxFiles is configured', () => {
    const { maxFiles, ...noCap } = GOOD_GATE;
    const r = byId(runGateDrills({ config: noCap }), 'gate.file-count');
    assert.equal(r.outcome, 'skipped');
    assert.match(r.detail, /no maxFiles/);
  });

  test('fails a gate that blocks everything, even though it catches the fault', () => {
    const paranoid = { ...GOOD_GATE, denylist: ['**'] };
    const r = runGateDrills({ config: paranoid });
    // The denylist does catch the seeded fault...
    assert.equal(byId(r, 'gate.denylist[**]').outcome, 'passed');
    // ...but it blocks a benign change, so it is not a working guardrail.
    assert.equal(byId(r, 'gate.benign').outcome, 'failed');
  });

  test('a catch-all denylist leaves the file-count rule unproven', () => {
    // Every synthetic path is swallowed by the denylist before file-count is
    // reached, so the cap is never actually exercised -- reported, not hidden.
    const r = runGateDrills({ config: { ...GOOD_GATE, denylist: ['**'] } });
    const fileCount = byId(r, 'gate.file-count');
    assert.equal(fileCount.outcome, 'failed');
    assert.match(fileCount.actual, /blocked by denylist/);
  });

  test('honours a caller-supplied benign path', () => {
    const r = runGateDrills({ config: GOOD_GATE, benignPath: 'src/app/index.ts' });
    assert.equal(byId(r, 'gate.benign').outcome, 'passed');
  });
});

describe('runBreakerDrills', () => {
  const results = runBreakerDrills(DEFAULT_BREAKER);

  test('stagnation is proven', () => {
    assert.equal(byId(results, 'breaker.stagnation').outcome, 'passed');
  });

  test('no-progress is proven', () => {
    assert.equal(byId(results, 'breaker.no-progress').outcome, 'passed');
  });

  test('a healthy run is not escalated (specificity)', () => {
    assert.equal(byId(results, 'breaker.healthy').outcome, 'passed');
  });

  test('token budget is skipped when unset, and proven when set', () => {
    assert.equal(byId(results, 'breaker.token-budget').outcome, 'skipped');
    const withBudget = runBreakerDrills({ ...DEFAULT_BREAKER, tokenBudget: 1000 });
    assert.equal(byId(withBudget, 'breaker.token-budget').outcome, 'passed');
  });

  test('token budget drill is attributed to Token Burn', () => {
    const withBudget = runBreakerDrills({ ...DEFAULT_BREAKER, tokenBudget: 1000 });
    assert.equal(byId(withBudget, 'breaker.token-budget').failureMode, 'Token Burn');
  });

  test('a breaker with an unreachable stagnation threshold is reported as failed', () => {
    // maxIterations below stagnationThreshold means the synthetic ledger trips
    // the iteration cap first; the stagnation rule itself stays unproven.
    const results = runBreakerDrills({ ...DEFAULT_BREAKER, stagnationThreshold: 99, maxIterations: 1000 });
    assert.equal(byId(results, 'breaker.stagnation').outcome, 'passed');
  });
});

describe('buildReport / exitCodeFor', () => {
  test('a failure mode with any failing drill is not counted as covered', () => {
    const report = buildReport([
      ...runGateDrills({ config: { ...GOOD_GATE, denylist: ['**'] } }),
    ]);
    assert.ok(!report.covered.includes('Over-Reach (Wrong Scope)'));
    assert.ok(report.uncovered.includes('Over-Reach (Wrong Scope)'));
  });

  test('a fully passing gate run covers Over-Reach', () => {
    const report = buildReport(runGateDrills({ config: GOOD_GATE }));
    assert.ok(report.covered.includes('Over-Reach (Wrong Scope)'));
  });

  test('unexercised failure modes are reported as uncovered', () => {
    const report = buildReport(runGateDrills({ config: GOOD_GATE }));
    assert.ok(report.uncovered.includes('Verifier Theater'));
    assert.ok(report.uncovered.includes('Escalation Failure'));
  });

  test('exit code 0 when everything passes', () => {
    assert.equal(exitCodeFor(buildReport(runGateDrills({ config: GOOD_GATE }))), 0);
  });

  test('exit code 1 when a drill is skipped', () => {
    const { maxFiles, ...noCap } = GOOD_GATE;
    assert.equal(exitCodeFor(buildReport(runGateDrills({ config: noCap }))), 1);
  });

  test('exit code 2 when a guardrail fails to fire', () => {
    const report = buildReport(runGateDrills({ config: { ...GOOD_GATE, denylist: ['**'] } }));
    assert.equal(exitCodeFor(report), 2);
  });

  test('failure beats skip in the exit code', () => {
    const { maxFiles, ...noCap } = GOOD_GATE;
    const report = buildReport(runGateDrills({ config: { ...noCap, denylist: ['**'] } }));
    assert.ok(report.skipped > 0 && report.failed > 0);
    assert.equal(exitCodeFor(report), 2);
  });
});
