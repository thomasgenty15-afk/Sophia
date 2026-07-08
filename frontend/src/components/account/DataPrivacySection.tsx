import { useState } from "react";
import {
  AlertTriangle,
  Download,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { newRequestId, requestHeaders } from "../../lib/requestId";

type Props = {
  isArchitect: boolean;
};

type InvokeOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; code: string | null; message: string };

// supabase.functions.invoke wraps non-2xx in FunctionsHttpError with the raw
// Response in error.context — unwrap it to map backend error codes to French.
async function invokeFn<T>(name: string, body: Record<string, unknown>): Promise<InvokeOutcome<T>> {
  const reqId = newRequestId();
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: requestHeaders(reqId),
  });
  if (!error) return { ok: true, data: data as T };
  let status: number | null = null;
  let code: string | null = null;
  const ctx = (error as { context?: Response }).context;
  if (ctx instanceof Response) {
    status = ctx.status;
    try {
      const payload = await ctx.clone().json();
      code = typeof payload?.error === "string" ? payload.error : null;
    } catch {
      // non-JSON body
    }
  }
  return {
    ok: false,
    status,
    code,
    message: error instanceof Error ? error.message : String(error),
  };
}

function frenchExportError(outcome: { status: number | null; code: string | null }): string {
  if (outcome.code === "invalid_password") return "Mot de passe incorrect.";
  if (outcome.status === 429) {
    return "Tu as déjà demandé un export récemment (limite : 1 export par 24 h). Réessaie plus tard.";
  }
  return "L'export a échoué. Réessaie dans quelques minutes ou écris à sophia@sophia-coach.ai.";
}

const CONFIRMATION_WORD = "SUPPRIMER";

type DeleteStep = "export" | "explain" | "confirm" | "done";

export default function DataPrivacySection({ isArchitect }: Props) {
  const navigate = useNavigate();

  // --- Export ---
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  // --- Deletion modal ---
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("export");
  const [deletePassword, setDeletePassword] = useState("");
  const [typedWord, setTypedWord] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [purgeDate, setPurgeDate] = useState<string | null>(null);
  const [hadSubscription, setHadSubscription] = useState(false);

  const cardClass = `p-4 rounded-xl border mb-4 ${
    isArchitect ? "bg-emerald-900/30 border-emerald-800" : "bg-slate-50 border-slate-200"
  }`;
  const labelClass = `block text-xs font-medium mb-1.5 ${
    isArchitect ? "text-emerald-400" : "text-slate-500"
  }`;
  const inputClass = `w-full p-3 rounded-lg text-sm outline-none border transition-all ${
    isArchitect
      ? "bg-emerald-900/50 border-emerald-800 text-white focus:border-emerald-500 placeholder-emerald-700"
      : "bg-white border-slate-200 text-slate-900 focus:border-blue-500 placeholder-slate-400"
  }`;
  const primaryBtn = `px-3 py-2 rounded-lg text-xs font-bold ${
    isArchitect ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-slate-900 hover:bg-slate-800 text-white"
  }`;
  const mutedText = isArchitect ? "text-emerald-500/80" : "text-slate-500";
  const errorBox = `text-xs rounded-lg p-3 border ${
    isArchitect ? "border-red-900/50 text-red-300 bg-red-950/30" : "border-red-100 text-red-600 bg-red-50"
  }`;

  const handleExport = async () => {
    setExportLoading(true);
    setExportError(null);
    setExportUrl(null);
    try {
      const outcome = await invokeFn<{ ok: boolean; url: string }>("account-export-v1", {
        password: exportPassword,
      });
      if (!outcome.ok) {
        setExportError(frenchExportError(outcome));
        return;
      }
      setExportUrl(outcome.data.url);
      setExportPassword("");
    } finally {
      setExportLoading(false);
    }
  };

  const openDeleteModal = () => {
    setDeleteStep("export");
    setDeletePassword("");
    setTypedWord("");
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const prepare = await invokeFn<{
        ok: boolean;
        token: unknown;
        purge_at_preview: string;
        has_active_subscription: boolean;
      }>("account-deletion-v1", { action: "prepare", password: deletePassword });
      if (!prepare.ok) {
        if (prepare.code === "invalid_password") {
          setDeleteError("Mot de passe incorrect.");
        } else if (prepare.status === 429) {
          setDeleteError("Trop de tentatives. Réessaie dans une heure.");
        } else {
          setDeleteError("La demande a échoué. Réessaie ou écris à sophia@sophia-coach.ai.");
        }
        return;
      }
      setHadSubscription(prepare.data.has_active_subscription);

      const confirm = await invokeFn<{ ok: boolean; purge_at: string }>("account-deletion-v1", {
        action: "confirm",
        token: prepare.data.token,
        typed_confirmation: typedWord.trim(),
      });
      if (!confirm.ok) {
        if (confirm.code === "confirmation_word_mismatch") {
          setDeleteError(`Tape exactement « ${CONFIRMATION_WORD} » pour confirmer.`);
        } else if (confirm.code === "subscription_cancel_failed") {
          setDeleteError(
            "Impossible de résilier ton abonnement pour le moment. Rien n'a été supprimé — réessaie dans quelques minutes.",
          );
        } else {
          setDeleteError("La suppression a échoué. Rien n'a été supprimé — réessaie.");
        }
        return;
      }
      setPurgeDate(confirm.data.purge_at);
      setDeleteStep("done");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAfterDeletion = async () => {
    // Sessions are already revoked server-side; clear the local one and leave.
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // ignore
    }
    setDeleteOpen(false);
    navigate("/", { replace: true });
    window.location.reload();
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "dans 7 jours";
    try {
      return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })
        .format(new Date(iso));
    } catch {
      return "dans 7 jours";
    }
  };

  return (
    <>
      <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 mt-8 ${
        isArchitect ? "text-emerald-600" : "text-slate-400"
      }`}>
        Mes données
      </h3>

      {/* --- Export RGPD --- */}
      <div className={cardClass}>
        <div className="flex items-center gap-3 mb-2">
          <Download className={`w-4 h-4 ${isArchitect ? "text-emerald-400" : "text-slate-400"}`} />
          <span className="text-sm font-medium">Exporter mes données</span>
        </div>
        <p className={`text-[11px] leading-snug mb-3 ${mutedText}`}>
          Télécharge une copie de tes données (profil, plans, conversations, souvenirs) au format
          JSON dans une archive ZIP. Limite : 1 export par 24 h.
        </p>

        {!exportOpen ? (
          <button type="button" onClick={() => setExportOpen(true)} className={primaryBtn}>
            Préparer mon export
          </button>
        ) : (
          <div className="space-y-2">
            <label className={labelClass}>
              Confirme ton mot de passe pour continuer
            </label>
            <input
              type="password"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              className={inputClass}
              placeholder="Ton mot de passe"
              autoComplete="current-password"
            />
            {exportError && <div className={errorBox}>{exportError}</div>}
            {exportUrl ? (
              <a
                href={exportUrl}
                className={`block text-center w-full py-3 rounded-lg font-bold text-sm ${
                  isArchitect ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-emerald-700 hover:bg-emerald-600 text-white"
                }`}
                download
              >
                Télécharger l'archive (lien valable 15 minutes)
              </a>
            ) : (
              <button
                type="button"
                onClick={handleExport}
                disabled={exportLoading || !exportPassword}
                className={`w-full py-3 rounded-lg font-bold text-sm disabled:opacity-60 ${
                  isArchitect ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-slate-900 hover:bg-slate-800 text-white"
                }`}
              >
                {exportLoading ? "Préparation de l'archive..." : "Générer mon export"}
              </button>
            )}
            <p className={`text-[11px] leading-snug ${mutedText}`}>
              Par sécurité, une notification est envoyée sur WhatsApp et par email à chaque demande
              d'export. Le fichier contient des données personnelles sensibles : conserve-le en lieu
              sûr.
            </p>
          </div>
        )}
      </div>

      {/* --- Suppression du compte --- */}
      <button
        onClick={openDeleteModal}
        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all mb-4 ${
          isArchitect
            ? "border-red-900/50 text-red-400 hover:bg-red-950/30"
            : "border-red-100 text-red-600 hover:bg-red-50"
        }`}
      >
        <span className="font-bold text-sm flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Supprimer mon compte
        </span>
      </button>

      {/* --- Modal de suppression (3 étapes, sans rétention) --- */}
      {deleteOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !deleteLoading && deleteStep !== "done" && setDeleteOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h4 className="font-bold text-sm flex items-center gap-2">
                {deleteStep === "done" ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-600" /> C'est fait
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 text-red-600" /> Supprimer mon compte
                  </>
                )}
              </h4>
              {deleteStep !== "done" && (
                <button
                  onClick={() => setDeleteOpen(false)}
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-500"
                  disabled={deleteLoading}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="p-5 overflow-y-auto text-sm leading-6 text-slate-700">
              {deleteStep === "export" && (
                <>
                  <p>
                    Avant de partir, tu peux télécharger une copie de tes données (profil, plans,
                    conversations, souvenirs). C'est optionnel — et possible uniquement tant que ton
                    compte existe.
                  </p>
                  <div className="mt-5 grid gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteOpen(false);
                        setExportOpen(true);
                      }}
                      className="w-full py-3 rounded-lg font-bold text-sm border border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      Télécharger mes données d'abord
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteStep("explain")}
                      className="w-full py-3 rounded-lg font-bold text-sm bg-slate-900 hover:bg-slate-800 text-white"
                    >
                      Continuer
                    </button>
                  </div>
                </>
              )}

              {deleteStep === "explain" && (
                <>
                  <p className="font-semibold text-slate-900">Voici ce qui va se passer :</p>
                  <ul className="mt-3 space-y-2 list-disc pl-5">
                    <li>Ton accès à l'app est coupé immédiatement.</li>
                    <li>Sophia arrête tout de suite de t'écrire sur WhatsApp.</li>
                    <li>
                      Ton abonnement est résilié immédiatement, sans nouveau prélèvement. La période
                      déjà payée n'est pas remboursée au prorata.
                    </li>
                    <li>
                      <strong>Toutes tes données sont définitivement supprimées dans 7 jours.</strong>{" "}
                      Cette suppression est irréversible.
                    </li>
                    <li>
                      Tu peux changer d'avis : reconnecte-toi avant cette date et ton compte sera
                      restauré en un clic (l'abonnement, lui, ne sera pas réactivé automatiquement).
                    </li>
                  </ul>
                  <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Ce qui est conservé
                    </p>
                    <p className="mt-1">
                      Les factures liées à tes paiements (obligation légale de conservation
                      comptable) et une trace minimale anonymisée de la suppression (empreintes
                      chiffrées de ton email et de ton téléphone, avec la date) comme preuve de
                      conformité. Rien d'autre.
                    </p>
                  </div>
                  <div className="mt-5 grid gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteStep("confirm")}
                      className="w-full py-3 rounded-lg font-bold text-sm bg-red-600 hover:bg-red-500 text-white"
                    >
                      J'ai compris, continuer
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteOpen(false)}
                      className="w-full py-3 rounded-lg font-bold text-sm border border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      Annuler
                    </button>
                  </div>
                </>
              )}

              {deleteStep === "confirm" && (
                <>
                  <p>
                    Dernière étape. Confirme ton mot de passe puis tape{" "}
                    <strong>{CONFIRMATION_WORD}</strong> pour supprimer ton compte.
                  </p>
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5 text-slate-500">
                        Mot de passe
                      </label>
                      <input
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        className="w-full p-3 rounded-lg text-sm outline-none border border-slate-200 focus:border-blue-500"
                        autoComplete="current-password"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5 text-slate-500">
                        Tape « {CONFIRMATION_WORD} »
                      </label>
                      <input
                        type="text"
                        value={typedWord}
                        onChange={(e) => setTypedWord(e.target.value)}
                        className="w-full p-3 rounded-lg text-sm outline-none border border-slate-200 focus:border-blue-500"
                        placeholder={CONFIRMATION_WORD}
                      />
                    </div>
                    {deleteError && (
                      <div className="text-xs rounded-lg p-3 border border-red-100 text-red-600 bg-red-50">
                        {deleteError}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleDeleteConfirm}
                      disabled={
                        deleteLoading ||
                        !deletePassword ||
                        typedWord.trim() !== CONFIRMATION_WORD
                      }
                      className="w-full py-3 rounded-lg font-bold text-sm bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
                    >
                      {deleteLoading ? "Suppression en cours..." : "Supprimer définitivement mon compte"}
                    </button>
                  </div>
                </>
              )}

              {deleteStep === "done" && (
                <>
                  <p>
                    Ton compte est désactivé. Toutes tes données seront{" "}
                    <strong>définitivement supprimées le {formatDate(purgeDate)}</strong>.
                  </p>
                  <p className="mt-3">
                    Si tu changes d'avis, reconnecte-toi avant cette date : ton compte sera restauré
                    en un clic.
                    {hadSubscription
                      ? " Ton abonnement a été résilié et ne sera pas réactivé automatiquement."
                      : ""}
                  </p>
                  <p className="mt-3">Merci d'avoir fait un bout de chemin avec Sophia. Prends soin de toi.</p>
                  <button
                    type="button"
                    onClick={handleAfterDeletion}
                    className="mt-5 w-full py-3 rounded-lg font-bold text-sm bg-slate-900 hover:bg-slate-800 text-white"
                  >
                    Fermer
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
