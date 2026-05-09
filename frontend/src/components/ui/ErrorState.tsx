"use client";

type ErrorStateProps = {
  title: string;
  description: string;
  retryLabel?: string;
  onRetry?: () => void;
};

export function ErrorState({ title, description, retryLabel = "Try again", onRetry }: ErrorStateProps) {
  return (
    <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-300/10 text-amber-200">
            <svg
              aria-hidden="true"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                d="M12 9v4m0 4h.01M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="mt-5 text-xl font-bold tracking-tight text-white">{title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{description}</p>
        </div>

        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex justify-center rounded-md border border-amber-200/30 px-4 py-2.5 text-sm font-bold text-amber-100 transition hover:bg-amber-200/10"
          >
            {retryLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}
