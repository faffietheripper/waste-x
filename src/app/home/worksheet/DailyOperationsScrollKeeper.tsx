"use client";

import { useEffect } from "react";

/*
  Server Actions refresh the worksheet after each operational step. Without this,
  a user working far down a 200-300 row board can be thrown back to the top after
  Mark arrived / Save weight / Accept.

  We remember the current vertical position only when a worksheet form submits,
  then restore it once on the refreshed page. Date/view are part of the key so
  manual navigation between days and Live/Completed does not share a position.
*/
export default function DailyOperationsScrollKeeper() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const date = params.get("date") ?? "today";
    const view = params.get("view") ?? "live";
    const key = `waste-x:worksheet-scroll:${date}:${view}`;

    const rememberScroll = () => {
      window.sessionStorage.setItem(key, String(window.scrollY));
    };

    document.addEventListener("submit", rememberScroll, true);

    const saved = window.sessionStorage.getItem(key);
    if (saved) {
      const top = Number(saved);

      if (Number.isFinite(top)) {
        const restore = () => window.scrollTo({ top, behavior: "auto" });
        requestAnimationFrame(() => requestAnimationFrame(restore));
        window.setTimeout(restore, 120);
      }

      window.setTimeout(() => window.sessionStorage.removeItem(key), 600);
    }

    return () => {
      document.removeEventListener("submit", rememberScroll, true);
    };
  }, []);

  return null;
}
