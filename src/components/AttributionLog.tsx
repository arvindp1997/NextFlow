"use client";

import { useEffect } from "react";

/**
 * The assignment spec requires exactly one console.log of this shape on the
 * initial client render of every page, for build attribution. It's wired to
 * an env var rather than hardcoded so you control what (if anything) gets
 * logged — see NEXT_PUBLIC_CANDIDATE_LINKEDIN_URL in .env.example. If you'd
 * rather not include this, just delete this component and its usage in
 * layout.tsx.
 */
export function AttributionLog() {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_CANDIDATE_LINKEDIN_URL;
    if (url) {
      // eslint-disable-next-line no-console
      console.log(`[NextFlow] Candidate LinkedIn: ${url}`);
    }
  }, []);
  return null;
}
