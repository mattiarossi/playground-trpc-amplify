/**
 * Generate initials from a name for avatar display
 * Takes the first letter of the first two words
 * @param name - The name to generate initials from
 * @returns Two uppercase letters representing the initials
 */
export function getInitials(name: string): string {
  if (!name) return 'U';
  
  const words = name.trim().split(/\s+/);
  
  if (words.length === 1) {
    // Single word: take first two characters
    return words[0].slice(0, 2).toUpperCase();
  }
  
  // Multiple words: take first letter of first two words
  return words
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();
}

/**
 * Generate a fallback avatar URL using ui-avatars.com
 * @param name - The name to display on the avatar
 * @returns A URL for a generated avatar image with initials
 */
export function getAvatarUrl(name: string): string {
  const initials = getInitials(name);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=3b82f6&color=fff&bold=true`;
}
