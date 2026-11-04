import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Model-authored prose: no embedded HTML, remote images, or broken repository links. */
export function ReviewMarkdown({children}:{children:string}){
 return <div className="review-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
  h1:({children})=><h3>{children}</h3>,
  h2:({children})=><h4>{children}</h4>,
  h3:({children})=><h5>{children}</h5>,
  a:({href,children})=>href&&/^https?:\/\//i.test(href)?<a href={href} target="_blank" rel="noreferrer">{children}</a>:<span className="review-file-reference">{children}</span>,
  img:({alt})=><span>{alt}</span>,
  table:({children})=><div className="review-table-scroll" tabIndex={0}><table>{children}</table></div>,
 }}>{children}</Markdown></div>;
}
