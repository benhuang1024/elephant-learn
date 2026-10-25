/**
 * 时间：TS/JS 没有 LocalDateTime，也没有 PHP 的 Carbon
 *
 * Java 版 orders.created_at 是 `TIMESTAMP(6)` + LocalDateTime（无时区），
 * Jackson 用 ISO_LOCAL_DATE_TIME 输出 `2026-10-25T09:33:41.123456`。
 * JS 的 Date 永远带时区（内部是 UTC 毫秒），toISOString() 会给你 `...Z`。
 * 为了和 Java 版对齐，这里显式取「本地字段」拼出无时区的 ISO 串。
 */

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** `YYYY-MM-DDTHH:mm:ss.SSS`（本地时间，无时区后缀、无 Z）。 */
export function localIsoDateTime(date: Date): string {
  const date_ = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${date_}T${time}.${pad(date.getMilliseconds(), 3)}`;
}

export function nowLocalIso(): string {
  return localIsoDateTime(new Date());
}

/** 展示用：给前端的一个小工具，演示 `Intl` ≈ PHP 的 NumberFormatter / IntlDateFormatter。 */
export function formatForDisplay(iso: string, locale = "zh-CN"): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(parsed);
}
