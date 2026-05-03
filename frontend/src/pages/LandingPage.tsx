import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Heart,
  Leaf,
  MessageCircle,
  Moon,
  Play,
  Shield,
  Sparkles,
  Sunrise,
  Waves,
} from "lucide-react";

import Footer from "../components/Footer";
import { useOnboardingAmbientAudio } from "../hooks/useOnboardingAmbientAudio";

const LandingPage = () => {
  const seoDescription =
    "Sophia est un coach IA sur WhatsApp qui transforme ce que tu veux changer en plan clair, puis te soutient au quotidien pour t'aider à avancer sans pression inutile.";
  const { startSession } = useOnboardingAmbientAudio();

  return (
    <div className="min-h-screen bg-[#fbf7ef] text-[#17211d] font-sans selection:bg-[#cfe8d7] selection:text-[#17211d]">
      <SEO
        title="Coach IA WhatsApp pour tenir tes changements"
        description={seoDescription}
        canonical="https://sophia-coach.ai/"
        structuredData={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Sophia Coach",
            url: "https://sophia-coach.ai/",
            logo: "https://sophia-coach.ai/apple-touch-icon.png",
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Sophia Coach",
            url: "https://sophia-coach.ai/",
            inLanguage: "fr-FR",
          },
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Sophia Coach",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: "https://sophia-coach.ai/",
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

        @keyframes sophia-breathe {
          0%, 100% { transform: translateY(0) scaleX(1); opacity: 0.78; }
          50% { transform: translateY(-8px) scaleX(1.02); opacity: 1; }
        }

        @keyframes sophia-drift {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-1deg); }
          50% { transform: translate3d(0, -12px, 0) rotate(1deg); }
        }

        @keyframes sophia-glow {
          0%, 100% { opacity: 0.42; transform: translateY(0); }
          50% { opacity: 0.72; transform: translateY(-10px); }
        }

        html {
          scroll-behavior: smooth;
        }

        .sophia-rise {
          animation: sophia-rise 720ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .sophia-drift {
          animation: sophia-drift 8s ease-in-out infinite;
        }

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

        .sophia-landscape {
          position: absolute;
          inset: auto -10% -18% -10%;
          height: 44%;
          background:
            radial-gradient(ellipse at 16% 20%, rgba(255,255,255,0.42) 0 18%, transparent 46%),
            linear-gradient(145deg, rgba(40,112,92,0.44) 0%, rgba(141,184,137,0.36) 34%, rgba(244,196,149,0.24) 70%, rgba(255,255,255,0) 100%);
          clip-path: polygon(0 34%, 14% 18%, 30% 30%, 44% 12%, 61% 24%, 76% 10%, 100% 26%, 100% 100%, 0 100%);
          filter: blur(0.2px);
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

        .sophia-breath-line {
          animation: sophia-breathe 7.5s ease-in-out infinite;
          transform-origin: center;
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

          <div className="flex items-center gap-4 md:gap-8">
            <div className="hidden gap-6 text-sm font-semibold text-[#52635b] md:flex">
              <Link to="/le-plan" className="transition-colors hover:text-[#17211d]">
                Le Plan
              </Link>
              <Link to="/l-architecte" className="transition-colors hover:text-[#17211d]">
                L'Architecte
              </Link>
              <Link to="/formules" className="transition-colors hover:text-[#17211d]">
                Offres
              </Link>
              <Link to="/legal" className="transition-colors hover:text-[#17211d]">
                Légal
              </Link>
            </div>
            <Link
              to="/auth"
              className="rounded-full bg-[#17211d] px-4 py-2 text-xs font-bold text-white shadow-lg shadow-[#31453b]/18 transition-colors hover:bg-[#002d21] md:px-5 md:py-2.5 md:text-sm"
            >
              Accès Membre
            </Link>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 text-sm font-semibold text-[#52635b] md:hidden">
          <Link to="/le-plan" className="shrink-0 rounded-full bg-white/52 px-4 py-2">
            Le Plan
          </Link>
          <Link to="/l-architecte" className="shrink-0 rounded-full bg-white/52 px-4 py-2">
            Architecte
          </Link>
          <Link to="/formules" className="shrink-0 rounded-full bg-white/52 px-4 py-2">
            Offres
          </Link>
          <Link to="/legal" className="shrink-0 rounded-full bg-white/52 px-4 py-2">
            Légal
          </Link>
        </div>
      </nav>

      <header className="sophia-sanctuary relative min-h-[96svh] overflow-hidden">
        <div className="sophia-landscape" />
        <div className="sophia-light-path" />
        <div className="pointer-events-none absolute inset-x-0 top-[24%] hidden h-[42svh] opacity-70 md:block">
          <div className="sophia-breath-line absolute left-[-8%] top-[12%] h-16 w-[116%] rotate-[-7deg] rounded-full bg-white/22 blur-2xl" />
          <div className="sophia-breath-line absolute left-[-6%] top-[43%] h-10 w-[112%] rotate-[4deg] rounded-full bg-[#d7f3dd]/34 blur-xl" />
          <div className="sophia-breath-line absolute left-[-10%] top-[66%] h-12 w-[120%] rotate-[-2deg] rounded-full bg-[#ffe1c3]/30 blur-xl" />
        </div>

        <div className="relative z-10 mx-auto grid min-h-[96svh] max-w-6xl items-center gap-10 px-4 pb-16 pt-36 md:grid-cols-[1fr_0.82fr] md:px-6 md:pt-32">
          <div className="sophia-rise">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/34 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#002d21] shadow-sm backdrop-blur-md md:mb-8">
              <Leaf className="h-3.5 w-3.5" />
              Coach IA personnel sur WhatsApp
            </div>

            <h1 className="max-w-4xl text-5xl font-bold leading-[0.95] tracking-tight text-[#17211d] min-[380px]:text-6xl md:text-8xl">
              Le coach IA qui t'aide
              <span className="block text-[#002d21]">à tenir dans la vraie vie.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#405148] md:mt-9 md:text-2xl md:leading-10">
              <strong className="font-semibold text-[#17211d]">Sophia transforme ce que tu veux changer en plan clair</strong>, puis revient vers toi sur WhatsApp pour t'aider à avancer, te recentrer et ne pas abandonner quand le quotidien t'éparpille.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row md:mt-11">
              <Link
                to="/onboarding-v2"
                onClick={startSession}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#002d21] px-6 py-4 text-base font-bold text-white shadow-2xl shadow-[#002d21]/24 transition-colors hover:bg-[#17211d] md:px-8"
              >
                <span className="whitespace-nowrap">Créer mon plan gratuit</span>
                <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href="#systeme-sophia"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/34 px-6 py-4 text-base font-bold text-[#17211d] shadow-sm backdrop-blur-md transition-colors hover:bg-white/64 md:px-8"
              >
                <Play className="h-5 w-5 fill-current text-[#002d21]" />
                <span className="whitespace-nowrap">Comment ça marche ?</span>
              </a>
            </div>
          </div>

          <div className="sophia-drift hidden md:block">
            <div className="rounded-[2rem] border border-white/54 bg-white/36 p-4 shadow-2xl shadow-[#7aa889]/22 backdrop-blur-xl">
              <div className="overflow-hidden rounded-[1.45rem] bg-[#fdf8ef]">
                <div className="flex items-center gap-3 border-b border-[#e8ddcd] bg-white/72 px-5 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#cfe8d7] font-bold text-[#002d21]">
                    S
                  </div>
                  <div>
                    <div className="font-bold text-[#17211d]">Sophia</div>
                    <div className="text-xs text-[#6f8178]">présente quand il faut</div>
                  </div>
                </div>
                <div className="space-y-4 p-5 text-sm text-[#24332d]">
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    Bonjour. Aujourd'hui, on garde le cap avec 3 actions simples. Tu n'as pas besoin de tout porter en même temps.
                  </div>
                  <div className="ml-auto max-w-[82%] rounded-2xl bg-[#d1ded4] p-4 shadow-sm">
                    Je suis déjà fatigué, mais je veux continuer.
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    Alors on baisse l'intensité, pas l'engagement. Ce soir, on protège ton énergie et on garde le fil.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-5 left-6 right-6 z-10 hidden gap-2 text-xs text-[#42544b] md:grid md:grid-cols-3">
            {[
              "Coach IA personnel",
              "Plan clair en quelques minutes",
              "Soutien sur WhatsApp",
            ].map((item) => (
              <div key={item} className="rounded-full border border-white/54 bg-white/34 px-4 py-2 text-center shadow-sm backdrop-blur-md">
                {item}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main>
        <section id="systeme-sophia" className="bg-[#fbf7ef] py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="grid gap-10 md:grid-cols-[0.95fr_1.05fr] md:items-end">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e3f1e6] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#002d21]">
                  <Waves className="h-4 w-4" />
                  Le système Sophia
                </div>
                <h2 className="text-3xl font-bold leading-tight tracking-tight text-[#17211d] md:text-5xl">
                  Un coach IA qui transforme ton envie de changement en accompagnement concret.
                </h2>
              </div>
              <p className="text-base leading-8 text-[#52635b] md:text-lg">
                Tu lui dis ce que tu veux changer. Sophia t'aide à clarifier le chemin, puis revient vers toi au bon moment pour garder une continuité douce.
              </p>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-4">
              {[
                {
                  icon: Sunrise,
                  title: "Tu poses ton intention",
                  copy: "Sophia transforme ce que tu veux changer en chemin simple, concret et soutenable.",
                },
                {
                  icon: MessageCircle,
                  title: "Elle te rejoint sur WhatsApp",
                  copy: "Pas besoin d'ouvrir une app de plus. Sophia revient vers toi là où tu es déjà.",
                },
                {
                  icon: Heart,
                  title: "Elle t'aide à tenir sans pression",
                  copy: "Quand l'énergie baisse, Sophia ajuste le rythme pour préserver l'élan au lieu de te culpabiliser.",
                },
                {
                  icon: BookOpen,
                  title: "Elle apprend ton rythme",
                  copy: "Sophia retient ton contexte, tes victoires, tes blocages et ce qui t'aide vraiment à avancer.",
                },
              ].map(({ icon: Icon, title, copy }) => (
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

        <section className="bg-[#f4eee4] py-20 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 md:grid-cols-[0.92fr_1.08fr] md:items-center md:px-6">
            <div className="relative mx-auto w-full max-w-[330px]">
              <div className="sophia-drift rounded-[32px] border-[10px] border-[#17211d] bg-[#17211d] shadow-2xl shadow-[#7f917f]/30">
                <div className="overflow-hidden rounded-[22px] bg-[#eef4ea]">
                  <div className="flex items-center gap-3 bg-[#002d21] px-4 py-4 text-white">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/18 font-bold">
                      S
                    </div>
                    <div>
                      <div className="font-bold">Sophia</div>
                      <div className="text-xs text-white/75">En ligne</div>
                    </div>
                  </div>
                  <div className="space-y-4 px-4 py-6 text-sm">
                    <div className="text-center text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a8f84]">
                      Aujourd'hui
                    </div>
                    <div className="max-w-[86%] rounded-2xl bg-white p-3 text-[#24332d] shadow-sm">
                      Hey Alex. Petit point doux : qu'est-ce qui t'aiderait à garder le fil aujourd'hui ?
                    </div>
                    <div className="ml-auto max-w-[78%] rounded-2xl bg-[#d1ded4] p-3 text-[#24332d] shadow-sm">
                      Oui c'est fait !
                    </div>
                    <div className="max-w-[86%] rounded-2xl bg-white p-3 text-[#24332d] shadow-sm">
                      C'est noté. On garde le rythme, sans forcer.
                    </div>
                    <div className="ml-auto max-w-[86%] rounded-2xl bg-[#d1ded4] p-3 text-[#24332d] shadow-sm">
                      J'ai envie de tout lâcher ce soir... Je suis crevé.
                    </div>
                    <div className="max-w-[90%] rounded-2xl bg-white p-3 text-[#24332d] shadow-sm">
                      Respire. Ce n'est qu'une vague de fatigue. Ce soir, on allège et on protège ton sommeil.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/62 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#002d21]">
                <Sparkles className="h-4 w-4" />
                Présence proactive
              </div>
              <h2 className="text-3xl font-bold leading-tight tracking-tight text-[#17211d] md:text-5xl">
                Ton coach ne reste pas dans une app.
                <span className="block text-[#002d21]">Il revient vers toi quand ça compte.</span>
              </h2>
              <p className="mt-6 text-base leading-8 text-[#52635b] md:text-lg">
                <strong className="text-[#17211d]">Sophia vit dans ton WhatsApp.</strong> Elle t'aide à ne pas te perdre dans le bruit du quotidien : elle clarifie la prochaine étape, célèbre tes avancées et t'aide à retrouver de l'élan quand ça devient plus dur.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-[#cfe8d7] bg-[#eef8ef] p-5">
                  <CheckCircle2 className="mb-4 h-6 w-6 text-[#002d21]" />
                  <h3 className="font-bold text-[#17211d]">Présence proactive</h3>
                  <p className="mt-2 text-sm leading-6 text-[#52635b]">
                    Sophia prend l'initiative de te recontacter pour que ton changement reste vivant.
                  </p>
                </div>
                <div className="rounded-3xl border border-[#eadfce] bg-[#fff8ec] p-5">
                  <Shield className="mb-4 h-6 w-6 text-[#b26c3a]" />
                  <h3 className="font-bold text-[#17211d]">Soutien sans culpabilisation</h3>
                  <p className="mt-2 text-sm leading-6 text-[#52635b]">
                    Elle t'aide à repartir sans transformer une journée imparfaite en abandon.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#002d21] py-20 text-[#f6f2ea] md:py-28">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="grid gap-10 md:grid-cols-[0.88fr_1.12fr] md:items-start">
              <div>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#d1ded4]/16 bg-white/[0.06] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#c6d7cc]">
                  <Moon className="h-4 w-4" />
                  Option premium
                </div>
                <h2 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">
                  Pour aller plus loin
                  <span className="block text-[#d1ded4]">Deviens l'Architecte.</span>
                </h2>
                <p className="mt-6 text-base leading-8 text-[#dce5df]/76 md:text-lg">
                  Le coeur de Sophia, c'est l'accompagnement dans la vraie vie. <strong className="text-[#f6f2ea]">L'Architecte</strong> est l'extension pour celles et ceux qui veulent aussi travailler en profondeur sur leur identité.
                </p>
                <Link
                  to="/l-architecte"
                  className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#eef5ea] px-5 py-3 font-bold text-[#002d21] transition-colors hover:bg-white"
                >
                  Explorer l'Architecte
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ["1", "Comprends tes blocages", "Mets des mots sur les boucles mentales qui te font revenir aux anciens automatismes."],
                  ["2", "Clarifie la personne que tu veux devenir", "Rends ton identité cible plus concrète, plus stable et plus facile à incarner."],
                  ["3", "Renforce la continuité intérieure", "Ajoute une couche plus introspective pour aligner tes actions avec ce qui compte vraiment."],
                ].map(([number, title, copy]) => (
                  <div key={title} className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-[#dce9dc] text-lg font-bold text-[#002d21]">
                      {number}
                    </div>
                    <h3 className="font-bold text-[#f6f2ea]">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#dce5df]/66">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#fbf7ef] py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#f6e4d5] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#8a5633]">
                  <Leaf className="h-4 w-4" />
                  Dans la vraie vie
                </div>
                <h2 className="text-3xl font-bold leading-tight tracking-tight text-[#17211d] md:text-5xl">
                  Sophia t'accompagne dans les moments où les bonnes intentions se perdent.
                </h2>
              </div>
              <p className="max-w-xl text-base leading-8 text-[#52635b]">
                Pas une app à consulter quand tu y penses. Un coach IA qui revient quand ton changement a besoin d'un point d'appui.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  title: "Le matin",
                  copy: "Commence avec une direction simple, au lieu de repartir dans le flou.",
                  Icon: Sunrise,
                },
                {
                  title: "Quand l'énergie baisse",
                  copy: "Réduis l'exigence sans perdre le lien avec ce que tu veux changer.",
                  Icon: Heart,
                },
                {
                  title: "Quand tu décroches",
                  copy: "Reviens avec un ajustement réaliste, pas avec de la culpabilité.",
                  Icon: Moon,
                },
              ].map(({ title, copy, Icon }) => (
                <article key={title} className="rounded-3xl border border-[#eadfce] bg-white/66 p-6 shadow-sm">
                  <Icon className="mb-5 h-6 w-6 text-[#002d21]" />
                  <h3 className="text-lg font-bold text-[#17211d]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#52635b]">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#fffaf1] py-20 text-center md:py-28">
          <div className="mx-auto max-w-3xl px-4 md:px-6">
            <h2 className="text-4xl font-bold leading-tight tracking-tight text-[#17211d] md:text-6xl">
              Un coach IA dans ta poche,
              <span className="block text-[#002d21]">pour continuer quand la vie déborde.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-[#52635b] md:text-lg">
              Crée ton plan, active Sophia sur WhatsApp et commence à avancer avec plus de calme, de clarté et de continuité.
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
              Un coach IA personnel pour t'aider à tenir dans la vraie vie.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default LandingPage;
