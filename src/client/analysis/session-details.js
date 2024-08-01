import "../style.css";
import { GET_JSON_REQUEST } from "../utils";

const table = document.querySelector("table");
const info = document.querySelector("#session-info");

function makeLink(url, text) {
  let a = document.createElement("a");
  a.href = url;
  a.innerText = text;
  return a;
}

function initialize({ sessions, lectureId, lectureName, lectureStatus }) {
  info.innerHTML = `id=${lectureId} <br/> name=${lectureName} <br/> status=${lectureStatus}`;

  for (let { email, condition, studentUrl, instructorUrl } of sessions) {
    let tr = document.createElement("tr");

    [email, condition].forEach((s) => {
      let td = document.createElement("td");
      td.innerText = s;
      tr.appendChild(td);
    });

    [
      [studentUrl, "link"],
      [instructorUrl, "PRIVATE"],
    ].forEach(([url, text]) => {
      let td = document.createElement("td");
      let a = makeLink(url, text);
      td.appendChild(a);
      tr.appendChild(td);
      console.log(td);
    });
    table.appendChild(tr);
  }
}

async function fetchData() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get("id");

  let url = "/session-details?" + new URLSearchParams({ id });
  let response = await fetch(url, GET_JSON_REQUEST);
  let res = await response.json();
  initialize(res);
}

fetchData();
