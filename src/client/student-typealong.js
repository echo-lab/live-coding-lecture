import "./style.css";

import { io } from "socket.io-client";
import { getEmail, clearEmail, POST_JSON_REQUEST } from "./utils.js";

import { StudentCodeEditor } from "./code-editors.js";
import { PythonCodeRunner } from "./code-runner.js";
import {
  Console,
  initializeRunInteractions,
  makeConsoleResizable,
  setUpChangeEmail,
} from "./shared-interactions.js";
import { CLIENT_TYPE, SOCKET_MESSAGE_TYPE } from "../shared-constants.js";

const codeContainer = document.querySelector("#code-container");
const studentDetailsContainer = document.querySelector("#student-email");
const changeEmailLink = document.querySelector("#change-email");
const runButtonEl = document.querySelector("#run-button");
const outputCodeContainer = document.querySelector("#all-code-outputs");
const consoleResizer = document.querySelector("#resize-console");
const codeOutputsContainer = document.querySelector("#output-container");
makeConsoleResizable(codeOutputsContainer, consoleResizer);

const socket = io();

const email = getEmail();
studentDetailsContainer.textContent = `Your email: ${email}`;
setUpChangeEmail(changeEmailLink);

///////////////////////////
// Join/await a session! //
///////////////////////////

// Wait to join a session.
async function attemptInitialization() {
  // TODO: actually use a different endpoint just to get the changes this student made!
  const response = await fetch("/current-session-typealong", {
    body: JSON.stringify({ email }),
    ...POST_JSON_REQUEST,
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
    sessionNumber,
    source: CLIENT_TYPE.TYPEALONG,
    email,
  });

  socket.on(SOCKET_MESSAGE_TYPE.INSTRUCTOR_END_SESSION, () => {
    console.log("SESSION IS ENDED!");
    codeEditor.endSession();
  });
}

attemptInitialization();
