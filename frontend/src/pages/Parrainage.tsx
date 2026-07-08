import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  Gift,
  Loader2,
  Share2,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import {
  buildReferralShareMessage,
  buildReferralShareUrl,
} from "../lib/referral";

type ReferralStats = {
  invited: number;
  onTrial: number;
  subscribed: number;
  monthsEarned: number;
  monthsBanked: number;
};

const EMPTY_STATS: ReferralStats = {
  invited: 0,
  onTrial: 0,
  subscribed: 0,
  monthsEarned: 0,
  monthsBanked: 0,
};

const Parrainage = () => {
  const navigate = useNavigate();
  const { user, accessTier } = useAuth();
  const { show } = useToast();

  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isPayingCustomer = accessTier === "system" ||
    accessTier === "alliance" || accessTier === "architecte";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [codeRes, referralsRes, rewardsRes] = await Promise.all([
          supabase.rpc("get_or_create_referral_code"),
          // Colonnes explicites : la table n'expose que ces colonnes aux
          // utilisateurs (grants par colonne côté DB).
          supabase.from("referrals").select("id, status"),
          supabase.from("referral_rewards").select("id, months, status"),
        ]);

        if (codeRes.error) throw codeRes.error;
        if (referralsRes.error) throw referralsRes.error;
        if (rewardsRes.error) throw rewardsRes.error;

        const referrals =
          (referralsRes.data ?? []) as Array<{ status: string }>;
        const rewards =
          (rewardsRes.data ?? []) as Array<{ months: number; status: string }>;

        const next: ReferralStats = {
          invited: referrals.length,
          onTrial: referrals.filter((r) =>
            r.status === "pending" || r.status === "trial_started"
          ).length,
          subscribed: referrals.filter((r) =>
            r.status === "converted" || r.status === "rewarded"
          ).length,
          monthsEarned: rewards
            .filter((r) => r.status === "banked" || r.status === "credited")
            .reduce((sum, r) => sum + (Number(r.months) || 0), 0),
          monthsBanked: rewards
            .filter((r) => r.status === "banked")
            .reduce((sum, r) => sum + (Number(r.months) || 0), 0),
        };

        if (!cancelled) {
          setCode(String(codeRes.data ?? ""));
          setStats(next);
        }
      } catch (err) {
        console.error("Chargement du parrainage impossible:", err);
        if (!cancelled) {
          setError(
            "Impossible de charger ton espace parrainage pour le moment. Réessaie dans quelques instants.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleCopyLink = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard?.writeText(buildReferralShareUrl(code));
      show("Lien copié", { icon: <Check className="h-4 w-4 text-[#002d21]" /> });
    } catch {
      show("Copie impossible — ton code : " + code);
    }
  }, [code, show]);

  const handleCopyCode = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard?.writeText(code);
      show("Code copié", { icon: <Check className="h-4 w-4 text-[#002d21]" /> });
    } catch {
      // le code reste affiché à l'écran
    }
  }, [code, show]);

  const handleShare = useCallback(async () => {
    if (!code) return;
    const message = buildReferralShareMessage(code);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: message });
        return;
      } catch {
        // partage annulé par l'utilisateur : ne rien faire
        return;
      }
    }
    try {
      await navigator.clipboard?.writeText(message);
      show("Message copié — colle-le dans WhatsApp", {
        icon: <Check className="h-4 w-4 text-[#002d21]" />,
      });
    } catch {
      // fallback silencieux : le lien reste copiable via l'autre bouton
    }
  }, [code, show]);

  const statCards = [
    { label: "Invités", value: stats.invited },
    { label: "En essai", value: stats.onTrial },
    { label: "Abonnés", value: stats.subscribed },
    { label: "Mois gagnés", value: stats.monthsEarned },
  ];

  return (
    <div className="min-h-screen bg-[#fbf7ef] text-[#17211d] font-sans selection:bg-[#cfe8d7] selection:text-[#17211d]">
      <nav className="sticky top-0 z-50 border-b border-white/30 bg-[#fffaf1]/78 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 md:px-6">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-sm font-semibold text-[#52635b] transition-colors hover:text-[#17211d]"
          >
            <ArrowLeft className="h-4 w-4" />
            Tableau de bord
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/apple-touch-icon.png"
              alt="Sophia"
              className="h-8 w-8 rounded-lg"
            />
            <span className="text-lg font-bold tracking-tight">Sophia</span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
        <div className="mb-8 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/36 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#002d21] shadow-sm backdrop-blur-md">
            <Gift className="h-3.5 w-3.5" />
            Parrainage
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Partage Sophia autour de toi
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#405148] md:text-lg">
            Ton ami·e reçoit 30 jours d'essai au lieu de 14. Quand il ou elle
            s'abonne, tu reçois 1 mois offert. C'est tout, et c'est déjà bien.
          </p>
        </div>

        {error ? (
          <div className="mb-6 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        {/* Le code + actions */}
        <section className="rounded-[2rem] border border-[#eadfce] bg-white/72 p-7 shadow-sm backdrop-blur md:p-10">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-10 text-[#52635b]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm font-semibold">
                Préparation de ton code…
              </span>
            </div>
          ) : code ? (
            <>
              <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-[#52635b]">
                Ton code
              </p>
              <button
                type="button"
                onClick={handleCopyCode}
                title="Copier le code"
                className="mx-auto mt-3 block w-full rounded-2xl border border-dashed border-[#b8d8cc] bg-[#f3f8f1] px-4 py-5 text-center font-mono text-3xl font-bold tracking-[0.14em] text-[#002d21] transition-colors hover:bg-[#e3f1e6] md:text-4xl"
              >
                {code}
              </button>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleShare}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#17211d] px-5 py-4 font-bold text-white transition-colors hover:bg-[#002d21]"
                >
                  <Share2 className="h-4 w-4" />
                  Partager
                </button>
                <button
                  onClick={handleCopyLink}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[#d7cbb9] bg-white/70 px-5 py-4 font-bold text-[#17211d] transition-colors hover:bg-[#e3f1e6]"
                >
                  <Copy className="h-4 w-4" />
                  Copier le lien
                </button>
              </div>
            </>
          ) : null}
        </section>

        {/* Mois banqués : visibles uniquement si le parrain n'est pas encore abonné */}
        {!loading && stats.monthsBanked > 0 && !isPayingCustomer ? (
          <section className="mt-6 rounded-3xl border border-[#b8d8cc] bg-[#e3f1e6] px-6 py-5">
            <p className="text-sm font-bold text-[#002d21]">
              Tu as déjà {stats.monthsBanked}{" "}
              {stats.monthsBanked > 1 ? "mois offerts" : "mois offert"}{" "}
              qui t'attendent.
            </p>
            <p className="mt-1 text-sm leading-6 text-[#405148]">
              Ils seront appliqués automatiquement sur tes premières factures
              dès que tu t'abonnes. Rien à faire de ton côté.
            </p>
          </section>
        ) : null}

        {/* Stats */}
        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="rounded-3xl border border-[#eadfce] bg-white/66 px-4 py-5 text-center shadow-sm backdrop-blur"
            >
              <p className="text-3xl font-bold text-[#002d21]">
                {loading ? "—" : stat.value}
              </p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-[#52635b]">
                {stat.label}
              </p>
            </div>
          ))}
        </section>

        {/* Les règles, sans petites lignes cachées */}
        <section className="mt-6 rounded-[2rem] border border-[#eadfce] bg-white/66 p-7 shadow-sm backdrop-blur">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-full bg-[#e3f1e6] p-2.5 text-[#002d21]">
              <Users className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold">Comment ça marche</h2>
          </div>
          <ul className="space-y-3 text-sm leading-6 text-[#405148]">
            <li className="flex gap-3">
              <Check className="mt-1 h-4 w-4 shrink-0 text-[#002d21]" />
              <span>
                Ton ami·e s'inscrit avec ton lien ou ton code : son essai
                gratuit passe de 14 à 30 jours.
              </span>
            </li>
            <li className="flex gap-3">
              <Check className="mt-1 h-4 w-4 shrink-0 text-[#002d21]" />
              <span>
                Quand il ou elle paie son premier mois, tu reçois 1 mois offert,
                déduit de tes prochaines factures. Si tu es encore en essai, ce
                mois est mis de côté et appliqué dès que tu t'abonnes.
              </span>
            </li>
            <li className="flex gap-3">
              <Check className="mt-1 h-4 w-4 shrink-0 text-[#002d21]" />
              <span>
                Le plafond est de 12 mois offerts par période de 12 mois. Les
                détails sont dans les{" "}
                <button
                  onClick={() => navigate("/legal#parrainage")}
                  className="font-semibold text-[#002d21] underline underline-offset-2 hover:text-[#17211d]"
                >
                  conditions du programme
                </button>
                .
              </span>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
};

export default Parrainage;
