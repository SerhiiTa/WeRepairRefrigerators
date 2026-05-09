import Link from "next/link";

type EmptyStateAction = {
  label: string;
  href: string;
};

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: EmptyStateAction;
};

function DefaultIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M6 7h12M8 11h8M10 15h4M5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <section className="rounded-lg border border-dashed border-white/15 bg-slate-900 p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-cyan-300/10 text-cyan-200">
        {icon ?? <DefaultIcon />}
      </div>
      <h2 className="mt-5 text-xl font-bold tracking-tight text-white">{title}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-6 inline-flex justify-center rounded-md bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
        >
          {action.label}
        </Link>
      ) : null}
    </section>
  );
}
