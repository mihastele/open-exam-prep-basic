"use client";

/**
 * Shared UI kit.
 *
 * The app's look is neo-brutalist: heavy ink borders, hard offset shadows,
 * volt/coral accents, Nunito (`font-display`) on anything that acts like a
 * label or control. These primitives keep that consistent across sections
 * instead of every page re-inventing a button, and they carry the mobile
 * behaviour (44px tap targets, full-width actions, wrapping groups) in one
 * place.
 */

import { useRef, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------- icons */

type IconProps = { className?: string };

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function ArrowUpIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S} aria-hidden="true">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

export function ScanIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S} aria-hidden="true">
      <path d="M3 8V5a2 2 0 0 1 2-2h3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M3 12h18" />
    </svg>
  );
}

export function UploadIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S} aria-hidden="true">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function MicIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S} aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 19v3" />
    </svg>
  );
}

export function SparkIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S} aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="m5.6 5.6 2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  );
}

export function CheckIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S} aria-hidden="true">
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  );
}

export function CloseIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S} aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function TrashIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S} aria-hidden="true">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function BookIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S} aria-hidden="true">
      <path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2z" />
      <path d="M4 19a2 2 0 0 1 2-2h13" />
    </svg>
  );
}

export function CapIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S} aria-hidden="true">
      <path d="M2 8.5 12 4l10 4.5-10 4.5z" />
      <path d="M6 11v5c0 1.1 2.7 2 6 2s6-.9 6-2v-5" />
    </svg>
  );
}

export function SproutIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...S} aria-hidden="true">
      <path d="M12 21v-7" />
      <path d="M12 14c0-3-2-5-5-5 0 3 2 5 5 5Z" />
      <path d="M12 14c0-3 2-5 5-5 0 3-2 5-5 5Z" />
    </svg>
  );
}

export function Spinner({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ----------------------------------------------------------------- button */

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "accent" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  type?: "button" | "submit";
  title?: string;
  ariaLabel?: string;
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-ink text-white border-2 border-ink hover:bg-ink/90 shadow-[3px_3px_0_#d7f542]",
  accent: "bg-volt text-ink border-2 border-ink hover:brightness-95 shadow-[3px_3px_0_#16180f]",
  outline: "bg-white text-ink border-2 border-ink hover:bg-mist",
  ghost: "bg-transparent text-ink border-2 border-transparent hover:bg-mist",
  danger: "bg-coral text-white border-2 border-ink hover:brightness-95",
};

const SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-3.5 py-2 text-sm gap-1.5",
  md: "px-4 py-2.5 text-[15px] gap-2",
  lg: "px-6 py-3 text-base gap-2.5",
};

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  full = false,
  type = "button",
  title,
  ariaLabel,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-full font-display font-extrabold transition
        disabled:cursor-not-allowed disabled:opacity-40
        ${VARIANTS[variant]} ${SIZES[size]} ${full ? "w-full sm:w-auto" : ""}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- card */

export function Card({
  children,
  className = "",
  soft = false,
}: {
  children: ReactNode;
  className?: string;
  soft?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border-2 ${
        soft ? "border-ink/15 bg-mist" : "border-ink bg-white shadow-[6px_6px_0_#16180f]"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  children,
  right,
}: {
  title: string;
  children?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-black tracking-tight">{title}</h1>
        {children && <p className="mt-1.5 max-w-2xl text-stone-700">{children}</p>}
      </div>
      {right}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <h2 className="font-display text-lg font-extrabold">{children}</h2>
      {hint && <span className="text-sm text-stone-500">{hint}</span>}
    </div>
  );
}

/* --------------------------------------------------------------- segmented */

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  name,
  size = "md",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  name: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="flex flex-wrap gap-2 rounded-2xl border-2 border-ink bg-white p-1.5 shadow-[4px_4px_0_#16181f0f]"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex flex-1 items-center gap-2 rounded-xl border-2 px-3 py-2 text-left transition
              ${size === "sm" ? "min-w-[5.5rem]" : "min-w-[8.5rem]"}
              ${
                active
                  ? "border-ink bg-volt text-ink shadow-[2px_2px_0_#16180f]"
                  : "border-transparent text-stone-600 hover:bg-mist"
              }`}
          >
            {o.icon && <span className={active ? "text-ink" : "text-stone-400"}>{o.icon}</span>}
            <span className="min-w-0">
              <span className="block font-display text-sm font-extrabold">{o.label}</span>
              {o.hint && (
                <span className={`block text-xs leading-snug ${active ? "text-ink/70" : "text-stone-500"} hidden sm:block`}>
                  {o.hint}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- chip */

export function Chip({
  children,
  active = false,
  onClick,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      title={title}
      className={`max-w-[18rem] truncate rounded-full border-2 px-3.5 py-2 text-sm font-semibold transition
        ${
          active
            ? "border-ink bg-ink text-volt"
            : "border-ink/20 bg-white text-stone-700 hover:border-ink"
        }`}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- fields */

const FIELD =
  "w-full rounded-xl border-2 border-ink/25 bg-white px-3.5 py-2.5 text-[15px] outline-none transition placeholder:text-stone-400 focus:border-ink focus:bg-mist";

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  ariaLabel,
  onEnter,
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  ariaLabel?: string;
  onEnter?: () => void;
}) {
  return (
    <input
      type={type}
      value={value}
      min={min}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) onEnter();
      }}
      className={FIELD}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${FIELD} resize-y leading-relaxed`}
    />
  );
}

/* --------------------------------------------------------------- feedback */

export function Callout({
  children,
  tone = "info",
  onDismiss,
}: {
  children: ReactNode;
  tone?: "info" | "error" | "warn";
  onDismiss?: () => void;
}) {
  const tones = {
    info: "border-ink bg-mist text-ink",
    warn: "border-ink bg-volt text-ink",
    error: "border-coral bg-white text-coral",
  } as const;
  return (
    <div className={`flex items-start gap-2 rounded-xl border-2 px-3.5 py-2.5 text-sm ${tones[tone]}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100">
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full border-2 border-ink/15 bg-white"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {label && <p className="mt-1 text-xs text-stone-500">{label}</p>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-ink/25 bg-mist/60 px-6 py-10 text-center">
      {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl border-2 border-ink bg-volt text-ink">{icon}</div>}
      <p className="font-display text-lg font-extrabold">{title}</p>
      {children && <div className="mt-1.5 max-w-md text-[15px] text-stone-600">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatTile({ value, label, accent = false }: { value: ReactNode; label: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border-2 border-ink px-3.5 py-2.5 ${accent ? "bg-volt" : "bg-white"}`}>
      <p className="font-display text-2xl font-black leading-none">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-stone-600">{label}</p>
    </div>
  );
}

/* --------------------------------------------------------------- dropzone */

export function Dropzone({
  onFile,
  accept = "image/*,.pdf,.txt,.md",
  busy = false,
  busyLabel = "Working…",
  title,
  hint,
  icon,
  compact = false,
}: {
  onFile: (file: File) => void;
  accept?: string;
  busy?: boolean;
  busyLabel?: string;
  title: string;
  hint?: string;
  icon?: ReactNode;
  compact?: boolean;
}) {
  const [over, setOver] = useState(false);
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const take = (file: File | undefined) => {
    if (!file) return;
    setName(file.name);
    onFile(file);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      aria-busy={busy || undefined}
      onClick={() => !busy && input.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !busy) {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!busy) take(e.dataTransfer.files?.[0]);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition
        ${compact ? "px-4 py-5" : "px-6 py-9"}
        ${
          busy
            ? "cursor-wait border-ink/30 bg-mist"
            : over
              ? "border-ink bg-volt/40 scale-[1.01]"
              : "border-ink/30 bg-mist/60 hover:border-ink hover:bg-mist"
        }`}
    >
      <div className="grid h-11 w-11 place-items-center rounded-xl border-2 border-ink bg-white text-ink">
        {busy ? <Spinner className="h-5 w-5" /> : (icon ?? <UploadIcon />)}
      </div>
      <p className="mt-3 font-display font-extrabold">{busy ? busyLabel : title}</p>
      <p className="mt-1 text-sm text-stone-600">
        {over ? "Drop it right here" : (hint ?? "Drag a file here, or click to browse")}
      </p>
      {name && !busy && <p className="mt-2 max-w-full truncate text-xs text-stone-500">Last: {name}</p>}
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
