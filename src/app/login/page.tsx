import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="login-page">
      <div className="login-intro">
        <span className="eyebrow">CABIN · BED & BREAKFAST</span>
        <h1>
          A little care.
          <br />A welcoming stay.
        </h1>
        <p>
          Your essentials, rooms and daily operations.
          <br />
          Together in one thoughtful workspace.
        </p>
      </div>
      <section className="panel login-card">
        <span className="eyebrow">WELCOME BACK</span>
        <h2>Sign in to your cabin</h2>
        <p>Use your assigned account to continue.</p>
        <form action="/api/login" method="post">
          <label>
            Email
            <input
              type="email"
              name="email"
              autoComplete="username"
              maxLength={254}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </label>
          {error && (
            <p role="alert" className="form-message">
              Invalid credentials or account temporarily unavailable.
            </p>
          )}
          <button className="button primary">Sign in securely</button>
        </form>
        <small>Access is limited to authorized Cabin team members.</small>
      </section>
    </div>
  );
}
