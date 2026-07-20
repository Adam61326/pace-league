// Palette fixe de dégradés à deux couleurs pour les avatars sans photo.
// L'appariement utilisateur -> paire de couleurs est déterministe (hash de
// l'id), pas aléatoire à chaque rendu (CLAUDE.md Sprint 9).
const AVATAR_GRADIENTS: readonly [string, string][] = [
  ["#FF6B6B", "#FFD93D"],
  ["#4D96FF", "#6BCB77"],
  ["#A66CFF", "#FF6CAB"],
  ["#39D353", "#1F9E4C"],
  ["#FF9F43", "#FF6B6B"],
  ["#00C9A7", "#4D96FF"],
  ["#FF6CAB", "#FFD93D"],
  ["#4D96FF", "#A66CFF"],
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getAvatarGradient(userId: string): readonly [string, string] {
  return AVATAR_GRADIENTS[hashString(userId) % AVATAR_GRADIENTS.length];
}
