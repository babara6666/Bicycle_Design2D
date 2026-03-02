import { type FormEvent, useState } from "react";

import { apiLogin } from "../services/api";
import { type Role, useAuthStore } from "../stores/authStore";

export function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiLogin(username.trim(), password);
      setAuth(res.access_token, res.role as Role, username.trim());
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "登入失敗，請確認帳號密碼";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <p className="login-kicker">IBDS</p>
          <h1 className="login-title">Bicycle 2D AutoCAD Editor</h1>
          <p className="login-subtitle">請登入以繼續</p>
        </div>

        <form className="login-form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="login-field">
            <label className="login-label" htmlFor="login-username">
              帳號
            </label>
            <input
              id="login-username"
              className="login-input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              disabled={loading}
              required
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="login-password">
              密碼
            </label>
            <input
              id="login-password"
              className="login-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            className="login-btn"
            type="submit"
            disabled={loading || !username || !password}
          >
            {loading ? "登入中…" : "登入"}
          </button>
        </form>

        <p className="login-hint">
          預設帳號：admin / editor / viewer | 密碼：ibds2025
        </p>
      </div>
    </div>
  );
}
