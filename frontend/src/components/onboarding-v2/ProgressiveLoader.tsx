import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

type ProgressiveLoaderProps = {
  steps: string[];
  durationPerStep?: number; // in ms
};

export function ProgressiveLoader({ steps, durationPerStep = 2500 }: ProgressiveLoaderProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    if (steps.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    }, durationPerStep);

    return () => clearInterval(interval);
  }, [steps.length, durationPerStep]);

  return (
    <div className="mx-auto mb-6 w-full max-w-3xl rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        <span className="font-medium text-gray-900">
          {steps[currentStepIndex]}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {steps.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;
          const isPending = index > currentStepIndex;

          return (
            <div
              key={step}
              className={`flex items-center gap-3 text-sm transition-all duration-500 ${
                isCompleted
                  ? "text-gray-500"
                  : isCurrent
                  ? "text-blue-700 font-medium"
                  : "text-gray-300"
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : isCurrent ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-gray-200" />
              )}
              <span>{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
