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
import { useSearchParams } from "next/navigation";
import { FiChevronDown } from "react-icons/fi";

/* =========================================================
   TABS CONFIG
========================================================= */

const tabs = [
  { label: "Overview", value: "" },
  { label: "Capabilities", value: "capabilities" },
  { label: "Billing", value: "billing" },
];

/* =========================================================
   MAIN NAV
========================================================= */

export default function OrganisationNav() {
  const searchParams = useSearchParams();
  const current = searchParams.get("status") || "";

  const [position, setPosition] = useState({
    left: 0,
    width: 0,
    opacity: 1,
  });

  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const index = tabs.findIndex((t) => t.value === current);
    const el = refs.current[index === -1 ? 0 : index];
    if (!el) return;

    setPosition({
      left: el.offsetLeft,
      width: el.offsetWidth,
      opacity: 1,
    });
  }, [current]);

  return (
    <div className="pl-[24vw] mt-32 w-full border-b-2 pb-6 fixed">
      <ul
        onMouseLeave={() => {
          const index = tabs.findIndex((t) => t.value === current);
          const el = refs.current[index === -1 ? 0 : index];
          if (!el) return;

          setPosition({
            left: el.offsetLeft,
            width: el.offsetWidth,
            opacity: 1,
          });
        }}
        className="relative flex gap-6 text-sm font-medium"
      >
        {tabs.map((tab, i) => {
          const isActive = current === tab.value;

          return (
            <Tab
              key={tab.value}
              ref={(el) => (refs.current[i] = el)}
              setPosition={setPosition}
              isActive={isActive}
            >
              <Link
                href={`/home/team/organisation${
                  tab.value ? `?status=${tab.value}` : ""
                }`}
              >
                {tab.label}
              </Link>
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

/* =========================================================
   DROPDOWN
========================================================= */

function ListingsDropdown() {
  const [open, setOpen] = useState(false);

  return (
    <motion.div animate={open ? "open" : "closed"} className="relative">
      <button
        onClick={() => setOpen((pv) => !pv)}
        className="flex items-center gap-1 text-gray-500 hover:text-black transition"
      >
        <span>Actions</span>

        <motion.span variants={iconVariants}>
          <FiChevronDown />
        </motion.span>
      </button>

      <motion.ul
        initial="closed"
        animate={open ? "open" : "closed"}
        variants={wrapperVariants}
        style={{ originY: "top", translateX: "-50%" }}
        className="absolute left-[50%] top-[130%] w-48 bg-white shadow-xl rounded-lg p-2 flex flex-col gap-1 z-50 border border-gray-100"
      >
        <Link href="/home/operations/listings/create">
          <Option text="Create Listing" />
        </Link>

        <Link href="/home/operations/templates">
          <Option text="Manage Templates" />
        </Link>
      </motion.ul>
    </motion.div>
  );
}

/* =========================================================
   OPTION
========================================================= */

function Option({ text }: { text: string }) {
  return (
    <motion.li
      variants={itemVariants}
      className="px-3 py-2 text-sm rounded-md hover:bg-gray-100 cursor-pointer transition"
    >
      {text}
    </motion.li>
  );
}

/* =========================================================
   ANIMATIONS
========================================================= */

const wrapperVariants = {
  open: {
    scaleY: 1,
    transition: { when: "beforeChildren", staggerChildren: 0.05 },
  },
  closed: {
    scaleY: 0,
    transition: { when: "afterChildren", staggerChildren: 0.05 },
  },
};

const iconVariants = {
  open: { rotate: 180 },
  closed: { rotate: 0 },
};

const itemVariants = {
  open: { opacity: 1, y: 0 },
  closed: { opacity: 0, y: -10 },
};
