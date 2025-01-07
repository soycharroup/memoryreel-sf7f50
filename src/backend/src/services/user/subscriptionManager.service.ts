/**
 * @fileoverview Enhanced subscription management service with Stripe integration, storage tracking,
 * and comprehensive security features for the MemoryReel platform.
 * @version 1.0.0
 */

import Stripe from 'stripe'; // ^11.0.0
import { S3 } from 'aws-sdk'; // ^2.1.0
import { createClient } from 'redis'; // ^4.0.0
import { createLogger, format, transports } from 'winston'; // ^3.8.0
import { Injectable } from '@nestjs/common';
import { RateLimit } from '@nestjs/throttler';
import { AuditLog } from '../../decorators/audit.decorator';
import SubscriptionModel, { 
  ISubscription, 
  STORAGE_LIMITS, 
  SUBSCRIPTION_STATUSES 
} from '../../models/subscription.model';

// Subscription plan constants
const SUBSCRIPTION_PLANS = {
  FREE: 'free',
  BASIC: 'basic',
  PREMIUM: 'premium',
  FAMILY: 'family'
} as const;

// Rate limiting constants
const RATE_LIMITS = {
  SUBSCRIPTION_OPERATIONS: 100,
  STORAGE_CHECKS: 1000,
  WEBHOOK_EVENTS: 500
} as const;

// Error messages
const ERROR_MESSAGES = {
  INVALID_PLAN: 'Invalid subscription plan specified',
  PAYMENT_FAILED: 'Payment method verification failed',
  STORAGE_EXCEEDED: 'Storage limit exceeded for requested plan',
  WEBHOOK_INVALID: 'Invalid webhook signature',
  CACHE_ERROR: 'Cache operation failed'
} as const;

@Injectable()
export class SubscriptionManager {
  private readonly stripeClient: Stripe;
  private readonly s3Client: S3;
  private readonly cacheClient: ReturnType<typeof createClient>;
  private readonly logger: ReturnType<typeof createLogger>;

  constructor(
    private readonly stripeApiKey: string,
    private readonly cacheConfig: { host: string; port: number },
    private readonly loggerConfig: { level: string; filename: string }
  ) {
    // Initialize Stripe with advanced configuration
    this.stripeClient = new Stripe(stripeApiKey, {
      apiVersion: '2023-10-16',
      typescript: true,
      maxNetworkRetries: 3,
      timeout: 30000
    });

    // Initialize S3 client with retry configuration
    this.s3Client = new S3({
      maxRetries: 3,
      httpOptions: { timeout: 30000 },
      logger: console
    });

    // Initialize Redis cache client
    this.cacheClient = createClient({
      socket: {
        host: cacheConfig.host,
        port: cacheConfig.port,
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000)
      },
      database: 0
    });

    // Initialize Winston logger
    this.logger = createLogger({
      level: loggerConfig.level,
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      transports: [
        new transports.File({ filename: loggerConfig.filename }),
        new transports.Console()
      ]
    });

    this.initializeConnections();
  }

  /**
   * Initializes and validates all service connections
   */
  private async initializeConnections(): Promise<void> {
    try {
      await this.cacheClient.connect();
      await this.validateStripeConnection();
      await this.validateS3Connection();
    } catch (error) {
      this.logger.error('Connection initialization failed', { error });
      throw error;
    }
  }

  /**
   * Creates a new subscription with comprehensive validation and error handling
   */
  @RateLimit(RATE_LIMITS.SUBSCRIPTION_OPERATIONS)
  @AuditLog('subscription.create')
  public async createSubscription(
    userId: string,
    plan: keyof typeof SUBSCRIPTION_PLANS,
    paymentMethodId?: string
  ): Promise<ISubscription> {
    try {
      // Validate plan and payment method
      if (!SUBSCRIPTION_PLANS[plan]) {
        throw new Error(ERROR_MESSAGES.INVALID_PLAN);
      }

      // Check if user already has a subscription
      const existingSubscription = await SubscriptionModel.findByUserId(userId);
      if (existingSubscription) {
        await this.cancelExistingSubscription(existingSubscription);
      }

      // Create or retrieve Stripe customer
      const stripeCustomer = await this.createOrRetrieveStripeCustomer(userId, paymentMethodId);

      // Create Stripe subscription for paid plans
      let stripeSubscription;
      if (plan !== 'FREE') {
        stripeSubscription = await this.createStripeSubscription(
          stripeCustomer.id,
          plan,
          paymentMethodId
        );
      }

      // Create local subscription record
      const subscription = await SubscriptionModel.createSubscription({
        userId,
        plan,
        status: SUBSCRIPTION_STATUSES.ACTIVE,
        storageLimit: STORAGE_LIMITS[plan],
        stripeCustomerId: stripeCustomer.id,
        stripeSubscriptionId: stripeSubscription?.id,
        startDate: new Date(),
        endDate: this.calculateSubscriptionEndDate(plan),
        autoRenew: true
      });

      await this.updateStorageQuotaCache(subscription);
      
      this.logger.info('Subscription created successfully', {
        userId,
        plan,
        subscriptionId: subscription.id
      });

      return subscription;
    } catch (error) {
      this.logger.error('Subscription creation failed', { error, userId, plan });
      throw error;
    }
  }

  /**
   * Handles Stripe webhooks with enhanced security and retry logic
   */
  @RateLimit(RATE_LIMITS.WEBHOOK_EVENTS)
  @AuditLog('webhook.process')
  public async handleStripeWebhook(
    event: Stripe.Event,
    signature: string
  ): Promise<void> {
    try {
      // Verify webhook signature
      const isValid = await this.verifyWebhookSignature(event, signature);
      if (!isValid) {
        throw new Error(ERROR_MESSAGES.WEBHOOK_INVALID);
      }

      switch (event.type) {
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionCancellation(event.data.object as Stripe.Subscription);
          break;
        case 'invoice.payment_failed':
          await this.handlePaymentFailure(event.data.object as Stripe.Invoice);
          break;
      }

      this.logger.info('Webhook processed successfully', {
        eventType: event.type,
        eventId: event.id
      });
    } catch (error) {
      this.logger.error('Webhook processing failed', { error, eventId: event.id });
      throw error;
    }
  }

  /**
   * Calculates and caches current storage usage for a subscription
   */
  @RateLimit(RATE_LIMITS.STORAGE_CHECKS)
  private async calculateStorageUsage(subscriptionId: string): Promise<number> {
    const cacheKey = `storage:${subscriptionId}`;
    
    try {
      // Check cache first
      const cachedUsage = await this.cacheClient.get(cacheKey);
      if (cachedUsage) {
        return parseInt(cachedUsage, 10);
      }

      // Calculate from S3
      const usage = await this.getS3StorageUsage(subscriptionId);
      
      // Cache the result for 1 hour
      await this.cacheClient.set(cacheKey, usage.toString(), {
        EX: 3600
      });

      return usage;
    } catch (error) {
      this.logger.error('Storage calculation failed', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async verifyWebhookSignature(event: Stripe.Event, signature: string): Promise<boolean> {
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      const constructEvent = await this.stripeClient.webhooks.constructEvent(
        event.data,
        signature,
        webhookSecret!
      );
      return !!constructEvent;
    } catch (error) {
      this.logger.error('Webhook signature verification failed', { error });
      return false;
    }
  }

  private async createOrRetrieveStripeCustomer(
    userId: string,
    paymentMethodId?: string
  ): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripeClient.customers.create({
        metadata: { userId },
        payment_method: paymentMethodId
      });

      if (paymentMethodId) {
        await this.stripeClient.paymentMethods.attach(paymentMethodId, {
          customer: customer.id
        });
      }

      return customer;
    } catch (error) {
      this.logger.error('Stripe customer creation failed', { error, userId });
      throw error;
    }
  }

  private async createStripeSubscription(
    customerId: string,
    plan: string,
    paymentMethodId?: string
  ): Promise<Stripe.Subscription> {
    try {
      return await this.stripeClient.subscriptions.create({
        customer: customerId,
        items: [{ price: this.getPriceIdForPlan(plan) }],
        payment_behavior: 'error_if_incomplete',
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription'
        },
        expand: ['latest_invoice.payment_intent']
      });
    } catch (error) {
      this.logger.error('Stripe subscription creation failed', {
        error,
        customerId,
        plan
      });
      throw error;
    }
  }

  private getPriceIdForPlan(plan: string): string {
    const priceIds = {
      BASIC: process.env.STRIPE_BASIC_PRICE_ID,
      PREMIUM: process.env.STRIPE_PREMIUM_PRICE_ID,
      FAMILY: process.env.STRIPE_FAMILY_PRICE_ID
    };
    return priceIds[plan as keyof typeof priceIds] || '';
  }

  private calculateSubscriptionEndDate(plan: string): Date {
    const periods = {
      FREE: 30,
      BASIC: 30,
      PREMIUM: 30,
      FAMILY: 30
    };
    const days = periods[plan as keyof typeof periods] || 30;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private async updateStorageQuotaCache(subscription: ISubscription): Promise<void> {
    const cacheKey = `quota:${subscription.id}`;
    try {
      await this.cacheClient.set(cacheKey, subscription.storageLimit.toString(), {
        EX: 86400 // 24 hours
      });
    } catch (error) {
      this.logger.error('Cache update failed', { error, subscriptionId: subscription.id });
      // Non-blocking error - log but don't throw
    }
  }

  private async getS3StorageUsage(subscriptionId: string): Promise<number> {
    try {
      const response = await this.s3Client.listObjectsV2({
        Bucket: process.env.AWS_STORAGE_BUCKET!,
        Prefix: `user-content/${subscriptionId}/`
      }).promise();

      return response.Contents?.reduce((total, object) => total + (object.Size || 0), 0) || 0;
    } catch (error) {
      this.logger.error('S3 storage calculation failed', { error, subscriptionId });
      throw error;
    }
  }
}

export default SubscriptionManager;