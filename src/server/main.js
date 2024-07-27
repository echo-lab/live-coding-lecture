import express from "express";
import ViteExpress from "vite-express";
import * as http from "http";
import { Server } from "socket.io";
import { LectureSession } from "./database.js";
import { CLIENT_TYPE, SOCKET_MESSAGE_TYPE } from "../shared-constants.js";

const app = express();

app.use(express.json());

// This only works because we're running the server on one machine lol
// Yay, premature optimization!
class SessionCache {
  constructor() {
    this.session = false; // false means we don't know; null means we don't have one. (shrug)
  }

  // Returns the current session or null
  async getCurrentSession() {
    if (this.session !== false) return this.session;
    let sesh = await LectureSession.findAll({ where: { isFinished: false } });
    this.session = sesh.length === 0 ? null : sesh[0];
    return this.session;
  }

  async createLectureSession() {
    if (await this.getCurrentSession()) {
      // console.log("Already have a session: ", this.getCurrentSession())
      console.warning("Shouldn't create a session if we already have one!");
      // Should probably close it...
    }
    this.session = await LectureSession.create();
    return this.session;
  }

  async closeSession() {
    if (await this.getCurrentSession()) {
      await this.session.update({ isFinished: true });
      this.session = null;
      return true;
    } else {
      return false;
    }
  }
}
let cacher = new SessionCache();

// Get or create the current session
app.post("/current-session", async (req, res) => {
  let sesh =
    (await cacher.getCurrentSession()) || (await cacher.createLectureSession());
  console.log("Session ID: ", sesh.id);

  let { doc, docVersion } = await sesh.getDoc();
  res.json({ doc: doc.toJSON(), docVersion, sessionNumber: sesh.id });
});

app.get("/current-session", async (req, res) => {
  let sesh = await cacher.getCurrentSession();
  if (sesh) {
    let { doc, docVersion } = sesh;
    res.json({ doc: doc.toJSON(), docVersion, sessionNumber: sesh.id });
  } else {
    res.json({ doc: null, docVersion: null });
  }
});

app.post("/end-session", async (req, res) => {
  if (await cacher.closeSession()) {
    res.json({});
  } else {
    res.json({ error: "No open session" });
  }
});

app.get("/instructor-changes/:docversion", async (req, res) => {
  let docVersion = parseInt(req.params.docversion);
  if (isNaN(docVersion) || docVersion < 0) {
    res.json({ error: `invalid doc version: ${req.params.docversion}` });
    return;
  }
  let sesh = await cacher.getCurrentSession();
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

  let lecture = await cacher.getCurrentSession();
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

  res.json({
    playgroundCodeInfo: { doc, docVersion },
    notesDocChanges,
    sessionNumber: lecture.id,
    lectureDoc: lecture.doc,
    lectureDocVersion: lecture.docVersion,
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

  let lecture = await cacher.getCurrentSession();
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

    if (msg.changes) {
      console.log(`Change: ${msg.id}`);
      let sesh = await cacher.getCurrentSession();
      sesh && (await sesh.addOneInstructorChange(msg));
    }
  });

  // Forward info about code runs.
  socket.on(SOCKET_MESSAGE_TYPE.INSTRUCTOR_CODE_RUN, (msg) => {
    io.emit(SOCKET_MESSAGE_TYPE.INSTRUCTOR_CODE_RUN, msg);
  });

  // Forward/push this so the students stop writing.
  socket.on(SOCKET_MESSAGE_TYPE.INSTRUCTOR_END_SESSION, (msg) => {
    io.emit(SOCKET_MESSAGE_TYPE.INSTRUCTOR_END_SESSION, msg);
  });
});

ViteExpress.bind(app, server);
