import {
  ChevronDown,
  Download,
  Loader2,
  Map,
  Pencil,
  Plus,
  Save,
  Shield,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type {
  DefenseCardContent,
  DominantImpulse,
} from "../../types/v2";
import type {
  DefenseDraftPreview,
  DefenseDraftQuestionnaire,
} from "../../hooks/useDefenseCard";

type DefenseCardProps = {
  content: DefenseCardContent;
  onQuickLog: (impulseId: string, triggerId?: string | null) => Promise<boolean>;
  onExport: () => void;
  onAddCard: (input: {
    label: string;
    situation: string;
    signal: string;
    defenseResponse: string;
    planB: string;
  }) => Promise<boolean>;
  onPrepareAddCard: (need: string) => Promise<DefenseDraftQuestionnaire | null>;
  onGenerateAddCardDraft: (
    need: string,
    answers: Record<string, string>,
  ) => Promise<DefenseDraftPreview | null>;
  onRemoveCard: (input: {
    impulseId: string;
    triggerId: string;
  }) => Promise<boolean>;
  onUpdateCard: (input: {
    impulseId: string;
    triggerId: string;
    situation: string;
    signal: string;
    defenseResponse: string;
    planB: string;
  }) => Promise<boolean>;
  busy?: boolean;
  regenerating?: boolean;
  addingCard?: boolean;
  preparingCardDraft?: boolean;
  generatingCardDraft?: boolean;
  removingCard?: boolean;
  updatingCard?: boolean;
  planCardsNode?: ReactNode;
  freeSectionTitle?: string;
  freeSectionSubtitle?: string;
  focusPlanDefenseTriggerKey?: string | null;
  focusPlanDefenseToken?: number | null;
};

export type DefenseTriggerResourceCardData = {
  impulseId: string;
  impulseLabel: string;
  contextLabel?: string | null;
  planB: string;
  trigger: DominantImpulse["triggers"][number];
  index: number;
};

type EditCardDraft = {
  situation: string;
  signal: string;
  defenseResponse: string;
  planB: string;
};

function ConfettiBurst() {
  const colors = ["#10b981", "#8b5cf6", "#f59e0b", "#3b82f6", "#ec4899"];
  const dots = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * 360;
    const distance = 20 + Math.random() * 20;
    const x = Math.cos((angle * Math.PI) / 180) * distance;
    const y = Math.sin((angle * Math.PI) / 180) * distance - 10;
    return { x, y, color: colors[i % colors.length], delay: Math.random() * 0.15 };
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {dots.map((dot, i) => (
        <span
          key={i}
          className="confetti-dot"
          style={{
            left: `calc(50% + ${dot.x}px)`,
            top: `calc(50% + ${dot.y}px)`,
            backgroundColor: dot.color,
            animationDelay: `${dot.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function buildTriggerCardTitle(
  trigger: DominantImpulse["triggers"][number],
  index: number,
): string {
  const label = typeof trigger.label === "string" ? trigger.label.trim() : "";
  if (label) return label;
  const situation = String(trigger.situation ?? "").trim();
  return situation || `Situation ${index + 1}`;
}

function buildDefenseCardTitle(card: DefenseTriggerResourceCardData): string {
  const impulseLabel = String(card.impulseLabel ?? "").trim();
  if (impulseLabel && impulseLabel.toLowerCase() !== "situations en plus") {
    return impulseLabel;
  }
  return buildTriggerCardTitle(card.trigger, card.index);
}

function fallbackIllustration() {
  return {
    icon: "spark",
    palette: ["#92400e", "#f59e0b", "#fde68a"],
    accent: "#fff7ed",
  };
}

function IllustrationIcon({
  icon,
  accent,
}: {
  icon: string;
  accent: string;
}) {
  switch (icon) {
    case "moon":
      return (
        <>
          <circle cx="56" cy="26" r="12" fill={accent} opacity="0.95" />
          <circle cx="62" cy="23" r="12" fill="rgba(0,0,0,0.16)" />
        </>
      );
    case "book":
      return (
        <>
          <path d="M28 20c8-4 16-4 24 0v24c-8-4-16-4-24 0z" fill={accent} opacity="0.92" />
          <path d="M52 20c8-4 16-4 24 0v24c-8-4-16-4-24 0z" fill={accent} opacity="0.78" />
          <line x1="52" y1="20" x2="52" y2="44" stroke="rgba(15,23,42,0.22)" strokeWidth="2" />
        </>
      );
    case "phone_off":
      return (
        <>
          <rect x="32" y="16" width="32" height="40" rx="7" fill={accent} opacity="0.92" />
          <line x1="30" y1="52" x2="66" y2="20" stroke="rgba(15,23,42,0.3)" strokeWidth="3.5" strokeLinecap="round" />
        </>
      );
    case "breath":
      return (
        <>
          <path d="M18 42c8-10 18-10 26 0s18 10 26 0" stroke={accent} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M24 28c6-8 14-8 20 0s14 8 20 0" stroke={accent} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
        </>
      );
    case "door":
      return (
        <>
          <rect x="28" y="16" width="32" height="40" rx="3" fill={accent} opacity="0.9" />
          <circle cx="51" cy="37" r="2.2" fill="rgba(15,23,42,0.35)" />
          <rect x="60" y="20" width="8" height="32" rx="2" fill={accent} opacity="0.45" />
        </>
      );
    case "tea":
      return (
        <>
          <path d="M26 34h28v10a8 8 0 0 1-8 8H34a8 8 0 0 1-8-8z" fill={accent} opacity="0.92" />
          <path d="M54 36h8a6 6 0 0 1 0 12h-5" stroke={accent} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M34 20c-3 3 2 5-1 8m10-8c-3 3 2 5-1 8" stroke={accent} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.8" />
        </>
      );
    case "water":
      return (
        <>
          <path d="M48 16c10 12 16 20 16 28a16 16 0 0 1-32 0c0-8 6-16 16-28z" fill={accent} opacity="0.9" />
          <path d="M40 42c2 4 6 6 12 6" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      );
    case "desk":
      return (
        <>
          <rect x="24" y="26" width="40" height="18" rx="3" fill={accent} opacity="0.92" />
          <line x1="30" y1="44" x2="26" y2="56" stroke={accent} strokeWidth="3" strokeLinecap="round" />
          <line x1="58" y1="44" x2="62" y2="56" stroke={accent} strokeWidth="3" strokeLinecap="round" />
          <rect x="44" y="16" width="18" height="10" rx="2" fill={accent} opacity="0.6" />
        </>
      );
    case "plate":
      return (
        <>
          <circle cx="48" cy="36" r="18" fill={accent} opacity="0.9" />
          <circle cx="48" cy="36" r="10" fill="none" stroke="rgba(15,23,42,0.15)" strokeWidth="2.5" />
        </>
      );
    case "heart":
      return (
        <path d="M48 54c-16-10-22-18-22-28 0-7 5-12 12-12 4 0 8 2 10 6 2-4 6-6 10-6 7 0 12 5 12 12 0 10-6 18-22 28z" fill={accent} opacity="0.92" />
      );
    case "sunrise":
      return (
        <>
          <path d="M22 46h52" stroke={accent} strokeWidth="3" strokeLinecap="round" />
          <path d="M32 46a16 16 0 0 1 32 0" fill={accent} opacity="0.82" />
          <path d="M48 18v8m-14 4 5 4m23-4-5 4" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
        </>
      );
    case "steps":
      return (
        <>
          <path d="M24 50h12V40h12V30h12V20h12" stroke={accent} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="62" cy="20" r="3.5" fill={accent} />
        </>
      );
    case "shield":
      return (
        <path d="M48 16 66 22v14c0 12-8 20-18 26-10-6-18-14-18-26V22z" fill={accent} opacity="0.9" />
      );
    case "spark":
    default:
      return (
        <path d="M48 14l6 14 14 6-14 6-6 14-6-14-14-6 14-6z" fill={accent} opacity="0.92" />
      );
  }
}

function DefenseCardArtwork({
  trigger,
}: {
  trigger: DominantImpulse["triggers"][number];
}) {
  const illustration = trigger.illustration ?? fallbackIllustration();
  const palette = Array.isArray(illustration.palette) && illustration.palette.length >= 2
    ? illustration.palette
    : fallbackIllustration().palette;
  const accent = illustration.accent || fallbackIllustration().accent;
  const gradientId = `defense-card-gradient-${trigger.trigger_id}`;

  return (
    <div className="h-16 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/60 shadow-sm">
      <svg viewBox="0 0 96 72" className="h-full w-full">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={palette[0]} />
            <stop offset="100%" stopColor={palette[1]} />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="96" height="72" rx="18" fill={`url(#${gradientId})`} />
        <circle cx="18" cy="16" r="16" fill="rgba(255,255,255,0.08)" />
        <circle cx="74" cy="56" r="20" fill="rgba(255,255,255,0.1)" />
        <IllustrationIcon icon={illustration.icon} accent={accent} />
      </svg>
    </div>
  );
}

export function DefenseTriggerResourceCard({
  card,
  isOpen,
  onToggle,
  onQuickLog,
  onExport,
  onRemoveCard,
  onUpdateCard,
  busy,
  removing,
  updating,
  focusSignal,
}: {
  card: DefenseTriggerResourceCardData;
  isOpen: boolean;
  onToggle: () => void;
  onQuickLog?: (impulseId: string, triggerId?: string | null) => Promise<boolean>;
  onExport: () => void;
  onRemoveCard: (input: {
    impulseId: string;
    triggerId: string;
  }) => Promise<boolean>;
  onUpdateCard: (input: {
    impulseId: string;
    triggerId: string;
    situation: string;
    signal: string;
    defenseResponse: string;
    planB: string;
  }) => Promise<boolean>;
  busy?: boolean;
  removing?: boolean;
  updating?: boolean;
  focusSignal?: number | null;
}) {
  const [celebrated, setCelebrated] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<EditCardDraft>({
    situation: card.trigger.situation,
    signal: card.trigger.signal,
    defenseResponse: card.trigger.defense_response,
    planB: card.planB,
  });

  const handleQuickLog = async () => {
    if (!onQuickLog) return;
    const success = await onQuickLog(card.impulseId, card.trigger.trigger_id);
    if (!success) return;
    setCelebrated(true);
    setShowConfetti(true);
    setTimeout(() => setCelebrated(false), 1500);
    setTimeout(() => setShowConfetti(false), 1000);
  };

  const resetDraft = () => {
    setDraft({
      situation: card.trigger.situation,
      signal: card.trigger.signal,
      defenseResponse: card.trigger.defense_response,
      planB: card.planB,
    });
    setEditError(null);
  };

  const handleSave = async () => {
    if (
      !draft.situation.trim() ||
      !draft.signal.trim() ||
      !draft.defenseResponse.trim() ||
      !draft.planB.trim()
    ) {
      setEditError("Remplis le moment, le piege, le geste et le plan B.");
      return;
    }

    const success = await onUpdateCard({
      impulseId: card.impulseId,
      triggerId: card.trigger.trigger_id,
      situation: draft.situation.trim(),
      signal: draft.signal.trim(),
      defenseResponse: draft.defenseResponse.trim(),
      planB: draft.planB.trim(),
    });

    if (!success) {
      setEditError("Impossible de mettre a jour cette carte pour le moment.");
      return;
    }

    setIsEditing(false);
    setEditError(null);
  };

  const handleRemove = async () => {
    const success = await onRemoveCard({
      impulseId: card.impulseId,
      triggerId: card.trigger.trigger_id,
    });

    if (!success) {
      setEditError("Impossible de supprimer cette carte pour le moment.");
      setIsDeleteModalOpen(false);
      return;
    }

    setIsDeleteModalOpen(false);
  };

  useEffect(() => {
    if (!focusSignal || !isOpen) return;
    articleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusSignal, isOpen]);

  return (
    <article ref={articleRef} className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <DefenseCardArtwork trigger={card.trigger} />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
              Carte {card.index + 1}
            </p>
            <h5 className="mt-1 text-sm font-semibold text-stone-900">
              {buildDefenseCardTitle(card)}
            </h5>
            {card.contextLabel ? (
              <p className="mt-1 text-xs text-stone-500">{card.contextLabel}</p>
            ) : null}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <div className="space-y-3 border-t border-stone-100 px-4 py-4">
          {isEditing ? (
            <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-3">
              <label className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                  Le moment
                </span>
                <textarea
                  value={draft.situation}
                  onChange={(event) => setDraft((current) => ({ ...current, situation: event.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700 outline-none ring-0"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                  Le piege
                </span>
                <textarea
                  value={draft.signal}
                  onChange={(event) => setDraft((current) => ({ ...current, signal: event.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700 outline-none ring-0"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                  Mon geste
                </span>
                <textarea
                  value={draft.defenseResponse}
                  onChange={(event) => setDraft((current) => ({ ...current, defenseResponse: event.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700 outline-none ring-0"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Plan B
                </span>
                <textarea
                  value={draft.planB}
                  onChange={(event) => setDraft((current) => ({ ...current, planB: event.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700 outline-none ring-0"
                />
              </label>

              {editError ? (
                <p className="text-xs text-rose-600">{editError}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={updating}
                  className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {updating ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <Save className="h-3 w-3" />
                      Enregistrer
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetDraft();
                    setIsEditing(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600"
                >
                  <X className="h-3 w-3" />
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={onExport}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600"
                >
                  <Download className="h-3 w-3" />
                  Imprimer la carte
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-sky-50 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                  Le moment
                </p>
                <p className="mt-1 text-sm leading-6 text-stone-800">
                  {card.trigger.situation}
                </p>
              </div>

              <div className="rounded-xl bg-amber-50 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                  Le piege
                </p>
                <p className="mt-1 text-sm leading-6 text-stone-800">
                  {card.trigger.signal}
                </p>
              </div>

              <div className="rounded-xl bg-emerald-50 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                  Mon geste
                </p>
                <p className="mt-1 text-sm leading-6 text-emerald-950">
                  {card.trigger.defense_response}
                </p>
              </div>

              {card.planB ? (
                <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Plan B
                  </p>
                  <p className="mt-1 text-sm leading-6 text-stone-700">
                    {card.planB}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetDraft();
                    setIsEditing(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600"
                >
                  <Pencil className="h-3 w-3" />
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={onExport}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600"
                >
                  <Download className="h-3 w-3" />
                  Imprimer la carte
                </button>
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  disabled={removing}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-medium text-rose-700 disabled:opacity-60"
                >
                  <Trash2 className="h-3 w-3" />
                  Supprimer
                </button>

                {onQuickLog ? (
                  <div className="relative inline-block">
                    {showConfetti ? <ConfettiBurst /> : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleQuickLog}
                      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                        celebrated
                          ? "scale-105 bg-emerald-500 text-white"
                          : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      }`}
                    >
                      <Plus className="h-3 w-3" />
                      {celebrated ? "Victoire notee !" : "+1 victoire"}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
      {isDeleteModalOpen
        ? createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-stone-950/55 backdrop-blur-sm"
              onClick={() => setIsDeleteModalOpen(false)}
            />
            <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-2xl">
              <div className="border-b border-stone-200 px-5 py-5">
                <h4 className="text-lg font-semibold text-stone-950">Supprimer cette carte ?</h4>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Cette action retire cette carte de defense de tes ressources.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-5">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-700"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  disabled={removing}
                  className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {removing ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Suppression...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3 w-3" />
                      Supprimer
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </article>
  );
}

export function DefenseCardSkeleton() {
  return (
    <section className="animate-pulse overflow-hidden rounded-[30px] border border-stone-200 bg-white px-5 py-5 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.32)]">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-stone-200" />
        <div className="h-3 w-36 rounded bg-stone-200" />
      </div>
      <div className="mt-4 h-16 rounded-2xl bg-stone-100" />
      <div className="mt-4 h-24 rounded-2xl bg-stone-100" />
    </section>
  );
}

export function DefenseCard({
  content,
  onQuickLog,
  onExport,
  onAddCard,
  onPrepareAddCard,
  onGenerateAddCardDraft,
  onRemoveCard,
  onUpdateCard,
  busy,
  regenerating,
  addingCard,
  preparingCardDraft,
  generatingCardDraft,
  removingCard,
  updatingCard,
  planCardsNode,
  freeSectionTitle = "Cartes de defense libres",
  freeSectionSubtitle = "Celles que tu construis en dehors des actions du plan, quand tu veux te preparer pour un moment fragile precis.",
  focusPlanDefenseTriggerKey,
  focusPlanDefenseToken,
}: DefenseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [isDefenseIntroOpen, setIsDefenseIntroOpen] = useState(true);
  const [isFreeSectionOpen, setIsFreeSectionOpen] = useState(true);
  const [isPlanCardsSectionOpen, setIsPlanCardsSectionOpen] = useState(true);
  const [isDifficultyMapOpen, setIsDifficultyMapOpen] = useState(false);
  const [openTriggerIds, setOpenTriggerIds] = useState<Record<string, boolean>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addStep, setAddStep] = useState<"need" | "questions" | "review">("need");
  const [addNeed, setAddNeed] = useState("");
  const [questionnaire, setQuestionnaire] = useState<DefenseDraftQuestionnaire | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [draftPreview, setDraftPreview] = useState<DefenseDraftPreview | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const cards = useMemo(
    () =>
      content.impulses.flatMap((impulse) =>
        impulse.triggers.map((trigger, index) => ({
          impulseId: impulse.impulse_id,
          impulseLabel: impulse.label,
          contextLabel: null,
          planB: String(trigger.plan_b ?? impulse.generic_defense ?? "").trim(),
          trigger,
          index,
        })),
      ),
    [content.impulses],
  );
  const difficultyPreviews = useMemo(
    () =>
      content.impulses.flatMap((impulse) =>
        impulse.triggers
          .map((trigger) => ({
            triggerId: trigger.trigger_id,
            label: buildTriggerCardTitle(trigger, 0),
            difficulty: String(trigger.difficulty_preview ?? "").trim(),
          }))
          .filter((item) => item.difficulty.length > 0),
      ),
    [content.impulses],
  );
  const difficultyMapSummary = String(content.difficulty_map_summary ?? "").trim();

  const toggleTrigger = (triggerId: string) => {
    setOpenTriggerIds((current) => ({
      ...current,
      [triggerId]: !current[triggerId],
    }));
  };

  const openAddForm = () => {
    setAddNeed("");
    setQuestionnaire(null);
    setQuestionAnswers({});
    setDraftPreview(null);
    setAddStep("need");
    setAddError(null);
    setIsAddModalOpen(true);
  };

  const closeAddForm = () => {
    setIsAddModalOpen(false);
    setAddError(null);
    setAddNeed("");
    setQuestionnaire(null);
    setQuestionAnswers({});
    setDraftPreview(null);
    setAddStep("need");
  };

  const handlePrepare = async () => {
    if (!addNeed.trim()) {
      setAddError("Dis avec quoi tu as besoin d'aide.");
      return;
    }

    const result = await onPrepareAddCard(addNeed.trim());
    if (!result) {
      setAddError("Impossible de preparer la carte pour le moment.");
      return;
    }

    setQuestionnaire(result);
    setQuestionAnswers(
      Object.fromEntries(result.questions.map((question) => [question.id, ""])),
    );
    setDraftPreview(null);
    setAddError(null);
    setAddStep("questions");
  };

  const handleGeneratePreview = async () => {
    if (!questionnaire) return;

    const hasMissingRequired = questionnaire.questions.some((question) =>
      question.required && !String(questionAnswers[question.id] ?? "").trim()
    );
    if (hasMissingRequired) {
      setAddError("Reponds aux 3 questions pour preparer la carte.");
      return;
    }

    const result = await onGenerateAddCardDraft(
      addNeed.trim(),
      Object.fromEntries(
        questionnaire.questions.map((question) => [
          question.id,
          String(questionAnswers[question.id] ?? "").trim(),
        ]),
      ),
    );
    if (!result) {
      setAddError("Impossible de generer le brouillon pour le moment.");
      return;
    }

    setDraftPreview(result);
    setAddError(null);
    setAddStep("review");
  };

  const handleSubmit = async () => {
    if (!draftPreview) return;
    if (
      !draftPreview.label.trim() ||
      !draftPreview.situation.trim() ||
      !draftPreview.signal.trim() ||
      !draftPreview.defenseResponse.trim() ||
      !draftPreview.planB.trim()
    ) {
      setAddError("Remplis le nom, le moment, le piege, le geste et le plan B.");
      return;
    }

    const success = await onAddCard({
      label: draftPreview.label.trim(),
      situation: draftPreview.situation.trim(),
      signal: draftPreview.signal.trim(),
      defenseResponse: draftPreview.defenseResponse.trim(),
      planB: draftPreview.planB.trim(),
    });

    if (!success) {
      setAddError("Impossible d'ajouter cette carte pour le moment.");
      return;
    }

    closeAddForm();
  };

  const getQuestionHelperText = (
    question: DefenseDraftQuestionnaire["questions"][number],
    index: number,
  ) => {
    const base = question.helperText?.trim() ?? "";
    const isResponseQuestion =
      question.id === "response" ||
      index === 2 ||
      /geste simple|geste realiste|couper ca tout de suite/i.test(question.label);

    if (!isResponseQuestion) return base;
    if (base.includes("Si tu n'as pas d'idee")) return base;

    return base
      ? `${base} Si tu n'as pas d'idee, ce n'est pas grave.`
      : "Si tu n'as pas d'idee, ce n'est pas grave.";
  };

  useEffect(() => {
    if (!focusPlanDefenseTriggerKey || !focusPlanDefenseToken) return;
    setExpanded(true);
    setIsPlanCardsSectionOpen(true);
  }, [focusPlanDefenseTriggerKey, focusPlanDefenseToken]);

  return (
    <section className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-[0_24px_80px_-52px_rgba(15,23,42,0.32)]">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50">
            <Shield className="h-5 w-5 text-blue-700" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-h-10 items-center">
              <h3
                className="text-xl font-semibold tracking-[0.01em] text-stone-950"
                style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif' }}
              >
                Defense
              </h3>
            </div>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Des cartes pour t'aider a tenir quand le moment fragile arrive, sans avoir a tout renegocier dans ta tete.
            </p>
          </div>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded ? (
        <div className="space-y-4 px-5 pb-6">
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
            <button
              type="button"
              onClick={() => setIsDefenseIntroOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                Comment ca marche ?
              </span>
              <ChevronDown
                className={`h-4 w-4 text-amber-700 transition-transform duration-200 ${
                  isDefenseIntroOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {isDefenseIntroOpen ? (
              <p className="mt-2 text-sm leading-6 text-amber-950">
                Une carte de defense est faite pour identifier les moments a risque, comprendre comment tu cedes,
                et avoir la bonne reponse quand ca arrive. En pratique, tu reperes un contexte fragile, ce qui
                t'embarque d'habitude, puis tu poses une reponse simple et realiste que tu pourras suivre sans
                avoir a improviser. Par exemple, au lieu de te laisser aspirer par une serie le soir, ta carte
                peut te faire basculer vers 4 respirations ou un livre des que le signal apparait.
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50">
            <button
              type="button"
              onClick={() => setIsFreeSectionOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-pink-50">
                  <Sparkles className="h-4 w-4 text-pink-700" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-950">{freeSectionTitle}</p>
                  <p className="mt-1 text-sm leading-6 text-stone-600">{freeSectionSubtitle}</p>
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 ${
                  isFreeSectionOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isFreeSectionOpen ? (
              <div className="space-y-4 border-t border-stone-200 px-4 py-4">
                {cards.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsDifficultyMapOpen(true)}
                        disabled={difficultyPreviews.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-60"
                      >
                        <Shield className="h-3 w-3" />
                        Cartographie des difficultes
                      </button>
                      <button
                        type="button"
                        onClick={openAddForm}
                        disabled={addingCard || regenerating || preparingCardDraft || generatingCardDraft}
                        className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-60"
                      >
                        <Plus className="h-3 w-3" />
                        Ajouter une carte
                      </button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {cards.map((card, index) => (
                      <DefenseTriggerResourceCard
                        key={card.trigger.trigger_id}
                        card={{ ...card, index }}
                        isOpen={Boolean(openTriggerIds[card.trigger.trigger_id])}
                          onToggle={() => toggleTrigger(card.trigger.trigger_id)}
                          onQuickLog={onQuickLog}
                          onExport={onExport}
                          onRemoveCard={onRemoveCard}
                          onUpdateCard={onUpdateCard}
                          busy={busy}
                          removing={removingCard}
                          updating={updatingCard}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-5 py-6 text-center">
                    <p className="text-sm text-stone-500">
                      Tu n'as pas encore de carte de defense libre dans cette section.
                    </p>
                    <button
                      type="button"
                      onClick={openAddForm}
                      disabled={addingCard || preparingCardDraft || generatingCardDraft}
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {(addingCard || preparingCardDraft || generatingCardDraft) ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Preparation...
                        </>
                      ) : (
                        "Ajouter ma premiere carte"
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {planCardsNode ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50">
              <button
                type="button"
                onClick={() => setIsPlanCardsSectionOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-sky-50">
                    <Map className="h-4 w-4 text-sky-700" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-950">Cartes de defense du plan</p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      Elles se rangent ici, par niveau, quand tu choisis de les preparer pour une action du plan.
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 ${
                    isPlanCardsSectionOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isPlanCardsSectionOpen ? (
                <div className="border-t border-stone-200 px-4 py-4">
                  {planCardsNode}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {isDifficultyMapOpen
        ? createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-stone-950/55 backdrop-blur-sm"
              onClick={() => setIsDifficultyMapOpen(false)}
            />
            <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50">
                    <Shield className="h-5 w-5 text-blue-700" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-stone-950">Cartographie des difficultes</h4>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      Voici les difficultes auxquelles t'attendre pendant ta transformation.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDifficultyMapOpen(false)}
                  className="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 px-5 py-5">
                {difficultyMapSummary ? (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                      Vue d'ensemble
                    </p>
                    <p className="mt-2 text-sm leading-6 text-blue-950">
                      {difficultyMapSummary}
                    </p>
                  </div>
                ) : null}

                <div className="space-y-3">
                  {difficultyPreviews.map((item, index) => (
                    <div
                      key={item.triggerId}
                      className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        Difficulté {index + 1}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-stone-900">
                        {item.difficulty}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}

      {isAddModalOpen
        ? createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-stone-950/55 backdrop-blur-sm"
              onClick={closeAddForm}
            />
            <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50">
                    <Shield className="h-5 w-5 text-blue-700" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-stone-950">Nouvelle carte de defense</h4>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      On part de ton besoin libre, puis Sophia te pose 3 questions utiles avant de preparer un brouillon editable.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeAddForm}
                  className="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 px-5 py-5">
                {addStep === "need" ? (
                  <label className="block">
                    <span className="text-sm font-semibold text-stone-900">
                      Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?
                    </span>
                    <textarea
                      value={addNeed}
                      onChange={(event) => setAddNeed(event.target.value)}
                      placeholder="Ex: Le soir dans mon lit, je me fais embarquer par une serie alors que je voudrais ouvrir mon livre."
                      rows={5}
                      className="mt-3 min-h-[140px] w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400"
                    />
                  </label>
                ) : null}

                {addStep === "questions" && questionnaire ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                      <p className="text-sm leading-6 text-amber-950">
                        {questionnaire.cardExplanation}
                      </p>
                    </div>

                    {questionnaire.questions.map((question, index) => (
                      <label key={question.id} className="block">
                        <span className="text-sm font-semibold text-stone-900">
                          {index + 1}. {question.label}
                        </span>
                        {getQuestionHelperText(question, index) ? (
                          <span className="mt-1 block text-xs text-stone-500">
                            {getQuestionHelperText(question, index)}
                          </span>
                        ) : null}
                        <textarea
                          value={questionAnswers[question.id] ?? ""}
                          onChange={(event) =>
                            setQuestionAnswers((current) => ({
                              ...current,
                              [question.id]: event.target.value,
                            }))}
                          placeholder={question.placeholder ?? ""}
                          rows={4}
                          className="mt-3 min-h-[108px] w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400"
                        />
                      </label>
                    ))}
                  </div>
                ) : null}

                {addStep === "review" && draftPreview ? (
                  <div className="space-y-3">
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-stone-600">Nom de la carte</span>
                      <input
                        value={draftPreview.label}
                        onChange={(event) => setDraftPreview((current) => current ? { ...current, label: event.target.value } : current)}
                        className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700 outline-none ring-0"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-stone-600">Le moment</span>
                      <textarea
                        value={draftPreview.situation}
                        onChange={(event) => setDraftPreview((current) => current ? { ...current, situation: event.target.value } : current)}
                        rows={3}
                        className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700 outline-none ring-0"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-stone-600">Le piege</span>
                      <textarea
                        value={draftPreview.signal}
                        onChange={(event) => setDraftPreview((current) => current ? { ...current, signal: event.target.value } : current)}
                        rows={3}
                        className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700 outline-none ring-0"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-stone-600">Mon geste</span>
                      <textarea
                        value={draftPreview.defenseResponse}
                        onChange={(event) => setDraftPreview((current) => current ? { ...current, defenseResponse: event.target.value } : current)}
                        rows={3}
                        className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700 outline-none ring-0"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-stone-600">Plan B</span>
                      <textarea
                        value={draftPreview.planB}
                        onChange={(event) => setDraftPreview((current) => current ? { ...current, planB: event.target.value } : current)}
                        rows={3}
                        className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700 outline-none ring-0"
                      />
                    </label>
                  </div>
                ) : null}

                {addError ? (
                  <p className="text-xs text-rose-600">{addError}</p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {addStep !== "need" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAddError(null);
                          setAddStep((current) => current === "review" ? "questions" : "need");
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-700"
                      >
                        Retour
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={closeAddForm}
                      className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-700"
                    >
                      Annuler
                    </button>
                  </div>

                  {addStep === "need" ? (
                    <button
                      type="button"
                      onClick={() => void handlePrepare()}
                      disabled={preparingCardDraft}
                      className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {preparingCardDraft ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Preparation...
                        </>
                      ) : (
                        "Continuer"
                      )}
                    </button>
                  ) : null}

                  {addStep === "questions" ? (
                    <button
                      type="button"
                      onClick={() => void handleGeneratePreview()}
                      disabled={generatingCardDraft}
                      className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {generatingCardDraft ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Generation...
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" />
                          Generer la carte
                        </>
                      )}
                    </button>
                  ) : null}

                  {addStep === "review" ? (
                    <button
                      type="button"
                      onClick={() => void handleSubmit()}
                      disabled={addingCard}
                      className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {addingCard ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Ajout...
                        </>
                      ) : (
                        <>
                          <Save className="h-3 w-3" />
                          Valider la carte
                        </>
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </section>
  );
}
