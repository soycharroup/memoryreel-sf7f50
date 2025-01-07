import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { THEME_MODES, APP_CONFIG } from '../../constants/theme.constants';

// Interfaces
interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration: number;
  dismissible: boolean;
}

interface UIState {
  theme: {
    mode: THEME_MODES;
    highContrast: boolean;
    fontSize: number;
    contrast: number;
    animations: boolean;
  };
  layout: {
    sidebarOpen: boolean;
    currentBreakpoint: string;
    orientation: string;
    isFullscreen: boolean;
    scrollPosition: number;
  };
  navigation: {
    currentRoute: string;
    previousRoute: string | null;
    navigationStack: string[];
    breadcrumbs: string[];
    lastInteraction: number;
  };
  modals: {
    activeModal: string | null;
    modalProps: Record<string, any>;
    history: string[];
    isAnimating: boolean;
  };
  toasts: {
    items: ToastItem[];
    position: string;
    maxVisible: number;
  };
  tv: {
    focusedElement: string | null;
    carouselPositions: Record<string, number>;
    navigationMode: string;
    remoteControlMode: string;
    focusHistory: string[];
    activeSection: string;
  };
}

// Initial state
const initialState: UIState = {
  theme: {
    mode: APP_CONFIG.defaultTheme,
    highContrast: false,
    fontSize: 16,
    contrast: 100,
    animations: true
  },
  layout: {
    sidebarOpen: true,
    currentBreakpoint: 'desktop',
    orientation: 'landscape',
    isFullscreen: false,
    scrollPosition: 0
  },
  navigation: {
    currentRoute: '/',
    previousRoute: null,
    navigationStack: [],
    breadcrumbs: [],
    lastInteraction: 0
  },
  modals: {
    activeModal: null,
    modalProps: {},
    history: [],
    isAnimating: false
  },
  toasts: {
    items: [],
    position: 'bottom-right',
    maxVisible: 3
  },
  tv: {
    focusedElement: null,
    carouselPositions: {},
    navigationMode: 'standard',
    remoteControlMode: 'default',
    focusHistory: [],
    activeSection: 'home'
  }
};

// Create slice
const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setThemeMode(state, action: PayloadAction<THEME_MODES>) {
      state.theme.mode = action.payload;
      document.documentElement.setAttribute('data-theme', action.payload);
    },
    setHighContrast(state, action: PayloadAction<boolean>) {
      state.theme.highContrast = action.payload;
      document.documentElement.setAttribute('data-high-contrast', String(action.payload));
    },
    setFontSize(state, action: PayloadAction<number>) {
      state.theme.fontSize = action.payload;
      document.documentElement.style.fontSize = `${action.payload}px`;
    },
    setContrast(state, action: PayloadAction<number>) {
      state.theme.contrast = action.payload;
    },
    toggleAnimations(state, action: PayloadAction<boolean>) {
      state.theme.animations = action.payload;
      document.documentElement.setAttribute('data-reduce-motion', String(!action.payload));
    },
    toggleSidebar(state) {
      state.layout.sidebarOpen = !state.layout.sidebarOpen;
    },
    setBreakpoint(state, action: PayloadAction<string>) {
      state.layout.currentBreakpoint = action.payload;
    },
    setOrientation(state, action: PayloadAction<string>) {
      state.layout.orientation = action.payload;
    },
    setFullscreen(state, action: PayloadAction<boolean>) {
      state.layout.isFullscreen = action.payload;
    },
    updateScrollPosition(state, action: PayloadAction<number>) {
      state.layout.scrollPosition = action.payload;
    },
    navigateTo(state, action: PayloadAction<string>) {
      state.navigation.previousRoute = state.navigation.currentRoute;
      state.navigation.currentRoute = action.payload;
      state.navigation.navigationStack.push(action.payload);
      state.navigation.lastInteraction = Date.now();
    },
    updateBreadcrumbs(state, action: PayloadAction<string[]>) {
      state.navigation.breadcrumbs = action.payload;
    },
    showModal(state, action: PayloadAction<{ id: string; props?: Record<string, any> }>) {
      state.modals.history.push(state.modals.activeModal || '');
      state.modals.activeModal = action.payload.id;
      state.modals.modalProps = action.payload.props || {};
      state.modals.isAnimating = true;
    },
    hideModal(state) {
      state.modals.activeModal = state.modals.history.pop() || null;
      state.modals.modalProps = {};
      state.modals.isAnimating = true;
    },
    setModalAnimating(state, action: PayloadAction<boolean>) {
      state.modals.isAnimating = action.payload;
    },
    addToast(state, action: PayloadAction<ToastItem>) {
      state.toasts.items.push(action.payload);
      if (state.toasts.items.length > state.toasts.maxVisible) {
        state.toasts.items.shift();
      }
    },
    removeToast(state, action: PayloadAction<string>) {
      state.toasts.items = state.toasts.items.filter(toast => toast.id !== action.payload);
    },
    setToastPosition(state, action: PayloadAction<string>) {
      state.toasts.position = action.payload;
    },
    setTvFocus(state, action: PayloadAction<string>) {
      state.tv.focusedElement = action.payload;
      state.tv.focusHistory.push(action.payload);
    },
    updateCarouselPosition(state, action: PayloadAction<{ id: string; position: number }>) {
      state.tv.carouselPositions[action.payload.id] = action.payload.position;
    },
    setTvNavigationMode(state, action: PayloadAction<string>) {
      state.tv.navigationMode = action.payload;
    },
    setTvRemoteMode(state, action: PayloadAction<string>) {
      state.tv.remoteControlMode = action.payload;
    },
    setTvActiveSection(state, action: PayloadAction<string>) {
      state.tv.activeSection = action.payload;
    }
  }
});

// Export actions and reducer
export const uiActions = uiSlice.actions;
export default uiSlice.reducer;