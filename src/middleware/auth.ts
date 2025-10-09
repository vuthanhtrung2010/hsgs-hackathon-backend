import { auth } from "../auth.js";

/**
 * Middleware to check if user is authenticated
 */
export async function requireAuth(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session) {
      return {
        success: false,
        error: "Unauthorized - Authentication required",
        status: 401
      };
    }

    return {
      success: true,
      session,
      user: session.user
    };
  } catch (error) {
    console.error("Auth middleware error:", error);
    return {
      success: false,
      error: "Authentication failed",
      status: 401
    };
  }
}

/**
 * Middleware to check if user is admin (placeholder - you can extend this)
 */
export async function requireAdmin(request: Request) {
  const authResult = await requireAuth(request);
  
  if (!authResult.success) {
    return authResult;
  }

  // Add admin check logic here if you have admin roles
  // For now, any authenticated user can access admin routes
  // You might want to add an isAdmin field to your user model
  
  return authResult;
}