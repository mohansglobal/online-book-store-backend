export type AuthVerificationMode = "MAIL" | "BOTH";

/**
 * AUTH_VERIFICATION_MODE controls the active authentication and verification channels:
 *
 * - "MAIL": Email is the primary authentication channel. Phone number format validation
 *   is relaxed so any input format passes validation, and phone verification is bypassed.
 * - "BOTH": Both Email and Phone Number are strictly validated and verified via OTP.
 */



//thats the main thing
export const AUTH_VERIFICATION_MODE: AuthVerificationMode = "MAIL";

export const IS_MAIL_ONLY_AUTH = AUTH_VERIFICATION_MODE === "MAIL";
