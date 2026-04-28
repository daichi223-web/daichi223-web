import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 80;
const MAX_PULL = 140;

async function hardReload(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set('_r', String(Date.now()));
    window.location.replace(url.toString());
  }
}

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);
  const lockedHorizontal = useRef(false);
  const activeId = useRef<number | null>(null);
  const pullRef = useRef(0);
  pullRef.current = pull;

  useEffect(() => {
    const atTop = () =>
      window.scrollY === 0 &&
      (document.documentElement.scrollTop === 0 || document.body.scrollTop === 0);

    // touch の初期位置から、横スクロール可能な祖先要素を探す。
    // 該当があれば PullToRefresh は介入しない (横スクロール優先)。
    const isInsideHorizontalScroller = (el: Element | null): boolean => {
      let node: Element | null = el;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        const ox = cs.overflowX;
        if ((ox === "auto" || ox === "scroll") && node.scrollWidth > node.clientWidth) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (!atTop()) return;
      if (e.touches.length !== 1) return;
      // 横スクロール可能な要素内で開始した touch には関与しない
      if (isInsideHorizontalScroller(e.target as Element | null)) {
        startY.current = null;
        startX.current = null;
        lockedHorizontal.current = false;
        return;
      }
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      lockedHorizontal.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (refreshing || startY.current == null) return;
      // 一度横方向ジェスチャと判定したら以後は無関与
      if (lockedHorizontal.current) return;
      const dy = e.touches[0].clientY - startY.current;
      const dx = e.touches[0].clientX - (startX.current ?? e.touches[0].clientX);
      // 横方向の動きが垂直方向を上回ったら、横スクロールジェスチャと判断して降りる
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
        lockedHorizontal.current = true;
        startY.current = null;
        startX.current = null;
        setPull(0);
        return;
      }
      if (dy <= 0) {
        setPull(0);
        return;
      }
      if (!atTop()) {
        startY.current = null;
        setPull(0);
        return;
      }
      const damped = Math.min(MAX_PULL, dy * 0.55);
      setPull(damped);
      // ブラウザ既定のスクロール (および pull-to-refresh) を完全に止めるため
      // 縦方向の動きが少しでもあれば preventDefault する
      if (dy > 0 && e.cancelable) e.preventDefault();
    };

    const onTouchEnd = () => {
      lockedHorizontal.current = false;
      startX.current = null;
      if (refreshing) return;
      const current = pullRef.current;
      startY.current = null;
      if (current >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        void hardReload();
      } else {
        setPull(0);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (refreshing) return;
      if (!atTop()) return;
      activeId.current = e.pointerId;
      startY.current = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (refreshing || activeId.current !== e.pointerId || startY.current == null) return;
      const dy = e.clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      if (!atTop()) {
        startY.current = null;
        activeId.current = null;
        setPull(0);
        return;
      }
      setPull(Math.min(MAX_PULL, dy * 0.55));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (activeId.current !== e.pointerId) return;
      activeId.current = null;
      if (refreshing) return;
      const current = pullRef.current;
      startY.current = null;
      if (current >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        void hardReload();
      } else {
        setPull(0);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [refreshing]);

  if (pull === 0 && !refreshing) return null;

  const progress = Math.min(1, pull / THRESHOLD);
  const ready = pull >= THRESHOLD;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: pull,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 8,
        background: 'linear-gradient(to bottom, rgba(148,163,184,0.18), rgba(148,163,184,0))',
        zIndex: 9999,
        pointerEvents: 'none',
        transition: refreshing ? 'height 200ms ease-out' : 'none',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderRadius: 999,
          background: 'white',
          boxShadow: '0 2px 8px rgba(15,23,42,0.12)',
          fontSize: 12,
          color: '#334155',
          fontWeight: 600,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 16,
            height: 16,
            border: '2px solid #94a3b8',
            borderTopColor: refreshing ? '#0ea5e9' : ready ? '#0ea5e9' : '#cbd5e1',
            borderRadius: '50%',
            animation: refreshing ? 'ptr-spin 800ms linear infinite' : 'none',
            transform: refreshing
              ? 'none'
              : `rotate(${progress * 360}deg)`,
            transition: refreshing ? 'none' : 'transform 80ms ease-out',
          }}
        />
        <span>
          {refreshing ? '更新中…' : ready ? '離すと更新' : '引き下げて更新'}
        </span>
      </div>
      <style>{`
        @keyframes ptr-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
