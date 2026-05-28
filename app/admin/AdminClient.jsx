"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createAvaSupabaseBrowserClient,
  isAvaSupabaseConfigured,
} from "../../lib/supabase/client";

const plannedSections = [
  "Hero Photos",
  "Gallery Photos",
  "Category Photos",
  "Categories",
  "Short Descriptions",
];

function friendlyAccessMessage() {
  return "This admin space is private. Please use the invited Ava admin email.";
}

export default function AdminClient() {
  const isConfigured = isAvaSupabaseConfigured();
  const supabase = useMemo(() => createAvaSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [session, setSession] = useState(null);
  const [isAllowed, setIsAllowed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isConfigured || !supabase) {
      setIsLoading(false);
      return undefined;
    }

    let isMounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) {
        return;
      }

      setSession(data.session);

      if (data.session) {
        await confirmAdminAccess();
      } else {
        setIsAllowed(false);
        setIsLoading(false);
      }
    }

    async function confirmAdminAccess() {
      const { data, error } = await supabase.rpc("is_ava_admin");

      if (!isMounted) {
        return;
      }

      if (error || data !== true) {
        setIsAllowed(false);
        setMessage(friendlyAccessMessage());
      } else {
        setIsAllowed(true);
        setMessage("");
      }

      setIsLoading(false);
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        setSession(nextSession);

        if (nextSession) {
          setIsLoading(true);
          await confirmAdminAccess();
        } else {
          setIsAllowed(false);
          setIsLoading(false);
        }
      },
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [isConfigured, supabase]);

  async function handleLogin(event) {
    event.preventDefault();
    setMessage("");

    if (!isConfigured || !supabase) {
      setMessage("Ava Admin is not connected yet. Please ask for setup help.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage("Enter the invited Ava admin email to continue.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/admin/auth/callback`,
        shouldCreateUser: false,
      },
    });

    if (error) {
      setMessage("We could not send the sign-in link. Please use the invited Ava admin email.");
      return;
    }

    setMessage("Check your email for the Ava Admin sign-in link.");
    setEmail("");
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setSession(null);
    setIsAllowed(false);
    setMessage("");
  }

  return (
    <main className="adminPage">
      <section className="adminShell" aria-label="Ava Admin">
        <div className="adminHeader">
          <p className="eyebrow dark">Private creative space</p>
          <h1>Ava Admin</h1>
        </div>

        {!isConfigured ? (
          <div className="adminPanel">
            <p className="adminStatus">
              Ava Admin is not connected yet. The public site is still safe to view.
            </p>
          </div>
        ) : isLoading ? (
          <div className="adminPanel">
            <p className="adminStatus">Opening Ava Admin...</p>
          </div>
        ) : session && isAllowed ? (
          <div className="adminPanel">
            <div className="adminPanelHeader">
              <div>
                <p className="adminStatus success">Signed in</p>
                <h2>Planned creative controls</h2>
              </div>
              <button className="adminGhostButton" type="button" onClick={handleSignOut}>
                Sign out
              </button>
            </div>

            <div className="adminSectionGrid">
              {plannedSections.map((section) => (
                <article className="adminSection" key={section}>
                  <span>{section}</span>
                  <small>Planned</small>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="adminPanel">
            <form className="adminLoginForm" onSubmit={handleLogin}>
              <label htmlFor="admin-email">Email</label>
              <input
                id="admin-email"
                name="email"
                type="email"
                value={email}
                autoComplete="email"
                placeholder="ava@example.com"
                required
                onChange={(event) => setEmail(event.target.value)}
              />
              <button type="submit">Send sign-in link</button>
            </form>

            {message ? <p className="adminMessage">{message}</p> : null}
          </div>
        )}

        {message && session && !isAllowed ? (
          <p className="adminMessage outside">{message}</p>
        ) : null}
      </section>
    </main>
  );
}
