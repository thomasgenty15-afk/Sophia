import {
  createContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Volume2, VolumeX } from "lucide-react";

type OnboardingAmbientAudioContextValue = {
  isSessionActive: boolean;
  isMuted: boolean;
  startSession: () => void;
  toggleMuted: () => void;
};

const SESSION_ACTIVE_KEY = "sophia.onboarding_ambient_audio.active";
const SESSION_MUTED_KEY = "sophia.onboarding_ambient_audio.muted";
const AUDIO_SRC = "/audio/zen-onboarding.mp3";
const AUDIO_VOLUME = 0.42;

const OnboardingAmbientAudioContext = createContext<
  OnboardingAmbientAudioContextValue | null
>(null);

function getStoredSessionFlag(key: string) {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(key) === "1";
}

function configureAudioElement(audio: HTMLAudioElement) {
  audio.src = AUDIO_SRC;
  audio.loop = true;
  audio.preload = "metadata";
  audio.volume = AUDIO_VOLUME;
  audio.playsInline = true;
}

export function OnboardingAmbientAudioProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isSessionActive, setIsSessionActive] = useState(() =>
    getStoredSessionFlag(SESSION_ACTIVE_KEY)
  );
  const [isMuted, setIsMuted] = useState(() =>
    getStoredSessionFlag(SESSION_MUTED_KEY)
  );
  const [audioUnavailable, setAudioUnavailable] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(SESSION_ACTIVE_KEY, isSessionActive ? "1" : "0");
  }, [isSessionActive]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(SESSION_MUTED_KEY, isMuted ? "1" : "0");
  }, [isMuted]);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!isSessionActive || isMuted) {
      audio.pause();
      return;
    }

    audio.volume = AUDIO_VOLUME;
    void audio.play().catch(() => {
      // Playback can still be blocked until the next explicit user gesture.
    });
  }, [isMuted, isSessionActive]);

  function ensureAudioElement() {
    if (audioRef.current) return audioRef.current;
    if (typeof window === "undefined") return null;
    const audio = new window.Audio();
    configureAudioElement(audio);
    audioRef.current = audio;
    return audio;
  }

  function startSession() {
    setIsSessionActive(true);
    setAudioUnavailable(false);

    if (isMuted) return;

    const audio = ensureAudioElement();
    if (!audio) {
      setAudioUnavailable(true);
      return;
    }

    audio.volume = AUDIO_VOLUME;
    void audio.play().catch(() => {
      // The mute toggle remains available to retry later if needed.
    });
  }

  function toggleMuted() {
    setAudioUnavailable(false);
    setIsMuted((current) => {
      const nextMuted = !current;
      if (nextMuted) {
        audioRef.current?.pause();
      } else if (isSessionActive) {
        const audio = ensureAudioElement();
        if (!audio) {
          setAudioUnavailable(true);
          return nextMuted;
        }
        audio.volume = AUDIO_VOLUME;
        void audio.play().catch(() => {
          // Playback can fail if the browser requires a fresh gesture.
        });
      }
      return nextMuted;
    });
  }

  const value: OnboardingAmbientAudioContextValue = {
    isSessionActive,
    isMuted,
    startSession,
    toggleMuted,
  };

  return (
    <OnboardingAmbientAudioContext.Provider value={value}>
      {children}
      {isSessionActive && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-[80]">
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={toggleMuted}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/95 px-4 py-3 text-sm font-medium text-stone-700 shadow-[0_14px_40px_-20px_rgba(15,23,42,0.45)] backdrop-blur"
              aria-pressed={!isMuted}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4 text-stone-500" />
              ) : (
                <Volume2 className="h-4 w-4 text-blue-600" />
              )}
              {isMuted ? "Son off" : "Son on"}
            </button>
            {audioUnavailable && (
              <p className="max-w-[240px] rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm">
                L'ambiance audio n'a pas pu se lancer sur ce navigateur.
              </p>
            )}
          </div>
        </div>
      )}
    </OnboardingAmbientAudioContext.Provider>
  );
}

export { OnboardingAmbientAudioContext };
