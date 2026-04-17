import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  fromUsername: text("from_username").notNull(),
  toUsername: text("to_username").notNull(),
  text: text("text").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

export type Message = typeof messagesTable.$inferSelect;
