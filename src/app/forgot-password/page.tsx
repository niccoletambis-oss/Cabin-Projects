export const metadata = { title: "Forgot password | Cabin" };
import Link from "next/link";
export default async function Forgot({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  return (
    <div className="login-page">
      <div className="login-intro">
        <span className="eyebrow">CABIN · BED & BREAKFAST</span>
        <h1>Let’s get you back in.</h1>
        <p>Request a secure, single-use recovery link.</p>
      </div>
      <section className="panel login-card">
        <h2>Forgot password</h2>
        {sent && (
          <p role="status" className="form-message success">
            If an active account matches, a recovery link will be sent. Check
            your inbox or contact an Owner.
          </p>
        )}
        <form action="/api/password/forgot" method="post">
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
            />
          </label>
          <button className="button primary">Request reset link</button>
        </form>
        <Link href="/login">Back to sign in</Link>
      </section>
    </div>
  );
}
