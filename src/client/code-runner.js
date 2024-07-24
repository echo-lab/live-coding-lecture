// import { loadPyodide } from "pyodide";
import { makeID } from "./utils";


export class PythonCodeRunner {
  constructor() {
    this.pyodide = null;
    this.worker = new Worker(new URL("./pyodide-webworker.js", import.meta.url));
    this.callbacks = {};

    this.worker.onmessage = (event) => {
      const { id, ...data } = event.data;
      const onSuccess = this.callbacks[id];
      delete this.callbacks[id];
      onSuccess(data);
    };
  }

  asyncRun(code) {
    const id = makeID();
    return new Promise((onSuccess) => {
      this.callbacks[id] = onSuccess;
      this.worker.postMessage({
        python: code,
        id,
      });
    });
  }
}
