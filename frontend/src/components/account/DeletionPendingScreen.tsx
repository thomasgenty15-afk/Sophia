import { useState } from "react";
import { CalendarClock, LogOut, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { newRequestId, requestHeaders } from "../../lib/requestId";

function formatFrenchDate(iso: string | null): string {
  if (!iso) return "dans 7 jours";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "dans 7 jours";
  }
}

/**
 * Full-screen gate shown when the signed-in account is deletion_pending:
 * the only actions offered are restoring the account or signing out.
 */
export default function DeletionPendingScreen() {
  const { purgeAt, refreshAccountStatus, signOut } = useAuth();
  const navigate = useNavigate();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    try {
      const reqId = newRequestId();
      const { data, error: fnError } = await supabase.functions.invoke("account-restore-v1", {
        body: {},
        headers: requestHeaders(reqId),
      });
      if (fnError) throw fnError;
      if (!(data as { ok?: boolean } | null)?.ok) {
        throw new Error("La restauration a échoué. Réessaie ou contacte sophia@sophia-coach.ai.");
      }
      await refreshAccountStatus();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "La restauration a échoué. Réessaie ou contacte sophia@sophia-coach.ai.",
      );
    } finally {
      setRestoring(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-8 text-stone-950 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-xl items-center">
        <section className="w-full rounded-[28px] border border-stone-200 bg-white p-8 shadow-[0_28px_90px_-48px_rgba(31,41,55,0.55)] sm:p-10">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100">
            <CalendarClock className="h-6 w-6 text-stone-700" />
          </div>

          <h1 className="mt-6 text-2xl font-semibold leading-tight sm:text-3xl">
            Ton compte est en cours de suppression
          </h1>
          <p className="mt-4 text-sm leading-6 text-stone-600">
            Toutes tes données seront <strong>définitivement supprimées le {formatFrenchDate(purgeAt)}</strong>.
            Jusqu'à cette date, tu peux restaurer ton compte en un clic : tout sera remis en place
            (plans, conversations, souvenirs, rappels WhatsApp).
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Si tu avais un abonnement, il a été résilié et ne sera pas réactivé automatiquement :
            tu pourras en souscrire un nouveau depuis la page Abonnement.
          </p>

          {error && (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-600">
              {error}
            </div>
          )}

          <div className="mt-8 grid gap-3">
            <button
              type="button"
              onClick={handleRestore}
              disabled={restoring}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" />
              {restoring ? "Restauration en cours..." : "Restaurer mon compte"}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
            >
              <LogOut className="h-4 w-4" />
              Me déconnecter
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
