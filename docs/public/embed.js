(function () {
  const DOCS_BASE_URL = 'https://typephp-php.github.io/docs/'; 
  let workerInstance = null;
  let initPromise = null;
  let queue = [];
  let isProcessing = false;
  let activeItem = null;

  async function getEngineWorker() {
    if (workerInstance) return workerInstance;
    if (initPromise) return initPromise;

    initPromise = new Promise(async (resolve, reject) => {
      try {
        const workerUrl = `${DOCS_BASE_URL}assets/playground.worker.js`; 
    
        const workerScript = `
          import '${new URL('../docs/.vitepress/theme/workers/playground.worker.ts', import.meta.url).href}';
        `;
        

        const workerRes = await fetch(`${DOCS_BASE_URL}wasm/typephp-worker.js`).catch(() => null);
        let worker;
        if (workerRes && workerRes.ok) {
          const blob = new Blob([await workerRes.text()], { type: 'application/javascript' });
          worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
        } else {
          worker = new Worker(new URL('./playground.worker.ts', import.meta.url), { type: 'module' });
        }

        worker.onmessage = (e) => {
          const data = e.data;
          if (data.type === 'READY') {
            workerInstance = worker;
            resolve(worker);
            processQueue();
          } else if (data.type === 'RUN_RESULT' || data.type === 'TRANSFORM_RESULT') {
            if (activeItem) {
              activeItem.resolve(data);
              activeItem = null;
              isProcessing = false;
              processQueue();
            }
          }
        };

        worker.postMessage({ action: 'INIT', baseUrl: DOCS_BASE_URL });
      } catch (err) {
        reject(err);
      }
    });

    return initPromise;
  }

  function processQueue() {
    if (isProcessing || queue.length === 0 || !workerInstance) return;
    isProcessing = true;
    activeItem = queue.shift();
    workerInstance.postMessage(activeItem.payload);
  }

  function executeWorker(payload) {
    return new Promise(async (resolve, reject) => {
      await getEngineWorker();
      queue.push({ payload, resolve, reject });
      processQueue();
    });
  }

  class TypePHPSnippetElement extends HTMLElement {
    connectedCallback() {
      const title = this.getAttribute('title') || 'TypePHP Interactive';
      const code = this.getAttribute('code') || this.textContent.trim();
      
      this.innerHTML = `
        <div style="border: 1px solid #30363d; border-radius: 8px; background: #0d1117; color: #c9d1d9; font-family: monospace; margin: 18px 0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #161b22; border-bottom: 1px solid #30363d;">
            <span style="font-size: 12px; font-weight: 600; color: #8b949e;">${title}</span>
            <button id="run-btn" style="display: inline-flex; align-items: center; gap: 4px; background: #238636; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">
              ▶ Run
            </button>
          </div>
          <pre style="margin: 0; padding: 14px 16px; overflow-x: auto; font-size: 13px; line-height: 1.6; background: transparent;"><code>${this.escape(code)}</code></pre>
          <div id="output" style="display: none; border-top: 1px solid #30363d; background: #010409; padding: 10px 14px; font-size: 12px;"></div>
        </div>
      `;

      const runBtn = this.querySelector('#run-btn');
      const output = this.querySelector('#output');

      runBtn.onclick = async () => {
        runBtn.textContent = 'Running...';
        runBtn.disabled = true;

        try {
          const res = await executeWorker({ action: 'RUN', code, config: {} });
          output.style.display = 'block';

          if (res.exitCode === 0) {
            output.innerHTML = `
              <div style="color: #3fb950; font-size: 10px; font-weight: bold; margin-bottom: 4px;">✓ Exit 0 (${res.duration}ms)</div>
              <pre style="margin: 0; color: #e6edf3; white-space: pre-wrap;">${this.escape(res.stdout || '(No output)')}</pre>
            `;
          } else {
            output.innerHTML = `
              <div style="color: #f85149; font-size: 10px; font-weight: bold; margin-bottom: 4px;">✗ Exit ${res.exitCode} (${res.duration}ms)</div>
              <pre style="margin: 0; color: #f85149; white-space: pre-wrap; background: rgba(248,81,73,0.1); padding: 8px; border-radius: 4px; border-left: 2px solid #f85149;">${this.escape(res.stderr || res.stdout)}</pre>
            `;
          }
        } catch (err) {
          output.style.display = 'block';
          output.innerHTML = `<pre style="color: #f85149; margin: 0;">Execution Error: ${this.escape(err.message)}</pre>`;
        } finally {
          runBtn.textContent = '▶ Run';
          runBtn.disabled = false;
        }
      };
    }

    escape(str) {
      return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }

  if (!customElements.get('typephp-snippet')) {
    customElements.define('typephp-snippet', TypePHPSnippetElement);
  }
})();