import "./style.css";
import "./style-notes.css";

import { GET_JSON_REQUEST } from "./utils.js";

import { ReviewCodeEditor } from "./code-editors.js";
import { makeConsoleResizable } from "./shared-interactions.js";
import { ReadOnlyNotesEditor } from "./notes-editor.js";

const codeContainer = document.querySelector(".code-container");
const codeTabName = document.querySelector(".code-tab-text");

const codeOutputsContainer = document.querySelector("#output-container");
const consoleResizer = document.querySelector("#resize-console");
makeConsoleResizable(codeOutputsContainer, consoleResizer, true);

const NOTES_CONTAINER_ID = "#notes-document";
const notesContainer = document.querySelector(NOTES_CONTAINER_ID);

async function initialize({ notesDocChanges, notesSessionId }) {
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
