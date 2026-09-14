import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export interface SendSmsOptions {
  senderId?: string;
  validityMinutes?: number;
}

/**
 * Normalizes Indian mobile number to the required SMS gateway format (e.g. 919876543210).
 */
export const formatMobileNumber = (mobile: string): string => {
  const digitsOnly = mobile.replace(/\D/g, "");

  // If 10 digits (standard Indian number without 91), prefix with 91
  if (digitsOnly.length === 10) {
    return `91${digitsOnly}`;
  }

  // If 12 digits starting with 91
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return digitsOnly;
  }

  return digitsOnly;
};

/**
 * Sends OTP SMS via the configured SMS Gateway API.
 */
export const sendOtpSms = async (
  mobileNumber: string,
  otp: string,
  options: SendSmsOptions = {},
): Promise<boolean> => {
  const apiKey = env.SMS_KEY || '' ;
  const clientId = env.SMS_CLIENT_ID || '' ;
  const senderId = options.senderId || env.SMS_SENDER_ID ;
  const baseUrl = env.SMS_BASE_URL;

  const formattedMobile = formatMobileNumber(mobileNumber);

  // Exact DLT registered template text
  const messageText = `Dear User, Use OTP : ${otp} to verify your mobile number for GEISIL. This code is valid for 2 minutes. Global Employability Information Services India Limited.`;
  const encodedMessage = encodeURIComponent(messageText);

  // Note: apiKey is not re-encoded if already percentage encoded (e.g. %3D)
  const safeApiKey = apiKey.includes("%") ? apiKey : encodeURIComponent(apiKey);

  const url = `${baseUrl}/api/v2/SendSMS?SenderId=${encodeURIComponent(senderId)}&Message=${encodedMessage}&MobileNumbers=${encodeURIComponent(formattedMobile)}&ApiKey=${safeApiKey}&ClientId=${encodeURIComponent(clientId)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "text/plain",
      },
    });

    const responseText = await response.text();

    if (!response.ok) {
      logger.error(
        { status: response.status, response: responseText, mobile: formattedMobile },
        "Failed to dispatch SMS via gateway",
      );
      return false;
    }

    logger.info({ mobile: formattedMobile, response: responseText }, "OTP SMS sent successfully");
    return true;
  } catch (error) {
    logger.error({ err: error, mobile: formattedMobile }, "Network error sending SMS via gateway");
    return false;
  }
};
