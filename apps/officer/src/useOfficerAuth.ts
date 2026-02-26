/** Auth hook for officer portal — manages login, logout, token, postings */
import { useState, useEffect, useCallback } from "react";
import { OfficerAuth, OfficerPosting, apiBaseUrl } from "./types";

function getStoredAuth(): OfficerAuth | null {
  try {
    const u = localStorage.getItem("puda_officer_auth");
    const t = localStorage.getItem("puda_officer_token");
    if (u && t) return { user: JSON.parse(u), token: t };
  } catch {}
  return null;
}

export function useOfficerAuth() {
  const [auth, setAuth] = useState<OfficerAuth | null>(getStoredAuth);
  const [postings, setPostings] = useState<OfficerPosting[]>([]);

  const login = async (loginId: string, password: string) => {
    const res = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ login: loginId, password }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Invalid credentials");
    if (data.user.user_type !== "OFFICER") throw new Error("Access denied. Officer login only.");
    const newAuth: OfficerAuth = { user: data.user, token: data.token };
    setAuth(newAuth);
    localStorage.setItem("puda_officer_auth", JSON.stringify(data.user));
    localStorage.setItem("puda_officer_token", data.token);
    return newAuth;
  };

  const logout = () => {
    // M3: Call logout to clear server-side cookie
    fetch(`${apiBaseUrl}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
    setAuth(null);
    setPostings([]);
    localStorage.removeItem("puda_officer_auth");
    localStorage.removeItem("puda_officer_token");
  };

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (auth?.token) h["Authorization"] = `Bearer ${auth.token}`;
    return h;
  }, [auth?.token]);

  // M3: Verify session on mount via HttpOnly cookie
  useEffect(() => {
    fetch(`${apiBaseUrl}/api/v1/auth/me`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          // Session invalid — clear local state
          setAuth(null);
          setPostings([]);
          localStorage.removeItem("puda_officer_auth");
          localStorage.removeItem("puda_officer_token");
        }
      })
      .catch(() => {});
  }, []);

  // Load postings when auth changes
  useEffect(() => {
    if (!auth) return;
    fetch(`${apiBaseUrl}/api/v1/auth/me/postings?userId=${auth.user.user_id}`, {
      headers: authHeaders(),
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : { postings: [] }))
      .then((data) => setPostings(data.postings || []))
      .catch(() => {});
  }, [auth?.user.user_id]);

  const roles = postings.flatMap((p) => p.system_role_ids);
  const authorities = [...new Set(postings.map((p) => p.authority_id))];

  return { auth, login, logout, authHeaders, postings, roles, authorities };
}
