import "./style.css";

import { io } from "socket.io-client";
import { getEmail, clearEmail } from "./utils.js";

import { StudentCodeEditor } from "./code-editors.js";
import { PythonCodeRunner } from "./code-runner.js";
import { Console, initializeRunInteractions } from "./code-running-ui.js";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
};
const POST_REQUEST = { method: "POST", headers: JSON_HEADERS };

const codeContainer = document.querySelector("#code-container");
const studentDetailsContainer = document.querySelector("#student-email");
const changeEmailLink = document.querySelector("#change-email");
const runButtonEl = document.querySelector("#run-button");
const outputCodeContainer = document.querySelector("#all-code-outputs");

const socket = io();

const email = getEmail();
studentDetailsContainer.textContent = `Your email: ${email}`;
const emailMessage =
  "Are you sure you want to change your email? Progress will be lost";
changeEmailLink.hidden = false;
changeEmailLink.addEventListener("click", () => {
  if (!confirm(emailMessage)) return;
  clearEmail();
  window.location.reload();
});

///////////////////////////
// Join/await a session! //
///////////////////////////

// Wait to join a session.
async function attemptInitialization() {
  // TODO: actually use a different endpoint just to get the changes this student made!
  const response = await fetch("/current-session-typealong", {
    body: JSON.stringify({ email }),
    ...POST_REQUEST,
  });

  let res = await response.json();
  if (!res.doc) {
    console.log("No instructor detected -- trying again in 5 seconds.");
    setTimeout(attemptInitialization, 5000);
    return;
  }

  let { doc, sessionNumber, docVersion } = res;
  // let editor = new CodeEditor(codeContainer, doc, docVersion, sessionNumber);
  let codeEditor = new StudentCodeEditor({
    node: codeContainer,
    doc,
    docVersion,
    sessionNumber,
    email,
    flushUrl: "/record-typealong-changes",
  });

  let codeRunner = new PythonCodeRunner();
  let consoleOutput = new Console(outputCodeContainer);

  initializeRunInteractions({
    runButtonEl,
    codeEditor,
    codeRunner,
    consoleOutput,
    fileName: "my_notes.py",
  });

  socket.on("end session", () => {
    console.log("SESSION IS ENDED!");
    codeEditor.endSession();
  });
}

attemptInitialization();
