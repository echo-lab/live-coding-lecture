import "./style.css";

import { io } from "socket.io-client";
import { GET_JSON_REQUEST, getIdentity, POST_JSON_REQUEST } from "./utils.js";

import { PythonCodeRunner } from "./code-runner.js";
import { Console, initializeRunInteractions } from "./shared-interactions.js";
import { InstructorCodeEditor } from "./code-editors.js";
import { CLIENT_TYPE } from "../shared-constants.js";

const codeContainer = document.querySelector("#code-container");
const startButton = document.querySelector("#start-session-butt");
const endButton = document.querySelector("#end-session-butt");
const sessionDetails = document.querySelector("#session-details");
const runButtonEl = document.querySelector("#run-button");
const outputCodeContainer = document.querySelector("#all-code-outputs");

const socket = io();
let uid = getIdentity();
// Change ID X gets you to doc version X+1

////////////////////////
// Code Mirror Editor //
////////////////////////

///////////////////////////////
// Initialize w/ the Server
///////////////////////////////
async function getOrCreateSession(createIfNoSesh) {
  const ops = createIfNoSesh ? POST_JSON_REQUEST : GET_JSON_REQUEST;
  const response = await fetch("/current-session", ops);
  let res = await response.json();
  res.sessionNumber && initialize(res);
  return res.sessionNumber;
}

// let x = await getOrCreateSession(false);
// console.log("x is: ", x);
if (!(await getOrCreateSession(false))) {
  // No current session
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

  let codeEditor = new InstructorCodeEditor(
    codeContainer,
    socket,
    doc,
    docVersion
  );
  let codeRunner = new PythonCodeRunner();
  let consoleOutput = new Console(outputCodeContainer);

  initializeRunInteractions({
    runButtonEl,
    codeEditor,
    codeRunner,
    consoleOutput,
    sessionNumber,
    source: CLIENT_TYPE.INSTRUCTOR,
    broadcastResult: (msg) => socket.emit("instructor code run", msg),
  });

  endButton.addEventListener("click", async () => {
    // TODO: make it so you can't edit the code :)
    endButton.disabled = true;
    sessionDetails.textContent += " (Terminated)";
    codeEditor.endSession();
    const response = await fetch("/end-session", POST_JSON_REQUEST);
    let res = await response.json();
    if (res.error) console.warning("Could not close session!");
    socket.emit("end session", { sessionNumber });
  });
}
