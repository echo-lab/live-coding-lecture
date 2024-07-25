import Quill from "quill";
import { minimalSetup, EditorView } from "codemirror";
import { Decoration } from "@codemirror/view";
import { EditorState, Compartment, StateField } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
let tabSize = new Compartment();

const BlockEmbed = Quill.import("blots/block/embed");

const SNAPSHOT_TEMPLATE = document.querySelector("#snapshot-template");
const HEADER_TEMPLATE = SNAPSHOT_TEMPLATE.content.children[0];
const SNAPSHOT_CODE_TEMPLATE = SNAPSHOT_TEMPLATE.content.children[1];

export class CodeSnapshotBlot extends BlockEmbed {
  static blotName = "codesnapshot";
  static tagName = "div";
  static className = "code-snapshot";

  static create({
    id,
    snippet,
    highlightStart,
    highlightEnd,
    selectionStart,
    selectionEnd,
    fullCode,
  }) {
    let node = super.create();
    node.contentEditable = false;
    Object.assign(node.dataset, {
      id,
      snippet,
      highlightStart,
      highlightEnd,
      selectionStart,
      selectionEnd,
      fullCode,
    });

    let header = HEADER_TEMPLATE.cloneNode(true);
    let codeSnippetContainer = SNAPSHOT_CODE_TEMPLATE.cloneNode(true);
    node.appendChild(header);
    node.appendChild(codeSnippetContainer);

    let collapseIcon = header.querySelector(".collapse-button");
    // collapseButton.addEventListener("click", (e) => {
    header.addEventListener("click", (e) => {
      if (e.target.classList.contains("try-it-out")) return;
      e.preventDefault();
      codeSnippetContainer.classList.toggle("collapsed");
      collapseIcon.innerText = codeSnippetContainer.classList.contains(
        "collapsed"
      )
        ? "〉"
        : "﹀";
    });

    setupCodeMirror(
      codeSnippetContainer,
      snippet,
      highlightStart,
      highlightEnd
    );

    return node;
  }

  static value(domNode) {
    let {
      id,
      snippet,
      fullCode,
      highlightStart,
      highlightEnd,
      selectionStart,
      selectionEnd,
    } = domNode.dataset;
    return {
      id,
      snippet,
      fullCode,
      highlightStart,
      highlightEnd,
      selectionStart,
      selectionEnd,
    };
    // return domNode.dataset.id;
  }
}

const FIELD_NAMES = {
  id: "id",
  snippet: "snippet",
  fullCode: "full-code",
  highlightStart: "highlight-start",
  highlightEnd: "highlight-end",
  selectionStart: "selection-start",
  selectionEnd: "selection-end",
};

export function createHTMLForCopyWorkaround(blotFields) {
  let dataFields = Object.entries(blotFields).reduce(
    (str, [key, val]) => `${str} data-${FIELD_NAMES[key]}="${val}"`,
    ""
  );

  return `<div class="code-snapshot" ${dataFields}></div>`;
}

// TODO: look more at possible setup:
// https://github.com/codemirror/basic-setup/blob/b3be7cd30496ee578005bd11b1fa6a8b21fcbece/src/codemirror.ts#L50
function setupCodeMirror(node, code, highlightStart, highlightEnd) {
  highlightStart = parseInt(highlightStart);
  highlightEnd = parseInt(highlightEnd);
  // let shouldAddHighlight = highlightStart < highlightEnd && highlightStart >= 0;

  // Take care of the highlight?
  const highlightDecoField = StateField.define({
    create() {
      return Decoration.none.update({
        add: [
          Decoration.mark({ class: "cm-selection-highlight" }).range(
            highlightStart,
            highlightEnd
          ),
        ],
      });
    },
    update(highlight, tr) {
      return highlight;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  let state = EditorState.create({
    doc: code,
    extensions: [
      minimalSetup,
      python(),
      tabSize.of(EditorState.tabSize.of(4)),
      EditorView.editable.of(false),
      highlightDecoField,
    ],
  });

  let view = new EditorView({
    state,
    parent: node,
  });

  ["copy", "cut"].forEach((eventName) => {
    node.addEventListener(eventName, (ev) => {
      let s = view.state.selection.main;
      let { from, to } = s;
      if (s.empty || view.state.sliceDoc(from, to).match(/^\s+$/)) {
        // Empty or all whitespace -- should copy from the Quill editor instead.
        ev.copyFromQuill = true; // Attach for bubbling up :)
      }
    });
  });

  return view;
}
