/// <reference types="vite/client" />

declare module '@php-wasm/web-8-5' {
  export function getPHPLoaderModule(asyncMode?: 'asyncify' | 'jspi'): Promise<any>;
  export function getIntlExtensionPath(asyncMode?: 'asyncify' | 'jspi'): Promise<string>;
}