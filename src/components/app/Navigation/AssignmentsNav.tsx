"use client";

import React, {
  useState,
  useRef,
  useEffect,
  ReactNode,
  forwardRef,
} from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* =========================================================
   TABS (REAL ROUTES)
========================================================= */

const tabs = [
  { label: "Overview", href: "/home/operations/assignments" },
  { label: "Active", href: "/home/operations/assignments/active" },
  { label: "Completed", href: "/home/operations/assignments/completed" },
];

/* =========================================================
   MAIN NAV
========================================================= */

export default function AssignmentsNav() {
  const pathname = usePathname();

  const [position, setPosition] = useState({
    left: 0,
    width: 0,
    opacity: 1,
  });

  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const index = tabs.findIndex((t) => pathname === t.href);
    const el = refs.current[index === -1 ? 0 : index];

    if (!el) return;

    setPosition({
      left: el.offsetLeft,
      width: el.offsetWidth,
      opacity: 1,
    });
  }, [pathname]);

  return (
    <div className="pl-[24vw] mt-32 w-full border-b-2 pb-6">
      <ul className="relative flex gap-6 text-sm font-medium">
        {tabs.map((tab, i) => {
          const isActive = pathname === tab.href;

          return (
            <Tab
              key={tab.href}
              ref={(el) => (refs.current[i] = el)}
              setPosition={setPosition}
              isActive={isActive}
            >
              <Link href={tab.href}>{tab.label}</Link>
            </Tab>
          );
        })}

        <Cursor position={position} />
      </ul>
    </div>
  );
}

/* =========================================================
   TAB
========================================================= */

const Tab = forwardRef<
  HTMLLIElement,
  {
    children: ReactNode;
    setPosition: React.Dispatch<
      React.SetStateAction<{ left: number; width: number; opacity: number }>
    >;
    isActive?: boolean;
  }
>(function Tab({ children, setPosition, isActive }, ref) {
  return (
    <li
      ref={ref}
      onMouseEnter={(e) => {
        const el = e.currentTarget;

        setPosition({
          left: el.offsetLeft,
          width: el.offsetWidth,
          opacity: 1,
        });
      }}
      className={`relative z-10 cursor-pointer px-4 py-2 rounded-md transition-all duration-200 ${
        isActive ? "text-black" : "text-gray-400 hover:text-gray-700"
      }`}
    >
      {children}
    </li>
  );
});

/* =========================================================
   CURSOR
========================================================= */

function Cursor({
  position,
}: {
  position: { left: number; width: number; opacity: number };
}) {
  return (
    <motion.li
      animate={position}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="absolute z-0 h-9 rounded-md bg-gray-200"
    />
  );
}
