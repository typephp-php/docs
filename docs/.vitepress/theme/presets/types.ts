export type ViolationMode = 'throw' | 'warn' | 'report';

export interface InlineVarsConfig {
  properties: boolean;
  generics: boolean;
  callables: boolean;
  scalars: boolean;
  arrays: boolean;
  objects: boolean;
}

export interface PlaygroundConfig {
  enabled: boolean;
  onViolation: ViolationMode;
  redactValues: boolean;
  ignoreTraceDepth: number;
  arrayValidation: 'full' | 'hybrid';
  strictReturnGenericInvariance: boolean;
  respectNativeNullability: boolean;
  respectIgnoreTags: boolean;
  magicPropertyReads: boolean;
  inlineVars: InlineVarsConfig;
}

export interface ViolationRecordItem {
  file: string;
  line: number;
  function: string;
  kind: 'parameter' | 'return' | 'property' | 'variable' | 'param-out' | 'self-out' | 'callback' | 'yield' | 'send';
  target: string;
  expected: string;
  given: string;
  message: string;
}

export interface ViolationReportSummary {
  total_violations: number;
  files_affected: number;
}

export interface AuditReportDocument {
  version: string;
  generated_at: string;
  summary: ViolationReportSummary;
  violations: ViolationRecordItem[];
}

export interface PlaygroundPreset {
  id: string;
  name: string;
  badge: string;
  order: number;
  code: string;
  config?: Partial<PlaygroundConfig>;
}

export const DEFAULT_INLINE_VARS_CONFIG: InlineVarsConfig = {
  properties: true,
  generics: true,
  callables: true,
  scalars: true,
  arrays: true,
  objects: true,
};

export const DEFAULT_PLAYGROUND_CONFIG: PlaygroundConfig = {
  enabled: true,
  onViolation: 'throw',
  redactValues: false,
  ignoreTraceDepth: 25,
  arrayValidation: 'full',
  strictReturnGenericInvariance: true,
  respectNativeNullability: true,
  respectIgnoreTags: true,
  magicPropertyReads: false,
  inlineVars: { ...DEFAULT_INLINE_VARS_CONFIG },
};