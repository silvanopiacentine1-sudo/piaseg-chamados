"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API } from "./lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Usuário ou senha incorretos");
        return;
      }
      const { token, name, role, username: loginUsername } = await res.json();
      localStorage.setItem("chamados_token", token);
      localStorage.setItem("chamados_name", name);
      localStorage.setItem("chamados_role", role);
      localStorage.setItem("chamados_username", loginUsername ?? "");
      router.push("/tickets");
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="min-h-dvh flex flex-col items-center justify-center px-4"
      style={{ background: "linear-gradient(160deg, #072a3c 0%, #123a52 60%, #04141d 100%)" }}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div
          className="px-8 py-8 flex justify-center items-center"
          style={{ background: "white", borderBottom: "3px solid #c2a360" }}
        >
          <h1 className="font-heading text-2xl" style={{ color: "#072a3c" }}>
            Piaseg Chamados
          </h1>
        </div>

        <div className="px-8 py-8">
          <p className="text-center text-xs mb-6 uppercase tracking-widest" style={{ color: "#a4854a" }}>
            Suporte a Franqueados
          </p>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#072a3c" }}>
                Usuário
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="seu.usuario"
                required
                autoCapitalize="none"
                className="w-full px-4 py-3 rounded-lg border text-sm outline-none"
                style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
                onFocus={(e) => (e.target.style.borderColor = "#c2a360")}
                onBlur={(e) => (e.target.style.borderColor = "#e8e6df")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#072a3c" }}>
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 rounded-lg border text-sm outline-none"
                style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
                onFocus={(e) => (e.target.style.borderColor = "#c2a360")}
                onBlur={(e) => (e.target.style.borderColor = "#e8e6df")}
              />
            </div>

            {error && <p className="text-red-600 text-xs text-center bg-red-50 rounded-lg py-2 px-3">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-lg text-white font-semibold text-sm tracking-wide mt-2 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #072a3c 0%, #123a52 100%)" }}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <Link href="/forgot-password" className="text-center text-xs font-semibold" style={{ color: "#a4854a" }}>
              Esqueci minha senha
            </Link>
          </form>
        </div>

        <p className="text-center text-xs pb-6" style={{ color: "#a4854a" }}>
          © 2026 Piaseg Seguros Franchising
        </p>
      </div>
    </main>
  );
}
