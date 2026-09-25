import type { PlaygroundPreset } from './types';

const presetModules = (import.meta as any).glob(
  './items/*.ts',
  { eager: true }
) as Record<string, { default: PlaygroundPreset }>;

export const PLAYGROUND_PRESETS: PlaygroundPreset[] = Object.values(presetModules)
  .map((mod) => mod.default)
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

export * from './types';