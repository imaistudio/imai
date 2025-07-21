// falKeyManager.ts
// Production-ready, Vercel-compatible FAL API key manager

// Load keys from environment variables: FAL_KEY_1, FAL_KEY_2, FAL_KEY_3, ...
const FAL_KEYS = Object.entries(process.env)
  .filter(([key]) => key.startsWith('FAL_KEY_'))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, value]) => value)
  .filter(Boolean);

if (FAL_KEYS.length === 0) {
  throw new Error('No FAL API keys found in environment variables (FAL_KEY_1, FAL_KEY_2, ...)');
}

// Stateless round-robin: use a random offset per request (safe for serverless)
export function getNextFalKey() {
  // Use a random key for each request to distribute load
  const idx = Math.floor(Math.random() * FAL_KEYS.length);
  return FAL_KEYS[idx];
}

// Optionally, expose all keys (for diagnostics)
export function getAllFalKeys() {
  return [...FAL_KEYS];
} 