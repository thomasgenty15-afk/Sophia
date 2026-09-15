import { useContext } from "react";

import { OnboardingAmbientAudioContext } from "../context/OnboardingAmbientAudioContext";

export function useOnboardingAmbientAudio() {
  const context = useContext(OnboardingAmbientAudioContext);
  if (!context) {
    throw new Error("useOnboardingAmbientAudio must be used within OnboardingAmbientAudioProvider");
  }
  return context;
}
