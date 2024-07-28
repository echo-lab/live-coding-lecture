import { Sequelize, DataTypes, Model, Op } from "sequelize";
import { Text, ChangeSet } from "@codemirror/state";

const sequelize = new Sequelize("sqlite::memory:"); // Example for sqlite

/*
LectureSession
  InstructorChange
  InstructorAction
  TypealongSession
    TypealongChange
    TypealongAction
  NotesSession
    NotesChange
    PlaygroundCodeChange
    NotesAction
*/

const CODE_CHANGE_SCHEMA = {
  change_number: DataTypes.INTEGER,
  change: DataTypes.TEXT,
  change_ts: DataTypes.INTEGER,
};

// Actions that are NOT document/code edits, e.g., running code; copying code into the playground.
const USER_ACTION_SCHEMA = {
  action_ts: DataTypes.INTEGER,
  code_version: DataTypes.INTEGER,
  doc_version: DataTypes.INTEGER,
  action_type: DataTypes.STRING,
};

function reconstructCMDoc(changes) {
  let doc = Text.empty;
  let docVersion = 0;

  changes.forEach(({ change }) => {
    doc = ChangeSet.fromJSON(JSON.parse(change)).apply(doc);
    docVersion++;
  });

  return { doc, docVersion };
}

// NOTE: this class is written for a SINGLE THREADED SERVER!!! Consider rewriting :)
export class LectureSession extends Model {
  async changesSinceVersion(docVersion) {
    // Compose all the changes; return the resulting change and the latest version number
    let changes = await this.getInstructorChanges({
      where: {
        change_number: {
          [Op.gte]: docVersion,
        },
      },
      order: ["change_number"],
    });
    return changes.map(({ change, change_number }) => ({
      change: JSON.parse(change),
      changeNumber: change_number,
    }));
  }

  async getDoc() {
    let changes = await this.getInstructorChanges({
      attributes: ["change", "change_number"],
      order: ["change_number"],
    });
    return reconstructCMDoc(changes);
  }
}

LectureSession.init(
  {
    // Id is probably added automatically?
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    isFinished: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  { sequelize }
);

export class InstructorChange extends Model {}
InstructorChange.init(CODE_CHANGE_SCHEMA, { sequelize });

LectureSession.hasMany(InstructorChange, { foreignKey: "LectureSessionsId" });
InstructorChange.belongsTo(LectureSession);

export class InstructorAction extends Model {}
InstructorAction.init(USER_ACTION_SCHEMA, { sequelize });
LectureSession.hasMany(InstructorAction, { foreignKey: "LectureSessionsId" });
InstructorAction.belongsTo(LectureSession);

export class TypealongSession extends Model {
  // SLOW-ish
  async getCurrentDoc() {
    let changes = await this.getTypealongChanges({
      attributes: ["change", "change_number"],
      order: ["change_number"],
    });
    return reconstructCMDoc(changes);
  }

  async recordCodeChanges(changes) {
    let currentVersion = await this.countTypealongChanges();
    // Should probs check more lol
    // But: we assume it's in order and that there are no gaps :P
    // for (let ch of changes) {
    for (let { changeNumber, changesetJSON, ts } of changes) {
      if (changeNumber !== currentVersion) continue;
      await this.createTypealongChange({
        change_number: changeNumber,
        change: JSON.stringify(changesetJSON),
        change_ts: ts,
      });
      currentVersion++;
    }
    return currentVersion;
  }
}

TypealongSession.init(
  {
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  { sequelize }
);

LectureSession.hasMany(TypealongSession, { foreignKey: "LectureSessionsId" });
TypealongSession.belongsTo(LectureSession);

export class TypealongChange extends Model {}

TypealongChange.init(
  {
    change_number: {
      type: DataTypes.INTEGER,
    },
    change: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    change_ts: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  { sequelize }
);

TypealongSession.hasMany(TypealongChange, { foreignKey: "TypealongChangeId" });
TypealongChange.belongsTo(TypealongSession);

export class TypealongAction extends Model {}
TypealongAction.init(USER_ACTION_SCHEMA, { sequelize });
TypealongSession.hasMany(TypealongAction, { foreignKey: "TypealongChangeId" });
TypealongAction.belongsTo(TypealongSession);

export class NotesSession extends Model {
  // Returns all the deltas, in order.
  // TODO: consider calculating the resulting Delta (i.e., the current document)
  // on server-side.
  async getDeltas() {
    let res = await this.getNotesChanges({
      attributes: ["change", "change_number"],
      order: ["change_number"],
    });
    return res;
  }

  async addChanges(changes) {
    let currentVersion = await this.countNotesChanges();
    // TODO: check more?
    for (let { changeNumber, delta, ts } of changes) {
      if (changeNumber !== currentVersion) continue;
      await this.createNotesChange({
        change_number: changeNumber,
        change: JSON.stringify(delta),
        change_ts: ts,
      });
      currentVersion++;
    }
    return currentVersion;
  }

  async currentPlaygroundCode() {
    let changes = await this.getPlaygroundCodeChanges({
      attributes: ["change", "change_number"],
      order: ["change_number"],
    });
    return reconstructCMDoc(changes);
  }

  async recordCodeChanges(changes) {
    let currentVersion = await this.countPlaygroundCodeChanges();
    for (let { changeNumber, changesetJSON, ts } of changes) {
      if (changeNumber !== currentVersion) continue;
      await this.createPlaygroundCodeChange({
        change_number: changeNumber,
        change: JSON.stringify(changesetJSON),
        change_ts: ts,
      });
      currentVersion++;
    }
    return currentVersion;
  }
}

NotesSession.init(
  {
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  { sequelize }
);

LectureSession.hasMany(NotesSession, { foreignKey: "LectureSessionsId" });
NotesSession.belongsTo(LectureSession);

export class NotesChange extends Model {}

NotesChange.init(CODE_CHANGE_SCHEMA, { sequelize });

NotesSession.hasMany(NotesChange, { foreignKey: "NotesChangeId" });
NotesChange.belongsTo(NotesSession);

export class PlaygroundCodeChange extends Model {}

PlaygroundCodeChange.init(CODE_CHANGE_SCHEMA, { sequelize });

NotesSession.hasMany(PlaygroundCodeChange, { foreignKey: "NotesChangeId" });
PlaygroundCodeChange.belongsTo(NotesSession);

export class NotesAction extends Model {}
NotesAction.init(USER_ACTION_SCHEMA, { sequelize });
NotesSession.hasMany(NotesAction, { foreignKey: "NotesChangeId" });
NotesAction.belongsTo(NotesSession);

await sequelize.sync({ force: true });
