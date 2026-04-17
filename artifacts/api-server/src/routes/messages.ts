import { Router } from "express";
import { db } from "@workspace/db";
import { messagesTable } from "@workspace/db";
import { or, and, eq, like, desc } from "drizzle-orm";
import { verifyUserToken } from "./auth";

const router = Router();

function authenticate(req: import("express").Request): string | null {
  const auth = req.headers["authorization"];
  const username = req.headers["x-username"] as string | undefined;
  if (!auth || !username) return null;
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return verifyUserToken(username, token) ? username : null;
}

// Match rows where username is a member of a comma-separated group id
function groupMemberCondition(username: string) {
  return or(
    like(messagesTable.toUsername, `${username},%`),
    like(messagesTable.toUsername, `%,${username}`),
    like(messagesTable.toUsername, `%,${username},%`),
  );
}

router.post("/messages", async (req, res) => {
  const username = authenticate(req);
  if (!username) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { to, text } = req.body;
  if (!to || typeof to !== "string" || !text || typeof text !== "string") {
    res.status(400).json({ error: "to and text are required" }); return;
  }

  const [msg] = await db.insert(messagesTable).values({
    fromUsername: username,
    toUsername: to.trim().toLowerCase(),
    text: text.trim(),
  }).returning();

  res.status(201).json({
    id: msg.id,
    fromUsername: msg.fromUsername,
    toUsername: msg.toUsername,
    text: msg.text,
    sentAt: msg.sentAt.toISOString(),
  });
});

router.get("/messages/conversations", async (req, res) => {
  const username = authenticate(req);
  if (!username) { res.status(401).json({ error: "Unauthorized" }); return; }

  const allMsgs = await db
    .select()
    .from(messagesTable)
    .where(
      or(
        eq(messagesTable.fromUsername, username),
        eq(messagesTable.toUsername, username),
        groupMemberCondition(username),
      )
    )
    .orderBy(desc(messagesTable.sentAt));

  const convMap = new Map<string, { lastMessage: string; lastTime: string }>();

  for (const msg of allMsgs) {
    // Group conversation: to_username contains a comma
    const isGroup = msg.toUsername.includes(",");
    const key = isGroup
      ? msg.toUsername
      : (msg.fromUsername === username ? msg.toUsername : msg.fromUsername);
    if (!convMap.has(key)) {
      convMap.set(key, { lastMessage: msg.text, lastTime: msg.sentAt.toISOString() });
    }
  }

  res.json(Array.from(convMap.entries()).map(([otherUser, data]) => ({
    otherUser,
    lastMessage: data.lastMessage,
    lastTime: data.lastTime,
    unread: 0,
  })));
});

router.get("/messages/:convId", async (req, res) => {
  const username = authenticate(req);
  if (!username) { res.status(401).json({ error: "Unauthorized" }); return; }

  const convId = req.params.convId.trim().toLowerCase();
  const isGroup = convId.includes(",");

  let msgs;
  if (isGroup) {
    // Group: fetch all messages where to_username = groupId
    msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.toUsername, convId))
      .orderBy(messagesTable.sentAt);
  } else {
    // Direct: fetch messages between username and convId
    msgs = await db
      .select()
      .from(messagesTable)
      .where(
        or(
          and(eq(messagesTable.fromUsername, username), eq(messagesTable.toUsername, convId)),
          and(eq(messagesTable.fromUsername, convId), eq(messagesTable.toUsername, username)),
        )
      )
      .orderBy(messagesTable.sentAt);
  }

  res.json(msgs.map(m => ({
    id: m.id,
    fromUsername: m.fromUsername,
    toUsername: m.toUsername,
    text: m.text,
    sentAt: m.sentAt.toISOString(),
  })));
});

export default router;
