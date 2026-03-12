import clsx from "clsx";

export function GameControls({
  isHost,
  canStart,
  canRestart,
  onStart,
  onRestart,
  primaryAction,
  secondaryAction,
  foldMode,
  onToggleFold,
  phaseLabel,
  timerLabel,
}: {
  isHost: boolean;
  canStart: boolean;
  canRestart: boolean;
  onStart: () => void;
  onRestart: () => void;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  secondaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  foldMode?: boolean;
  onToggleFold?: () => void;
  phaseLabel?: string;
  timerLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-emerald-950/60 px-4 py-3 border border-emerald-400/20">
      <div className="flex flex-col gap-1 text-emerald-100">
        <span className="text-xs uppercase tracking-[0.25em] text-emerald-200/70">
          Cát Tê Table
        </span>
        <span className="text-sm font-semibold">{phaseLabel}</span>
        {timerLabel && <span className="text-xs text-amber-200">{timerLabel}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isHost && (
          <>
            <button
              type="button"
              onClick={onStart}
              disabled={!canStart}
              className={clsx(
                "px-3 py-2 rounded-lg text-xs font-semibold",
                canStart
                  ? "bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
                  : "bg-emerald-900/60 text-emerald-200/60 cursor-not-allowed"
              )}
            >
              Start Game
            </button>
            <button
              type="button"
              onClick={onRestart}
              disabled={!canRestart}
              className={clsx(
                "px-3 py-2 rounded-lg text-xs font-semibold",
                canRestart
                  ? "bg-amber-300 text-amber-950 hover:bg-amber-200"
                  : "bg-amber-900/40 text-amber-200/60 cursor-not-allowed"
              )}
            >
              Restart
            </button>
          </>
        )}

        {onToggleFold && (
          <button
            type="button"
            onClick={onToggleFold}
            className={clsx(
              "px-3 py-2 rounded-lg text-xs font-semibold",
              foldMode ? "bg-rose-500 text-white" : "bg-emerald-900/60 text-emerald-200"
            )}
          >
            {foldMode ? "Đang úp" : "Úp bài"}
          </button>
        )}

        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
            className={clsx(
              "px-3 py-2 rounded-lg text-xs font-semibold",
              secondaryAction.disabled
                ? "bg-slate-800/60 text-slate-300/60 cursor-not-allowed"
                : "bg-slate-700 text-white hover:bg-slate-600"
            )}
          >
            {secondaryAction.label}
          </button>
        )}

        {primaryAction && (
          <button
            type="button"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            className={clsx(
              "px-4 py-2 rounded-lg text-xs font-semibold",
              primaryAction.disabled
                ? "bg-emerald-900/60 text-emerald-200/60 cursor-not-allowed"
                : "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
            )}
          >
            {primaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
