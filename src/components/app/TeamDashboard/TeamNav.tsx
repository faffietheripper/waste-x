"use client";

import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { FiEdit, FiChevronDown, FiShare } from "react-icons/fi";
import NewMemberModal from "./NewMemberModal";

/* =========================================================
   TYPES
========================================================= */

type Capability = "generator" | "carrier" | "manager";

/* =========================================================
   MAIN NAV
========================================================= */

export default function TeamNav({
  capabilities,
  userRole,
}: {
  capabilities: Capability[];
  userRole: string | null;
}) {
  const [showModal, setShowModal] = useState(false);

  if (!capabilities?.length) return null;

  return (
    <div className="pl-72 pt-[13vh] fixed w-full z-40">
      <SlideTabs
        capabilities={capabilities}
        userRole={userRole}
        setShowModal={setShowModal}
      />

      <NewMemberModal isOpen={showModal} setIsOpen={setShowModal} />
    </div>
  );
}

/* =========================================================
   SLIDE TABS
========================================================= */

const SlideTabs = ({
  capabilities,
  userRole,
  setShowModal,
}: {
  capabilities: Capability[];
  userRole: string | null;
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const [position, setPosition] = useState({
    left: 0,
    width: 0,
    opacity: 0,
  });

  return (
    <ul
      onMouseLeave={() => setPosition((pv) => ({ ...pv, opacity: 0 }))}
      className="relative flex justify-between w-[80vw] bg-gray-200 pt-4 py-4 text-sm px-10"
    >
      {/* ALWAYS */}
      <Tab setPosition={setPosition}>
        <Link href="/home/team-dashboard">Home</Link>
      </Tab>

      {/* ================= LISTINGS (GENERATOR / MANAGER) ================= */}
      {(capabilities.includes("generator") ||
        capabilities.includes("manager")) && (
        <Tab setPosition={setPosition}>
          <ListingsDropdown capabilities={capabilities} />
        </Tab>
      )}

      {/* ================= TEMPLATE LIBRARY ================= */}
      {capabilities.includes("generator") && (
        <Tab setPosition={setPosition}>
          <Link href="/home/team-dashboard/template-library">
            Template Library
          </Link>
        </Tab>
      )}

      {/* ================= CARRIER JOBS ================= */}
      {capabilities.includes("carrier") && (
        <Tab setPosition={setPosition}>
          <Link href="/home/carrier-hub/waste-carriers/analytics">My Jobs</Link>
        </Tab>
      )}

      {/* ================= MANAGER ONLY ================= */}
      {capabilities.includes("manager") && (
        <>
          <Tab setPosition={setPosition}>
            <Link href="/home/team-dashboard/team-withdrawals">
              Withdrawals
            </Link>
          </Tab>

          <Tab setPosition={setPosition}>
            <Link href="/home/team-dashboard/team-reviews">Reviews</Link>
          </Tab>
        </>
      )}

      {/* ================= GENERATOR REVIEWS ================= */}
      {capabilities.includes("generator") && (
        <Tab setPosition={setPosition}>
          <Link href="/home/team-dashboard/team-reviews">Reviews</Link>
        </Tab>
      )}

      {/* ================= ADMIN SETTINGS ================= */}
      {userRole === "administrator" && (
        <Tab setPosition={setPosition}>
          <SettingsDropdown />
        </Tab>
      )}

      <Cursor position={position} />
    </ul>
  );
};

/* =========================================================
   TAB
========================================================= */

const Tab = ({
  children,
  setPosition,
}: {
  children: React.ReactNode;
  setPosition: React.Dispatch<
    React.SetStateAction<{
      left: number;
      width: number;
      opacity: number;
    }>
  >;
}) => {
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
      className="relative z-10 cursor-pointer px-3 py-1.5 text-xs font-bold text-black hover:text-white md:px-8 md:py-3 md:text-base"
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
  position: {
    left: number;
    width: number;
    opacity: number;
  };
}) => {
  return (
    <motion.li
      animate={{ ...position }}
      className="absolute z-0 h-7 rounded-full bg-blue-600 md:h-12"
    />
  );
};

/* =========================================================
   SETTINGS DROPDOWN
========================================================= */

const SettingsDropdown = () => {
  const [open, setOpen] = useState(false);

  return (
    <motion.div animate={open ? "open" : "closed"} className="relative">
      <button
        onClick={() => setOpen((pv) => !pv)}
        className="flex items-center gap-2 text-black"
      >
        <span>Settings</span>
        <motion.span variants={iconVariants}>
          <FiChevronDown />
        </motion.span>
      </button>

      {open && (
        <motion.ul
          variants={wrapperVariants}
          className="absolute top-[120%] left-1/2 -translate-x-1/2 w-48 flex flex-col gap-2 p-2 rounded-lg bg-white shadow-xl z-50"
        >
          <Link href="/home/team-dashboard/team-profile">
            <Option Icon={FiEdit} text="Team Profile" setOpen={setOpen} />
          </Link>

          <Link href="/home/team-dashboard/team-management">
            <Option Icon={FiEdit} text="Team Management" setOpen={setOpen} />
          </Link>
        </motion.ul>
      )}
    </motion.div>
  );
};

/* =========================================================
   LISTINGS DROPDOWN (UPDATED)
========================================================= */

const ListingsDropdown = ({ capabilities }: { capabilities: Capability[] }) => {
  const [open, setOpen] = useState(false);

  return (
    <motion.div animate={open ? "open" : "closed"} className="relative">
      <button
        onClick={() => setOpen((pv) => !pv)}
        className="flex items-center gap-2 text-black"
      >
        <span>Listings</span>
        <motion.span variants={iconVariants}>
          <FiChevronDown />
        </motion.span>
      </button>

      {open && (
        <motion.ul
          variants={wrapperVariants}
          className="absolute top-[120%] left-1/2 -translate-x-1/2 w-56 flex flex-col gap-2 p-2 rounded-lg bg-white shadow-xl z-50"
        >
          {/* GENERATOR */}
          {capabilities.includes("generator") && (
            <>
              <Link href="/home/team-dashboard/team-listings">
                <Option
                  text="Active Listings"
                  Icon={FiEdit}
                  setOpen={setOpen}
                />
              </Link>

              <Link href="/home/team-dashboard/team-archived-listings">
                <Option
                  text="Archived Listings"
                  Icon={FiEdit}
                  setOpen={setOpen}
                />
              </Link>
            </>
          )}

          {/* MANAGER */}
          {capabilities.includes("manager") && (
            <>
              <Link href="/home/team-dashboard/team-assigned-jobs">
                <Option text="Assigned Jobs" Icon={FiEdit} setOpen={setOpen} />
              </Link>

              <Link href="/home/team-dashboard/team-bids">
                <Option text="Team Bids" Icon={FiShare} setOpen={setOpen} />
              </Link>
            </>
          )}
        </motion.ul>
      )}
    </motion.div>
  );
};

/* =========================================================
   OPTION
========================================================= */

const Option = ({
  text,
  Icon,
  setOpen,
}: {
  text: string;
  Icon: React.ComponentType;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  return (
    <motion.li
      variants={itemVariants}
      onClick={() => setOpen(false)}
      className="flex items-center gap-2 p-2 text-xs font-medium rounded-md hover:bg-indigo-100 text-slate-700 hover:text-indigo-500 cursor-pointer"
    >
      <motion.span variants={actionIconVariants}>
        <Icon />
      </motion.span>
      <span>{text}</span>
    </motion.li>
  );
};

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

const actionIconVariants = {
  open: { scale: 1 },
  closed: { scale: 0.8 },
};
