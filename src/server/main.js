import "dotenv/config";
import express from "express";
import ViteExpress from "vite-express";
import * as http from "http";
import { Server } from "socket.io";
import { db } from "./database.js";
import { LectureSession, NotesSession, TypealongSession } from "./models.js";
import { CLIENT_TYPE, SOCKET_MESSAGE_TYPE } from "../shared-constants.js";
import { ChangeBuffer } from "./change-buffer.js";

const app = express();
app.use(express.json());

let instructorChangeBuffer = new ChangeBuffer(5000, db);
let flushInstructorChanges = async () => {
  try {
    await db.transaction(async (t) => {
      await instructorChangeBuffer.flush(t);
    });
    return true;
  } catch (error) {
    console.error("Error flushing changes:", error);
    return false;
  }
};

// Return a list of all the lectures.
app.get("/lecture-sessions", async (req, res) => {
  try {
    let response = await db.transaction(async (t) => {
      let sessions = await LectureSession.findAll(
        {
          order: [["createdAt", "DESC"]],
        },
        { transaction: t }
      );
      sessions = sessions.map((sesh) => ({
        id: sesh.id,
        name: sesh.name,
        startTime: sesh.createdAt,
        status: sesh.isFinished ? "CLOSED" : "OPEN",
      }));
      return { sessions };
    });
    res.json(response);
  } catch (error) {
    console.error("Error fetching all sessions:", error);
    res.json({ error: error.message });
  }
});

// Returns all the student sessions associated w/ a lecture.
app.get("/session-details", async (req, res) => {
  const id = req.query.id;
  try {
    let response = await db.transaction(async (t) => {
      const sesh = await LectureSession.findByPk(id, { transaction: t });
      let typealongSessions = await sesh.getTypealongSessions(
        {},
        { transaction: t }
      );
      let notesSessions = await sesh.getNotesSessions({}, { transaction: t });

      typealongSessions = typealongSessions.map(({ id, email }) => ({
        email,
        condition: "typealong",
        studentUrl: `/pages/review-typealong.html?id=${id}`,
        instructorUrl: `/pages/analysis/typealong.html?id=${id}`,
      }));
      notesSessions = notesSessions.map(({ id, email }) => ({
        email,
        condition: "notes",
        studentUrl: `/pages/review-notes.html?id=${id}`,
        instructorUrl: `/pages/analysis/notes.html?id=${id}`,
      }));

      return {
        sessions: [...typealongSessions, ...notesSessions],
        lectureId: sesh.id,
        lectureName: sesh.name,
        lectureStatus: sesh.isFinished ? "CLOSED" : "OPEN",
      };
    });
    res.json(response);
  } catch (error) {
    console.error("Error:", error);
    res.json({ error: error.message });
  }
});

// Get or create a lecture session
app.post("/lecture-session", async (req, res) => {
  let sessionName = req.body?.sessionName;

  await flushInstructorChanges();

  try {
    let response = await db.transaction(async (t) => {
      let sesh = await LectureSession.current(sessionName, t);
      sesh =
        sesh ||
        (await LectureSession.create(
          { name: sessionName },
          { transaction: t }
        ));

      let { doc, docVersion } = await sesh.getDoc(t);
      return { doc: doc.toJSON(), docVersion, sessionNumber: sesh.id };
    });
    res.json(response);
  } catch (error) {
    console.error("Error getting or creating new lecture:", error);
    res.json({ error: error.message });
  }
});

app.get("/instructor-changes/:sessionId/:docversion", async (req, res) => {
  let sessionId = req.params?.sessionId;
  let docVersion = parseInt(req.params?.docversion);
  if (isNaN(docVersion) || docVersion < 0) {
    res.json({ error: `invalid doc version: ${req.params.docversion}` });
    return;
  }

  await flushInstructorChanges();

  try {
    let response = await db.transaction(async (t) => {
      let sesh = await LectureSession.findByPk(sessionId, { transaction: t });
      if (!sesh) return { error: `Session w/ id=${sessionId} not found` };
      return { changes: await sesh.changesSinceVersion(docVersion, t) };
    });
    res.json(response);
  } catch (error) {
    console.error("Error retrieving changes: ", error);
    res.json({ error: error.message });
  }
});

app.get("/notes-session", async (req, res) => {
  const id = req.query?.id;
  if (!id) return res.json({ error: "No id provided" });

  try {
    let response = await db.transaction(async (t) => {
      let sesh = await NotesSession.findByPk(id, { transaction: t });
      let notesDocChanges = await sesh.getDeltas(t);
      return {
        notesDocChanges,
        notesSessionId: sesh.id,
      };
    });
    res.json(response);
  } catch (error) {
    console.error("Failed to retrieve notes session", error);
    return { error: error.message };
  }
});

// Create a session if it doesn't exist.
// Returns info about:
//   1) the instructor's code (doc/version)
//   2) the student's playground code (doc/version)
//   3) the student's notes (list of changes (Deltas))
//   4) the session Number
app.post("/current-session-notes", async (req, res) => {
  let email = req.body?.email;
  let sessionName = req.body?.sessionName;
  if (!email) {
    res.json({ error: "no email received" });
    return;
  }

  await flushInstructorChanges();

  try {
    let response = await db.transaction(async (t) => {
      let lecture = await LectureSession.current(sessionName, t);
      if (!lecture) return {};
      let notesSession = await lecture.getNotesSessions(
        { where: { email } },
        { transaction: t }
      );
      let sesh =
        notesSession.length > 0
          ? notesSession[0]
          : await lecture.createNotesSession({ email }, { transaction: t });

      let notesDocChanges = await sesh.getDeltas(t);

      let { doc, docVersion } = await sesh.currentPlaygroundCode(t);

      let { doc: lectureDoc, docVersion: lectureDocVersion } =
        await lecture.getDoc(t);
      return {
        playgroundCodeInfo: { doc, docVersion },
        notesDocChanges,
        sessionNumber: lecture.id,
        lectureDoc,
        lectureDocVersion,
        notesSessionId: sesh.id,
      };
    });
    res.json(response);
  } catch (error) {
    console.error("Failed to get or create the current notes session: ", error);
    res.json({ error: error.message });
  }
});

app.post("/record-notes-changes", async (req, res) => {
  let email = req.body?.email;
  let sessionNumber = req.body?.sessionNumber;
  let changes = req.body?.changes;
  if (!email || !sessionNumber || !changes) {
    return res.json({ error: "malformed request" });
  }

  try {
    let response = await db.transaction(async (t) => {
      let lecture = await LectureSession.findByPk(sessionNumber, {
        transaction: t,
      });
      if (!lecture) return { error: `invalid session: ${sessionNumber}` };
      let sesh = await lecture.getNotesSessions(
        { where: { email } },
        { transaction: t }
      );
      if (sesh.length === 0) return { error: "notes session not started?" };
      sesh = sesh[0];
      let committedVersion = await sesh.addChanges(changes, t);
      return { committedVersion };
    });
    res.json(response);
  } catch (error) {
    console.error("Failed to record notes change: ", error);
    return { error: error.message };
  }
});

app.get("/typealong-session", async (req, res) => {
  const id = req.query?.id;
  if (!id) {
    return res.json({ error: "No id provided" });
  }

  try {
    let response = await db.transaction(async (t) => {
      let sesh = await TypealongSession.findByPk(id, { transaction: t });
      return {
        typealongSessionId: id,
        docs: await sesh.getCurrentDocs(t),
      };
    });
    res.json(response);
  } catch (error) {
    console.error("Failed to retrieve typealong session", error);
    return { error: error.message };
  }
});

app.post("/current-session-typealong", async (req, res) => {
  let email = req.body?.email;
  let sessionName = req.body?.sessionName;
  if (!email) {
    res.json({ error: "no email received" });
    return;
  }

  try {
    let response = await db.transaction(async (t) => {
      let lecture = await LectureSession.current(sessionName, t);
      if (!lecture) return {};

      let typealongSessions = await lecture.getTypealongSessions(
        {
          where: { email },
        },
        { transaction: t }
      );

      let sesh =
        typealongSessions.length > 0
          ? typealongSessions[0]
          : await lecture.createTypealongSession({ email }, { transaction: t });
      return {
        sessionNumber: lecture.id,
        typealongSessionId: sesh.id,
        docs: await sesh.getCurrentDocs(t),
      };
    });
    res.json(response);
  } catch (error) {
    console.error("Failed to retrieve current typealong session", error);
    return { error: error.message };
  }
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
    details,
  } = req.body;
  if (!source) return;

  try {
    let response = await db.transaction(async (t) => {
      let lecture = await LectureSession.findByPk(sessionNumber, {
        transaction: t,
      });
      if (!lecture)
        throw new Error(
          `Can't record user action for non-existing session #${sessionNumber}`
        );

      const record = {
        action_ts: ts,
        code_version: codeVersion,
        doc_version: docVersion,
        action_type: actionType,
        details,
      };

      if (source === CLIENT_TYPE.INSTRUCTOR) {
        await lecture.createInstructorAction(record, { transaction: t });
      } else if (source === CLIENT_TYPE.TYPEALONG) {
        let sesh = await lecture.getTypealongSessions(
          { where: { email } },
          { transaction: t }
        );
        await sesh[0].createTypealongAction(record, { transaction: t });
      } else if (source === CLIENT_TYPE.NOTES) {
        let sesh = await lecture.getNotesSessions(
          { where: { email } },
          { transaction: t }
        );
        await sesh[0].createNotesAction(record, { transaction: t });
      } else {
        throw new Error(`User action with unknown source: ${source}`);
      }
      return { success: true };
    });
    res.json(response);
  } catch (error) {
    console.error("Failed to log user action", error);
    return { error: error.message };
  }
});

async function recordBatchCodeChanges(req, res, isTypealong) {
  try {
    let response = await db.transaction(async (t) => {
      // code goes here
      let email = req.body?.email;
      let sessionNumber = req.body?.sessionNumber;
      let changes = req.body?.changes;
      if (!email || !sessionNumber || !changes)
        throw new Error(`Missing email, session, or changes: ${req}`);

      let lecture = await LectureSession.findByPk(sessionNumber, {
        transaction: t,
      });
      if (!lecture) throw new Error(`Couldn't find session #${sessionNumber}`);

      // TODO: we should just pass the pk, but eh.
      let sesh = isTypealong
        ? await lecture.getTypealongSessions(
            { where: { email } },
            { transaction: t }
          )
        : await lecture.getNotesSessions(
            { where: { email } },
            { transaction: t }
          );

      if (sesh.length === 0) {
        throw new Error(
          "Can't record changes for session which hasn't started"
        );
      }
      sesh = sesh[0];

      let committedVersion = await sesh.recordCodeChanges(changes, t);
      return { committedVersion };
    });
    res.json(response);
  } catch (error) {
    console.error("Failed to record batch code changes", error);
    return { error: error.message };
  }
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

    try {
      await db.transaction(async (t) => {
        let lecture = await LectureSession.findByPk(msg.sessionNumber);
        lecture &&
          (await lecture.update({ isFinished: true }, { transaction: t }));
      });
    } catch (error) {
      console.error("failed to close session: ", error);
    }
  });
});

ViteExpress.bind(app, server);
