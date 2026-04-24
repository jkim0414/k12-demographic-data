"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  label: string;
  children: React.ReactNode;
  className?: string;
};

// Lightweight hover tooltip. Native `title` attributes have inconsistent
// delays across browsers and sometimes silently don't appear, especially
// inside scrollable containers — so we roll our own using a portal so the
// bubble escapes any overflow:hidden/auto ancestor.
export function Tooltip({ label, children, className }: Props) {
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function show(e: React.MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCoords({ x, y }), 80);
  }

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCoords(null);
  }

  return (
    <>
      <span
        className={className}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
      >
        {children}
      </span>
      {mounted && coords &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              left: coords.x,
              top: coords.y - 8,
              transform: "translate(-50%, -100%)",
              pointerEvents: "none",
            }}
            className="z-50 max-w-xs rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg"
          >
            {label}
          </div>,
          document.body
        )}
    </>
  );
}
