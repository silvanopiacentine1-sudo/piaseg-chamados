"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { getToken, isAdmin } from "../../lib/auth";
import Header from "../../components/Header";

function parseBackupDate(name: string): Date {
  const [datePart, timePart] = name.split("T");
  if (!datePart || !timePart) return new Date(NaN);
  return new Date(`${datePart}T${timePart.replace(/-/g, ":")}Z`);
}

function formatBackupDate(name: string): string {
  const date = parseBackupDate(name);
  if (isNaN(date.getTime())) return name;
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function AdminBackupsPage() {
  const router = useRouter();
  const [backups, setBackups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiJson<string[]>("/admin/backups");
      setBackups(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar os backups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken() || !isAdmin()) {
      router.push("/tickets");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleRestore(name: string) {
    if (!confirm(`Restaurar os dados para o estado de ${formatBackupDate(name)}?\n\nUsuários, departamentos e chamados voltarão a como estavam nesse momento. O estado atual é salvo automaticamente antes, então isso também pode ser desfeito.`)) {
      return;
    }
    setRestoring(name);
    setError("");
    setSuccess("");
    try {
      await apiJson(`/admin/backups/${name}/restore`, { method: "POST" });
      setSuccess(`Dados restaurados para o estado de ${formatBackupDate(name)}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível restaurar esse backup.");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col" style={{ background: "#f6f6f6" }}>
      <Header />
      <div className="max-w-2xl w-full mx-auto px-4 py-8 flex-1">
        <h1 className="font-heading text-2xl mb-2" style={{ color: "#072a3c" }}>
          Backups
        </h1>
        <p className="text-xs mb-6" style={{ color: "#777" }}>
          Um snapshot automático de usuários, departamentos e chamados é criado a cada atualização do sistema. Não afeta anexos enviados.
        </p>

        {error && <p className="text-red-600 text-xs bg-red-50 rounded-lg py-2 px-3 mb-4">{error}</p>}
        {success && (
          <p className="text-sm font-semibold text-center rounded-lg py-2.5 px-3 mb-4" style={{ color: "#1e7a4c", background: "#e8f3ec" }}>
            ✓ {success}
          </p>
        )}

        {loading ? (
          <p className="text-sm" style={{ color: "#555" }}>
            Carregando...
          </p>
        ) : backups.length === 0 ? (
          <p className="text-sm" style={{ color: "#555" }}>
            Nenhum backup ainda. Um snapshot é criado automaticamente na próxima atualização do sistema.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {backups.map((name, i) => (
              <div key={name} className="bg-white rounded-xl p-4 flex items-center justify-between gap-4" style={{ border: "1px solid #e8e6df" }}>
                <div>
                  <p className="font-semibold text-sm" style={{ color: "#111" }}>
                    {formatBackupDate(name)}
                  </p>
                  {i === 0 && (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1"
                      style={{ background: "#f6f6f6", color: "#072a3c", border: "1px solid #e8e6df" }}
                    >
                      Mais recente
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleRestore(name)}
                  disabled={restoring !== null}
                  className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-60"
                  style={{ color: "#072a3c", border: "1px solid #e8e6df" }}
                >
                  {restoring === name ? "Restaurando..." : "Restaurar"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
