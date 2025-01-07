# MemoryReel Backend Service

## Overview

MemoryReel backend service is a cloud-native Node.js/Express.js microservices architecture that powers the AI-driven digital memory management platform. It provides secure, scalable APIs for content management, AI processing, and family-oriented sharing capabilities.

## Features

- Multi-provider AI processing with OpenAI, AWS, and Google AI
- Secure content management with end-to-end encryption
- Advanced facial recognition and scene analysis
- Real-time search with Netflix-style navigation
- Multi-factor authentication and role-based access control
- Comprehensive monitoring and logging
- Horizontal scaling with queue-based processing

## Prerequisites

- Node.js >= 18.0.0
- MongoDB >= 5.0
- Redis >= 6.0
- AWS Account with following services:
  - S3 for media storage
  - Cognito for authentication
  - Rekognition for AI processing
- OpenAI API Access
- SSL Certificates
- Datadog Account
- Alert Management System

## Project Structure

```
src/backend/
├── config/                 # Configuration files
├── constants/             # Application constants
├── controllers/           # Route controllers
├── interfaces/           # TypeScript interfaces
├── middleware/           # Express middleware
├── models/              # Mongoose models
├── routes/              # API routes
├── services/            # Business logic
│   ├── ai/             # AI processing services
│   ├── auth/           # Authentication services
│   ├── content/        # Content management
│   ├── library/        # Library management
│   ├── search/         # Search services
│   ├── storage/        # Storage services
│   └── user/           # User management
├── utils/              # Utility functions
└── validators/         # Request validators
```

## Environment Setup

1. Create `.env` file based on `.env.example`:

```bash
# Application
NODE_ENV=development
PORT=3000
APP_VERSION=1.0.0

# MongoDB
MONGODB_URI=mongodb://localhost:27017/memoryreel

# Redis
REDIS_URL=redis://localhost:6379
REDIS_TLS_ENABLED=false

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
COGNITO_USER_POOL_ID=your_user_pool_id
COGNITO_CLIENT_ID=your_client_id

# OpenAI
OPENAI_API_KEY=your_openai_key

# Security
JWT_SECRET=your_jwt_secret
SSL_CERT_PATH=/path/to/cert
SSL_KEY_PATH=/path/to/key

# Monitoring
DATADOG_API_KEY=your_datadog_key
ALERT_WEBHOOK_URL=your_webhook_url
```

## Installation

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run database migrations
npm run db:migrate

# Generate API documentation
npm run generate:docs
```

## Development

```bash
# Start development server
npm run dev

# Run tests
npm run test

# Run linting
npm run lint

# Format code
npm run format
```

## Security Setup

1. SSL/TLS Configuration:
```bash
# Generate SSL certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout private.key -out certificate.crt
```

2. Configure security headers in `app.ts`
3. Set up rate limiting and CORS policies
4. Enable MFA for admin access
5. Configure audit logging

## Monitoring Setup

1. Initialize Datadog agent
2. Configure metrics collection
3. Set up alerting rules
4. Enable log aggregation
5. Configure performance monitoring

## API Documentation

API documentation is available at `/docs` when running in development mode.

Key endpoints:
- `/api/v1/auth/*` - Authentication endpoints
- `/api/v1/content/*` - Content management
- `/api/v1/library/*` - Library operations
- `/api/v1/search/*` - Search functionality
- `/api/v1/users/*` - User management

## Deployment

1. Build production assets:
```bash
npm run build
```

2. Docker deployment:
```bash
# Build image
npm run docker:build

# Run container
npm run docker:run
```

3. Configure load balancer and scaling policies
4. Set up CI/CD pipeline
5. Configure monitoring and alerts

## Testing

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:e2e

# Generate coverage report
npm run test:coverage
```

## Maintenance

1. Regular security updates
2. Database backups
3. Log rotation
4. Performance monitoring
5. Error tracking

## Troubleshooting

Common issues and solutions:
1. Connection errors: Check MongoDB and Redis connectivity
2. Authentication issues: Verify Cognito configuration
3. AI processing failures: Check provider API keys and quotas
4. Performance issues: Monitor resource usage and scaling

## Contributing

1. Follow TypeScript coding standards
2. Ensure comprehensive test coverage
3. Document all changes
4. Submit pull requests for review

## License

UNLICENSED - Proprietary software