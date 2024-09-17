import "../style.css";
import "../style-replay.css";

import { GET_JSON_REQUEST } from "../utils.js";

import { ReviewCodeEditor } from "../code-editors.js";
import { PythonCodeRunner } from "../code-runner.js";
import { Text } from "@codemirror/state";
import {
  Console,
  makeConsoleResizable,
  RunInteractions,
} from "../shared-interactions.js";
import { CLIENT_TYPE } from "../../shared-constants.js";
import { setupTimeline } from "./timeline.js";

const TAB_NAMES = ["notes.py", "notes2.py", "notes3.py"];
const codeContainers = ["", "2", "3"].map((n) =>
  document.querySelector(`#code-container${n}`)
);
const codeTabButtons = ["#tab1", "#tab2", "#tab3"].map((s) =>
  document.querySelector(s)
);
let curTab = 0;

const studentDetailsContainer = document.querySelector("#student-email");
// studentDetailsContainer.textContent = email;
const runButtonEl = document.querySelector("#run-button");
const outputCodeContainer = document.querySelector("#all-code-outputs");
const consoleResizer = document.querySelector("#resize-console");
const codeOutputsContainer = document.querySelector("#output-container");
makeConsoleResizable(codeOutputsContainer, consoleResizer);

// Wait to join a session.
async function initialize({ sessionNumber, email, actions, changes }) {
  studentDetailsContainer.textContent = email;

  let currentTab = 0;
  let codeEditors = TAB_NAMES.map((fileName, idx) => {
    let doc = Text.empty.toJSON();
    let node = codeContainers[idx];
    return new ReviewCodeEditor({ node, doc, isEditable: false });
  });

  let codeRunner = new PythonCodeRunner();
  let consoleOutput = new Console(outputCodeContainer);

  let runButtonInteractions = new RunInteractions({
    runButtonEl,
    codeEditor: codeEditors[currentTab],
    codeRunner,
    consoleOutput,
    sessionNumber,
    logRuns: false,
    source: CLIENT_TYPE.TYPEALONG,
    email,
  });

  // A bunch of logic for handling the tabs.
  // It ain't pretty, but it works :) [probably]

  let switchToTab = (idx) => {
    if (idx === curTab) return;
    curTab = idx;

    runButtonInteractions.setEditor(codeEditors[idx]);
    codeContainers.forEach((el, i) => {
      el.style.display = i == idx ? "" : "none";
    });
    codeTabButtons.forEach((el, i) => {
      i === idx
        ? el.classList.add("selected")
        : el.classList.remove("selected");
    });
  };

  codeTabButtons.forEach((el, idx) => {
    el.addEventListener("click", () => switchToTab(idx));
  });

  let switchTabFn = (targetName) => {
    TAB_NAMES.forEach((name, i) => {
      targetName === name && switchToTab(i);
    });
  };
  let fileToEditor = {
    [TAB_NAMES[0]]: codeEditors[0],
    [TAB_NAMES[1]]: codeEditors[1],
    [TAB_NAMES[2]]: codeEditors[2],
  };
  setupTimeline({
    actions,
    changes,
    codeEditors: fileToEditor,
    initialTab: "notes.py",
    switchTabFn,
  });
}

async function fetchData() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get("id");

  let url = "/typealong-session-events?" + new URLSearchParams({ id });
  let response = await fetch(url, GET_JSON_REQUEST);
  let res = await response.json();
  console.log(res);
  initialize(res);
}

fetchData();
