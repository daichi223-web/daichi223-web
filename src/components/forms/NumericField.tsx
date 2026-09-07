import React, { useState, useEffect, useRef } from "react";
import { useFullSelectInput } from "../../hooks/useFullSelectInput";

type NumericFieldProps = {
  value: number | "";
  onChange?: (v: number | "") => void;
  onCommit?: (v: number | "") => void;
  min?: number;
  max?: number;
  maxDigits?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

// 全角数字→半角数字変換
const normalizeFullWidthDigits = (s: string): string =>
  s.replace(/[０-９]/g, (d) => String("０１２３４５６７８９".indexOf(d)));

// 数字のみ抽出・桁数制限
const sanitize = (s: string, maxDigits: number): string => {
  const digits = normalizeFullWidthDigits(s).replace(/\D+/g, "");
  return digits.slice(0, maxDigits);
};

// 範囲制限
const clamp = (n: number, min?: number, max?: number): number =>
  Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

export const NumericField: React.FC<NumericFieldProps> = ({
  value,
  onChange,
  onCommit,
  min,
  max,
  maxDigits = 3,
  placeholder,
  disabled,
  className = "",
}) => {
  const [raw, setRaw] = useState<string>(value === "" ? "" : String(value));
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fullSelect = useFullSelectInput();

  // 外部valueと同期（フォーカスされていない時のみ）
  useEffect(() => {
    // フォーカスされている場合は同期しない（選択が解除されるため）
    if (inputRef.current && document.activeElement === inputRef.current) {
      return;
    }
    const currentNum = raw === "" ? "" : Number(raw);
    if (currentNum !== value) {
      setRaw(value === "" ? "" : String(value));
    }
  }, [value]);

  // IME開始
  const handleCompositionStart = () => {
    composingRef.current = true;
  };

  // IME終了
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false;
    const s = sanitize(e.currentTarget.value, maxDigits);
    setRaw(s);
  };

  // 入力変更
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (composingRef.current) return;
    const s = sanitize(e.target.value, maxDigits);
    setRaw(s);
    // 入力中は親に通知しない（選択が解除されるため）
  };

  // 確定
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const s = sanitize(e.currentTarget.value, maxDigits);
    const n = s === "" ? "" : clamp(Number(s), min, max);
    setRaw(n === "" ? "" : String(n));
    onCommit?.(n);
  };

  // キー操作
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setRaw(value === "" ? "" : String(value));
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      // キーリピート防止
      if (e.repeat) return;
      e.preventDefault();
      const cur = raw === "" ? (min ?? 1) : Number(raw);
      const delta = e.key === "ArrowUp" ? 1 : -1;
      const next = clamp(cur + delta, min, max);
      setRaw(String(next));
      onCommit?.(next);
    }
  };

  // ペースト
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const s = sanitize(e.clipboardData.getData("text"), maxDigits);
    setRaw(s);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      enterKeyHint="done"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck="false"
      maxLength={maxDigits}
      value={raw}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-12 h-8 px-1 text-center text-base border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
        disabled
          ? "bg-slate-100 text-slate-600 border-slate-200 cursor-not-allowed"
          : "bg-white text-slate-900 border-slate-300"
      } ${className}`}
      style={{
        MozAppearance: "textfield",
        WebkitAppearance: "none",
      }}
      {...fullSelect}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onPaste={handlePaste}
      onDrop={(e) => e.preventDefault()}
      onWheel={(e) => e.preventDefault()}
    />
  );
};
