import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-jwt-secret-change-in-production';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

/**
 * Extracts and verifies JWT token. Sets req.userId if valid.
 * Does NOT reject if no token — routes decide if auth is required.
 */
export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      req.userId = payload.sub || payload.userId;
      req.userEmail = payload.email;
    } catch {
      // Token invalid/expired — proceed without auth
    }
  }
  next();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function signToken(userId: string, email: string): string {
  return jwt.sign(
    { sub: userId, userId, email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export { JWT_SECRET };
