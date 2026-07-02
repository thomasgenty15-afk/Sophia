import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import {
  ArrowRight,
  Brain,
  Clock,
  Flame,
  Heart,
  MessageCircle,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";

import Footer from "../components/Footer";
import { useOnboardingAmbientAudio } from "../hooks/useOnboardingAmbientAudio";

const LandingTDAH = () => {
  const seoDescription =
    "Sophia est un coach IA sur WhatsApp pensé pour les cerveaux TDAH : elle transforme ce que tu veux faire en micro-étapes claires, te relance au bon moment et t'aide à tenir sans jamais te culpabiliser.";
  const { startSession } = useOnboardingAmbientAudio();

  return (
    <div className="min-h-screen bg-[#fbf7ef] text-[#17211d] font-sans selection:bg-[#cfe8d7] selection:text-[#17211d]">
      <SEO
        title="Le coach IA pensé pour les cerveaux TDAH"
        description={seoDescription}
        canonical="https://sophia-coach.ai/tdah"
        structuredData={[
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Sophia Coach — TDAH",
            applicationCategory: "HealthApplication",
            operatingSystem: "Web",
            url: "https://sophia-coach.ai/tdah",
            description: seoDescription,
            inLanguage: "fr-FR",
          },
        ]}
      />

      <style>{`
        @keyframes sophia-rise {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes sophia-drift {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-1deg); }
          50% { transform: translate3d(0, -12px, 0) rotate(1deg); }
        }
        @keyframes sophia-glow {
          0%, 100% { opacity: 0.42; transform: translateY(0); }
          50% { opacity: 0.72; transform: translateY(-10px); }
        }
        html { scroll-behavior: smooth; }
        .sophia-rise { animation: sophia-rise 720ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        .sophia-drift { animation: sophia-drift 8s ease-in-out infinite; }
        .sophia-sanctuary {
          background:
            linear-gradient(180deg, rgba(251,247,239,0) 0%, rgba(251,247,239,0.16) 58%, #fbf7ef 100%),
            linear-gradient(130deg, #f7d8bb 0%, #e9eedc 32%, #c6e5db 62%, #c5d9f1 100%);
        }
        .sophia-sanctuary::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.34), rgba(255,255,255,0.02) 42%, rgba(255,255,255,0.18)),
            repeating-linear-gradient(105deg, rgba(255,255,255,0.12) 0 1px, transparent 1px 48px);
          opacity: 0.82;
        }
        .sophia-light-path {
          position: absolute;
          left: 14%;
          right: 14%;
          bottom: 10%;
          height: 34%;
          border-radius: 999px 999px 0 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0));
          filter: blur(18px);
          animation: sophia-glow 9s ease-in-out infinite;
        }
      `}</style>

      <nav className="fixed top-0 z-50 w-full border-b border-white/30 bg-[#fffaf1]/78 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/apple-touch-icon.png" alt="Sophia Logo" className="h-8 w-8 rounded-lg" />
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold leading-none tracking-tight text-[#17211d] md:text-xl">Sophia</span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6f8178] min-[360px]:inline">
                Powered by IKIZEN
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3 md:gap-6">
            <Link to="/formules" className="hidden text-sm font-semibold text-[#52635b] transition-colors hover:text-[#17211d] md:inline">
              Offres
            </Link>
            <Link
              to="/auth"
              className="rounded-full bg-[#17211d] px-4 py-2 text-xs font-bold text-white shadow-lg shadow-[#31453b]/18 transition-colors hover:bg-[#002d21] md:px-5 md:py-2.5 md:text-sm"
            >
              Accès Membre
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="sophia-sanctuary relative min-h-[96svh] overflow-hidden">
        <div className="sophia-light-path" />

        <div className="relative z-10 mx-auto grid min-h-[96svh] max-w-6xl items-center gap-10 px-4 pb-16 pt-36 md:grid-cols-[1fr_0.82fr] md:px-6 md:pt-32">
          <div className="sophia-rise">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/34 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#002d21] shadow-sm backdrop-blur-md md:mb-8">
              <Brain className="h-3.5 w-3.5" />
              Pensé pour les cerveaux TDAH
            </div>

            <h1 className="max-w-4xl text-4xl font-bold leading-[0.98] tracking-tight text-[#17211d] min-[380px]:text-5xl md:text-7xl">
              Ton cerveau n'est pas le problème.
              <span className="block text-[#002d21]">Il te manquait juste le système.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#405148] md:mt-9 md:text-2xl md:leading-10">
              Tu sais <strong className="font-semibold text-[#17211d]">exactement</strong> ce que tu devrais faire. Et pourtant tu n'y arrives pas, et tu culpabilises. Sophia transforme ce que tu veux faire en micro-étapes claires, puis revient vers toi sur WhatsApp au bon moment — <strong className="font-semibold text-[#17211d]">sans jamais te faire la morale</strong>.
            </p>

            <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center md:mt-11">
              <Link
                to="/onboarding-v2"
                onClick={startSession}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#002d21] px-8 py-4 text-base font-bold text-white shadow-2xl shadow-[#002d21]/24 transition-colors hover:bg-[#17211d]"
              >
                <span className="whitespace-nowrap">Créer mon plan gratuit</span>
                <ArrowRight className="h-5 w-5" />
              </Link>
              <span className="text-sm font-medium text-[#52635b]">
                Balance en vrac, même mal écrit. On structure ensemble.
              </span>
            </div>
          </div>

          {/* WhatsApp mockup — the non-judgmental "pas fait" moment */}
          <div className="sophia-drift hidden md:block">
            <div className="rounded-[2rem] border border-white/54 bg-white/36 p-4 shadow-2xl shadow-[#7aa889]/22 backdrop-blur-xl">
              <div className="overflow-hidden rounded-[1.45rem] bg-[#fdf8ef]">
                <div className="flex items-center gap-3 border-b border-[#e8ddcd] bg-white/72 px-5 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#cfe8d7] font-bold text-[#002d21]">
                    S
                  </div>
                  <div>
                    <div className="font-bold text-[#17211d]">Sophia</div>
                    <div className="text-xs text-[#6f8178]">là quand ton cerveau lâche</div>
                  </div>
                </div>
                <div className="space-y-4 p-5 text-sm text-[#24332d]">
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    Alors, les 10 min sur ton dossier, tu as réussi à t'y mettre ?
                  </div>
                  <div className="ml-auto max-w-[84%] rounded-2xl bg-[#d1ded4] p-4 shadow-sm">
                    Non… j'ai encore scrollé 2h. Je suis nul.
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    Stop. T'es pas nul — ton cerveau a juste cherché de la dopamine facile. C'est mécanique, pas moral. On réduit : 2 minutes, tu ouvres juste le fichier. Tu fermes après si tu veux.
                  </div>
                  <div className="ml-auto max-w-[84%] rounded-2xl bg-[#d1ded4] p-4 shadow-sm">
                    Ok… ça je peux.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* L'ENNEMI */}
        <section className="bg-[#fbf7ef] py-20 md:py-28">
          <div className="mx-auto max-w-4xl px-4 text-center md:px-6">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#f6e4d5] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#8a5633]">
              <Flame className="h-4 w-4" />
              Ce qui n'a jamais marché
            </div>
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-[#17211d] md:text-5xl">
              On t'a dit qu'il te suffisait de « te discipliner ».
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#52635b]">
              Les agendas, les to-do lists, les applis qui te crient dessus, le « arrête de te trouver des excuses ». Pour un cerveau TDAH, ces outils ne font pas que rater leur cible : <strong className="text-[#17211d]">ils empirent les choses</strong>. Chaque échec ajoute une couche de culpabilité, et la culpabilité paralyse encore plus. Le problème n'a jamais été ta volonté. C'était l'outil.
            </p>
          </div>
        </section>

        {/* CE QUE TON CERVEAU VIT */}
        <section className="bg-[#f4eee4] py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mb-12 max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/62 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#002d21]">
                <Brain className="h-4 w-4" />
                Tu vas te reconnaître
              </div>
              <h2 className="text-3xl font-bold leading-tight tracking-tight text-[#17211d] md:text-5xl">
                Ce n'est pas de la fainéantise. C'est comme ça que ton cerveau fonctionne.
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  Icon: Zap,
                  title: "Le mur du démarrage",
                  copy: "Tu veux commencer, mais démarrer te coûte une énergie folle. Une fois lancé, ça va — c'est l'amorçage qui bloque.",
                },
                {
                  Icon: Clock,
                  title: "La cécité temporelle",
                  copy: "« Je le fais dans 5 minutes » et 3 heures ont disparu. Le temps ne se ressent pas de la même façon dans ta tête.",
                },
                {
                  Icon: RefreshCw,
                  title: "Les projets abandonnés",
                  copy: "12 débuts enflammés, 12 abandons au bout de 3 jours quand la nouveauté retombe. À chaque fois, un peu plus de « je ne finis jamais rien ».",
                },
                {
                  Icon: Heart,
                  title: "La spirale de culpabilité",
                  copy: "Tu n'as pas fait, donc tu t'en veux, donc tu bloques encore plus. La honte devient le vrai obstacle.",
                },
              ].map(({ Icon, title, copy }) => (
                <article key={title} className="rounded-3xl border border-[#eadfce] bg-white/66 p-6 shadow-sm">
                  <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#e3f1e6] text-[#002d21]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-[#17211d]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#52635b]">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* COMMENT SOPHIA EST FAITE POUR ÇA */}
        <section className="bg-[#fbf7ef] py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mb-12 max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3f1e6] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#002d21]">
                <Sparkles className="h-4 w-4" />
                Pourquoi Sophia, elle, tient
              </div>
              <h2 className="text-3xl font-bold leading-tight tracking-tight text-[#17211d] md:text-5xl">
                Elle ne te demande pas de changer de cerveau. Elle devient la partie qui te manque.
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  Icon: Target,
                  title: "Elle casse le mur du démarrage",
                  copy: "Sophia découpe tout en micro-actions ridiculement petites. Pas « range l'appart » : « pose 3 objets ». Assez petit pour que ton cerveau dise oui.",
                },
                {
                  Icon: MessageCircle,
                  title: "Elle te relance au bon moment",
                  copy: "Pas une appli de plus à ouvrir (tu l'oublierais). Elle revient vers toi sur WhatsApp, là où tu es déjà, au moment où ça compte.",
                },
                {
                  Icon: Shield,
                  title: "Elle ne te culpabilise jamais",
                  copy: "Tu n'as pas fait ? Elle ne juge pas. Elle ajuste, réduit la marche, et te remet en mouvement. La honte n'entre pas dans l'équation.",
                },
                {
                  Icon: Brain,
                  title: "Elle se souvient à ta place",
                  copy: "Ton contexte, tes objectifs, ce qui t'a aidé la dernière fois. Ta mémoire de travail est externalisée — tu n'as plus à tout garder en tête.",
                },
                {
                  Icon: Clock,
                  title: "Elle te tient en direct",
                  copy: "Un coup de mou à 23h ? Elle est là pour faire l'action avec toi, en temps réel. Le body doubling qui débloque l'action.",
                },
                {
                  Icon: Flame,
                  title: "Elle protège ton élan",
                  copy: "Un jour raté ne fait pas tout capoter. Sophia t'aide à repartir dès le lendemain, sans repartir de zéro.",
                },
              ].map(({ Icon, title, copy }) => (
                <article key={title} className="rounded-3xl border border-[#eadfce] bg-white/62 p-5 shadow-sm backdrop-blur">
                  <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#e3f1e6] text-[#002d21]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-[#17211d]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#52635b]">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* HISTOIRE FONDATEUR — voix "je" */}
        <section className="bg-[#002d21] py-20 text-[#f6f2ea] md:py-28">
          <div className="mx-auto max-w-3xl px-4 md:px-6">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#d1ded4]/16 bg-white/[0.06] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#c6d7cc]">
              <Heart className="h-4 w-4" />
              Pourquoi j'ai construit Sophia
            </div>
            <h2 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">
              Je l'ai codée parce que j'en avais besoin moi-même.
            </h2>
            <div className="mt-8 space-y-5 text-base leading-8 text-[#dce5df]/82 md:text-lg">
              <p>
                Pendant des années, j'ai eu l'impression de gâcher mon potentiel. Je savais ce que je voulais faire, je me lançais à fond… et je lâchais au bout de trois jours. Puis je m'en voulais. Et la culpabilité me bloquait encore plus.
              </p>
              <p>
                Il y a une dizaine de mois, j'ai fini par comprendre un truc : je n'avais pas besoin d'un coach qui me hurle dessus. J'avais besoin d'un <strong className="text-[#f6f2ea]">système qui me tient quand ma motivation lâche</strong>. Alors je m'en suis construit un. Petit à petit, j'ai arrêté le cannabis, transformé mon corps, lâché des automatismes que je pensais impossibles à lâcher, et lancé ce projet.
              </p>
              <p>
                Sophia, c'est ce système, rendu accessible. Ce n'est pas une promesse marketing : c'est ce qui a marché pour moi quand rien d'autre ne marchait. Si ton cerveau fonctionne comme le mien, elle a été pensée pour toi.
              </p>
            </div>
          </div>
        </section>

        {/* COMMENT ÇA MARCHE */}
        <section className="bg-[#fbf7ef] py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mb-12 max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#f6e4d5] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#8a5633]">
                <ArrowRight className="h-4 w-4" />
                En 5 minutes, montre en main
              </div>
              <h2 className="text-3xl font-bold leading-tight tracking-tight text-[#17211d] md:text-5xl">
                Simple à démarrer. C'est fait exprès.
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["1", "Tu balances en vrac", "Un champ ouvert : tu écris ce que tu veux changer, même mal formulé. Aucun formulaire intimidant. Juste toi qui vides ta tête."],
                ["2", "Sophia structure", "Elle transforme ce fouillis en plan clair et en premières micro-actions atteignables. Le flou devient un chemin."],
                ["3", "Elle t'accompagne sur WhatsApp", "Elle revient vers toi au bon moment, célèbre chaque avancée et t'aide à repartir quand tu décroches."],
              ].map(([number, title, copy]) => (
                <div key={title} className="rounded-3xl border border-[#eadfce] bg-white/66 p-6 shadow-sm">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-[#e3f1e6] text-lg font-bold text-[#002d21]">
                    {number}
                  </div>
                  <h3 className="text-lg font-bold text-[#17211d]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#52635b]">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="relative overflow-hidden bg-[#fffaf1] py-20 text-center md:py-28">
          <div className="mx-auto max-w-3xl px-4 md:px-6">
            <h2 className="text-4xl font-bold leading-tight tracking-tight text-[#17211d] md:text-6xl">
              Arrête de te battre contre ton cerveau.
              <span className="block text-[#002d21]">Donne-lui enfin le bon système.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-[#52635b] md:text-lg">
              Crée ton plan en quelques minutes et laisse Sophia t'accompagner sur WhatsApp, jour après jour, sans pression et sans jugement.
            </p>

            <Link
              to="/onboarding-v2"
              onClick={startSession}
              className="mt-9 inline-flex items-center justify-center gap-3 rounded-full bg-[#17211d] px-8 py-4 text-lg font-bold text-white shadow-2xl shadow-[#7f917f]/24 transition-colors hover:bg-[#002d21]"
            >
              Créer mon plan gratuit
              <ArrowRight className="h-5 w-5" />
            </Link>

            <p className="mt-7 text-sm text-[#6f8178]">
              Pensé pour les cerveaux TDAH. Utile pour tous les cerveaux.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default LandingTDAH;
