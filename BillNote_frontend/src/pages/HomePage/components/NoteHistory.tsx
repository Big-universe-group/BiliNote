import { useTaskStore } from '@/store/taskStore'
import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import { cn } from '@/lib/utils.ts'
import { Trash, Download, X, CheckSquare } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import Fuse from 'fuse.js'
import JSZip from 'jszip'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx'
import LazyImage from '@/components/LazyImage.tsx'
import { FC, useState, useEffect, useMemo } from 'react'
import { Markdown, Task } from '@/store/taskStore'
import toast from 'react-hot-toast'

interface NoteHistoryProps {
  onSelect: (taskId: string) => void
  selectedId: string | null
}

function getMarkdownContent(task: Task): string {
  const md = task.markdown
  if (!md) return ''
  if (typeof md === 'string') return md
  if (Array.isArray(md) && md.length > 0) return (md[0] as Markdown).content
  return ''
}

function safeFilename(title: string): string {
  return (title || '未命名笔记').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
}

const NoteHistory: FC<NoteHistoryProps> = ({ onSelect, selectedId }) => {
  const tasks = useTaskStore(state => state.tasks)
  const removeTask = useTaskStore(state => state.removeTask)
  const baseURL = (String(import.meta.env.VITE_API_BASE_URL || 'api')).replace(/\/$/, '')

  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const fuse = useMemo(() => new Fuse(tasks, {
    keys: ['audioMeta.title'],
    threshold: 0.4,
  }), [tasks])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (rawSearch === '') return
      setSearch(rawSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [rawSearch])

  useEffect(() => {
    if (!selectMode) setSelectedIds(new Set())
  }, [selectMode])

  const filteredTasks = search.trim()
    ? fuse.search(search).map(r => r.item)
    : tasks

  const allSelected =
    filteredTasks.length > 0 && filteredTasks.every(t => selectedIds.has(t.id))

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(filteredTasks.map(t => t.id)))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // 导出：仅对 SUCCESS 的任务有效
  const handleExport = async () => {
    const toExport = tasks.filter(t => selectedIds.has(t.id) && t.status === 'SUCCESS')
    if (toExport.length === 0) {
      toast.error('所选笔记中没有已完成的记录')
      return
    }

    if (toExport.length === 1) {
      const task = toExport[0]
      const blob = new Blob([getMarkdownContent(task)], { type: 'text/markdown;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${safeFilename(task.audioMeta.title)}.md`
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success('导出成功')
      return
    }

    const zip = new JSZip()
    const nameCount: Record<string, number> = {}
    for (const task of toExport) {
      const name = safeFilename(task.audioMeta.title)
      nameCount[name] = (nameCount[name] || 0) + 1
      const filename = nameCount[name] > 1 ? `${name}(${nameCount[name]})` : name
      zip.file(`${filename}.md`, getMarkdownContent(task))
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `BiliNote_export_${toExport.length}篇.zip`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success(`已导出 ${toExport.length} 篇笔记`)
  }

  // 批量删除：任意状态均可删除
  const handleDelete = () => {
    if (selectedIds.size === 0) return
    selectedIds.forEach(id => removeTask(id))
    toast.success(`已删除 ${selectedIds.size} 条记录`)
    setSelectedIds(new Set())
  }

  const exportableCount = [...selectedIds].filter(
    id => tasks.find(t => t.id === id)?.status === 'SUCCESS'
  ).length

  return (
    <>
      {/* 搜索框 + 工具栏 */}
      <div className="mb-2 space-y-2">
        <input
          type="text"
          placeholder="搜索笔记标题..."
          className="w-full rounded border border-neutral-300 px-3 py-1 text-sm outline-none focus:border-primary"
          value={rawSearch}
          onChange={e => {
            setRawSearch(e.target.value)
            if (e.target.value === '') setSearch('')
          }}
        />

        {!selectMode ? (
          /* 多选入口 */
          <Button
            variant="outline"
            size="small"
            className="w-full text-xs"
            onClick={() => setSelectMode(true)}
            disabled={filteredTasks.length === 0}
          >
            <CheckSquare className="mr-1 h-3 w-3" />
            多选
          </Button>
        ) : (
          /* 多选工具栏 */
          <div className="space-y-1">
            {/* 第一行：全选 + 已选数 + 退出 */}
            <div className="flex items-center gap-1">
              <div
                className="flex flex-1 cursor-pointer items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                onClick={toggleSelectAll}
              >
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  onClick={e => e.stopPropagation()}
                  className="h-3 w-3"
                />
                <span>{allSelected ? '取消全选' : '全选'}</span>
                {selectedIds.size > 0 && (
                  <span className="text-primary ml-auto font-medium">{selectedIds.size}</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="small"
                className="shrink-0 px-1"
                onClick={() => setSelectMode(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            {/* 第二行：操作按钮 */}
            <div className="flex gap-1">
              <Button
                size="small"
                variant="outline"
                className="flex-1 text-xs"
                onClick={handleExport}
                disabled={exportableCount === 0}
              >
                <Download className="mr-1 h-3 w-3" />
                导出{exportableCount > 0 ? `(${exportableCount})` : ''}
              </Button>
              <Button
                size="small"
                variant="outline"
                className="flex-1 text-xs text-red-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                onClick={handleDelete}
                disabled={selectedIds.size === 0}
              >
                <Trash className="mr-1 h-3 w-3" />
                删除{selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </Button>
            </div>
          </div>
        )}
      </div>

      {filteredTasks.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 py-6 text-center">
          <p className="text-sm text-neutral-500">暂无记录</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-hidden">
          {filteredTasks.map(task => {
            const isSuccess = task.status === 'SUCCESS'
            const isChecked = selectedIds.has(task.id)

            return (
              <div
                key={task.id}
                onClick={() => {
                  if (selectMode) {
                    toggleSelect(task.id)
                  } else {
                    onSelect(task.id)
                  }
                }}
                className={cn(
                  'flex cursor-pointer flex-col rounded-md border border-neutral-200 p-3',
                  !selectMode && selectedId === task.id && 'border-primary bg-primary-light',
                  selectMode && isChecked && 'border-primary bg-primary-light',
                )}
              >
                <div className="flex items-center gap-2">
                  {/* 多选 checkbox */}
                  {selectMode && (
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleSelect(task.id)}
                      onClick={e => e.stopPropagation()}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                  )}

                  {/* 封面图 */}
                  {task.platform === 'local' ? (
                    <img
                      src={task.audioMeta.cover_url || '/placeholder.png'}
                      alt="封面"
                      className="h-10 w-12 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <LazyImage
                      src={
                        task.audioMeta.cover_url
                          ? `${baseURL}/image_proxy?url=${encodeURIComponent(task.audioMeta.cover_url)}`
                          : '/placeholder.png'
                      }
                      alt="封面"
                    />
                  )}

                  {/* 标题 */}
                  <div className="flex w-full items-center justify-between gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="line-clamp-2 max-w-[180px] flex-1 overflow-hidden text-ellipsis text-sm">
                            {task.audioMeta.title || '未命名笔记'}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{task.audioMeta.title || '未命名笔记'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <div className="shrink-0">
                    {isSuccess && (
                      <div className="bg-primary w-10 rounded p-0.5 text-center text-white">已完成</div>
                    )}
                    {!isSuccess && task.status !== 'FAILED' && (
                      <div className="w-10 rounded bg-green-500 p-0.5 text-center text-white">等待中</div>
                    )}
                    {task.status === 'FAILED' && (
                      <div className="w-10 rounded bg-red-500 p-0.5 text-center text-white">失败</div>
                    )}
                  </div>

                  {/* 单个删除（非多选模式） */}
                  {!selectMode && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="small"
                            variant="ghost"
                            onClick={e => { e.stopPropagation(); removeTask(task.id) }}
                            className="shrink-0"
                          >
                            <Trash className="text-muted-foreground h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>删除</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

export default NoteHistory
