"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import RegisterForm from "@/components/RegisterForm";
import GoogleLogin from "@/components/GoogleLogin";
import { FiArrowUpRight } from "react-icons/fi";

export default function Register() {
  return (
    <section className="grid min-h-screen grid-cols-1 md:grid-cols-2 bg-black text-white">
      {/* LEFT PANEL — MESSAGE + REGISTER */}
      <motion.div
        initial="initial"
        animate="animate"
        transition={{ staggerChildren: 0.05 }}
        className="flex flex-col justify-between p-8 lg:p-12 border-r border-neutral-900"
      >
        {/* Top */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            WASTE<span className="text-orange-500">X</span>
          </h1>
          <p className="text-xs text-neutral-600 mt-2">
            ACCESS POINT // WX-REG-01
          </p>
        </div>

        {/* Middle */}
        <div className="max-w-md w-full">
          {/* Message */}
          <motion.div variants={primaryVariants} className="mb-10">
            <div className="space-y-3 text-neutral-400 text-sm leading-relaxed">
              <p>
                Waste X is currently in controlled MVP deployment across
                selected construction and waste management operators.
              </p>

              <p className="text-orange-500">
                Access is limited and subject to approval.
              </p>

              <p>
                If you’re registering interest or onboarding as a pilot user,
                complete the form below.
              </p>
            </div>
          </motion.div>

          {/* Form */}
          <motion.div variants={primaryVariants} className="space-y-4">
            <RegisterForm />
            <GoogleLogin />
          </motion.div>

          {/* Links */}
          <motion.div
            variants={primaryVariants}
            className="flex flex-col gap-3 mt-6 text-sm text-neutral-500"
          >
            <p>
              Already registered?{" "}
              <Link href="/login" className="text-orange-500 hover:underline">
                Sign in
              </Link>
            </p>
          </motion.div>
        </div>

        {/* Bottom */}
        <div className="text-xs text-neutral-700">
          © Waste X — UK Waste Infrastructure
        </div>
      </motion.div>

      {/* RIGHT PANEL — IMAGE */}
      <div className="relative hidden md:block overflow-hidden group">
        <img
          src="https://cdn.pixabay.com/photo/2016/02/20/17/43/excavator-1212472_1280.jpg"
          alt=""
          className="h-full w-full object-cover opacity-30 transition-all duration-700 group-hover:scale-105 group-hover:opacity-50"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

        {/* Overlay */}
        <motion.div
          initial="initial"
          animate="animate"
          transition={{ staggerChildren: 0.05 }}
          className="absolute bottom-0 p-8"
        >
          <motion.h2
            variants={primaryVariants}
            className="text-3xl font-semibold mb-4"
          >
            Structured. Verified. Accountable.
          </motion.h2>

          <motion.p
            variants={primaryVariants}
            className="text-sm text-neutral-300 max-w-sm"
          >
            Built for compliant waste movement across the UK construction
            sector.
          </motion.p>

          <motion.div
            variants={primaryVariants}
            className="mt-6 flex items-center gap-2 text-orange-500"
          >
            <span className="text-sm">Onboarding active</span>
            <FiArrowUpRight />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

const primaryVariants = {
  initial: {
    y: 20,
    opacity: 0,
  },
  animate: {
    y: 0,
    opacity: 1,
  },
};
