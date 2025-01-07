/**
 * @fileoverview Enhanced authentication middleware for MemoryReel platform
 * Implements comprehensive security features including JWT validation, rate limiting,
 * and role-based authorization with audit logging
 * @version 1.0.0
 */

import { Request, Response, NextFunction, RequestHandler } from 'express'; // v4.18.0
import { RateLimiterRedis } from 'rate-limiter-flexible'; // v2.4.1
import { createLogger, format, transports } from 'winston'; // v3.8.0
import { JWTService } from '../services/auth/jwt.service';
import { AUTH_CONSTANTS } from '../constants/security.constants';
import { IUserSession, UserRole, Permission } from '../interfaces/auth.interface';

// Configure security audit logger
const securityLogger = createLogger({
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: 'security-audit.log' })
  ]
});

// Initialize JWT service
const jwtService = new JWTService();

// Configure rate limiter
const rateLimiter = new RateLimiterRedis({
  points: AUTH_CONSTANTS.RATE_LIMIT_MAX_REQUESTS,
  duration: AUTH_CONSTANTS.RATE_LIMIT_WINDOW,
  blockDuration: 3600 // 1 hour block duration
});

/**
 * Extended Express Request interface with user session
 */
interface AuthenticatedRequest extends Request {
  user?: IUserSession;
  securityContext?: {
    deviceId: string;
    ipAddress: string;
    userAgent: string;
  };
}

/**
 * Authorization options interface
 */
interface AuthorizationOptions {
  requireMFA?: boolean;
  requiredPermissions?: Permission[];
  resourceType?: string;
  actionType?: string;
}

/**
 * Enhanced authentication middleware with comprehensive security features
 */
export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Rate limiting check
    const clientIp = req.ip;
    await rateLimiter.consume(clientIp);

    // Extract token from Authorization header
    const authHeader = req.header(AUTH_CONSTANTS.TOKEN_HEADER_KEY);
    if (!authHeader?.startsWith(AUTH_CONSTANTS.TOKEN_PREFIX)) {
      throw new Error('Invalid authorization header format');
    }

    const token = authHeader.substring(AUTH_CONSTANTS.TOKEN_PREFIX.length + 1);

    // Verify token and extract user session
    const userSession = await jwtService.verifyToken(token);

    // Check token blacklist
    const isBlacklisted = await jwtService.checkBlacklist(token);
    if (isBlacklisted) {
      throw new Error('Token has been revoked');
    }

    // Enhance request with security context
    req.user = userSession;
    req.securityContext = {
      deviceId: req.header('X-Device-ID') || 'unknown',
      ipAddress: clientIp,
      userAgent: req.header('User-Agent') || 'unknown'
    };

    // Log security audit event
    securityLogger.info('Authentication successful', {
      userId: userSession.userId,
      ipAddress: clientIp,
      deviceId: req.securityContext.deviceId,
      timestamp: new Date().toISOString()
    });

    // Token rotation if approaching expiration
    const newToken = await jwtService.rotateToken(token);
    if (newToken) {
      res.setHeader('X-New-Token', newToken);
    }

    next();
  } catch (error) {
    securityLogger.warn('Authentication failed', {
      error: error.message,
      ipAddress: req.ip,
      path: req.path,
      timestamp: new Date().toISOString()
    });

    if (error.message.includes('Rate limit')) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: error.msBeforeNext / 1000
      });
    }

    return res.status(401).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
};

/**
 * Role-based authorization middleware with enhanced security features
 */
export const roleAuthorization = (
  allowedRoles: UserRole[],
  options: AuthorizationOptions = {}
): RequestHandler => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        throw new Error('User session not found');
      }

      // Validate user role
      if (!allowedRoles.includes(user.role)) {
        throw new Error('Insufficient role permissions');
      }

      // Check MFA requirement
      if (options.requireMFA && !user.mfaEnabled) {
        throw new Error('MFA required for this action');
      }

      // Validate specific permissions
      if (options.requiredPermissions?.length) {
        const hasPermissions = options.requiredPermissions.every(
          permission => user.permissions.includes(permission)
        );
        if (!hasPermissions) {
          throw new Error('Missing required permissions');
        }
      }

      // Log authorization event
      securityLogger.info('Authorization successful', {
        userId: user.userId,
        role: user.role,
        resourceType: options.resourceType,
        actionType: options.actionType,
        timestamp: new Date().toISOString()
      });

      next();
    } catch (error) {
      securityLogger.warn('Authorization failed', {
        userId: req.user?.userId,
        error: error.message,
        resourceType: options.resourceType,
        timestamp: new Date().toISOString()
      });

      return res.status(403).json({
        error: 'Authorization failed',
        message: error.message
      });
    }
  };
};