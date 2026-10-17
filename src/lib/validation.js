import { z } from 'zod';

// Shared by client forms and server handlers so both enforce the same rules.

export const emailSchema = z
  .string({ required_error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .min(3, 'Enter a valid email address.')
  .max(254, 'Email is too long.')
  .email('Enter a valid email address.');

export const passwordSchema = z
  .string({ required_error: 'Password is required.' })
  .min(10, 'Use at least 10 characters.')
  .max(128, 'Use at most 128 characters.');

export const nameSchema = z.string().trim().min(1, 'Enter your name.').max(80, 'Name is too long.');

export const signUpSchema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema });
export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password.').max(128) });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });

export const updateProfileSchema = z.object({ name: nameSchema });
export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: passwordSchema,
});

export const idSchema = z.string().min(1).max(64).regex(/^[a-z0-9]+$/i, 'Invalid id.');

export const collectionNameSchema = z.string().trim().min(1, 'Give the collection a name.').max(60, 'Keep names under 60 characters.');

export const createCollectionSchema = z.object({
  name: collectionNameSchema,
  description: z.string().trim().max(280).optional().nullable(),
});

export const scopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('LIBRARY') }),
  z.object({ type: z.literal('COLLECTION'), collectionId: idSchema }),
  z.object({ type: z.literal('DOCUMENTS'), documentIds: z.array(idSchema).min(1).max(50) }),
]);

export const questionSchema = z.string().trim().min(2, 'Ask a question.').max(2000, 'Keep questions under 2,000 characters.');
