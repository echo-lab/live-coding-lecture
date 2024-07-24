import "./style.css";

import { io } from "socket.io-client";
import { EXAMPLE_CODE, getIdentity } from "./utils.js";

import { EditorView } from "codemirror";
import { EditorState, Text } from "@codemirror/state";
import { PythonCodeRunner } from "./code-runner.js";
import { basicExtensions } from "./cm-extensions.js";
import { Console } from "./console-output.js";

const codeContainer = document.querySelector("#code-container");
const startButton = document.querySelector("#start-session-butt");
const endButton = document.querySelector("#end-session-butt");
const sessionDetails = document.querySelector("#session-details");
const runButton = document.querySelector("#run-button");
const outputCodeContainer = document.querySelector("#all-code-outputs");

const JSON_HEADERS = { "Content-Type": "application/json" };
const GET_JSON_OPTIONS = { method: "GET", headers: JSON_HEADERS };
const POST_JSON_OPTIONS = { method: "POST", headers: JSON_HEADERS };

const socket = io();
let uid = getIdentity();
// Change ID X gets you to doc version X+1

////////////////////////
// Code Mirror Editor //
////////////////////////

class CodeEditor {
  constructor(node, socket, doc, startVersion) {
    this.docVersion = startVersion;
    this.socket = socket;

    let state = EditorState.create({
      doc: Text.of(doc),
      extensions: [
        ...basicExtensions,
        EditorView.updateListener.of(
          this.broadcastInstructorChanges.bind(this)
        ),
      ],
    });

    this.view = new EditorView({ state, parent: node });

    this.codeRunner = new PythonCodeRunner();
    this.active = true;
  }

  async runCurrentCode() {
    let code = this.view.state.doc.toString();
    let res = await this.codeRunner.asyncRun(code);
    return res;
  }

  endSession() {
    this.active = false;
  }

  broadcastInstructorChanges(viewUpdate) {
    if (!this.active) return;

    if (viewUpdate.docChanged) {
      viewUpdate.transactions.forEach((tr) => {
        // if (!tr.annotation(Transaction.userEvent)) return;
        // let userEvent = tr.annotation(Transaction.userEvent);
        this.socket.emit("instructor event", {
          id: this.docVersion,
          changes: tr.changes.toJSON(),
          ts: Date.now(),
        });
        this.docVersion++;
      });
    }
    // If the cursor position might have changed, send out the current one.
    if (
      viewUpdate.docChanged ||
      viewUpdate.transactions.some((tr) => tr.isUserEvent("select"))
    ) {
      let { anchor, head } = viewUpdate.state.selection.main;
      socket.emit("instructor event", {
        cursor: { anchor, head },
        // id: docVersion,
      });
    }
  }
}

///////////////////////////////
// Initialize w/ the Server
///////////////////////////////
async function getOrCreateSession(createIfNoSesh) {
  const ops = createIfNoSesh ? POST_JSON_OPTIONS : GET_JSON_OPTIONS;
  const response = await fetch("/current-session", ops);
  let res = await response.json();
  res.sessionNumber && initialize(res);
  console.log(res);
  return res.sessionNumber;
}

// let x = await getOrCreateSession(false);
// console.log("x is: ", x);
if (!(await getOrCreateSession(false))) {
  // No current session
  console.log("hi");
  startButton.disabled = false;
}

// If it's not disabled already, start button should create a new session
startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  endButton.disabled = false;
  await getOrCreateSession(true);
});

// Start up the editor and hook up the end session button.
function initialize({ doc = null, docVersion = null, sessionNumber = null }) {
  startButton.disabled = true;
  endButton.disabled = false;
  sessionDetails.textContent = `Session: ${sessionNumber}`;
  let consoleOutput = new Console(outputCodeContainer);

  let codeEditor = new CodeEditor(codeContainer, socket, doc, docVersion);

  runButton.addEventListener("click", async () => {
    runButton.classList.add("in-progress");
    runButton.disabled = true;
    runButton.textContent = "Running...";

    let minRunTime = new Promise((resolve) => setTimeout(resolve, 500));
    let res = await codeEditor.runCurrentCode();
    await minRunTime;
    consoleOutput.addResult(res);

    runButton.classList.remove("in-progress");
    runButton.disabled = false;
    runButton.textContent = "▶ ️Run";
  });

  endButton.addEventListener("click", async () => {
    // TODO: make it so you can't edit the code :)
    endButton.disabled = true;
    sessionDetails.textContent += " (Terminated)";
    codeEditor.endSession();
    const response = await fetch("/end-session", POST_JSON_OPTIONS);
    let res = await response.json();
    if (res.error) console.warning("Could not close session!");
    socket.emit("end session", { sessionNumber });
  });
}
