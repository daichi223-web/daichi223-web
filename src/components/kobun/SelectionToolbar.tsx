import { useState, useEffect, useCallback } from "react";
import { buildGemSelectionUrl } from "@/lib/kobun/gem";

interface SelectionToolbarProps {
  textTitle: string;
}

export function SelectionToolbar({ textTitle }: SelectionToolbarProps) {
  const [toolbar, setToolbar] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      // Delay hiding so button clicks can fire first
      setTimeout(() => {
        const s = window.getSelection();
        if (!s || s.isCollapsed || !s.toString().trim()) {
          setToolbar(null);
          setCopied(false);
        }
      }, 200);
      return;
    }

    const text = sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setToolbar({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
    setCopied(false);
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, [handleSelectionChange]);

  if (!toolbar) return null;

  const gemUrl = buildGemSelectionUrl({
    textTitle,
    selectedText: toolbar.text,
  });

  return (
    <div
      className="fixed z-40 flex items-center gap-1 bg-sumi text-white rounded-lg shadow-lg px-1 py-1 animate-popover-in"
      style={{
        left: `${toolbar.x}px`,
        top: `${toolbar.y}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      <button
        className="px-3 py-1.5 text-xs rounded hover:bg-white/20 transition-colors"
        onPointerDown={(e) => {
          e.preventDefault();
          navigator.clipboard.writeText(toolbar.text);
          setCopied(true);
        }}
      >
        {copied ? "OK" : "コピー"}
      </button>
      <div className="w-px h-4 bg-white/30" />
      <button
        className="px-3 py-1.5 text-xs rounded hover:bg-white/20 transition-colors text-sakura"
        onPointerDown={(e) => {
          e.preventDefault();
          window.open(gemUrl, "_blank", "noopener,noreferrer");
        }}
      >
        AIに聞く
      </button>
    </div>
  );
}
