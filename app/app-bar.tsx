"use client";

import { BedDouble, Calculator, ClipboardPlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const LINKS = [
  { href: "/", label: "คำนวณ DRG", icon: Calculator },
  { href: "/ward", label: "ผู้ป่วยรอจำหน่าย", icon: BedDouble },
];

function NavLinks({ path }: { path?: string }) {
  const current = (href: string) => path !== undefined && (href === "/" ? path === "/" : path.startsWith(href));
  return LINKS.map(({ href, label, icon: Icon }) => (
    <Link
      key={href}
      href={href}
      aria-label={label}
      aria-current={current(href) ? "page" : undefined}
      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 aria-[current=page]:bg-indigo-50 aria-[current=page]:text-indigo-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:aria-[current=page]:bg-indigo-500/15 dark:aria-[current=page]:text-indigo-300"
    >
      <Icon className="size-4" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  ));
}

// usePathname is request data under cacheComponents, so only the highlighted nav waits for it.
function ActiveNavLinks() {
  return <NavLinks path={usePathname()} />;
}

export default function AppBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto flex h-16 w-full max-w-[96rem] items-center gap-4 px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-indigo-600 text-white">
            <ClipboardPlus className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-bold text-slate-900 dark:text-slate-50"><span className="text-indigo-600 dark:text-indigo-400">PLK</span> Chart AI</span>
            <span className="hidden text-xs text-slate-500 sm:block">สรุปเวชระเบียน ให้รหัส และ Thai DRG</span>
          </span>
        </Link>
        <nav className="ml-auto flex gap-1">
          <Suspense fallback={<NavLinks />}>
            <ActiveNavLinks />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
