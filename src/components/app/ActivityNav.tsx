"use client";

import React, { useState, useRef, ReactNode } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { FiChevronDown, FiEdit, FiPlusSquare, FiShare } from "react-icons/fi";
import { ChainOfCustodyType } from "@/util/types";

export default function ActivityNav({
  chainOfCustody,
}: {
  chainOfCustody: ChainOfCustodyType;
}) {
  const [showModal, setShowModal] = useState(false);

  if (!chainOfCustody) return <div>Loading...</div>;

  return (
    <div className="pl-72 pt-[13vh] w-full fixed">
      <SlideTabs chainOfCustody={chainOfCustody} setShowModal={setShowModal} />
    </div>
  );
}

// ---------- SlideTabs ----------
interface SlideTabsProps {
  chainOfCustody: ChainOfCustodyType;
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const SlideTabs: React.FC<SlideTabsProps> = ({
  chainOfCustody,
  setShowModal,
}) => {
  const [position, setPosition] = useState({ left: 0, width: 0, opacity: 0 });

  return (
    <ul
      onMouseLeave={() => setPosition((pv) => ({ ...pv, opacity: 0 }))}
      className="relative flex justify-around bg-gray-200 h-[13vh] pt-4 text-sm px-10"
    >
      <Tab setPosition={setPosition}>
        <Link href="/home/my-activity">Activity Summary</Link>
      </Tab>

      <Tab setPosition={setPosition}>
        <ListingsDropdown
          chainOfCustody={chainOfCustody}
          setShowModal={setShowModal}
        />
      </Tab>

      {chainOfCustody === "wasteManager" && (
        <Tab setPosition={setPosition}>
          <Link href="/home/my-activity/withdrawals">Withdrawals</Link>
        </Tab>
      )}

      <Tab setPosition={setPosition}>
        <Link href="/home/my-activity/reviews">Reviews</Link>
      </Tab>

      <Cursor position={position} />
    </ul>
  );
};

// ---------- Tab ----------
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

// ---------- Cursor ----------
interface CursorProps {
  position: { left: number; width: number; opacity: number };
}

const Cursor: React.FC<CursorProps> = ({ position }) => (
  <motion.li
    animate={{ ...position }}
    className="absolute z-0 h-7 rounded-full bg-blue-600 md:h-12"
  />
);

// ---------- ListingsDropdown ----------
interface ListingsDropdownProps {
  chainOfCustody: ChainOfCustodyType;
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const ListingsDropdown: React.FC<ListingsDropdownProps> = ({
  chainOfCustody,
  setShowModal,
}) => {
  const [open, setOpen] = useState(false);

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
        className="flex flex-col gap-2 p-2 rounded-lg bg-white shadow-xl absolute top-[120%] left-[50%] w-48 overflow-hidden"
      >
        {chainOfCustody === "wasteManager" && (
          <>
            <Link href="/home/my-activity/completed-jobs" passHref>
              <Option setOpen={setOpen} Icon={FiEdit} text="Jobs Completed" />
            </Link>
            <Link href="/home/my-activity/my-bids" passHref>
              <Option setOpen={setOpen} Icon={FiPlusSquare} text="My Bids" />
            </Link>
            <Link href="/home/my-activity/assigned-jobs" passHref>
              <Option
                setOpen={setOpen}
                Icon={FiPlusSquare}
                text="My Assigned Jobs"
              />
            </Link>
          </>
        )}

        {chainOfCustody === "wasteGenerator" && (
          <>
            <Link href="/home/my-activity/my-listings" passHref>
              <Option setOpen={setOpen} Icon={FiEdit} text="Active Listings" />
            </Link>
            <Link href="/home/my-activity/archived-listings" passHref>
              <Option
                setOpen={setOpen}
                Icon={FiEdit}
                text="Archived Listings"
              />
            </Link>

            <Link href="/home/my-activity/completed-jobs" passHref>
              <Option setOpen={setOpen} Icon={FiShare} text="Completed Jobs" />
            </Link>
          </>
        )}
      </motion.ul>
    </motion.div>
  );
};

// ---------- Option ----------
interface OptionProps {
  text: string;
  Icon: React.ComponentType;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onClick?: () => void;
}

const Option: React.FC<OptionProps> = ({ text, Icon, setOpen, onClick }) => (
  <motion.li
    variants={itemVariants}
    onClick={() => {
      setOpen(false);
      if (onClick) onClick();
    }}
    className="flex items-center gap-2 w-full p-2 text-xs font-medium whitespace-nowrap rounded-md hover:bg-indigo-100 text-slate-700 hover:text-indigo-500 transition-colors cursor-pointer"
  >
    <motion.span variants={actionIconVariants}>
      <Icon />
    </motion.span>
    <span>{text}</span>
  </motion.li>
);

// ---------- Animation Variants ----------
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
