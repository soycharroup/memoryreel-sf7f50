package com.memoryreel.utils;

import android.webkit.MimeTypeMap;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.memoryreel.utils.LogUtils;
import com.memoryreel.constants.MediaConstants;
import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;
import com.memoryreel.constants.ErrorConstants.ERROR_MESSAGES;

import java.io.*;
import java.util.Arrays;
import java.util.UUID;

/**
 * Enterprise-grade file utility class for MemoryReel Android application.
 * Provides secure and efficient file operations with comprehensive validation,
 * error handling, and logging for media content management.
 */
public final class FileUtils {
    private static final String TAG = "FileUtils";
    private static final int DEFAULT_BUFFER_SIZE = 8192;
    private static final String TEMP_FILE_PREFIX = "memoryreel_";

    /**
     * Private constructor to prevent instantiation
     * @throws IllegalStateException if instantiation is attempted
     */
    private FileUtils() {
        throw new IllegalStateException("Utility class cannot be instantiated");
    }

    /**
     * Validates media files against supported formats and size limits
     * @param file File to validate
     * @return true if file meets all validation criteria
     */
    public static boolean isValidMediaFile(@NonNull File file) {
        try {
            // Basic file validation
            if (!file.exists() || !file.canRead()) {
                LogUtils.e(TAG, "File does not exist or is not readable", null, ERROR_TYPES.MEDIA_ERROR);
                return false;
            }

            // Get and validate MIME type
            String mimeType = getMimeType(file);
            if (mimeType == null) {
                LogUtils.e(TAG, "Unable to determine file MIME type", null, ERROR_TYPES.MEDIA_ERROR);
                return false;
            }

            // Check file size based on type
            long fileSize = file.length();
            if (mimeType.startsWith("image/")) {
                if (!Arrays.asList(MediaConstants.SUPPORTED_IMAGE_TYPES).contains(mimeType)) {
                    LogUtils.e(TAG, "Unsupported image type: " + mimeType, null, ERROR_TYPES.MEDIA_ERROR);
                    return false;
                }
                if (fileSize > MediaConstants.IMAGE_MAX_SIZE_BYTES) {
                    LogUtils.e(TAG, "Image file too large: " + fileSize + " bytes", null, ERROR_TYPES.MEDIA_ERROR);
                    return false;
                }
            } else if (mimeType.startsWith("video/")) {
                if (!Arrays.asList(MediaConstants.SUPPORTED_VIDEO_TYPES).contains(mimeType)) {
                    LogUtils.e(TAG, "Unsupported video type: " + mimeType, null, ERROR_TYPES.MEDIA_ERROR);
                    return false;
                }
                if (fileSize > MediaConstants.VIDEO_MAX_SIZE_BYTES) {
                    LogUtils.e(TAG, "Video file too large: " + fileSize + " bytes", null, ERROR_TYPES.MEDIA_ERROR);
                    return false;
                }
            } else {
                LogUtils.e(TAG, "Invalid media type: " + mimeType, null, ERROR_TYPES.MEDIA_ERROR);
                return false;
            }

            LogUtils.d(TAG, "File validation successful: " + file.getName());
            return true;
        } catch (SecurityException e) {
            LogUtils.e(TAG, "Security exception during file validation", e, ERROR_TYPES.MEDIA_ERROR);
            return false;
        } catch (Exception e) {
            LogUtils.e(TAG, "Unexpected error during file validation", e, ERROR_TYPES.MEDIA_ERROR);
            return false;
        }
    }

    /**
     * Determines MIME type from file extension
     * @param file File to check
     * @return MIME type or null if unknown
     */
    @Nullable
    public static String getMimeType(@NonNull File file) {
        try {
            String fileName = file.getName();
            String extension = fileName.substring(fileName.lastIndexOf(".") + 1).toLowerCase();
            String mimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
            
            LogUtils.d(TAG, "MIME type for " + fileName + ": " + mimeType);
            return mimeType;
        } catch (Exception e) {
            LogUtils.e(TAG, "Error determining MIME type", e, ERROR_TYPES.MEDIA_ERROR);
            return null;
        }
    }

    /**
     * Creates secure temporary file with proper cleanup handling
     * @param prefix File name prefix
     * @param extension File extension
     * @param directory Parent directory
     * @return Created temporary file
     * @throws IOException if file creation fails
     */
    @NonNull
    public static File createTempFile(@NonNull String prefix, @NonNull String extension,
                                    @NonNull File directory) throws IOException {
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("Failed to create directory: " + directory);
        }

        String uniqueFileName = prefix + UUID.randomUUID().toString() + "." + extension;
        File tempFile = new File(directory, uniqueFileName);

        if (!tempFile.createNewFile()) {
            throw new IOException("Failed to create temp file: " + uniqueFileName);
        }

        LogUtils.d(TAG, "Created temporary file: " + tempFile.getAbsolutePath());
        return tempFile;
    }

    /**
     * Performs efficient buffered file copy with progress tracking
     * @param source Source file
     * @param destination Destination file
     * @return true if copy completed successfully
     */
    public static boolean copyFile(@NonNull File source, @NonNull File destination) {
        if (!source.exists() || !source.canRead()) {
            LogUtils.e(TAG, "Source file not accessible", null, ERROR_TYPES.MEDIA_ERROR);
            return false;
        }

        File parentDir = destination.getParentFile();
        if (parentDir != null && !parentDir.exists() && !parentDir.mkdirs()) {
            LogUtils.e(TAG, "Failed to create destination directory", null, ERROR_TYPES.MEDIA_ERROR);
            return false;
        }

        try (BufferedInputStream bis = new BufferedInputStream(new FileInputStream(source));
             BufferedOutputStream bos = new BufferedOutputStream(new FileOutputStream(destination))) {

            byte[] buffer = new byte[DEFAULT_BUFFER_SIZE];
            long totalBytes = source.length();
            long copiedBytes = 0;
            int read;

            while ((read = bis.read(buffer)) != -1) {
                bos.write(buffer, 0, read);
                copiedBytes += read;
                
                // Log progress at 25% intervals
                if (copiedBytes % (totalBytes / 4) < DEFAULT_BUFFER_SIZE) {
                    int progress = (int) ((copiedBytes * 100) / totalBytes);
                    LogUtils.d(TAG, "Copy progress: " + progress + "%");
                }
            }

            bos.flush();
            LogUtils.d(TAG, "File copy completed: " + destination.getAbsolutePath());
            return true;
        } catch (IOException e) {
            LogUtils.e(TAG, "Error copying file", e, ERROR_TYPES.MEDIA_ERROR);
            return false;
        }
    }

    /**
     * Safely deletes files and directories with recursive handling
     * @param file File or directory to delete
     * @return true if deletion successful
     */
    public static boolean deleteFile(@NonNull File file) {
        try {
            if (file.isDirectory()) {
                File[] contents = file.listFiles();
                if (contents != null) {
                    for (File f : contents) {
                        if (!deleteFile(f)) {
                            return false;
                        }
                    }
                }
            }

            boolean deleted = file.delete();
            if (deleted) {
                LogUtils.d(TAG, "Successfully deleted: " + file.getAbsolutePath());
            } else {
                LogUtils.e(TAG, "Failed to delete: " + file.getAbsolutePath(), 
                          null, ERROR_TYPES.MEDIA_ERROR);
            }
            return deleted;
        } catch (SecurityException e) {
            LogUtils.e(TAG, "Security exception during file deletion", e, ERROR_TYPES.MEDIA_ERROR);
            return false;
        }
    }
}