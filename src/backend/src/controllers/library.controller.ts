/**
 * @fileoverview Enhanced library controller implementing secure library operations
 * with comprehensive validation, access control, and audit logging
 * Version: 1.0.0
 */

// External imports
import { Request, Response } from 'express'; // ^4.18.2
import { injectable } from 'inversify'; // ^6.0.1
import { controller, httpGet, httpPost, httpPut, httpDelete, authorize } from 'inversify-express-utils'; // ^6.4.3
import { rateLimit } from 'express-rate-limit'; // ^6.7.0
import { AuditLogger } from '@memoryreel/audit-logger'; // ^1.0.0

// Internal imports
import { ILibrary, ILibrarySettings, LibraryAccessLevel } from '../interfaces/library.interface';
import { LibraryManager } from '../services/library/libraryManager.service';
import { SharingManager } from '../services/library/sharingManager.service';
import { HTTP_STATUS, ERROR_MESSAGES } from '../constants/error.constants';
import { RequestValidator } from '../validators/library.validator';

@injectable()
@controller('/api/v1/libraries')
@rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false
})
export class LibraryController {
  constructor(
    private readonly libraryManager: LibraryManager,
    private readonly sharingManager: SharingManager,
    private readonly auditLogger: AuditLogger,
    private readonly requestValidator: RequestValidator
  ) {}

  /**
   * Create a new digital memory library with enhanced security
   */
  @httpPost('/')
  @authorize('library:create')
  public async createLibrary(req: Request, res: Response): Promise<Response> {
    try {
      // Validate and sanitize request data
      const validatedData = await this.requestValidator.validateCreateLibrary(req.body);

      // Create library with validated data
      const library = await this.libraryManager.createLibrary(
        req.user.id,
        validatedData.name,
        validatedData.description,
        validatedData.settings as ILibrarySettings,
        validatedData.aiConfig
      );

      // Log library creation event
      await this.auditLogger.log({
        action: 'LIBRARY_CREATED',
        userId: req.user.id,
        resourceId: library.id,
        metadata: {
          libraryName: library.name,
          settings: library.settings
        }
      });

      // Set security headers
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      res.setHeader('X-Content-Type-Options', 'nosniff');

      return res.status(HTTP_STATUS.CREATED).json({
        success: true,
        data: library
      });
    } catch (error) {
      await this.auditLogger.logError({
        action: 'LIBRARY_CREATION_FAILED',
        userId: req.user.id,
        error: error.message
      });

      return res.status(error.status || HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Update existing library with validation and access control
   */
  @httpPut('/:id')
  @authorize('library:update')
  public async updateLibrary(req: Request, res: Response): Promise<Response> {
    try {
      const libraryId = req.params.id;

      // Validate update data
      const validatedData = await this.requestValidator.validateUpdateLibrary(req.body);

      // Update library with validated data
      const updatedLibrary = await this.libraryManager.updateLibrary(
        libraryId,
        req.user.id,
        validatedData
      );

      // Log library update event
      await this.auditLogger.log({
        action: 'LIBRARY_UPDATED',
        userId: req.user.id,
        resourceId: libraryId,
        metadata: {
          updates: validatedData
        }
      });

      // Set security headers
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      res.setHeader('X-Content-Type-Options', 'nosniff');

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: updatedLibrary
      });
    } catch (error) {
      await this.auditLogger.logError({
        action: 'LIBRARY_UPDATE_FAILED',
        userId: req.user.id,
        resourceId: req.params.id,
        error: error.message
      });

      return res.status(error.status || HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get user's accessible libraries with caching
   */
  @httpGet('/')
  @authorize('library:view')
  public async getUserLibraries(req: Request, res: Response): Promise<Response> {
    try {
      const includeShared = req.query.includeShared === 'true';
      const libraries = await this.libraryManager.getUserLibraries(req.user.id, includeShared);

      // Set cache control headers for performance
      res.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes
      res.setHeader('Content-Security-Policy', "default-src 'self'");

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: libraries
      });
    } catch (error) {
      await this.auditLogger.logError({
        action: 'LIBRARY_FETCH_FAILED',
        userId: req.user.id,
        error: error.message
      });

      return res.status(error.status || HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Share library with another user
   */
  @httpPost('/:id/share')
  @authorize('library:share')
  public async shareLibrary(req: Request, res: Response): Promise<Response> {
    try {
      const { userEmail, accessLevel = LibraryAccessLevel.VIEWER } = req.body;
      const libraryId = req.params.id;

      const sharedLibrary = await this.sharingManager.shareLibrary(
        libraryId,
        userEmail,
        accessLevel
      );

      await this.auditLogger.log({
        action: 'LIBRARY_SHARED',
        userId: req.user.id,
        resourceId: libraryId,
        metadata: {
          sharedWith: userEmail,
          accessLevel
        }
      });

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: sharedLibrary
      });
    } catch (error) {
      await this.auditLogger.logError({
        action: 'LIBRARY_SHARE_FAILED',
        userId: req.user.id,
        resourceId: req.params.id,
        error: error.message
      });

      return res.status(error.status || HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Delete library with security checks
   */
  @httpDelete('/:id')
  @authorize('library:delete')
  public async deleteLibrary(req: Request, res: Response): Promise<Response> {
    try {
      const libraryId = req.params.id;

      await this.libraryManager.deleteLibrary(libraryId, req.user.id);

      await this.auditLogger.log({
        action: 'LIBRARY_DELETED',
        userId: req.user.id,
        resourceId: libraryId
      });

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Library deleted successfully'
      });
    } catch (error) {
      await this.auditLogger.logError({
        action: 'LIBRARY_DELETE_FAILED',
        userId: req.user.id,
        resourceId: req.params.id,
        error: error.message
      });

      return res.status(error.status || HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: error.message
      });
    }
  }
}