"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiJson, downloadFile, uploadFile } from "../../lib/api";
import { getToken, getUsername, isStaff } from "../../lib/auth";
import { getPersonColor } from "../../lib/colors";
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

type Rating = "ruim" | "bom" | "excelente";

type TicketDetail = {
  id: string;
  number: number;
  subject: string;
  description: string;
  status: string;
  department: string;
  department_name: string;
  opened_by: string;
  opened_by_name: string;
  opened_by_role: string | null;
  for_franqueado: string | null;
  for_franqueado_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  attachment: string | null;
  created_at: string;
  closed_at: string | null;
  rating: Rating | null;
  rated_at: string | null;
  transcript_sent_at: string | null;
  messages: Message[];
};

type Department = {
  id: string;
  name: string;
};

type StaffMember = {
  username: string;
  name: string;
};

const RATING_LABELS: Record<Rating, string> = {
  ruim: "Ruim",
  bom: "Bom",
  excelente: "Excelente",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(fromIso: string, toMs: number): string {
  const minutes = Math.max(0, Math.round((toMs - new Date(fromIso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return `${hours}h ${rest}min`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return `${days}d ${restHours}h`;
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
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptStaff, setDeptStaff] = useState<StaffMember[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [redirectTo, setRedirectTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcriptDeclined, setTranscriptDeclined] = useState(false);
  const [transcriptSuccess, setTranscriptSuccess] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

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
    if (isStaff()) {
      apiJson<Department[]>("/departments").then(setDepartments).catch(() => {});
    }
  }, [load, router]);

  useEffect(() => {
    if (!ticket || !isStaff()) return;
    apiJson<StaffMember[]>(`/departments/${ticket.department}/staff`).then(setDeptStaff).catch(() => {});
  }, [ticket?.department]);

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

  async function handleAssignTo() {
    if (!assignTo) return;
    setBusy(true);
    setError("");
    try {
      await apiJson(`/tickets/${number}/assign`, { method: "POST", body: JSON.stringify({ username: assignTo }) });
      setAssignTo("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível direcionar o chamado.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRedirect() {
    if (!redirectTo) return;
    if (!confirm("Redirecionar este chamado para outro departamento?")) return;
    setBusy(true);
    setError("");
    try {
      await apiJson(`/tickets/${number}/redirect`, { method: "POST", body: JSON.stringify({ department: redirectTo }) });
      setRedirectTo("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível redirecionar o chamado.");
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

  async function handleRate(rating: Rating) {
    setBusy(true);
    setError("");
    try {
      await apiJson(`/tickets/${number}/rating`, { method: "POST", body: JSON.stringify({ rating }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar sua avaliação.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendTranscript() {
    setBusy(true);
    setError("");
    try {
      await apiJson(`/tickets/${number}/send-transcript`, { method: "POST" });
      await load();
      setTranscriptSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar o e-mail.");
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
  const isCustomer = ticket.opened_by === myUsername || ticket.for_franqueado === myUsername;
  const otherDepartments = departments.filter((d) => d.id !== ticket.department);
  const colleagues = deptStaff.filter((s) => s.username !== myUsername && s.username !== ticket.assigned_to);

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
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                style={{ background: "#f6f6f6", color: "#072a3c", border: "1px solid #e8e6df" }}
              >
                {ticket.department_name}
              </span>
              <StatusBadge status={ticket.status} />
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs flex-wrap" style={{ color: "#777" }}>
            <span>
              Aberto por {ticket.opened_by_name}
              {ticket.for_franqueado_name ? ` para ${ticket.for_franqueado_name}` : ""} em {formatDate(ticket.created_at)}
            </span>
            {ticket.assigned_to_name && ticket.assigned_to ? (
              <span className="inline-flex items-center gap-1">
                <span>·</span>
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: getPersonColor(ticket.assigned_to) }} />
                <span>Atendido por {ticket.assigned_to_name}</span>
              </span>
            ) : (
              staff && <span>· Não atribuído</span>
            )}
          </div>

          <p className="text-xs font-semibold mt-2" style={{ color: "#a4854a" }}>
            ⏱ {closed && ticket.closed_at ? `Encerrado em ${formatDuration(ticket.created_at, new Date(ticket.closed_at).getTime())} (tempo total)` : `Em aberto há ${formatDuration(ticket.created_at, now)}`}
          </p>

          <div className="flex gap-3 mt-4 flex-wrap items-center">
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
            {staff && !closed && colleagues.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={assignTo}
                  onChange={(e) => setAssignTo(e.target.value)}
                  className="px-3 py-2 rounded-lg border text-xs outline-none"
                  style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
                >
                  <option value="">Direcionar para colega...</option>
                  {colleagues.map((s) => (
                    <option key={s.username} value={s.username}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAssignTo}
                  disabled={busy || !assignTo}
                  className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-60"
                  style={{ color: "#072a3c", border: "1px solid #e8e6df" }}
                >
                  Direcionar
                </button>
              </div>
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
            {staff && !closed && otherDepartments.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={redirectTo}
                  onChange={(e) => setRedirectTo(e.target.value)}
                  className="px-3 py-2 rounded-lg border text-xs outline-none"
                  style={{ borderColor: "#e8e6df", background: "#f6f6f6", color: "#111" }}
                >
                  <option value="">Redirecionar para...</option>
                  {otherDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleRedirect}
                  disabled={busy || !redirectTo}
                  className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-60"
                  style={{ color: "#072a3c", border: "1px solid #e8e6df" }}
                >
                  Redirecionar
                </button>
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-red-600 text-xs bg-red-50 rounded-lg py-2 px-3 mt-4">{error}</p>}
        {transcriptSuccess && (
          <p className="text-sm font-semibold text-center rounded-lg py-2.5 px-3 mt-4" style={{ color: "#1e7a4c", background: "#e8f3ec" }}>
            ✓ Mensagem enviada com sucesso.
          </p>
        )}

        <div className="flex flex-col gap-3 mt-6">
          <MessageBubble
            authorName={ticket.opened_by_name}
            authorRole={ticket.opened_by_role ?? "franqueado"}
            mine={ticket.opened_by === myUsername}
            text={ticket.description}
            attachment={ticket.attachment}
            createdAt={ticket.created_at}
          />
          {ticket.messages.map((m, i) => (
            <MessageBubble
              key={m.id}
              authorName={m.author_name}
              authorRole={m.author_role}
              mine={m.author === myUsername}
              text={m.text}
              attachment={m.attachment}
              createdAt={m.created_at}
              previousCreatedAt={i === 0 ? ticket.created_at : ticket.messages[i - 1].created_at}
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
                className="hidden"
              />
              {replyFile ? (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{ border: "1px dashed #c2a360", background: "#faf7f0", color: "#072a3c" }}
                >
                  <span className="truncate max-w-[160px]">📎 {replyFile.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="font-semibold shrink-0"
                    style={{ color: "#b3261e" }}
                  >
                    Remover
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                  style={{ border: "1px dashed #e8e6df", color: "#072a3c", background: "#f6f6f6" }}
                >
                  📎 Anexar arquivo
                </button>
              )}
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
        ) : isCustomer && !ticket.rating ? (
          <div className="bg-white rounded-xl p-5 mt-4 text-center" style={{ border: "1px solid #e8e6df" }}>
            <p className="text-sm font-semibold mb-4" style={{ color: "#072a3c" }}>
              Como você avalia o atendimento deste chamado?
            </p>
            <div className="flex justify-center gap-3 flex-wrap">
              {(["ruim", "bom", "excelente"] as Rating[]).map((r) => (
                <button
                  key={r}
                  onClick={() => handleRate(r)}
                  disabled={busy}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                  style={{ color: "#072a3c", border: "1px solid #e8e6df" }}
                >
                  {RATING_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        ) : isCustomer && !ticket.transcript_sent_at && !transcriptDeclined ? (
          <div className="bg-white rounded-xl p-5 mt-4 text-center" style={{ border: "1px solid #e8e6df" }}>
            <p className="text-sm font-semibold mb-4" style={{ color: "#072a3c" }}>
              Deseja enviar nossa conversa para seu e-mail?
            </p>
            <div className="flex justify-center gap-3 flex-wrap">
              <button
                onClick={handleSendTranscript}
                disabled={busy}
                className="px-5 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #072a3c 0%, #123a52 100%)" }}
              >
                Sim
              </button>
              <button
                onClick={() => setTranscriptDeclined(true)}
                disabled={busy}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                style={{ color: "#072a3c", border: "1px solid #e8e6df" }}
              >
                Não
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center mt-6">
            <p className="text-xs" style={{ color: "#999" }}>
              Este chamado está encerrado.
            </p>
            {ticket.rating && (
              <p className="text-xs mt-1 font-semibold" style={{ color: "#a4854a" }}>
                Avaliação de {ticket.for_franqueado_name ?? ticket.opened_by_name}: {RATING_LABELS[ticket.rating]}
              </p>
            )}
            {ticket.transcript_sent_at && (
              <p className="text-xs mt-1" style={{ color: "#a4854a" }}>
                ✓ Conversa enviada para o seu e-mail.
              </p>
            )}
          </div>
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
  previousCreatedAt,
}: {
  authorName: string;
  authorRole: string;
  mine: boolean;
  text: string;
  attachment: string | null;
  createdAt: string;
  previousCreatedAt?: string | null;
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
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: staffAuthor ? "#d6bd8a" : "#a4854a" }}>
            {authorName}
          </p>
          {previousCreatedAt && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
              style={
                staffAuthor
                  ? { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)" }
                  : { background: "#f6f6f6", color: "#999" }
              }
            >
              ⏱ respondeu em {formatDuration(previousCreatedAt, new Date(createdAt).getTime())}
            </span>
          )}
        </div>
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
