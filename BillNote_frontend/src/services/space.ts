import request from '@/utils/request'

export interface SpaceVideo {
  bvid: string
  title: string
  cover: string
  url: string
  duration_str: string   // "12:34"
  view_count: number | null
  created: number | null // unix timestamp
}

export interface SpaceVideosResult {
  videos: SpaceVideo[]
  total: number
  uid: string
}

export const fetchSpaceVideos = async (
  url: string,
  maxVideos = 100,
): Promise<SpaceVideosResult> => {
  return request.get('/space_videos', { params: { url, max_videos: maxVideos } })
}
