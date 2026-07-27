"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson, uploadFile } from "../../lib/api";
import { getToken } from "../../lib/auth";
import Header from "../../components/Header";

export default function NewTicketPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) router.push("/");
  }, [router]);

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
        body: JSON.stringify({ subject, description, attachment }),
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
              className="w-full text-sm"
            />
            <p className="text-xs" style={{ color: "#999" }}>
              PDF, imagem, Word, Excel ou ZIP — máximo 15MB.
            </p>
          </div>

          {error && <p className="text-red-600 text-xs bg-red-50 rounded-lg py-2 px-3">{error}</p>}

          <div className="flex gap-3 mt-2">
            <button
              type="submit"
              disabled={loading}
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
