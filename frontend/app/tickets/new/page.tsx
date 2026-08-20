"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson, uploadFile } from "../../lib/api";
import { getToken, isStaff } from "../../lib/auth";
import Header from "../../components/Header";

type Department = {
  id: string;
  name: string;
};

type StaffMember = {
  username: string;
  name: string;
};

type Franqueado = {
  username: string;
  name: string;
};

export default function NewTicketPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [assignedTo, setAssignedTo] = useState("");
  const [franqueados, setFranqueados] = useState<Franqueado[]>([]);
  const [forFranqueado, setForFranqueado] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const staffUser = isStaff();

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    apiJson<Department[]>("/departments")
      .then((data) => {
        setDepartments(data);
        if (data.length > 0) setDepartment(data[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Não foi possível carregar os departamentos."));
    if (staffUser) {
      apiJson<Franqueado[]>("/franqueados").then(setFranqueados).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    setAssignedTo("");
    if (!department) {
      setStaff([]);
      return;
    }
    apiJson<StaffMember[]>(`/departments/${department}/staff`)
      .then(setStaff)
      .catch(() => setStaff([]));
  }, [department]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      let attachment: string | undefined;
      if (file) {
        const uploaded = await uploadFile(file);
        attachment = uploaded.filename;
      }
      const ticket = await apiJson<{ number: number }>("/tickets", {
        method: "POST",
        body: JSON.stringify({
          subject,
          description,
          department,
          assigned_to: assignedTo || undefined,
          for_franqueado: forFranqueado || undefined,
          attachment,
        }),
      });
      router.push(`/tickets/${ticket.number}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível abrir o chamado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col" style={{ background: "#f6f6f6" }}>
      <Header />
      <div className="max-w-2xl w-full mx-auto px-4 py-8 flex-1">
        <h1 className="font-heading text-2xl mb-6" style={{ color: "#072a3c" }}>
          Abrir chamado
        </h1>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 flex flex-col gap-4" style={{ border: "1px solid #e8e6df" }}>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#072a3c" }}>
              Assunto
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Resumo do que você precisa"
              required
              maxLength={120}
              className="w-full px-4 py-3 rounded-lg border text-sm outline-none"
              style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#072a3c" }}>
              Departamento
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg border text-sm outline-none"
              style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
            >
              {departments.length === 0 && <option value="">Carregando...</option>}
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {staff.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#072a3c" }}>
                Direcionar para
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border text-sm outline-none"
                style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
              >
                <option value="">Qualquer pessoa do departamento</option>
                {staff.map((s) => (
                  <option key={s.username} value={s.username}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {staffUser && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#072a3c" }}>
                Abrir para o franqueado (opcional)
              </label>
              <select
                value={forFranqueado}
                onChange={(e) => setForFranqueado(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border text-sm outline-none"
                style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
              >
                <option value="">Chamado interno (não é para um franqueado específico)</option>
                {franqueados.map((f) => (
                  <option key={f.username} value={f.username}>
                    {f.name}
                  </option>
                ))}
              </select>
              <p className="text-xs" style={{ color: "#999" }}>
                Se escolher um franqueado, só ele (além do time interno) vai ver e poder responder este chamado.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#072a3c" }}>
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva sua solicitação com detalhes"
              required
              rows={6}
              className="w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y"
              style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#072a3c" }}>
              Anexo (opcional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            {file ? (
              <div
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg"
                style={{ border: "1px dashed #c2a360", background: "#faf7f0" }}
              >
                <span className="text-sm truncate" style={{ color: "#072a3c" }}>
                  📎 {file.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-xs font-semibold shrink-0"
                  style={{ color: "#b3261e" }}
                >
                  Remover
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-lg text-sm font-semibold cursor-pointer"
                style={{ border: "2px dashed #e8e6df", color: "#072a3c", background: "#f6f6f6" }}
              >
                📎 Clique aqui para anexar um arquivo
              </button>
            )}
            <p className="text-xs" style={{ color: "#999" }}>
              PDF, imagem, Word, Excel ou ZIP — máximo 15MB.
            </p>
          </div>

          {error && <p className="text-red-600 text-xs bg-red-50 rounded-lg py-2 px-3">{error}</p>}

          <div className="flex gap-3 mt-2">
            <button
              type="submit"
              disabled={loading || !department}
              className="px-6 py-3 rounded-lg text-white font-semibold text-sm disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #072a3c 0%, #123a52 100%)" }}
            >
              {loading ? "Enviando..." : "Abrir chamado"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/tickets")}
              className="px-6 py-3 rounded-lg font-semibold text-sm"
              style={{ color: "#072a3c", border: "1px solid #e8e6df" }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
