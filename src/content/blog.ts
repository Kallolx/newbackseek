// Blog articles. Photos are free stock photos from Unsplash (Unsplash License), loaded from their CDN.
export type BlogBlock = { heading?: string; paragraphs?: string[]; list?: string[] };
export type BlogPost = { slug: string; title: string; excerpt: string; date: string; minutes: number; tag: string; image: string; imageAlt: string; body: BlogBlock[] };

const photo = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=70`;

export const blogPosts: BlogPost[] = [
  {
    slug: 'write-an-ad-that-gets-replies',
    title: 'How to write a classified ad that gets replies',
    excerpt: 'A clear title, honest details and a simple way to reach you make all the difference. Here is a quick checklist before you press publish.',
    date: '2026-11-12', minutes: 4, tag: 'Posting tips',
    image: photo('1563986768609-322da13575f3'), imageAlt: 'A person typing on a laptop while holding a phone',
    body: [
      { paragraphs: ['Most people decide in a few seconds whether to open an ad. The ads that get the most replies are not the longest ones. They are the ones that answer the obvious questions straight away.'] },
      { heading: 'Start with a title that says exactly what you offer', paragraphs: ['Put the most important words first. "Friendly dog walker in Midtown, evenings and weekends" tells a reader far more than "Available now!!!". Skip all-caps and long rows of emojis: they look like spam and make your ad harder to read.'] },
      { heading: 'Describe it the way you would explain it to a friend', paragraphs: ['Short paragraphs work best on phones. Cover what you offer, where, when you are available and anything a person should know before contacting you.'], list: ['What exactly is included', 'The area or neighborhood you cover', 'Days and times that suit you', 'How you prefer to be contacted'] },
      { heading: 'Be honest and specific', paragraphs: ['Accurate details save everyone time. Ads that overpromise collect reports and lose trust quickly. If something is not available, say so.'] },
      { heading: 'Choose the right city and category', paragraphs: ['People browse by city and category. An ad in the wrong place is invisible to the people who are looking for it. If you serve several nearby cities, add them as destinations rather than posting the same ad again and again.'] },
      { heading: 'Keep it fresh', paragraphs: ['Update your ad when your availability changes, and pause it when you are away. A current ad gets better replies than an old one nobody answers.'] },
    ],
  },
  {
    slug: 'staying-safe-when-meeting-someone-new',
    title: 'Staying safe when you meet someone from an ad',
    excerpt: 'Meeting in person is part of using local classifieds. A few simple habits keep it comfortable and safe for everyone.',
    date: '2026-11-08', minutes: 5, tag: 'Safety',
    image: photo('1495474472287-4d71bcdd2085'), imageAlt: 'Two people holding coffee cups at a café table',
    body: [
      { paragraphs: ['Most meetings arranged through classifieds go exactly as planned. Still, it is worth having a routine you follow every time, so you never have to think about it.'] },
      { heading: 'Before you meet', list: ['Keep the first messages on the platform or by email until you are comfortable.', 'Look for a Verified badge and a consistent, detailed ad.', 'Search the phone number or email if something feels off.', 'Tell a friend where you are going and when you expect to be back.'] },
      { heading: 'Choose the place', paragraphs: ['Meet first in a busy public place, such as a café, during the day if you can. Arrange your own transport so you can leave whenever you want.'] },
      { heading: 'During the meeting', paragraphs: ['Keep your phone charged and with you. Do not share more personal information than you need to, and never hand over identity documents or banking details. Trust your instincts: you can leave at any time without explaining why.'] },
      { heading: 'If something goes wrong', paragraphs: ['If you feel unsafe, leave and contact local emergency services. Report the ad on BackpageNew using the menu on the ad page so our team can review it.'] },
    ],
  },
  {
    slug: 'how-to-spot-scams-and-fake-listings',
    title: 'How to spot scams and fake listings',
    excerpt: 'Scammers rely on urgency and pressure. Learn the common warning signs and what to do when you see them.',
    date: '2026-11-03', minutes: 4, tag: 'Safety',
    image: photo('1516321318423-f06f85e504b3'), imageAlt: 'Two people pointing at a laptop screen',
    body: [
      { paragraphs: ['Scams change their wording all the time, but the patterns stay the same. If you know the patterns, you will recognize a scam even when it looks new.'] },
      { heading: 'Common warning signs', list: ['You are asked to pay a deposit or "verification fee" before meeting.', 'You are asked for gift cards, wire transfers or crypto sent to a stranger.', 'The person insists on moving to another app immediately.', 'The story is urgent, emotional or changes as you ask questions.', 'Photos look like they came from a magazine or another website.', 'You receive a link to "confirm your account" on a site that is not backpagenew.com.'] },
      { heading: 'BackpageNew will never…', list: ['Ask for your password by email, chat or phone.', 'Ask you to pay another member through us.', 'Send you a link to log in anywhere other than backpagenew.com.'] },
      { heading: 'What to do', paragraphs: ['Stop replying, do not send money, and report the ad from its page. If you already paid someone, contact your bank or payment provider straight away and keep the messages as evidence.'] },
    ],
  },
  {
    slug: 'great-ad-photos-with-your-phone',
    title: 'Great ad photos with just your phone',
    excerpt: 'You do not need a camera or editing software. Light, framing and a clean background do most of the work.',
    date: '2026-10-28', minutes: 3, tag: 'Posting tips',
    image: photo('1586953208448-b95a79798f07'), imageAlt: 'A smartphone showing a photo gallery on a white table',
    body: [
      { paragraphs: ['Ads with clear pictures get noticeably more attention. The good news: every modern phone takes pictures that are more than good enough.'] },
      { heading: 'Use daylight', paragraphs: ['Stand facing a window instead of using the flash. Soft daylight is flattering and shows true colors. Avoid strong light behind you, which turns the subject into a silhouette.'] },
      { heading: 'Keep the background simple', paragraphs: ['A plain wall or a tidy room keeps attention on what matters. Remove clutter and anything personal, such as letters, number plates or photos of other people.'] },
      { heading: 'Frame it well', list: ['Hold the phone steady, or rest it on something.', 'Clean the lens with a soft cloth first.', 'Take several shots and keep the sharpest.', 'Make the first picture your best one: it becomes the cover photo.'] },
      { heading: 'Stay within the rules', paragraphs: ['Only post photos you took yourself or have permission to use, and make sure they follow our Guidelines. Pictures of other people need their consent.'] },
    ],
  },
  {
    slug: 'topping-up-your-wallet-with-crypto',
    title: 'Topping up your wallet with crypto: a quick guide',
    excerpt: 'Wallet credits are coming to BackpageNew. Here is how crypto top-ups will work and how to avoid common mistakes.',
    date: '2026-11-17', minutes: 4, tag: 'Wallet',
    image: photo('1621761191319-c6fb62004040'), imageAlt: 'A phone showing cryptocurrency prices',
    body: [
      { paragraphs: ['BackpageNew is adding a wallet to every account. You will be able to top up credits once and use them when you post. Posting is free for now, so there is nothing you need to do yet.'] },
      { heading: 'How a top-up works', list: ['Open My account → Wallet and choose an amount.', 'Pick a coin and network, such as USDT on Tron (TRC-20).', 'Send the exact amount to the one-time address shown.', 'Credits appear after the network confirms the payment.'] },
      { heading: 'Pick the right network', paragraphs: ['The same coin can travel on different networks. USDT on Tron and USDT on Ethereum are not interchangeable: sending on the wrong network can lose the payment. Always match the network shown on the payment screen.'] },
      { heading: 'Mind the fees', paragraphs: ['Your wallet or exchange charges a network fee. Make sure the amount that arrives is at least the amount requested; if your exchange deducts the fee from the amount you send, add a little extra.'] },
      { heading: 'Keep it safe', paragraphs: ['We will only ever show payment addresses inside your account on backpagenew.com. Never send crypto to an address someone gives you by message or email. Read our Refund Policy for what happens if something goes wrong.'] },
    ],
  },
];

export const blogPost = (slug: string) => blogPosts.find((post) => post.slug === slug);
export const blogDate = (value: string) => new Date(value + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
