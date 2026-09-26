export interface PlaygroundConfig {
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
  arrayValidation: 'full',
  strictReturnGenericInvariance: true,
  respectNativeNullability: true,
  respectIgnoreTags: true,
};