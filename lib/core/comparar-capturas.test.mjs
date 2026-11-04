import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCapture, compareCaptures } from './comparar-capturas.mjs';
const metadata = { scenario:'demo1', gameBuild:'test', resolution:'1920x1080', graphics:'low', captureMethod:'normalized-test', shaderWarmup:true };
const capture = (time, meta = metadata) => ({metadata: meta, frames: Array.from({length:100}, () => ({frametimeMs:time}))});
test('stutter changes tail metric without hiding the sample', () => {
  const input = capture(10); input.frames[99].frametimeMs = 100;
  const result = summarizeCapture(input);
  assert.equal(result.onePercentLowFps, 10);
  assert.equal(result.p99FrametimeMs, 10);
  assert.equal(result.maxFrametimeMs, 100);
  assert.ok(Math.abs(result.averageFps - 100000/1090) < 1e-9);
});
test('comparison detects improvements and incompatible scenarios', () => {
  const result = compareCaptures(capture(10), capture(5));
  assert.equal(result.averageFpsChangePercent, 100);
  assert.equal(result.p99FrametimeChangePercent, -50);
  assert.equal(result.comparableMetadata, true);
  assert.equal(compareCaptures(capture(10), capture(10, {...metadata,resolution:'1280x720'})).comparableMetadata, false);
  assert.equal(compareCaptures(capture(10, {}),capture(10, {})).comparableMetadata, false);
});
test('invalid captures cannot look like successful performance measurements', () => {
  for (const time of [0, -1, NaN, Infinity, '10']) assert.throws(() => summarizeCapture(capture(time)));
  assert.throws(() => summarizeCapture({frames:[]}));
});
