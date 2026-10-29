import { requireUser } from "@/lib/auth";
import { expenseChoices } from "@/lib/expense-choices";
import { ExpenseFields } from "@/components/expense-fields";
import { StayForm } from "@/components/stay-form";
export default async function NewExpense() {
  const user = await requireUser("expense:submit");
  return (
    <div className="page">
      <h1>Submit expense</h1>
      <p>Save the expense, then attach a receipt on its details page.</p>
      <section className="panel operation-card">
        <StayForm intent="expense" label="Submit expense">
          <ExpenseFields {...await expenseChoices(user)} />
        </StayForm>
      </section>
    </div>
  );
}
