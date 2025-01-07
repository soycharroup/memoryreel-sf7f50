# MemoryReel Web & TV Application

A cloud-based digital memory management platform with Netflix-style interface optimized for web browsers and Smart TVs. Built with React.js and TypeScript, featuring AI-powered content organization and multi-platform support.

## Project Overview

MemoryReel is a premium family-oriented digital memory platform that revolutionizes how families organize, discover, and share their photo and video collections. The web application provides:

- Netflix-style navigation with horizontal carousels
- AI-powered content organization and discovery
- Multi-platform support (Web, Apple TV, Android TV, Samsung TV)
- Real-time content synchronization
- Advanced facial recognition and search capabilities

## Prerequisites

### General Requirements
- Node.js >= 18.0.0 LTS
- npm >= 9.0.0 or yarn >= 1.22.0
- Docker >= 24.x
- Git

### Platform-Specific Requirements

#### Apple TV Development
- Xcode 14+
- Apple Developer Account
- tvOS 16.0+ SDK
- Apple TV Developer Kit (for testing)

#### Android TV Development
- Android Studio
- Android TV 11+ SDK
- Android TV Emulator
- Android TV Test Device (for testing)

#### Samsung TV Development
- Tizen Studio
- Samsung TV SDK (Tizen 6.5+)
- Samsung TV Test Device (for testing)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd src/web
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Copy environment template:
```bash
cp .env.example .env
```

4. Configure environment variables:
```env
VITE_API_URL=https://api.memoryreel.com
VITE_TV_PLATFORM=<apple-tv|android-tv|samsung-tv>
```

## Development

### Available Commands

```bash
# Start development server with hot reload
npm run dev

# Start TV-optimized development environment
npm run dev:tv

# Create production builds
npm run build

# Run tests
npm run test

# Run linting
npm run lint
```

### Project Structure

```
src/
├── components/         # Reusable UI components
├── features/          # Feature-specific components
├── hooks/             # Custom React hooks
├── layouts/           # Layout components
├── pages/             # Page components
├── services/          # API and service integrations
├── store/            # Redux store configuration
├── styles/           # Global styles and themes
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── tv/               # TV-specific implementations
```

## Development Guidelines

### Component Development

- Use functional components with TypeScript
- Implement proper type definitions
- Follow React best practices
- Include component documentation
- Add unit tests for components

### TV-Specific Development

1. Focus Management
```typescript
import { useTVFocus } from '@/hooks/tv';

const MyComponent = () => {
  const { focused, onFocus } = useTVFocus();
  
  return (
    <div 
      className={`tv-focusable ${focused ? 'focused' : ''}`}
      onFocus={onFocus}
    >
      Content
    </div>
  );
};
```

2. Remote Control Navigation
```typescript
import { useRemoteControl } from '@/hooks/tv';

const MyComponent = () => {
  useRemoteControl({
    onUp: () => { /* Handle up */ },
    onDown: () => { /* Handle down */ },
    onSelect: () => { /* Handle select */ },
  });
  
  return <div>Content</div>;
};
```

### Performance Optimization

- Implement lazy loading for images and videos
- Use React.memo for expensive components
- Optimize bundle size with code splitting
- Implement proper caching strategies
- Monitor and optimize TV-specific performance

### Accessibility Requirements

- Implement WCAG 2.1 Level AA compliance
- Support screen readers
- Provide keyboard navigation
- Maintain proper focus management
- Include proper ARIA attributes

## Platform-Specific Configuration

### Apple TV

```typescript
// tv/platforms/apple/config.ts
export const appleTVConfig = {
  focusEngine: 'tvOS',
  remoteMapping: {
    menu: 'back',
    playPause: 'togglePlayback',
    select: 'activate',
  },
};
```

### Android TV

```typescript
// tv/platforms/android/config.ts
export const androidTVConfig = {
  focusEngine: 'android',
  remoteMapping: {
    back: 'back',
    center: 'select',
    dpad: 'navigation',
  },
};
```

### Samsung TV

```typescript
// tv/platforms/samsung/config.ts
export const samsungTVConfig = {
  focusEngine: 'tizen',
  remoteMapping: {
    return: 'back',
    enter: 'select',
    colorKeys: 'shortcuts',
  },
};
```

## Testing Strategy

1. Unit Testing
```bash
npm run test:unit
```

2. Integration Testing
```bash
npm run test:integration
```

3. TV Platform Testing
```bash
npm run test:tv
```

4. E2E Testing
```bash
npm run test:e2e
```

## Deployment Process

1. Build for production:
```bash
npm run build
```

2. Platform-specific builds:
```bash
npm run build:tv:apple
npm run build:tv:android
npm run build:tv:samsung
```

3. Docker deployment:
```bash
docker build -t memoryreel-web .
docker run -p 3000:3000 memoryreel-web
```

## Troubleshooting

### Common Issues

1. TV Focus Issues
```typescript
// Verify focus manager initialization
import { TVFocusManager } from '@/tv/focus';

TVFocusManager.initialize({
  platform: process.env.VITE_TV_PLATFORM,
  debug: true,
});
```

2. Performance Issues
- Check bundle size: `npm run analyze`
- Monitor memory usage
- Verify lazy loading implementation
- Check TV-specific optimizations

3. Platform-Specific Issues
- Verify SDK versions
- Check platform compatibility
- Review platform-specific logs
- Test on actual devices

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

Copyright © 2023 MemoryReel. All rights reserved.