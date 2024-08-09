// pyodide-webworker.js

importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js");

let stdout = [];
let stderr = [];

async function loadPyodideAndPackages() {
  self.pyodide = await loadPyodide();
  // await self.pyodide.loadPackage(["numpy", "pytz"]);
  self.pyodide.setStderr({ batched: (msg) => stderr.push(msg) });
  self.pyodide.setStdout({ batched: (msg) => stdout.push(msg) });
}
let pyodideReadyPromise = loadPyodideAndPackages();

self.onmessage = async (event) => {
  // make sure loading is done
  await pyodideReadyPromise;

  // Don't bother yet with this line, suppose our API is built in such a way:
  const { id, python } = event.data;
  //   const { id, python, ...context } = event.data;

  // The worker copies the context in its own "memory" (an object mapping name to values)
  //   for (const key of Object.keys(context)) {
  //     self[key] = context[key];
  //   }

  // Now is the easy part, the one that is similar to working in the main thread:
  const dict = self.pyodide.globals.get("dict");
  const globals = dict();
  try {
    await self.pyodide.loadPackagesFromImports(python);
    let results = await self.pyodide.runPythonAsync(python, {
      globals,
      locals: globals,
    });
    self.postMessage({ results, id, stdout, stderr });
  } catch (error) {
    self.postMessage({ error: error.message, id, stdout, stderr });
  } finally {
    stdout = [];
    stderr = [];
  }
  globals.destroy();
  dict.destroy();
};
