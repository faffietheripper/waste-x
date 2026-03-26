"use client";

import { useState } from "react";
import NewMemberModal from "./NewMemberModal";

export default function TeamDashboardClient({
  children,
  userRole,
}: {
  children: React.ReactNode;
  userRole: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);

  console.log("USER ROLE:", userRole);

  const isAdmin = userRole === "administrator";

  return (
    <>
      {/* Page content */}
      {children}

      {/* Floating Action Button */}
      {isAdmin && (
        <div className="pointer-events-none fixed bottom-8 right-8 z-40">
          <button
            onClick={() => setIsOpen(true)}
            className="
        pointer-events-auto
        bg-orange-500 
        text-black 
        px-5 
        py-3 
        text-sm 
        font-medium 
        shadow-lg 
        hover:bg-orange-600 
        transition
      "
          >
            + Add Team Member
          </button>
        </div>
      )}

      {/* Modal */}
      {isAdmin && <NewMemberModal isOpen={isOpen} setIsOpen={setIsOpen} />}
    </>
  );
}
