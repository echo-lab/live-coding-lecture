import "./style.css";
import "./style-notes.css";

import { getEmail, POST_JSON_REQUEST } from "./utils.js";

import { io } from "socket.io-client";
import { CodeFollowingEditor, StudentCodeEditor } from "./code-editors.js";
import { PythonCodeRunner } from "./code-runner.js";
import {
  Console,
  initializeRunInteractions,
  makeConsoleResizable,
} from "./shared-interactions.js";
import { CLIENT_TYPE, USER_ACTIONS } from "../shared-constants.js";
import { NotesEditor } from "./notes-editor.js";

const FLUSH_CHANGES_FREQ = /*seconds=*/ 3 * 1000;

const instructorCodeContainer = document.querySelector(
  "#instructor-code-container"
);
const playgroundCodeContainer = document.querySelector(
  "#playground-code-container"
);
const instructorCodeTab = document.querySelector("#instructor-code-tab");
const playgroundCodeTab = document.querySelector("#playground-code-tab");
const runButtonEl = document.querySelector("#run-button");
const codeOutputsEl = document.querySelector("#all-code-outputs");
const codeOutputsContainer = document.querySelector("#output-container");
const consoleResizer = document.querySelector("#resize-console");
makeConsoleResizable(codeOutputsContainer, consoleResizer, true);
let instructorTabActive = true;

const NOTES_CONTAINER_ID = "#notes-document";
const notesContainer = document.querySelector(NOTES_CONTAINER_ID);

// Handle the email stuff.
const email = getEmail();
const studentDetailsContainer = document.querySelector("#student-email");
const changeEmailLink = document.querySelector("#change-email");
studentDetailsContainer.textContent = `Your email: ${email}`;
const emailMessage =
  "Are you sure you want to change your email? Progress will be lost";
changeEmailLink.hidden = false;
changeEmailLink.addEventListener("click", () => {
  if (!confirm(emailMessage)) return;
  clearEmail();
  window.location.reload();
});

////////
// NOTE: this needs to be global! Or at least, the catchUpOnChanges function needs to be aware of the real
// current value.
// let docVersion = 0;

// window.getDocVersion = () => docVersion;
// SOCKET IO lol
const socket = io();

const INSTRUCTOR_TAB = 0;
const PLAYGROUND_TAB = 1;
let selectTab = (tab) => {
  if (instructorTabActive && tab === INSTRUCTOR_TAB) return;
  if (!instructorTabActive && tab === PLAYGROUND_TAB) return;

  instructorTabActive = !instructorTabActive;

  let [open, closed] = [instructorCodeTab, playgroundCodeTab];
  if (tab === PLAYGROUND_TAB) [open, closed] = [closed, open];
  open.classList.add("selected");
  closed.classList.remove("selected");

  [open, closed] = [instructorCodeContainer, playgroundCodeContainer];
  if (tab === PLAYGROUND_TAB) [open, closed] = [closed, open];
  open.style.display = "grid";
  closed.style.display = "none";

  // runButton.style.display = tab === INSTRUCTOR_TAB ? "none" : "grid";
};

//////////////////////////////////////////////////////
// OKAY: wait until a session starts to initialize
//////////////////////////////////////////////////////

async function attemptInitialization() {
  const response = await fetch("../current-session-notes", {
    body: JSON.stringify({ email }),
    ...POST_JSON_REQUEST,
  });

  let res = await response.json();

  if (!res.sessionNumber) {
    console.log("No instructor detected -- trying again in 5 seconds.");
    setTimeout(attemptInitialization, 5000);
    return;
  }

  let { notesDocChanges, sessionNumber, lectureDoc, lectureDocVersion } = res;
  let playgroundDoc = res.playgroundCodeInfo.doc;
  let playgroundDocVersion = res.playgroundCodeInfo.docVersion;
  let sessionActive = true;

  let notesEditor = new NotesEditor({
    nodeId: NOTES_CONTAINER_ID,
    deltas: notesDocChanges,
    sessionNumber,
    email,
  });

  let instructorEditor = new CodeFollowingEditor(
    instructorCodeContainer,
    lectureDoc,
    lectureDocVersion,
    socket,
    notesEditor.createAnchor.bind(notesEditor, "instructor.py")
  );

  let playgroundEditor = new StudentCodeEditor({
    node: playgroundCodeContainer,
    doc: playgroundDoc,
    docVersion: playgroundDocVersion,
    sessionNumber,
    email,
    flushUrl: "/record-playground-changes",
    onNewSnapshot: notesEditor.createAnchor.bind(notesEditor, "playground.py"),
  });
  playgroundCodeContainer.style.display = "none"; // Not sure why we have to do this again...

  // Set up the run button for the playground tab.
  let codeRunner = new PythonCodeRunner();
  let consoleOutput = new Console(codeOutputsEl);
  initializeRunInteractions({
    runButtonEl,
    codeEditor: playgroundEditor,
    codeRunner,
    consoleOutput,
    sessionNumber,
    source: CLIENT_TYPE.NOTES,
    email,
  });
  socket.on(
    "instructor code run",
    (msg) => sessionActive && consoleOutput.addResult(msg)
  );

  // Set up the tabs to work.
  instructorCodeTab.addEventListener("click", () => selectTab(INSTRUCTOR_TAB));
  playgroundCodeTab.addEventListener("click", () => selectTab(PLAYGROUND_TAB));

  // If you click "Open in playground" it should switch to the playground tab and flash.
  [playgroundCodeTab, playgroundCodeContainer].forEach((el) =>
    el.addEventListener("animationend", () =>
      el.classList.remove("just-changed-tab")
    )
  );

  // If we're on the playground tab, blink the instructor tab whenever a change happens.
  socket.on("instructor event", (msg) => {
    if (!msg.changes) return;
    if (instructorCodeTab.classList.contains("selected")) return;
    instructorCodeTab.style.animation = "none";
    setTimeout(() => (instructorCodeTab.style.animation = ""), 10);
  });

  function loadPlaygroundCode(code, actionType) {
    // Log it on the server.
    let payload = {
      ts: Date.now(),
      docVersion: notesEditor.getDocVersion(),
      codeVersion: playgroundEditor.getDocVersion(),
      actionType,
      sessionNumber,
      source: CLIENT_TYPE.NOTES,
      email,
    };
    fetch("/record-user-action", {
      body: JSON.stringify(payload),
      ...POST_JSON_REQUEST,
    });

    // Replace the code in the playground and switch to that tab.
    playgroundEditor.replaceContents(code);
    selectTab(PLAYGROUND_TAB);
    playgroundCodeTab.classList.add("just-changed-tab");
    playgroundCodeContainer.classList.add("just-changed-tab");
  }

  notesContainer.addEventListener("click", (e) => {
    let el = e.target;
    if (el.tagName !== "BUTTON" || !el.classList.contains("try-it-out")) return;

    el = el.closest(".code-snapshot");
    if (el) {
      loadPlaygroundCode(
        el.dataset.fullCode,
        USER_ACTIONS.OPEN_SNAPSHOT_PLAYGROUND
      );
    } else {
      console.warning("couldn't find code snapshot...");
    }
  });

  document
    .querySelector("#try-instructor-code")
    .addEventListener("click", () =>
      loadPlaygroundCode(
        instructorEditor.currentCode(),
        USER_ACTIONS.OPEN_INST_CODE_PLAYGROUND
      )
    );

  let flushChangesLoop = setInterval(
    notesEditor.flushChangesToServer.bind(notesEditor),
    FLUSH_CHANGES_FREQ
  );

  socket.on("end session", (msg) => {
    console.log("SESSION IS ENDED!");
    clearInterval(flushChangesLoop);
    notesEditor.flushChangesToServer();
    notesEditor.endSession();
    instructorEditor.stopFollowing();
    sessionActive = false;
  });
}
attemptInitialization();
