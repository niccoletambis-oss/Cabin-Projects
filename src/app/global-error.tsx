"use client";
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <h1>Cabin is temporarily unavailable.</h1>
        <p>Please try again or contact an Owner.</p>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
