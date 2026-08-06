"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";

export default function Navigation() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black border-b border-gray-800">
      <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
        {/* LOGO */}
        <Link
          href="/"
          className="font-[var(--font-heading)] text-3xl tracking-tight text-white"
        >
          Waste<span className="text-orange-500">X</span>
        </Link>

        {/* DESKTOP LINKS */}
        <div className="hidden md:flex items-center gap-10 text-sm tracking-wide">
          <NavLink href="/">Home</NavLink>

          <NavLink
            href="/how-it-works"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition"
          >
            How it Works
          </NavLink>

          <NavLink href="/about">About</NavLink>

          <Link
            href="/contact"
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Contact
          </Link>
        </div>

        {/* RIGHT SIDE CTA */}
        <div className="hidden md:flex items-center gap-6">
          <Link
            href="/login"
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Login
          </Link>

          <Link
            href="/book-demo"
            className="bg-orange-500 hover:bg-orange-600 text-black text-sm px-6 py-2 font-semibold uppercase tracking-wide transition"
          >
            Book Demo
          </Link>
        </div>

        {/* MOBILE BUTTON */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden text-white"
        >
          {menuOpen ? <X size={26} /> : <Menu size={26} />}
        </button>
      </div>

      {/* MOBILE MENU */}
      {menuOpen && (
        <div className="md:hidden bg-black border-t border-gray-800 px-6 py-8 space-y-6 text-sm uppercase tracking-wide">
          <MobileLink href="/" setMenuOpen={setMenuOpen}>
            Home
          </MobileLink>
          <MobileLink href="/how-it-works" setMenuOpen={setMenuOpen}>
            How It Works
          </MobileLink>

          <MobileLink href="/about" setMenuOpen={setMenuOpen}>
            About
          </MobileLink>

           <MobileLink href="/contact" setMenuOpen={setMenuOpen}>
            Contact
          </MobileLink>

          <div className="pt-6 border-t border-gray-800 flex flex-col gap-4">
            <Link href="/login" className="text-gray-400">
              Login
            </Link>
            <Link
              href="/book-demo"
              className="bg-orange-500 text-black px-6 py-3 text-center font-semibold uppercase tracking-wide"
            >
              Book Demo
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

function NavLink({ href, children }: any) {
  return (
    <Link href={href} className="text-gray-400 hover:text-white transition">
      {children}
    </Link>
  );
}

function DropdownLink({ href, children }: any) {
  return (
    <Link
      href={href}
      className="block text-gray-400 hover:text-white transition"
    >
      {children}
    </Link>
  );
}

function MobileLink({ href, children, setMenuOpen }: any) {
  return (
    <Link
      href={href}
      onClick={() => setMenuOpen(false)}
      className="block text-gray-400 hover:text-white"
    >
      {children}
    </Link>
  );
}
