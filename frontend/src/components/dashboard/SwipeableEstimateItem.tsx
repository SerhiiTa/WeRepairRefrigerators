"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import { estimateSwipeDirection } from "./estimate-item-actions";

export function SwipeableEstimateItem({ open, disabled, onOpenChange, onDelete, children, menu }: {
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  children: ReactNode;
  menu?: ReactNode;
}) {
  const gesture = useRef<{ x: number; y: number; direction: "horizontal" | "vertical" | null } | null>(null);
  const suppressClick = useRef(false);
  return (
    <div className="relative">
      <div className="relative overflow-hidden bg-red-600">
        <button type="button" aria-label="Delete item" disabled={disabled} tabIndex={open ? 0 : -1}
          className={`${open ? "flex" : "hidden"} absolute inset-y-0 right-0 w-20 flex-col items-center justify-center gap-1 text-sm font-semibold text-white`}
          onClick={onDelete}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" /></svg>
          Delete
        </button>
        <div className="relative bg-white transition-transform motion-reduce:transition-none" style={{ transform: open ? "translateX(-80px)" : "translateX(0)", touchAction: "pan-y" }}
          onPointerDown={(event) => {
            suppressClick.current = false;
            if (disabled || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest("[data-item-menu]")) return;
            gesture.current = { x: event.clientX, y: event.clientY, direction: null };
          }}
          onPointerMove={(event) => {
            const current = gesture.current;
            if (!current) return;
            current.direction ??= estimateSwipeDirection(event.clientX - current.x, event.clientY - current.y);
            if (current.direction === "horizontal") {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              suppressClick.current = true;
            }
          }}
          onPointerUp={(event) => {
            const current = gesture.current;
            gesture.current = null;
            if (current?.direction !== "horizontal") return;
            const dx = event.clientX - current.x;
            if (Math.abs(dx) >= 40) onOpenChange(dx < 0);
          }}
          onPointerCancel={() => { gesture.current = null; }}
          onClickCapture={(event) => {
            if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
          }}>
          {children}
        </div>
      </div>
      {menu}
    </div>
  );
}
