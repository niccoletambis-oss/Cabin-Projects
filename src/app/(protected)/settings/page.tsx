import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/fields";
export default async function Settings() {
  const user = await requireUser();
  return (
    <div className="page">
      <h1>Account settings</h1>
      {user.role === "ADMIN" && (
        <p>
          <Link href="/settings/storage">Private file retention</Link>
        </p>
      )}
      <section className="panel operation-card">
        <h2>{user.name}</h2>
        <p>
          {user.email} · {user.role}
          <br />
          Session duration: 8 hours. All sessions are revoked when your password
          changes.
        </p>
        <ActionForm intent="password" label="Change password & sign in again">
          <Field
            label="Current password"
            name="currentPassword"
            type="password"
            required
          />
          <Field
            label="New password (15–128 characters)"
            name="password"
            type="password"
            required
          />
        </ActionForm>
      </section>
      <section className="panel operation-card">
        <h2>Workspace</h2>
        <p>
          Currency: PHP · Timezone: Asia/Manila
          <br />
          Contact an Admin to change your name, email or permissions.
        </p>
      </section>
    </div>
  );
}
