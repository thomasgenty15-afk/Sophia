type MetricProgressRailProps = {
  tone: "emerald" | "amber";
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  currentLabel: string;
  currentValue: string;
  targetLabel: string;
  targetValue: string;
  helperText?: string | null;
};

const TONE_STYLES = {
  emerald: {
    wrapper:
      "border-emerald-200/80 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),rgba(236,253,245,0.94)_42%,rgba(209,250,229,0.88)_100%)] shadow-[0_18px_48px_-30px_rgba(5,150,105,0.4)]",
    eyebrow: "text-emerald-800",
    title: "text-emerald-950",
    subtitle: "text-emerald-900/80",
    valueCard:
      "border-emerald-100/80 bg-white/95 text-emerald-950 shadow-[0_14px_32px_-24px_rgba(5,150,105,0.35)]",
    label: "text-emerald-700/80",
    helper: "text-emerald-900/90",
  },
  amber: {
    wrapper:
      "border-amber-200/90 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.96),rgba(255,251,235,0.95)_42%,rgba(254,243,199,0.92)_100%)] shadow-[0_18px_48px_-30px_rgba(217,119,6,0.35)]",
    eyebrow: "text-amber-800",
    title: "text-amber-950",
    subtitle: "text-amber-900/75",
    valueCard:
      "border-amber-200/90 bg-white/95 text-amber-950 shadow-[0_14px_32px_-24px_rgba(217,119,6,0.3)]",
    label: "text-amber-700/80",
    helper: "text-amber-900/90",
  },
} as const;

export function MetricProgressRail({
  tone,
  eyebrow,
  title,
  subtitle,
  currentLabel,
  currentValue,
  targetLabel,
  targetValue,
  helperText,
}: MetricProgressRailProps) {
  const styles = TONE_STYLES[tone];

  return (
    <div className={`overflow-hidden rounded-[28px] border p-5 ${styles.wrapper}`}>
      <div className="max-w-[36rem]">
        <p className={`text-[11px] font-bold uppercase tracking-[0.18em] ${styles.eyebrow}`}>
          {eyebrow}
        </p>
        <h4 className={`mt-2 text-base font-semibold ${styles.title}`}>{title}</h4>
        {subtitle ? (
          <p className={`mt-1 text-sm leading-relaxed ${styles.subtitle}`}>{subtitle}</p>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className={`rounded-2xl border px-4 py-3 ${styles.valueCard}`}>
          <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${styles.label}`}>
            {currentLabel}
          </p>
          <p className="mt-2 text-sm font-semibold">{currentValue}</p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${styles.valueCard}`}>
          <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${styles.label}`}>
            {targetLabel}
          </p>
          <p className="mt-2 text-sm font-semibold">{targetValue}</p>
        </div>
      </div>

      {helperText ? (
        <div className={`mt-4 rounded-2xl border px-4 py-3 ${styles.valueCard}`}>
          <p className={`text-sm leading-relaxed ${styles.helper}`}>{helperText}</p>
        </div>
      ) : null}
    </div>
  );
}
