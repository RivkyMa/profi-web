"use client";

import { useId, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

/** Shared label / hint / error wrapper for form controls. */
function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-1">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-loss">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "h-11 w-full rounded-lg border bg-ground-1 px-3 text-[15px] text-ink-1 outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-ink-3 focus:border-pulse focus:shadow-[0_0_0_3px_var(--color-pulse-dim)] disabled:cursor-not-allowed disabled:opacity-50";

export interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: ReactNode;
  error?: string | null;
  disabled?: boolean;
  /** Show - / + buttons (good for whole counts such as lots). */
  stepper?: boolean;
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
  error,
  disabled,
  stepper = false,
}: NumberFieldProps) {
  const id = useId();
  const clamp = (n: number) =>
    Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <div className="flex items-stretch gap-2">
        {stepper && (
          <button
            type="button"
            aria-label={`Decrease ${label}`}
            disabled={disabled || value <= (min ?? -Infinity)}
            onClick={() => onChange(clamp((Number.isNaN(value) ? 0 : value) - step))}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-hair-3 text-ink-2 transition-colors hover:text-ink-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus className="size-4" aria-hidden />
          </button>
        )}
        <div className="relative flex-1">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            value={Number.isNaN(value) ? "" : value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) =>
              onChange(event.target.value === "" ? NaN : Number(event.target.value))
            }
            className={cn(
              CONTROL,
              "font-mono tabular-nums",
              suffix && "pr-14",
              error ? "border-loss" : "border-hair-3",
            )}
          />
          {suffix && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs text-ink-3">
              {suffix}
            </span>
          )}
        </div>
        {stepper && (
          <button
            type="button"
            aria-label={`Increase ${label}`}
            disabled={disabled || value >= (max ?? Infinity)}
            onClick={() => onChange(clamp((Number.isNaN(value) ? 0 : value) + step))}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-hair-3 text-ink-2 transition-colors hover:text-ink-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </FieldShell>
  );
}

export interface SelectFieldProps<T extends string | number> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  hint?: ReactNode;
  error?: string | null;
  disabled?: boolean;
}

export function SelectField<T extends string | number>({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  disabled,
}: SelectFieldProps<T>) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        value={String(value)}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(event) => {
          const picked = options.find((o) => String(o.value) === event.target.value);
          if (picked) onChange(picked.value);
        }}
        className={cn(CONTROL, "cursor-pointer", error ? "border-loss" : "border-hair-3")}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 text-sm text-ink-2"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--color-pulse)]"
      />
      <span>{children}</span>
    </label>
  );
}
