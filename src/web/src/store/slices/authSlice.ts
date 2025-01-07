// @reduxjs/toolkit version: ^1.9.5
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import AuthService from '../../services/auth.service';
import { 
  AuthCredentials, 
  AuthTokens, 
  User, 
  SecurityEvent, 
  MFAOptions 
} from '@types/auth';

// Enhanced authentication state interface
interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  mfaStatus: {
    required: boolean;
    method: MFAOptions['method'] | null;
    verified: boolean;
  };
  securityPreferences: {
    mfaEnabled: boolean;
    trustedDevices: string[];
    lastPasswordChange: string;
    securityQuestions: boolean;
  };
  deviceInfo: {
    fingerprint: string | null;
    trusted: boolean;
    lastVerified: string | null;
  };
  lastActivity: string;
  securityEvents: SecurityEvent[];
  tokenRefreshTimer: number | null;
}

// Initial state with security defaults
const initialState: AuthState = {
  user: null,
  tokens: null,
  loading: false,
  error: null,
  isAuthenticated: false,
  mfaStatus: {
    required: false,
    method: null,
    verified: false
  },
  securityPreferences: {
    mfaEnabled: false,
    trustedDevices: [],
    lastPasswordChange: '',
    securityQuestions: false
  },
  deviceInfo: {
    fingerprint: null,
    trusted: false,
    lastVerified: null
  },
  lastActivity: new Date().toISOString(),
  securityEvents: [],
  tokenRefreshTimer: null
};

// Enhanced async thunks with security features
export const loginAsync = createAsyncThunk(
  'auth/login',
  async (credentials: AuthCredentials, { rejectWithValue }) => {
    try {
      const user = await AuthService.login(credentials);
      return user;
    } catch (error: any) {
      if (error.message === 'MFA_REQUIRED') {
        return rejectWithValue({ code: 'MFA_REQUIRED', message: 'MFA verification required' });
      }
      return rejectWithValue(error.message);
    }
  }
);

export const setupMFAAsync = createAsyncThunk(
  'auth/setupMFA',
  async (options: MFAOptions, { rejectWithValue }) => {
    try {
      await AuthService.setupMFA(options.method, options);
      return options.method;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const verifyMFAAsync = createAsyncThunk(
  'auth/verifyMFA',
  async (code: string, { rejectWithValue }) => {
    try {
      await AuthService.verifyMFA(code);
      return true;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const verifyDeviceAsync = createAsyncThunk(
  'auth/verifyDevice',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { deviceInfo } = getState() as { auth: AuthState };
      if (deviceInfo.fingerprint) {
        await AuthService.verifyDevice(deviceInfo.fingerprint);
        return deviceInfo.fingerprint;
      }
      return rejectWithValue('No device fingerprint available');
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const logoutAsync = createAsyncThunk(
  'auth/logout',
  async (_, { dispatch }) => {
    await AuthService.logout();
    dispatch(clearAuth());
  }
);

// Auth slice with enhanced security features
export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
      state.lastActivity = new Date().toISOString();
    },
    setTokens: (state, action: PayloadAction<AuthTokens | null>) => {
      state.tokens = action.payload;
      state.lastActivity = new Date().toISOString();
    },
    setMFAStatus: (state, action: PayloadAction<Partial<AuthState['mfaStatus']>>) => {
      state.mfaStatus = { ...state.mfaStatus, ...action.payload };
    },
    setDeviceInfo: (state, action: PayloadAction<Partial<AuthState['deviceInfo']>>) => {
      state.deviceInfo = { ...state.deviceInfo, ...action.payload };
    },
    updateSecurityPreferences: (state, action: PayloadAction<Partial<AuthState['securityPreferences']>>) => {
      state.securityPreferences = { ...state.securityPreferences, ...action.payload };
    },
    logSecurityEvent: (state, action: PayloadAction<SecurityEvent>) => {
      state.securityEvents.push(action.payload);
    },
    updateLastActivity: (state) => {
      state.lastActivity = new Date().toISOString();
    },
    clearAuth: (state) => {
      Object.assign(state, initialState);
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginAsync.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginAsync.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
        state.loading = false;
        state.error = null;
        state.lastActivity = new Date().toISOString();
      })
      .addCase(loginAsync.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        if (action.payload === 'MFA_REQUIRED') {
          state.mfaStatus.required = true;
        }
      })
      .addCase(setupMFAAsync.fulfilled, (state, action) => {
        state.securityPreferences.mfaEnabled = true;
        state.mfaStatus.method = action.payload;
      })
      .addCase(verifyMFAAsync.fulfilled, (state) => {
        state.mfaStatus.verified = true;
        state.mfaStatus.required = false;
      })
      .addCase(verifyDeviceAsync.fulfilled, (state, action) => {
        if (action.payload) {
          state.deviceInfo.trusted = true;
          state.deviceInfo.lastVerified = new Date().toISOString();
          state.securityPreferences.trustedDevices.push(action.payload);
        }
      });
  }
});

// Export actions and selectors
export const {
  setUser,
  setTokens,
  setMFAStatus,
  setDeviceInfo,
  updateSecurityPreferences,
  logSecurityEvent,
  updateLastActivity,
  clearAuth
} = authSlice.actions;

// Enhanced selectors with memoization potential
export const authSelectors = {
  selectUser: (state: { auth: AuthState }) => state.auth.user,
  selectIsAuthenticated: (state: { auth: AuthState }) => state.auth.isAuthenticated,
  selectMFAStatus: (state: { auth: AuthState }) => state.auth.mfaStatus,
  selectSecurityPreferences: (state: { auth: AuthState }) => state.auth.securityPreferences,
  selectDeviceInfo: (state: { auth: AuthState }) => state.auth.deviceInfo,
  selectLastActivity: (state: { auth: AuthState }) => state.auth.lastActivity,
  selectSecurityEvents: (state: { auth: AuthState }) => state.auth.securityEvents,
  selectError: (state: { auth: AuthState }) => state.auth.error
};

export default authSlice.reducer;