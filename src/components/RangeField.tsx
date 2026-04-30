import React, { useCallback, useRef, useEffect } from "react";
import { NumericField } from "./forms/NumericField";

interface RangeValue {
  from?: number;
  to?: number;
}

interface RangeFieldProps {
  value: RangeValue;
  onChange: (value: RangeValue) => void;
  min?: number;
  max?: number;
  className?: string;
}

// 範囲制限
const clamp = (n: number, min?: number, max?: number): number =>
  Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

// アイコンコンポーネント
const LeftArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15,18 9,12 15,6"></polyline>
  </svg>
);

const RightArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9,18 15,12 9,6"></polyline>
  </svg>
);

// StepperButton: 長押し加速対応ボタン
interface StepperButtonProps {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
  className?: string;
}

const StepperButton: React.FC<StepperButtonProps> = ({
  onClick,
  disabled,
  children,
  className = "",
}) => {
  const [isPressed, setIsPressed] = React.useState(false);
  const speedRef = useRef(150);
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  const stopRepeating = useCallback(() => {
    isRunningRef.current = false;
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPressed(false);
    speedRef.current = 150;
  }, []);

  const startRepeating = useCallback(() => {
    if (disabledRef.current) return;
    // 既に実行中なら何もしない
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    onClickRef.current();
    setIsPressed(true);
    speedRef.current = 200;

    // 長押しと判定するまでの待ち時間を長めに取る (iOS で短いタップが
    // 誤って auto-repeat と判定されることを防ぐ。短いタップは pointerup で
    // この timeout が clear される)。
    timeoutRef.current = window.setTimeout(() => {
      if (!isRunningRef.current) return;

      const repeat = () => {
        if (!isRunningRef.current) return;
        // 値が境界に達して disabled になったら自動停止
        if (disabledRef.current) {
          isRunningRef.current = false;
          setIsPressed(false);
          return;
        }
        onClickRef.current();
        speedRef.current = Math.max(70, speedRef.current - 10);
        intervalRef.current = window.setTimeout(repeat, speedRef.current);
      };
      repeat();
    }, 600);
  }, []);

  // ボタン外で指を離した場合の保険として document に listener を張る
  useEffect(() => {
    if (!isPressed) return;
    const stop = () => stopRepeating();
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
    document.addEventListener("visibilitychange", stop);
    window.addEventListener("blur", stop);
    return () => {
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
      document.removeEventListener("visibilitychange", stop);
      window.removeEventListener("blur", stop);
    };
  }, [isPressed, stopRepeating]);

  // disabled になったら強制停止 (max/min 到達時のリピート暴走を防ぐ)
  useEffect(() => {
    if (disabled && isRunningRef.current) {
      stopRepeating();
    }
  }, [disabled, stopRepeating]);

  // アンマウント時にも確実に停止
  useEffect(() => {
    return () => stopRepeating();
  }, [stopRepeating]);

  return (
    <button
      type="button"
      className={`w-6 h-6 flex items-center justify-center rounded border text-xs font-medium transition select-none ${
        disabled
          ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
          : isPressed
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white text-slate-600 border-slate-300 hover:bg-blue-50 hover:border-blue-400 active:bg-blue-100"
      } ${className}`}
      onPointerDown={(e) => {
        if (disabled) return;
        // setPointerCapture は iOS Safari で pointerup が届かなくなる原因になるため使わない。
        // 代わりに document へグローバル listener を張る (useEffect 側)。
        e.preventDefault();
        startRepeating();
      }}
      onPointerUp={stopRepeating}
      onPointerLeave={stopRepeating}
      onPointerCancel={stopRepeating}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      style={{
        touchAction: "manipulation",
        WebkitTouchCallout: "none",
        userSelect: "none",
      }}
    >
      {children}
    </button>
  );
};

// RangeField メインコンポーネント
export const RangeField: React.FC<RangeFieldProps> = ({
  value,
  onChange,
  min = 1,
  max = 330,
  className = "",
}) => {
  // 確定時のコミット処理（範囲補正含む）
  const commitWithClamp = useCallback(
    (n: number | "", kind: "from" | "to") => {
      const v = n === "" ? undefined : clamp(n as number, min, max);
      let next = { ...value, [kind]: v };

      // 範囲整合性チェック
      if (typeof next.from === "number" && typeof next.to === "number") {
        if (next.from > next.to) {
          if (kind === "from") {
            // 開始を変更して開始>終了 → 終了=開始
            next = { from: next.from, to: next.from };
          } else {
            // 終了を変更して終了<開始 → 開始=終了
            next = { from: next.to, to: next.to };
          }
        }
      }

      onChange(next);
    },
    [value, min, max, onChange]
  );

  // ステッパーボタンハンドラ（valueを依存配列から除外）
  const valueRef = useRef(value);
  valueRef.current = value;

  const incrementFrom = useCallback(() => {
    const current = valueRef.current.from ?? min;
    const newValue = Math.min(current + 1, max);
    onChange({ ...valueRef.current, from: newValue });
  }, [min, max, onChange]);

  const decrementFrom = useCallback(() => {
    const current = valueRef.current.from ?? min;
    const newValue = Math.max(current - 1, min);
    onChange({ ...valueRef.current, from: newValue });
  }, [min, onChange]);

  const incrementTo = useCallback(() => {
    const current = valueRef.current.to ?? max;
    const newValue = Math.min(current + 1, max);
    onChange({ ...valueRef.current, to: newValue });
  }, [max, onChange]);

  const decrementTo = useCallback(() => {
    const current = valueRef.current.to ?? max;
    const newValue = Math.max(current - 1, min);
    onChange({ ...valueRef.current, to: newValue });
  }, [min, onChange]);

  return (
    <div className={`space-y-1 ${className}`}>
      {/* 1段目: 開始と終了の入力欄 */}
      <div className="flex items-center gap-2">
        <div className="flex items-center space-x-1 w-20">
          <label className="text-xs text-slate-600 whitespace-nowrap w-5">始</label>
          <NumericField
            value={value.from ?? ""}
            min={min}
            max={max}
            maxDigits={3}
            placeholder={String(min)}
            onCommit={(v) => commitWithClamp(v, "from")}
          />
        </div>
        <div className="flex items-center space-x-1 w-20">
          <label className="text-xs text-slate-600 whitespace-nowrap w-5">終</label>
          <NumericField
            value={value.to ?? ""}
            min={min}
            max={max}
            maxDigits={3}
            placeholder={String(max)}
            onCommit={(v) => commitWithClamp(v, "to")}
          />
        </div>
      </div>

      {/* 2段目: 矢印ボタン */}
      <div className="flex items-center gap-2">
        <div className="flex items-center space-x-1 w-20 pl-5">
          <StepperButton onClick={decrementFrom} disabled={!value.from || value.from <= min}>
            <LeftArrowIcon />
          </StepperButton>
          <StepperButton onClick={incrementFrom} disabled={!value.from || value.from >= max}>
            <RightArrowIcon />
          </StepperButton>
        </div>
        <div className="flex items-center space-x-1 w-20 pl-5">
          <StepperButton onClick={decrementTo} disabled={!value.to || value.to <= min}>
            <LeftArrowIcon />
          </StepperButton>
          <StepperButton onClick={incrementTo} disabled={!value.to || value.to >= max}>
            <RightArrowIcon />
          </StepperButton>
        </div>
      </div>
    </div>
  );
};

export default RangeField;
