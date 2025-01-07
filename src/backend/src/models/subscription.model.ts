/**
 * @fileoverview Mongoose model for subscription management with Stripe integration and storage tracking
 * @version 1.0.0
 */

import { Schema, model, Types } from 'mongoose'; // v7.4.0
import Stripe from '@stripe/stripe-node'; // v12.0.0
import { IUser } from '../interfaces/user.interface';

/**
 * Storage limits in MB for different subscription tiers
 */
export const STORAGE_LIMITS = {
  FREE: 5120,      // 5GB
  BASIC: 51200,    // 50GB
  PREMIUM: 512000, // 500GB
  FAMILY: 1024000  // 1TB
} as const;

/**
 * Subscription status types
 */
export const SUBSCRIPTION_STATUSES = {
  ACTIVE: 'active',
  CANCELED: 'canceled',
  SUSPENDED: 'suspended',
  PENDING: 'pending',
  EXPIRED: 'expired'
} as const;

/**
 * Interface for subscription document
 */
export interface ISubscription {
  userId: Types.ObjectId;
  plan: 'FREE' | 'BASIC' | 'PREMIUM' | 'FAMILY';
  status: typeof SUBSCRIPTION_STATUSES[keyof typeof SUBSCRIPTION_STATUSES];
  storageLimit: number;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
  currentStorageUsage: number;
  lastUsageUpdate: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for subscription updates
 */
export interface ISubscriptionUpdate {
  plan?: ISubscription['plan'];
  status?: ISubscription['status'];
  autoRenew?: boolean;
  endDate?: Date;
}

/**
 * Mongoose schema for subscription management
 */
const SubscriptionSchema = new Schema<ISubscription>({
  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    index: true
  },
  plan: {
    type: String,
    required: true,
    enum: Object.keys(STORAGE_LIMITS),
    default: 'FREE'
  },
  status: {
    type: String,
    required: true,
    enum: Object.values(SUBSCRIPTION_STATUSES),
    default: SUBSCRIPTION_STATUSES.PENDING
  },
  storageLimit: {
    type: Number,
    required: true,
    default: STORAGE_LIMITS.FREE
  },
  stripeCustomerId: {
    type: String,
    sparse: true,
    index: true
  },
  stripeSubscriptionId: {
    type: String,
    sparse: true,
    index: true
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
  },
  autoRenew: {
    type: Boolean,
    required: true,
    default: true
  },
  currentStorageUsage: {
    type: Number,
    required: true,
    default: 0
  },
  lastUsageUpdate: {
    type: Date,
    required: true,
    default: Date.now
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    required: true,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'subscriptions'
});

/**
 * Pre-save hook for subscription validation and updates
 */
SubscriptionSchema.pre('save', async function(next) {
  // Set storage limit based on plan
  this.storageLimit = STORAGE_LIMITS[this.plan];
  
  // Update timestamps
  this.updatedAt = new Date();
  
  // Validate storage compliance
  if (await this.validateStorageLimit() === false) {
    throw new Error('Storage usage exceeds plan limit');
  }

  // Verify Stripe customer if not FREE plan
  if (this.plan !== 'FREE' && !this.stripeCustomerId) {
    throw new Error('Stripe customer ID required for paid plans');
  }

  next();
});

/**
 * Validates current storage usage against plan limit
 */
SubscriptionSchema.methods.validateStorageLimit = async function(): Promise<boolean> {
  const usage = await SubscriptionModel.calculateStorageUsage(this._id);
  this.currentStorageUsage = usage;
  this.lastUsageUpdate = new Date();
  return usage <= this.storageLimit;
};

/**
 * Static method to find subscription by user ID
 */
SubscriptionSchema.statics.findByUserId = async function(userId: string): Promise<ISubscription | null> {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID format');
  }
  return this.findOne({ userId: new Types.ObjectId(userId) });
};

/**
 * Static method to update subscription details
 */
SubscriptionSchema.statics.updateSubscription = async function(
  subscriptionId: string,
  updateData: ISubscriptionUpdate
): Promise<ISubscription> {
  if (!Types.ObjectId.isValid(subscriptionId)) {
    throw new Error('Invalid subscription ID format');
  }

  const subscription = await this.findById(subscriptionId);
  if (!subscription) {
    throw new Error('Subscription not found');
  }

  // Update subscription fields
  Object.assign(subscription, updateData);

  // Recalculate storage limit if plan changed
  if (updateData.plan) {
    subscription.storageLimit = STORAGE_LIMITS[updateData.plan];
    await subscription.validateStorageLimit();
  }

  return subscription.save();
};

/**
 * Static method to calculate current storage usage
 */
SubscriptionSchema.statics.calculateStorageUsage = async function(subscriptionId: string): Promise<number> {
  if (!Types.ObjectId.isValid(subscriptionId)) {
    throw new Error('Invalid subscription ID format');
  }

  const subscription = await this.findById(subscriptionId);
  if (!subscription) {
    throw new Error('Subscription not found');
  }

  // TODO: Implement S3 storage calculation logic
  // This would typically involve AWS SDK calls to calculate bucket usage
  // For now, return current stored value
  return subscription.currentStorageUsage;
};

// Create and export the model
const SubscriptionModel = model<ISubscription>('Subscription', SubscriptionSchema);
export default SubscriptionModel;