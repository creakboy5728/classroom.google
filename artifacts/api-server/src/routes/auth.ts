import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

export function hashPassword(password: string): string {
  const secret = process.env.SESSION_SECRET || "peersavr-secret";
  return crypto.createHash("sha256").update(password + secret).digest("hex");
}

export function makeToken(username: string): string {
  const secret = process.env.SESSION_SECRET || "peersavr-secret";
  return crypto.createHash("sha256").update(username + ":" + secret).digest("hex");
}

export function verifyToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  // Find user whose token matches
  // Token = sha256(username:secret) — deterministic, no DB lookup needed
  // We extract username from the request separately
  return token;
}

export function tokenForUser(username: string): string {
  return makeToken(username);
}

export function verifyUserToken(username: string, token: string): boolean {
  return makeToken(username) === token;
}

router.post("/auth/signup", async (req, res) => {
  const { username, password } = req.body;

  if (!username || typeof username !== "string" || username.trim().length === 0) {
    res.status(400).json({ error: "Username is required" });
    return;
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const cleanUsername = username.trim().toLowerCase();
  const existing = await db.select().from(usersTable).where(eq(usersTable.username, cleanUsername)).limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Username already taken. Please choose another." });
    return;
  }

  const passwordHash = hashPassword(password);
  await db.insert(usersTable).values({ username: cleanUsername, passwordHash });

  res.status(201).json({
    username: cleanUsername,
    token: makeToken(cleanUsername),
    message: "Account created successfully",
  });
});

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || typeof username !== "string" || !password || typeof password !== "string") {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const cleanUsername = username.trim().toLowerCase();
  const passwordHash = hashPassword(password);
  const users = await db.select().from(usersTable).where(eq(usersTable.username, cleanUsername)).limit(1);

  if (users.length === 0 || users[0].passwordHash !== passwordHash) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  res.status(200).json({
    username: cleanUsername,
    token: makeToken(cleanUsername),
    message: "Login successful",
  });
});

export default router;
