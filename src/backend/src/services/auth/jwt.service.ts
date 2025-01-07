/**
 * @fileoverview Enhanced JWT Service with RSA-256 encryption and comprehensive security features
 * Implements secure token generation, validation, and management for the MemoryReel platform
 * @version 1.0.0
 */

import { sign, verify, decode, JwtPayload } from 'jsonwebtoken'; // v9.0.0
import { randomBytes, createHash } from 'crypto';
import { IAuthTokens, IUserSession } from '../../interfaces/auth.interface';
import { authConfig } from '../../config/auth.config';
import { AUTH_CONSTANTS } from '../../constants/security.constants';

/**
 * Interface for rate limiting tracking
 */
interface IRateLimitEntry {
  count: number;
  timestamp: number;
}

/**
 * Enhanced JWT Service with comprehensive security features
 */
export class JWTService {
  private readonly jwtPrivateKey: string;
  private readonly jwtPublicKey: string;
  private readonly algorithm: string;
  private readonly tokenBlacklist: Set<string>;
  private readonly rateLimiter: Map<string, IRateLimitEntry>;

  constructor() {
    // Initialize with RSA key pairs and security configurations
    this.jwtPrivateKey = authConfig.jwtConfig.privateKey;
    this.jwtPublicKey = authConfig.jwtConfig.publicKey;
    this.algorithm = authConfig.jwtConfig.algorithm;
    this.tokenBlacklist = new Set<string>();
    this.rateLimiter = new Map<string, IRateLimitEntry>();

    if (!this.jwtPrivateKey || !this.jwtPublicKey) {
      throw new Error('JWT key configuration missing');
    }

    // Schedule cleanup of expired blacklisted tokens
    setInterval(() => this.cleanupBlacklist(), 3600000); // Cleanup every hour
  }

  /**
   * Generates secure access and refresh tokens with RSA-256 encryption
   * @param userSession User session data
   * @returns Promise resolving to token package
   */
  public async generateTokens(userSession: IUserSession): Promise<IAuthTokens> {
    try {
      // Check rate limits
      if (!this.checkRateLimit(userSession.userId)) {
        throw new Error('Rate limit exceeded for token generation');
      }

      // Generate secure session ID
      const sessionId = this.generateSecureSessionId();

      // Create enhanced token payload
      const payload = {
        ...userSession,
        sessionId,
        iat: Math.floor(Date.now() / 1000),
        jti: randomBytes(16).toString('hex')
      };

      // Sign access token with RSA-256
      const accessToken = sign(payload, this.jwtPrivateKey, {
        algorithm: this.algorithm,
        expiresIn: AUTH_CONSTANTS.JWT_EXPIRY,
        issuer: authConfig.jwtConfig.issuer,
        audience: authConfig.jwtConfig.audience
      });

      // Generate secure refresh token
      const refreshToken = this.generateRefreshToken(userSession.userId, sessionId);

      return {
        accessToken,
        refreshToken,
        expiresIn: AUTH_CONSTANTS.JWT_EXPIRY,
        tokenType: AUTH_CONSTANTS.TOKEN_TYPE,
        idToken: '', // Placeholder for OIDC implementation
        scope: 'full_access'
      };
    } catch (error) {
      throw new Error(`Token generation failed: ${error.message}`);
    }
  }

  /**
   * Comprehensively verifies JWT token validity and security
   * @param token JWT token to verify
   * @returns Promise resolving to validated user session
   */
  public async verifyToken(token: string): Promise<IUserSession> {
    try {
      // Check token blacklist
      if (this.tokenBlacklist.has(token)) {
        throw new Error('Token has been revoked');
      }

      // Verify token signature and validity
      const decoded = verify(token, this.jwtPublicKey, {
        algorithms: [this.algorithm],
        issuer: authConfig.jwtConfig.issuer,
        audience: authConfig.jwtConfig.audience,
        clockTolerance: authConfig.jwtConfig.clockTolerance
      }) as JwtPayload & IUserSession;

      // Validate payload structure
      if (!await this.validateTokenPayload(decoded)) {
        throw new Error('Invalid token payload structure');
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        permissions: decoded.permissions,
        sessionId: decoded.sessionId,
        deviceId: decoded.deviceId
      };
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  /**
   * Securely generates new token pair using refresh token
   * @param refreshToken Refresh token
   * @returns Promise resolving to new token package
   */
  public async refreshToken(refreshToken: string): Promise<IAuthTokens> {
    try {
      // Verify refresh token
      const decoded = verify(refreshToken, this.jwtPrivateKey, {
        algorithms: [this.algorithm],
        issuer: authConfig.jwtConfig.issuer
      }) as JwtPayload;

      // Validate refresh token specific claims
      if (!decoded.userId || !decoded.sessionId) {
        throw new Error('Invalid refresh token structure');
      }

      // Check if refresh token is blacklisted
      if (this.tokenBlacklist.has(refreshToken)) {
        throw new Error('Refresh token has been revoked');
      }

      // Reconstruct user session for new tokens
      const userSession: IUserSession = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        permissions: decoded.permissions,
        sessionId: decoded.sessionId,
        deviceId: decoded.deviceId
      };

      // Generate new token pair
      return await this.generateTokens(userSession);
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Revokes token and adds to blacklist
   * @param token Token to revoke
   */
  public async revokeToken(token: string): Promise<void> {
    try {
      const decoded = decode(token) as JwtPayload;
      if (!decoded) {
        throw new Error('Invalid token format');
      }

      // Add to blacklist with expiry time
      this.tokenBlacklist.add(token);

      // Store revocation timestamp for cleanup
      const expiryTimestamp = decoded.exp || 0;
      setTimeout(() => {
        this.tokenBlacklist.delete(token);
      }, (expiryTimestamp * 1000) - Date.now());
    } catch (error) {
      throw new Error(`Token revocation failed: ${error.message}`);
    }
  }

  /**
   * Validates token payload structure and content
   * @param payload Token payload to validate
   * @returns Promise resolving to validation result
   */
  private async validateTokenPayload(payload: any): Promise<boolean> {
    if (!payload) return false;

    // Check required fields
    const requiredFields = ['userId', 'email', 'role', 'permissions', 'sessionId'];
    for (const field of requiredFields) {
      if (!payload[field]) return false;
    }

    // Validate permissions array
    if (!Array.isArray(payload.permissions)) return false;

    // Validate timestamp fields
    if (payload.exp && typeof payload.exp !== 'number') return false;
    if (payload.iat && typeof payload.iat !== 'number') return false;

    return true;
  }

  /**
   * Generates secure session ID
   * @returns Secure random session ID
   */
  private generateSecureSessionId(): string {
    return createHash('sha256')
      .update(randomBytes(32))
      .digest('hex');
  }

  /**
   * Generates secure refresh token
   * @param userId User ID
   * @param sessionId Session ID
   * @returns Signed refresh token
   */
  private generateRefreshToken(userId: string, sessionId: string): string {
    return sign(
      {
        userId,
        sessionId,
        type: 'refresh',
        jti: randomBytes(16).toString('hex')
      },
      this.jwtPrivateKey,
      {
        algorithm: this.algorithm,
        expiresIn: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY,
        issuer: authConfig.jwtConfig.issuer
      }
    );
  }

  /**
   * Checks rate limit for token generation
   * @param userId User ID to check
   * @returns Boolean indicating if rate limit is exceeded
   */
  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const entry = this.rateLimiter.get(userId);

    if (!entry) {
      this.rateLimiter.set(userId, { count: 1, timestamp: now });
      return true;
    }

    if (now - entry.timestamp > AUTH_CONSTANTS.RATE_LIMIT_WINDOW) {
      this.rateLimiter.set(userId, { count: 1, timestamp: now });
      return true;
    }

    if (entry.count >= AUTH_CONSTANTS.MAX_TOKENS_PER_WINDOW) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Cleans up expired entries from token blacklist
   */
  private cleanupBlacklist(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const token of this.tokenBlacklist) {
      const decoded = decode(token) as JwtPayload;
      if (decoded && decoded.exp && decoded.exp < now) {
        this.tokenBlacklist.delete(token);
      }
    }
  }
}