import "./style.css";
import "./style-review.css";

import { GET_JSON_REQUEST, POST_JSON_REQUEST } from "./utils.js";

import { ReviewCodeEditor } from "./code-editors.js";

import { Text } from "@codemirror/state";
import { CLIENT_TYPE, USER_ACTIONS } from "../shared-constants.js";

const TAB_NAMES = ["notes.py", "notes2.py", "notes3.py"];
const codeContainers = ["", "2", "3"].map((n) =>
  document.querySelector(`#code-container${n}`)
);
const codeTabButtons = ["#tab1", "#tab2", "#tab3"].map((s) =>
  document.querySelector(s)
);
let highestTabIdx = 0;
let curTab = 0;

function recordUserAction({ actionType, sessionNumber, email, details }) {
  let payload = {
    ts: Date.now(),
    actionType,
    sessionNumber,
    source: CLIENT_TYPE.TYPEALONG, // reviewing notes, though....
    email,
    details,
  };
  fetch("/record-user-action", {
    body: JSON.stringify(payload),
    ...POST_JSON_REQUEST,
  });
}

// Wait to join a session.
async function initialize({ docs, typealongSessionId, sessionNumber, email }) {
  let codeEditors = TAB_NAMES.map((fileName, idx) => {
    let { doc, docVersion } = docs[fileName] || {
      doc: Text.empty.toJSON(),
      docVersion: 0,
    };

    let node = codeContainers[idx];
    return new ReviewCodeEditor({ node, doc });
  });

  // A bunch of logic for handling the tabs.
  // It ain't pretty, but it works :) [probably]

  // Only present tabs should show up.
  if (docs[TAB_NAMES[1]]) {
    codeTabButtons[1].style.display = "";
    highestTabIdx = 1;
  }
  if (docs[TAB_NAMES[2]]) {
    codeTabButtons[1].style.display = ""; // Ensure tab[1] is present
    codeTabButtons[2].style.display = "";
    highestTabIdx = 2;
  }

  let switchToTab = (idx) => {
    if (idx === curTab) return;
    curTab = idx;

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

  let url = "/typealong-session?" + new URLSearchParams({ id });
  let response = await fetch(url, GET_JSON_REQUEST);
  let res = await response.json();
  initialize(res);
}

fetchData();
