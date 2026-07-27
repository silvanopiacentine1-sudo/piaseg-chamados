"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { getToken, isAdmin } from "../../lib/auth";
import Header from "../../components/Header";

type Department = {
  id: string;
  name: string;
};

export default function AdminDepartmentsPage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await apiJson<Department[]>("/departments");
      setDepartments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar os departamentos.");
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
      await apiJson("/admin/departments", { method: "POST", body: JSON.stringify({ name }) });
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar o departamento.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(d: Department) {
    setEditingId(d.id);
    setEditName(d.name);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setError("");
    setSaving(true);
    try {
      await apiJson(`/admin/departments/${editingId}`, { method: "PUT", body: JSON.stringify({ name: editName }) });
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar o departamento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(d: Department) {
    if (!confirm(`Remover o departamento ${d.name}?`)) return;
    setError("");
    try {
      await apiJson(`/admin/departments/${d.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível remover o departamento.");
    }
  }

  return (
    <main className="min-h-dvh flex flex-col" style={{ background: "#f6f6f6" }}>
      <Header />
      <div className="max-w-2xl w-full mx-auto px-4 py-8 flex-1">
        <h1 className="font-heading text-2xl mb-6" style={{ color: "#072a3c" }}>
          Departamentos
        </h1>

        <form onSubmit={handleCreate} className="bg-white rounded-xl p-5 flex gap-3 mb-8 flex-wrap" style={{ border: "1px solid #e8e6df" }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do departamento (ex: Financeiro)"
            required
            className="flex-1 min-w-[200px] px-3 py-2.5 rounded-lg border text-sm outline-none"
            style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
          />
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #072a3c 0%, #123a52 100%)" }}
          >
            {saving ? "Salvando..." : "Adicionar"}
          </button>
        </form>

        {error && <p className="text-red-600 text-xs bg-red-50 rounded-lg py-2 px-3 mb-4">{error}</p>}

        {loading ? (
          <p className="text-sm" style={{ color: "#555" }}>
            Carregando...
          </p>
        ) : departments.length === 0 ? (
          <p className="text-sm" style={{ color: "#555" }}>
            Nenhum departamento cadastrado ainda.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {departments.map((d) => (
              <div key={d.id} className="bg-white rounded-xl p-4" style={{ border: "1px solid #e8e6df" }}>
                {editingId === d.id ? (
                  <form onSubmit={handleUpdate} className="flex gap-2 flex-wrap">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border text-sm outline-none"
                      style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
                    />
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
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 rounded-lg font-semibold text-xs"
                      style={{ color: "#072a3c", border: "1px solid #e8e6df" }}
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <p className="font-semibold text-sm" style={{ color: "#111" }}>
                      {d.name}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(d)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ color: "#072a3c", border: "1px solid #e8e6df" }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(d)}
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
