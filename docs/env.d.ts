declare module '@php-wasm/web-8-5' {
  export function getPHPLoaderModule(): Promise<any>;
}

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}