import type { Config } from '@jest/types';
import { compilerOptions } from './tsconfig.json';

// Create path mappings for Jest moduleNameMapper from tsconfig paths
const createPathMappings = () => {
  const { paths } = compilerOptions;
  const moduleNameMapper: { [key: string]: string } = {};

  // Convert tsconfig paths to Jest moduleNameMapper format
  Object.entries(paths).forEach(([alias, [path]]) => {
    const key = `^${alias.replace('/*', '/(.*)$')}`;
    const value = `<rootDir>/${path.replace('/*', '/$1')}`;
    moduleNameMapper[key] = value;
  });

  // Add file type mocks
  moduleNameMapper['\\.(css|less|scss|sass)$'] = 'identity-obj-proxy';
  moduleNameMapper['\\.(jpg|jpeg|png|gif|webp|svg)$'] = '<rootDir>/tests/__mocks__/fileMock.js';

  return moduleNameMapper;
};

const config: Config.InitialOptions = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',

  // Configure jsdom test environment for browser-like testing
  testEnvironment: 'jsdom',

  // Define test file locations
  roots: [
    '<rootDir>/src',
    '<rootDir>/tests'
  ],

  // Configure module name mapping for path aliases and file mocks
  moduleNameMapper: createPathMappings(),

  // Setup files to run before tests
  setupFilesAfterEnv: [
    '@testing-library/jest-dom/extend-expect'
  ],

  // Test file patterns
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$',

  // Supported file extensions
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js', 
    'jsx',
    'json',
    'node'
  ],

  // Configure coverage collection
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/vite-env.d.ts',
    '!src/main.tsx',
    '!src/App.tsx'
  ],

  // Set coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // TypeScript transformation
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },

  // Additional configuration options
  verbose: true,
  testTimeout: 10000,
  clearMocks: true,
  restoreMocks: true
};

export default config;