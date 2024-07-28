import { SOCKET_MESSAGE_TYPE } from "../shared-constants.js";
import { LectureSession } from "./database.js";
import { ChangeSet } from "@codemirror/state";

// This only supports the Instructor's changes for now.
// TODO: consider using the same pattern for student changes (though probs not necessary).
export class ChangeBuffer {
  constructor(flushIntervalMs) {
    this.queue = [];
    this.flushInterval = setInterval(this.flush.bind(this), flushIntervalMs);
  }

  initSocket(io) {
    this.io = io;
  }

  // NOTE: queue changes MUST come in order.
  // Dropped changes are recoverable.
  enqueue(change) {
    this.queue.push(change);
  }

  async flush() {
    let queue = this.queue;
    this.queue = [];

    // Currently, this is built for a single session.
    for (let [sessionId, changes] of Object.entries(organizeBySession(queue))) {
      try {
        await flushChangesToSession(sessionId, changes);
      } catch (error) {
        this.io?.emit(SOCKET_MESSAGE_TYPE.INSTRUCTOR_OUT_OF_SYNC, {
          sessionId,
          error: error.message,
        });
        console.error(error);
      }
    }
  }
}

async function flushChangesToSession(sessionId, changeQueue) {
  // This should be a no-op, but just in case :)
  changeQueue.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  let lecture = await LectureSession.findByPk(sessionId);
  if (!lecture) return;

  // Fetch the latest version of the doc
  let { doc, docVersion } = await lecture.getDoc();

  // Now, let's try to apply the changes
  for (let { id, changes, ts } of changeQueue) {
    if (id !== docVersion) {
      throw new Error(`Expected change #${docVersion} but got #${id}`);
    }

    doc = ChangeSet.fromJSON(changes).apply(doc);
    docVersion++;

    // Safe to write :)
    await lecture.createInstructorChange({
      change_number: id,
      change: JSON.stringify(changes),
      change_ts: ts,
    });
  }
  // We might consider also writing the doc to the DB, though eh.
}

function organizeBySession(changes) {
  let res = {};
  for (let change of changes) {
    let { sessionId: id } = change;
    if (!res[id]) {
      res[id] = [change];
    } else {
      res[id].push(change);
    }
  }
  return res;
}
