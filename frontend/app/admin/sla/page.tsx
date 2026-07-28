"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { getToken, isAdmin } from "../../lib/auth";
import Header from "../../components/Header";
import StatusBadge from "../../components/StatusBadge";

type TicketRow = {
  number: number;
  subject: string;
  department_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  status: string;
  created_at: string;
  first_response_minutes: number | null;
  resolution_minutes: number | null;
};

type AtendenteSummary = {
  username: string | null;
  name: string;
  department_name: string | null;
  tickets_count: number;
  closed_count: number;
  avg_first_response_minutes: number | null;
  avg_resolution_minutes: number | null;
};

type SlaReport = {
  tickets: TicketRow[];
  by_atendente: AtendenteSummary[];
};

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours < 24) return `${hours}h ${rest}min`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return `${days}d ${restHours}h`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminSlaPage() {
  const router = useRouter();
  const [report, setReport] = useState<SlaReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken() || !isAdmin()) {
      router.push("/tickets");
      return;
    }
    apiJson<SlaReport>("/admin/sla")
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : "Não foi possível carregar o relatório."))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <main className="min-h-dvh flex flex-col" style={{ background: "#f6f6f6" }}>
      <Header />
      <div className="max-w-4xl w-full mx-auto px-4 py-8 flex-1">
        <h1 className="font-heading text-2xl mb-6" style={{ color: "#072a3c" }}>
          SLA de atendimento
        </h1>

        {error && <p className="text-red-600 text-xs bg-red-50 rounded-lg py-2 px-3 mb-4">{error}</p>}

        {loading ? (
          <p className="text-sm" style={{ color: "#555" }}>
            Carregando...
          </p>
        ) : report ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#072a3c" }}>
              Por atendente
            </p>
            <div className="bg-white rounded-xl overflow-hidden mb-8" style={{ border: "1px solid #e8e6df" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#f6f6f6" }}>
                      <th className="text-left px-4 py-3 font-semibold" style={{ color: "#072a3c" }}>
                        Atendente
                      </th>
                      <th className="text-left px-4 py-3 font-semibold" style={{ color: "#072a3c" }}>
                        Departamento
                      </th>
                      <th className="text-right px-4 py-3 font-semibold" style={{ color: "#072a3c" }}>
                        Chamados
                      </th>
                      <th className="text-right px-4 py-3 font-semibold" style={{ color: "#072a3c" }}>
                        Encerrados
                      </th>
                      <th className="text-right px-4 py-3 font-semibold" style={{ color: "#072a3c" }}>
                        Tempo médio 1ª resposta
                      </th>
                      <th className="text-right px-4 py-3 font-semibold" style={{ color: "#072a3c" }}>
                        Tempo médio resolução
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.by_atendente.map((a) => (
                      <tr key={a.username ?? "unassigned"} style={{ borderTop: "1px solid #e8e6df" }}>
                        <td className="px-4 py-3" style={{ color: "#111" }}>
                          {a.name}
                        </td>
                        <td className="px-4 py-3" style={{ color: "#777" }}>
                          {a.department_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: "#111" }}>
                          {a.tickets_count}
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: "#111" }}>
                          {a.closed_count}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold" style={{ color: "#072a3c" }}>
                          {formatMinutes(a.avg_first_response_minutes)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold" style={{ color: "#072a3c" }}>
                          {formatMinutes(a.avg_resolution_minutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#072a3c" }}>
              Todos os chamados
            </p>
            <div className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #e8e6df" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#f6f6f6" }}>
                      <th className="text-left px-4 py-3 font-semibold" style={{ color: "#072a3c" }}>
                        #
                      </th>
                      <th className="text-left px-4 py-3 font-semibold" style={{ color: "#072a3c" }}>
                        Assunto
                      </th>
                      <th className="text-left px-4 py-3 font-semibold" style={{ color: "#072a3c" }}>
                        Atendente
                      </th>
                      <th className="text-left px-4 py-3 font-semibold" style={{ color: "#072a3c" }}>
                        Status
                      </th>
                      <th className="text-right px-4 py-3 font-semibold" style={{ color: "#072a3c" }}>
                        1ª resposta
                      </th>
                      <th className="text-right px-4 py-3 font-semibold" style={{ color: "#072a3c" }}>
                        Resolução
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.tickets.map((t) => (
                      <tr key={t.number} style={{ borderTop: "1px solid #e8e6df" }}>
                        <td className="px-4 py-3 font-bold" style={{ color: "#a4854a" }}>
                          #{String(t.number).padStart(4, "0")}
                        </td>
                        <td className="px-4 py-3 truncate max-w-[200px]" style={{ color: "#111" }} title={t.subject}>
                          {t.subject}
                        </td>
                        <td className="px-4 py-3" style={{ color: "#777" }}>
                          {t.assigned_to_name ?? "Não atribuído"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: "#111" }}>
                          {formatMinutes(t.first_response_minutes)}
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: "#111" }}>
                          {formatMinutes(t.resolution_minutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs mt-3" style={{ color: "#999" }}>
              1ª resposta: tempo entre a abertura do chamado e a primeira mensagem do time interno. Resolução: tempo entre a abertura e o encerramento.
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
