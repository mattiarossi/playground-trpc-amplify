'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/provider';
import { formatDistanceToNow } from 'date-fns';

interface CommentSectionProps {
  postId: number;
}

export function CommentSection({ postId }: CommentSectionProps) {
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<number | null>(null);

  const utils = trpc.useUtils();
  
  const { data: comments, isLoading } = trpc.comments.byPostId.useQuery(
    {
      postId,
      includeReplies: true,
    },
    {
      // Refetch when window regains focus (user switches back to tab)
      refetchOnWindowFocus: true,
      // Refetch every 10 seconds while page is active
      refetchInterval: 10000,
      refetchIntervalInBackground: false,
    }
  );

  const createComment = trpc.comments.create.useMutation({
    onSuccess: () => {
      setNewComment('');
      setReplyTo(null);
      utils.comments.byPostId.invalidate({ postId });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newComment.trim()) return;

    createComment.mutate({
      content: newComment,
      postId,
      parentId: replyTo || undefined,
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Comments {comments && `(${comments.length})`}
      </h2>

      {/* Comment Form */}
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="mb-4">
          <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-2">
            {replyTo ? 'Write a reply...' : 'Add a comment...'}
          </label>
          <textarea
            id="comment"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            placeholder="What are your thoughts?"
          />
        </div>

        <div className="flex justify-between items-center">
          {replyTo && (
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel Reply
            </button>
          )}
          <div className="flex-1"></div>
          <button
            type="submit"
            disabled={createComment.isPending || !newComment.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createComment.isPending ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </form>

      {/* Comments List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : comments && comments.length > 0 ? (
        <div className="space-y-6">
          {comments.map((comment) => (
            <div key={comment.id} className="border-b border-gray-200 pb-6 last:border-0">
              {/* Comment */}
              <div className="flex items-start space-x-3">
                <img
                  src={comment.author.avatarUrl || `https://ui-avatars.com/api/?name=${comment.author.name}`}
                  alt={comment.author.name}
                  className="w-10 h-10 rounded-full"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-medium text-gray-900">
                      {comment.author.name}
                    </span>
                    <span className="text-sm text-gray-500">
                      {formatDistanceToNow(new Date(comment.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <p className="text-gray-700 mb-2">{comment.content}</p>
                  <button
                    onClick={() => setReplyTo(comment.id)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Reply
                  </button>
                </div>
              </div>

              {/* Replies */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="ml-12 mt-4 space-y-4">
                  {comment.replies.map((reply) => {
                    // Type guard to ensure reply has author
                    if (!('author' in reply) || !reply.author) return null;
                    
                    return (
                      <div key={reply.id} className="flex items-start space-x-3">
                        <img
                          src={reply.author.avatarUrl || `https://ui-avatars.com/api/?name=${reply.author.name}`}
                          alt={reply.author.name}
                          className="w-8 h-8 rounded-full"
                        />
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-medium text-gray-900 text-sm">
                              {reply.author.name}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDistanceToNow(new Date(reply.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          <p className="text-gray-700 text-sm">{reply.content}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-600 text-center py-8">
          No comments yet. Be the first to comment!
        </p>
      )}
    </div>
  );
}
