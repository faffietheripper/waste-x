"use client";

import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { FiEdit, FiChevronDown, FiShare, FiPlusSquare } from "react-icons/fi";
import NewMemberModal from "./NewMemberModal";

/* =========================================================
   TYPES
========================================================= */

type ChainOfCustodyType =
  | "wasteManager"
  | "wasteGenerator"
  | "wasteCarrier"
  | null;

/* =========================================================
   MAIN NAV
========================================================= */

export default function TeamNav({
  chainOfCustody,
  userRole,
}: {
  chainOfCustody: ChainOfCustodyType;
  userRole: string | null;
}) {
  const [showModal, setShowModal] = useState(false);

  if (!chainOfCustody) return null;

  return (
    <div className="pl-72 pt-[13vh] fixed w-full z-40">
      <SlideTabs
        chainOfCustody={chainOfCustody}
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
  chainOfCustody,
  userRole,
  setShowModal,
}: {
  chainOfCustody: ChainOfCustodyType;
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
      <Tab setPosition={setPosition}>
        <Link href="/home/team-dashboard">Home</Link>
      </Tab>

      {/* ================= WASTE MANAGER ================= */}
      {chainOfCustody === "wasteManager" && (
        <>
          <Tab setPosition={setPosition}>
            <ListingsDropdown chainOfCustody={chainOfCustody} />
          </Tab>
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

      {/* ================= WASTE GENERATOR ================= */}
      {chainOfCustody === "wasteGenerator" && (
        <>
          <Tab setPosition={setPosition}>
            <ListingsDropdown chainOfCustody={chainOfCustody} />
          </Tab>
          <Tab setPosition={setPosition}>
            <Link href="/home/team-dashboard/template-library">
              Template Library
            </Link>
          </Tab>
          <Tab setPosition={setPosition}>
            <Link href="/home/team-dashboard/team-reviews">Reviews</Link>
          </Tab>
        </>
      )}

      {/* ================= WASTE CARRIER ================= */}
      {chainOfCustody === "wasteCarrier" && (
        <Tab setPosition={setPosition}>
          <Link href="/home/carrier-hub/waste-carriers/analytics">My Jobs</Link>
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
          initial="closed"
          animate="open"
          exit="closed"
          variants={wrapperVariants}
          className="absolute top-[120%] left-1/2 -translate-x-1/2 w-48 flex flex-col gap-2 p-2 rounded-lg bg-white shadow-xl z-50"
        >
          <Link href="/home/team-dashboard/team-profile">
            <Option Icon={FiEdit} text="Team Profile" setOpen={setOpen} />
          </Link>
        </motion.ul>
      )}
    </motion.div>
  );
};

/* =========================================================
   LISTINGS DROPDOWN
========================================================= */

const ListingsDropdown = ({
  chainOfCustody,
}: {
  chainOfCustody: ChainOfCustodyType;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <motion.div animate={open ? "open" : "closed"} className="relative">
      <button
        onClick={() => setOpen((pv) => !pv)}
        className="flex items-center gap-2 text-black"
      >
        <span>Listings Management</span>
        <motion.span variants={iconVariants}>
          <FiChevronDown />
        </motion.span>
      </button>

      {open && (
        <motion.ul
          initial="closed"
          animate="open"
          exit="closed"
          variants={wrapperVariants}
          className="absolute top-[120%] left-1/2 -translate-x-1/2 w-48 flex flex-col gap-2 p-2 rounded-lg bg-white shadow-xl z-50"
        >
          {chainOfCustody === "wasteManager" && (
            <>
              <Link href="/home/team-dashboard/team-assigned-jobs">
                <Option Icon={FiEdit} text="Assigned Jobs" setOpen={setOpen} />
              </Link>

              <Link href="/home/team-dashboard/team-bids">
                <Option Icon={FiShare} text="Team Bids" setOpen={setOpen} />
              </Link>
            </>
          )}

          {chainOfCustody === "wasteGenerator" && (
            <>
              <Link href="/home/team-dashboard/team-listings">
                <Option
                  Icon={FiEdit}
                  text="Active Listings"
                  setOpen={setOpen}
                />
              </Link>

              <Link href="/home/team-dashboard/team-archived-listings">
                <Option
                  Icon={FiEdit}
                  text="Archived Listings"
                  setOpen={setOpen}
                />
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
