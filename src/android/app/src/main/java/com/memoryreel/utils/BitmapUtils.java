package com.memoryreel.utils;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.content.Context;
import androidx.annotation.NonNull;
import androidx.exifinterface.media.ExifInterface;
import com.memoryreel.constants.MediaConstants;
import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;

/**
 * Enterprise-grade bitmap manipulation utility class for MemoryReel Android application.
 * Provides memory-efficient image processing with comprehensive error handling and optimization.
 */
public final class BitmapUtils {
    private static final String TAG = "BitmapUtils";
    private static final int DEFAULT_COMPRESSION_QUALITY = MediaConstants.ImageProcessingConfig.QUALITY_LEVEL_MEDIUM;
    private static final int MAX_BITMAP_DIMENSION = 4096;
    private static final int THUMBNAIL_MAX_DIMENSION = MediaConstants.ImageProcessingConfig.ThumbnailSizes.LARGE_WIDTH;
    private static final int MIN_COMPRESSION_QUALITY = 10;
    private static final int MAX_COMPRESSION_QUALITY = 100;

    /**
     * Private constructor to prevent instantiation
     * @throws IllegalStateException if instantiation is attempted
     */
    private BitmapUtils() {
        throw new IllegalStateException("Utility class");
    }

    /**
     * Compresses a bitmap with memory optimization and quality control
     * @param bitmap Source bitmap to compress
     * @param quality Compression quality (1-100)
     * @return Compressed bitmap data or null if compression fails
     */
    @NonNull
    @Synchronized
    public static byte[] compressBitmap(@NonNull Bitmap bitmap, int quality) {
        // Validate parameters
        if (bitmap.isRecycled()) {
            LogUtils.e(TAG, "Input bitmap is recycled", null, ERROR_TYPES.MEDIA_ERROR);
            return null;
        }

        int validQuality = Math.min(Math.max(quality, MIN_COMPRESSION_QUALITY), MAX_COMPRESSION_QUALITY);
        ByteArrayOutputStream outputStream = null;

        try {
            // Estimate initial buffer size based on bitmap dimensions and quality
            int initialSize = bitmap.getWidth() * bitmap.getHeight() * (validQuality / 100);
            outputStream = new ByteArrayOutputStream(initialSize);

            bitmap.compress(Bitmap.CompressFormat.JPEG, validQuality, outputStream);
            LogUtils.d(TAG, "Bitmap compressed successfully with quality: " + validQuality);
            
            return outputStream.toByteArray();
        } catch (OutOfMemoryError e) {
            LogUtils.e(TAG, "OutOfMemoryError during compression", e, ERROR_TYPES.MEDIA_ERROR);
            // Attempt compression with lower quality
            if (validQuality > MIN_COMPRESSION_QUALITY) {
                return compressBitmap(bitmap, validQuality / 2);
            }
            return null;
        } finally {
            if (outputStream != null) {
                try {
                    outputStream.close();
                } catch (IOException e) {
                    LogUtils.e(TAG, "Error closing output stream", e, ERROR_TYPES.MEDIA_ERROR);
                }
            }
        }
    }

    /**
     * Resizes a bitmap while maintaining aspect ratio and optimizing memory usage
     * @param bitmap Source bitmap to resize
     * @param maxWidth Maximum width constraint
     * @param maxHeight Maximum height constraint
     * @return Resized bitmap or null if resizing fails
     */
    @NonNull
    @Synchronized
    public static Bitmap resizeBitmap(@NonNull Bitmap bitmap, int maxWidth, int maxHeight) {
        if (bitmap.isRecycled()) {
            LogUtils.e(TAG, "Input bitmap is recycled", null, ERROR_TYPES.MEDIA_ERROR);
            return null;
        }

        int width = bitmap.getWidth();
        int height = bitmap.getHeight();

        // Calculate scaling factors
        float scaleWidth = ((float) maxWidth) / width;
        float scaleHeight = ((float) maxHeight) / height;
        float scaleFactor = Math.min(scaleWidth, scaleHeight);

        // Check if resizing is needed
        if (scaleFactor >= 1.0f) {
            LogUtils.d(TAG, "Resizing not needed - bitmap within constraints");
            return bitmap;
        }

        Matrix matrix = new Matrix();
        matrix.setScale(scaleFactor, scaleFactor);

        try {
            Bitmap resizedBitmap = Bitmap.createBitmap(
                bitmap, 0, 0, width, height, matrix, true);
            LogUtils.d(TAG, "Bitmap resized successfully");
            return resizedBitmap;
        } catch (OutOfMemoryError e) {
            LogUtils.e(TAG, "OutOfMemoryError during resize", e, ERROR_TYPES.MEDIA_ERROR);
            // Attempt with more aggressive scaling
            if (scaleFactor > 0.5f) {
                return resizeBitmap(bitmap, maxWidth / 2, maxHeight / 2);
            }
            return null;
        }
    }

    /**
     * Rotates bitmap according to EXIF orientation with memory optimization
     * @param bitmap Source bitmap to rotate
     * @param imagePath Path to original image for EXIF data
     * @return Rotated bitmap or original if rotation not needed
     */
    @NonNull
    @Synchronized
    public static Bitmap rotateBitmap(@NonNull Bitmap bitmap, @NonNull String imagePath) {
        try {
            ExifInterface exif = new ExifInterface(imagePath);
            int orientation = exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL);

            Matrix matrix = new Matrix();
            switch (orientation) {
                case ExifInterface.ORIENTATION_ROTATE_90:
                    matrix.postRotate(90);
                    break;
                case ExifInterface.ORIENTATION_ROTATE_180:
                    matrix.postRotate(180);
                    break;
                case ExifInterface.ORIENTATION_ROTATE_270:
                    matrix.postRotate(270);
                    break;
                default:
                    return bitmap;
            }

            Bitmap rotatedBitmap = Bitmap.createBitmap(
                bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
            LogUtils.d(TAG, "Bitmap rotated successfully");
            return rotatedBitmap;
        } catch (IOException e) {
            LogUtils.e(TAG, "Error reading EXIF data", e, ERROR_TYPES.MEDIA_ERROR);
            return bitmap;
        } catch (OutOfMemoryError e) {
            LogUtils.e(TAG, "OutOfMemoryError during rotation", e, ERROR_TYPES.MEDIA_ERROR);
            return bitmap;
        }
    }

    /**
     * Creates optimized thumbnail from bitmap
     * @param bitmap Source bitmap
     * @return Thumbnail bitmap or null if creation fails
     */
    @NonNull
    @Synchronized
    public static Bitmap createThumbnail(@NonNull Bitmap bitmap) {
        if (bitmap.isRecycled()) {
            LogUtils.e(TAG, "Input bitmap is recycled", null, ERROR_TYPES.MEDIA_ERROR);
            return null;
        }

        try {
            // Calculate thumbnail dimensions maintaining aspect ratio
            float ratio = Math.min(
                (float) THUMBNAIL_MAX_DIMENSION / bitmap.getWidth(),
                (float) THUMBNAIL_MAX_DIMENSION / bitmap.getHeight()
            );

            int thumbnailWidth = Math.round(bitmap.getWidth() * ratio);
            int thumbnailHeight = Math.round(bitmap.getHeight() * ratio);

            Bitmap thumbnail = Bitmap.createScaledBitmap(
                bitmap, thumbnailWidth, thumbnailHeight, true);
            LogUtils.d(TAG, "Thumbnail created successfully");
            return thumbnail;
        } catch (OutOfMemoryError e) {
            LogUtils.e(TAG, "OutOfMemoryError creating thumbnail", e, ERROR_TYPES.MEDIA_ERROR);
            // Attempt with smaller dimensions
            return createThumbnail(resizeBitmap(bitmap, 
                THUMBNAIL_MAX_DIMENSION / 2, THUMBNAIL_MAX_DIMENSION / 2));
        }
    }

    /**
     * Decodes bitmap from file with memory-efficient sampling
     * @param imagePath Path to image file
     * @param reqWidth Required width
     * @param reqHeight Required height
     * @return Decoded bitmap or null if decoding fails
     */
    @NonNull
    @Synchronized
    public static Bitmap decodeSampledBitmap(@NonNull String imagePath, 
                                           int reqWidth, int reqHeight) {
        try {
            // First decode with inJustDecodeBounds=true to check dimensions
            final BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(imagePath, options);

            // Calculate inSampleSize
            options.inSampleSize = calculateInSampleSize(options, reqWidth, reqHeight);

            // Decode bitmap with inSampleSize set
            options.inJustDecodeBounds = false;
            options.inPreferredConfig = Bitmap.Config.ARGB_8888;
            
            Bitmap bitmap = BitmapFactory.decodeFile(imagePath, options);
            LogUtils.d(TAG, "Bitmap decoded successfully with sample size: " + options.inSampleSize);
            return bitmap;
        } catch (OutOfMemoryError e) {
            LogUtils.e(TAG, "OutOfMemoryError decoding bitmap", e, ERROR_TYPES.MEDIA_ERROR);
            // Attempt with more aggressive sampling
            return decodeSampledBitmap(imagePath, reqWidth / 2, reqHeight / 2);
        }
    }

    /**
     * Calculates optimal sample size for memory-efficient bitmap loading
     */
    private static int calculateInSampleSize(BitmapFactory.Options options,
                                           int reqWidth, int reqHeight) {
        final int height = options.outHeight;
        final int width = options.outWidth;
        int inSampleSize = 1;

        if (height > reqHeight || width > reqWidth) {
            final int halfHeight = height / 2;
            final int halfWidth = width / 2;

            while ((halfHeight / inSampleSize) >= reqHeight
                    && (halfWidth / inSampleSize) >= reqWidth) {
                inSampleSize *= 2;
            }
        }

        return inSampleSize;
    }
}