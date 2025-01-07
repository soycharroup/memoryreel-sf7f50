import { injectable } from 'inversify';
import { Logger } from 'winston'; // v3.8.0
import Queue from 'bull'; // v4.10.0
import { Counter, Histogram, Gauge } from 'prom-client'; // v14.0.0
import { 
    IAIProvider, 
    AIProvider, 
    IFaceDetectionResult,
    AIProviderStatus 
} from '../../../interfaces/ai.interface';
import FaceData from '../../../models/faceData.model';

@injectable()
export class FaceRecognitionService {
    private readonly logger: Logger;
    private readonly faceProcessingQueue: Queue.Queue;
    private readonly providers: Map<AIProvider, IAIProvider>;
    private readonly faceDetectionCounter: Counter;
    private readonly processingDuration: Histogram;
    private readonly queueSize: Gauge;
    private readonly failureThreshold = 3;
    private readonly retryDelay = 1000;

    constructor(
        logger: Logger,
        faceProcessingQueue: Queue.Queue,
        metricsRegistry: any
    ) {
        this.logger = logger;
        this.faceProcessingQueue = faceProcessingQueue;
        this.providers = new Map();

        // Initialize metrics
        this.faceDetectionCounter = new Counter({
            name: 'face_detection_total',
            help: 'Total number of face detection operations',
            labelNames: ['provider', 'status'],
            registers: [metricsRegistry]
        });

        this.processingDuration = new Histogram({
            name: 'face_detection_duration_seconds',
            help: 'Face detection processing duration',
            labelNames: ['provider'],
            buckets: [0.1, 0.5, 1, 2, 5],
            registers: [metricsRegistry]
        });

        this.queueSize = new Gauge({
            name: 'face_detection_queue_size',
            help: 'Current size of face detection queue',
            registers: [metricsRegistry]
        });

        // Configure queue
        this.setupQueue();
    }

    /**
     * Detects faces in an image with multi-provider failover
     */
    public async detectFaces(
        imageData: Buffer,
        contentId: string,
        libraryId: string
    ): Promise<IFaceDetectionResult> {
        const startTime = Date.now();
        let currentProvider: AIProvider | null = null;
        let lastError: Error | null = null;

        this.logger.info('Starting face detection', { contentId, libraryId });

        // Try each provider in failover chain
        for (const provider of [AIProvider.OPENAI, AIProvider.AWS, AIProvider.GOOGLE]) {
            try {
                currentProvider = provider;
                const providerInstance = this.providers.get(provider);
                
                if (!providerInstance) {
                    throw new Error(`Provider ${provider} not initialized`);
                }

                // Check provider health
                const health = await providerInstance.healthCheck();
                if (health.status !== AIProviderStatus.AVAILABLE) {
                    throw new Error(`Provider ${provider} not available: ${health.status}`);
                }

                // Start timer for provider
                const timer = this.processingDuration.startTimer({ provider });

                // Perform face detection
                const result = await providerInstance.detectFaces(imageData);
                timer();

                // Update metrics
                this.faceDetectionCounter.inc({ provider, status: 'success' });

                // Store results
                await this.storeFaceDetectionResults(result, contentId, libraryId);

                this.logger.info('Face detection completed', {
                    provider,
                    contentId,
                    duration: Date.now() - startTime,
                    facesFound: result.faces.length
                });

                return result;

            } catch (error) {
                lastError = error as Error;
                this.logger.error('Face detection failed', {
                    provider,
                    contentId,
                    error: error.message
                });
                this.faceDetectionCounter.inc({ provider, status: 'error' });
            }
        }

        // If all providers failed
        throw new Error(`All providers failed. Last error: ${lastError?.message}`);
    }

    /**
     * Processes face detection queue with monitoring
     */
    public async processFaceDetectionQueue(): Promise<void> {
        this.logger.info('Starting face detection queue processing');

        this.faceProcessingQueue.process(async (job) => {
            const { imageData, contentId, libraryId } = job.data;
            
            try {
                const result = await this.detectFaces(
                    Buffer.from(imageData),
                    contentId,
                    libraryId
                );

                this.logger.info('Queue job completed', {
                    jobId: job.id,
                    contentId,
                    facesFound: result.faces.length
                });

                return result;

            } catch (error) {
                this.logger.error('Queue job failed', {
                    jobId: job.id,
                    contentId,
                    error: error.message
                });
                throw error;
            }
        });

        // Monitor queue size
        setInterval(() => {
            this.faceProcessingQueue.getJobCounts().then(counts => {
                this.queueSize.set(counts.waiting + counts.active);
            });
        }, 5000);
    }

    /**
     * Verifies face detection results with audit logging
     */
    public async verifyFaceDetection(
        faceId: string,
        userId: string,
        verified: boolean
    ): Promise<void> {
        this.logger.info('Verifying face detection', { faceId, userId, verified });

        try {
            const faceData = await FaceData.findById(faceId);
            if (!faceData) {
                throw new Error('Face data not found');
            }

            await faceData.verifyByUser(userId);

            this.logger.info('Face verification completed', {
                faceId,
                userId,
                verified,
                contentId: faceData.contentId
            });

        } catch (error) {
            this.logger.error('Face verification failed', {
                faceId,
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Stores face detection results in database
     */
    private async storeFaceDetectionResults(
        result: IFaceDetectionResult,
        contentId: string,
        libraryId: string
    ): Promise<void> {
        try {
            const faces = result.faces.map(face => ({
                contentId,
                libraryId,
                coordinates: {
                    x: face.coordinates.x,
                    y: face.coordinates.y,
                    width: face.coordinates.width,
                    height: face.coordinates.height
                },
                confidence: face.confidence,
                provider: result.provider.toUpperCase(),
                verified: false
            }));

            await FaceData.create(faces);

        } catch (error) {
            this.logger.error('Failed to store face detection results', {
                contentId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Sets up face processing queue with monitoring
     */
    private setupQueue(): void {
        this.faceProcessingQueue.on('error', (error) => {
            this.logger.error('Queue error', { error: error.message });
        });

        this.faceProcessingQueue.on('failed', (job, error) => {
            this.logger.error('Job failed', {
                jobId: job.id,
                error: error.message
            });
        });

        this.faceProcessingQueue.on('completed', (job) => {
            this.logger.info('Job completed', { jobId: job.id });
        });
    }
}