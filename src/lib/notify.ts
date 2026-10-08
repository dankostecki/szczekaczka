// Desktop notifications for new headlines (browser Notification API).
// Shown while the page is open in any tab, also in the background.
import { type Item, tagOf } from './news'
import { plural } from './speech'
import { BASE_PATH } from './site'

const MAX_PER_REFRESH = 3

export const notifySupported = () => typeof window !== 'undefined' && 'Notification' in window

export const notifyPermission = (): NotificationPermission | 'unsupported' =>
  notifySupported() ? Notification.permission : 'unsupported'

export async function requestNotifyPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notifySupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

function show(title: string, body: string, tag: string, url?: string) {
  try {
    const n = new Notification(title, { body, tag, icon: `${BASE_PATH}/icon.svg` })
    n.onclick = () => {
      window.focus()
      if (url && /^https?:\/\//.test(url)) window.open(url, '_blank', 'noopener,noreferrer')
      n.close()
    }
  } catch (e) {
    // Android Chrome allows notifications only from a service worker
    console.warn('Powiadomienie nie zadziałało:', e)
  }
}

export function testNotification() {
  if (notifySupported() && Notification.permission === 'granted')
    show('Szczekaczka', 'Powiadomienia są włączone.', 'test')
}

// `fresh` is oldest first; the newest get their own notification, the rest one summary
export function notifyHeadlines(fresh: Item[]) {
  if (!notifySupported() || Notification.permission !== 'granted' || fresh.length === 0) return
  const head = fresh.slice(-MAX_PER_REFRESH)
  for (const it of head) show(tagOf(it), it.title, it.id, it.link || undefined)
  const rest = fresh.length - head.length
  if (rest > 0) show('Szczekaczka', `I jeszcze ${rest} ${plural(rest)}`, `more-${Date.now()}`)
}
