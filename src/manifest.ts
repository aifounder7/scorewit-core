/** Published installation identities. Changing one creates a different app.
 * Do not normalize trailing slashes or derive these from names/start URLs. */
export const PUBLISHED_MANIFEST_IDS: Readonly<Record<string, string>> = Object.freeze({
  '/manifest.webmanifest': '/',
  '/worldcup/manifest.webmanifest': '/worldcup',
  '/f1/manifest.webmanifest': '/f1/',
  '/footyphoria/manifest.webmanifest': '/footyphoria/',
  '/superover/manifest.webmanifest': '/superover/',
  '/cricket/manifest.webmanifest': '/cricket/',
  '/gridiron/manifest.webmanifest': '/gridiron/',
  '/baseball/manifest.webmanifest': '/baseball/',
});
export function assertPublishedManifestIdentity(manifestPath: string, manifest: { id?: unknown }): void {
  if (!Object.prototype.hasOwnProperty.call(PUBLISHED_MANIFEST_IDS, manifestPath)) {
    throw new Error(`Unregistered published manifest: ${manifestPath}`);
  }
  if (manifest.id !== PUBLISHED_MANIFEST_IDS[manifestPath]) {
    throw new Error(`Published manifest id is locked: ${manifestPath} must remain ${JSON.stringify(PUBLISHED_MANIFEST_IDS[manifestPath])}`);
  }
}
export interface PwaConfig {
  /** Explicit opt-in to shared-origin territory; installed identities stay fixed. */
  scope: '/';
  name?: string;
}
