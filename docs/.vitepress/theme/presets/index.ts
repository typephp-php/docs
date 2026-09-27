import type { PlaygroundPreset } from './types';

const presetModules = (import.meta as any).glob(
  './items/*.ts',
  { eager: true }
) as Record<string, { default?: PlaygroundPreset }>;

export const PLAYGROUND_PRESETS: PlaygroundPreset[] = Object.entries(presetModules)
  .map(([path, mod]) => {
    if (!mod || !mod.default || !mod.default.id) {
      console.error(`[Playground Error] Preset file "${path}" is missing a valid "export default" with an "id"!`, mod);
      return null;
    }
    return mod.default;
  })
  .filter((preset): preset is PlaygroundPreset => Boolean(preset))
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

export * from './types';