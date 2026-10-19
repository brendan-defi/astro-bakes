import type { Locale } from "./data";

/**
 * Transactional email copy (PRD 5.3). Plain HTML with a text alternative; no
 * unsubscribe link because these are not marketing emails. The Japanese copy
 * is a working draft until the JA copywriter's pass (handoff p.1).
 */

export interface Email {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(locale: Locale, title: string, body: string): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="margin:0;padding:24px;background:#FFF5FA;font-family:'Hiragino Maru Gothic ProN',system-ui,sans-serif;color:#2A1B5E;line-height:1.6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:2px solid #2A1B5E;border-radius:20px">
<tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:700;color:#B14FE0">Astro Bakes</td></tr>
<tr><td style="padding:0 28px 28px;font-size:16px">${body}</td></tr>
</table></td></tr></table></body></html>`;
}

export function signInEmail(opts: { locale: Locale; link: string; code: string; minutes: number }): Email {
  const { link, code, minutes } = opts;
  const digits = code.split("").join(" ");
  if (opts.locale === "ja") {
    const subject = `Astro Bakes ログイン用コード: ${code}`;
    const body = `<p style="margin:0 0 16px">Astro Bakes にログインするには、下のボタンを押すか、画面に次のコードを入力してください。</p>
<p style="margin:0 0 20px;font-size:30px;font-weight:900;letter-spacing:0.2em">${esc(digits)}</p>
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;padding:14px 22px;background:#FF9CCB;color:#2A1B5E;border:2px solid #2A1B5E;border-radius:999px;font-weight:700;text-decoration:none">ログインする</a></p>
<p style="margin:0 0 8px;font-size:14px">リンクとコードは ${minutes} 分で無効になります。一度しか使えません。</p>
<p style="margin:0;font-size:13px;color:#5B3FC4">このメールに心当たりがない場合は、そのまま無視してください。</p>`;
    const text = `Astro Bakes にログイン\n\nコード: ${code}\n\nまたはこのリンクを開いてください:\n${link}\n\nリンクとコードは ${minutes} 分で無効になります。一度しか使えません。心当たりがない場合は無視してください。`;
    return { subject, html: layout("ja", subject, body), text };
  }
  const subject = `Your Astro Bakes sign-in code: ${code}`;
  const body = `<p style="margin:0 0 16px">Tap the button to sign in to Astro Bakes, or type this code on the screen you came from.</p>
<p style="margin:0 0 20px;font-size:30px;font-weight:900;letter-spacing:0.2em">${esc(digits)}</p>
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;padding:14px 22px;background:#FF9CCB;color:#2A1B5E;border:2px solid #2A1B5E;border-radius:999px;font-weight:700;text-decoration:none">Sign in</a></p>
<p style="margin:0 0 8px;font-size:14px">The link and code expire in ${minutes} minutes and work once.</p>
<p style="margin:0;font-size:13px;color:#5B3FC4">Didn't ask for this? You can ignore this email.</p>`;
  const text = `Sign in to Astro Bakes\n\nYour code: ${code}\n\nOr open this link:\n${link}\n\nThe link and code expire in ${minutes} minutes and work once. Didn't ask for this? Ignore this email.`;
  return { subject, html: layout("en", subject, body), text };
}
