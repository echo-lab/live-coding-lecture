import { EditorView } from "codemirror";
import { EditorState, Text, ChangeSet } from "@codemirror/state";
import {
  basicExtensions,
  codeSnapshotFields,
  followInstructorExtensions,
  setInstructorSelection,
} from "./cm-extensions.js";
import { PythonCodeRunner } from "./code-runner.js";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
};
const POST_REQUEST = { method: "POST", headers: JSON_HEADERS };
const FLUSH_CHANGES_FREQ = /*seconds=*/ 3 * 1000;

/*
Flushed data in format: 
{
  sessionNumber: 1,
  email: "test@test.com",
  changes: [{
    changes: ChangeSet().toJSON(),
    changeNumber: docVersion,
    ts: Date.now(),
  }, ... ]

Note: if onNewSnapshot is not null, will set up extensions for code snapshots.
*/
// A student code editor whose state is periodically saved to the server.
export class StudentCodeEditor {
  constructor({
    node,
    doc,
    docVersion,
    sessionNumber,
    email,
    flushUrl,
    onNewSnapshot = null,
  }) {
    this.email = email;
    this.docVersion = docVersion;
    this.serverDocVersion = docVersion;
    this.sessionActive = true;
    this.queuedChanges = [];
    this.sessionNumber = sessionNumber;
    this.flushUrl = flushUrl;

    this.codeRunner = new PythonCodeRunner();

    let snapshotExtensions = onNewSnapshot ? codeSnapshotFields(onNewSnapshot) : [];

    let state = EditorState.create({
      doc: Text.of(doc),
      extensions: [
        ...basicExtensions,
        EditorView.updateListener.of(this.onCodeUpdate.bind(this)),
        snapshotExtensions,
      ],
    });

    this.view = new EditorView({ state, parent: node });

    this.flushChangesLoop = setInterval(
      this.flushChanges.bind(this),
      FLUSH_CHANGES_FREQ
    );
  }

  async runCurrentCode() {
    let code = this.view.state.doc.toString();
    let res = await this.codeRunner.asyncRun(code);
    return res;
  }

  onCodeUpdate(viewUpdate) {
    if (!this.sessionActive) return;
    if (!viewUpdate.docChanged) return;
    if (!this.flushUrl) return;
    viewUpdate.transactions.forEach((tr) => {
      this.queuedChanges.push({
        changes: tr.changes.toJSON(),
        changeNumber: this.docVersion,
        ts: Date.now(),
      });
      this.docVersion++;
    });
  }

  replaceContents(newCode) {
    this.view.dispatch({changes: {
      from: 0,
      to: this.view.state.doc.length,
      insert: newCode,
    }});
  }

  endSession() {
    this.sessionActive = false;
    clearInterval(this.flushChangesLoop);
    this.flushChanges();
  }

  async flushChanges() {
    if (this.queuedChanges.length === 0) return;

    // Okay, we have changes to flush!
    let payload = {
      sessionNumber: this.sessionNumber,
      changes: this.queuedChanges,
      email: this.email,
    };
    const response = await fetch(this.flushUrl, {
      body: JSON.stringify(payload),
      ...POST_REQUEST,
    });
    let res = await response.json();
    if (res.error) {
      console.log("ACK, AN ERROR!");
      return;
    }
    // Now we know server is synced up to change X so we can delete earlier things...
    this.serverDocVersion = res.committedVersion;
    this.queuedChanges = this.queuedChanges.filter(
      (ch) => ch.changeNumber >= this.serverDocVersion
    );
    if (this.queuedChanges.length > 0) {
      console.warn("queued changes is not empty???");
    } else {
      console.log("Successfully flushed changes!");
    }
  }
}

/*
This editor just syncs w/ the instructors, including the selection and cursor.
Tries to catch up if it falls behind for whatever reason.
Doesn't log any activity -- only reads from the server.
*/
export class CodeFollowingEditor {
  // Initialize CodeMirror and listen for instructor updates.
  constructor(node, doc, docVersion, socket, onNewSnapshot) {
    this.docVersion = docVersion;
    let state = EditorState.create({
      doc: Text.of(doc),
      extensions: [
        ...basicExtensions,
        ...codeSnapshotFields(onNewSnapshot),
        ...followInstructorExtensions,
        EditorView.editable.of(false),
      ],
    });
    this.view = new EditorView({ state, parent: node });

    socket.on("instructor event", async (msg) => {
      this.handleInstructorEvent(msg);
    });
  }

  async handleInstructorEvent(msg) {
    if (!msg.cursor && !msg.changes) {
      console.warn("Unexpected message: ", msg);
      return;
    }

    if (msg.cursor) {
      // TODO: Possibly don't update the cursor if we KNOW we're out of sync...
      let { anchor, head } = msg.cursor;
      this.view.dispatch({
        effects: setInstructorSelection.of({ anchor, head }),
      });
      return;
    }

    // Uncomment out ONLY FOR TESTING!
    // if (msg.id === 10) {
    //   console.log("dropping change 10: ", msg.changes);
    //   return;
    // }

    let changes = ChangeSet.fromJSON(msg.changes);
    let { id } = msg;

    // Attempt to catch up on changes!
    if (id !== this.docVersion) {
      this.catchUpOnChanges();
      if (id !== this.docVersion) {
        console.warn(
          `Failed to catch up on changes: at ${this.docVersion} of ${id}`
        );
      }
    }

    if (id === this.docVersion) {
      // console.log("Normal dispatch for change: ", id);
      // We're good now!
      this.docVersion++;
      this.view.dispatch({ changes });
    }
  }

  async catchUpOnChanges() {
    const response = await fetch(
      `/instructor-changes/${this.docVersion}`,
      GET_JSON_REQUEST
    );
    let res = await response.json();
    if (!res.changes) return;

    // IMPORTANT: reset the instructor's cursor selection or else the editor gets sad.
    this.view.dispatch({
      effects: setInstructorSelection.of({ anchor: 0, head: 0 }),
    });
    for (let { change, changeNumber } of res.changes) {
      if (changeNumber !== this.docVersion) continue;
      console.log("Catching up on change: ", changeNumber);
      this.docVersion++;
      this.view.dispatch({ changes: ChangeSet.fromJSON(change) });
    }
  }

  currentCode() {
    return this.view.state.doc.toString();
  }
}
