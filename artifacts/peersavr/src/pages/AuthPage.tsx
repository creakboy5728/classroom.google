import { useState } from "react";
import { setStoredUser } from "../lib/auth";

interface AuthPageProps {
  onAuth: (username: string, token: string) => void;
}

type Mode = "login" | "signup";

export default function AuthPage({ onAuth }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const BASE = import.meta.env.BASE_URL;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!username.trim()) { setError("Please enter a username"); return; }
    if (!password) { setError("Please enter a password"); return; }
    if (mode === "signup") {
      if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
      if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    }

    setLoading(true);
    try {
      const endpoint = mode === "signup" ? "signup" : "login";
      const res = await fetch(`${BASE}api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong"); return; }
      setStoredUser({ username: data.username, token: data.token });
      onAuth(data.username, data.token);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white mb-4 shadow-lg">
            <svg className="w-8 h-8 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Messenger</h1>
          <p className="text-gray-400 mt-1 text-sm">Secure peer-to-peer messaging</p>
        </div>

        <div className="bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-800">
          <div className="flex border-b border-zinc-800">
            <button
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 py-4 text-sm font-semibold transition-all ${mode === "login" ? "text-white border-b-2 border-white bg-zinc-800/60" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode("signup"); setError(""); }}
              className={`flex-1 py-4 text-sm font-semibold transition-all ${mode === "signup" ? "text-white border-b-2 border-white bg-zinc-800/60" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Create Account
            </button>
          </div>

          <div className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={mode === "signup" ? "Choose a unique username" : "Enter your username"}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full px-4 py-3 rounded-xl border-2 border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-white focus:ring-2 focus:ring-white/10 transition-all text-sm"
                />
                {mode === "signup" && <p className="text-xs text-zinc-500 mt-1.5">Your permanent ID — others use it to message you</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 6 characters" : "Enter your password"}
                  className="w-full px-4 py-3 rounded-xl border-2 border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-white focus:ring-2 focus:ring-white/10 transition-all text-sm"
                />
              </div>
              {mode === "signup" && (
                <div>
                  <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full px-4 py-3 rounded-xl border-2 border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-white focus:ring-2 focus:ring-white/10 transition-all text-sm"
                  />
                </div>
              )}
              {error && (
                <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-white text-black rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {mode === "signup" ? "Creating account..." : "Signing in..."}
                  </>
                ) : (
                  <>
                    {mode === "signup" ? "Create Account" : "Sign In"}
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </form>
            <div className="mt-6 pt-5 border-t border-zinc-800 text-center">
              <p className="text-xs text-zinc-500">Messages are saved and persist across sessions.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
