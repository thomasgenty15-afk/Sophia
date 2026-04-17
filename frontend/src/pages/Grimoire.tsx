import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Check,
  FileText,
  History,
  Loader2,
  Play,
  Star,
  Sword,
  Zap,
} from "lucide-react";
import FrameworkHistoryModal from "../components/FrameworkHistoryModal";
import type { Action, CompletedTransformation } from "../types/grimoire";
import {
  fetchCompletedTransformations,
  reactivateAction,
} from "../lib/grimoire";

function GrimoireCard(
  { transformation, onOpen }: {
    transformation: CompletedTransformation;
    onOpen: () => void;
  },
) {
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-2xl border border-indigo-100 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
          {transformation.theme}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Archive le {transformation.completedDate}
        </span>
      </div>
      <h3 className="mb-2 text-lg font-bold text-slate-900">
        {transformation.title}
      </h3>
      <p className="line-clamp-2 text-sm leading-relaxed text-slate-600">
        {transformation.strategy.bigWhy}
      </p>
      <div className="mt-4 flex items-center gap-2 text-sm font-medium text-indigo-600">
        <BookOpen className="h-4 w-4" />
        Ouvrir dans le Grimoire
      </div>
    </button>
  );
}

function GrimoireDetail({ transformation }: { transformation: CompletedTransformation }) {
  const navigate = useNavigate();
  const [selectedFramework, setSelectedFramework] = useState<Action | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  const hypnoses = useMemo(
    () => transformation.actions.filter((action) => action.isHypnosis),
    [transformation.actions],
  );

  const regularActions = useMemo(
    () => transformation.actions.filter((action) => !action.isHypnosis),
    [transformation.actions],
  );

  const handleReactivate = async (action: Action) => {
    setReactivatingId(action.id);
    try {
      const message = await reactivateAction(action);
      alert(message);
      navigate("/dashboard");
    } catch (err: unknown) {
      console.error("Reactivation error:", err);
      alert(err instanceof Error ? err.message : "Impossible de reactiver cette action.");
    } finally {
      setReactivatingId(null);
    }
  };

  const handlePlayHypnosis = (action: Action) => {
    alert(`Lecture bientot disponible pour "${action.title}".`);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
      <button
        onClick={() => navigate("/grimoire")}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Retour a la bibliotheque
      </button>

      <header className="mb-6 md:mb-10">
        <div className="mb-2 flex flex-wrap items-center gap-2 md:gap-3">
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 min-[350px]:text-xs md:px-3 md:py-1">
            {transformation.theme}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 min-[350px]:text-xs">
            Archive le {transformation.completedDate}
          </span>
        </div>
        <h1 className="mb-2 text-xl font-bold leading-tight text-gray-900 min-[350px]:text-3xl md:text-4xl">
          {transformation.title}
        </h1>
      </header>

      {transformation.contextProblem && (
        <section className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 min-[350px]:p-6 md:mb-8">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 md:mb-3">
            <History className="h-3 w-3 md:h-4 md:w-4" />
            Le Point de Depart
          </h3>
          <p className="text-sm leading-relaxed text-slate-600 italic md:text-base">
            "{transformation.contextProblem}"
          </p>
        </section>
      )}

      <section className="relative rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm min-[350px]:p-8">
        <div className="absolute top-0 left-0 h-full w-1 rounded-l-2xl bg-indigo-500" />
        <div className="mb-4 flex items-center gap-2 pl-2 md:mb-6 md:gap-3">
          <div className="rounded-lg bg-indigo-100 p-1.5 text-indigo-600 md:p-2">
            <Star className="h-4 w-4 min-[350px]:h-5 min-[350px]:w-5" />
          </div>
          <h3 className="text-base font-bold text-indigo-900 min-[350px]:text-xl">
            Ta Strategie Gagnante
          </h3>
        </div>

        <div className="mb-6 pl-2 md:mb-8">
          <p className="font-serif text-sm leading-relaxed text-indigo-900 italic min-[350px]:text-base md:text-lg">
            "{transformation.strategy.identity}"
          </p>
        </div>

        <div className="grid gap-4 border-t border-indigo-50 pt-4 text-sm md:grid-cols-2 md:gap-8 md:pt-6">
          <div className="flex h-full flex-col">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400 min-[350px]:text-sm md:mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              Ton Pourquoi Profond
            </h4>
            <div className="flex-1 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 md:p-5">
              <p className="text-xs leading-relaxed text-indigo-900 min-[350px]:text-base">
                {transformation.strategy.bigWhy || "Pourquoi non defini"}
              </p>
            </div>
          </div>
          <div className="flex h-full flex-col">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-500 min-[350px]:text-sm md:mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Tes Regles d'Or
            </h4>
            <div className="flex-1 rounded-xl border border-amber-100 bg-amber-50/50 p-3 md:p-5">
              <p className="text-xs leading-relaxed whitespace-pre-line text-amber-900 min-[350px]:text-base">
                {transformation.strategy.goldenRules || "Regles non definies"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {hypnoses.length > 0 && (
        <section className="mt-6 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm min-[350px]:p-8">
          <div className="mb-4 flex items-center gap-2 md:mb-6 md:gap-3">
            <div className="rounded-lg bg-violet-100 p-1.5 text-violet-600 md:p-2">
              <Play className="h-4 w-4 min-[350px]:h-5 min-[350px]:w-5" />
            </div>
            <h3 className="text-base font-bold text-violet-900 min-[350px]:text-xl">
              Tes Hypnoses Personnalisees
            </h3>
          </div>
          <div className="space-y-3">
            {hypnoses.map((hypnosis) => (
              <div
                key={hypnosis.id}
                onClick={() => handlePlayHypnosis(hypnosis)}
                className="group flex cursor-pointer items-center justify-between rounded-xl border border-violet-100 bg-white p-3 transition-all hover:shadow-md md:p-4"
              >
                <div className="min-w-0 pr-2">
                  <h4 className="truncate text-sm font-bold text-violet-900 transition-colors group-hover:text-violet-700 min-[350px]:text-lg">
                    {hypnosis.title}
                  </h4>
                  <p className="truncate text-xs text-violet-500 min-[350px]:text-base">
                    {hypnosis.description}
                    {hypnosis.media_duration ? ` (${hypnosis.media_duration})` : ""}
                  </p>
                </div>
                <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 transition-all group-hover:bg-violet-600 group-hover:text-white min-[350px]:h-10 min-[350px]:w-10">
                  <Play className="ml-0.5 h-3 w-3 fill-current min-[350px]:h-4 min-[350px]:w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-green-100 bg-white p-4 shadow-sm min-[350px]:p-8">
        <div className="mb-4 flex items-center gap-2 md:mb-6 md:gap-3">
          <div className="rounded-lg bg-green-100 p-1.5 text-green-600 md:p-2">
            <Check className="h-4 w-4 min-[350px]:h-5 min-[350px]:w-5" />
          </div>
          <h3 className="text-base font-bold text-green-900 min-[350px]:text-xl">
            Reactiver une action
          </h3>
        </div>
        <div className="space-y-3 md:space-y-4">
          {regularActions.map((action) => (
            <div
              key={action.id}
              className="flex w-full flex-col items-start justify-between gap-3 rounded-xl border border-green-100 bg-green-50/50 p-3 transition-colors hover:bg-green-50 sm:flex-row sm:items-center md:gap-4 md:p-5"
            >
              <div className="w-full min-w-0 flex-1">
                <div className="mb-1 flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">
                    {action.type === "habitude" && (
                      <Zap className="h-3 w-3 text-emerald-600 min-[350px]:h-4 min-[350px]:w-4" />
                    )}
                    {action.type === "mission" && (
                      <Sword className="h-3 w-3 text-blue-600 min-[350px]:h-4 min-[350px]:w-4" />
                    )}
                    {action.type === "framework" && (
                      <FileText className="h-3 w-3 text-violet-600 min-[350px]:h-4 min-[350px]:w-4" />
                    )}
                  </div>
                  <h4 className="break-words text-sm font-bold leading-tight text-green-900 min-[350px]:text-lg">
                    {action.title}
                  </h4>
                </div>
                {action.description && (
                  <p className="mb-1.5 line-clamp-2 break-words text-xs leading-snug text-green-800/80 min-[350px]:text-sm">
                    {action.description}
                  </p>
                )}
                {action.mantra && (
                  <p className="mt-1 truncate font-serif text-xs text-green-700 italic min-[350px]:text-base">
                    "{action.mantra}"
                  </p>
                )}
              </div>

              {action.type === "framework"
                ? (
                  <button
                    onClick={() => setSelectedFramework(action)}
                    className="flex w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-violet-200 bg-white px-4 py-2 text-xs font-bold text-violet-700 shadow-sm transition-all hover:border-violet-600 hover:bg-violet-600 hover:text-white sm:w-auto min-[350px]:text-sm"
                  >
                    <History className="h-4 w-4" />
                    Journal & Archives
                  </button>
                )
                : (
                  <button
                    onClick={() => handleReactivate(action)}
                    disabled={reactivatingId === action.id}
                    className="flex w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-green-200 bg-white px-4 py-2 text-xs font-bold text-green-700 shadow-sm transition-all hover:border-green-600 hover:bg-green-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto min-[350px]:text-sm"
                  >
                    {reactivatingId === action.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : "Reactiver"}
                  </button>
                )}
            </div>
          ))}
        </div>
      </section>

      {selectedFramework && (
        <FrameworkHistoryModal
          action={selectedFramework}
          onClose={() => setSelectedFramework(null)}
          onReactivate={() => handleReactivate(selectedFramework)}
          isReactivating={reactivatingId === selectedFramework.id}
        />
      )}
    </div>
  );
}

export default function Grimoire() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [transformations, setTransformations] = useState<CompletedTransformation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await fetchCompletedTransformations();
        setTransformations(data);
      } catch (error) {
        console.error("Error loading grimoire:", error);
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, []);

  const selectedTransformation = id
    ? transformations.find((transformation) => transformation.id === id)
    : undefined;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (id && !selectedTransformation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h2 className="mb-2 text-xl font-bold text-slate-900">
            Transformation introuvable
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            Cette archive n'est plus disponible ou n'existe pas.
          </p>
          <button
            onClick={() => navigate("/grimoire")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
          >
            Retour au Grimoire
          </button>
        </div>
      </div>
    );
  }

  if (selectedTransformation) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 pb-24">
        <GrimoireDetail transformation={selectedTransformation} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-24">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
        <button
          onClick={() => navigate("/dashboard")}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Retour au dashboard
        </button>

        <header className="mb-8">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-2xl bg-indigo-100 p-3 text-indigo-700">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">
                Bibliotheque personnelle
              </p>
              <h1 className="text-3xl font-bold text-slate-900">
                Le Grimoire
              </h1>
            </div>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base">
            Retrouve les transformations deja completes, leurs strategies gagnantes,
            et les actions utiles a remettre dans ton plan actif.
          </p>
        </header>

        {transformations.length === 0
          ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <h2 className="mb-2 text-xl font-bold text-slate-900">
                Ton Grimoire est encore vide
              </h2>
              <p className="text-sm text-slate-600">
                Des que tu completes une transformation V2, elle apparaitra ici.
              </p>
            </div>
          )
          : (
            <div className="grid gap-4 md:grid-cols-2">
              {transformations.map((transformation) => (
                <GrimoireCard
                  key={transformation.id}
                  transformation={transformation}
                  onOpen={() => navigate(`/grimoire/${transformation.id}`)}
                />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
