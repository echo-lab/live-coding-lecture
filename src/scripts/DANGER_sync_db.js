import { db } from "../server/database.js";
import "../server/models.js";
import promptSync from "prompt-sync";

const prompt = promptSync({ sigint: true });

let message = `Type "destroy my data" if you wish to continue: `;
const result = prompt(message);

if (result === "destroy my data") {
  await db.sync({ force: true });
  console.log("Successfully synced the Database");
} else {
  console.log("No action taken!");
}
