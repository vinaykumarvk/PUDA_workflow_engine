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
  /** Helper that returns headers object with Authorization bearer token */
  authHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "puda_citizen_auth";
const TOKEN_KEY = "puda_citizen_token";

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
    // Load user + token from localStorage on mount
    const stored = localStorage.getItem(STORAGE_KEY);
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (stored && storedToken) {
      try {
        setUser(JSON.parse(stored));
        setToken(storedToken);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((userData: User, jwtToken: string) => {
    setUser(userData);
    setToken(jwtToken);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    localStorage.setItem(TOKEN_KEY, jwtToken);
  }, []);

  const logout = useCallback(() => {
    clearSessionState(true);
  }, [clearSessionState]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key !== null && event.key !== STORAGE_KEY && event.key !== TOKEN_KEY) return;
      const storedUser = localStorage.getItem(STORAGE_KEY);
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedUser || !storedToken) {
        clearSessionState(false);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [clearSessionState]);

  const authHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
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
