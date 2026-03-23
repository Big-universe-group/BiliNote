import request from '@/utils/request'

export interface SpaceVideo {
  bvid: string
  title: string
  cover: string
  url: string
  duration_str: string
  view_count: number | null
  created: number | null
}

export interface SpaceVideosResult {
  videos: SpaceVideo[]
  total: number
  uid: string
}

export interface SpaceFetchParams {
  url: string
  maxVideos?: number
  keywords?: string      // 分号分隔
  dateFrom?: string      // YYYY-MM-DD
  dateTo?: string        // YYYY-MM-DD
  excludeUrls?: string   // 换行分隔
}

export const fetchSpaceVideos = async (params: SpaceFetchParams): Promise<SpaceVideosResult> => {
  return request.get('/space_videos', {
    params: {
      url: params.url,
      max_videos: params.maxVideos ?? 100,
      keywords: params.keywords ?? '',
      date_from: params.dateFrom ?? '',
      date_to: params.dateTo ?? '',
      exclude_urls: params.excludeUrls ?? '',
    },
  })
}
