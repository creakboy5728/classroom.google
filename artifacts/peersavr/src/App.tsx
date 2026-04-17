import { useState } from "react";
import { getStoredUser, clearStoredUser, type AuthUser } from "./lib/auth";
import AuthPage from "./pages/AuthPage";
import ChatPage from "./pages/ChatPage";

function App() {
  const stored = getStoredUser();
  const [user, setUser] = useState<AuthUser | null>(stored ?? null);

  function handleAuth(username: string, token: string) {
    setUser({ username, token });
  }

  function handleLogout() {
    clearStoredUser();
    setUser(null);
  }

  if (!user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  return <ChatPage user={user} onLogout={handleLogout} />;
}

export default App;
