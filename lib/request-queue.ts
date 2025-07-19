interface QueuedRequest {
  id: string;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
  retries: number;
}

interface QueueConfig {
  concurrentLimit: number;
  maxRetries: number;
  retryDelay: number;
  requestTimeout: number;
}

class RequestQueue {
  private queue: QueuedRequest[] = [];
  private activeRequests = 0;
  private config: QueueConfig;
  
  constructor(config: QueueConfig) {
    this.config = config;
  }
  
  async enqueue<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: Math.random().toString(36).substring(7),
        execute: requestFn,
        resolve,
        reject,
        timestamp: Date.now(),
        retries: 0
      };
      
      this.queue.push(queuedRequest);
      this.processQueue();
    });
  }
  
  private async processQueue() {
    if (this.activeRequests >= this.config.concurrentLimit || this.queue.length === 0) {
      return;
    }
    
    const request = this.queue.shift();
    if (!request) return;
    
    this.activeRequests++;
    
    try {
      // Check if request has timed out
      if (Date.now() - request.timestamp > this.config.requestTimeout) {
        throw new Error('Request timeout');
      }
      
      const result = await request.execute();
      request.resolve(result);
    } catch (error) {
      await this.handleRequestError(request, error);
    } finally {
      this.activeRequests--;
      // Process next request in queue
      setTimeout(() => this.processQueue(), 100);
    }
  }
  
  private async handleRequestError(request: QueuedRequest, error: any) {
    const shouldRetry = request.retries < this.config.maxRetries && 
      (error?.status === 429 || error?.message?.includes('rate limit'));
    
    if (shouldRetry) {
      request.retries++;
      const delay = this.config.retryDelay * Math.pow(2, request.retries - 1); // Exponential backoff
      
      setTimeout(() => {
        this.queue.unshift(request); // Add back to front of queue
        this.processQueue();
      }, delay);
    } else {
      request.reject(error);
    }
  }
  
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      isAtCapacity: this.activeRequests >= this.config.concurrentLimit
    };
  }
}

// Pre-configured queues for different services
export const falQueue = new RequestQueue({
  concurrentLimit: 10, // Conservative limit for FAL AI
  maxRetries: 3,
  retryDelay: 5000, // 5 seconds base delay
  requestTimeout: 300000 // 5 minutes (matching your maxDuration)
});

export const openaiQueue = new RequestQueue({
  concurrentLimit: 20, // Higher limit for OpenAI
  maxRetries: 3,
  retryDelay: 2000, // 2 seconds base delay
  requestTimeout: 120000 // 2 minutes
});

export const anthropicQueue = new RequestQueue({
  concurrentLimit: 15, // Conservative limit for Anthropic
  maxRetries: 3,
  retryDelay: 3000, // 3 seconds base delay
  requestTimeout: 60000 // 1 minute
});

// Utility function to wrap API calls with queue + rate limiting
export async function queuedAPICall<T>(
  queue: RequestQueue,
  apiCall: () => Promise<T>,
  fallbackMessage?: string
): Promise<T> {
  try {
    return await queue.enqueue(apiCall);
  } catch (error) {
    if (fallbackMessage) {
      console.error(`Queued API call failed: ${error}. Using fallback.`);
      // Return a fallback response instead of throwing
      return { 
        status: 'fallback', 
        message: fallbackMessage,
        error: error instanceof Error ? error.message : 'Unknown error'
      } as T;
    }
    throw error;
  }
} 