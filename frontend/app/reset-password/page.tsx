"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { API } from "../lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Link inválido. Solicite uma nova redefinição de senha.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Não foi possível redefinir a senha.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/"), 2500);
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
          <h2 className="font-heading text-center text-lg mb-6" style={{ color: "#072a3c" }}>
            Redefinir senha
          </h2>

          {done ? (
            <p className="text-sm text-center" style={{ color: "#a4854a" }}>
              ✓ Senha redefinida com sucesso! Redirecionando para o login...
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#072a3c" }}>
                  Nova senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 rounded-lg border text-sm outline-none"
                  style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#072a3c" }}>
                  Confirmar nova senha
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
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
                {loading ? "Salvando..." : "Redefinir senha"}
              </button>
            </form>
          )}

          <Link href="/" className="block text-center text-xs font-semibold mt-6" style={{ color: "#a4854a" }}>
            ← Voltar para o login
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
