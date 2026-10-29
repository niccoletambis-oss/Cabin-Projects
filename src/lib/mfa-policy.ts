// Deliberately fail closed until enrollment, encrypted secrets, replay prevention,
// recovery-code rotation and break-glass recovery are shipped together.
export interface MultiFactorVerifier {
  verify(
    userId: string,
    challengeId: string,
    response: string,
  ): Promise<boolean>;
}
export function assertMfaPolicy() {
  if (process.env.MFA_MODE && process.env.MFA_MODE !== "disabled")
    throw new Error("Multi-factor authentication policy is not activated.");
}
