import { useNavigate } from "react-router-dom";
import SEO from "../components/SEO";
import { useOnboardingAmbientAudio } from "../hooks/useOnboardingAmbientAudio";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Heart,
  Leaf,
  MessageCircle,
  Sparkles,
  Sunrise,
} from "lucide-react";

const ProductPlan = () => {
  const navigate = useNavigate();
  const { startSession } = useOnboardingAmbientAudio();
  const seoDescription =
    "Découvre le plan Sophia : un coach IA personnel sur WhatsApp qui transforme ce que tu veux changer en plan clair et t'aide à tenir dans la vraie vie.";

  const handleStartOnboarding = () => {
    startSession();
    navigate("/onboarding-v2");
  };

  return (
    <div className="min-h-screen bg-[#fbf7ef] text-[#17211d] font-sans selection:bg-[#cfe8d7] selection:text-[#17211d]">
      <SEO
        title="Plan d'action IA sur WhatsApp"
        description={seoDescription}
        canonical="https://sophia-coach.ai/le-plan"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Le Plan",
          url: "https://sophia-coach.ai/le-plan",
          description: seoDescription,
          inLanguage: "fr-FR",
        }}
      />

      <nav className="fixed top-0 z-50 w-full border-b border-white/30 bg-[#fffaf1]/78 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <img src="/apple-touch-icon.png" alt="Sophia Logo" className="h-8 w-8 rounded-lg" />
            <span className="text-lg font-bold tracking-tight md:text-xl">Sophia</span>
          </button>
          <div className="flex items-center gap-4 md:gap-8">
            <div className="hidden gap-6 text-sm font-semibold text-[#52635b] md:flex">
              <button className="text-[#002d21]">Le Plan</button>
              <button onClick={() => navigate("/l-architecte")} className="hover:text-[#17211d]">L'Architecte</button>
              <button onClick={() => navigate("/formules")} className="hover:text-[#17211d]">Offres</button>
              <button onClick={() => navigate("/legal")} className="hover:text-[#17211d]">Légal</button>
            </div>
            <button
              onClick={() => navigate("/auth")}
              className="rounded-full bg-[#17211d] px-4 py-2 text-xs font-bold text-white shadow-lg shadow-[#31453b]/18 transition-colors hover:bg-[#002d21] md:px-5 md:py-2.5 md:text-sm"
            >
              Accès Membre
            </button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 text-sm font-semibold text-[#52635b] md:hidden">
          <button className="shrink-0 rounded-full bg-[#e3f1e6] px-4 py-2 text-[#002d21]">Le Plan</button>
          <button onClick={() => navigate("/l-architecte")} className="shrink-0 rounded-full bg-white/52 px-4 py-2">Architecte</button>
          <button onClick={() => navigate("/formules")} className="shrink-0 rounded-full bg-white/52 px-4 py-2">Offres</button>
          <button onClick={() => navigate("/legal")} className="shrink-0 rounded-full bg-white/52 px-4 py-2">Légal</button>
        </div>
      </nav>

      <main className="pt-32 md:pt-36">
        <section className="relative overflow-hidden px-4 pb-20 pt-8 md:px-6 md:pb-28">
          <div className="absolute inset-x-0 top-0 -z-10 h-[560px] bg-[linear-gradient(130deg,#f7d8bb_0%,#e9eedc_34%,#c6e5db_66%,#c5d9f1_100%)] opacity-80" />
          <div className="absolute inset-x-0 top-[400px] -z-10 h-40 bg-gradient-to-b from-transparent to-[#fbf7ef]" />

          <div className="mx-auto max-w-6xl">
            <button
              onClick={() => navigate("/")}
              className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#52635b] transition-colors hover:text-[#002d21]"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour à l'accueil
            </button>

            <div className="grid gap-10 md:grid-cols-[1fr_0.86fr] md:items-center">
              <div>
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/36 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#002d21] shadow-sm backdrop-blur-md">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Le plan qui vit sur WhatsApp
                </div>
                <h1 className="text-5xl font-bold leading-[0.95] tracking-tight md:text-7xl">
                  Un plan clair,
                  <span className="block text-[#002d21]">qui revient vers toi.</span>
                </h1>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-[#405148] md:text-2xl md:leading-10">
                  Sophia transforme ce que tu veux changer en prochaines étapes simples, puis te rejoint sur WhatsApp pour t'aider à garder le fil sans pression inutile.
                </p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={handleStartOnboarding}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#002d21] px-6 py-4 font-bold text-white shadow-2xl shadow-[#002d21]/24 transition-colors hover:bg-[#17211d]"
                  >
                    Créer mon plan gratuit
                    <ArrowRight className="h-5 w-5" />
                  </button>
                  <a
                    href="#comment-ca-marche"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/40 px-6 py-4 font-bold text-[#17211d] shadow-sm backdrop-blur-md transition-colors hover:bg-white/70"
                  >
                    Voir le système
                  </a>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/54 bg-white/38 p-4 shadow-2xl shadow-[#7aa889]/22 backdrop-blur-xl">
                <div className="overflow-hidden rounded-[1.45rem] bg-[#fdf8ef]">
                  <div className="flex items-center gap-3 border-b border-[#e8ddcd] bg-white/72 px-5 py-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#cfe8d7] font-bold text-[#002d21]">S</div>
                    <div>
                      <div className="font-bold">Sophia</div>
                      <div className="text-xs text-[#6f8178]">présente quand il faut</div>
                    </div>
                  </div>
                  <div className="space-y-4 p-5 text-sm text-[#24332d]">
                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      Aujourd'hui, on garde le cap avec 3 actions simples. Tu n'as pas besoin de tout porter en même temps.
                    </div>
                    <div className="ml-auto max-w-[82%] rounded-2xl bg-[#d1ded4] p-4 shadow-sm">
                      Je suis fatigué, mais je veux continuer.
                    </div>
                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      Alors on baisse l'intensité, pas l'engagement. On garde le fil.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="comment-ca-marche" className="px-4 py-20 md:px-6 md:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3f1e6] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#002d21]">
                <Sparkles className="h-4 w-4" />
                Comment ça marche
              </div>
              <h2 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">
                Une méthode simple : clarifier, revenir, ajuster.
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              {[
                {
                  icon: Sunrise,
                  title: "Tu poses ton intention",
                  copy: "Sophia t'aide à transformer ce que tu veux changer en chemin clair et soutenable.",
                },
                {
                  icon: MessageCircle,
                  title: "Elle revient sur WhatsApp",
                  copy: "Le plan ne reste pas dans un espace oublié. Sophia te rejoint là où tu réponds déjà.",
                },
                {
                  icon: Heart,
                  title: "Elle ajuste avec douceur",
                  copy: "Fatigue, imprévus, décrochage : on adapte le rythme sans abandonner la direction.",
                },
                {
                  icon: BookOpen,
                  title: "Elle apprend ton rythme",
                  copy: "Sophia retient ce qui t'aide, ce qui bloque et ce qui te remet en mouvement.",
                },
              ].map(({ icon: Icon, title, copy }) => (
                <article key={title} className="rounded-3xl border border-[#eadfce] bg-white/62 p-6 shadow-sm backdrop-blur">
                  <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#e3f1e6] text-[#002d21]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#52635b]">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f4eee4] px-4 py-20 md:px-6 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
            {[
              ["Moins de friction", "Pas une app de plus à ouvrir. Sophia vient vers toi sur WhatsApp."],
              ["Moins de culpabilité", "Une journée imparfaite devient un ajustement, pas un abandon."],
              ["Plus de continuité", "Tu ne repars pas de zéro : Sophia garde le contexte avec toi."],
            ].map(([title, copy]) => (
              <div key={title} className="rounded-3xl bg-[#fffaf1] p-8 shadow-sm">
                <CheckCircle2 className="mb-5 h-6 w-6 text-[#002d21]" />
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="mt-3 leading-7 text-[#52635b]">{copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 py-20 text-center md:px-6 md:py-28">
          <h2 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Un plan qui reste vivant quand la semaine bouge.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#52635b]">
            Commence par clarifier ton changement. Sophia s'occupe de t'aider à garder le lien dans la vraie vie.
          </p>
          <button
            onClick={handleStartOnboarding}
            className="mt-9 inline-flex items-center justify-center gap-3 rounded-full bg-[#17211d] px-8 py-4 text-lg font-bold text-white shadow-2xl shadow-[#7f917f]/24 transition-colors hover:bg-[#002d21]"
          >
            Créer mon plan gratuit
            <ArrowRight className="h-5 w-5" />
          </button>
        </section>
      </main>
    </div>
  );
};

export default ProductPlan;
