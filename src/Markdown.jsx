// Minimal, dependency-free markdown renderer for mentor messages.
// Handles the subset the agents actually emit: headings, bold, inline code,
// bullet/numbered lists, and paragraphs. Keeps us off a heavy markdown dep
// while fixing the "raw **stars** and bullets" rendering problem.

function renderInline(text, keyPrefix) {
  // Strip LaTeX notation ($...$, $$...$$, \(...\), \[...\])
  let cleaned = String(text)
    .replace(/\$\$[^\$]+\$\$/g, '')  // Remove display math $$...$$
    .replace(/\$[^\$]+\$/g, '')      // Remove inline math $...$
    .replace(/\\\([^)]+\\\)/g, '')   // Remove \(...\)
    .replace(/\\\[[^\]]+\\\]/g, ''); // Remove \[...\]

  // Split on **bold** and `code`, keep delimiters.
  const parts = cleaned.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={`${keyPrefix}-b-${i}`}>{part.slice(2, -2)}</strong>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return <code key={`${keyPrefix}-c-${i}`}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export default function Markdown({ text, className }) {
  if (!text) return null;

  const lines = String(text).split('\n');
  const blocks = [];
  let list = null; // { type: 'ul' | 'ol', items: [] }

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={`li-${blocks.length}-${i}`}>{renderInline(it, `li-${blocks.length}-${i}`)}</li>);
    blocks.push(list.type === 'ol' ? <ol key={`ol-${blocks.length}`}>{items}</ol> : <ul key={`ul-${blocks.length}`}>{items}</ul>);
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (!line.trim()) { flushList(); return; }

    // Headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList();
      const level = h[1].length;
      const Tag = `h${Math.min(level + 2, 6)}`;
      blocks.push(<Tag key={`h-${idx}`}>{renderInline(h[2], `h-${idx}`)}</Tag>);
      return;
    }

    // Bullet list (-, *, •)
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(bullet[1]);
      return;
    }

    // Numbered list
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (num) {
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(num[1]);
      return;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { flushList(); blocks.push(<hr key={`hr-${idx}`} />); return; }

    flushList();
    blocks.push(<p key={`p-${idx}`}>{renderInline(line, `p-${idx}`)}</p>);
  });
  flushList();

  return <div className={className ? `md ${className}` : 'md'}>{blocks}</div>;
}
