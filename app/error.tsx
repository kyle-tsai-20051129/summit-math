"use client";

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("Unhandled application error", error);
  }, [error]);

  return (
    <main className="app-error-page">
      <section className="app-error-panel" aria-labelledby="app-error-title">
        <p className="app-error-eyebrow">Summit Video</p>
        <h1 id="app-error-title">Something went wrong</h1>
        <p>Refresh the call or return home and try joining again.</p>
        <div>
          <button type="button" onClick={reset}>Try again</button>
          <button type="button" className="app-error-secondary" onClick={() => window.location.assign("/")}>Return home</button>
        </div>
      </section>
    </main>
  );
}
