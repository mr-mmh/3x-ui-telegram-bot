import { customAlphabet } from "nanoid";

export const generateID = customAlphabet(
    "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    10,
);
