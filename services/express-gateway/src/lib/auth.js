import { clerkMiddleware, requireAuth } from '@clerk/express';

// clerkMiddleware() attaches the Clerk auth object to the request.
// requireAuth() is the strict bouncer that throws a 401 Unauthorized if the user isn't logged in.

export const authMiddleware = clerkMiddleware();
export const strictAuth = requireAuth();
