import { z } from "zod";

export const registerSchema = z.object({
    firstName: z.string().trim().min(1, "First name is required").max(255),
    lastName: z.string().trim().max(255).optional(),
    email: z.string().trim().email("Invalid email address").max(255).transform((value) => value.toLowerCase()),
    password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
    email: z.string().trim().email("Invalid email address").max(255).transform((value) => value.toLowerCase()),
    password: z.string().min(8, "Password is required"),
});

export const refreshSchema = z.object({
    refreshToken: z.string().min(1),
});
