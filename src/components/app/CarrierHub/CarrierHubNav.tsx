"use client";

import React, { useState, useRef, ReactNode } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

/* =========================================================
   TYPES
========================================================= */

type Capability = "generator" | "carrier" | "manager";

/* =========================================================
   MAIN NAV
========================================================= */

export default function CarrierHubNav({
  capabilities,
}: {
  capabilities: Capability[] | null;
}) {
  if (!capabilities || capabilities.length === 0) return null;

  const isCarrier = capabilities.includes("carrier");
  const isManager = capabilities.includes("manager");

  // 🚫 No access to carrier hub at all
  if (!isCarrier && !isManager) return null;

  return (
    <div className="pl-72 pt-[13vh] fixed w-full">
      <HubTabs isCarrier={isCarrier} isManager={isManager} />
    </div>
  );
}

/* =========================================================
   HUB TABS (MERGED LOGIC)
========================================================= */

const HubTabs = ({
  isCarrier,
  isManager,
}: {
  isCarrier: boolean;
  isManager: boolean;
}) => {
  const [position, setPosition] = useState({
    left: 0,
    width: 0,
    opacity: 0,
  });

  return (
    <ul
      onMouseLeave={() => setPosition((pv) => ({ ...pv, opacity: 0 }))}
      className="relative flex justify-between w-[80vw] bg-gray-200 h-[13vh] pt-4 text-sm px-10"
    >
      {/* ================= ANALYTICS ================= */}
      <Tab setPosition={setPosition}>
        <Link
          href={
            isManager
              ? "/home/carrier-hub/carrier-manager/analytics"
              : "/home/carrier-hub/waste-carriers/analytics"
          }
        >
          Analytics Dashboard
        </Link>
      </Tab>

      {/* ================= CARRIER ================= */}
      {isCarrier && (
        <Tab setPosition={setPosition}>
          <Link href="/home/carrier-hub/waste-carriers/assigned-carrier-jobs">
            Assigned Jobs
          </Link>
        </Tab>
      )}

      {/* ================= MANAGER ================= */}
      {isManager && (
        <Tab setPosition={setPosition}>
          <Link href="/home/carrier-hub/carrier-manager/job-assignments">
            Job Assignments
          </Link>
        </Tab>
      )}

      {/* ================= INCIDENTS ================= */}
      <Tab setPosition={setPosition}>
        <Link
          href={
            isManager
              ? "/home/carrier-hub/carrier-manager/incident-management"
              : "/home/carrier-hub/waste-carriers/incidents-&-reports"
          }
        >
          Incident Management
        </Link>
      </Tab>

      {/* ================= REVIEWS ================= */}
      <Tab setPosition={setPosition}>
        <Link
          href={
            isManager
              ? "/home/carrier-hub/carrier-manager/reviews"
              : "/home/carrier-hub/waste-carriers/reviews"
          }
        >
          Reviews
        </Link>
      </Tab>

      <Cursor position={position} />
    </ul>
  );
};

/* =========================================================
   TAB
========================================================= */

interface TabProps {
  children: ReactNode;
  setPosition: React.Dispatch<
    React.SetStateAction<{ left: number; width: number; opacity: number }>
  >;
}

const Tab: React.FC<TabProps> = ({ children, setPosition }) => {
  const ref = useRef<HTMLLIElement>(null);

  return (
    <li
      ref={ref}
      onMouseEnter={() => {
        if (!ref.current) return;

        const { width } = ref.current.getBoundingClientRect();

        setPosition({
          left: ref.current.offsetLeft,
          width,
          opacity: 1,
        });
      }}
      className="relative z-10 block cursor-pointer px-3 py-1.5 text-xs font-bold text-black hover:text-white md:px-8 md:py-3 md:text-base"
    >
      {children}
    </li>
  );
};

/* =========================================================
   CURSOR
========================================================= */

const Cursor = ({
  position,
}: {
  position: { left: number; width: number; opacity: number };
}) => (
  <motion.li
    animate={{ ...position }}
    className="absolute z-0 h-7 rounded-full bg-blue-600 md:h-12"
  />
);
