"use client";

import React, { useState, useRef, ReactNode } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { FiChevronDown, FiEdit, FiPlusSquare, FiShare } from "react-icons/fi";

/* =========================================================
   TYPES
========================================================= */

type Capability = "generator" | "carrier" | "manager";

/* =========================================================
   MAIN NAV
========================================================= */

export default function ActivityNav({
  capabilities,
}: {
  capabilities: Capability[] | null;
}) {
  const [showModal, setShowModal] = useState(false);

  if (!capabilities || capabilities.length === 0) {
    return <div className="pl-72 pt-[13vh]">Loading...</div>;
  }

  return (
    <div className="pl-72 pt-[13vh] w-full fixed">
      <SlideTabs capabilities={capabilities} setShowModal={setShowModal} />
    </div>
  );
}

/* =========================================================
   SLIDE TABS
========================================================= */

interface SlideTabsProps {
  capabilities: Capability[];
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const SlideTabs: React.FC<SlideTabsProps> = ({
  capabilities,
  setShowModal,
}) => {
  const [position, setPosition] = useState({
    left: 0,
    width: 0,
    opacity: 0,
  });

  const isGenerator = capabilities.includes("generator");
  const isCarrier = capabilities.includes("carrier");
  const isManager = capabilities.includes("manager");

  return (
    <ul
      onMouseLeave={() => setPosition((pv) => ({ ...pv, opacity: 0 }))}
      className="relative flex justify-around bg-gray-200 h-[13vh] pt-4 text-sm px-10"
    >
      {/* SUMMARY */}
      <Tab setPosition={setPosition}>
        <Link href="/home/my-activity">Activity Summary</Link>
      </Tab>

      {/* LISTINGS */}
      {(isGenerator || isManager) && (
        <Tab setPosition={setPosition}>
          <ListingsDropdown
            capabilities={capabilities}
            setShowModal={setShowModal}
          />
        </Tab>
      )}

      {/* WITHDRAWALS (manager only) */}
      {isManager && (
        <Tab setPosition={setPosition}>
          <Link href="/home/my-activity/withdrawals">Withdrawals</Link>
        </Tab>
      )}

      {/* CARRIER JOBS */}
      {isCarrier && (
        <Tab setPosition={setPosition}>
          <Link href="/home/my-activity/assigned-jobs">My Jobs</Link>
        </Tab>
      )}

      {/* REVIEWS (everyone) */}
      <Tab setPosition={setPosition}>
        <Link href="/home/my-activity/reviews">Reviews</Link>
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

/* =========================================================
   LISTINGS DROPDOWN
========================================================= */

interface ListingsDropdownProps {
  capabilities: Capability[];
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const ListingsDropdown: React.FC<ListingsDropdownProps> = ({
  capabilities,
  setShowModal,
}) => {
  const [open, setOpen] = useState(false);

  const isGenerator = capabilities.includes("generator");
  const isManager = capabilities.includes("manager");

  return (
    <motion.div animate={open ? "open" : "closed"} className="relative">
      <button
        onClick={() => setOpen((pv) => !pv)}
        className="flex items-center gap-2 rounded-md text-black transition-colors"
      >
        <span>Listings Management</span>
        <motion.span variants={iconVariants}>
          <FiChevronDown />
        </motion.span>
      </button>

      <motion.ul
        initial="closed"
        animate={open ? "open" : "closed"}
        variants={wrapperVariants}
        style={{ originY: "top", translateX: "-50%" }}
        className="flex flex-col gap-2 p-2 rounded-lg bg-white shadow-xl absolute top-[120%] left-[50%] w-48 overflow-hidden z-50"
      >
        {/* GENERATOR OPTIONS */}
        {isGenerator && (
          <>
            <Link href="/home/my-activity/my-listings">
              <Option text="Active Listings" Icon={FiEdit} setOpen={setOpen} />
            </Link>

            <Link href="/home/my-activity/archived-listings">
              <Option
                text="Archived Listings"
                Icon={FiEdit}
                setOpen={setOpen}
              />
            </Link>

            <Link href="/home/my-activity/completed-jobs">
              <Option text="Completed Jobs" Icon={FiShare} setOpen={setOpen} />
            </Link>
          </>
        )}

        {/* MANAGER OPTIONS */}
        {isManager && (
          <>
            <Link href="/home/my-activity/my-bids">
              <Option text="My Bids" Icon={FiPlusSquare} setOpen={setOpen} />
            </Link>

            <Link href="/home/my-activity/assigned-jobs">
              <Option
                text="Assigned Jobs"
                Icon={FiPlusSquare}
                setOpen={setOpen}
              />
            </Link>
          </>
        )}
      </motion.ul>
    </motion.div>
  );
};

/* =========================================================
   OPTION
========================================================= */

interface OptionProps {
  text: string;
  Icon: React.ComponentType;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onClick?: () => void;
}

const Option: React.FC<OptionProps> = ({ text, Icon, setOpen, onClick }) => {
  return (
    <motion.li
      variants={itemVariants}
      onClick={() => {
        setOpen(false);
        if (onClick) onClick();
      }}
      className="flex items-center gap-2 w-full p-2 text-xs font-medium rounded-md hover:bg-indigo-100 text-slate-700 hover:text-indigo-500 transition-colors cursor-pointer"
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
    transition: { when: "beforeChildren", staggerChildren: 0.1 },
  },
  closed: {
    scaleY: 0,
    transition: { when: "afterChildren", staggerChildren: 0.1 },
  },
};

const iconVariants = {
  open: { rotate: 180 },
  closed: { rotate: 0 },
};

const itemVariants = {
  open: { opacity: 1, y: 0 },
  closed: { opacity: 0, y: -15 },
};

const actionIconVariants = {
  open: { scale: 1, y: 0 },
  closed: { scale: 0, y: -7 },
};
