import express from "express";
import ViteExpress from "vite-express";
import * as http from "http";
import { Server } from "socket.io";
import { LectureSession } from "./database.js";
import { CLIENT_TYPE, SOCKET_MESSAGE_TYPE } from "../shared-constants.js";
import { ChangeBuffer } from "./change-buffer.js";

const app = express();
app.use(express.json());

let instructorChangeBuffer = new ChangeBuffer(5000);

// Get or create the current session
app.post("/current-session", async (req, res) => {
  let sesh =
    (await LectureSession.current()) || (await LectureSession.create());
  console.log("Session ID: ", sesh.id);

  await instructorChangeBuffer.flush(); // In case there are any pending, even if they're erroneous lol.
  let { doc, docVersion } = await sesh.getDoc();
  res.json({ doc: doc.toJSON(), docVersion, sessionNumber: sesh.id });
});

app.get("/current-session", async (req, res) => {
  let sesh = await LectureSession.current();
  if (!sesh) {
    res.json({ doc: null, docVersion: null });
    return;
  }
  await instructorChangeBuffer.flush();
  let { doc, docVersion } = await sesh.getDoc();
  res.json({ doc: doc.toJSON(), docVersion, sessionNumber: sesh.id });
});

app.get("/instructor-changes/:docversion", async (req, res) => {
  let docVersion = parseInt(req.params.docversion);
  if (isNaN(docVersion) || docVersion < 0) {
    res.json({ error: `invalid doc version: ${req.params.docversion}` });
    return;
  }
  let sesh = await LectureSession.current();
  if (!sesh) {
    res.json({ error: "no session" });
  }
  let changes = sesh && (await sesh.changesSinceVersion(docVersion));

  res.json({ changes });
});

// Create a session if it doesn't exist.
// Returns info about:
//   1) the instructor's code (doc/version)
//   2) the student's playground code (doc/version)
//   3) the student's notes (list of changes (Deltas))
//   4) the session Number
app.post("/current-session-notes", async (req, res) => {
  let email = req.body?.email;
  if (!email) {
    res.json({ error: "no email received" });
    return;
  }

  let lecture = await LectureSession.current();
  if (!lecture) {
    res.json({ error: "no lecture" });
    return;
  }

  let notesSessions = await lecture.getNotesSessions({
    where: { email },
  });

  let sesh =
    notesSessions.length > 0
      ? notesSessions[0]
      : await lecture.createNotesSession({ email });

  // Just return all the changes so far... lol
  let notesDocChanges = await sesh.getDeltas();

  // Get the current code-mirror doc and version from the playground code editor.
  let { doc, docVersion } = await sesh.currentPlaygroundCode();
  await instructorChangeBuffer.flush();
  let { doc: lectureDoc, docVersion: lectureDocVersion } =
    await lecture.getDoc();

  res.json({
    playgroundCodeInfo: { doc, docVersion },
    notesDocChanges,
    sessionNumber: lecture.id,
    lectureDoc,
    lectureDocVersion,
  });
});

app.post("/record-notes-changes", async (req, res) => {
  let email = req.body?.email;
  let sessionNumber = req.body?.sessionNumber;
  let changes = req.body?.changes;
  if (!email || !sessionNumber || !changes) {
    return res.json({ error: "malformed request" });
  }

  // TODO: we could also look for the cache first lol.
  let lecture = await LectureSession.findByPk(sessionNumber);
  if (!lecture) {
    return res.json({ error: "no session" });
  }

  let sesh = await lecture.getNotesSessions({ where: { email } });
  if (sesh.length === 0) {
    console.warn("Notes session changes written before handshake established!");
    return res.json({ error: "typealong session not started?" });
    // We can probably just make one then.
  }
  sesh = sesh[0];

  let committedVersion = await sesh.addChanges(changes);
  res.json({ committedVersion });
});

app.post("/current-session-typealong", async (req, res) => {
  let email = req.body?.email;
  if (!email) {
    res.json({ error: "no email received" });
    return;
  }

  let lecture = await LectureSession.current();
  if (!lecture) {
    res.json({ error: "no session" });
    return;
  }

  let typealongSessions = await lecture.getTypealongSessions({
    where: { email },
  });

  let sesh =
    typealongSessions.length > 0
      ? typealongSessions[0]
      : await lecture.createTypealongSession({ email });
  let { doc, docVersion } = await sesh.getCurrentDoc();

  res.json({ doc: doc.toJSON(), docVersion, sessionNumber: lecture.id });
});

app.post("/record-typealong-changes", async (req, res) => {
  await recordBatchCodeChanges(req, res, true);
});

app.post("/record-playground-changes", async (req, res) => {
  await recordBatchCodeChanges(req, res, false);
});

app.post("/record-user-action", async (req, res) => {
  let {
    ts,
    docVersion,
    codeVersion,
    actionType,
    sessionNumber,
    source,
    email,
  } = req.body;
  if (!source) return;

  let lecture = await LectureSession.findByPk(sessionNumber);
  if (!lecture) return;

  const record = {
    action_ts: ts,
    code_version: codeVersion,
    doc_version: docVersion,
    action_type: actionType,
  };

  if (source === CLIENT_TYPE.INSTRUCTOR) {
    await lecture.createInstructorAction(record);
  } else if (source === CLIENT_TYPE.TYPEALONG) {
    let sesh = await lecture.getTypealongSessions({ where: { email } });
    await sesh[0].createTypealongAction(record);
  } else if (source === CLIENT_TYPE.NOTES) {
    let sesh = await lecture.getNotesSessions({ where: { email } });
    await sesh[0].createNotesAction(record);
  } else {
    console.warning("bad source value...");
    return;
  }
});

async function recordBatchCodeChanges(req, res, isTypealong) {
  let email = req.body?.email;
  let sessionNumber = req.body?.sessionNumber;
  let changes = req.body?.changes;
  if (!email || !sessionNumber || !changes) {
    res.json({ error: "malformed request" });
    return;
  }

  let lecture = await LectureSession.findByPk(sessionNumber);
  if (!lecture) {
    res.json({ error: "no session" });
    return;
  }

  let sesh = isTypealong
    ? await lecture.getTypealongSessions({ where: { email } })
    : await lecture.getNotesSessions({ where: { email } });

  if (sesh.length === 0) {
    res.json({ error: "student session not started?" });
    console.warn("Student session not started???");
    return;
  }
  sesh = sesh[0];

  let committedVersion = await sesh.recordCodeChanges(changes);
  res.json({ committedVersion });
}

// ViteExpress.listen(app, 3000, () =>
//   console.log("Server is listening on port 3000..."),
// );

const server = http.createServer(app).listen(3000, () => {
  console.log("Server is listening!");
});

const io = new Server(server);
instructorChangeBuffer.initSocket(io);

// io.listen(3000);
io.on("connection", async (socket) => {
  console.log("a user connected");

  socket.on(SOCKET_MESSAGE_TYPE.INSTRUCTOR_CURSOR, (msg) => {
    io.emit(SOCKET_MESSAGE_TYPE.INSTRUCTOR_CURSOR, msg);
  });

  socket.on(SOCKET_MESSAGE_TYPE.INSTRUCTOR_EDIT, async (msg) => {
    // Forward proactively!
    io.emit(SOCKET_MESSAGE_TYPE.INSTRUCTOR_EDIT, msg);
    // FIXME: these might not get executed in order!

    instructorChangeBuffer.enqueue(msg);
  });

  // Forward info about code runs.
  socket.on(SOCKET_MESSAGE_TYPE.INSTRUCTOR_CODE_RUN, (msg) => {
    io.emit(SOCKET_MESSAGE_TYPE.INSTRUCTOR_CODE_RUN, msg);
  });

  // Forward/push this so the students stop writing.
  socket.on(SOCKET_MESSAGE_TYPE.INSTRUCTOR_END_SESSION, async (msg) => {
    // Forward immediately
    io.emit(SOCKET_MESSAGE_TYPE.INSTRUCTOR_END_SESSION, msg);

    let lecture = await LectureSession.findByPk(msg.sessionNumber);
    lecture && (await lecture.update({ isFinished: true }));
  });
});

ViteExpress.bind(app, server);
