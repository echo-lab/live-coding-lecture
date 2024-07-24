import { Sequelize, DataTypes, Model, Op } from "sequelize";
import { Text, ChangeSet } from "@codemirror/state";

const sequelize = new Sequelize("sqlite::memory:"); // Example for sqlite

const CODE_CHANGE_SCHEMA = {
  change_number: DataTypes.INTEGER,
  change: DataTypes.TEXT,
  change_ts: DataTypes.INTEGER,
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
    return changes.map((change) => ({
      change: JSON.parse(change.val),
      changeNumber: change.change_number,
    }));
  }

  async getDoc() {
    if (this.doc) {
      return { doc: this.doc, docVersion: this.docVersion };
    }

    let changes = await this.getInstructorChanges({
      attributes: ["change", "change_number"],
      order: ["change_number"],
    });
    let { doc, docVersion } = reconstructCMDoc(changes);
    this.doc = doc;
    this.docVersion = docVersion;
    return { doc, docVersion };
  }

  async addOneInstructorChange({ id, changes, ts }) {
    let { doc, docVersion } = await this.getDoc();
    if (id !== docVersion) {
      console.log(`UH OH: id=${id}, docVersion=${docVersion}`);
      // TODO: throw an error...
      return;
    }
    this.doc = ChangeSet.fromJSON(changes).apply(doc);
    this.docVersion++;
    // console.log("updated doc: ", await this.getDoc());
    await this.createInstructorChange({
      change_number: id,
      change: JSON.stringify(changes),
      change_ts: ts,
    });
  }
}

LectureSession.init(
  {
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

export class TypealongSession extends Model {
  // SLOW-ish
  async getCurrentDoc() {
    let changes = await this.getTypealongChanges({
      attributes: ["change", "change_number"],
      order: ["change_number"],
    });
    return reconstructCMDoc(changes);
  }

  async addChanges(changes) {
    let currentVersion = await this.countTypealongChanges();
    // Should probs check more lol
    // But: we assume it's in order and that there are no gaps :P
    for (let ch of changes) {
      if (ch.changeNumber !== currentVersion) continue;
      await this.createTypealongChange({
        change_number: ch.changeNumber,
        change: JSON.stringify(ch.changes),
        change_ts: ch.ts,
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

export class NotesSession extends Model {
  // SLOW-ish
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

  async addCodeChanges(changes) {
    let currentVersion = await this.countPlaygroundCodeChanges();
    for (let { changeNumber, changeset, ts } of changes) {
      if (changeNumber !== currentVersion) continue;
      await this.createPlaygroundCodeChange({
        change_number: changeNumber,
        change: JSON.stringify(changes),
        change_ts: ts,
      })
    }
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

await sequelize.sync({ force: true });
