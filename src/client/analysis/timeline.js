import { Text, ChangeSet } from "@codemirror/state";
import { USER_ACTIONS } from "../../shared-constants";

let slider = document.querySelector("#timeline-slider");
let info = document.querySelector(".timeline .info");
let prevButt = document.querySelector("#prev-history");
let nextButt = document.querySelector("#next-history");
let sliderPos = 0;
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
  notesEditor,
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
  console.log("changes: ", changes);

  slider.max = events.length;

  setUpTicks(events);

  let updateSlider = () => {
    let idx = parseInt(slider.value);
    let prevPos = sliderPos;
    sliderPos = idx;
    let tab = "";

    let start = prevPos;
    if (prevPos == sliderPos) return;
    if (prevPos > sliderPos) {
      tab = initialTab;
      start = 0;
      Object.values(codeEditors).forEach((e) => e.reset());
      notesEditor.reset();
    }

    for (let i = start; i < idx; i++) {
      let ev = events[i];
      if (ev.action_type) {
        if (ev.action_type === USER_ACTIONS.SWITCH_TAB) {
          tab = ev.details;
        }
        continue;
      }
      // we got a change
      let { change, file_name } = ev;
      if (file_name !== "instructor.py") {
        tab = file_name;
      }
      if (file_name === "notes") {
        // Figure out what to do
        notesEditor.applyChange(change);
      } else {
        // TODO: move this logic inside... maybe? Meh.
        let changes = ChangeSet.fromJSON(JSON.parse(change));
        codeEditors[file_name].applyChanges(changes);
      }
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
          info.textContent = `t=${s} -- Event: ${ev.action_type} (${ev.details})`;
        } else {
          info.textContent = `t=${s} -- Event: ${ev.action_type}`;
        }
      } else {
        info.textContent = `t=${s} -- Change #${ev.change_number} to file ${ev.file_name}`;
      }
    }
    info.textContent = `${idx}) ${info.textContent}`;
    switchTabFn && tab !== "" && switchTabFn(tab);
  };

  slider.oninput = updateSlider;
  nextButt.addEventListener("click", () => {
    slider.value = sliderPos + 1;
    // sliderPos = parseInt(slider.value);
    updateSlider();
  });
  prevButt.addEventListener("click", () => {
    slider.value = sliderPos - 1;
    // sliderPos = parseInt(slider.value);
    updateSlider();
  });
}
