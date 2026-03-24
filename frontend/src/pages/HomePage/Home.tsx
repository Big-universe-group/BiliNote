import { FC, useEffect, useState } from 'react'
import { cn } from '@/lib/utils.ts'
import HomeLayout from '@/layouts/HomeLayout.tsx'
import NoteForm from '@/pages/HomePage/components/NoteForm.tsx'
import MarkdownViewer from '@/pages/HomePage/components/MarkdownViewer.tsx'
import MergedNoteViewer from '@/pages/HomePage/components/MergedNoteViewer.tsx'
import { useTaskStore } from '@/store/taskStore'
import History from '@/pages/HomePage/components/History.tsx'

type ViewStatus = 'idle' | 'loading' | 'success' | 'failed'
type RightTab = 'note' | 'merged'

export const HomePage: FC = () => {
  const tasks = useTaskStore(state => state.tasks)
  const currentTaskId = useTaskStore(state => state.currentTaskId)
  const currentTask = tasks.find(t => t.id === currentTaskId)

  const [status, setStatus] = useState<ViewStatus>('idle')
  const [rightTab, setRightTab] = useState<RightTab>('note')
  const [mergedContent, setMergedContent] = useState<string>('')
  const [mergedCount, setMergedCount] = useState<number>(0)

  useEffect(() => {
    if (!currentTask) {
      setStatus('idle')
    } else if (currentTask.status === 'SUCCESS') {
      setStatus('success')
    } else if (currentTask.status === 'FAILED') {
      setStatus('failed')
    } else {
      setStatus('loading')
    }
  }, [currentTask, currentTask?.status])

  const handleMerge = (content: string, count: number) => {
    setMergedContent(content)
    setMergedCount(count)
    setRightTab('merged')
  }

  const handleClearMerged = () => {
    setMergedContent('')
    setMergedCount(0)
    setRightTab('note')
  }

  const Preview = (
    <div className="flex h-full flex-col overflow-hidden">
      {/* tab 栏，仅在有合并内容时显示 */}
      {mergedContent && (
        <div className="flex shrink-0 border-b bg-white px-1">
          {(['note', 'merged'] as RightTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setRightTab(tab)}
              className={cn(
                'px-4 py-2 text-sm border-b-2 transition-colors',
                rightTab === tab
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              )}
            >
              {tab === 'note' ? '笔记' : `合并（${mergedCount} 篇）`}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {rightTab === 'note' || !mergedContent
          ? <MarkdownViewer status={status} />
          : (
            <MergedNoteViewer
              content={mergedContent}
              noteCount={mergedCount}
              onClear={handleClearMerged}
            />
          )
        }
      </div>
    </div>
  )

  return (
    <HomeLayout
      NoteForm={<NoteForm />}
      Preview={Preview}
      History={<History onMerge={handleMerge} />}
    />
  )
}
