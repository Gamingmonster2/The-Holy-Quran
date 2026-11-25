import { getPosts, getSummary, getCover } from '../lib/content.mjs';

export function GET() {
  const items = getPosts()
    .filter((p) => p.path !== '/blog/')
    .map((p) => ({
      title: p.title,
      path: p.path,
      summary: getSummary(p, 160),
      cover: getCover(p),
    }));
  return new Response(JSON.stringify(items), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
