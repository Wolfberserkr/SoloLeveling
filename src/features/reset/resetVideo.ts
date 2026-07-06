/** Normalize a YouTube/Vimeo URL (or bare YouTube id) to an embeddable src. */
export function parseVideo(url: string): string | null {
  url = (url || '').trim();
  if (!url) return null;
  let m: RegExpMatchArray | null;
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/))) {
    return 'https://www.youtube-nocookie.com/embed/' + m[1];
  }
  if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) {
    return 'https://player.vimeo.com/video/' + m[1];
  }
  if (/^[\w-]{11}$/.test(url)) return 'https://www.youtube-nocookie.com/embed/' + url;
  return null;
}
