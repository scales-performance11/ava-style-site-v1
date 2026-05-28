"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAvaSupabaseBrowserClient,
  isAvaSupabaseConfigured,
} from "../../../../lib/supabase/client";

export default function AdminAuthCallback() {
  const router = useRouter();
  const isConfigured = isAvaSupabaseConfigured();
  const supabase = useMemo(() => createAvaSupabaseBrowserClient(), []);
  const [message, setMessage] = useState(
    isConfigured
      ? "Opening Ava Admin..."
      : "Ava Admin is not connected yet. Please ask for setup help.",
  );

  useEffect(() => {
    if (!isConfigured || !supabase) {
      setMessage("Ava Admin is not connected yet. Please ask for setup help.");
      return;
    }

    async function completeSignIn() {
      const code = new URLSearchParams(window.location.search).get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          setMessage("This sign-in link could not be opened. Please request a new one.");
          return;
        }
      }

      router.replace("/admin");
    }

    completeSignIn();
  }, [isConfigured, router, supabase]);

  return (
    <main className="adminPage">
      <section className="adminShell compact" aria-label="Opening Ava Admin">
        <div className="adminPanel">
          <p className="adminStatus">{message}</p>
        </div>
      </section>
    </main>
  );
}
