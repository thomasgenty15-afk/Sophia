import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  CircleHelp,
  GripVertical,
  Layers3,
  Loader2,
  MoveRight,
  PauseCircle,
} from "lucide-react";

import type {
  IntakeAspectV2,
  ProvisionalGroupV2,
} from "../../lib/onboardingV2";

type ValidationResult = {
  validatedGroups: Array<{
    group_label: string;
    aspects: Array<{
      label: string;
      raw_excerpt: string | null;
      source_rank: number;
    }>;
  }>;
  deferredAspects: IntakeAspectV2[];
};

type AspectValidationProps = {
  aspects: IntakeAspectV2[];
  provisionalGroups: ProvisionalGroupV2[];
  deferredAspects: IntakeAspectV2[];
  onBack?: () => void;
  onConfirm: (result: ValidationResult) => void;
  isSubmitting: boolean;
};

type GroupState = {
  id: string;
  label: string;
  rationale: string;
  aspects: IntakeAspectV2[];
};

function buildInitialGroups(
  aspects: IntakeAspectV2[],
  provisionalGroups: ProvisionalGroupV2[],
): GroupState[] {
  const byRank = new Map(aspects.map((aspect) => [aspect.source_rank, aspect]));
  return provisionalGroups.map((group, index) => ({
    id: `${group.group_label}-${index}`,
    label: group.group_label,
    rationale: group.grouping_rationale,
    aspects: group.aspect_ranks
      .map((rank) => byRank.get(rank))
      .filter((aspect): aspect is IntakeAspectV2 => Boolean(aspect)),
  }));
}

export function AspectValidation({
  aspects,
  provisionalGroups,
  deferredAspects,
  onBack,
  onConfirm,
  isSubmitting,
}: AspectValidationProps) {
  const [groups, setGroups] = useState<GroupState[]>(() =>
    buildInitialGroups(aspects, provisionalGroups)
  );
  const [deferred, setDeferred] = useState<IntakeAspectV2[]>(deferredAspects);
  const [draggedRank, setDraggedRank] = useState<number | null>(null);
  const [expandedRank, setExpandedRank] = useState<number | null>(null);

  useEffect(() => {
    setGroups(buildInitialGroups(aspects, provisionalGroups));
    setDeferred(deferredAspects);
  }, [aspects, provisionalGroups, deferredAspects]);

  const assignedRanks = useMemo(() => {
    return new Set(
      groups.flatMap((group) =>
        group.aspects.map((aspect) => aspect.source_rank)
      ),
    );
  }, [groups]);

  const unassignedActive = useMemo(() => {
    return aspects.filter((aspect) => !assignedRanks.has(aspect.source_rank));
  }, [aspects, assignedRanks]);

  const canSubmit = groups.every((group) => group.aspects.length > 0) &&
    !isSubmitting;

  function detachAspect(rank: number): IntakeAspectV2 | null {
    let found: IntakeAspectV2 | null = null;

    setGroups((current) =>
      current.map((group) => {
        const nextAspects = group.aspects.filter((aspect) => {
          const shouldKeep = aspect.source_rank !== rank;
          if (!shouldKeep) found = aspect;
          return shouldKeep;
        });
        return { ...group, aspects: nextAspects };
      })
    );

    setDeferred((current) => {
      const next = current.filter((aspect) => {
        const shouldKeep = aspect.source_rank !== rank;
        if (!shouldKeep) found = aspect;
        return shouldKeep;
      });
      return next;
    });

    return found;
  }

  function moveAspect(rank: number, destination: string) {
    const aspect = findAspect(rank);
    if (!aspect) return;

    detachAspect(rank);

    if (destination === "deferred") {
      setDeferred((current) => [...current, aspect]);
      return;
    }

    setGroups((current) =>
      current.map((group) =>
        group.id === destination
          ? { ...group, aspects: [...group.aspects, aspect] }
          : group
      )
    );
  }

  function findAspect(rank: number): IntakeAspectV2 | null {
    return (
      groups.flatMap((group) => group.aspects).find((aspect) =>
        aspect.source_rank === rank
      ) ??
        deferred.find((aspect) => aspect.source_rank === rank) ??
        aspects.find((aspect) => aspect.source_rank === rank) ??
        null
    );
  }

  function handleConfirm() {
    const validatedGroups = groups.map((group) => ({
      group_label: group.label,
      aspects: group.aspects.map((aspect) => ({
        label: aspect.label,
        raw_excerpt: aspect.raw_excerpt,
        source_rank: aspect.source_rank,
      })),
    }));

    onConfirm({ validatedGroups, deferredAspects: deferred });
  }

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-blue-700">
          <Layers3 className="h-3.5 w-3.5" />
          Validation des sujets
        </div>
        <h1 className="mb-3 font-serif text-3xl font-bold tracking-tight text-gray-900 md:text-5xl">
          Voici ce que je comprends de ta situation.
        </h1>
        <p className="mx-auto max-w-3xl text-base leading-relaxed text-gray-600 md:text-lg">
          Tu peux déplacer les aspects entre les cartes ou les mettre de côté
          pour plus tard. Les éléments marqués d’un point d’attention sont ceux
          que Sophia a compris avec moins de certitude.
        </p>
        {/* Hint mobile — le DnD HTML5 ne fonctionne pas sur mobile */}
        <p className="mt-3 text-sm text-gray-400 md:hidden">
          Appuie sur un aspect pour le déplacer vers une autre carte.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {groups.map((group) => (
            <div
              key={group.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const rank = Number(event.dataTransfer.getData("text/plain"));
                if (!Number.isNaN(rank)) moveAspect(rank, group.id);
                setDraggedRank(null);
              }}
              className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  {group.label}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-gray-500">
                  {group.rationale}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {group.aspects.map((aspect) => (
                  <button
                    key={aspect.source_rank}
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      setDraggedRank(aspect.source_rank);
                      event.dataTransfer.setData(
                        "text/plain",
                        String(aspect.source_rank),
                      );
                    }}
                    onDragEnd={() => setDraggedRank(null)}
                    onClick={() =>
                      setExpandedRank((current) =>
                        current === aspect.source_rank
                          ? null
                          : aspect.source_rank
                      )}
                    className={`rounded-2xl border px-4 py-3 text-left transition active:scale-95 ${
                      draggedRank === aspect.source_rank
                        ? "border-dashed border-gray-400 opacity-60"
                        : expandedRank === aspect.source_rank
                          ? "border-blue-200 bg-white shadow-sm"
                          : "border-gray-200 bg-gray-50 hover:border-blue-200"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {/* Desktop : poignée de drag */}
                      <GripVertical className="mt-0.5 hidden h-4 w-4 text-gray-300 md:block" />
                      {/* Mobile : indicateur tappable */}
                      <MoveRight className="mt-0.5 block h-4 w-4 text-gray-400 md:hidden" />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">
                            {aspect.label}
                          </span>
                          {aspect.uncertainty_level !== "low" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              <CircleHelp className="h-3 w-3" />
                              À confirmer
                            </span>
                          )}
                        </div>
                        {aspect.raw_excerpt && (
                          <p className="mt-1 text-xs leading-relaxed text-gray-500">
                            “{aspect.raw_excerpt}”
                          </p>
                        )}
                      </div>
                    </div>

                    {expandedRank === aspect.source_rank && (
                      <div className="mt-3 border-t border-gray-200 pt-3">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                          Déplacer vers…
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {groups
                            .filter((candidate) => candidate.id !== group.id)
                            .map((candidate) => (
                              <button
                                key={candidate.id}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  moveAspect(aspect.source_rank, candidate.id);
                                  setExpandedRank(null);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition active:bg-gray-50 hover:border-blue-200"
                              >
                                <MoveRight className="h-3 w-3 text-gray-400" />
                                {candidate.label}
                              </button>
                            ))}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveAspect(aspect.source_rank, "deferred");
                              setExpandedRank(null);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition active:bg-amber-100 hover:bg-amber-100"
                          >
                            Mettre de côté
                          </button>
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {unassignedActive.length > 0 && (
            <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              Certains aspects ne sont encore rattachés à aucun sujet.
              Déplace-les avant de continuer.
            </div>
          )}
        </div>

        <aside
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const rank = Number(event.dataTransfer.getData("text/plain"));
            if (!Number.isNaN(rank)) moveAspect(rank, "deferred");
            setDraggedRank(null);
          }}
          className="h-fit rounded-2xl border border-amber-100 bg-[linear-gradient(180deg,#fff7ed_0%,#fffbeb_100%)] p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2 text-amber-900">
            <PauseCircle className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Pour plus tard</h3>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-amber-900/70">
            Les sujets réels mais non prioritaires peuvent rester ici. Ils ne
            sont pas perdus.
          </p>
          <div className="flex flex-wrap gap-3">
            {deferred.length === 0 && (
              <p className="text-sm text-amber-900/60">
                Rien à mettre de côté pour le moment.
              </p>
            )}
            {deferred.map((aspect) => (
              <button
                key={aspect.source_rank}
                type="button"
                draggable
                onDragStart={(event) => {
                  setDraggedRank(aspect.source_rank);
                  event.dataTransfer.setData(
                    "text/plain",
                    String(aspect.source_rank),
                  );
                }}
                onDragEnd={() => setDraggedRank(null)}
                onClick={() =>
                  setExpandedRank((current) =>
                    current === aspect.source_rank ? null : aspect.source_rank
                  )}
                className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-left"
              >
                <span className="block text-sm font-semibold text-gray-900">
                  {aspect.label}
                </span>
                {expandedRank === aspect.source_rank && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-amber-200 pt-3">
                    {groups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveAspect(aspect.source_rank, group.id);
                          setExpandedRank(null);
                        }}
                        className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
                      >
                        Déplacer vers {group.label}
                      </button>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </aside>
      </div>

      <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-600 shadow-sm transition hover:border-blue-200 hover:text-gray-900"
        >
          Retour
        </button>
        <button
          type="button"
          disabled={!canSubmit || unassignedActive.length > 0}
          onClick={handleConfirm}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sophia formalise…
            </>
          ) : (
            <>
              Valider ces sujets
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </section>
  );
}
