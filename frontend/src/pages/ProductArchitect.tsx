import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SEO from "../components/SEO";
import { useOnboardingAmbientAudio } from "../hooks/useOnboardingAmbientAudio";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Compass,
  Gem,
  Hammer,
  Heart,
  Layers3,
  Leaf,
  Lightbulb,
  Map,
  MessageCircle,
  Moon,
  PenLine,
  Quote,
  Shield,
  Sparkles,
} from "lucide-react";

const identityChapters = [
  {
    label: "Déconstruction",
    copy: "Identifier les croyances, peurs et vieux récits qui te gardent bloqué.",
  },
  {
    label: "Sacrifice",
    copy: "Clarifier le prix du changement et ce que tu dois arrêter de négocier.",
  },
  {
    label: "Système nerveux",
    copy: "Comprendre tes états internes pour avancer sans te crisper ni fuir.",
  },
  {
    label: "Incarnation",
    copy: "Aligner ton corps, ta parole, ta présence et la personne que tu veux devenir.",
  },
  {
    label: "Mission",
    copy: "Mettre des mots sur ta direction, ton rôle et ce qui donne du sens.",
  },
  {
    label: "Environnement",
    copy: "Voir ce qui te soutient, ce qui t'éteint et ce que ton cadre raconte de toi.",
  },
  {
    label: "Contribution",
    copy: "Transformer ton vécu, tes talents et tes idées en quelque chose d'utile.",
  },
  {
    label: "Aventure",
    copy: "Rouvrir le champ des expériences pour ne pas vivre seulement en pilotage automatique.",
  },
  {
    label: "Métriques",
    copy: "Choisir les vrais signes de progression, au-delà des chiffres qui flattent.",
  },
  {
    label: "Écologie",
    copy: "Construire un rythme durable, avec des limites, du repos et de la cohérence.",
  },
  {
    label: "Leadership",
    copy: "Poser tes standards, ton rayonnement et la manière dont tu veux guider.",
  },
  {
    label: "Intégration",
    copy: "Fermer l'ancienne version et transformer les prises de conscience en jour 1.",
  },
];

const ProductArchitect = () => {
  const navigate = useNavigate();
  const { startSession } = useOnboardingAmbientAudio();
  const [chapterPage, setChapterPage] = useState(0);
  const chaptersPerPage = 3;
  const chapterPageCount = Math.ceil(identityChapters.length / chaptersPerPage);
  const currentChapters = identityChapters.slice(
    chapterPage * chaptersPerPage,
    chapterPage * chaptersPerPage + chaptersPerPage
  );
  const seoDescription =
    "L'Architecte est l'espace premium de Sophia pour construire ton identité avec 170+ modules de coaching guidés, tes envies, tes histoires, tes réflexions et tes citations.";

  const handleStartOnboarding = () => {
    startSession();
    navigate("/onboarding-v2");
  };

  return (
    <div className="min-h-screen bg-[#002d21] text-white font-sans selection:bg-[#d1ded4] selection:text-[#17211d]">
      <SEO
        title="L'Architecte Sophia : envies, histoires, réflexions et identité"
        description={seoDescription}
        canonical="https://sophia-coach.ai/l-architecte"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "L'Architecte",
          url: "https://sophia-coach.ai/l-architecte",
          description: seoDescription,
          inLanguage: "fr-FR",
        }}
      />

      <nav className="fixed top-0 z-50 w-full border-b border-white/10 bg-[#002d21]/82 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <img src="/apple-touch-icon.png" alt="Sophia Logo" className="h-8 w-8 rounded-lg" />
            <span className="text-lg font-bold tracking-tight md:text-xl">Sophia</span>
          </button>
          <div className="flex items-center gap-4 md:gap-8">
            <div className="hidden gap-6 text-sm font-semibold text-white/64 md:flex">
              <button onClick={() => navigate("/le-plan")} className="hover:text-white">Le Plan</button>
              <button className="text-[#d1ded4]">L'Architecte</button>
              <button onClick={() => navigate("/formules")} className="hover:text-white">Offres</button>
              <button onClick={() => navigate("/legal")} className="hover:text-white">Légal</button>
            </div>
            <button
              onClick={() => navigate("/auth")}
              className="rounded-full bg-[#d1ded4] px-4 py-2 text-xs font-bold text-[#17211d] shadow-lg transition-colors hover:bg-white md:px-5 md:py-2.5 md:text-sm"
            >
              Accès Membre
            </button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 text-sm font-semibold text-white/72 md:hidden">
          <button onClick={() => navigate("/le-plan")} className="shrink-0 rounded-full bg-white/8 px-4 py-2">Le Plan</button>
          <button className="shrink-0 rounded-full bg-[#d1ded4] px-4 py-2 text-[#17211d]">Architecte</button>
          <button onClick={() => navigate("/formules")} className="shrink-0 rounded-full bg-white/8 px-4 py-2">Offres</button>
          <button onClick={() => navigate("/legal")} className="shrink-0 rounded-full bg-white/8 px-4 py-2">Légal</button>
        </div>
      </nav>

      <main className="pt-32 md:pt-36">
        <section className="relative overflow-hidden px-4 pb-20 pt-8 md:px-6 md:pb-28">
          <div className="absolute inset-x-0 top-0 -z-10 h-[760px] bg-[radial-gradient(circle_at_18%_18%,rgba(217,242,223,0.24),transparent_34%),radial-gradient(circle_at_82%_0%,rgba(247,216,187,0.18),transparent_28%),linear-gradient(180deg,rgba(0,45,33,0),#002d21_92%)]" />
          <div className="mx-auto max-w-6xl">
            <button
              onClick={() => navigate("/")}
              className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-white/60 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour à l'accueil
            </button>

            <div className="grid gap-12 md:grid-cols-[1fr_0.9fr] md:items-center">
              <div>
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#d1ded4]/20 bg-white/8 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#d1ded4]">
                  <Moon className="h-3.5 w-3.5" />
                  Extension premium
                </div>
                <h1 className="text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl md:text-7xl md:leading-[0.95]">
                  170+ modules guidés
                  <span className="block text-[#d1ded4]">pour construire ton identité avec Sophia.</span>
                </h1>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-white/72 md:text-2xl md:leading-10">
                  L'Architecte, c'est l'atelier profond de Sophia : une section Identité à remplir module par module, avec un coaching intégré pour clarifier qui tu deviens, ce que tu veux vivre et ce que tu ne veux plus répéter.
                </p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={handleStartOnboarding}
                    className="inline-flex items-center justify-center gap-3 rounded-full bg-[#d1ded4] px-6 py-4 text-base font-bold text-[#17211d] shadow-2xl shadow-black/20 transition-colors hover:bg-white sm:px-8 sm:text-lg"
                  >
                    <span className="whitespace-nowrap">Créer mon plan gratuit</span>
                    <ArrowRight className="h-5 w-5" />
                  </button>
                  <a
                    href="#identite"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/14 bg-white/8 px-6 py-4 text-base font-bold text-white transition-colors hover:bg-white/12 sm:px-8 sm:text-lg"
                  >
                    Voir l'Identité
                  </a>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-4 shadow-2xl shadow-black/20 backdrop-blur">
                <div className="rounded-[1.5rem] bg-[#17211d] p-5">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#d1ded4] text-[#17211d]">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-bold">Atelier d'identité</div>
                      <div className="text-xs text-white/50">Modules, mémoire et coaching</div>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {[
                      { title: "Identité", copy: "170+ modules à remplir avec Sophia", Icon: Layers3 },
                      { title: "Branches", copy: "Croyances, mission, énergie, leadership", Icon: Leaf },
                      { title: "Coaching", copy: "Sophia te relance dans chaque carte", Icon: MessageCircle },
                      { title: "Archives", copy: "Tes réponses restent consultables", Icon: Archive },
                    ].map(({ title, copy, Icon }) => (
                      <div key={title} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.06] p-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d1ded4] text-[#17211d]">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-bold">{title}</div>
                          <div className="text-sm text-white/58">{copy}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="identite" className="scroll-mt-32 px-4 py-20 md:px-6 md:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:items-start">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#d1ded4]">
                  <Layers3 className="h-4 w-4" />
                  Section Identité
                </div>
                <h2 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">
                  Le vrai cœur de l'Architecte : un arbre de coaching à remplir avec Sophia.
                </h2>
                <p className="mt-6 text-lg leading-8 text-white/66">
                  Chaque branche travaille une partie de toi : croyances, système nerveux, parole, mission, environnement, contribution, rythme, leadership, intégration. Tu avances niveau par niveau, Sophia t'aide à creuser, formuler, relier et garder une trace.
                </p>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/10 md:p-5">
                <div className="mb-5 flex items-start justify-between gap-4 px-1">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#d1ded4]">12 chapitres</div>
                    <div className="mt-1 text-sm text-white/54">Un parcours pour revisiter ton identité sous tous les angles.</div>
                  </div>
                  <div className="shrink-0 rounded-full bg-[#d1ded4] px-3 py-1 text-xs font-black text-[#17211d]">
                    {chapterPage * chaptersPerPage + 1}-{Math.min((chapterPage + 1) * chaptersPerPage, identityChapters.length)}
                  </div>
                </div>
                <div className="grid gap-3">
                  {currentChapters.map(({ label, copy }, index) => {
                    const chapterNumber = chapterPage * chaptersPerPage + index + 1;

                    return (
                    <div key={label} className="min-h-[132px] rounded-2xl border border-white/8 bg-[#17211d] p-4 transition-colors hover:border-[#d1ded4]/28 hover:bg-white/[0.07]">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d1ded4] text-xs font-black text-[#17211d]">
                        {chapterNumber}
                        </div>
                        <div className="font-bold leading-tight">{label}</div>
                      </div>
                      <p className="text-sm leading-6 text-white/58">{copy}</p>
                    </div>
                    );
                  })}
                </div>
                <div className="mt-5 flex items-center justify-between gap-4">
                  <div className="flex gap-1.5">
                    {Array.from({ length: chapterPageCount }).map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setChapterPage(index)}
                        aria-label={`Afficher les chapitres ${index * chaptersPerPage + 1} à ${Math.min((index + 1) * chaptersPerPage, identityChapters.length)}`}
                        className={`h-2 rounded-full transition-all ${
                          index === chapterPage ? "w-7 bg-[#d1ded4]" : "w-2 bg-white/24 hover:bg-white/40"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setChapterPage((page) => (page === 0 ? chapterPageCount - 1 : page - 1))}
                      aria-label="Chapitres précédents"
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white transition-colors hover:bg-white/14"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setChapterPage((page) => (page + 1) % chapterPageCount)}
                      aria-label="Chapitres suivants"
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d1ded4] text-[#17211d] transition-colors hover:bg-white"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {[
                {
                  icon: Layers3,
                  title: "170+ modules",
                  copy: "Pas une page à remplir vite fait. Un vrai parcours de coaching, découpé en cartes claires.",
                },
                {
                  icon: PenLine,
                  title: "5 niveaux par branche",
                  copy: "Tu pars du blocage, tu trouves la racine, tu poses une action, tu ancres la preuve, tu réécris l'histoire.",
                },
                {
                  icon: MessageCircle,
                  title: "Sophia dans chaque carte",
                  copy: "Tu n'es pas seul devant un formulaire : Sophia t'aide à préciser, challenger et transformer ce que tu écris.",
                },
                {
                  icon: Archive,
                  title: "Mémoire personnelle",
                  copy: "Tes réponses deviennent une base vivante : tu peux revenir dessus, voir ton évolution et consolider ton identité.",
                },
              ].map(({ icon: Icon, title, copy }) => (
                <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.06] p-6">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-[#d1ded4] text-[#17211d]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-xl font-bold">{title}</h3>
                  <p className="mt-3 leading-7 text-white/62">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="espaces" className="px-4 py-20 md:px-6 md:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#d1ded4]">
                <Sparkles className="h-4 w-4" />
                Les espaces de l'Architecte
              </div>
              <h2 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">
                Et autour de l'Identité, une bibliothèque vivante de toi.
              </h2>
              <p className="mt-5 text-lg leading-8 text-white/62">
                Les envies, histoires, réflexions et citations enrichissent ton Architecte : elles donnent de la matière à Sophia pour mieux comprendre ce qui t'appelle, ce qui t'a construit et ce qui te guide.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  icon: Map,
                  title: "Envies",
                  subtitle: "Ta Life Wishlist",
                  copy: "Tu poses ce qui t'attire vraiment : expériences, accomplissements, croissance, contribution. Ce n'est pas une todo list, c'est une boussole.",
                },
                {
                  icon: BookOpen,
                  title: "Histoires",
                  subtitle: "Ton Story Journal",
                  copy: "Tu transformes des épisodes vécus en histoires utiles pour parler, convaincre, transmettre ou simplement mieux comprendre ton parcours.",
                },
                {
                  icon: Lightbulb,
                  title: "Réflexions",
                  subtitle: "Ton espace de pensée",
                  copy: "Tu gardes tes idées importantes, tu les approfondis avec Sophia, tu les tags, tu les retrouves. Un endroit pour penser plus clairement.",
                },
                {
                  icon: Quote,
                  title: "Citations",
                  subtitle: "Tes phrases-repères",
                  copy: "Tu collectionnes les phrases, principes ou extraits qui te recentrent quand tu as besoin de revenir à l'essentiel.",
                },
              ].map(({ icon: Icon, title, subtitle, copy }) => (
                <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.06] p-7">
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-[#d1ded4] text-[#17211d]">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-bold uppercase tracking-[0.16em] text-[#d1ded4]/72">{subtitle}</div>
                  <h3 className="mt-2 text-2xl font-bold">{title}</h3>
                  <p className="mt-4 leading-7 text-white/66">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#fbf7ef] px-4 py-20 text-[#17211d] md:px-6 md:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:items-start">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3f1e6] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#002d21]">
                  <Hammer className="h-4 w-4" />
                  Le parcours
                </div>
                <h2 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">
                  Un atelier libre, plus un chemin guidé pour aller vraiment profond.
                </h2>
                <p className="mt-6 text-lg leading-8 text-[#52635b]">
                  L'Architecte combine des espaces ouverts avec un parcours d'identité : 12 semaines de construction du Temple, puis la Forge pour continuer à consolider ce que tu deviens, carte après carte.
                </p>
              </div>

              <div className="grid gap-4">
                {[
                  {
                    icon: Shield,
                    title: "Construction du Temple",
                    copy: "Un parcours en branches pour travailler croyances, prix à payer, système nerveux, mission, environnement, contribution et écologie du chemin.",
                  },
                  {
                    icon: Gem,
                    title: "La Forge",
                    copy: "Un niveau plus avancé pour renforcer tes principes, travailler ton identité et transformer tes prises de conscience en preuves concrètes.",
                  },
                  {
                    icon: Compass,
                    title: "Continuité avec Sophia",
                    copy: "Les envies, histoires, réflexions et citations nourrissent la même direction : mieux te connaître pour mieux avancer.",
                  },
                ].map(({ icon: Icon, title, copy }) => (
                  <article key={title} className="rounded-3xl border border-[#eadfce] bg-white/72 p-6 shadow-sm">
                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-[#e3f1e6] text-[#002d21]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-xl font-bold">{title}</h3>
                    <p className="mt-3 leading-7 text-[#52635b]">{copy}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 md:px-6 md:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 md:p-12">
              <div className="grid gap-8 md:grid-cols-[1fr_0.9fr] md:items-center">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#d1ded4]">
                    <Heart className="h-4 w-4" />
                    Pourquoi c'est plus puissant
                  </div>
                  <h2 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">
                    Sophia ne t'aide pas seulement à agir. Elle t'aide à te construire.
                  </h2>
                  <p className="mt-6 text-lg leading-8 text-white/66">
                    L'Architecte donne une forme à ta transformation : les modules que tu remplis, ce que tu veux vivre, ce que tu comprends, les histoires qui te construisent, les phrases qui te ramènent à toi.
                  </p>
                </div>
                <div className="space-y-3">
                  {[
                    "Tes blocages deviennent des cartes de travail.",
                    "Tes réponses deviennent une mémoire.",
                    "Tes actions deviennent des preuves d'identité.",
                    "Tes envies deviennent une direction.",
                  ].map((item) => (
                    <div key={item} className="rounded-2xl bg-[#d1ded4] px-5 py-4 font-bold text-[#17211d]">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#fbf7ef] px-4 py-20 text-center text-[#17211d] md:px-6 md:py-28">
          <h2 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Construis l'identité qui rend ton changement possible.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#52635b]">
            Commence avec Sophia, puis débloque l'Architecte pour travailler en profondeur ce que tu veux devenir.
          </p>
          <button
            onClick={handleStartOnboarding}
            className="mt-9 inline-flex items-center justify-center gap-3 rounded-full bg-[#17211d] px-6 py-4 text-base font-bold text-white shadow-2xl shadow-[#7f917f]/24 transition-colors hover:bg-[#002d21] sm:px-8 sm:text-lg"
          >
            <span className="whitespace-nowrap">Créer mon plan gratuit</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </section>
      </main>
    </div>
  );
};

export default ProductArchitect;
