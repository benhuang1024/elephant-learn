import { QueryClient } from "@tanstack/react-query";

/**
 * QueryClient 的配置是 React Query 的「全局策略」：
 * staleTime 决定多久内复用缓存（≈ Laravel 的 Cache::remember 的 TTL 思路，但方向相反 ——
 * 它是「多久内认为数据还新鲜」）。retry 关掉，因为 4xx 重试没有意义。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
