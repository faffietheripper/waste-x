"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function Navigation() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="fixed left-0 right-0 top-0 z-50 border-b border-gray-800 bg-black">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        {/* ============================================================
            LOGO
        ============================================================ */}
        <Link
          href="/"
          className="font-[var(--font-heading)] text-3xl tracking-tight text-white"
        >
          Waste<span className="text-orange-500">X</span>
        </Link>

        {/* ============================================================
            DESKTOP NAVIGATION
        ============================================================ */}
        <div className="hidden items-center gap-9 text-sm tracking-wide md:flex">
          <NavLink href="/">Home</NavLink>

          <NavLink href="/how-it-works">How it Works</NavLink>

          <NavLink href="/about">About</NavLink>

          {/* DWT GUIDE */}
          <a
            href="/downloads/waste-x-dwt-guide.pdf"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-2 text-gray-400 transition hover:text-white"
          >
            <span>DWT Guide</span>

            <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-orange-400 transition group-hover:border-orange-500/50 group-hover:bg-orange-500/15">
              Guide
            </span>
          </a>

          <NavLink href="/contact">Contact</NavLink>
        </div>

        {/* ============================================================
            DESKTOP RIGHT SIDE
        ============================================================ */}
        <div className="hidden items-center gap-6 md:flex">
          <Link
            href="/login"
            className="text-sm text-gray-400 transition hover:text-white"
          >
            Login
          </Link>

          <Link
            href="/book-demo"
            className="bg-orange-500 px-6 py-2 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-orange-600"
          >
            Book Demo
          </Link>
        </div>

        {/* ============================================================
            MOBILE MENU BUTTON
        ============================================================ */}
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          className="text-white md:hidden"
        >
          {menuOpen ? <X size={26} /> : <Menu size={26} />}
        </button>
      </div>

      {/* ==============================================================
          MOBILE MENU
      ============================================================== */}
      {menuOpen && (
        <div className="border-t border-gray-800 bg-black px-6 py-8 md:hidden">
          <div className="space-y-6 text-sm uppercase tracking-wide">
            <MobileLink href="/" setMenuOpen={setMenuOpen}>
              Home
            </MobileLink>

            <MobileLink href="/how-it-works" setMenuOpen={setMenuOpen}>
              How It Works
            </MobileLink>

            <MobileLink href="/about" setMenuOpen={setMenuOpen}>
              About
            </MobileLink>

            {/* MOBILE DWT GUIDE */}
            <a
              href="/downloads/waste-x-dwt-guide.pdf"
              target="_blank"
              rel="noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex items-center justify-between text-gray-400 transition hover:text-white"
            >
              <span>DWT Guide</span>

              <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.16em] text-orange-400">
                Guide
              </span>
            </a>

            <MobileLink href="/contact" setMenuOpen={setMenuOpen}>
              Contact
            </MobileLink>
          </div>

          {/* MOBILE CTA AREA */}
          <div className="mt-8 flex flex-col gap-4 border-t border-gray-800 pt-6">
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="text-sm text-gray-400 transition hover:text-white"
            >
              Login
            </Link>

            <Link
              href="/book-demo"
              onClick={() => setMenuOpen(false)}
              className="bg-orange-500 px-6 py-3 text-center text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-orange-600"
            >
              Book Demo
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

/* ============================================================================
   DESKTOP LINK
============================================================================ */

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-gray-400 transition hover:text-white"
    >
      {children}
    </Link>
  );
}

/* ============================================================================
   MOBILE LINK
============================================================================ */

function MobileLink({
  href,
  children,
  setMenuOpen,
}: {
  href: string;
  children: React.ReactNode;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <Link
      href={href}
      onClick={() => setMenuOpen(false)}
      className="block text-gray-400 transition hover:text-white"
    >
      {children}
    </Link>
  );
}