import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * The markdown renderer itself, loaded on demand by `Markdown`. Raw HTML in the source is not
 * rendered (react-markdown escapes it), so authored content can't inject scripts.
 */
export default function MarkdownRenderer({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children: text }) => (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {text}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
