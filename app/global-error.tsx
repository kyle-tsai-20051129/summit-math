"use client";

import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error }) {
  useEffect(() => {
    console.error("Fatal application error", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="app-error-page">
          <section className="app-error-panel" aria-labelledby="fatal-error-title">
            <p className="app-error-eyebrow">Summit Video</p>
            <h1 id="fatal-error-title">Unable to load the call</h1>
            <p>Please return home and try again.</p>
            <button type="button" onClick={() => window.location.assign("/")}>Return home</button>
          </section>
        </main>
      </body>
    </html>
  );
}
