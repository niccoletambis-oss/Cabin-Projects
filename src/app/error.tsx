"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page empty-state">
      <h1>We couldn’t load this page.</h1>
      <p>
        Check that PostgreSQL is running and database migrations have been
        applied.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
