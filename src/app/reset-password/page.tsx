export const metadata = { title: "Reset password | Cabin" };
import Link from "next/link";
export default async function Reset({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = !!token && /^[a-f0-9]{64}$/.test(token);
  return (
    <div className="login-page">
      <div className="login-intro">
        <span className="eyebrow">CABIN · ACCOUNT RECOVERY</span>
        <h1>A fresh start.</h1>
        <p>
          Choose a unique password. Completing recovery signs out all existing
          sessions.
        </p>
      </div>
      <section className="panel login-card">
        <h2>Reset password</h2>
        {valid ? (
          <form action="/api/password/reset" method="post">
            <input type="hidden" name="token" value={token} />
            <label>
              New password (15–128 characters)
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={15}
                maxLength={128}
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                name="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={15}
                maxLength={128}
                required
              />
            </label>
            <button className="button primary">Set new password</button>
          </form>
        ) : (
          <p>
            The reset link is invalid.{" "}
            <Link href="/forgot-password">Request another link.</Link>
          </p>
        )}
        <Link href="/login">Back to sign in</Link>
      </section>
    </div>
  );
}
