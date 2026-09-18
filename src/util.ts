import path from 'path';

/**
 * Resolve a request URL to a file inside `publicDir`, rejecting any path that
 * would escape the directory (path-traversal protection).
 *
 * @returns Absolute file path inside publicDir, or null if unsafe.
 */
export function resolveSafePath(publicDir: string, urlPath: string | undefined): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  } catch {
    // Malformed percent-encoding — treat as unsafe.
    return null;
  }

  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(publicDir, relative);

  // Must be the directory itself or a descendant of it.
  if (resolved !== publicDir && !resolved.startsWith(publicDir + path.sep)) {
    return null;
  }
  return resolved;
}

/**
 * True when no usable AssemblyAI API key is configured, meaning the app should
 * run in local simulator (mock) mode.
 */
export function isMockMode(apiKey: string | undefined = process.env.ASSEMBLYAI_API_KEY): boolean {
  return (
    !apiKey ||
    apiKey === 'your_assemblyai_api_key_here' ||
    process.env.MOCK_STREAMING === 'true'
  );
}
