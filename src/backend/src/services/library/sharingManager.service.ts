/**
 * @fileoverview Enhanced library sharing management service with security, audit logging, and performance optimizations
 * @version 1.0.0
 */

// External imports
import { Types } from 'mongoose'; // v7.4.0
import { randomBytes } from 'crypto'; // latest
import { RateLimiter } from 'rate-limiter-flexible'; // v2.4.1
import * as winston from 'winston'; // v3.8.0
import * as sgMail from '@sendgrid/mail'; // v7.7.0

// Internal imports
import { 
  ILibrary, 
  ILibrarySharing, 
  ILibraryAccess, 
  IPublicLink, 
  LibraryAccessLevel 
} from '../../interfaces/library.interface';
import { LibraryModel } from '../../models/library.model';
import { UserModel } from '../../models/user.model';
import { HTTP_STATUS, ERROR_TYPES, ERROR_MESSAGES } from '../../constants/error.constants';

// Constants
const PUBLIC_LINK_TOKEN_LENGTH = 32;
const DEFAULT_ACCESS_LEVEL = LibraryAccessLevel.VIEWER;
const MAX_SHARING_RATE = 100;
const SHARING_WINDOW = 3600;

/**
 * Enhanced service for managing library sharing operations
 */
export class SharingManager {
  private readonly libraryModel: typeof LibraryModel;
  private readonly userModel: typeof UserModel;
  private readonly logger: winston.Logger;
  private readonly rateLimiter: RateLimiter;

  constructor() {
    this.libraryModel = LibraryModel;
    this.userModel = UserModel;

    // Initialize Winston logger
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'sharing-audit.log' })
      ]
    });

    // Configure rate limiter
    this.rateLimiter = new RateLimiter({
      points: MAX_SHARING_RATE,
      duration: SHARING_WINDOW,
      blockDuration: SHARING_WINDOW
    });
  }

  /**
   * Share library with another user with enhanced security and audit logging
   */
  public async shareLibrary(
    libraryId: string,
    userEmail: string,
    accessLevel: LibraryAccessLevel = DEFAULT_ACCESS_LEVEL
  ): Promise<ILibrary> {
    try {
      // Check rate limit
      await this.rateLimiter.consume(libraryId);

      // Validate library exists and check permissions
      const library = await this.libraryModel.findById(libraryId);
      if (!library) {
        throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
      }

      // Find target user
      const targetUser = await this.userModel.findByEmail(userEmail);
      if (!targetUser) {
        throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
      }

      // Check for existing access
      const existingAccess = library.sharing.accessList.find(
        access => access.userId.toString() === targetUser.id
      );
      if (existingAccess) {
        throw new Error('User already has access to this library');
      }

      // Add user to access list
      const newAccess: ILibraryAccess = {
        userId: new Types.ObjectId(targetUser.id),
        accessLevel,
        sharedAt: new Date()
      };

      library.sharing.accessList.push(newAccess);

      // Log sharing event
      this.logger.info('Library shared', {
        libraryId,
        targetUserId: targetUser.id,
        accessLevel,
        timestamp: new Date()
      });

      // Send email notification
      await this.sendSharingNotification(userEmail, library.name, accessLevel);

      // Save and return updated library
      return await library.save();
    } catch (error) {
      this.logger.error('Library sharing failed', {
        libraryId,
        userEmail,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Revoke user access to library
   */
  public async revokeAccess(libraryId: string, userId: string): Promise<ILibrary> {
    const library = await this.libraryModel.findById(libraryId);
    if (!library) {
      throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
    }

    library.sharing.accessList = library.sharing.accessList.filter(
      access => access.userId.toString() !== userId
    );

    this.logger.info('Library access revoked', {
      libraryId,
      userId,
      timestamp: new Date()
    });

    return await library.save();
  }

  /**
   * Create public sharing link with expiration
   */
  public async createPublicLink(
    libraryId: string,
    expiryDays: number = 7,
    accessLevel: LibraryAccessLevel = DEFAULT_ACCESS_LEVEL
  ): Promise<IPublicLink> {
    const library = await this.libraryModel.findById(libraryId);
    if (!library) {
      throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
    }

    const token = randomBytes(PUBLIC_LINK_TOKEN_LENGTH).toString('hex');
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    const publicLink: IPublicLink = {
      token,
      expiryDate,
      accessLevel
    };

    library.sharing.publicLink = publicLink;
    library.sharing.isPublic = true;

    this.logger.info('Public link created', {
      libraryId,
      token,
      expiryDate,
      accessLevel
    });

    await library.save();
    return publicLink;
  }

  /**
   * Revoke public sharing link
   */
  public async revokePublicLink(libraryId: string): Promise<ILibrary> {
    const library = await this.libraryModel.findById(libraryId);
    if (!library) {
      throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
    }

    library.sharing.publicLink = undefined;
    library.sharing.isPublic = false;

    this.logger.info('Public link revoked', {
      libraryId,
      timestamp: new Date()
    });

    return await library.save();
  }

  /**
   * Update user access level
   */
  public async updateAccessLevel(
    libraryId: string,
    userId: string,
    newAccessLevel: LibraryAccessLevel
  ): Promise<ILibrary> {
    const library = await this.libraryModel.findById(libraryId);
    if (!library) {
      throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
    }

    const accessEntry = library.sharing.accessList.find(
      access => access.userId.toString() === userId
    );
    if (!accessEntry) {
      throw new Error('User does not have access to this library');
    }

    accessEntry.accessLevel = newAccessLevel;

    this.logger.info('Access level updated', {
      libraryId,
      userId,
      newAccessLevel,
      timestamp: new Date()
    });

    return await library.save();
  }

  /**
   * Get list of users with access to library
   */
  public async getSharedUsers(libraryId: string): Promise<ILibraryAccess[]> {
    const library = await this.libraryModel.findById(libraryId);
    if (!library) {
      throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
    }

    return library.sharing.accessList;
  }

  /**
   * Send email notification for library sharing
   */
  private async sendSharingNotification(
    userEmail: string,
    libraryName: string,
    accessLevel: LibraryAccessLevel
  ): Promise<void> {
    try {
      const msg = {
        to: userEmail,
        from: 'notifications@memoryreel.com',
        subject: 'Library Shared with You',
        text: `You have been granted ${accessLevel} access to the library: ${libraryName}`,
        html: `<p>You have been granted <strong>${accessLevel}</strong> access to the library: ${libraryName}</p>`
      };

      await sgMail.send(msg);
    } catch (error) {
      this.logger.error('Failed to send sharing notification', {
        userEmail,
        libraryName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}