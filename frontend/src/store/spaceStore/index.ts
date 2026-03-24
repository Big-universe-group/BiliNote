import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SpaceVideo } from '@/services/space'

const MAX_HISTORY = 10

export interface SpaceFilterSnapshot {
  keywords: string
  dateFrom: string
  dateTo: string
  excludeUrls: string
}

export interface SpaceHistoryRecord {
  id: string
  uid: string
  spaceUrl: string
  fetchedAt: string
  total: number
  videos: SpaceVideo[]
  filters: SpaceFilterSnapshot
}

interface SpaceStore {
  lastUrl: string
  lastMaxVideos: number
  lastFilters: SpaceFilterSnapshot
  setLastSettings: (url: string, maxVideos: number, filters: SpaceFilterSnapshot) => void

  history: SpaceHistoryRecord[]
  addHistory: (record: Omit<SpaceHistoryRecord, 'id'>) => void
  removeHistory: (id: string) => void
  clearHistory: () => void
}

const emptyFilters: SpaceFilterSnapshot = {
  keywords: '', dateFrom: '', dateTo: '', excludeUrls: '',
}

export const useSpaceStore = create<SpaceStore>()(
  persist(
    (set) => ({
      lastUrl: '',
      lastMaxVideos: 100,
      lastFilters: emptyFilters,

      setLastSettings: (url, maxVideos, filters) =>
        set({ lastUrl: url, lastMaxVideos: maxVideos, lastFilters: filters }),

      history: [],

      addHistory: record => {
        const id = `${record.uid}-${Date.now()}`
        set(state => ({
          history: [{ ...record, id }, ...state.history].slice(0, MAX_HISTORY),
        }))
      },

      removeHistory: id =>
        set(state => ({ history: state.history.filter(r => r.id !== id) })),

      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'space-storage',
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          return {
            ...persistedState,
            history: (persistedState.history ?? []).map((r: any) => ({
              ...r,
              filters: r.filters ?? emptyFilters,
            })),
          }
        }
        return persistedState
      },
    },
  ),
)
