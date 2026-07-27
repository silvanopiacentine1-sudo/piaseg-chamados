"use client";

import { useState } from "react";
import Link from "next/link";
import { API } from "../lib/api";

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
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
          <h2 className="font-heading text-center text-lg mb-2" style={{ color: "#072a3c" }}>
            Esqueci minha senha
          </h2>

          {sent ? (
            <p className="text-sm text-center" style={{ color: "#555" }}>
              Se o usuário existir, enviamos um e-mail com instruções para redefinir sua senha. Confira também a caixa de spam.
            </p>
          ) : (
            <>
              <p className="text-xs text-center mb-6" style={{ color: "#555" }}>
                Informe seu usuário (e-mail) para receber um link de redefinição.
              </p>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                  />
                </div>

                {error && <p className="text-red-600 text-xs text-center bg-red-50 rounded-lg py-2 px-3">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-lg text-white font-semibold text-sm tracking-wide mt-2 disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #072a3c 0%, #123a52 100%)" }}
                >
                  {loading ? "Enviando..." : "Enviar link de redefinição"}
                </button>
              </form>
            </>
          )}

          <Link href="/" className="block text-center text-xs font-semibold mt-6" style={{ color: "#a4854a" }}>
            ← Voltar para o login
          </Link>
        </div>
      </div>
    </main>
  );
}
