import { FC, useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  SlidersHorizontal, Search, Download, ListChecks, X,
  Loader2, Play, History, Trash2, ChevronRight, Filter, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import { ScrollArea } from '@/components/ui/scroll-area.tsx'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/utils.ts'
import { fetchSpaceVideos, SpaceVideo } from '@/services/space.ts'
import { generateNote } from '@/services/note.ts'
import { useTaskStore } from '@/store/taskStore'
import { useModelStore } from '@/store/modelStore'
import { useSpaceStore, SpaceHistoryRecord } from '@/store/spaceStore'
import toast from 'react-hot-toast'
import logo from '@/assets/icon.svg'
import NavTabs from '@/components/NavTabs.tsx'

/** 格式化 Unix 时间戳为 yyyy-MM-dd */
function formatTs(ts: number | null): string {
  if (!ts) return '--'
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

/** 格式化播放数 */
function formatViews(n: number | null): string {
  if (!n) return '--'
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

/** 从 URL 或裸字符串中提取 BV 号，用于排除比较 */
function extractBvid(input: string): string {
  const m = input.match(/BV[a-zA-Z0-9]+/)
  return m ? m[0] : input.trim()
}

const baseURL = (String(import.meta.env.VITE_API_BASE_URL || '/api')).replace(/\/$/, '')

const SpacePage: FC = () => {
  const navigate = useNavigate()
  const { addPendingTask, hasTaskForUrl, tasks } = useTaskStore()
  const { modelList, loadEnabledModels } = useModelStore()
  const {
    lastUrl, lastMaxVideos, setLastSettings,
    history, addHistory, removeHistory,
  } = useSpaceStore()

  // ── 拉取设置 ──────────────────────────────────────────────────────────────
  const [spaceUrl, setSpaceUrl] = useState(lastUrl)
  const [maxVideos, setMaxVideos] = useState(lastMaxVideos)
  const [loading, setLoading] = useState(false)
  const [videos, setVideos] = useState<SpaceVideo[]>([])
  const [total, setTotal] = useState(0)
  const [uid, setUid] = useState('')

  // ── 过滤条件 ──────────────────────────────────────────────────────────────
  const [showFilter, setShowFilter] = useState(false)
  const [filterKeywords, setFilterKeywords] = useState('')   // 分号分隔
  const [filterDateFrom, setFilterDateFrom] = useState('')   // yyyy-MM-dd
  const [filterDateTo, setFilterDateTo] = useState('')       // yyyy-MM-dd
  const [filterExcludeUrls, setFilterExcludeUrls] = useState('') // 多行链接

  // ── 列表交互 ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => { loadEnabledModels() }, [])

  // ── 过滤计算（useMemo 避免每次渲染重复运算）───────────────────────────────
  const filteredVideos = useMemo(() => {
    let result = videos

    // 1. 关键词过滤（分号分隔，OR 逻辑，不区分大小写）
    const keywords = filterKeywords
      .split(';')
      .map(k => k.trim())
      .filter(Boolean)
    if (keywords.length > 0) {
      result = result.filter(v =>
        keywords.some(k => v.title.toLowerCase().includes(k.toLowerCase()))
      )
    }

    // 2. 日期范围过滤（基于 created 时间戳）
    if (filterDateFrom) {
      const fromTs = new Date(filterDateFrom).getTime() / 1000
      result = result.filter(v => v.created != null && v.created >= fromTs)
    }
    if (filterDateTo) {
      // 选定日期当天的最后一刻 23:59:59
      const toTs = (new Date(filterDateTo).getTime() + 86399000) / 1000
      result = result.filter(v => v.created != null && v.created <= toTs)
    }

    // 3. 排除链接（每行一个 URL 或 BV 号）
    const excludeBvids = new Set(
      filterExcludeUrls
        .split('\n')
        .map(line => extractBvid(line.trim()))
        .filter(Boolean)
    )
    if (excludeBvids.size > 0) {
      result = result.filter(v => !excludeBvids.has(v.bvid))
    }

    // 4. 实时搜索（已有逻辑）
    if (search.trim()) {
      result = result.filter(v =>
        v.title.toLowerCase().includes(search.toLowerCase())
      )
    }

    return result
  }, [videos, filterKeywords, filterDateFrom, filterDateTo, filterExcludeUrls, search])

  // 过滤条件是否有生效
  const hasActiveFilter = !!(
    filterKeywords.trim() || filterDateFrom || filterDateTo || filterExcludeUrls.trim()
  )

  const allSelected =
    filteredVideos.length > 0 && filteredVideos.every(v => selectedIds.has(v.bvid))

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(filteredVideos.map(v => v.bvid)))
  }

  const toggleSelect = (bvid: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(bvid) ? next.delete(bvid) : next.add(bvid)
      return next
    })
  }

  const loadVideos = (result: { videos: SpaceVideo[]; total: number; uid: string }) => {
    setVideos(result.videos)
    setTotal(result.total)
    setUid(result.uid)
    setSelectedIds(new Set())
    setSearch('')
  }

  const handleFetch = async () => {
    if (!spaceUrl.trim()) { toast.error('请输入UP主空间链接'); return }
    setLastSettings(spaceUrl.trim(), maxVideos)
    setLoading(true)
    try {
      const result = await fetchSpaceVideos(spaceUrl.trim(), maxVideos)
      loadVideos(result)
      if (result.videos.length === 0) {
        toast('未找到视频，请检查链接或配置Cookie', { icon: '⚠️' })
      } else {
        toast.success(`获取到 ${result.total} 个视频`)
        addHistory({
          uid: result.uid,
          spaceUrl: spaceUrl.trim(),
          fetchedAt: new Date().toISOString(),
          total: result.total,
          videos: result.videos,
        })
      }
    } catch { /* interceptor already toasted */ } finally {
      setLoading(false)
    }
  }

  const handleLoadHistory = (record: SpaceHistoryRecord) => {
    setSpaceUrl(record.spaceUrl)
    setMaxVideos(record.total > 100 ? record.total : 100)
    loadVideos({ videos: record.videos, total: record.total, uid: record.uid })
    setShowHistory(false)
    toast.success(`已加载历史记录：${record.total} 个视频`)
  }

  const handleCopyLinks = () => {
    const selected = filteredVideos.filter(v => selectedIds.has(v.bvid))
    if (!selected.length) { toast.error('请先选择视频'); return }
    navigator.clipboard.writeText(selected.map(v => v.url).join('\n'))
    toast.success(`已复制 ${selected.length} 个链接`)
  }

  const handleGenerateNotes = async () => {
    const selected = filteredVideos.filter(v => selectedIds.has(v.bvid))
    if (!selected.length) { toast.error('请先选择视频'); return }
    const model = modelList[0]
    if (!model) { toast.error('请先在设置中配置 AI 模型'); return }

    const duplicates: string[] = []
    const toSubmit = selected.filter(video => {
      if (hasTaskForUrl(video.url)) {
        duplicates.push(video.title || video.bvid)
        return false
      }
      return true
    })

    if (duplicates.length > 0) {
      toast(`已跳过 ${duplicates.length} 个重复视频`, { icon: '⚠️' })
    }
    if (toSubmit.length === 0) {
      toast('所选视频均已存在于生成历史中', { icon: 'ℹ️' })
      return
    }

    let submitted = 0
    for (const video of toSubmit) {
      try {
        const formData = {
          video_url: video.url,
          platform: 'bilibili',
          quality: 'medium',
          model_name: model.model_name,
          provider_id: model.provider_id,
          format: [],
          style: 'minimal',
          grid_size: [2, 2],
        }
        const data = await generateNote(formData)
        addPendingTask(data.task_id, 'bilibili', formData)
        submitted++
      } catch { /* individual failures already toasted */ }
    }

    if (submitted > 0) {
      toast.success(`已提交 ${submitted} 个笔记任务`)
      navigate('/')
    }
  }

  // 一键将已生成历史中的链接填入排除框
  const handleFillExcludeFromHistory = () => {
    const existingUrls = tasks
      .filter(t => t.status !== 'FAILED' && t.formData?.video_url)
      .map(t => t.formData.video_url)
    if (existingUrls.length === 0) { toast('生成历史中暂无记录'); return }
    setFilterExcludeUrls(existingUrls.join('\n'))
    toast.success(`已填入 ${existingUrls.length} 条历史链接`)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ── Header ── */}
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
              <Link to="/settings">
                <SlidersHorizontal className="text-muted-foreground hover:text-primary cursor-pointer" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>全局配置</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel ── */}
        <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-auto border-r border-neutral-200 bg-white p-4">

          {/* 空间链接 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">UP主空间链接</label>
            <textarea
              rows={3}
              placeholder="https://space.bilibili.com/123456/video"
              className="w-full resize-none rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-primary"
              value={spaceUrl}
              onChange={e => setSpaceUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFetch() } }}
            />
          </div>

          {/* 最多获取数 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">最多获取视频数</label>
            <input
              type="number" min={1} max={500} value={maxVideos}
              onChange={e => setMaxVideos(Number(e.target.value))}
              className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>

          <Button onClick={handleFetch} disabled={loading} className="w-full">
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />获取中…</>
              : <><Search className="mr-2 h-4 w-4" />获取视频列表</>}
          </Button>

          {/* ── 过滤条件折叠面板 ── */}
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
              {showFilter
                ? <ChevronUp className="h-3.5 w-3.5 text-neutral-400" />
                : <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />}
            </button>

            {showFilter && (
              <div className="space-y-3 border-t border-neutral-100 p-3">

                {/* 关键词过滤 */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">
                    标题关键词
                    <span className="ml-1 font-normal text-neutral-400">（分号分隔，满足任意一个即保留）</span>
                  </label>
                  <input
                    type="text"
                    placeholder="教程;vscode;入门"
                    value={filterKeywords}
                    onChange={e => setFilterKeywords(e.target.value)}
                    className="w-full rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-primary"
                  />
                </div>

                {/* 日期范围 */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">
                    发布日期范围
                    <span className="ml-1 font-normal text-neutral-400">（不选则不限）</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={e => setFilterDateFrom(e.target.value)}
                      className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-primary"
                    />
                    <span className="text-xs text-neutral-400">至</span>
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={e => setFilterDateTo(e.target.value)}
                      className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {/* 排除链接 */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-neutral-600">
                      排除链接
                      <span className="ml-1 font-normal text-neutral-400">（每行一个 URL 或 BV 号）</span>
                    </label>
                    <button
                      onClick={handleFillExcludeFromHistory}
                      className="text-primary text-[10px] hover:underline"
                    >
                      填入已生成历史
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    placeholder={'https://www.bilibili.com/video/BV1xx\nBV1yy\n...'}
                    value={filterExcludeUrls}
                    onChange={e => setFilterExcludeUrls(e.target.value)}
                    className="w-full resize-y rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-primary"
                  />
                </div>

                {/* 清空过滤 */}
                {hasActiveFilter && (
                  <button
                    onClick={() => {
                      setFilterKeywords('')
                      setFilterDateFrom('')
                      setFilterDateTo('')
                      setFilterExcludeUrls('')
                    }}
                    className="w-full rounded border border-neutral-200 py-1 text-xs text-neutral-500 hover:bg-neutral-50"
                  >
                    清空所有过滤条件
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 历史记录入口 */}
          <Button
            variant="outline" size="sm"
            className="w-full text-xs"
            onClick={() => setShowHistory(v => !v)}
            disabled={history.length === 0}
          >
            <History className="mr-1.5 h-3.5 w-3.5" />
            历史记录 {history.length > 0 && `(${history.length})`}
          </Button>

          {videos.length > 0 && (
            <p className="text-center text-xs text-neutral-400">
              UID: {uid} · 共 {total} 个
              {hasActiveFilter && filteredVideos.length !== total && (
                <span className="text-primary ml-1">过滤后 {filteredVideos.length} 个</span>
              )}
            </p>
          )}

          {/* 操作按钮 */}
          {videos.length > 0 && (
            <div className="mt-auto flex flex-col gap-2 border-t border-neutral-100 pt-3">
              <Button variant="outline" size="sm" onClick={handleCopyLinks} disabled={selectedIds.size === 0}>
                <Download className="mr-2 h-4 w-4" />
                复制链接 ({selectedIds.size})
              </Button>
              <Button size="sm" onClick={handleGenerateNotes} disabled={selectedIds.size === 0}>
                <Play className="mr-2 h-4 w-4" />
                批量生成笔记 ({selectedIds.size})
              </Button>
            </div>
          )}
        </aside>

        {/* ── History drawer ── */}
        {showHistory && (
          <div className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
              <span className="text-sm font-medium">历史记录</span>
              <button onClick={() => setShowHistory(false)} className="text-neutral-400 hover:text-neutral-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y divide-neutral-100">
                {history.map(record => (
                  <div
                    key={record.id}
                    className="group flex cursor-pointer items-center gap-2 px-3 py-2.5 hover:bg-neutral-50"
                    onClick={() => handleLoadHistory(record)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-neutral-700">UID {record.uid}</p>
                      <p className="text-[10px] text-neutral-400">
                        {record.total} 个视频 · {record.fetchedAt.slice(0, 10)}
                      </p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-300 group-hover:text-neutral-500" />
                    <button
                      onClick={e => { e.stopPropagation(); removeHistory(record.id) }}
                      className="shrink-0 text-neutral-300 opacity-0 hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ── Main: Video list ── */}
        <main className="flex flex-1 flex-col overflow-hidden bg-neutral-50">
          {videos.length === 0 && !loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-neutral-400">
                <ListChecks className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-sm">输入UP主空间链接，点击「获取视频列表」</p>
                {history.length > 0 && (
                  <p className="mt-1 text-xs">或点击「历史记录」加载上次结果</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2">
                <div className="flex cursor-pointer items-center gap-1.5 text-sm" onClick={toggleSelectAll}>
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    onClick={e => e.stopPropagation()}
                  />
                  <span>{allSelected ? '取消全选' : '全选'}</span>
                  {selectedIds.size > 0 && (
                    <span className="text-primary ml-1 font-medium">已选 {selectedIds.size}</span>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      placeholder="搜索标题…"
                      className="w-44 rounded border border-neutral-300 py-1 pr-7 pl-7 text-sm outline-none focus:border-primary"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="absolute top-1/2 right-2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400">
                    {filteredVideos.length} / {videos.length}
                    {hasActiveFilter && filteredVideos.length !== videos.length && (
                      <span className="text-primary ml-1">已过滤</span>
                    )}
                  </span>
                </div>
              </div>

              {/* List */}
              <ScrollArea className="flex-1">
                {filteredVideos.length === 0 ? (
                  <div className="flex h-40 items-center justify-center text-sm text-neutral-400">
                    当前过滤条件下无匹配视频
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-100 bg-white">
                    {filteredVideos.map(video => {
                      const checked = selectedIds.has(video.bvid)
                      return (
                        <div
                          key={video.bvid}
                          onClick={() => toggleSelect(video.bvid)}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50',
                            checked && 'bg-primary-light hover:bg-primary-light',
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleSelect(video.bvid)}
                            onClick={e => e.stopPropagation()}
                            className="shrink-0"
                          />
                          <img
                            src={
                              video.cover
                                ? `${baseURL}/image_proxy?url=${encodeURIComponent(video.cover)}`
                                : '/placeholder.png'
                            }
                            alt="封面"
                            className="h-14 w-24 shrink-0 rounded object-cover"
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
                                <TooltipContent side="top" className="max-w-sm">
                                  {video.title}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <div className="flex items-center gap-3 text-xs text-neutral-400">
                              {video.duration_str && <span>{video.duration_str}</span>}
                              <span>播放 {formatViews(video.view_count)}</span>
                              <span>{formatTs(video.created)}</span>
                              <a
                                href={video.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-primary hover:underline"
                              >
                                {video.bvid}
                              </a>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default SpacePage
