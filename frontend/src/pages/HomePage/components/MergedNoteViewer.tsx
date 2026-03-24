import { FC } from 'react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button.tsx'
import { Download, X } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { atomDark as codeStyle } from 'react-syntax-highlighter/dist/esm/styles/prism'
import gfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import 'github-markdown-css/github-markdown-light.css'

interface MergedNoteViewerProps {
  content: string
  noteCount: number
  onClear: () => void
}

const MergedNoteViewer: FC<MergedNoteViewerProps> = ({ content, noteCount, onClear }) => {
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `BiliNote_合并_${noteCount}篇.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 顶栏 */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b bg-white/95 px-4 py-2 backdrop-blur-sm">
        <span className="text-sm font-medium text-neutral-700">
          合并笔记（共 {noteCount} 篇）
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={handleDownload}>
            <Download className="mr-1 h-3.5 w-3.5" />
            <span className="text-xs">导出 MD</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-1.5 text-neutral-500 hover:text-red-500" onClick={onClear}>
            <X className="mr-1 h-3.5 w-3.5" />
            <span className="text-xs">清除</span>
          </Button>
        </div>
      </div>

      {/* 内容区 */}
      <ScrollArea className="flex-1">
        <div className="markdown-body px-8 py-6 text-sm">
          <ReactMarkdown
            remarkPlugins={[gfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '')
                return !inline && match ? (
                  <SyntaxHighlighter
                    style={codeStyle as any}
                    language={match[1]}
                    PreTag="div"
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                )
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </ScrollArea>
    </div>
  )
}

export default MergedNoteViewer
