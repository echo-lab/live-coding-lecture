import Quill from "quill";
import { minimalSetup, EditorView } from "codemirror";
import { Decoration } from "@codemirror/view";
import { EditorState, Compartment, StateField } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
let tabSize = new Compartment();

const BlockEmbed = Quill.import("blots/block/embed");

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
    console.log("creating snapshot!: ", {
      id,
      snippet,
      highlightStart,
      highlightEnd,
    });
    // contentEditable=false ==> you don't get a cursor in the button text.
    node.contentEditable = false;
    node.dataset.id = id;
    node.dataset.snippet = snippet;
    node.dataset.highlightStart = highlightStart;
    node.dataset.highlightEnd = highlightEnd;
    node.dataset.selectionStart = selectionStart;
    node.dataset.selectionEnd = selectionEnd;
    node.dataset.fullCode = fullCode;

    let header = document.createElement("div");
    header.classList.add("code-snapshot-header");

    // Collapse button
    let collapse = document.createElement("button");
    collapse.textContent = "collapse";
    // collapse.classList.add("collapse");
    header.appendChild(collapse);
    collapse.addEventListener("click", (e) => {
      e.preventDefault();
      node.classList.toggle("collapsed");
    });

    let fullCodeModal = createFullCodeModal(
      fullCode,
      selectionStart,
      selectionEnd
    );

    // Go to code button
    let showcode = document.createElement("button");
    showcode.textContent = "Open in Playground";
    showcode.classList.add("try-it-out");
    // showcode.id = "show-original";
    header.appendChild(showcode);
    // showcode.addEventListener("click", (e) => {
    //   return;
    // });
    //   e.preventDefault();
    //   console.log("opening modal?");
    //   fullCodeModal.classList.add("open");
    // });

    let codeSnippetContainer = document.createElement("div");
    codeSnippetContainer.classList.add("code-snippet-container");
    setupCodeMirror(
      codeSnippetContainer,
      snippet,
      highlightStart,
      highlightEnd
    );

    node.append(header);
    node.append(codeSnippetContainer);
    node.append(fullCodeModal);

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

function createFullCodeModal(fullCode, highlightStart, highlightEnd) {
  let modalContainer = document.createElement("div");
  modalContainer.classList.add("modal");

  let modalContent = document.createElement("div");
  modalContent.classList.add("modal-content");

  let modalHeader = document.createElement("div");
  modalHeader.classList.add("modal-header");

  let closeSpan = document.createElement("span");
  closeSpan.classList.add("close-modal");
  closeSpan.innerText = "×";
  closeSpan.addEventListener("click", () =>
    modalContainer.classList.remove("open")
  );

  let h2 = document.createElement("h2");
  h2.innerText = "Original Code";

  // end header
  let modalBody = document.createElement("div");
  modalBody.classList.add("modal-body");

  let codeMirrorContainer = document.createElement("div");
  codeMirrorContainer.classList.add("full-code-context-container");

  modalContainer.appendChild(modalContent);
  modalContent.appendChild(modalHeader);
  modalContent.appendChild(modalBody);
  modalHeader.appendChild(closeSpan);
  modalHeader.appendChild(h2);
  modalBody.appendChild(codeMirrorContainer);

  // modalContainer.appendChild(modalHeader);
  // modalHeader.appendChild(closeSpan);
  // modalHeader.appendChild(h2);
  // modalContainer.appendChild(modalContent);
  // // modalContent.appendChild(closeSpan);
  // modalContent.appendChild(codeMirrorContainer);

  setupCodeMirror(codeMirrorContainer, fullCode, highlightStart, highlightEnd);

  return modalContainer;
}

function createFullCodeModal2(fullCode, highlightStart, highlightEnd) {
  let modalContainer = document.createElement("div");
  modalContainer.classList.add("modal");

  let modalContent = document.createElement("div");
  modalContent.classList.add("modal-content");

  let closeSpan = document.createElement("span");
  closeSpan.classList.add("close-modal");
  closeSpan.innerText = "×";
  closeSpan.addEventListener("click", () =>
    modalContainer.classList.remove("open")
  );

  let codeMirrorContainer = document.createElement("div");
  codeMirrorContainer.classList.add("full-code-context-container");

  modalContainer.appendChild(modalContent);
  modalContent.appendChild(closeSpan);
  modalContent.appendChild(codeMirrorContainer);

  setupCodeMirror(codeMirrorContainer, fullCode, highlightStart, highlightEnd);

  return modalContainer;
}

// TODO: look more at possible setup:
// https://github.com/codemirror/basic-setup/blob/b3be7cd30496ee578005bd11b1fa6a8b21fcbece/src/codemirror.ts#L50
function setupCodeMirror(node, code, highlightStart, highlightEnd) {
  highlightStart = parseInt(highlightStart);
  highlightEnd = parseInt(highlightEnd);
  let shouldAddHighlight = highlightStart < highlightEnd && highlightStart >= 0;

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
  return view;
}
