import "./style.css";

import { io } from "socket.io-client";
import { getEmail, clearEmail } from "./utils.js";

import { EditorView } from "codemirror";
import { EditorState, Text } from "@codemirror/state";
import { basicExtensions } from "./cm-extensions.js";
import { StudentCodeEditor } from "./code-editors.js";

const FLUSH_CHANGES_FREQ = /*seconds=*/ 3 * 1000; // flush the changes every 10 seconds.

const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
};
const POST_REQUEST = { method: "POST", headers: JSON_HEADERS };

const codeContainer = document.querySelector("#code-container");
const studentDetailsContainer = document.querySelector("#student-email");
const changeEmailLink = document.querySelector("#change-email");

const socket = io();

const email = getEmail();
studentDetailsContainer.textContent = email;
changeEmailLink.hidden = false;

changeEmailLink.addEventListener("click", () => {
  if (
    confirm("Are you sure you want to change your email? Progress will be lost")
  ) {
    clearEmail();
    window.location.reload();
  }
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
  let editor = new StudentCodeEditor({
    node: codeContainer,
    doc,
    docVersion,
    sessionNumber,
    email,
    flushUrl: "/record-typealong-changes",
  });

  socket.on("end session", () => {
    console.log("SESSION IS ENDED!");
    editor.endSession();
  });
}

attemptInitialization();
