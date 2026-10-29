import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { StayForm } from "@/components/stay-form";
import { BookingFields } from "@/components/booking-fields";
export default async function NewBooking() {
  await requireUser("booking:manage");
  const rooms = await db.location.findMany({
    where: { type: "ROOM", active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <div className="page">
      <h1>Add booking reference</h1>
      <p>
        No payment details, IDs or unnecessary personal information are stored.
      </p>
      <section className="panel operation-card">
        <StayForm intent="booking" label="Create booking">
          <BookingFields rooms={rooms} />
        </StayForm>
      </section>
    </div>
  );
}
