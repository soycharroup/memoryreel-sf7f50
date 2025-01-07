/**
 * @fileoverview Route constants and configurations for MemoryReel platform
 * Platform-specific route definitions for web and TV interfaces with Netflix-style navigation
 * @version 1.0.0
 */

/**
 * Route configuration interface defining structure for all route objects
 */
interface RouteConfig {
  path: string;
  name: string;
  guard: string[];
  meta: {
    platform: string[];
    requiresAuth: boolean;
    analyticsTag: string;
    lazyLoad: boolean;
    accessLevel: string;
  };
  navigation: {
    focusable: boolean;
    remoteControl: boolean;
    voiceEnabled: boolean;
    position: number;
  };
}

/**
 * Authentication related routes
 */
export const AUTH: RouteConfig[] = [
  {
    path: '/auth/login',
    name: 'LOGIN',
    guard: ['PUBLIC_ONLY'],
    meta: {
      platform: ['web', 'mobile', 'tv'],
      requiresAuth: false,
      analyticsTag: 'auth_login',
      lazyLoad: true,
      accessLevel: 'public'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: false,
      position: 1
    }
  },
  {
    path: '/auth/register',
    name: 'REGISTER',
    guard: ['PUBLIC_ONLY'],
    meta: {
      platform: ['web', 'mobile'],
      requiresAuth: false,
      analyticsTag: 'auth_register',
      lazyLoad: true,
      accessLevel: 'public'
    },
    navigation: {
      focusable: true,
      remoteControl: false,
      voiceEnabled: false,
      position: 2
    }
  },
  {
    path: '/auth/reset-password',
    name: 'RESET_PASSWORD',
    guard: ['PUBLIC_ONLY'],
    meta: {
      platform: ['web', 'mobile'],
      requiresAuth: false,
      analyticsTag: 'auth_reset',
      lazyLoad: true,
      accessLevel: 'public'
    },
    navigation: {
      focusable: true,
      remoteControl: false,
      voiceEnabled: false,
      position: 3
    }
  },
  {
    path: '/auth/mfa',
    name: 'MFA',
    guard: ['PUBLIC_ONLY'],
    meta: {
      platform: ['web', 'mobile', 'tv'],
      requiresAuth: false,
      analyticsTag: 'auth_mfa',
      lazyLoad: true,
      accessLevel: 'public'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 4
    }
  },
  {
    path: '/auth/verify-email',
    name: 'VERIFY_EMAIL',
    guard: ['PUBLIC_ONLY'],
    meta: {
      platform: ['web', 'mobile'],
      requiresAuth: false,
      analyticsTag: 'auth_verify',
      lazyLoad: true,
      accessLevel: 'public'
    },
    navigation: {
      focusable: true,
      remoteControl: false,
      voiceEnabled: false,
      position: 5
    }
  },
  {
    path: '/auth/social/:provider',
    name: 'SOCIAL_AUTH',
    guard: ['PUBLIC_ONLY'],
    meta: {
      platform: ['web', 'mobile', 'tv'],
      requiresAuth: false,
      analyticsTag: 'auth_social',
      lazyLoad: true,
      accessLevel: 'public'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: false,
      position: 6
    }
  }
];

/**
 * Dashboard related routes
 */
export const DASHBOARD: RouteConfig[] = [
  {
    path: '/dashboard',
    name: 'HOME',
    guard: ['AUTH_REQUIRED'],
    meta: {
      platform: ['web', 'mobile', 'tv'],
      requiresAuth: true,
      analyticsTag: 'dashboard_home',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 1
    }
  },
  {
    path: '/dashboard/library/:id?',
    name: 'LIBRARY',
    guard: ['AUTH_REQUIRED'],
    meta: {
      platform: ['web', 'mobile', 'tv'],
      requiresAuth: true,
      analyticsTag: 'dashboard_library',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 2
    }
  },
  {
    path: '/dashboard/profile',
    name: 'PROFILE',
    guard: ['AUTH_REQUIRED'],
    meta: {
      platform: ['web', 'mobile', 'tv'],
      requiresAuth: true,
      analyticsTag: 'dashboard_profile',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 3
    }
  },
  {
    path: '/dashboard/settings',
    name: 'SETTINGS',
    guard: ['AUTH_REQUIRED'],
    meta: {
      platform: ['web', 'mobile', 'tv'],
      requiresAuth: true,
      analyticsTag: 'dashboard_settings',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 4
    }
  },
  {
    path: '/dashboard/notifications',
    name: 'NOTIFICATIONS',
    guard: ['AUTH_REQUIRED'],
    meta: {
      platform: ['web', 'mobile'],
      requiresAuth: true,
      analyticsTag: 'dashboard_notifications',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: false,
      voiceEnabled: false,
      position: 5
    }
  },
  {
    path: '/dashboard/family',
    name: 'FAMILY',
    guard: ['AUTH_REQUIRED', 'FAMILY_ADMIN'],
    meta: {
      platform: ['web', 'mobile'],
      requiresAuth: true,
      analyticsTag: 'dashboard_family',
      lazyLoad: true,
      accessLevel: 'admin'
    },
    navigation: {
      focusable: true,
      remoteControl: false,
      voiceEnabled: false,
      position: 6
    }
  },
  {
    path: '/dashboard/ai-assistant',
    name: 'AI_ASSISTANT',
    guard: ['AUTH_REQUIRED'],
    meta: {
      platform: ['web', 'mobile', 'tv'],
      requiresAuth: true,
      analyticsTag: 'dashboard_ai',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 7
    }
  }
];

/**
 * Media management routes
 */
export const MEDIA: RouteConfig[] = [
  {
    path: '/media/library/:libraryId?',
    name: 'LIBRARY',
    guard: ['AUTH_REQUIRED'],
    meta: {
      platform: ['web', 'mobile', 'tv'],
      requiresAuth: true,
      analyticsTag: 'media_library',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 1
    }
  },
  {
    path: '/media/:id',
    name: 'DETAIL',
    guard: ['AUTH_REQUIRED'],
    meta: {
      platform: ['web', 'mobile', 'tv'],
      requiresAuth: true,
      analyticsTag: 'media_detail',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 2
    }
  },
  {
    path: '/media/upload',
    name: 'UPLOAD',
    guard: ['AUTH_REQUIRED'],
    meta: {
      platform: ['web', 'mobile'],
      requiresAuth: true,
      analyticsTag: 'media_upload',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: false,
      voiceEnabled: false,
      position: 3
    }
  },
  {
    path: '/media/search',
    name: 'SEARCH',
    guard: ['AUTH_REQUIRED'],
    meta: {
      platform: ['web', 'mobile', 'tv'],
      requiresAuth: true,
      analyticsTag: 'media_search',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 4
    }
  },
  {
    path: '/media/faces',
    name: 'FACES',
    guard: ['AUTH_REQUIRED'],
    meta: {
      platform: ['web', 'mobile'],
      requiresAuth: true,
      analyticsTag: 'media_faces',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: false,
      voiceEnabled: false,
      position: 5
    }
  },
  {
    path: '/media/collections/:collectionId?',
    name: 'COLLECTIONS',
    guard: ['AUTH_REQUIRED'],
    meta: {
      platform: ['web', 'mobile', 'tv'],
      requiresAuth: true,
      analyticsTag: 'media_collections',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 6
    }
  },
  {
    path: '/media/sharing/:contentId?',
    name: 'SHARING',
    guard: ['AUTH_REQUIRED', 'SUBSCRIPTION_REQUIRED'],
    meta: {
      platform: ['web', 'mobile'],
      requiresAuth: true,
      analyticsTag: 'media_sharing',
      lazyLoad: true,
      accessLevel: 'premium'
    },
    navigation: {
      focusable: true,
      remoteControl: false,
      voiceEnabled: false,
      position: 7
    }
  }
];

/**
 * TV-specific routes optimized for remote control navigation
 */
export const TV: RouteConfig[] = [
  {
    path: '/tv',
    name: 'DASHBOARD',
    guard: ['AUTH_REQUIRED', 'TV_ONLY'],
    meta: {
      platform: ['tv'],
      requiresAuth: true,
      analyticsTag: 'tv_dashboard',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 1
    }
  },
  {
    path: '/tv/library/:libraryId?',
    name: 'LIBRARY',
    guard: ['AUTH_REQUIRED', 'TV_ONLY'],
    meta: {
      platform: ['tv'],
      requiresAuth: true,
      analyticsTag: 'tv_library',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 2
    }
  },
  {
    path: '/tv/player/:id',
    name: 'PLAYER',
    guard: ['AUTH_REQUIRED', 'TV_ONLY'],
    meta: {
      platform: ['tv'],
      requiresAuth: true,
      analyticsTag: 'tv_player',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 3
    }
  },
  {
    path: '/tv/search',
    name: 'SEARCH',
    guard: ['AUTH_REQUIRED', 'TV_ONLY'],
    meta: {
      platform: ['tv'],
      requiresAuth: true,
      analyticsTag: 'tv_search',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 4
    }
  },
  {
    path: '/tv/carousel/:category',
    name: 'CAROUSEL',
    guard: ['AUTH_REQUIRED', 'TV_ONLY'],
    meta: {
      platform: ['tv'],
      requiresAuth: true,
      analyticsTag: 'tv_carousel',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 5
    }
  },
  {
    path: '/tv/recommendations',
    name: 'RECOMMENDATIONS',
    guard: ['AUTH_REQUIRED', 'TV_ONLY', 'SUBSCRIPTION_REQUIRED'],
    meta: {
      platform: ['tv'],
      requiresAuth: true,
      analyticsTag: 'tv_recommendations',
      lazyLoad: true,
      accessLevel: 'premium'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 6
    }
  },
  {
    path: '/tv/voice-search',
    name: 'VOICE_SEARCH',
    guard: ['AUTH_REQUIRED', 'TV_ONLY'],
    meta: {
      platform: ['tv'],
      requiresAuth: true,
      analyticsTag: 'tv_voice_search',
      lazyLoad: true,
      accessLevel: 'user'
    },
    navigation: {
      focusable: true,
      remoteControl: true,
      voiceEnabled: true,
      position: 7
    }
  }
];

/**
 * Combined routes object for export
 */
export const ROUTES = {
  AUTH,
  DASHBOARD,
  MEDIA,
  TV
};