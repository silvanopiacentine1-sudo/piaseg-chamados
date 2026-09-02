import { RefObject } from "react";

/** Converte **negrito** e __sublinhado__ em elementos React. Texto puro nunca vira HTML bruto — sem risco de injeção. */
export function renderFormattedText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|__(.+?)__/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      parts.push(<strong key={key++}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(<u key={key++}>{match[2]}</u>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

/** Envolve a seleção atual do textarea com o marcador (ex: ** ou __), ou insere o marcador com um texto de exemplo se nada estiver selecionado. */
export function insertFormatting(
  marker: string,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (v: string) => void
) {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? value.length;
  const selected = value.slice(start, end) || "texto";
  const before = value.slice(0, start);
  const after = value.slice(end);
  setValue(`${before}${marker}${selected}${marker}${after}`);

  requestAnimationFrame(() => {
    textarea.focus();
    const cursorStart = start + marker.length;
    const cursorEnd = cursorStart + selected.length;
    textarea.setSelectionRange(cursorStart, cursorEnd);
  });
}

export function FormatToolbar({
  textareaRef,
  value,
  setValue,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  setValue: (v: string) => void;
}) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => insertFormatting("**", textareaRef, value, setValue)}
        className="w-7 h-7 flex items-center justify-center rounded text-xs font-bold cursor-pointer"
        style={{ border: "1px solid #e8e6df", color: "#072a3c", background: "#f6f6f6" }}
        title="Negrito"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => insertFormatting("__", textareaRef, value, setValue)}
        className="w-7 h-7 flex items-center justify-center rounded text-xs underline cursor-pointer"
        style={{ border: "1px solid #e8e6df", color: "#072a3c", background: "#f6f6f6" }}
        title="Sublinhado"
      >
        U
      </button>
    </div>
  );
}
