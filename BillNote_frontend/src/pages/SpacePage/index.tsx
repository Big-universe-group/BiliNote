import { FC, useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  SlidersHorizontal, Search, Download, ListChecks, X,
  Loader2, Play, History, Trash2, ChevronRight,
  Filter, ChevronDown, ChevronUp, ChevronLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog.tsx'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/utils.ts'
import { fetchSpaceVideos, SpaceVideo, SpaceFetchParams } from '@/services/space.ts'
import { generateNote } from '@/services/note.ts'
import { useTaskStore } from '@/store/taskStore'
import { useModelStore } from '@/store/modelStore'
import { useSpaceStore, SpaceHistoryRecord, SpaceFilterSnapshot } from '@/store/spaceStore'
import { noteStyles, noteFormats } from '@/constant/note.ts'
import toast from 'react-hot-toast'
import logo from '@/assets/icon.svg'
import NavTabs from '@/components/NavTabs.tsx'

const PAGE_SIZE = 20

function formatTs(ts: number | null): string {
  if (!ts) return '--'
  return new Date(ts * 1000).toISOString().slice(0, 10)
}
function formatViews(n: number | null): string {
  if (!n) return '--'
  return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n)
}
function extractBvid(s: string): string {
  const m = s.match(/BV[a-zA-Z0-9]+/)
  return m ? m[0] : s.trim()
}

const baseURL = (String(import.meta.env.VITE_API_BASE_URL || '/api')).replace(/\/$/, '')

// ── 分页控件 ─────────────────────────────────────────────────────────────────
interface PaginationProps {
  page: number
  total: number
  pageSize: number
  onChange: (p: number) => void
}
const Pagination: FC<PaginationProps> = ({ page, total, pageSize, onChange }) => {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  // 生成页码窗口：始终显示首/末页，当前页 ±2
  const pages: (number | '...')[] = []
  const add = (n: number) => { if (!pages.includes(n)) pages.push(n) }
  add(1)
  for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) add(i)
  add(totalPages)
  // 插入省略号
  const withEllipsis: (number | '...')[] = []
  pages.forEach((p, i) => {
    if (i > 0 && typeof p === 'number' && typeof pages[i - 1] === 'number') {
      if ((p as number) - (pages[i - 1] as number) > 1) withEllipsis.push('...')
    }
    withEllipsis.push(p)
  })

  return (
    <div className="flex items-center justify-between border-t border-neutral-200 bg-white px-4 py-2">
      <span className="text-xs text-neutral-400">
        第 {page} / {totalPages} 页 · 共 {total} 条
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          className="flex h-7 w-7 items-center justify-center rounded border border-neutral-200 text-neutral-500 disabled:opacity-30 hover:border-primary hover:text-primary"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {withEllipsis.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="px-1 text-xs text-neutral-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              className={cn(
                'flex h-7 min-w-[28px] items-center justify-center rounded border px-1.5 text-xs',
                page === p
                  ? 'border-primary bg-primary text-white'
                  : 'border-neutral-200 text-neutral-600 hover:border-primary hover:text-primary',
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
          className="flex h-7 w-7 items-center justify-center rounded border border-neutral-200 text-neutral-500 disabled:opacity-30 hover:border-primary hover:text-primary"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────
const SpacePage: FC = () => {
  const navigate = useNavigate()
  const { addPendingTask, hasTaskForUrl, tasks } = useTaskStore()
  const { modelList, loadEnabledModels } = useModelStore()
  const { lastUrl, lastMaxVideos, lastFilters, setLastSettings, history, addHistory, removeHistory } = useSpaceStore()

  // 拉取设置
  const [spaceUrl, setSpaceUrl] = useState(lastUrl)
  const [maxVideos, setMaxVideos] = useState(lastMaxVideos)
  const [loading, setLoading] = useState(false)
  const [videos, setVideos] = useState<SpaceVideo[]>([])
  const [uid, setUid] = useState('')

  // 过滤条件（提交时发给后端）
  const [showFilter, setShowFilter] = useState(false)
  const [filterKeywords, setFilterKeywords] = useState(lastFilters.keywords)
  const [filterDateFrom, setFilterDateFrom] = useState(lastFilters.dateFrom)
  const [filterDateTo, setFilterDateTo] = useState(lastFilters.dateTo)
  const [filterExcludeUrls, setFilterExcludeUrls] = useState(lastFilters.excludeUrls)

  // 列表交互
  const [search, setSearch] = useState('')     // 前端实时搜索（标题二次过滤）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [showHistory, setShowHistory] = useState(false)

  // 批量生成配置弹窗
  const [showBatchConfig, setShowBatchConfig] = useState(false)
  const [batchModel, setBatchModel] = useState('')
  const [batchStyle, setBatchStyle] = useState('minimal')
  const [batchQuality, setBatchQuality] = useState('medium')
  const [batchFormat, setBatchFormat] = useState<string[]>([])
  const [batchVideoUnderstanding, setBatchVideoUnderstanding] = useState(false)
  const [batchVideoInterval, setBatchVideoInterval] = useState(6)
  const [batchGridSize, setBatchGridSize] = useState<[number, number]>([2, 2])

  useEffect(() => { loadEnabledModels() }, [])

  const hasActiveFilter = !!(filterKeywords.trim() || filterDateFrom || filterDateTo || filterExcludeUrls.trim())

  // 前端仅做实时 search 过滤（过滤条件已在后端处理）
  const displayVideos = useMemo(() => {
    if (!search.trim()) return videos
    return videos.filter(v => v.title.toLowerCase().includes(search.toLowerCase()))
  }, [videos, search])

  // 分页切片
  const pagedVideos = useMemo(
    () => displayVideos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [displayVideos, page],
  )

  // search 或结果变化时重置到第 1 页
  useEffect(() => { setPage(1) }, [displayVideos.length])

  const allOnPageSelected = pagedVideos.length > 0 && pagedVideos.every(v => selectedIds.has(v.bvid))
  const allSelected = displayVideos.length > 0 && displayVideos.every(v => selectedIds.has(v.bvid))

  const toggleSelectPage = () => {
    if (allOnPageSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        pagedVideos.forEach(v => next.delete(v.bvid))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        pagedVideos.forEach(v => next.add(v.bvid))
        return next
      })
    }
  }

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(displayVideos.map(v => v.bvid)))
  }

  const toggleSelect = (bvid: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(bvid) ? next.delete(bvid) : next.add(bvid)
      return next
    })
  }

  const currentFilters = (): SpaceFilterSnapshot => ({
    keywords: filterKeywords,
    dateFrom: filterDateFrom,
    dateTo: filterDateTo,
    excludeUrls: filterExcludeUrls,
  })

  const handleFetch = async () => {
    if (!spaceUrl.trim()) { toast.error('请输入UP主空间链接'); return }
    const filters = currentFilters()
    setLastSettings(spaceUrl.trim(), maxVideos, filters)
    setLoading(true)
    setSelectedIds(new Set())
    setSearch('')
    try {
      const params: SpaceFetchParams = {
        url: spaceUrl.trim(),
        maxVideos,
        keywords: filters.keywords,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        excludeUrls: filters.excludeUrls,
      }
      const result = await fetchSpaceVideos(params)
      setVideos(result.videos)
      setUid(result.uid)
      if (result.videos.length === 0) {
        toast('未找到符合条件的视频', { icon: '⚠️' })
      } else {
        toast.success(`获取到 ${result.total} 个视频`)
        addHistory({
          uid: result.uid,
          spaceUrl: spaceUrl.trim(),
          fetchedAt: new Date().toISOString(),
          total: result.total,
          videos: result.videos,   // 仅存过滤后的结果
          filters,
        })
      }
    } catch { /* interceptor already toasted */ } finally {
      setLoading(false)
    }
  }

  const handleLoadHistory = (record: SpaceHistoryRecord) => {
    setSpaceUrl(record.spaceUrl)
    setMaxVideos(record.total > 100 ? record.total : 100)
    setFilterKeywords(record.filters.keywords)
    setFilterDateFrom(record.filters.dateFrom)
    setFilterDateTo(record.filters.dateTo)
    setFilterExcludeUrls(record.filters.excludeUrls)
    setVideos(record.videos)
    setUid(record.uid)
    setSelectedIds(new Set())
    setSearch('')
    setShowHistory(false)
    toast.success(`已加载历史：${record.total} 个视频`)
  }

  const handleCopyLinks = () => {
    const selected = displayVideos.filter(v => selectedIds.has(v.bvid))
    if (!selected.length) { toast.error('请先选择视频'); return }
    navigator.clipboard.writeText(selected.map(v => v.url).join('\n'))
    toast.success(`已复制 ${selected.length} 个链接`)
  }

  const handleOpenBatchConfig = () => {
    const selected = displayVideos.filter(v => selectedIds.has(v.bvid))
    if (!selected.length) { toast.error('请先选择视频'); return }
    if (!modelList.length) { toast.error('请先在设置中配置 AI 模型'); return }
    // 初始化默认模型
    if (!batchModel && modelList.length) setBatchModel(modelList[0].model_name)
    setShowBatchConfig(true)
  }

  const handleBatchSubmit = async () => {
    const selected = displayVideos.filter(v => selectedIds.has(v.bvid))
    const model = modelList.find(m => m.model_name === batchModel) ?? modelList[0]
    if (!model) { toast.error('请先在设置中配置 AI 模型'); return }

    const duplicates: string[] = []
    const toSubmit = selected.filter(video => {
      if (hasTaskForUrl(video.url)) { duplicates.push(video.title || video.bvid); return false }
      return true
    })
    if (duplicates.length > 0) toast(`已跳过 ${duplicates.length} 个重复视频`, { icon: '⚠️' })
    if (!toSubmit.length) { toast('所选视频均已生成过', { icon: 'ℹ️' }); return }

    setShowBatchConfig(false)
    let submitted = 0
    for (const video of toSubmit) {
      try {
        const formData = {
          video_url: video.url, platform: 'bilibili',
          quality: batchQuality,
          model_name: model.model_name, provider_id: model.provider_id,
          format: batchFormat, style: batchStyle,
          video_understanding: batchVideoUnderstanding,
          video_interval: batchVideoInterval,
          grid_size: batchGridSize,
        }
        const data = await generateNote(formData)
        addPendingTask(data.task_id, 'bilibili', formData)
        submitted++
      } catch { /* toasted */ }
    }
    if (submitted > 0) { toast.success(`已提交 ${submitted} 个笔记任务`); navigate('/') }
  }

  const handleFillExcludeFromHistory = () => {
    const urls = tasks.filter(t => t.status !== 'FAILED' && t.formData?.video_url).map(t => t.formData.video_url)
    if (!urls.length) { toast('生成历史中暂无记录'); return }
    setFilterExcludeUrls(urls.join('\n'))
    toast.success(`已填入 ${urls.length} 条历史链接`)
  }

  return (
    <>
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl">
            <img src={logo} alt="logo" className="h-full w-full object-contain" />
          </div>
          <span className="text-xl font-bold text-gray-800">BiliNote</span>
          <NavTabs />
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link to="/settings"><SlidersHorizontal className="text-muted-foreground hover:text-primary cursor-pointer" /></Link>
            </TooltipTrigger>
            <TooltipContent>全局配置</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel ── */}
        <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-auto border-r border-neutral-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">UP主空间链接</label>
            <textarea
              rows={3} placeholder="https://space.bilibili.com/123456/video"
              className="w-full resize-none rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-primary"
              value={spaceUrl} onChange={e => setSpaceUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFetch() } }}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">最多获取视频数</label>
            <input
              type="number" min={1} max={500} value={maxVideos}
              onChange={e => setMaxVideos(Number(e.target.value))}
              className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* 过滤条件折叠面板 */}
          <div className="rounded border border-neutral-200">
            <button
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              onClick={() => setShowFilter(v => !v)}
            >
              <span className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                过滤条件
                {hasActiveFilter && (
                  <span className="bg-primary rounded px-1 py-0.5 text-[10px] font-normal text-white">已启用</span>
                )}
              </span>
              {showFilter ? <ChevronUp className="h-3.5 w-3.5 text-neutral-400" /> : <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />}
            </button>

            {showFilter && (
              <div className="space-y-3 border-t border-neutral-100 p-3">
                <p className="text-[10px] text-neutral-400">过滤条件在获取时生效，结果仅包含匹配视频</p>

                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">
                    标题关键词 <span className="font-normal text-neutral-400">分号分隔，满足任意一个即保留</span>
                  </label>
                  <input
                    type="text" placeholder="教程;vscode;入门"
                    value={filterKeywords} onChange={e => setFilterKeywords(e.target.value)}
                    className="w-full rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">
                    发布日期范围 <span className="font-normal text-neutral-400">不选则不限</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                      className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-primary" />
                    <span className="text-xs text-neutral-400">至</span>
                    <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                      className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-primary" />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-neutral-600">
                      排除链接 <span className="font-normal text-neutral-400">每行一个 URL 或 BV 号</span>
                    </label>
                    <button onClick={handleFillExcludeFromHistory} className="text-primary text-[10px] hover:underline">
                      填入已生成历史
                    </button>
                  </div>
                  <textarea
                    rows={4} placeholder={'https://www.bilibili.com/video/BV1xx\nBV1yy'}
                    value={filterExcludeUrls} onChange={e => setFilterExcludeUrls(e.target.value)}
                    className="w-full resize-y rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-primary"
                  />
                </div>

                {hasActiveFilter && (
                  <button
                    onClick={() => { setFilterKeywords(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterExcludeUrls('') }}
                    className="w-full rounded border border-neutral-200 py-1 text-xs text-neutral-500 hover:bg-neutral-50"
                  >
                    清空所有过滤条件
                  </button>
                )}
              </div>
            )}
          </div>

          <Button onClick={handleFetch} disabled={loading} className="w-full">
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />获取中…</>
              : <><Search className="mr-2 h-4 w-4" />获取视频列表</>}
          </Button>

          <Button variant="outline" size="sm" className="w-full text-xs"
            onClick={() => setShowHistory(v => !v)} disabled={history.length === 0}>
            <History className="mr-1.5 h-3.5 w-3.5" />
            历史记录 {history.length > 0 && `(${history.length})`}
          </Button>

          {videos.length > 0 && (
            <p className="text-center text-xs text-neutral-400">
              UID: {uid} · {videos.length} 条结果
            </p>
          )}

          {videos.length > 0 && (
            <div className="mt-auto flex flex-col gap-2 border-t border-neutral-100 pt-3">
              <Button variant="outline" size="sm" onClick={handleCopyLinks} disabled={selectedIds.size === 0}>
                <Download className="mr-2 h-4 w-4" />复制链接 ({selectedIds.size})
              </Button>
              <Button size="sm" onClick={handleOpenBatchConfig} disabled={selectedIds.size === 0}>
                <Play className="mr-2 h-4 w-4" />批量生成笔记 ({selectedIds.size})
              </Button>
            </div>
          )}
        </aside>

        {/* History drawer */}
        {showHistory && (
          <div className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
              <span className="text-sm font-medium">历史记录</span>
              <button onClick={() => setShowHistory(false)} className="text-neutral-400 hover:text-neutral-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <div className="divide-y divide-neutral-100">
                {history.map(record => (
                  <div key={record.id}
                    className="group flex cursor-pointer items-start gap-2 px-3 py-2.5 hover:bg-neutral-50"
                    onClick={() => handleLoadHistory(record)}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-neutral-700">UID {record.uid}</p>
                      <p className="text-[10px] text-neutral-400">
                        {record.total} 条 · {record.fetchedAt.slice(0, 10)}
                      </p>
                      {/* 过滤条件摘要 */}
                      {(record.filters.keywords || record.filters.dateFrom || record.filters.dateTo) && (
                        <p className="mt-0.5 truncate text-[10px] text-neutral-300">
                          {[
                            record.filters.keywords && `词: ${record.filters.keywords}`,
                            (record.filters.dateFrom || record.filters.dateTo) &&
                              `日期: ${record.filters.dateFrom || '∞'} ~ ${record.filters.dateTo || '∞'}`,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-300 group-hover:text-neutral-500" />
                    <button
                      onClick={e => { e.stopPropagation(); removeHistory(record.id) }}
                      className="mt-0.5 shrink-0 text-neutral-300 opacity-0 hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Main: Video list ── */}
        <main className="flex flex-1 flex-col overflow-hidden bg-neutral-50">
          {videos.length === 0 && !loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-neutral-400">
                <ListChecks className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-sm">输入UP主空间链接，点击「获取视频列表」</p>
                {history.length > 0 && <p className="mt-1 text-xs">或点击「历史记录」加载上次结果</p>}
              </div>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2">
                {/* 当页全选 */}
                <div className="flex cursor-pointer items-center gap-1.5 text-sm" onClick={toggleSelectPage}>
                  <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectPage} onClick={e => e.stopPropagation()} />
                  <span className="text-xs">本页</span>
                </div>
                {/* 全部全选 */}
                {displayVideos.length > PAGE_SIZE && (
                  <button onClick={toggleSelectAll}
                    className={cn('rounded px-2 py-0.5 text-xs', allSelected ? 'text-primary' : 'text-neutral-500 hover:text-neutral-700')}>
                    {allSelected ? '取消全选' : `全选全部(${displayVideos.length})`}
                  </button>
                )}
                {selectedIds.size > 0 && (
                  <span className="text-primary text-xs font-medium">已选 {selectedIds.size}</span>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                    <input type="text" placeholder="标题二次搜索…"
                      className="w-40 rounded border border-neutral-300 py-1 pr-6 pl-7 text-xs outline-none focus:border-primary"
                      value={search} onChange={e => setSearch(e.target.value)} />
                    {search && (
                      <button onClick={() => setSearch('')}
                        className="absolute top-1/2 right-1.5 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400">{displayVideos.length} 条</span>
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-auto bg-white">
                {displayVideos.length === 0 ? (
                  <div className="flex h-40 items-center justify-center text-sm text-neutral-400">
                    无匹配结果
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {pagedVideos.map(video => {
                      const checked = selectedIds.has(video.bvid)
                      return (
                        <div key={video.bvid} onClick={() => toggleSelect(video.bvid)}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50',
                            checked && 'bg-primary-light hover:bg-primary-light',
                          )}>
                          <Checkbox checked={checked} onCheckedChange={() => toggleSelect(video.bvid)}
                            onClick={e => e.stopPropagation()} className="shrink-0" />
                          <img
                            src={video.cover ? `${baseURL}/image_proxy?url=${encodeURIComponent(video.cover)}` : '/placeholder.png'}
                            alt="封面" className="h-14 w-24 shrink-0 rounded object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = '/placeholder.png' }}
                          />
                          <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-800">
                                    {video.title || '未知标题'}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-sm">{video.title}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <div className="flex items-center gap-3 text-xs text-neutral-400">
                              {video.duration_str && <span>{video.duration_str}</span>}
                              <span>播放 {formatViews(video.view_count)}</span>
                              <span>{formatTs(video.created)}</span>
                              <a href={video.url} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()} className="text-primary hover:underline">
                                {video.bvid}
                              </a>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Pagination */}
              <Pagination page={page} total={displayVideos.length} pageSize={PAGE_SIZE} onChange={setPage} />
            </>
          )}
        </main>
      </div>
    </div>

    {/* 批量生成配置弹窗 */}

    <Dialog open={showBatchConfig} onOpenChange={setShowBatchConfig}>
      <DialogContent className="w-[420px]">
        <DialogHeader>
          <DialogTitle>批量生成配置</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 模型选择 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">AI 模型</label>
            <select
              value={batchModel}
              onChange={e => setBatchModel(e.target.value)}
              className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-primary"
            >
              {modelList.map(m => (
                <option key={m.model_name} value={m.model_name}>{m.model_name}</option>
              ))}
            </select>
          </div>

          {/* 笔记风格 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">笔记风格</label>
            <div className="flex flex-wrap gap-2">
              {noteStyles.map(s => (
                <button
                  key={s.value}
                  onClick={() => setBatchStyle(s.value)}
                  className={cn(
                    'rounded border px-3 py-1 text-xs transition-colors',
                    batchStyle === s.value
                      ? 'border-primary bg-primary text-white'
                      : 'border-neutral-200 text-neutral-600 hover:border-primary hover:text-primary',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* 转录质量 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">转录质量</label>
            <div className="flex gap-2">
              {[
                { label: '快速', value: 'fast' },
                { label: '标准', value: 'medium' },
                { label: '高质量', value: 'slow' },
              ].map(q => (
                <button
                  key={q.value}
                  onClick={() => setBatchQuality(q.value)}
                  className={cn(
                    'flex-1 rounded border py-1.5 text-xs transition-colors',
                    batchQuality === q.value
                      ? 'border-primary bg-primary text-white'
                      : 'border-neutral-200 text-neutral-600 hover:border-primary hover:text-primary',
                  )}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* 视频理解 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-neutral-700">视频理解</label>
              <button
                onClick={() => setBatchVideoUnderstanding(v => !v)}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  batchVideoUnderstanding ? 'bg-primary' : 'bg-neutral-300',
                )}
              >
                <span className={cn(
                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                  batchVideoUnderstanding ? 'translate-x-4' : 'translate-x-1',
                )} />
              </button>
            </div>
            {batchVideoUnderstanding && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-neutral-500">采样间隔（秒）</label>
                  <input
                    type="number" min={1} max={30}
                    value={batchVideoInterval}
                    onChange={e => setBatchVideoInterval(Number(e.target.value))}
                    className="w-full rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-neutral-500">拼图尺寸（列×行）</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min={1} max={10}
                      value={batchGridSize[0]}
                      onChange={e => setBatchGridSize([Number(e.target.value), batchGridSize[1]])}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-primary"
                    />
                    <span className="text-xs text-neutral-400">×</span>
                    <input
                      type="number" min={1} max={10}
                      value={batchGridSize[1]}
                      onChange={e => setBatchGridSize([batchGridSize[0], Number(e.target.value)])}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            )}
            <p className="mt-1.5 text-[10px] text-neutral-400">启用后将截图发给多模态模型辅助分析，需使用多模态模型</p>
          </div>

          {/* 笔记格式（多选） */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              笔记格式 <span className="font-normal text-neutral-400 text-xs">可多选</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {noteFormats.map(f => {
                const active = batchFormat.includes(f.value)
                return (
                  <button
                    key={f.value}
                    onClick={() =>
                      setBatchFormat(prev =>
                        active ? prev.filter(v => v !== f.value) : [...prev, f.value],
                      )
                    }
                    className={cn(
                      'rounded border px-3 py-1 text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary text-white'
                        : 'border-neutral-200 text-neutral-600 hover:border-primary hover:text-primary',
                    )}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowBatchConfig(false)}>取消</Button>
          <Button onClick={handleBatchSubmit}>
            <Play className="mr-2 h-4 w-4" />
            开始生成 ({selectedIds.size} 个)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

export default SpacePage
