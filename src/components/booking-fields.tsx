import { Field } from "./fields";
export function BookingFields({
  rooms,
  booking,
}: {
  rooms: { id: string; name: string }[];
  booking?: {
    reference: string;
    guestName: string;
    mobile: string | null;
    email: string | null;
    guestCount: number;
    checkInDate: Date;
    checkOutDate: Date;
    source: string;
    notes: string | null;
    rooms: { locationId: string }[];
  };
}) {
  return (
    <>
      <div className="form-grid">
        <Field
          label="Booking reference"
          name="reference"
          value={booking?.reference ?? ""}
          required
        />
        <Field
          label="Guest name"
          name="guestName"
          value={booking?.guestName ?? ""}
          required
        />
        <Field
          label="Mobile number"
          name="mobile"
          value={booking?.mobile ?? ""}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          value={booking?.email ?? ""}
        />
        <Field
          label="Number of guests"
          name="guestCount"
          type="number"
          value={booking?.guestCount ?? 1}
          required
        />
        <Field
          label="Booking source"
          name="source"
          value={booking?.source ?? "DIRECT"}
          options={[
            "DIRECT",
            "AIRBNB",
            "BOOKING_COM",
            "AGODA",
            "FACEBOOK",
            "WALK_IN",
            "OTHER",
          ]}
        />
        <Field
          label="Check-in date"
          name="checkInDate"
          type="date"
          value={booking?.checkInDate.toISOString().slice(0, 10) ?? ""}
          required
        />
        <Field
          label="Check-out date"
          name="checkOutDate"
          type="date"
          value={booking?.checkOutDate.toISOString().slice(0, 10) ?? ""}
          required
        />
      </div>
      <fieldset>
        <legend>Assigned rooms</legend>
        {rooms.map((r) => (
          <label key={r.id} className="check-label">
            <input
              type="checkbox"
              name="rooms"
              value={r.id}
              defaultChecked={booking?.rooms.some((b) => b.locationId === r.id)}
            />
            {r.name}
          </label>
        ))}
      </fieldset>
      <Field
        label="Operational notes (avoid unnecessary personal information)"
        name="notes"
        type="textarea"
        value={booking?.notes ?? ""}
      />
    </>
  );
}
