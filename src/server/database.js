import { Sequelize } from "sequelize";

export const db = new Sequelize({
  dialect: "sqlite",
  storage: "db.sqlite",
  // The following is necessary to prevent deadlock in certain situations! Ugh!
  // See: https://github.com/sequelize/sequelize/issues/10304
  transactionType: Sequelize.Transaction.TYPES.IMMEDIATE,
  logging: false, // TODO: consider turning back on?
});
