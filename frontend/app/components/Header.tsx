"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getName, isAdmin, isStaff, logout } from "../lib/auth";

export default function Header() {
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push("/");
  }

  return (
    <header className="w-full" style={{ background: "#072a3c", borderBottom: "3px solid #c2a360" }}>
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <Link href="/tickets" className="font-heading text-lg" style={{ color: "#c2a360" }}>
          Piaseg Chamados
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <span className="hidden sm:inline text-white/70">{getName()}</span>
          {isAdmin() && (
            <Link href="/admin/users" className="text-white/90 hover:text-white font-semibold">
              Usuários
            </Link>
          )}
          {isStaff() && (
            <Link href="/tickets" className="text-white/90 hover:text-white font-semibold">
              Chamados
            </Link>
          )}
          <button onClick={handleLogout} className="text-white/90 hover:text-white font-semibold cursor-pointer">
            Sair
          </button>
        </nav>
      </div>
    </header>
  );
}
