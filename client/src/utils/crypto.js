/**
 * Compute SHA-256 hash of an ArrayBuffer.
 * Returns hex string like "a3f2...".
 */
export async function sha256(buffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
