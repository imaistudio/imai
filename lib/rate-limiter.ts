interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class SimpleRateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  
  constructor(private config: RateLimitConfig) {}
  
  async checkLimit(key: string): Promise<{ allowed: boolean; resetTime: number; remaining: number }> {
    const now = Date.now();
    const entry = this.limits.get(key);
    
    // If no entry or window expired, create new entry
    if (!entry || now > entry.resetTime) {
      this.limits.set(key, {
        count: 1,
        resetTime: now + this.config.windowMs
      });
      return {
        allowed: true,
        resetTime: now + this.config.windowMs,
        remaining: this.config.maxRequests - 1
      };
    }
    
    // Check if limit exceeded
    if (entry.count >= this.config.maxRequests) {
      return {
        allowed: false,
        resetTime: entry.resetTime,
        remaining: 0
      };
    }
    
    // Increment counter
    entry.count++;
    this.limits.set(key, entry);
    
    return {
      allowed: true,
      resetTime: entry.resetTime,
      remaining: this.config.maxRequests - entry.count
    };
  }
  
  // Clean up expired entries periodically
  cleanup() {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    this.limits.forEach((entry, key) => {
      if (now > entry.resetTime) {
        expiredKeys.push(key);
      }
    });
    
    expiredKeys.forEach(key => this.limits.delete(key));
  }
}

// Pre-configured rate limiters for different services
export const falAILimiter = new SimpleRateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 15 // Conservative limit for FAL AI
});

export const openAILimiter = new SimpleRateLimiter({
  windowMs: 60 * 1000, // 1 minute window  
  maxRequests: 30 // Conservative limit for OpenAI
});

export const anthropicLimiter = new SimpleRateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 20 // Conservative limit for Anthropic
});

// Cleanup expired entries every 5 minutes
setInterval(() => {
  falAILimiter.cleanup();
  openAILimiter.cleanup();
  anthropicLimiter.cleanup();
}, 5 * 60 * 1000); 