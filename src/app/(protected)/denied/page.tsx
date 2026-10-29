import Link from "next/link";
import { requireUser } from "@/lib/auth";
export default async function Denied() {
  await requireUser();
  return (
    <div className="page">
      <h1>Access restricted</h1>
      <p>Your account does not have permission to access this section.</p>
      <Link href="/" className="button">
        Back to dashboard
      </Link>
    </div>
  );
}
