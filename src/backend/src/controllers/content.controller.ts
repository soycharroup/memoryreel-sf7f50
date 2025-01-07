import { injectable } from 'inversify';
import { Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { ContentProcessorService } from '../services/content/contentProcessor.service';
import { S3StorageService } from '../services/storage/s3.service';
import { ContentModel } from '../models/content.model';
import { IContent, ContentType, ContentError } from '../interfaces/content.interface';
import { logger } from '../utils/logger.util';
import { SUPPORTED_MEDIA_TYPES, MEDIA_SIZE_LIMITS } from '../constants/media.constants';

@injectable()
export class ContentController {
  private readonly upload: multer.Multer;
  private readonly rateLimiter: typeof rateLimit;

  constructor(
    private readonly contentProcessor: ContentProcessorService,
    private readonly storageService: S3StorageService
  ) {
    // Configure multer for secure file uploads
    this.upload = multer({
      limits: {
        fileSize: Math.max(MEDIA_SIZE_LIMITS.IMAGE_MAX_SIZE, MEDIA_SIZE_LIMITS.VIDEO_MAX_SIZE),
        files: 1
      },
      fileFilter: (req, file, cb) => {
        const isValidType = [...SUPPORTED_MEDIA_TYPES.IMAGE_TYPES, ...SUPPORTED_MEDIA_TYPES.VIDEO_TYPES]
          .includes(file.mimetype);
        cb(null, isValidType);
      }
    });

    // Configure rate limiting
    this.rateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later'
    });
  }

  /**
   * Handles secure content upload with comprehensive validation and processing
   */
  public async uploadContent(req: Request, res: Response): Promise<Response> {
    const startTime = Date.now();
    const correlationId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      logger.info('Starting content upload', { correlationId });

      // Validate request
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      // Validate user's storage quota
      const hasQuota = await this.storageService.validateStorageQuota(req.user.libraryId);
      if (!hasQuota) {
        return res.status(403).json({ error: 'Storage quota exceeded' });
      }

      // Process content with security checks
      const processedContent = await this.contentProcessor.processContent(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype as ContentType,
        {
          priority: 'normal',
          generateThumbnails: true
        }
      );

      // Store content securely
      const uploadResult = await this.storageService.uploadMedia(
        processedContent.id,
        req.user.libraryId,
        req.file.buffer,
        req.file.mimetype,
        {
          metadata: processedContent.metadata,
          tags: processedContent.aiAnalysis.tags.map(t => ({ name: t.tag, confidence: t.confidence }))
        }
      );

      // Create database record
      const content = await ContentModel.create({
        ...processedContent,
        s3Key: uploadResult.key,
        libraryId: req.user.libraryId
      });

      logger.info('Content upload completed', {
        correlationId,
        contentId: content.id,
        processingTime: Date.now() - startTime
      });

      return res.status(201).json({
        id: content.id,
        type: content.type,
        metadata: content.metadata,
        processingStatus: content.processingStatus,
        urls: {
          original: uploadResult.url,
          cdn: uploadResult.cdnUrl,
          thumbnails: uploadResult.thumbnails
        }
      });

    } catch (error) {
      logger.error('Content upload failed', {
        correlationId,
        error,
        processingTime: Date.now() - startTime
      });

      return res.status(500).json({
        error: 'Content upload failed',
        details: error.message
      });
    }
  }

  /**
   * Retrieves content with secure access control
   */
  public async getContent(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const correlationId = `get_${id}_${Date.now()}`;

    try {
      logger.info('Retrieving content', { correlationId, contentId: id });

      const content = await ContentModel.findById(id);
      if (!content) {
        return res.status(404).json({ error: 'Content not found' });
      }

      // Verify access permissions
      if (!this.hasAccessPermission(req.user, content)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Generate secure temporary URL
      const signedUrl = await this.storageService.getSignedUrl(content.s3Key, {
        expiresIn: 3600 // 1 hour
      });

      return res.json({
        id: content.id,
        type: content.type,
        metadata: content.metadata,
        aiAnalysis: content.aiAnalysis,
        urls: {
          signed: signedUrl,
          thumbnails: content.metadata.thumbnails
        }
      });

    } catch (error) {
      logger.error('Content retrieval failed', { correlationId, error });
      return res.status(500).json({ error: 'Failed to retrieve content' });
    }
  }

  /**
   * Performs secure content search with AI-powered features
   */
  public async searchContent(req: Request, res: Response): Promise<Response> {
    const { query, type, dateRange, faces, tags } = req.query;
    const correlationId = `search_${Date.now()}`;

    try {
      logger.info('Searching content', { correlationId, query });

      let searchQuery: any = { libraryId: req.user.libraryId };

      // Apply search filters
      if (type) {
        searchQuery.type = type;
      }

      if (dateRange) {
        searchQuery['metadata.capturedAt'] = {
          $gte: new Date(dateRange.start),
          $lte: new Date(dateRange.end)
        };
      }

      if (faces) {
        searchQuery['aiAnalysis.faces.personId'] = { $in: faces };
      }

      if (tags) {
        searchQuery['aiAnalysis.tags.tag'] = { $in: tags };
      }

      const results = await ContentModel.find(searchQuery)
        .sort({ 'metadata.capturedAt': -1 })
        .limit(50);

      return res.json({
        results: results.map(content => ({
          id: content.id,
          type: content.type,
          metadata: content.metadata,
          aiAnalysis: content.aiAnalysis,
          thumbnails: content.metadata.thumbnails
        })),
        total: results.length
      });

    } catch (error) {
      logger.error('Content search failed', { correlationId, error });
      return res.status(500).json({ error: 'Search operation failed' });
    }
  }

  /**
   * Securely deletes content with comprehensive cleanup
   */
  public async deleteContent(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const correlationId = `delete_${id}_${Date.now()}`;

    try {
      logger.info('Deleting content', { correlationId, contentId: id });

      const content = await ContentModel.findById(id);
      if (!content) {
        return res.status(404).json({ error: 'Content not found' });
      }

      // Verify deletion permissions
      if (!this.hasDeletePermission(req.user, content)) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      // Delete from storage
      await this.storageService.deleteMedia(content.s3Key);

      // Delete database record
      await ContentModel.findByIdAndDelete(id);

      logger.info('Content deleted successfully', { correlationId, contentId: id });
      return res.status(204).send();

    } catch (error) {
      logger.error('Content deletion failed', { correlationId, error });
      return res.status(500).json({ error: 'Deletion failed' });
    }
  }

  /**
   * Private helper methods
   */
  private hasAccessPermission(user: any, content: IContent): boolean {
    return user.libraryId === content.libraryId.toString() ||
           content.metadata.sharedWith?.includes(user.id);
  }

  private hasDeletePermission(user: any, content: IContent): boolean {
    return user.libraryId === content.libraryId.toString() ||
           user.role === 'admin';
  }
}