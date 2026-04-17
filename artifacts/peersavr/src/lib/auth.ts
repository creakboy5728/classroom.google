const AUTH_KEY = "peersavr_auth";

export interface AuthUser {
  username: string;
  token: string;
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser): void {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

export function clearStoredUser(): void {
  sessionStorage.removeItem(AUTH_KEY);
}

export function authHeaders(user: AuthUser): Record<string, string> {
  return {
    "Authorization": `Bearer ${user.token}`,
    "x-username": user.username,
    "Content-Type": "application/json",
  };
}
