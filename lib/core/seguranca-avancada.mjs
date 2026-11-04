import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('./catalogo.json', import.meta.url), 'utf8'));
export const profiles = catalog.newModules[0].profiles;

/** Pure planning: does not execute PowerShell or change the computer. */
export function planMitigations({ vendor, profileIds }) {
  if (!['Intel', 'AMD', 'ARM'].includes(vendor)) throw new Error('Fabricante não reconhecido.');
  if (!Array.isArray(profileIds) || !profileIds.length) throw new Error('Selecione um perfil.');
  const ids = [...new Set(profileIds)];
  if (ids.includes('padrao') && ids.length > 1) throw new Error('Padrão não pode ser combinado.');
  const selected = ids.map(id => {
    const profile = profiles.find(p => p.id === id);
    if (!profile) throw new Error('Perfil desconhecido.');
    if (!profile.vendors.includes(vendor)) throw new Error('Perfil incompatível com o fabricante.');
    return profile;
  });
  // A mixture of enable and disable bits needs individual technical review.
  if (selected.some(p => p.security === 'REDUZIDA') && selected.length > 1) {
    throw new Error('Use perfis de redução de segurança individualmente.');
  }
  const reducedSecurity = selected.some(p => p.security === 'REDUZIDA');
  return {
    module: 'advanced-security', vendor, profileIds: ids,
    operation: ids[0] === 'padrao' ? 'remove-overrides' : 'set-overrides',
    override: selected.reduce((value, p) => value | p.value, 0) >>> 0,
    mask: ids[0] === 'padrao' ? null : 3,
    minVm: selected.some(p => p.minVm),
    reducedSecurity,
    warning: reducedSecurity ? 'Este perfil reduz proteções contra vulnerabilidades da CPU.' : null,
    backupRequired: true, restartRequired: true,
    effectiveState: 'unknown-until-kernel-verification',
    validation: 'planning-only-hardware-and-Windows-build-review-required',
    fpsGain: null,
  };
}

/** Contract for the future privileged backend. This module deliberately has no executor. */
export const integration = Object.freeze({
  readActions: ['status', 'verify-effective-state', 'list-backups'],
  writeActions: ['backup', 'apply-profile', 'restore-backup', 'remove-overrides'],
  scriptHash: catalog.scriptSha256,
  requirements: [
    'Verify CPU, Windows build, firmware and script integrity before applying.',
    'Back up prior existence, type and value of each managed registry entry.',
    'Never report configured state as effective kernel protection.',
    'Keep reduced-security profiles outside automatic optimization.',
    'Run privileged code from an administrator-protected installation directory.',
    'Do not restart automatically.',
  ],
});
