import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Normalized capture: { metadata: {...}, frames: [{frametimeMs, presentMode?}] }.
// A future PresentMon adapter must select a single process and swapchain and
// explicitly map its version's frame-time column. No hardware data is inferred.
export function summarizeCapture(capture) {
  if (!capture || !Array.isArray(capture.frames) || capture.frames.length < 100) {
    throw new Error('Forneça ao menos 100 frames normalizados por captura.');
  }
  const times = capture.frames.map(frame => {
    if (!frame || typeof frame.frametimeMs !== 'number' || !Number.isFinite(frame.frametimeMs) || frame.frametimeMs <= 0) {
      throw new Error('Frametime inválido; não remover amostras ruins silenciosamente.');
    }
    return frame.frametimeMs;
  });
  const sorted = [...times].sort((a, b) => a - b);
  const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
  const modes = {};
  for (const frame of capture.frames) {
    const mode = frame.presentMode || 'Desconhecido';
    modes[mode] = (modes[mode] || 0) + 1;
  }
  return {
    frames: times.length,
    durationSeconds: times.reduce((a, b) => a + b, 0) / 1000,
    averageFps: 1000 / mean(times),
    onePercentLowFps: 1000 / mean(sorted.slice(-Math.ceil(times.length * 0.01))),
    p99FrametimeMs: sorted[Math.ceil(times.length * 0.99) - 1],
    maxFrametimeMs: sorted.at(-1),
    presentModes: modes,
    method: 'FPS médio = 1000/média de frametimes; 1% low = 1000/média do 1% mais lento; P99 por nearest-rank.',
  };
}

export function compareCaptures(before, after) {
  const a = summarizeCapture(before), b = summarizeCapture(after);
  const required = ['scenario', 'gameBuild', 'resolution', 'graphics', 'captureMethod', 'shaderWarmup'];
  const missingMetadata = required.filter(key => before.metadata?.[key] == null || after.metadata?.[key] == null);
  const differences = required.filter(key => JSON.stringify(before.metadata?.[key]) !== JSON.stringify(after.metadata?.[key]));
  const percent = (x, y) => (y / x - 1) * 100;
  return {
    before: a, after: b,
    averageFpsChangePercent: percent(a.averageFps, b.averageFps),
    onePercentLowChangePercent: percent(a.onePercentLowFps, b.onePercentLowFps),
    p99FrametimeChangePercent: percent(a.p99FrametimeMs, b.p99FrametimeMs),
    comparableMetadata: !missingMetadata.length && !differences.length,
    missingMetadata, differences,
    conclusion: 'Comparação descritiva de duas capturas; não demonstra causalidade ou significância estatística. Repita o teste com ordem alternada.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const paths = process.argv.slice(2);
    if (paths.length !== 2) throw new Error('Uso: node comparar-capturas.mjs antes.json depois.json');
    const [before, after] = paths.map(path => JSON.parse(readFileSync(path, 'utf8')));
    console.log(JSON.stringify(compareCaptures(before, after), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
