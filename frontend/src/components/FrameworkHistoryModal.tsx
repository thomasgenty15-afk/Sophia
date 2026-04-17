import React, { useState } from "react";
import {
  X,
  Calendar,
  Plus,
  ChevronDown,
  ChevronUp,
  Loader2,
  History,
} from "lucide-react";
import type { Action } from "../types/grimoire";

interface FrameworkHistoryModalProps {
  action: Action;
  onClose: () => void;
  onReactivate: () => Promise<void> | void;
  isReactivating?: boolean;
}

function entryKindLabel(kind: string) {
  switch (kind) {
    case "checkin":
      return "Check-in";
    case "progress":
      return "Progression";
    case "partial":
      return "Partiel";
    case "blocker":
      return "Blocage";
    case "support_feedback":
      return "Retour de support";
    case "skip":
      return "Ignore";
    default:
      return kind;
  }
}

const FrameworkHistoryModal: React.FC<FrameworkHistoryModalProps> = ({
  action,
  onClose,
  onReactivate,
  isReactivating = false,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateStr));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-fade-in-up">
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 bg-slate-50 p-4 md:p-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="rounded-lg bg-violet-100 p-1.5 text-violet-700">
                <History className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Historique & Archives
              </span>
            </div>
            <h3 className="text-lg font-bold leading-tight text-slate-900 md:text-xl">
              {action.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 transition-colors hover:bg-slate-200"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
          {action.history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
              <p className="mb-2 text-slate-500">
                Aucune trace d'usage trouvee pour cet outil.
              </p>
              <p className="text-xs text-slate-400">
                Tu peux quand meme le reintroduire dans ton plan actif.
              </p>
            </div>
          ) : (
            action.history.map((entry) => (
              <div
                key={entry.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md"
              >
                <div
                  onClick={() => toggleExpand(entry.id)}
                  className="flex cursor-pointer items-center justify-between bg-slate-50/50 p-4 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-indigo-400" />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">
                        {formatDate(entry.effectiveAt)}
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {entryKindLabel(entry.entryKind)}
                      </span>
                    </div>
                  </div>
                  {expandedId === entry.id
                    ? <ChevronUp className="h-4 w-4 text-slate-400" />
                    : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>

                {expandedId === entry.id && (
                  <div className="border-t border-slate-100 bg-white p-4">
                    <div className="space-y-4">
                      <div>
                        <h5 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                          Outcome
                        </h5>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                          {entry.outcome || "Sans detail"}
                        </p>
                      </div>

                      {entry.valueText && (
                        <div>
                          <h5 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                            Note
                          </h5>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                            {entry.valueText}
                          </p>
                        </div>
                      )}

                      {typeof entry.valueNumeric === "number" && (
                        <div>
                          <h5 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                            Valeur
                          </h5>
                          <p className="text-sm text-slate-800">{entry.valueNumeric}</p>
                        </div>
                      )}

                      {entry.blockerHint && (
                        <div>
                          <h5 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                            Blocage
                          </h5>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                            {entry.blockerHint}
                          </p>
                        </div>
                      )}

                      {entry.difficultyLevel && (
                        <div>
                          <h5 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                            Difficulte
                          </h5>
                          <p className="text-sm text-slate-800">{entry.difficultyLevel}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white p-4">
          <button
            onClick={onReactivate}
            disabled={isReactivating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isReactivating
              ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Reactivation...
                </>
              )
              : (
                <>
                  <Plus className="h-5 w-5" />
                  Reactiver dans mon plan actif
                </>
              )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FrameworkHistoryModal;
