"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CreditCard, Shield, FileUp } from "lucide-react";

const ITEMS = [
  { href: "/dashboard", label: "Início", icon: Home },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/plano-de-resgate", label: "Resgate", icon: Shield },
  { href: "/faturas/importar", label: "Importar", icon: FileUp },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-moss-200 flex justify-around items-center py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
      style={{ zIndex: 40 }}
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 font-body text-[11px] ${
              active ? "text-moss-700 font-semibold" : "text-ink-400"
            }`}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
