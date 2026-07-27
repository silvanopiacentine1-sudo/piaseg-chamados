"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiJson, downloadFile, uploadFile } from "../../lib/api";
import { getToken, getUsername, isStaff } from "../../lib/auth";
import Header from "../../components/Header";
import StatusBadge from "../../components/StatusBadge";

type Message = {
  id: string;
  author: string;
  author_name: string;
  author_role: string;
  text: string;
  attachment: string | null;
  created_at: string;
};

type TicketDetail = {
  id: string;
  number: number;
  subject: string;
  description: string;
  status: string;
  opened_by: string;
  opened_by_name: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  attachment: string | null;
  created_at: string;
  messages: Message[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function attachmentLabel(filename: string): string {
  return filename.includes("_") ? filename.split("_").slice(1).join("_") : filename;
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const number = Number(params.id);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<TicketDetail>(`/tickets/${number}`);
      setTicket(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar o chamado.");
    } finally {
      setLoading(false);
    }
  }, [number]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    load();
  }, [load, router]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim() && !replyFile) return;
    setSending(true);
    setError("");
    try {
      let attachment: string | undefined;
      if (replyFile) {
        const uploaded = await uploadFile(replyFile);
        attachment = uploaded.filename;
      }
      await apiJson(`/tickets/${number}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: replyText, attachment }),
      });
      setReplyText("");
      setReplyFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function handleAssignToMe() {
    setBusy(true);
    setError("");
    try {
      await apiJson(`/tickets/${number}/assign`, { method: "POST", body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atribuir o chamado.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    if (!confirm("Tem certeza que deseja encerrar este chamado?")) return;
    setBusy(true);
    setError("");
    try {
      await apiJson(`/tickets/${number}/close`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível encerrar o chamado.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-dvh flex flex-col" style={{ background: "#f6f6f6" }}>
        <Header />
        <p className="text-sm text-center py-8" style={{ color: "#555" }}>
          Carregando...
        </p>
      </main>
    );
  }

  if (!ticket) {
    return (
      <main className="min-h-dvh flex flex-col" style={{ background: "#f6f6f6" }}>
        <Header />
        <div className="max-w-2xl w-full mx-auto px-4 py-8">
          <p className="text-red-600 text-sm bg-red-50 rounded-lg py-2 px-3">{error || "Chamado não encontrado."}</p>
          <Link href="/tickets" className="text-xs font-semibold mt-4 inline-block" style={{ color: "#a4854a" }}>
            ← Voltar
          </Link>
        </div>
      </main>
    );
  }

  const staff = isStaff();
  const closed = ticket.status === "encerrado";
  const myUsername = getUsername();

  return (
    <main className="min-h-dvh flex flex-col" style={{ background: "#f6f6f6" }}>
      <Header />
      <div className="max-w-2xl w-full mx-auto px-4 py-8 flex-1">
        <Link href="/tickets" className="text-xs font-semibold" style={{ color: "#a4854a" }}>
          ← Voltar para chamados
        </Link>

        <div className="bg-white rounded-xl p-6 mt-4" style={{ border: "1px solid #e8e6df" }}>
          <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
            <div>
              <span className="text-xs font-bold" style={{ color: "#a4854a" }}>
                #{String(ticket.number).padStart(4, "0")}
              </span>
              <h1 className="font-heading text-xl mt-1" style={{ color: "#072a3c" }}>
                {ticket.subject}
              </h1>
            </div>
            <StatusBadge status={ticket.status} />
          </div>

          <p className="text-xs" style={{ color: "#777" }}>
            Aberto por {ticket.opened_by_name} em {formatDate(ticket.created_at)}
            {ticket.assigned_to_name ? ` · Atendido por ${ticket.assigned_to_name}` : staff ? " · Não atribuído" : ""}
          </p>

          <div className="flex gap-3 mt-4 flex-wrap">
            {staff && !ticket.assigned_to && !closed && (
              <button
                onClick={handleAssignToMe}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                style={{ background: "#072a3c" }}
              >
                Atribuir a mim
              </button>
            )}
            {!closed && (
              <button
                onClick={handleClose}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-60"
                style={{ color: "#b3261e", border: "1px solid #f3c6c2" }}
              >
                Encerrar chamado
              </button>
            )}
          </div>
        </div>

        {error && <p className="text-red-600 text-xs bg-red-50 rounded-lg py-2 px-3 mt-4">{error}</p>}

        <div className="flex flex-col gap-3 mt-6">
          <MessageBubble
            authorName={ticket.opened_by_name}
            authorRole="franqueado"
            mine={ticket.opened_by === myUsername}
            text={ticket.description}
            attachment={ticket.attachment}
            createdAt={ticket.created_at}
          />
          {ticket.messages.map((m) => (
            <MessageBubble
              key={m.id}
              authorName={m.author_name}
              authorRole={m.author_role}
              mine={m.author === myUsername}
              text={m.text}
              attachment={m.attachment}
              createdAt={m.created_at}
            />
          ))}
        </div>

        {!closed ? (
          <form onSubmit={handleReply} className="bg-white rounded-xl p-4 mt-4 flex flex-col gap-3" style={{ border: "1px solid #e8e6df" }}>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Escreva uma mensagem..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y"
              style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
            />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.zip"
                onChange={(e) => setReplyFile(e.target.files?.[0] ?? null)}
                className="text-xs"
              />
              <button
                type="submit"
                disabled={sending || (!replyText.trim() && !replyFile)}
                className="px-5 py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #072a3c 0%, #123a52 100%)" }}
              >
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-xs text-center mt-6" style={{ color: "#999" }}>
            Este chamado está encerrado.
          </p>
        )}
      </div>
    </main>
  );
}

function MessageBubble({
  authorName,
  authorRole,
  mine,
  text,
  attachment,
  createdAt,
}: {
  authorName: string;
  authorRole: string;
  mine: boolean;
  text: string;
  attachment: string | null;
  createdAt: string;
}) {
  const staffAuthor = authorRole === "atendente" || authorRole === "admin";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] rounded-xl px-4 py-3"
        style={
          staffAuthor
            ? { background: "#072a3c", color: "white" }
            : { background: "white", color: "#111", border: "1px solid #e8e6df" }
        }
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: staffAuthor ? "#d6bd8a" : "#a4854a" }}>
          {authorName}
        </p>
        {text && <p className="text-sm whitespace-pre-wrap">{text}</p>}
        {attachment && (
          <button
            onClick={() => downloadFile(`/files/${attachment}`, attachmentLabel(attachment))}
            className="text-xs underline mt-2 block"
            style={{ color: staffAuthor ? "#d6bd8a" : "#a4854a" }}
          >
            📎 {attachmentLabel(attachment)}
          </button>
        )}
        <p className="text-[11px] mt-2" style={{ color: staffAuthor ? "rgba(255,255,255,0.6)" : "#999" }}>
          {formatDate(createdAt)}
        </p>
      </div>
    </div>
  );
}
