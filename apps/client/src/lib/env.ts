/**
 * Runtime environment validation for the client.
 * Validates that required environment variables are set and have valid formats.
 * Automatically infers production API URL when deployed if build-time env defaults to localhost.
 */

function validateUrl(value: string, name: string): void {
  try {
    new URL(value);
  } catch {
    throw new Error(
      `❌ ENV ERROR: ${name}="${value}" is not a valid URL. ` +
      `Expected format: http://localhost:3200/api or https://your-domain.com/api`
    );
  }
}

export function validateEnv(): { apiUrl: string } {
  let apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3200/api';

  if (typeof window !== 'undefined') {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    // If running in browser in production but build-time env hardcoded localhost
    if (!isLocalhost && (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1'))) {
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;

      if (hostname.startsWith('lms.')) {
        apiUrl = `${protocol}//${hostname.replace(/^lms\./, 'api-lms.')}/api`;
      } else if (hostname.startsWith('lms-')) {
        apiUrl = `${protocol}//${hostname.replace(/^lms-/, 'api-lms-')}/api`;
      } else {
        apiUrl = `${protocol}//api.${hostname}/api`;
      }
    }
  }

  // Validate URL format
  validateUrl(apiUrl, 'NEXT_PUBLIC_API_URL');

  return { apiUrl };
}

// Singleton — validated once, reused everywhere
let _env: ReturnType<typeof validateEnv> | null = null;

export function getEnv() {
  if (typeof window !== 'undefined') {
    return validateEnv();
  }
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}
