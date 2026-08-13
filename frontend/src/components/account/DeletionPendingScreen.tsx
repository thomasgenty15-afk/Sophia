import { useState } from "react";
import { CalendarClock, LogOut, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { newRequestId, requestHeaders } from "../../lib/requestId";
import { formatDateLong } from "../../keel/i18n/format";
// LE KIT. Cet écran n'importait aucune primitive: ses deux boutons étaient
// recopiés à la main (`bg-stone-950`, `rounded-2xl`), donc hors du registre de
// ce à quoi ressemble un bouton dans ce produit.
import { Button } from "../../keel/components/ui/Button";

/**
 * ⚠️ LEGACY. Le NOM disait déjà le défaut — « frenchDate » sur un écran dont
 * toutes les phrases sont anglaises. Seul le formatage est repris ici; le
 * texte de ce reliquat n'est pas dans ce lot.
 */
function formatDeletionDate(iso: string | null): string {
  if (!iso) return "in 7 days";
  return formatDateLong(iso) || "in 7 days";
}

/**
 * Full-screen gate shown when the signed-in account is deletion_pending:
 * the only actions offered are restoring the account or signing out.
 *
 * ── LA CHARTE, LE 2026-08-13 ─────────────────────────────────────────────
 * Cet écran était le SEUL du produit connecté à ne pas être en `gray-*`: il
 * portait un fond `#f7f6f2` écrit en dur, une famille `stone-*`, un rayon
 * `rounded-[28px]` et une ombre de 90 px. C'est pour ça que l'audit du chantier
 * l'a compté à zéro — il ne cherchait que `gray-*`. Onze neutres et quatre
 * rayons sont passés aux jetons de « la fiche » (`paper` · `paper-2` · `ink` ·
 * `ink-soft` · `line` · `rounded-fiche` · `rounded-card`), et les deux boutons
 * recopiés à la main sont ceux du kit.
 *
 * ⚠️ IL EST HORS DU SHELL, et c'est ce qui explique qu'il se soit habillé seul:
 * `RouteGuards` le rend à la place de l'application. Il porte donc son propre
 * `min-h-screen bg-paper` et son propre `h1` — le seul de la vue.
 * Autorité: `docs/keel/CHARTE-VITRINE.md`.
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
        throw new Error("The restore failed. Try again, or contact sophia@sophia-coach.ai.");
      }
      await refreshAccountStatus();
      // `/` plutôt que `/dashboard`, supprimée: la landing route le compte
      // restauré vers son espace réel au lieu d'une route morte.
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "The restore failed. Try again, or contact sophia@sophia-coach.ai.",
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
    <main className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-xl items-center">
        {/* LA FICHE. `rounded-fiche` (16px) est le rayon d'une SURFACE ENTIÈRE,
            et `paper-2` sur `paper` fermé par un trait `line` est l'idiome que
            `/auth` et `/start` emploient déjà — une carte se lit par son trait,
            pas par un aplat plus clair que la page (la charte ne nomme aucun
            neutre au-dessus de `paper`). L'ombre de 90 px part avec: une fiche
            technique est tracée, elle ne flotte pas.
            `p-6` à 320 px et non `p-8`: 32 px de marge de chaque côté ne
            laissaient que 256 px de mesure sur un téléphone. */}
        <section className="w-full rounded-fiche border border-line bg-paper-2 p-6 sm:p-8">
          {/* LA BOÎTE TRACÉE, et pas un aplat: `line-strong` (3,84:1) est la
              bordure de contrôle de la charte, la seule qui se lise à la fois
              sur `paper` et sur `paper-2`. */}
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-card border border-line-strong bg-paper">
            <CalendarClock className="h-6 w-6 text-ink-soft" />
          </div>

          {/* ⛔ PAS DE GRAISSE SUR LE DISPLAY. Young Serif n'a qu'un poids: le
              navigateur simulerait le gras en épaississant les contours.
              `text-title` va de 1,7rem (27,2 px à 320) à 2,7rem — toujours
              au-dessus du plancher de 20 px sous lequel la display ne descend
              jamais. C'est le même cran que le `h1` de `/auth` et de
              `ui/Page.PageHeader`. */}
          <h1 className="mt-6 text-balance font-display text-title text-ink">
            Your account is being deleted
          </h1>
          <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-ink-soft">
            All your data will be <strong>permanently deleted on {formatDeletionDate(purgeAt)}</strong>.
            Until then, you can restore your account in one click: everything is put back
            (plans, conversations, souvenirs, rappels).
          </p>
          <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-ink-soft">
            If you had a subscription, it has been cancelled and will not be reactivated
            automatically: you can take out a new one from the Subscription page.
          </p>

          {/* ⛔ ROUGE = ÉCHEC, ET C'EST UN FAIT: il reste. Seules les valeurs
              montent à celles du kit — `red-200` en bordure, `red-700` sur
              `paper` = 6,13:1 (`red-600` était à 4,4:1), et `text-sm` parce que
              12 px n'est dans aucun cran de l'échelle. */}
          {error && (
            <div className="mt-4 rounded-card border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
              {error}
            </div>
          )}

          <div className="mt-8 grid gap-3">
            {/* L'ACTION MARQUÉE DE CETTE VUE, ET LA SEULE. Restaurer est
                exactement ce que cet écran existe pour offrir; se déconnecter est
                la sortie. `min-h-11` (44 px) garde la cible tactile confortable
                de l'original — le `md` du kit est à ~36 px — sans toucher au
                `py-*` de la primitive, qui perdrait contre lui. */}
            <Button
              variant="primary"
              onClick={handleRestore}
              disabled={restoring}
              className="min-h-11 w-full"
            >
              <RotateCcw className="h-4 w-4 shrink-0" />
              {restoring ? "Restoring…" : "Restore my account"}
            </Button>
            {/* ⚠️ « Sign out » N'EST PAS ROUGE, et `UserProfile` a tranché la
                même chose au même moment: se déconnecter ne détruit rien et se
                défait en se reconnectant. Ici le rouge est déjà pris par la
                seule chose irréversible de l'écran — la date de purge. */}
            <Button
              variant="secondary"
              onClick={handleSignOut}
              className="min-h-11 w-full"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
