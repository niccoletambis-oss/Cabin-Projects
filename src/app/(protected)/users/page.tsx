import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { Field, Hidden } from "@/components/fields";
import { dateTime } from "@/lib/format";
export default async function Users() {
  await requireUser("users");
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLogin: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MANAGEMENT</span>
          <h1>Your team</h1>
          <p>Admin-only account controls. Changes revoke existing sessions.</p>
        </div>
      </div>
      <details className="panel operation-card">
        <summary>Add user</summary>
        <ActionForm intent="user">
          <Field label="Name" name="name" required />
          <Field label="Email" name="email" type="email" required />
          <Field
            label="Role"
            name="role"
            options={["CARETAKER", "MANAGER", "ADMIN"]}
          />
          <Hidden name="active" value="true" />
          <Field
            label="Temporary password (15–128 characters)"
            name="password"
            type="password"
            required
          />
        </ActionForm>
      </details>
      <div className="record-grid">
        {users.map((user) => (
          <section className="panel operation-card" key={user.id}>
            <h2>{user.name}</h2>
            <p>
              {user.email} · {user.role} · {user.active ? "Active" : "Inactive"}
            </p>
            <small>
              Last login: {user.lastLogin ? dateTime(user.lastLogin) : "Never"}{" "}
              · Created {dateTime(user.createdAt)}
            </small>
            <details>
              <summary>Edit account / reset password</summary>
              <ActionForm intent="user">
                <Hidden name="id" value={user.id} />
                <Field label="Name" name="name" value={user.name} required />
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  value={user.email}
                  required
                />
                <Field
                  label="Role"
                  name="role"
                  value={user.role}
                  options={["ADMIN", "MANAGER", "CARETAKER"]}
                />
                <Field
                  label="Account status"
                  name="active"
                  value={String(user.active)}
                  options={[
                    { id: "true", name: "Active" },
                    { id: "false", name: "Inactive" },
                  ]}
                />
                <Field
                  label="New password (leave blank to keep current)"
                  name="password"
                  type="password"
                />
              </ActionForm>
            </details>
          </section>
        ))}
      </div>
    </div>
  );
}
