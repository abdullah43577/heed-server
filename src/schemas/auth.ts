import z from "zod";

const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required to delete your account"),
});

export const signInSchema = z.object({
  email: z.email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type SignInFormValues = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  first_name: z.string().min(2, "First name must be at least 2 characters"),
  last_name: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.email("Please enter a valid email address"),
  password: strongPassword,
  deviceToken: z.string().optional(),
  deviceType: z.string().optional(),
});

export type SignUpFormValues = z.infer<typeof signUpSchema>;

export const resetPasswordSchema = z.object({
  email: z.email("Please enter a valid email address"),
  otp: z.string().length(6, "Enter the 6-digit code"),
  password: strongPassword,
});
