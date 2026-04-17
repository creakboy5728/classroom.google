import { useState, useEffect, useRef, useCallback } from "react";
import Peer, { DataConnection } from "peerjs";
import { clearStoredUser, authHeaders, type AuthUser } from "../lib/auth";

interface ChatPageProps {
  user: AuthUser;
  onLogout: () => void;
}

interface Message {
  id: string;
  dbId?: number;
  text: string;
  sender: string;
  side: "me" | "them" | "system";
  time: string;
}

interface Conversation {
  convId: string;
  members: string[];      // all members excluding self
  displayName: string;    // "@alice" or "@alice, @bob"
  isGroup: boolean;
  messages: Message[];
  unread: number;
  lastTime: string;
  conns: Record<string, DataConnection>;  // memberId → open P2P conn
  latestDbId: number;
}

const BASE = import.meta.env.BASE_URL;
const POLL_INTERVAL = 3000;

function getTime(isoOrDate?: string): string {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function makeId() { return Date.now() + Math.random() + ""; }

// Stable sorted group id including self
function buildConvId(members: string[], self: string): string {
  return [...new Set([...members, self])].sort().join(",");
}

function avatarLetter(name: string) { return name.slice(0, 2).toUpperCase(); }

// ─── Dark avatar palette ──────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-zinc-600","bg-stone-600","bg-neutral-600","bg-slate-600",
  "bg-gray-500","bg-zinc-500","bg-neutral-500","bg-stone-500",
];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function ChatPage({ user, onLogout }: ChatPageProps) {
  const [peerReady, setPeerReady] = useState(false);
  const [conversations, setConversations] = useState<Record<string, Conversation>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [connectTarget, setConnectTarget] = useState("");
  const [peerError, setPeerError] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const peerRef = useRef<Peer | null>(null);
  const convsRef = useRef<Record<string, Conversation>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { convsRef.current = conversations; }, [conversations]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [conversations, activeId]);

  // ─── DB helpers ───────────────────────────────────────────────────────────

  const saveMessage = useCallback(async (convId: string, text: string): Promise<number | null> => {
    try {
      const res = await fetch(`${BASE}api/messages`, {
        method: "POST",
        headers: authHeaders(user),
        body: JSON.stringify({ to: convId, text }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { id: number };
      return data.id;
    } catch { return null; }
  }, [user]);

  const loadMessagesFromDb = useCallback(async (convId: string): Promise<Message[]> => {
    try {
      const res = await fetch(`${BASE}api/messages/${encodeURIComponent(convId)}`, { headers: authHeaders(user) });
      if (!res.ok) return [];
      const msgs = await res.json() as Array<{ id: number; fromUsername: string; text: string; sentAt: string }>;
      return msgs.map(m => ({
        id: m.id + "",
        dbId: m.id,
        text: m.text,
        sender: m.fromUsername === user.username ? "You" : m.fromUsername,
        side: m.fromUsername === user.username ? "me" as const : "them" as const,
        time: getTime(m.sentAt),
      }));
    } catch { return []; }
  }, [user]);

  // ─── Polling ──────────────────────────────────────────────────────────────

  const pollNewMessages = useCallback(async () => {
    const convs = convsRef.current;
    for (const [convId, conv] of Object.entries(convs)) {
      try {
        const res = await fetch(`${BASE}api/messages/${encodeURIComponent(convId)}`, { headers: authHeaders(user) });
        if (!res.ok) continue;
        const msgs = await res.json() as Array<{ id: number; fromUsername: string; text: string; sentAt: string }>;
        if (!msgs.length) continue;
        const latestId = msgs[msgs.length - 1].id;
        if (latestId <= conv.latestDbId) continue;
        const existingDbIds = new Set(conv.messages.map(m => m.dbId).filter(Boolean));
        const newMsgs = msgs
          .filter(m => m.id > conv.latestDbId && !existingDbIds.has(m.id) && m.fromUsername !== user.username)
          .map(m => ({
            id: m.id + "",
            dbId: m.id,
            text: m.text,
            sender: m.fromUsername === user.username ? "You" : m.fromUsername,
            side: m.fromUsername === user.username ? "me" as const : "them" as const,
            time: getTime(m.sentAt),
          }));
        if (!newMsgs.length) {
          // Still update latestDbId so we don't re-fetch own messages each poll
          setConversations(prev => {
            const existing = prev[convId];
            if (!existing || latestId <= existing.latestDbId) return prev;
            return { ...prev, [convId]: { ...existing, latestDbId: latestId } };
          });
          continue;
        }
        setConversations(prev => {
          const existing = prev[convId];
          if (!existing) return prev;
          const existingIds2 = new Set(existing.messages.map(m => m.dbId).filter(Boolean));
          const truly_new = newMsgs.filter(m => !existingIds2.has(m.dbId));
          if (!truly_new.length) return { ...prev, [convId]: { ...existing, latestDbId: latestId } };

          // For each new message, check if a P2P copy (no dbId) already exists
          // with the same text+sender — if so, attach the dbId instead of duplicating
          let updatedMessages = [...existing.messages];
          const toAdd: typeof truly_new = [];
          for (const newMsg of truly_new) {
            const p2pIdx = updatedMessages.findIndex(
              m => !m.dbId && m.text === newMsg.text && m.sender === newMsg.sender,
            );
            if (p2pIdx !== -1) {
              updatedMessages[p2pIdx] = { ...updatedMessages[p2pIdx], dbId: newMsg.dbId };
            } else {
              toAdd.push(newMsg);
            }
          }

          const fromThem = toAdd.filter(m => m.side === "them").length;
          return {
            ...prev,
            [convId]: {
              ...existing,
              messages: toAdd.length ? [...updatedMessages, ...toAdd] : updatedMessages,
              unread: existing.unread + (activeId === convId ? 0 : fromThem),
              lastTime: toAdd.length ? toAdd[toAdd.length - 1].time : existing.lastTime,
              latestDbId: latestId,
            },
          };
        });
      } catch { /* continue */ }
    }
  }, [user, activeId]);

  // ─── Conversation state ───────────────────────────────────────────────────

  const upsertConv = useCallback((
    convId: string,
    members: string[],
    connUpdate: { memberId: string; conn: DataConnection | null } | null,
    newMsg?: Message,
  ) => {
    const isGroup = members.length > 1;
    const displayName = members.map(m => `@${m}`).join(", ");
    setConversations(prev => {
      const existing = prev[convId];
      const msgs = newMsg ? [...(existing?.messages ?? []), newMsg] : (existing?.messages ?? []);
      const unread = newMsg && newMsg.side === "them" ? (existing?.unread ?? 0) + 1 : (existing?.unread ?? 0);
      const latestDbId = newMsg?.dbId && newMsg.dbId > (existing?.latestDbId ?? 0)
        ? newMsg.dbId : (existing?.latestDbId ?? 0);
      const prevConns = existing?.conns ?? {};
      const conns = connUpdate
        ? connUpdate.conn
          ? { ...prevConns, [connUpdate.memberId]: connUpdate.conn }
          : Object.fromEntries(Object.entries(prevConns).filter(([k]) => k !== connUpdate.memberId))
        : prevConns;
      return {
        ...prev,
        [convId]: {
          convId,
          members,
          displayName,
          isGroup,
          messages: msgs,
          unread,
          lastTime: newMsg ? newMsg.time : (existing?.lastTime ?? getTime()),
          conns,
          latestDbId,
        },
      };
    });
  }, []);

  // ─── P2P helpers ──────────────────────────────────────────────────────────

  function wireConn(convId: string, members: string[], fromMemberId: string, conn: DataConnection) {
    upsertConv(convId, members, { memberId: fromMemberId, conn });
    conn.on("data", (data: unknown) => {
      const d = data as { type?: string; text?: string; time?: string; sender?: string };
      if (d?.type === "chat") {
        const msg: Message = {
          id: makeId(),
          text: d.text ?? "",
          sender: d.sender ?? fromMemberId,
          side: "them",
          time: d.time ?? getTime(),
        };
        upsertConv(convId, members, null, msg);
      }
    });
    conn.on("close", () => upsertConv(convId, members, { memberId: fromMemberId, conn: null }));
    conn.on("error", () => upsertConv(convId, members, { memberId: fromMemberId, conn: null }));
  }

  function tryConnect(convId: string, members: string[]) {
    const p = peerRef.current;
    if (!p) return;
    for (const memberId of members) {
      if (memberId === user.username) continue;
      const existing = convsRef.current[convId];
      if (existing?.conns[memberId]?.open) continue;
      const conn = p.connect(memberId);
      conn.on("open", () => {
        conn.send({ type: "hello", displayName: user.username, convId, members });
        conn.once("data", (data: unknown) => {
          const d = data as { type?: string };
          if (d?.type === "hello-ack") {
            wireConn(convId, members, memberId, conn);
          }
        });
      });
      conn.on("error", () => { /* peer offline, DB fallback handles it */ });
    }
  }

  // ─── Load history ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadHistory() {
      setLoadingHistory(true);
      try {
        const res = await fetch(`${BASE}api/messages/conversations`, { headers: authHeaders(user) });
        if (!res.ok) return;
        const convList = await res.json() as Array<{ otherUser: string; lastMessage: string; lastTime: string }>;
        const convMap: Record<string, Conversation> = {};
        await Promise.all(convList.map(async (c) => {
          const convId = c.otherUser;
          const rawMembers = convId.includes(",")
            ? convId.split(",").filter(m => m !== user.username)
            : [convId];
          const msgs = await loadMessagesFromDb(convId);
          const latestDbId = msgs.length ? Math.max(...msgs.map(m => m.dbId ?? 0)) : 0;
          convMap[convId] = {
            convId,
            members: rawMembers,
            displayName: rawMembers.map(m => `@${m}`).join(", "),
            isGroup: rawMembers.length > 1,
            messages: msgs,
            unread: 0,
            lastTime: getTime(c.lastTime),
            conns: {},
            latestDbId,
          };
        }));
        setConversations(convMap);
        for (const [convId, conv] of Object.entries(convMap)) {
          tryConnect(convId, conv.members);
        }
      } catch { /* silently fail */ }
      finally { setLoadingHistory(false); }
    }
    loadHistory();
  }, [user]);

  // ─── PeerJS setup ─────────────────────────────────────────────────────────

  useEffect(() => {
    const p = new Peer(user.username, {
      config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] },
    });
    peerRef.current = p;
    p.on("open", () => setPeerReady(true));
    p.on("error", (err) => {
      if (err.type === "unavailable-id") setPeerError("Your username is in use by another session.");
      else if (err.type !== "peer-unavailable") setPeerError("Network error: " + err.message);
    });
    p.on("connection", (conn) => {
      conn.on("open", () => {
        conn.once("data", (data: unknown) => {
          const d = data as { type?: string; displayName?: string; convId?: string; members?: string[] };
          if (d?.type === "hello") {
            const senderId = conn.peer;
            const convId = d.convId ?? buildConvId(
              d.members ? d.members.filter(m => m !== user.username) : [senderId],
              user.username,
            );
            // Derive full member list from convId so all participants are included
            const members = convId.split(",").filter((m: string) => m !== user.username);
            conn.send({ type: "hello-ack", displayName: user.username });
            wireConn(convId, members, senderId, conn);
            setActiveId(convId);
            if (window.innerWidth < 640) setShowSidebar(false);
          }
        });
      });
    });
    return () => { p.destroy(); };
  }, [user.username]);

  // ─── Start polling after history loads ───────────────────────────────────

  useEffect(() => {
    if (loadingHistory) return;
    pollRef.current = setInterval(pollNewMessages, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadingHistory, pollNewMessages]);

  // ─── UI actions ───────────────────────────────────────────────────────────

  function selectConversation(convId: string) {
    setActiveId(convId);
    setConversations(prev => prev[convId] ? { ...prev, [convId]: { ...prev[convId], unread: 0 } } : prev);
    if (window.innerWidth < 640) setShowSidebar(false);
    const conv = convsRef.current[convId];
    if (conv) tryConnect(convId, conv.members);
  }

  function startConversation() {
    const raw = connectTarget.trim().toLowerCase();
    if (!raw) return;
    // Split by comma to support groups: "alice, bob" → ["alice","bob"]
    const parts = raw.split(",").map(s => s.trim()).filter(Boolean).filter(s => s !== user.username);
    if (!parts.length) return;
    const convId = buildConvId(parts, user.username);
    setConversations(prev => ({
      ...prev,
      [convId]: prev[convId] ?? {
        convId,
        members: parts,
        displayName: parts.map(m => `@${m}`).join(", "),
        isGroup: parts.length > 1,
        messages: [],
        unread: 0,
        lastTime: getTime(),
        conns: {},
        latestDbId: 0,
      },
    }));
    setActiveId(convId);
    setConnectTarget("");
    if (window.innerWidth < 640) setShowSidebar(false);
    tryConnect(convId, parts);
  }

  async function sendMessage() {
    if (!inputText.trim() || !activeId) return;
    const conv = convsRef.current[activeId];
    if (!conv) return;
    const text = inputText.trim();
    const time = getTime();

    const msg: Message = { id: makeId(), text, sender: "You", side: "me", time };
    upsertConv(activeId, conv.members, null, msg);
    setInputText("");

    // Broadcast via P2P to all connected members
    for (const [, conn] of Object.entries(conv.conns)) {
      if (conn.open) {
        conn.send({ type: "chat", text, time, sender: user.username, convId: activeId });
      }
    }

    // Save to DB (guaranteed delivery)
    const dbId = await saveMessage(activeId, text);
    if (dbId !== null) {
      const savedId = activeId;
      setConversations(prev => {
        const c = prev[savedId];
        if (!c) return prev;
        return {
          ...prev,
          [savedId]: {
            ...c,
            messages: c.messages.map(m => m.id === msg.id ? { ...m, dbId } : m),
            latestDbId: dbId > c.latestDbId ? dbId : c.latestDbId,
          },
        };
      });
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function handleLogout() {
    peerRef.current?.destroy();
    if (pollRef.current) clearInterval(pollRef.current);
    clearStoredUser();
    onLogout();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const sortedConvs = Object.values(conversations).sort((a, b) => b.lastTime.localeCompare(a.lastTime));
  const activeConv = activeId ? conversations[activeId] : null;
  const anyOnline = activeConv ? Object.values(activeConv.conns).some(c => c.open) : false;

  if (peerError) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 rounded-2xl shadow-xl p-8 max-w-sm w-full text-center border border-zinc-800">
          <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Connection Error</h2>
          <p className="text-sm text-zinc-400 mb-6">{peerError}</p>
          <button onClick={handleLogout} className="w-full py-3 bg-white text-black rounded-xl font-semibold text-sm hover:bg-zinc-200 transition-colors">Back to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-black overflow-hidden">
      {/* Top bar */}
      <div className="bg-zinc-900 text-white px-4 py-3 flex items-center justify-between border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          {!showSidebar && activeConv && (
            <button onClick={() => setShowSidebar(true)} className="sm:hidden p-1.5 hover:bg-zinc-800 rounded-lg transition-colors mr-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
          <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">Messenger</div>
            <div className="text-xs text-zinc-400 font-mono">@{user.username}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${peerReady ? "bg-emerald-400" : "bg-yellow-400 animate-pulse"}`} />
          <span className="text-xs text-zinc-400">{peerReady ? "Online" : "Connecting..."}</span>
          <button onClick={handleLogout} className="ml-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors font-medium">Sign out</button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className={`${showSidebar ? "flex" : "hidden"} sm:flex flex-col w-full sm:w-72 bg-zinc-900 border-r border-zinc-800 flex-shrink-0`}>
          <div className="p-3 border-b border-zinc-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={connectTarget}
                onChange={e => setConnectTarget(e.target.value)}
                onKeyDown={e => e.key === "Enter" && startConversation()}
                placeholder="@username or @alice, @bob..."
                className="flex-1 px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all"
              />
              <button
                onClick={startConversation}
                disabled={!connectTarget.trim()}
                className="p-2 bg-white text-black rounded-xl hover:bg-zinc-200 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-1.5 px-1">Comma-separate names for a group chat</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <svg className="w-5 h-5 text-zinc-500 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : sortedConvs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
                <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-zinc-400">No messages yet</p>
                <p className="text-xs text-zinc-600 mt-1">Enter a username above to start</p>
              </div>
            ) : (
              sortedConvs.map(conv => {
                const lastMsg = conv.messages[conv.messages.length - 1];
                const isActive = activeId === conv.convId;
                const isOnline = Object.values(conv.conns).some(c => c.open);
                return (
                  <button
                    key={conv.convId}
                    onClick={() => selectConversation(conv.convId)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-b border-zinc-800 ${isActive ? "bg-zinc-800" : "hover:bg-zinc-800/60"}`}
                  >
                    <div className="relative flex-shrink-0">
                      {conv.isGroup ? (
                        <div className="w-11 h-11 rounded-full bg-zinc-700 flex items-center justify-center">
                          <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 7a4 4 0 100 8 4 4 0 000-8z" />
                          </svg>
                        </div>
                      ) : (
                        <div className={`w-11 h-11 rounded-full ${avatarColor(conv.members[0] ?? "")} flex items-center justify-center text-white font-bold text-sm`}>
                          {avatarLetter(conv.members[0] ?? "?")}
                        </div>
                      )}
                      {isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-zinc-900" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-sm font-semibold truncate ${isActive ? "text-white" : "text-zinc-200"}`}>{conv.displayName}</span>
                        <span className="text-xs text-zinc-500 ml-2 flex-shrink-0">{conv.lastTime}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-zinc-500 truncate">
                          {lastMsg ? (lastMsg.side === "me" ? `You: ${lastMsg.text}` : lastMsg.text) : "Start chatting"}
                        </p>
                        {conv.unread > 0 && (
                          <span className="ml-2 flex-shrink-0 w-5 h-5 bg-white text-black text-xs rounded-full flex items-center justify-center font-bold">
                            {conv.unread > 9 ? "9+" : conv.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat area */}
        <div
          className="flex-col flex-1 min-w-0 bg-black"
          style={{ display: showSidebar && window.innerWidth < 640 ? "none" : "flex" }}
        >
          {!activeConv ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-black">
              <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mb-5 border border-zinc-800">
                <svg className="w-10 h-10 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-zinc-400 font-semibold text-lg">Select a conversation</p>
              <p className="text-zinc-600 text-sm mt-1">or start one by entering a username</p>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center gap-3 flex-shrink-0">
                <div className="relative">
                  {activeConv.isGroup ? (
                    <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center">
                      <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 7a4 4 0 100 8 4 4 0 000-8z" />
                      </svg>
                    </div>
                  ) : (
                    <div className={`w-10 h-10 rounded-full ${avatarColor(activeConv.members[0] ?? "")} flex items-center justify-center text-white font-bold text-sm`}>
                      {avatarLetter(activeConv.members[0] ?? "?")}
                    </div>
                  )}
                  {anyOnline && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-zinc-900" />}
                </div>
                <div>
                  <div className="font-semibold text-white text-sm">{activeConv.displayName}</div>
                  <div className="text-xs text-zinc-500 flex items-center gap-1">
                    {anyOnline ? (
                      <><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block" />Online — instant delivery</>
                    ) : (
                      <><span className="w-1.5 h-1.5 bg-zinc-600 rounded-full inline-block" />Messages saved, delivered when online</>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2 bg-black">
                {activeConv.messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-400 font-bold text-xl">
                      {activeConv.isGroup ? (
                        <svg className="w-7 h-7 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 7a4 4 0 100 8 4 4 0 000-8z" />
                        </svg>
                      ) : avatarLetter(activeConv.members[0] ?? "?")}
                    </div>
                    <p className="text-sm font-medium text-zinc-400">
                      {activeConv.isGroup ? `Group: ${activeConv.displayName}` : `Say hello to ${activeConv.displayName}`}
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">Messages are saved even if they're offline</p>
                  </div>
                )}
                {activeConv.messages.map(msg => {
                  if (msg.side === "system") {
                    return <div key={msg.id} className="text-center text-xs text-zinc-600 py-1">{msg.text}</div>;
                  }
                  return (
                    <div key={msg.id} className={`flex ${msg.side === "me" ? "justify-end" : "justify-start"} items-end gap-2`}>
                      {msg.side === "them" && (
                        <div className={`w-7 h-7 rounded-full ${avatarColor(msg.sender)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mb-0.5`}>
                          {avatarLetter(msg.sender)}
                        </div>
                      )}
                      <div className={`max-w-[70%] flex flex-col ${msg.side === "me" ? "items-end" : "items-start"}`}>
                        {activeConv.isGroup && msg.side === "them" && (
                          <span className="text-xs text-zinc-500 mb-1 px-1">@{msg.sender}</span>
                        )}
                        <div className={`rounded-2xl px-4 py-2.5 ${msg.side === "me" ? "bg-white text-black rounded-br-sm" : "bg-zinc-800 text-white border border-zinc-700 rounded-bl-sm"}`}>
                          <p className="text-sm leading-relaxed break-words">{msg.text}</p>
                        </div>
                        <span className="text-xs text-zinc-600 mt-1 px-1">{msg.time}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="bg-zinc-900 border-t border-zinc-800 px-4 py-3 flex items-center gap-3 flex-shrink-0">
                <textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Type a message..."
                  rows={1}
                  className="flex-1 px-4 py-2.5 rounded-2xl border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 text-sm resize-none focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all leading-relaxed"
                  style={{ maxHeight: "100px", overflowY: "auto" }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!inputText.trim()}
                  className="w-10 h-10 rounded-full bg-white flex items-center justify-center hover:bg-zinc-200 active:scale-95 transition-all disabled:bg-zinc-700 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <svg className="w-4 h-4 text-black disabled:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
