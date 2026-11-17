export const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));

export function accountEmail({origin,title,preheader,greeting,description,button,url,expiry,security}) {
 const site=new URL(origin).origin;
 const link=escapeHtml(url),home=escapeHtml(site);
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
 <body style="margin:0;padding:0;background:#f2f5fa;font-family:Arial,Helvetica,sans-serif;color:#233650;">
 <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5fa;"><tr><td align="center" style="padding:32px 14px;">
 <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
 <tr><td align="center" style="padding:8px 24px 26px;"><a href="${home}" style="text-decoration:none;"><img src="${home}/brand/backpage-new-logo.png" width="198" alt="BackpageNew" style="display:block;width:198px;max-width:100%;height:auto;border:0;"></a></td></tr>
 <tr><td style="background:#ffffff;border:1px solid #e0e7f1;border-top:4px solid #17356b;border-radius:12px;padding:34px 28px;">
 <p style="margin:0 0 14px;font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#bd3544;text-transform:uppercase;">YOUR BACKPAGENEW ACCOUNT</p>
 <h1 style="margin:0 0 20px;color:#142f60;font-size:26px;line-height:1.3;">${escapeHtml(title)}</h1>
 <p style="margin:0 0 12px;font-size:15px;line-height:1.7;">${escapeHtml(greeting)}</p>
 <p style="margin:0 0 26px;font-size:15px;line-height:1.7;color:#53637b;">${escapeHtml(description)}</p>
 <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#17356b" style="border-radius:7px;"><a href="${link}" style="display:inline-block;padding:15px 24px;border:1px solid #17356b;border-radius:7px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(button)}</a></td></tr></table>
 <p style="margin:18px 0 24px;font-size:12px;line-height:1.6;color:#738096;">${escapeHtml(expiry)}</p>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:16px;background:#f6f8fc;border:1px solid #e6ebf3;border-radius:7px;font-size:13px;line-height:1.7;color:#53637b;">${escapeHtml(security)}</td></tr></table>
 <p style="margin:25px 0 8px;font-size:12px;line-height:1.7;color:#738096;">Button not working? Copy this link into your browser:</p>
 <a href="${link}" style="font-size:12px;line-height:1.7;color:#17356b;word-break:break-all;overflow-wrap:anywhere;">${link}</a>
 </td></tr>
 <tr><td align="center" style="padding:24px 18px;font-size:12px;line-height:1.8;color:#738096;">Need a hand? <a href="mailto:support@backpagenew.com" style="color:#17356b;">Contact support</a><br>
 <a href="${home}/privacy" style="color:#738096;">Privacy Policy</a> &nbsp;·&nbsp; <a href="${home}/terms" style="color:#738096;">Terms of Service</a><br>© ${new Date().getUTCFullYear()} BackpageNew. All rights reserved.<br>This is an automated account email.</td></tr>
 </table></td></tr></table></body></html>`;
}
