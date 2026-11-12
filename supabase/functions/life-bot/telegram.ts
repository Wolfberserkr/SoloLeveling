// Minimal Telegram Bot API client (only what the Life Assistant uses).
export type Button = { text: string; data: string };
export type Keyboard = Button[][];

const token = () => {
  const t = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return t;
};

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(`telegram ${method} ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data.result as T;
}

const markup = (kb?: Keyboard | null) =>
  kb && kb.length ? { inline_keyboard: kb.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data.slice(0, 64) }))) } : undefined;

/** Send HTML text, split under Telegram's 4096-char limit. Falls back to
 *  plain text when the model's HTML doesn't parse. */
export async function sendMessage(chatId: number, text: string, kb?: Keyboard | null): Promise<void> {
  const chunks: string[] = [];
  let rest = text.trim() || '…';
  while (rest.length > 3900) {
    const cut = rest.lastIndexOf('\n', 3900) > 1000 ? rest.lastIndexOf('\n', 3900) : 3900;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  chunks.push(rest);
  for (let i = 0; i < chunks.length; i++) {
    const last = i === chunks.length - 1;
    const body = { chat_id: chatId, text: chunks[i], parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: last ? markup(kb) : undefined };
    try {
      await call('sendMessage', body);
    } catch (err) {
      if (!String(err).includes("can't parse entities")) throw err;
      await call('sendMessage', { ...body, parse_mode: undefined, text: chunks[i].replace(/<[^>]+>/g, '') });
    }
  }
}

export const typing = (chatId: number) => call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});

export const answerCallback = (id: string, text?: string) =>
  call('answerCallbackQuery', { callback_query_id: id, text: text?.slice(0, 190) }).catch(() => {});

/** Replace a message's buttons with a one-line status so a decision can't be tapped twice. */
export const settleButtons = (chatId: number, messageId: number, status: string) =>
  call('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: status, callback_data: 'noop' }]] } }).catch(() => {});

/** Download a photo/document the user sent. Returns base64 + media type. */
export async function downloadFile(fileId: string): Promise<{ base64: string; mediaType: string }> {
  const f = await call<{ file_path: string }>('getFile', { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${token()}/${f.file_path}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`telegram file download ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const ext = f.file_path.split('.').pop()?.toLowerCase();
  const mediaType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
  return { base64: btoa(bin), mediaType };
}
