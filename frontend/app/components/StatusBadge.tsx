const LABELS: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  encerrado: "Encerrado",
};

const COLORS: Record<string, { bg: string; text: string }> = {
  aberto: { bg: "#fdecec", text: "#b3261e" },
  em_andamento: { bg: "#fdf3e0", text: "#a4854a" },
  encerrado: { bg: "#e8f3ec", text: "#1e7a4c" },
};

export default function StatusBadge({ status }: { status: string }) {
  const color = COLORS[status] ?? { bg: "#eee", text: "#555" };
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide whitespace-nowrap"
      style={{ background: color.bg, color: color.text }}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
