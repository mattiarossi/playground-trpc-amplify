'use client';

import { Amplify } from 'aws-amplify';

let isConfigured = false;
let configPromise: Promise<void> | null = null;

/**
 * Configure Amplify and track initialization state
 * This ensures configuration only happens once and can be awaited
 */
export function configureAmplify(): Promise<void> {
  if (isConfigured) {
    return Promise.resolve();
  }

  if (configPromise) {
    return configPromise;
  }

  configPromise = (async () => {
    try {
      const outputs = require('../../../amplify_outputs.json');
      Amplify.configure(outputs, {
        ssr: false, // We're in a client component
      });
      isConfigured = true;
    } catch (e) {
      console.error('Failed to load amplify_outputs.json:', e);
      throw e;
    }
  })();

  return configPromise;
}

/**
 * Wait for Amplify to be configured before proceeding
 * Use this in hooks that depend on Amplify being ready
 */
export async function waitForAmplifyConfig(): Promise<void> {
  if (isConfigured) {
    return;
  }

  // Wait for configuration to complete (with timeout)
  const timeout = new Promise<void>((_, reject) =>
    setTimeout(() => reject(new Error('Amplify configuration timeout')), 5000)
  );

  try {
    await Promise.race([
      configPromise || Promise.reject(new Error('Amplify not configured')),
      timeout,
    ]);
  } catch (error) {
    console.error('Failed to wait for Amplify configuration:', error);
    throw error;
  }
}

/**
 * Check if Amplify is configured (synchronous)
 */
export function isAmplifyConfigured(): boolean {
  return isConfigured;
}
