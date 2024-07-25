import "quill/dist/quill.core.css";
import "quill/dist/quill.snow.css";

import { CodeSnapshotBlot } from "./codesnapshot.js";

import Quill from "quill";
import { POST_JSON_REQUEST } from "./utils.js";
Quill.register(CodeSnapshotBlot);

const Delta = Quill.import("delta");

export class NotesEditor {
  constructor({nodeId, deltas, sessionNumber, email}) {
    this.queuedDeltas = [];
    this.localVersionNum = deltas.length;
    this.serverVersionNum = deltas.length;
    this.sessionNumber = sessionNumber;
    this.active = true;
    this.email = email;

    this.quill = new Quill(nodeId, {
      modules: {
        clipboard: {
          matchers: [[".code-snapshot", (node, delta) => delta]],
          // matchers: [[".code-snapshot"]],
        },
        toolbar: {
          // container: toolbarId,
          container: [[{ header: [1, false] }], ["bold", { list: "bullet" }]],
        },
      },
      placeholder: "Your notes here...",
      theme: "snow", // or 'bubble'
    });

    // Calculate the new document
    let doc = new Delta([{ insert: "\n" }]);
    // console.log("Deltas: ", deltas);
    deltas
      .map(({ change }) => new Delta(JSON.parse(change)))
      .forEach((change) => {
        // console.log("applying delta: ", change);
        doc = doc.compose(change);
      });
    this.quill.setContents(doc, Quill.sources.SILENT);

    this.quill.on("text-change", this.onEditorChange.bind(this));
  }

  getDocVersion() {
    return this.localVersionNum;
  }

  endSession() {
    this.active = false;
  }

  createAnchor(
    source,
    {
      id,
      selection,
      selectionPosition,
      fullCode,
      context,
      relativeSelectionPosition,
    }
  ) {
    // handleCodeAnchor && handleCodeAnchor({ selection, context, relativeSelectionPosition, fullCode, id });
    let { from: highlightStart, to: highlightEnd } = relativeSelectionPosition;
    let { from: selectionStart, to: selectionEnd } = selectionPosition;

    const range = this.quill.getSelection(true);
    let snippet = context;
    this.quill.insertText(range.index, "\n", Quill.sources.USER);
    this.quill.insertEmbed(
      range.index + 1,
      "codesnapshot",
      {
        id,
        snippet,
        highlightStart,
        highlightEnd,
        selectionStart,
        selectionEnd,
        fullCode,
      },
      Quill.sources.USER
    );
    this.quill.setSelection(range.index + 2, Quill.sources.SILENT);
  }

  onEditorChange(delta, oldDelta, source) {
    // console.log({ delta, oldDelta, source });
    console.log(delta);
    this.queuedDeltas.push({
      delta,
      ts: Date.now(),
      changeNumber: this.localVersionNum,
    });
    this.localVersionNum++;
  }

  async flushChangesToServer() {
    if (this.queuedDeltas.length === 0 || !this.active) return;

    let payload = {
      sessionNumber: this.sessionNumber,
      changes: this.queuedDeltas,
      email: this.email,
    };

    const response = await fetch("/record-notes-changes", {
      body: JSON.stringify(payload),
      ...POST_JSON_REQUEST,
    });
    const res = await response.json();

    if (res.error) {
      console.warn("ACK! could not flush to server...?");
    } else {
      this.serverVersionNum = res.committedVersion;
      this.queuedDeltas = this.queuedDeltas.filter(
        (d) => d.changeNumber >= this.serverVersionNum
      );
      if (this.queuedDeltas.length > 0) {
        console.warn("queued changes is not empty?!?");
      } else {
        console.log("Successfully flushed changes!");
      }
    }
  }
}
