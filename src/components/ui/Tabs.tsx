"use client";

import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * Accessible tabs (WAI-ARIA tabs pattern, automatic activation).
 * Arrow keys / Home / End move focus and selection; only the active tab is in
 * the tab order.
 *
 *   <Tabs defaultValue="earn">
 *     <TabsList aria-label="Product">
 *       <TabsTrigger value="earn">Earn</TabsTrigger>
 *       <TabsTrigger value="protect">Protect</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="earn">...</TabsContent>
 *     <TabsContent value="protect">...</TabsContent>
 *   </Tabs>
 */

interface TabsContextValue {
  value: string;
  select: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components must be used inside <Tabs>");
  return ctx;
}

export interface TabsProps {
  /** Controlled value. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: ReactNode;
}

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: TabsProps) {
  const baseId = useId();
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = value ?? internal;

  const select = (next: string) => {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ value: current, select, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  children,
  onKeyDown,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const tabs = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]:not([disabled])',
      ) ?? [],
    );
    const index = tabs.findIndex((tab) => tab === document.activeElement);
    if (index === -1 || tabs.length === 0) return;

    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") {
      next = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;

    event.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  };

  return (
    <div
      {...rest}
      ref={listRef}
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-hair-2 bg-ground-1 p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps
  extends Omit<HTMLAttributes<HTMLButtonElement>, "onClick"> {
  value: string;
  disabled?: boolean;
}

export function TabsTrigger({
  value,
  disabled,
  className,
  children,
  ...rest
}: TabsTriggerProps) {
  const ctx = useTabs();
  const selected = ctx.value === value;

  return (
    <button
      {...rest}
      type="button"
      role="tab"
      id={`${ctx.baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${ctx.baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => ctx.select(value)}
      className={cn(
        "h-9 shrink-0 cursor-pointer rounded-full px-4 text-sm font-medium whitespace-nowrap",
        "transition-[background-color,color] duration-300 ease-premium",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "bg-ground-4 text-ink-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]"
          : "text-ink-2 hover:text-ink-1",
        className,
      )}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({
  value,
  className,
  children,
  ...rest
}: TabsContentProps) {
  const ctx = useTabs();
  const selected = ctx.value === value;

  return (
    <div
      {...rest}
      role="tabpanel"
      id={`${ctx.baseId}-panel-${value}`}
      aria-labelledby={`${ctx.baseId}-tab-${value}`}
      hidden={!selected}
      tabIndex={0}
      className={className}
    >
      {selected ? children : null}
    </div>
  );
}
