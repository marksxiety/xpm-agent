import { config } from "../config";

export function getCurrentTimeStamp(timezone: string = config.SERVER_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find(p => p.type === type)!.value;

  return Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(get('hour') === '24' ? '0' : get('hour')),
    Number(get('minute')),
    Number(get('second')),
    Number(get('fractionalSecond') ?? 0)
  );
}