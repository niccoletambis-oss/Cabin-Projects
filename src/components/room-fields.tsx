import { Field } from "./fields";
export function RoomFields({
  room,
  users,
}: {
  room?: {
    name: string;
    description: string | null;
    type: string;
    active: boolean;
    assignments: { userId: string }[];
  };
  users: { id: string; name: string }[];
}) {
  return (
    <>
      <Field
        label="Room / area name"
        name="name"
        value={room?.name ?? ""}
        required
      />
      <Field
        label="Type"
        name="type"
        value={room?.type ?? "ROOM"}
        options={["ROOM", "AREA", "STORAGE", "LAUNDRY"]}
      />
      <Field
        label="Description"
        name="description"
        type="textarea"
        value={room?.description ?? ""}
      />
      <Field
        label="Status"
        name="active"
        value={String(room?.active ?? true)}
        options={[
          { id: "true", name: "Active" },
          { id: "false", name: "Archived" },
        ]}
      />
      <fieldset>
        <legend>Assigned staff</legend>
        {users.map((u) => (
          <label className="check-label" key={u.id}>
            <input
              type="checkbox"
              name="assignees"
              value={u.id}
              defaultChecked={room?.assignments.some((a) => a.userId === u.id)}
            />
            {u.name}
          </label>
        ))}
      </fieldset>
    </>
  );
}
