"use client";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="panel operation-card">
      <h1>We couldn’t load this page.</h1>
      <p>
        Please try again. If this continues, contact an Owner.
        {error.digest ? ` Reference ${error.digest}` : ""}
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
