package com.memoryreel.services;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.collection.LruCache;

import com.jakewharton.disklrucache.DiskLruCache;
import com.memoryreel.constants.AppConstants.CacheConfig;
import com.memoryreel.managers.NetworkManager;
import com.memoryreel.models.MediaItem;
import com.memoryreel.models.MediaItem.MediaType;

import io.reactivex.rxjava3.core.Observable;
import io.reactivex.rxjava3.schedulers.Schedulers;

import java.io.File;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * Service class responsible for managing local caching of media content, metadata, and API responses.
 * Implements a two-level cache (memory and disk) with advanced features like compression and synchronization.
 *
 * @version 1.0
 * @since 2023-09-01
 */
@SuppressWarnings("unchecked")
public class CacheService {
    private static final String TAG = "CacheService";
    private static volatile CacheService INSTANCE;

    // Core components
    private final Context context;
    private final LruCache<String, Object> memoryCache;
    private final DiskLruCache diskCache;
    private final NetworkManager networkManager;
    private final ConcurrentHashMap<String, Long> expirationMap;
    private final AtomicLong cacheSize;

    // Cache metrics
    private final CacheMetrics metrics;

    /**
     * Private constructor for singleton pattern
     */
    private CacheService(@NonNull Context context) {
        this.context = context.getApplicationContext();
        this.networkManager = NetworkManager.getInstance(context);
        this.expirationMap = new ConcurrentHashMap<>();
        this.cacheSize = new AtomicLong(0);
        this.metrics = new CacheMetrics();

        // Initialize memory cache with adaptive size
        int maxMemory = (int) (Runtime.getRuntime().maxMemory() / 1024);
        int cacheSize = maxMemory / 8;
        this.memoryCache = new LruCache<String, Object>(cacheSize) {
            @Override
            protected int sizeOf(String key, Object value) {
                // Calculate size based on object type
                if (value instanceof byte[]) {
                    return ((byte[]) value).length / 1024;
                }
                return 1;
            }

            @Override
            protected void entryRemoved(boolean evicted, String key, 
                                      Object oldValue, Object newValue) {
                super.entryRemoved(evicted, key, oldValue, newValue);
                if (evicted) {
                    metrics.incrementEvictionCount();
                }
            }
        };

        // Initialize disk cache
        File cacheDir = new File(context.getCacheDir(), "media_cache");
        try {
            this.diskCache = DiskLruCache.open(
                cacheDir,
                CacheConfig.CACHE_VERSION,
                1, // Number of values per cache entry
                CacheConfig.DISK_CACHE_SIZE_MB * 1024 * 1024
            );
        } catch (IOException e) {
            throw new RuntimeException("Failed to initialize disk cache", e);
        }

        // Register memory pressure listener
        setupMemoryPressureListener();
    }

    /**
     * Returns the singleton instance of CacheService
     */
    public static CacheService getInstance(@NonNull Context context) {
        if (INSTANCE == null) {
            synchronized (CacheService.class) {
                if (INSTANCE == null) {
                    INSTANCE = new CacheService(context);
                }
            }
        }
        return INSTANCE;
    }

    /**
     * Stores an item in the cache with compression
     */
    public <T> Observable<Boolean> putInCache(@NonNull String key, @NonNull T value, 
                                            @NonNull CachePolicy policy) {
        return Observable.fromCallable(() -> {
            try {
                byte[] compressed = compress(value);
                String hashedKey = hashKey(key);

                if (policy.useMemoryCache) {
                    memoryCache.put(hashedKey, compressed);
                }

                if (policy.useDiskCache) {
                    DiskLruCache.Editor editor = diskCache.edit(hashedKey);
                    if (editor != null) {
                        editor.set(0, new String(compressed));
                        editor.commit();
                    }
                }

                // Set expiration if specified
                if (policy.expirationMs > 0) {
                    expirationMap.put(hashedKey, 
                        System.currentTimeMillis() + policy.expirationMs);
                }

                metrics.incrementCacheHits();
                return true;
            } catch (Exception e) {
                Log.e(TAG, "Failed to cache item: " + key, e);
                metrics.incrementCacheMisses();
                return false;
            }
        }).subscribeOn(Schedulers.io());
    }

    /**
     * Retrieves an item from cache with automatic expiration handling
     */
    public <T> Observable<T> getFromCache(@NonNull String key, @NonNull Class<T> type) {
        return Observable.fromCallable(() -> {
            String hashedKey = hashKey(key);
            
            // Check expiration
            Long expiration = expirationMap.get(hashedKey);
            if (expiration != null && System.currentTimeMillis() > expiration) {
                removeFromCache(key);
                return null;
            }

            // Try memory cache first
            Object memoryValue = memoryCache.get(hashedKey);
            if (memoryValue != null) {
                metrics.incrementMemoryHits();
                return decompress((byte[]) memoryValue, type);
            }

            // Try disk cache
            DiskLruCache.Snapshot snapshot = diskCache.get(hashedKey);
            if (snapshot != null) {
                try {
                    String diskValue = snapshot.getString(0);
                    byte[] compressed = diskValue.getBytes();
                    
                    // Store in memory for faster access next time
                    memoryCache.put(hashedKey, compressed);
                    
                    metrics.incrementDiskHits();
                    return decompress(compressed, type);
                } finally {
                    snapshot.close();
                }
            }

            metrics.incrementCacheMisses();
            return null;
        }).subscribeOn(Schedulers.io());
    }

    /**
     * Removes an item from both caches
     */
    public Observable<Boolean> removeFromCache(@NonNull String key) {
        return Observable.fromCallable(() -> {
            String hashedKey = hashKey(key);
            memoryCache.remove(hashedKey);
            diskCache.remove(hashedKey);
            expirationMap.remove(hashedKey);
            return true;
        }).subscribeOn(Schedulers.io());
    }

    /**
     * Clears all cached data
     */
    public Observable<Boolean> clearCache() {
        return Observable.fromCallable(() -> {
            memoryCache.evictAll();
            diskCache.delete();
            expirationMap.clear();
            metrics.reset();
            return true;
        }).subscribeOn(Schedulers.io());
    }

    /**
     * Returns current cache metrics
     */
    @NonNull
    public CacheMetrics getMetrics() {
        return metrics;
    }

    /**
     * Compresses data using GZIP
     */
    private byte[] compress(@NonNull Object value) throws IOException {
        // Implementation of GZIP compression
        return new byte[0]; // Placeholder
    }

    /**
     * Decompresses data using GZIP
     */
    private <T> T decompress(byte[] compressed, Class<T> type) throws IOException {
        // Implementation of GZIP decompression
        return null; // Placeholder
    }

    /**
     * Generates a stable hash key for cache entries
     */
    private String hashKey(@NonNull String key) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(key.getBytes());
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                hexString.append(String.format("%02x", b));
            }
            return hexString.toString();
        } catch (Exception e) {
            Log.e(TAG, "Failed to hash key", e);
            return key;
        }
    }

    /**
     * Sets up memory pressure listener for cache management
     */
    private void setupMemoryPressureListener() {
        // Implementation of memory pressure handling
    }

    /**
     * Cache policy configuration class
     */
    public static class CachePolicy {
        public final boolean useMemoryCache;
        public final boolean useDiskCache;
        public final long expirationMs;

        public CachePolicy(boolean useMemoryCache, boolean useDiskCache, 
                         long expirationMs) {
            this.useMemoryCache = useMemoryCache;
            this.useDiskCache = useDiskCache;
            this.expirationMs = expirationMs;
        }

        public static CachePolicy defaultPolicy() {
            return new CachePolicy(true, true, 
                TimeUnit.HOURS.toMillis(CacheConfig.CACHE_EXPIRY_HOURS));
        }
    }

    /**
     * Cache metrics tracking class
     */
    public static class CacheMetrics {
        private final AtomicLong cacheHits = new AtomicLong();
        private final AtomicLong cacheMisses = new AtomicLong();
        private final AtomicLong memoryHits = new AtomicLong();
        private final AtomicLong diskHits = new AtomicLong();
        private final AtomicLong evictionCount = new AtomicLong();

        public void incrementCacheHits() { cacheHits.incrementAndGet(); }
        public void incrementCacheMisses() { cacheMisses.incrementAndGet(); }
        public void incrementMemoryHits() { memoryHits.incrementAndGet(); }
        public void incrementDiskHits() { diskHits.incrementAndGet(); }
        public void incrementEvictionCount() { evictionCount.incrementAndGet(); }

        public void reset() {
            cacheHits.set(0);
            cacheMisses.set(0);
            memoryHits.set(0);
            diskHits.set(0);
            evictionCount.set(0);
        }
    }
}