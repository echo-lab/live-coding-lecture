import { EditorView } from "codemirror";
import { EditorState, Text, ChangeSet } from "@codemirror/state";
import {
  basicExtensions,
  capLength,
  codeSnapshotFields,
  followInstructorExtensions,
  setInstructorSelection,
} from "./cm-extensions.js";
import { GET_JSON_REQUEST, POST_JSON_REQUEST } from "./utils.js";
import { SOCKET_MESSAGE_TYPE } from "../shared-constants.js";

const FLUSH_CHANGES_FREQ = /*seconds=*/ 3 * 1000;

/*
Flushed data in format: 
{
  sessionNumber: 1,
  email: "test@test.com",
  changes: [{
    changesetJSON: ChangeSet().toJSON(),
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
    fileName = "",
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
    this.fileName = fileName;

    let snapshotExtensions = onNewSnapshot
      ? codeSnapshotFields(onNewSnapshot)
      : [];

    let state = EditorState.create({
      doc: Text.of(doc),
      extensions: [
        ...basicExtensions,
        EditorView.updateListener.of(this.onCodeUpdate.bind(this)),
        snapshotExtensions,
        capLength,
      ],
    });

    this.view = new EditorView({ state, parent: node });

    this.flushChangesLoop = setInterval(
      this.flushChanges.bind(this),
      FLUSH_CHANGES_FREQ
    );
  }

  getDocVersion() {
    return this.docVersion;
  }

  currentCode() {
    return this.view.state.doc.toString();
  }

  onCodeUpdate(viewUpdate) {
    if (!this.sessionActive) return;
    if (!viewUpdate.docChanged) return;
    if (!this.flushUrl) return;
    viewUpdate.transactions.forEach((tr) => {
      this.queuedChanges.push({
        changesetJSON: tr.changes.toJSON(),
        changeNumber: this.docVersion,
        ts: Date.now(),
        fileName: this.fileName,
      });
      this.docVersion++;
    });
  }

  replaceContents(newCode) {
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: newCode,
      },
    });
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
      ...POST_JSON_REQUEST,
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
        capLength,
      ],
    });
    this.view = new EditorView({ state, parent: node });
    this.active = true;

    socket.on(
      SOCKET_MESSAGE_TYPE.INSTRUCTOR_EDIT,
      this.handleInstructorEdit.bind(this)
    );
    socket.on(
      SOCKET_MESSAGE_TYPE.INSTRUCTOR_CURSOR,
      this.handleInstructorCursorChange.bind(this)
    );
  }

  getDocVersion() {
    return this.docVersion;
  }

  handleInstructorCursorChange({ anchor, head }) {
    if (anchor > this.view.state.doc.length) return;
    if (head > this.view.state.doc.length) return;
    this.view.dispatch({
      effects: setInstructorSelection.of({ anchor, head }),
    });
  }

  // FIXME: Think about the actual failure modes, given socket io is guaranteed in-order (w/ possible drops).
  async handleInstructorEdit({ changes, id }) {
    changes = ChangeSet.fromJSON(changes);
    if (id !== this.docVersion) {
      // FIXME: think about what else to do here...
      await this.catchUpOnChanges();
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

  stopFollowing() {
    this.active = false;
  }
}

export class InstructorCodeEditor {
  constructor({
    node,
    socket,
    doc,
    startVersion,
    sessionNumber,
    fileName = "instructor.py",
  }) {
    this.docVersion = startVersion;
    this.socket = socket;
    this.sessionNumber = sessionNumber;
    this.fileName = fileName;

    let state = EditorState.create({
      doc: Text.of(doc),
      extensions: [
        ...basicExtensions,
        EditorView.updateListener.of(
          this.broadcastInstructorChanges.bind(this)
        ),
        capLength,
      ],
    });

    this.view = new EditorView({ state, parent: node });
    this.active = true;
  }

  getDocVersion() {
    return this.docVersion;
  }

  currentCode() {
    return this.view.state.doc.toString();
  }

  endSession() {
    this.active = false;
  }

  broadcastInstructorChanges(viewUpdate) {
    if (!this.active) return;

    if (viewUpdate.docChanged) {
      viewUpdate.transactions.forEach((tr) => {
        // if (!tr.annotation(Transaction.userEvent)) return;
        // let userEvent = tr.annotation(Transaction.userEvent);
        this.socket.emit(SOCKET_MESSAGE_TYPE.INSTRUCTOR_EDIT, {
          sessionId: this.sessionNumber,
          id: this.docVersion,
          changes: tr.changes.toJSON(),
          ts: Date.now(),
        });
        this.docVersion++;
      });
    }
    // If the cursor position might have changed, send out the current one.
    if (
      viewUpdate.docChanged ||
      viewUpdate.transactions.some((tr) => tr.isUserEvent("select"))
    ) {
      let { anchor, head } = viewUpdate.state.selection.main;
      this.socket.emit(SOCKET_MESSAGE_TYPE.INSTRUCTOR_CURSOR, {
        anchor,
        head,
      });
    }
  }
}
