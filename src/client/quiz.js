import "./style.css";
import "./style-quiz.css";

import { getEmail, POST_JSON_REQUEST } from "./utils.js";

import { StudentCodeEditor } from "./code-editors.js";
import { Text } from "@codemirror/state";
import { setUpChangeEmail, setupJoinQuizModal } from "./shared-interactions.js";
import {
  CLIENT_TYPE,
  SOCKET_MESSAGE_TYPE,
  USER_ACTIONS,
} from "../shared-constants.js";
// import { replayChanges } from "./recorder.js"; // Uncomment for stress testing

const codeContainer = document.querySelector("#code-container");
const studentDetailsContainer = document.querySelector("#student-email");
const changeEmailLink = document.querySelector("#change-email");
const submitButtonEl = document.querySelector("#submit-button");

const email = getEmail();
studentDetailsContainer.textContent = email;
setUpChangeEmail(changeEmailLink);

// Wait to join a session.
async function initialize({
  docs,
  sessionNumber,
  typealongSessionId,
  sessionName,
}) {
  let { doc, docVersion } = docs["notes.py"] || {
    doc: Text.empty.toJSON(),
    docVersion: 0,
  };

  let codeEditor = new StudentCodeEditor({
    node: codeContainer,
    doc,
    docVersion,
    sessionNumber,
    email,
    fileName: "notes.py",
    flushUrl: "/record-typealong-changes",
  });

  submitButtonEl.addEventListener("click", () => {
    let modalContainer = document.querySelector(".modal-background");
    let modal = document.querySelector(".modal");

    let url =
      sessionName == "genquiz"
        ? "https://forms.gle/j13dxnQqYe98oGQ97"
        : "https://forms.gle/zJDUVdGyufQYsMuS8";
    modal.innerHTML = `<div style="text-align:center">
    Response recorded!<br/>
    Please continue to part 2 at <a href="${url}">this link.</a> 
    </div>`;
    modalContainer.style.display = "";
  });

  window.addEventListener("beforeunload", (event) => {
    codeEditor.flushChanges();
  });
}

setupJoinQuizModal({
  url: "/current-session-typealong",
  email,
  onSuccess: initialize,
});
