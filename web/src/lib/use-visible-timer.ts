"use client";

import { useEffect, useRef } from "react";

/**
 * Runs tick every ms while the tab is showing. It stops while the tab is hidden, because nobody is
 * looking and each run costs the database a few queries, and runs once straight away when the tab
 * comes back. A tick that's slow doesn't pile up, because the next wait only starts when it's done.
 */
export function useVisibleTimer(tick: () => Promise<void>, ms: number) {
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let stopped = false;

    function wait() {
      clearTimeout(timer);
      if (!stopped && !document.hidden) timer = setTimeout(run, ms);
    }

    async function run() {
      if (running) return;
      running = true;
      try {
        await latest.current();
      } catch {
        // Each tick says what went wrong itself. The timer just keeps going.
      } finally {
        running = false;
        wait();
      }
    }

    function onVisibilityChange() {
      if (document.hidden) clearTimeout(timer);
      else void run();
    }

    wait();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [ms]);
}
