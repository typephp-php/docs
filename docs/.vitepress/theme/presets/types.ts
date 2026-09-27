export interface PlaygroundConfig {
  enabled: boolean;
  ignoreTraceDepth: number;
  arrayValidation: 'full' | 'hybrid';
  strictReturnGenericInvariance: boolean;
  respectNativeNullability: boolean;
  respectIgnoreTags: boolean;
}

export interface PlaygroundPreset {
  id: string;
  name: string;
  badge: string;
  order: number;
  code: string;
  config?: Partial<PlaygroundConfig>;
}

export const DEFAULT_PLAYGROUND_CONFIG: PlaygroundConfig = {
  enabled: true,
  ignoreTraceDepth: 25,
  arrayValidation: 'full',
  strictReturnGenericInvariance: true,
  respectNativeNullability: true,
  respectIgnoreTags: true,
};