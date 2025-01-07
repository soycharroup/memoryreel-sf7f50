// @package mongoose ^7.4.0
import { Document, Types } from 'mongoose';

/**
 * Enum defining access permission levels for library content
 */
export enum LibraryAccessLevel {
    VIEWER = 'viewer',
    CONTRIBUTOR = 'contributor',
    EDITOR = 'editor',
    ADMIN = 'admin'
}

/**
 * Interface for library settings configuration
 */
export interface ILibrarySettings {
    /** Enable automatic content processing on upload */
    autoProcessing: boolean;
    /** Enable AI-powered content analysis */
    aiProcessingEnabled: boolean;
    /** Enable library activity notifications */
    notificationsEnabled: boolean;
    /** Default access level for new content */
    defaultContentAccess: LibraryAccessLevel;
}

/**
 * Interface for individual library access permissions
 */
export interface ILibraryAccess {
    /** User ID with access permissions */
    userId: Types.ObjectId;
    /** Access level granted to the user */
    accessLevel: LibraryAccessLevel;
    /** Timestamp when access was granted */
    sharedAt: Date;
}

/**
 * Interface for public sharing link configuration
 */
export interface IPublicLink {
    /** Unique token for public access */
    token: string;
    /** Expiration date for the public link */
    expiryDate: Date;
    /** Access level granted through public link */
    accessLevel: LibraryAccessLevel;
}

/**
 * Interface for library sharing configuration
 */
export interface ILibrarySharing {
    /** List of users with access to the library */
    accessList: ILibraryAccess[];
    /** Public sharing link configuration */
    publicLink: IPublicLink;
    /** Flag indicating if library is publicly accessible */
    isPublic: boolean;
}

/**
 * Main library interface extending MongoDB Document
 */
export interface ILibrary extends Document {
    /** Unique library identifier */
    id: string;
    /** ID of the library owner */
    ownerId: Types.ObjectId;
    /** Library display name */
    name: string;
    /** Library description */
    description: string;
    /** Total storage space used in bytes */
    storageUsed: number;
    /** Total number of content items */
    contentCount: number;
    /** Library settings configuration */
    settings: ILibrarySettings;
    /** Library sharing configuration */
    sharing: ILibrarySharing;
    /** Library creation timestamp */
    createdAt: Date;
    /** Last update timestamp */
    updatedAt: Date;
}

/**
 * Default access level for new library content
 */
export const DEFAULT_ACCESS_LEVEL = LibraryAccessLevel.VIEWER;