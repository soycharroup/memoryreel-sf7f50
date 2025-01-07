/**
 * @fileoverview TypeScript declaration file defining comprehensive API interfaces and types 
 * for frontend-backend communication in the MemoryReel platform.
 * @version 1.0.0
 */

/**
 * HTTP methods supported by the API
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Content types supported by the platform
 */
export type ContentType = 'IMAGE' | 'VIDEO' | 'AUDIO';

/**
 * Content processing status states
 */
export type ProcessingStatus = 'UPLOADED' | 'QUEUED' | 'ANALYZING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';

/**
 * Multi-factor authentication methods
 */
export type MFAType = 'SMS' | 'EMAIL' | 'AUTHENTICATOR' | 'RECOVERY_CODE';

/**
 * Rate limit information interface
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Generic API response wrapper interface
 */
export interface APIResponse<T> {
  data: T;
  success: boolean;
  error: APIError | null;
  rateLimit: RateLimitInfo;
}

/**
 * Enhanced API error interface with retry information
 */
export interface APIError {
  code: string;
  message: string;
  details: Record<string, any>;
  retryAfter: number | null;
}

/**
 * Authentication credentials interface
 */
export interface AuthCredentials {
  email: string;
  password: string;
  mfaCode: string | null;
}

/**
 * Enhanced content metadata interface
 */
export interface ContentMetadata {
  filename: string;
  size: number;
  mimeType: string;
  dimensions: {
    width: number;
    height: number;
  };
  duration: number | null;
  location: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  capturedAt: Date;
  device: {
    make: string;
    model: string;
    software?: string;
  };
}

/**
 * Comprehensive authentication API interface
 */
export interface AuthAPI {
  login(credentials: AuthCredentials): Promise<APIResponse<{ token: string }>>;
  register(userData: AuthCredentials & { name: string }): Promise<APIResponse<{ userId: string }>>;
  refreshToken(refreshToken: string): Promise<APIResponse<{ token: string }>>;
  setupMFA(type: MFAType): Promise<APIResponse<{ secret?: string; qrCode?: string }>>;
  verifyMFA(code: string, type: MFAType): Promise<APIResponse<{ verified: boolean }>>;
  generateRecoveryCodes(): Promise<APIResponse<{ codes: string[] }>>;
}

/**
 * Enhanced content management API interface
 */
export interface ContentAPI {
  upload(file: File, metadata: Partial<ContentMetadata>): Promise<APIResponse<{ contentId: string }>>;
  getContent(contentId: string): Promise<APIResponse<{
    content: {
      id: string;
      metadata: ContentMetadata;
      status: ProcessingStatus;
      aiTags: string[];
      faces: Array<{
        id: string;
        confidence: number;
        coordinates: { x: number; y: number; width: number; height: number };
      }>;
    }
  }>>;
  updateMetadata(contentId: string, metadata: Partial<ContentMetadata>): Promise<APIResponse<{ updated: boolean }>>;
  deleteContent(contentId: string): Promise<APIResponse<{ deleted: boolean }>>;
  getUploadUrl(filename: string, contentType: string): Promise<APIResponse<{
    url: string;
    fields: Record<string, string>;
    expires: number;
  }>>;
  getStreamingUrl(contentId: string, quality?: string): Promise<APIResponse<{
    url: string;
    expires: number;
    drm?: {
      licenseUrl: string;
      token: string;
    };
  }>>;
}