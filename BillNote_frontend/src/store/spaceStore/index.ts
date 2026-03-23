import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SpaceVideo } from '@/services/space'

const MAX_HISTORY = 10

export interface SpaceHistoryRecord {
  id: string          // uid + fetchedAt
  uid: string
  spaceUrl: string
  fetchedAt: string   // ISO string
  total: number
  videos: SpaceVideo[]
}

interface SpaceStore {
  // 上次请求设置
  lastUrl: string
  lastMaxVideos: number
  setLastSettings: (url: string, maxVideos: number) => void

  // 历史记录
  history: SpaceHistoryRecord[]
  addHistory: (record: Omit<SpaceHistoryRecord, 'id'>) => void
  removeHistory: (id: string) => void
  clearHistory: () => void
}

export const useSpaceStore = create<SpaceStore>()(
  persist(
    (set, get) => ({
      lastUrl: '',
      lastMaxVideos: 100,

      setLastSettings: (url, maxVideos) => set({ lastUrl: url, lastMaxVideos: maxVideos }),

      history: [],

      addHistory: record => {
        const id = `${record.uid}-${Date.now()}`
        const newRecord: SpaceHistoryRecord = { ...record, id }
        set(state => {
          const list = [newRecord, ...state.history]
          // 超过 10 条删除最旧的
          return { history: list.slice(0, MAX_HISTORY) }
        })
      },

      removeHistory: id =>
        set(state => ({ history: state.history.filter(r => r.id !== id) })),

      clearHistory: () => set({ history: [] }),
    }),
    { name: 'space-storage' },
  ),
)
