const MAX_OUTPUT_LENGTH = 50;

export function initializeRunInteractions({
  runButtonEl,
  codeEditor,
  codeRunner,
  consoleOutput,
  fileName = "instructor.py",
  broadcastResult = () => {},
}) {
  let running = false;
  let el = runButtonEl;
  runButtonEl.addEventListener("click", async () => {
    if (running) return;
    running = true;
    el.classList.add("in-progress");
    el.disabled = true;
    el.textContent = "Running...";

    let minRunTime = new Promise((resolve) => setTimeout(resolve, 500));
    let code = codeEditor.currentCode();
    let res = await codeRunner.asyncRun(code);
    await minRunTime;
    consoleOutput.addResult({ fileName, ...res });
    broadcastResult({fileName, ...res}); // A no-op in student interfaces.

    el.classList.remove("in-progress");
    el.disabled = false;
    el.textContent = "▶ ️Run";
    running = false;
  });
}

export class Console {
  constructor(consoleContainer) {
    this.el = consoleContainer;
  }

  addResult({
    results = null,
    error = null,
    stderr = [],
    stdout = [],
    fileName = "instructor.py",
    ts = Date.now(),
  }) {
    if (stdout.length > MAX_OUTPUT_LENGTH) {
      stdout = [
        `[ ${stdout.length - MAX_OUTPUT_LENGTH} lines hidden ]`,
        ...stdout.slice(-MAX_OUTPUT_LENGTH),
      ];
    }

    let container = document.createElement("div");
    container.classList.add("one-code-run-output");

    let header = document.createElement("span");
    let timeString = new Date(ts).toLocaleTimeString();
    header.innerText = `${fileName} (${timeString})`;
    header.classList.add("code-output-header");
    container.appendChild(header);

    let addOutput = (text, className) => {
      let div = document.createElement("div");
      div.classList.add(className);
      let pre = document.createElement("pre");
      pre.innerText = text;
      div.appendChild(pre);
      container.appendChild(div);
    };
    stdout.forEach((line) => addOutput(line, "stdout-line"));
    stderr.forEach((line) => addOutput(line, "stderr-line"));
    error && addOutput(error, "stderr-line");
    results && addOutput(results, "stdout-line");
    !error && addOutput("[Run success]", "stdout-line");

    this.el.appendChild(container);
    this.el.scrollTo(0, 1e6);
  }
}
