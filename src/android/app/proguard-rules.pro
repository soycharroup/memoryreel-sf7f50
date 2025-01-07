# React Native Core Rules
# Version: react-native@0.72.4
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep,allowobfuscation @interface com.facebook.common.internal.DoNotStrip
-keep,allowobfuscation @interface com.facebook.react.bridge.*

-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keep @com.facebook.common.internal.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.common.internal.DoNotStrip *;
}

-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
    void set*(***);
    *** get*();
}

# React Native Bridge
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.react.uimanager.** { *; }

# Keep custom React Native modules
-keep class com.memoryreel.modules.** { *; }
-keep class com.memoryreel.modules.rnbridge.RNPackage { *; }

# AI Services Integration
# Keep model classes and service implementations
-keep class com.memoryreel.models.AIAnalysis { *; }
-keep class com.memoryreel.models.FaceData { *; }
-keep class com.memoryreel.services.ai.** { *; }
-keep class com.memoryreel.services.openai.** { *; }
-keep class com.memoryreel.services.aws.** { *; }
-keep class com.memoryreel.services.google.** { *; }

# Media Processing
-keep class com.memoryreel.models.MediaItem { *; }
-keep class com.memoryreel.models.Library { *; }
-keep class com.memoryreel.utils.MediaUtils { *; }
-keep class com.memoryreel.processors.** { *; }
-keep class com.memoryreel.cache.** { *; }

# ExoPlayer Rules
-keep class com.google.android.exoplayer2.** { *; }
-dontwarn com.google.android.exoplayer2.**

# TV Support (androidx.leanback)
# Version: androidx.leanback:leanback@1.2.0-alpha02
-keep class androidx.leanback.** { *; }
-keep class com.memoryreel.tv.** { *; }
-keep class com.memoryreel.navigation.** { *; }
-keepclassmembers class com.memoryreel.tv.** { *; }

# AWS SDK Rules
-keep class com.amazonaws.** { *; }
-keep class com.amazon.** { *; }
-keepnames class com.amazonaws.** { *; }
-dontwarn com.amazonaws.**
-dontwarn com.amazon.**

# OkHttp Rules
-keepattributes Signature
-keepattributes *Annotation*
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# Gson Rules
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# Retrofit Rules
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement
-dontwarn javax.annotation.**
-dontwarn kotlin.Unit
-dontwarn retrofit2.KotlinExtensions
-dontwarn retrofit2.KotlinExtensions$*

# RxJava Rules
-dontwarn java.util.concurrent.Flow*
-dontwarn io.reactivex.rxjava3.internal.util.AppendOnlyLinkedArrayList
-keep class io.reactivex.rxjava3.** { *; }

# TensorFlow Lite Rules
-keep class org.tensorflow.lite.** { *; }
-dontwarn org.tensorflow.lite.**

# Security Rules
-keepattributes SourceFile,LineNumberTable
-keepattributes Exceptions
-keepattributes InnerClasses

# Optimization Flags
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-optimizationpasses 5
-allowaccessmodification
-dontpreverify

# Keep JavaScript Interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Remove Logging
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
    public static *** w(...);
    public static *** e(...);
}

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep Parcelables
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Keep Serializable classes
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Keep R classes
-keepclassmembers class **.R$* {
    public static <fields>;
}