import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export async function extractArticle(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  
  if (!article) return null;
  
  return {
    title: article.title,
    content: article.textContent,
    excerpt: article.excerpt
  };
}
