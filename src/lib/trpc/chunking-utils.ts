/**
 * Shared utilities for message chunking to handle AppSync Event API's 240KB message size limit
 * Used by both client and server to transparently chunk and reassemble large messages
 */

// AppSync Event API has a 240KB limit; we use a conservative limit with overhead buffer
// Note: Base64 encoding increases size by ~33%, so we need to account for that
export const MAX_MESSAGE_SIZE = 200 * 1024; // 200KB to leave room for metadata and encoding overhead
export const CHUNK_SIZE = 140 * 1024; // 140KB per chunk; becomes ~187KB in base64, well under 240KB limit

export interface ChunkMetadata {
  messageId: string;
  chunkIndex: number;
  totalChunks: number;
  isChunked: true;
  chunkData: string; // Base64 encoded chunk
}

export interface ChunkedMessage {
  isChunked: true;
  messageId: string;
  chunkIndex: number;
  totalChunks: number;
  chunkData: string;
}

export interface CompleteMessage {
  isChunked: false;
  data: any;
}

export type MessagePayload = ChunkedMessage | CompleteMessage;

/**
 * Calculate the size of a JSON message in bytes
 */
export function calculateMessageSize(data: any): number {
  const jsonString = JSON.stringify(data);
  // Use TextEncoder for accurate byte size calculation
  return new TextEncoder().encode(jsonString).length;
}

/**
 * Check if a message needs to be chunked
 */
export function needsChunking(data: any): boolean {
  return calculateMessageSize(data) > MAX_MESSAGE_SIZE;
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Chunk a large message into smaller pieces
 */
export function chunkMessage(data: any): ChunkedMessage[] {
  const messageId = generateMessageId();
  const jsonString = JSON.stringify(data);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(jsonString);
  
  const chunks: ChunkedMessage[] = [];
  const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, bytes.length);
    const chunkBytes = bytes.slice(start, end);
    
    // Convert to base64 for safe transmission
    // Process in smaller batches to avoid stack overflow with large arrays
    let binaryString = '';
    const batchSize = 8192; // Process 8KB at a time
    for (let j = 0; j < chunkBytes.length; j += batchSize) {
      const batch = chunkBytes.slice(j, Math.min(j + batchSize, chunkBytes.length));
      binaryString += String.fromCharCode(...batch);
    }
    const chunkData = btoa(binaryString);
    
    chunks.push({
      isChunked: true,
      messageId,
      chunkIndex: i,
      totalChunks,
      chunkData,
    });
  }
  
  return chunks;
}

/**
 * Reassemble chunks into the original message
 */
export function reassembleChunks(chunks: ChunkedMessage[]): any {
  if (chunks.length === 0) {
    throw new Error('No chunks to reassemble');
  }
  
  // Sort chunks by index to ensure correct order
  const sortedChunks = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  
  // Verify we have all chunks
  const messageId = sortedChunks[0].messageId;
  const totalChunks = sortedChunks[0].totalChunks;
  
  if (sortedChunks.length !== totalChunks) {
    throw new Error(
      `Missing chunks: expected ${totalChunks}, got ${sortedChunks.length}`
    );
  }
  
  // Verify all chunks belong to the same message
  for (const chunk of sortedChunks) {
    if (chunk.messageId !== messageId) {
      throw new Error('Chunks belong to different messages');
    }
  }
  
  // Decode and concatenate all chunk data
  const allBytes: number[] = [];
  
  for (const chunk of sortedChunks) {
    // Decode base64
    const chunkString = atob(chunk.chunkData);
    for (let i = 0; i < chunkString.length; i++) {
      allBytes.push(chunkString.charCodeAt(i));
    }
  }
  
  // Convert back to string and parse JSON
  const decoder = new TextDecoder();
  const jsonString = decoder.decode(new Uint8Array(allBytes));
  
  return JSON.parse(jsonString);
}

/**
 * Chunk store for managing incoming chunks (client-side)
 */
export class ChunkStore {
  private chunks = new Map<string, ChunkedMessage[]>();
  private timeouts = new Map<string, NodeJS.Timeout>();
  private readonly cleanupDelay = 60000; // 1 minute timeout for incomplete messages
  
  /**
   * Add a chunk to the store
   * Returns the complete message if all chunks are received, null otherwise
   */
  addChunk(chunk: ChunkedMessage): any | null {
    const { messageId, totalChunks } = chunk;
    
    // Initialize array for this message if needed
    if (!this.chunks.has(messageId)) {
      this.chunks.set(messageId, []);
    }
    
    const messageChunks = this.chunks.get(messageId)!;
    messageChunks.push(chunk);
    
    // Reset timeout for this message
    this.resetTimeout(messageId);
    
    // Check if we have all chunks
    if (messageChunks.length === totalChunks) {
      const completeMessage = reassembleChunks(messageChunks);
      this.cleanup(messageId);
      return completeMessage;
    }
    
    return null;
  }
  
  /**
   * Reset the cleanup timeout for a message
   */
  private resetTimeout(messageId: string): void {
    // Clear existing timeout
    const existingTimeout = this.timeouts.get(messageId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
      this.cleanup(messageId);
    }, this.cleanupDelay);
    
    this.timeouts.set(messageId, timeout);
  }
  
  /**
   * Clean up chunks for a message
   */
  private cleanup(messageId: string): void {
    this.chunks.delete(messageId);
    
    const timeout = this.timeouts.get(messageId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(messageId);
    }
  }
  
  /**
   * Clear all stored chunks
   */
  clear(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.chunks.clear();
    this.timeouts.clear();
  }
}
