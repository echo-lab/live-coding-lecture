import { CLIENT_TYPE, USER_ACTIONS } from "../shared-constants";
import { clearEmail, POST_JSON_REQUEST } from "./utils";

const MAX_OUTPUT_LENGTH = 50;

// Wrapping this in an object so we can swap out the editor when we have multiple tabs.
export class RunInteractions {
  constructor({
    runButtonEl,
    codeEditor,
    codeRunner,
    consoleOutput,
    sessionNumber,
    source,
    email,
    broadcastResult = () => {},
  }) {
    this.editor = codeEditor;
    this.running = false;

    this.el = runButtonEl;
    this.runner = codeRunner;
    this.console = consoleOutput;
    this.sessionNumber = sessionNumber;
    this.source = source;
    this.email = email;
    this.broadcastResult = broadcastResult;

    runButtonEl.addEventListener("click", this.runCode.bind(this));
  }

  setEditor(editor) {
    this.editor = editor;
  }

  async runCode() {
    if (this.running) return;
    this.running = true;
    this.el.classList.add("in-progress");
    this.el.disabled = true;
    this.el.textContent = "Running...";

    // Record the action on the server. No need to await.
    let payload = {
      ts: Date.now(),
      codeVersion: this.editor.getDocVersion(),
      actionType: USER_ACTIONS.CODE_RUN,
      sessionNumber: this.sessionNumber,
      source: this.source,
      email: this.email,
    };
    fetch("/record-user-action", {
      body: JSON.stringify(payload),
      ...POST_JSON_REQUEST,
    });

    let minRunTime = new Promise((resolve) => setTimeout(resolve, 500));
    let code = this.editor.currentCode();
    let res = await this.runner.asyncRun(code);
    await minRunTime;
    this.console.addResult({ fileName: this.editor.fileName, ...res });
    this.broadcastResult({ fileName: this.editor.fileName, ...res }); // A no-op in student interfaces.

    this.el.classList.remove("in-progress");
    this.el.disabled = false;
    this.el.textContent = "▶ ️Run";
    this.running = false;
  }
}

const MAX_HEIGHT = 400;
const MIN_HEIGHT = 65;
export function makeConsoleResizable(
  outputConsole,
  resizeBar,
  twoColWorkaround
) {
  let isDragging = false;
  let consoleBottom = 0;
  resizeBar.addEventListener("mousedown", () => {
    isDragging = true;
    let { bottom } = outputConsole.getBoundingClientRect();
    consoleBottom = bottom + window.scrollY;
    resizeBar.classList.add("is-dragging");
  });
  document.addEventListener("mousemove", (ev) => {
    if (!isDragging) return;
    let y = ev.pageY;
    let height = consoleBottom - y - 4; // 4 for the resizer's height
    height = Math.min(MAX_HEIGHT, height);
    height = Math.max(height, MIN_HEIGHT);
    if (!twoColWorkaround) {
      outputConsole.style.height = `${height}px`;
    } else {
      outputConsole.style.height = "100%";
      outputConsole.parentElement.style.gridTemplateRows = `40px auto 6px ${height}px`;
    }
  });
  document.addEventListener("mouseup", (ev) => {
    isDragging = false;
    resizeBar.classList.remove("is-dragging");
  });
}

export class Console {
  constructor(innerContainer) {
    this.el = innerContainer;
  }

  addResult({
    results = null,
    error = null,
    stderr = [],
    stdout = [],
    fileName = "instructor.py",
    ts = Date.now(),
  }) {
    if (this.el.classList.contains("empty")) {
      this.el.innerText = "";
      this.el.classList.remove("empty");
    }

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

export function setUpChangeEmail(el) {
  const emailMessage =
    "Are you sure you want to change your email? Progress will be lost";
  el.hidden = false;
  el.addEventListener("click", () => {
    if (!confirm(emailMessage)) return;
    clearEmail();
    window.location.reload();
  });
}

export function setupJoinLectureModal({ url, email, onSuccess }) {
  let sessionNameInput = document.querySelector(".modal input");
  let fetchSessionbutton = document.querySelector("#fetch-session");
  let errorMessage = document.querySelector("#load-session-error");
  let modal = document.querySelector(".modal-background");
  let sessionNameDisplay = document.querySelector(".topbar-left");

  const try_connecting = async () => {
    let sessionName = sessionNameInput.value;
    const response = await fetch(url, {
      body: JSON.stringify({ email, sessionName }),
      ...POST_JSON_REQUEST,
    });
    let res = await response.json();
    if (!res.sessionNumber) {
      errorMessage.textContent = `Session "${sessionName}" does not exist. Please try again.`;
    } else {
      modal.style.display = "none";
      sessionNameDisplay.innerText = `Lecture ID: ${sessionName}`;
      onSuccess(res);
    }
  };

  fetchSessionbutton.addEventListener("click", try_connecting);
  sessionNameInput.addEventListener("keypress", (ev) => {
    ev.key === "Enter" && try_connecting();
  });
  sessionNameInput.focus();
}
