export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: string;
  report: any | null;
}

export interface TransformResult {
  transformedCode: string;
}

interface QueueItem {
  action: 'RUN' | 'TRANSFORM';
  payload: any;
  resolve: (val: any) => void;
  reject: (err: any) => void;
}

export type StatusListener = (status: string) => void;

class TypePHPEngine {
  private worker: Worker | null = null;
  private isReady: boolean = false;
  private initError: string | null = null;
  private initPromise: Promise<void> | null = null;
  private queue: QueueItem[] = [];
  private isProcessing: boolean = false;
  private activeItem: QueueItem | null = null;

  private currentStatus: string = 'Initializing PHP 8.5 WebAssembly...';
  private statusListeners: StatusListener[] = [];

  /**
   * Returns whether the WebAssembly PHP engine has finished booting.
   */
  public isEngineReady(): boolean {
    return this.isReady;
  }

  /**
   * Returns the latest status message from the WebAssembly worker.
   */
  public getStatus(): string {
    return this.currentStatus;
  }

  /**
   * Subscribes to real-time WebAssembly worker lifecycle and initialization status updates.
   * Returns an unsubscribe function.
   */
  public onStatus(listener: StatusListener): () => void {
    this.statusListeners.push(listener);
    // Immediately notify with current status
    listener(this.currentStatus);

    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  private notifyStatus(status: string): void {
    this.currentStatus = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('[TypePHPEngine StatusListener Error]', err);
      }
    }
  }

  public init(baseUrl: string = '/docs/'): Promise<void> {
    if (this.isReady) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(
          new URL('../workers/playground.worker.ts', import.meta.url),
          { type: 'module' }
        );

        this.worker.onerror = (err: ErrorEvent) => {
          const msg = err.message || 'Worker thread failed to execute';
          this.initError = msg;
          this.notifyStatus(`Worker Error: ${msg}`);
          reject(new Error(msg));
        };

        this.worker.onmessage = (event: MessageEvent) => {
          const data = event.data;

          switch (data.type) {
            case 'STATUS':
              this.notifyStatus(data.message);
              break;

            case 'READY':
              this.isReady = true;
              this.notifyStatus(`Ready (${data.version})`);
              resolve();
              this.processNext();
              break;

            case 'INIT_ERROR':
              this.initError = data.error;
              this.notifyStatus(`Init Error: ${data.error}`);
              reject(new Error(data.error));
              break;

            case 'RUN_RESULT':
              if (this.activeItem && this.activeItem.action === 'RUN') {
                this.activeItem.resolve({
                  ok: data.exitCode === 0,
                  stdout: data.stdout,
                  stderr: data.stderr,
                  exitCode: data.exitCode,
                  duration: data.duration,
                  report: data.report || null,
                });
                this.activeItem = null;
                this.isProcessing = false;
                this.processNext();
              }
              break;

            case 'TRANSFORM_RESULT':
              if (this.activeItem && this.activeItem.action === 'TRANSFORM') {
                this.activeItem.resolve({
                  transformedCode: data.transformedCode,
                });
                this.activeItem = null;
                this.isProcessing = false;
                this.processNext();
              }
              break;
          }
        };

        const absoluteBase = new URL(baseUrl, window.location.origin).href;
        this.worker.postMessage({ action: 'INIT', baseUrl: absoluteBase });
      } catch (err: any) {
        const msg = err?.message || String(err);
        this.initError = msg;
        this.notifyStatus(`Init Failed: ${msg}`);
        reject(err);
      }
    });

    return this.initPromise;
  }

  public async run(code: string, config: any = {}): Promise<RunResult> {
    await this.init();
    const cleanConfig = JSON.parse(JSON.stringify(config || {}));
    return new Promise((resolve, reject) => {
      this.queue.push({
        action: 'RUN',
        payload: { code, config: cleanConfig },
        resolve,
        reject,
      });
      this.processNext();
    });
  }

  public async transform(code: string, config: any = {}): Promise<TransformResult> {
    await this.init();
    const cleanConfig = JSON.parse(JSON.stringify(config || {}));
    return new Promise((resolve, reject) => {
      this.queue.push({
        action: 'TRANSFORM',
        payload: { code, config: cleanConfig },
        resolve,
        reject,
      });
      this.processNext();
    });
  }

  private processNext(): void {
    if (this.isProcessing || !this.isReady || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.activeItem = this.queue.shift() || null;

    if (this.activeItem && this.worker) {
      this.worker.postMessage({
        action: this.activeItem.action,
        ...this.activeItem.payload,
      });
    }
  }
}

let engineInstance: TypePHPEngine | null = null;

export function getTypePHPEngine(baseUrl?: string): TypePHPEngine {
  if (!engineInstance) {
    engineInstance = new TypePHPEngine();
  }
  if (baseUrl && typeof window !== 'undefined') {
    engineInstance.init(baseUrl).catch(() => {});
  }
  return engineInstance;
}