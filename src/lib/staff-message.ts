export function staffMessage(message: string) {
  if (message === "Permission denied" || message === "Permission denied.")
    return "You don’t have permission to perform this action. Ask an Owner or Manager for help.";
  if (message === "Authentication required")
    return "Your session has ended. Sign in again to continue.";
  return message;
}
