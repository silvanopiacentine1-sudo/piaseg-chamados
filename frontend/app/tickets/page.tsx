"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiJson } from "../lib/api";
import { getRole, getToken, isStaff } from "../lib/auth";
import Header from "../components/Header";
import StatusBadge from "../components/StatusBadge";

type Ticket = {
  number: number;
  subject: string;
  status: string;
  department_name: string;
  opened_by_name: string;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
};

const FILTERS = [
  { value: "", label: "Todos" },
  { value: "aberto", label: "Abertos" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "encerrado", label: "Encerrados" },
];

export default function TicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [staff, setStaff] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    setStaff(isStaff());
  }, [router]);

  useEffect(() => {
    if (!getToken()) return;
    setLoading(true);
    setError("");
    const query = filter ? `?status_filter=${filter}` : "";
    apiJson<Ticket[]>(`/tickets${query}`)
      .then(setTickets)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter]);

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <main className="min-h-dvh flex flex-col" style={{ background: "#f6f6f6" }}>
      <Header />
      <div className="max-w-4xl w-full mx-auto px-4 py-8 flex-1">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <h1 className="font-heading text-2xl" style={{ color: "#072a3c" }}>
            {staff ? "Chamados" : "Meus chamados"}
          </h1>
          {getRole() === "franqueado" && (
            <Link
              href="/tickets/new"
              className="px-5 py-2.5 rounded-lg text-white font-semibold text-sm"
              style={{ background: "linear-gradient(135deg, #072a3c 0%, #123a52 100%)" }}
            >
              + Abrir chamado
            </Link>
          )}
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold border cursor-pointer"
              style={
                filter === f.value
                  ? { background: "#072a3c", color: "white", borderColor: "#072a3c" }
                  : { background: "white", color: "#072a3c", borderColor: "#e8e6df" }
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg py-2 px-3 mb-4">{error}</p>}

        {loading ? (
          <p className="text-sm" style={{ color: "#555" }}>
            Carregando...
          </p>
        ) : tickets.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center" style={{ border: "1px solid #e8e6df" }}>
            <p className="text-sm" style={{ color: "#555" }}>
              Nenhum chamado encontrado.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {tickets.map((t) => (
              <Link
                key={t.number}
                href={`/tickets/${t.number}`}
                className="bg-white rounded-xl p-4 flex items-center justify-between gap-4 hover:shadow-md transition-shadow"
                style={{ border: "1px solid #e8e6df" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold" style={{ color: "#a4854a" }}>
                      #{String(t.number).padStart(4, "0")}
                    </span>
                    <StatusBadge status={t.status} />
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: "#f6f6f6", color: "#072a3c", border: "1px solid #e8e6df" }}
                    >
                      {t.department_name}
                    </span>
                  </div>
                  <p className="font-semibold text-sm truncate" style={{ color: "#111" }}>
                    {t.subject}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#777" }}>
                    {staff ? `Aberto por ${t.opened_by_name}` : "Você"}
                    {t.assigned_to_name ? ` · Atendido por ${t.assigned_to_name}` : staff ? " · Não atribuído" : ""}
                    {" · "}
                    {formatDate(t.updated_at)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
