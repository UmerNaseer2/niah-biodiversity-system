import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-6">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
        {description && <div className="mt-2 text-moss">{description}</div>}
      </div>
      {aside && <div className="flex flex-wrap items-center gap-3">{aside}</div>}
    </header>
  );
}
