import "./style.css";
import "./style-notes.css";
import "./style-review.css";

import { GET_JSON_REQUEST, POST_JSON_REQUEST } from "./utils.js";

import { ReviewCodeEditor } from "./code-editors.js";
import { ReadOnlyNotesEditor } from "./notes-editor.js";
import { CLIENT_TYPE, USER_ACTIONS } from "../shared-constants.js";

const codeContainer = document.querySelector(".code-container");
const codeTabName = document.querySelector(".code-tab-text");

const NOTES_CONTAINER_ID = "#notes-document";
const notesContainer = document.querySelector(NOTES_CONTAINER_ID);

function recordUserAction({ actionType, sessionNumber, email, details }) {
  let payload = {
    ts: Date.now(),
    actionType,
    sessionNumber,
    source: CLIENT_TYPE.NOTES, // reviewing notes, though....
    email,
    details,
  };
  fetch("/record-user-action", {
    body: JSON.stringify(payload),
    ...POST_JSON_REQUEST,
  });
}

async function initialize({
  notesDocChanges,
  notesSessionId,
  sessionNumber,
  email,
}) {
  console.log("received: ", notesDocChanges);
  let notesEditor = new ReadOnlyNotesEditor({
    nodeId: NOTES_CONTAINER_ID,
    deltas: notesDocChanges,
  });

  let codeEditor = new ReviewCodeEditor({ node: codeContainer, doc: ["\n "] });

  codeContainer.addEventListener("animationend", () => {
    codeContainer.classList.remove("just-changed-tab");
  });

  function loadCode(code, fileName) {
    // Replace the code in the playground and switch to that tab.
    codeEditor.replaceContents(code);
    codeTabName.innerText = fileName;
    codeContainer.classList.add("just-changed-tab");
  }

  notesContainer.addEventListener("click", (e) => {
    let el = e.target;
    if (el.tagName !== "BUTTON" || !el.classList.contains("try-it-out")) return;

    el = el.closest(".code-snapshot");
    console.log(el);
    el && loadCode(el.dataset.fullCode, el.dataset.title);
  });

  // Loaded
  recordUserAction({
    actionType: USER_ACTIONS.LOAD_PAGE,
    sessionNumber,
    email,
  });

  document.addEventListener("visibilitychange", () => {
    recordUserAction({
      actionType: USER_ACTIONS.VISIBILITY_CHANGE,
      sessionNumber,
      email,
      details: document.hidden ? "HIDDEN" : "VISIBLE",
    });
  });
}

async function fetchData() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get("id");

  let url = "/notes-session?" + new URLSearchParams({ id });
  let response = await fetch(url, GET_JSON_REQUEST);
  let res = await response.json();
  initialize(res);
}

fetchData();
