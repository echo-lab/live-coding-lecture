import * as LZString from "lz-string";

// Nasty global!

// let originalFetch = fetch;

export class Recorder {
  constructor() {
    this.changes = [];
    this.startTime = Date.now();
  }

  record(change) {
    this.changes.push({ t: Date.now() - this.startTime, change });
  }

  dump(name) {
    window.localStorage[name] = LZString.compress(JSON.stringify(this.changes));
  }
}

let timeT = (t) =>
  new Promise((resolve) => setTimeout(resolve, t - Date.now()));

export async function replayChanges(name, replayFn) {
  let decompressed = LZString.decompress(window.localStorage[name]);
  let events = JSON.parse(decompressed);
  let t0 = Date.now();

  for (let { t, change } of events) {
    await timeT(t0 + t);
    replayFn(change);
  }
  console.log("finished replay!");
}
