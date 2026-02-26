import "dotenv/config";

if (!process.env.ADMIN_ID || !process.env.CARD_NUMBER || !process.env.CARD_NAME)
    throw new Error("ADMIN_ID is missing");
export const ADMIN_ID = BigInt(process.env.ADMIN_ID || "0");
export const CARD_NUMBER = process.env.CARD_NUMBER!;
export const CARD_NAME = process.env.CARD_NAME!;
