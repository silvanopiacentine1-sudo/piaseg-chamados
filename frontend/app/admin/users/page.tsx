"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { getToken, isAdmin } from "../../lib/auth";
import Header from "../../components/Header";

type User = {
  username: string;
  name: string;
  role: "franqueado" | "atendente" | "admin";
};

const ROLE_LABELS: Record<string, string> = {
  franqueado: "Franqueado",
  atendente: "Atendente",
  admin: "Administrador",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<User["role"]>("franqueado");
  const [saving, setSaving] = useState(false);

  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<User["role"]>("franqueado");

  async function load() {
    setLoading(true);
    try {
      const data = await apiJson<User[]>("/admin/users");
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar os usuários.");
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await apiJson("/admin/users", {
        method: "POST",
        body: JSON.stringify({ username, name, password, role }),
      });
      setUsername("");
      setName("");
      setPassword("");
      setRole("franqueado");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(u: User) {
    setEditingUsername(u.username);
    setEditName(u.name);
    setEditPassword("");
    setEditRole(u.role);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUsername) return;
    setError("");
    setSaving(true);
    try {
      await apiJson(`/admin/users/${editingUsername}`, {
        method: "PUT",
        body: JSON.stringify({ name: editName, password: editPassword || undefined, role: editRole }),
      });
      setEditingUsername(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(u: User) {
    if (!confirm(`Remover o usuário ${u.name} (${u.username})?`)) return;
    setError("");
    try {
      await apiJson(`/admin/users/${u.username}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível remover o usuário.");
    }
  }

  return (
    <main className="min-h-dvh flex flex-col" style={{ background: "#f6f6f6" }}>
      <Header />
      <div className="max-w-3xl w-full mx-auto px-4 py-8 flex-1">
        <h1 className="font-heading text-2xl mb-6" style={{ color: "#072a3c" }}>
          Usuários
        </h1>

        <form onSubmit={handleCreate} className="bg-white rounded-xl p-5 flex flex-col gap-3 mb-8" style={{ border: "1px solid #e8e6df" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#072a3c" }}>
            Novo usuário
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="usuário (e-mail)"
              required
              className="px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="nome completo"
              required
              className="px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="senha"
              required
              className="px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as User["role"])}
              className="px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
            >
              <option value="franqueado">Franqueado</option>
              <option value="atendente">Atendente</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="self-start px-5 py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #072a3c 0%, #123a52 100%)" }}
          >
            {saving ? "Salvando..." : "Criar usuário"}
          </button>
        </form>

        {error && <p className="text-red-600 text-xs bg-red-50 rounded-lg py-2 px-3 mb-4">{error}</p>}

        {loading ? (
          <p className="text-sm" style={{ color: "#555" }}>
            Carregando...
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {users.map((u) => (
              <div key={u.username} className="bg-white rounded-xl p-4" style={{ border: "1px solid #e8e6df" }}>
                {editingUsername === u.username ? (
                  <form onSubmit={handleUpdate} className="flex flex-col gap-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="px-3 py-2 rounded-lg border text-sm outline-none"
                        style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
                      />
                      <input
                        type="password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="nova senha (opcional)"
                        className="px-3 py-2 rounded-lg border text-sm outline-none"
                        style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
                      />
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as User["role"])}
                        className="px-3 py-2 rounded-lg border text-sm outline-none"
                        style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
                      >
                        <option value="franqueado">Franqueado</option>
                        <option value="atendente">Atendente</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-2 rounded-lg text-white font-semibold text-xs disabled:opacity-60"
                        style={{ background: "#072a3c" }}
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingUsername(null)}
                        className="px-4 py-2 rounded-lg font-semibold text-xs"
                        style={{ color: "#072a3c", border: "1px solid #e8e6df" }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "#111" }}>
                        {u.name}
                      </p>
                      <p className="text-xs" style={{ color: "#777" }}>
                        {u.username} · {ROLE_LABELS[u.role]}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(u)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ color: "#072a3c", border: "1px solid #e8e6df" }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ color: "#b3261e", border: "1px solid #f3c6c2" }}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
