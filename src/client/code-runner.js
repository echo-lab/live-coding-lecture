// import { loadPyodide } from "pyodide";
import { makeID } from "./utils";
const MAX_RUNTIME = /*seconds=*/ 7 * 1000;

export class PythonCodeRunner {
  constructor() {
    this.pyodide = null;
    this.callbacks = {};
    this.restartWebWorker();
  }

  restartWebWorker() {
    console.log("Restarting web worker");
    this.worker?.terminate();
    this.worker = new Worker(
      new URL("./pyodide-webworker.js", import.meta.url)
    );
    this.worker.onmessage = (event) => {
      const { id, ...data } = event.data;
      const onSuccess = this.callbacks[id];
      delete this.callbacks[id];
      onSuccess(data);
    };
  }

  asyncRun(code) {
    const id = makeID();

    setTimeout(() => {
      if (!this.callbacks[id]) return;
      // We timed out if we got here.
      this.callbacks[id]({ timedOut: true, error: "[CANCELLED DUE TO TIMEOUT]" });
      delete this.callbacks[id];
      this.restartWebWorker();
    }, MAX_RUNTIME);

    return new Promise((onSuccess) => {
      this.callbacks[id] = onSuccess;
      this.worker.postMessage({
        python: code,
        id,
      });
    });
  }
}
