import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { clearCitizenCachedState } from "./cache";

export interface User {
  user_id: string;
  login: string;
  name: string;
  email?: string;
  phone?: string;
  user_type: "CITIZEN" | "OFFICER" | "ADMIN";
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  isLoading: boolean;
  /** Helper that returns headers object (credentials sent via cookie) */
  authHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "puda_citizen_auth";
const TOKEN_KEY = "puda_citizen_token";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSessionState = useCallback((clearStorage: boolean) => {
    setUser(null);
    setToken(null);
    if (clearStorage) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
    clearCitizenCachedState();
  }, []);

  useEffect(() => {
    // Load user from localStorage for immediate UI, then verify session via cookie
    const stored = localStorage.getItem(STORAGE_KEY);
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
        if (storedToken) setToken(storedToken);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TOKEN_KEY);
      }
    }

    // M3: Verify session with server (cookie is sent automatically)
    fetch(`${apiBaseUrl}/api/v1/auth/me`, { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        // Session invalid — clear local state
        clearSessionState(true);
        return null;
      })
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
        }
      })
      .catch(() => {
        // Network error — keep cached user for offline support
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback((userData: User, jwtToken: string) => {
    setUser(userData);
    setToken(jwtToken);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    // Keep token in localStorage for backward compat during migration
    localStorage.setItem(TOKEN_KEY, jwtToken);
  }, []);

  const logout = useCallback(() => {
    // M3: Call logout to clear server-side cookie
    fetch(`${apiBaseUrl}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
    clearSessionState(true);
  }, [clearSessionState]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key !== null && event.key !== STORAGE_KEY && event.key !== TOKEN_KEY) return;
      const storedUser = localStorage.getItem(STORAGE_KEY);
      if (!storedUser) {
        clearSessionState(false);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [clearSessionState]);

  const authHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // M3: Keep Authorization header for backward compat during migration
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading, authHeaders }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
