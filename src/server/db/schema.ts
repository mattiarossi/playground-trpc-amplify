import { pgTable, serial, text, timestamp, integer, boolean, varchar, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  emailIdx: uniqueIndex('email_idx').on(table.email),
  nameIdx: uniqueIndex('name_idx').on(table.name),
}));

// Posts table
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 500 }).notNull(),
  slug: varchar('slug', { length: 500 }).notNull().unique(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  published: boolean('published').default(false).notNull(),
  authorId: text('author_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  viewCount: integer('view_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: uniqueIndex('slug_idx').on(table.slug),
}));

// Comments table
export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  authorId: text('author_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  parentId: integer('parent_id').references((): any => comments.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Tags table
export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: uniqueIndex('tag_slug_idx').on(table.slug),
}));

// Post-Tags junction table (many-to-many)
export const postsTags = pgTable('posts_tags', {
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  tagId: integer('tag_id').references(() => tags.id, { onDelete: 'cascade' }).notNull(),
}, (table) => ({
  pk: uniqueIndex('posts_tags_pk').on(table.postId, table.tagId),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  comments: many(comments),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  comments: many(comments),
  postsTags: many(postsTags),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, {
    fields: [comments.postId],
    references: [posts.id],
  }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: 'comment_replies',
  }),
  replies: many(comments, {
    relationName: 'comment_replies',
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  postsTags: many(postsTags),
}));

export const postsTagsRelations = relations(postsTags, ({ one }) => ({
  post: one(posts, {
    fields: [postsTags.postId],
    references: [posts.id],
  }),
  tag: one(tags, {
    fields: [postsTags.tagId],
    references: [tags.id],
  }),
}));

// Message Chunks table (for AppSync Events chunking)
// Not exposed to client, used internally by Lambda handler
export const messageChunks = pgTable('message_chunks', {
  messageId: varchar('message_id', { length: 255 }).notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  totalChunks: integer('total_chunks').notNull(),
  chunkData: text('chunk_data').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pk: uniqueIndex('message_chunks_pk').on(table.messageId, table.chunkIndex),
}));

// Client Sessions table (for secure WebSocket session management)
// Maps server-generated session UUIDs to Cognito user IDs
// Allows multiple sessions per user (multiple tabs/devices)
// Sessions expire after 24 hours of inactivity
export const clientSessions = pgTable('client_sessions', {
  sessionId: varchar('session_id', { length: 36 }).primaryKey(), // UUID v4
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: uniqueIndex('client_sessions_user_id_idx').on(table.userId, table.sessionId),
  lastUsedIdx: uniqueIndex('client_sessions_last_used_idx').on(table.lastUsedAt),
}));

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type MessageChunk = typeof messageChunks.$inferSelect;
export type NewMessageChunk = typeof messageChunks.$inferInsert;
export type ClientSession = typeof clientSessions.$inferSelect;
export type NewClientSession = typeof clientSessions.$inferInsert;
