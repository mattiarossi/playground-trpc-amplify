/**
 * Server-side chunking utilities for Lambda handler
 * Handles message chunking with PostgreSQL for temporary storage
 */

import { db, eq } from '../../src/server/db';
import { messageChunks } from '../../src/server/db/schema';

// AppSync Event API has a 240KB limit; we use a conservative limit with overhead buffer
// Note: Base64 encoding increases size by ~33%, so we need to account for that
export const MAX_MESSAGE_SIZE = 200 * 1024; // 200KB to leave room for metadata and encoding overhead
export const CHUNK_SIZE = 140 * 1024; // 140KB per chunk; becomes ~187KB in base64, well under 240KB limit

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
  return Buffer.byteLength(jsonString, 'utf8');
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
  const buffer = Buffer.from(jsonString, 'utf8');
  
  const chunks: ChunkedMessage[] = [];
  const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, buffer.length);
    const chunkBuffer = buffer.slice(start, end);
    
    // Convert to base64 for safe transmission
    const chunkData = chunkBuffer.toString('base64');
    
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
  const buffers: Buffer[] = [];
  
  for (const chunk of sortedChunks) {
    // Decode base64
    const chunkBuffer = Buffer.from(chunk.chunkData, 'base64');
    buffers.push(chunkBuffer);
  }
  
  // Concatenate all buffers
  const completeBuffer = Buffer.concat(buffers);
  const jsonString = completeBuffer.toString('utf8');
  
  return JSON.parse(jsonString);
}

/**
 * PostgreSQL-based chunk storage manager using Drizzle ORM
 * Uses the shared db instance to avoid type conflicts
 */
export class DrizzleChunkStore {
  constructor(connectionString?: string) {
    // connectionString parameter kept for backward compatibility but not used
    // We use the shared db instance from src/server/db
  }
  
  /**
   * Store a chunk in PostgreSQL
   */
  async storeChunk(chunk: ChunkedMessage): Promise<void> {
    await db.insert(messageChunks).values({
      messageId: chunk.messageId,
      chunkIndex: chunk.chunkIndex,
      totalChunks: chunk.totalChunks,
      chunkData: chunk.chunkData,
      createdAt: new Date(),
    });
  }
  
  /**
   * Retrieve all chunks for a message
   */
  async getChunks(messageId: string): Promise<ChunkedMessage[]> {
    const chunks = await db
      .select()
      .from(messageChunks)
      .where(eq(messageChunks.messageId, messageId));
    
    if (!chunks || chunks.length === 0) {
      return [];
    }
    
    return chunks.map((chunk) => ({
      isChunked: true as const,
      messageId: chunk.messageId,
      chunkIndex: chunk.chunkIndex,
      totalChunks: chunk.totalChunks,
      chunkData: chunk.chunkData,
    }));
  }
  
  /**
   * Delete all chunks for a message (cleanup after processing)
   */
  async deleteChunks(messageId: string): Promise<void> {
    await db
      .delete(messageChunks)
      .where(eq(messageChunks.messageId, messageId));
  }
  
  /**
   * Check if all chunks for a message have been received
   */
  async hasAllChunks(messageId: string, expectedTotal: number): Promise<boolean> {
    const chunks = await this.getChunks(messageId);
    return chunks.length === expectedTotal;
  }
  
  /**
   * Clean up old chunks (older than 1 hour) to prevent storage bloat
   */
  async cleanupOldChunks(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    await db
      .delete(messageChunks)
      .where(eq(messageChunks.createdAt, oneHourAgo));
  }
}
