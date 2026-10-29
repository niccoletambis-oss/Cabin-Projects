import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionUser } from "./auth-service";
import { can, type Permission } from "./security";
export const SESSION_COOKIE = "cabin_session";
export async function currentUser() {
  return sessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function requireUser(permission?: Permission) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (permission && !can(user.role, permission)) redirect("/denied");
  return user;
}
