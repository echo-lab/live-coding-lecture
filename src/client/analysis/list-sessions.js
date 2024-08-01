import "../style.css";
import { GET_JSON_REQUEST } from "../utils";

const table = document.querySelector("#table-of-sessions");

function initialize({ sessions }) {
  for (let { id, name, startTime, status } of sessions) {
    let tr = document.createElement("tr");
    tr.classList.add(status);

    let idTd = document.createElement("td");
    let idA = document.createElement("a");
    idA.href = `/pages/analysis/session.html?id=${id}`;
    idA.innerText = id;
    idTd.appendChild(idA);
    tr.appendChild(idTd);

    [name, startTime, status].forEach((s) => {
      let td = document.createElement("td");
      td.innerText = s;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  }
}

async function fetchData() {
  let response = await fetch("/lecture-sessions", GET_JSON_REQUEST);
  let res = await response.json();
  initialize(res);
}

fetchData();
