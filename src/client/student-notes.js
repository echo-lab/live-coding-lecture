import "./style.css";
import "./style-notes.css";
import "quill/dist/quill.core.css";
import "quill/dist/quill.snow.css";

import Quill from "quill";
import { CodeSnapshotBlot } from "./codesnapshot.js";

import { getEmail } from "./utils.js";

import { io } from "socket.io-client";
import { CodeFollowingEditor, StudentCodeEditor } from "./code-editors.js";
import { PythonCodeRunner } from "./code-runner.js";
import { Console, initializeRunInteractions } from "./code-running-ui.js";
import { CLIENT_TYPE } from "../shared-constants.js";

const Delta = Quill.import("delta");

const JSON_HEADERS = { "Content-Type": "application/json" };
const GET_JSON_REQUEST = { method: "GET", headers: JSON_HEADERS };
const POST_JSON_REQUEST = { method: "POST", headers: JSON_HEADERS };

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
Quill.register(CodeSnapshotBlot);

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

//////////////////
// Notes Editor //
//////////////////

class NotesEditor {
  constructor(nodeId, deltas, sessionNumber) {
    this.queuedDeltas = [];
    this.localVersionNum = deltas.length;
    this.serverVersionNum = deltas.length;
    this.sessionNumber = sessionNumber;
    this.active = true;

    this.quill = new Quill(nodeId, {
      modules: {
        clipboard: {
          matchers: [[".code-snapshot", (node, delta) => delta]],
          // matchers: [[".code-snapshot"]],
        },
        toolbar: {
          // container: toolbarId,
          container: [[{ header: [1, false] }], ["bold", { list: "bullet" }]],
        },
      },
      placeholder: "Your notes here...",
      theme: "snow", // or 'bubble'
    });

    // Calculate the new document
    let doc = new Delta([{ insert: "\n" }]);
    // console.log("Deltas: ", deltas);
    deltas
      .map(({ change }) => new Delta(JSON.parse(change)))
      .forEach((change) => {
        // console.log("applying delta: ", change);
        doc = doc.compose(change);
      });
    this.quill.setContents(doc, Quill.sources.SILENT);

    this.quill.on("text-change", this.onEditorChange.bind(this));
  }

  getDocVersion() {
    return this.localVersionNum;
  }

  endSession() {
    this.active = false;
  }

  createAnchor(
    source,
    {
      id,
      selection,
      selectionPosition,
      fullCode,
      context,
      relativeSelectionPosition,
    }
  ) {
    // handleCodeAnchor && handleCodeAnchor({ selection, context, relativeSelectionPosition, fullCode, id });
    let { from: highlightStart, to: highlightEnd } = relativeSelectionPosition;
    let { from: selectionStart, to: selectionEnd } = selectionPosition;

    const range = this.quill.getSelection(true);
    let snippet = context;
    this.quill.insertText(range.index, "\n", Quill.sources.USER);
    this.quill.insertEmbed(
      range.index + 1,
      "codesnapshot",
      {
        id,
        snippet,
        highlightStart,
        highlightEnd,
        selectionStart,
        selectionEnd,
        fullCode,
      },
      Quill.sources.USER
    );
    this.quill.setSelection(range.index + 2, Quill.sources.SILENT);
  }

  onEditorChange(delta, oldDelta, source) {
    // console.log({ delta, oldDelta, source });
    console.log(delta);
    this.queuedDeltas.push({
      delta,
      ts: Date.now(),
      changeNumber: this.localVersionNum,
    });
    this.localVersionNum++;
  }

  async flushChangesToServer() {
    if (this.queuedDeltas.length === 0 || !this.active) return;

    let payload = {
      sessionNumber: this.sessionNumber,
      changes: this.queuedDeltas,
      email,
    };

    const response = await fetch("/record-notes-changes", {
      body: JSON.stringify(payload),
      ...POST_JSON_REQUEST,
    });
    const res = await response.json();

    if (res.error) {
      console.warn("ACK! could not flush to server...?");
    } else {
      this.serverVersionNum = res.committedVersion;
      this.queuedDeltas = this.queuedDeltas.filter(
        (d) => d.changeNumber >= this.serverVersionNum
      );
      if (this.queuedDeltas.length > 0) {
        console.warn("queued changes is not empty?!?");
      } else {
        console.log("Successfully flushed changes!");
      }
    }
  }
}

//////////////////////////////////////////////////////
// OKAY: wait until a session starts to initialize
//////////////////////////////////////////////////////

async function attemptInitialization() {
  // const response = await fetch("/current-session", GET_JSON_REQUEST);

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
  console.log(res);

  let { notesDocChanges, sessionNumber, lectureDoc, lectureDocVersion } = res;
  let playgroundDoc = res.playgroundCodeInfo.doc;
  let playgroundDocVersion = res.playgroundCodeInfo.docVersion;

  let notesEditor = new NotesEditor(
    NOTES_CONTAINER_ID,
    notesDocChanges,
    sessionNumber
  );

  let instructorEditor = new CodeFollowingEditor(
    instructorCodeContainer,
    lectureDoc,
    lectureDocVersion,
    socket,
    notesEditor.createAnchor.bind(notesEditor, "instructor")
  );

  let playgroundEditor = new StudentCodeEditor({
    node: playgroundCodeContainer,
    doc: playgroundDoc,
    docVersion: playgroundDocVersion,
    sessionNumber,
    email,
    flushUrl: "/record-playground-changes",
    onNewSnapshot: notesEditor.createAnchor.bind(notesEditor, "student"),
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
  socket.on("instructor code run", (msg) => consoleOutput.addResult(msg));

  // Set up the tabs to work.
  instructorCodeTab.addEventListener("click", () => selectTab(INSTRUCTOR_TAB));
  playgroundCodeTab.addEventListener("click", () => selectTab(PLAYGROUND_TAB));

  // If you click "Open in playground" it should switch to the playground tab and flash.
  [playgroundCodeTab, playgroundCodeContainer].forEach((el) =>
    el.addEventListener("animationend", () =>
      el.classList.remove("just-changed-tab")
    )
  );

  notesContainer.addEventListener("click", (e) => {
    let el = e.target;
    if (el.tagName !== "BUTTON" || !el.classList.contains("try-it-out")) return;

    el = el.closest(".code-snapshot");
    if (!el) {
      console.warning("couldn't find code snapshot...");
      return;
    }

    // TODO: emit some event to the server? (maybe in the CodeEditor... but maybe
    // pass in the provenance).
    playgroundEditor.replaceContents(el.dataset.fullCode);
    selectTab(PLAYGROUND_TAB);
    playgroundCodeTab.classList.add("just-changed-tab");
    playgroundCodeContainer.classList.add("just-changed-tab");
  });
  window.inst = instructorCodeContainer;
  document
    .querySelector("#try-instructor-code")
    .addEventListener("click", () => {
      playgroundEditor.replaceContents(instructorEditor.currentCode());
      selectTab(PLAYGROUND_TAB);
      playgroundCodeTab.classList.add("just-changed-tab");
      playgroundCodeContainer.classList.add("just-changed-tab");
    });

  let flushChangesLoop = setInterval(
    notesEditor.flushChangesToServer.bind(notesEditor),
    FLUSH_CHANGES_FREQ
  );

  socket.on("end session", (msg) => {
    console.log("SESSION IS ENDED!");
    clearInterval(flushChangesLoop);
    notesEditor.flushChangesToServer();
    notesEditor.endSession();
  });
}
attemptInitialization();
