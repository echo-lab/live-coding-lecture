import { Text, ChangeSet } from "@codemirror/state";
import { USER_ACTIONS } from "../../shared-constants";

let slider = document.querySelector("#timeline-slider");
let info = document.querySelector(".timeline .info");
// let sliderBar = document.querySelector(".timeline .bar");

// // Update the current slider value (each time you drag the slider handle)
// slider.oninput = function () {
//   output.innerHTML = this.value;
// };

function getActiveEventTypes() {
  return Object.keys(USER_ACTIONS).filter((name) => {
    let checkbox = document.querySelector(`#${name}`);
    return checkbox && checkbox.checked;
  });
}

function setUpTicks(events) {
  let updateTicks = () => {
    let dl = document.querySelector("datalist");
    dl.innerHTML = "";

    let activeEventTypes = getActiveEventTypes();

    events.forEach((ev, i) => {
      if (!activeEventTypes.includes(ev.action_type)) return;

      let op = document.createElement("option");
      op.value = i + 1;
      op.label = ev.action_type; // Not shown... BOOO
      dl.appendChild(op);
    });
    slider.setAttribute("list", "tickmarks");
  };

  updateTicks();

  let counts = {};
  Object.keys(USER_ACTIONS).forEach((t) => (counts[t] = 0));
  for (let ev of events) {
    ev.action_type && counts[ev.action_type]++;
  }

  Object.keys(USER_ACTIONS).forEach((actionType) => {
    let checkbox = document.querySelector(`#${actionType}`);
    if (!checkbox) return;
    checkbox.nextElementSibling.innerText += ` (${counts[actionType]})`;
    checkbox.addEventListener("change", updateTicks);
  });
}

export function setupTimeline({
  actions,
  changes,
  codeEditors,
  noteEditor,
  initialTab,
  switchTabFn,
}) {
  for (let a of actions) {
    a.ts = a.action_ts;
  }
  for (let c of changes) {
    c.ts = c.change_ts;
  }
  let events = [...actions, ...changes];
  events.sort((a, b) => a.ts - b.ts);
  let t0 = events.length > 0 ? events[0].ts : 0;

  slider.max = events.length;

  setUpTicks(events);

  slider.oninput = function () {
    let idx = this.value;
    let tab = initialTab;

    let editorContents = {};
    Object.keys(codeEditors).forEach(
      (fname) => (editorContents[fname] = Text.empty)
    );

    for (let i = 0; i < idx; i++) {
      let ev = events[i];
      if (ev.action_type) {
        if (ev.action_type === USER_ACTIONS.SWITCH_TAB) {
          tab = ev.details;
        }
        continue;
      }

      let { change, file_name } = ev;
      // let ch = ChangeSet.fromJSON(JSON.parse(change));
      // let doc = editorContents[file_name];
      // doc = ch.apply(doc);
      // editorContents[file_name] = doc;
      editorContents[file_name] = ChangeSet.fromJSON(JSON.parse(change)).apply(
        editorContents[file_name]
      );
    }

    // Display the information for the event.
    if (idx == 0) {
      info.textContent = "START";
    } else {
      let ev = events[idx - 1];
      let ms = ev.ts - t0;
      let s = ms / 1000;
      if (ev.action_type) {
        if (ev.details) {
          info.textContent = `t=${s} (seconds): Event: ${ev.action_type} (${ev.details})`;
        } else {
          info.textContent = `t=${s} (seconds): Event: ${ev.action_type}`;
        }
      } else {
        info.textContent = `t=${s} (seconds): Change #${ev.change_number} to file ${ev.file_name}`;
      }
    }
    switchTabFn && switchTabFn(tab);
    for (let [fileName, editor] of Object.entries(codeEditors)) {
      editor.replaceContents(editorContents[fileName].toString());
    }
  };
}
