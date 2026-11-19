// Public pages that are not locations or ads: used by the sitemap, the landing pages and internal links.
import { blogPosts } from './blog';

export const staticPages: { path: string; changed?: string }[] = [
  { path: '/' }, { path: '/browse' }, { path: '/about' }, { path: '/backpage-alternative' }, { path: '/personals' }, { path: '/dating' }, { path: '/classifieds' },
  { path: '/blog', changed: [...blogPosts].sort((a, b) => b.date.localeCompare(a.date))[0]?.date },
  ...blogPosts.map((post) => ({ path: '/blog/' + post.slug, changed: post.date })),
  { path: '/contact' }, { path: '/guidelines', changed: '2026-11-19' }, { path: '/refund-policy', changed: '2026-11-19' }, { path: '/privacy', changed: '2026-11-17' }, { path: '/terms', changed: '2026-11-17' },
];

export type Section = { heading: string; paragraphs?: string[]; list?: string[] };
export type Landing = { path: string; title: string; description: string; h1: string; lead: string; sections: Section[]; faq: { q: string; a: string }[]; related: { href: string; label: string }[] };

const independent = 'BackpageNew is an independent website. It is not connected to the former Backpage.com or its owners.';

export const landings: Record<string, Landing> = {
  'backpage-alternative': {
    path: '/backpage-alternative',
    title: 'New Backpage Alternative – Free Local Classifieds | BackpageNew',
    description: 'Looking for the new Backpage? BackpageNew is a free Backpage alternative with local classifieds and personal ads by country, state and city in the US, Canada, UK and Australia.',
    h1: 'The New Backpage Alternative for Local Classifieds',
    lead: 'BackpageNew is a free local classifieds and personal ads website built for people who miss the simple, city-by-city way of finding things nearby. Choose your country, state or region and city, then browse or post.',
    sections: [
      { heading: 'What happened to Backpage?', paragraphs: ['Backpage.com was one of the best-known classifieds sites in North America until US federal authorities shut it down in April 2018. Since then, many people have searched for a “Backpage alternative”: a plain, local, easy-to-use classifieds site organised by city.', independent] },
      { heading: 'How BackpageNew works', list: ['Pick your country, then your state or region, then your city.', 'Browse categories such as dating, services, jobs, rentals, buy and sell, pets and automotive.', 'Open an ad to see its pictures and details and contact the poster.', 'Create a free account to post your own ad. New ads are reviewed before they appear.'] },
      { heading: 'Where is BackpageNew available?', paragraphs: ['BackpageNew has city pages across the United States, Canada, the United Kingdom and Australia. Each city has its own categories, so you only see ads that are near you.'] },
      { heading: 'Rules and safety', paragraphs: ['Everyone on BackpageNew must be 18 or older. Our Guidelines prohibit anything involving minors, trafficking, exploitation, fraud or other illegal activity, and ads that break them are removed. The Verified badge shows members who have completed our photo check. Read the safety tips on our blog before you meet anyone.'] },
    ],
    faq: [
      { q: 'Is BackpageNew the same as Backpage?', a: 'No. BackpageNew is an independent classifieds website and is not connected to the former Backpage.com. It follows a similar simple, local, city-by-city idea with clear rules and moderation.' },
      { q: 'Is BackpageNew free?', a: 'Browsing is free. Posting is currently free too. If paid options are introduced, the price is shown clearly before you pay, and our Refund Policy explains how credits work.' },
      { q: 'Which countries does it cover?', a: 'The United States, Canada, the United Kingdom and Australia, with pages for every state or region and for hundreds of cities.' },
      { q: 'Do I need an account to browse?', a: 'No. You only need a free account to post an ad or to use the account features such as your wallet and verification.' },
    ],
    related: [{ href: '/classifieds', label: 'Free classifieds' }, { href: '/personals', label: 'Personal ads' }, { href: '/dating', label: 'Dating ads' }, { href: '/about', label: 'About BackpageNew' }, { href: '/guidelines', label: 'Guidelines' }],
  },
  personals: {
    path: '/personals',
    title: 'Local Personals & Personal Ads by City | BackpageNew',
    description: 'Browse local personals and personal ads by city on BackpageNew: women, men, couples and more in the US, Canada, UK and Australia. Free to browse and post.',
    h1: 'Local Personals and Personal Ads',
    lead: 'Personal ads are short public notes from people who want to meet someone, make a connection or find company nearby. On BackpageNew they are grouped by city so you see people close to you.',
    sections: [
      { heading: 'Browse personals by city', paragraphs: ['Open your city, then choose a personals category such as Women Seeking Men, Men Seeking Women, Men Seeking Men, Women Seeking Women or Couples. Ads show the poster’s age, location and pictures, and newer ads appear first.'] },
      { heading: 'Writing a personal ad that gets replies', list: ['Say who you are and what you are looking for in the first lines.', 'Use clear, recent photos that show you well.', 'Be honest about your age, location and intentions.', 'Keep your phone number and address private until you trust the person.'] },
      { heading: 'Stay safe', paragraphs: ['Meet in a public place, tell a friend where you are, and never send money or gift cards to someone you have not met. Look for the Verified badge, and report any ad that looks fake or breaks our Guidelines.'] },
    ],
    faq: [
      { q: 'Are personal ads on BackpageNew free?', a: 'You can browse personal ads for free. Posting is currently free; any paid options will be shown clearly before you pay.' },
      { q: 'Who can use the personals?', a: 'Only adults aged 18 or older. Ads involving minors are never allowed and are reported to the authorities.' },
      { q: 'What does the Verified badge mean?', a: 'The member sent us a photo of themselves holding a handwritten note with their username, and our team checked it. It is not an endorsement of any ad.' },
    ],
    related: [{ href: '/dating', label: 'Dating ads' }, { href: '/backpage-alternative', label: 'The new Backpage alternative' }, { href: '/blog/staying-safe-when-meeting-someone-new', label: 'Safety tips' }, { href: '/guidelines', label: 'Guidelines' }],
  },
  dating: {
    path: '/dating',
    title: 'Dating Ads & Local Connections Near You | BackpageNew',
    description: 'Find dating ads near you on BackpageNew: women seeking men, men seeking women, couples and more, listed by city across the US, Canada, UK and Australia.',
    h1: 'Dating Ads and Local Connections',
    lead: 'Meet people near you through dating ads organised by city. Choose the category that fits, read the ads and reach out, or post your own.',
    sections: [
      { heading: 'Dating categories', paragraphs: ['Every city has the same set of dating categories, so you can switch between them quickly: Women Seeking Men, Men Seeking Women, Men Seeking Men, Women Seeking Women, and categories for couples and transgender members.'] },
      { heading: 'Tips for a good first message', list: ['Mention something from the ad so they know you read it.', 'Keep it short, polite and specific.', 'Suggest a public place and a time that suits both of you.', 'Never share financial details or send money.'] },
      { heading: 'Dating safely', paragraphs: ['Video call before you meet if you can, meet somewhere busy, and let a friend know your plans. If an ad or message feels wrong, trust that feeling and report it.'] },
    ],
    faq: [
      { q: 'How do I find dating ads in my city?', a: 'Open BackpageNew, choose your country, state or region and city, then pick a dating category.' },
      { q: 'How do I post a dating ad?', a: 'Create a free account, verify your email, choose Post an Ad, select your city and the dating category, and add your details and pictures.' },
    ],
    related: [{ href: '/personals', label: 'Personal ads' }, { href: '/blog/how-to-spot-scams-and-fake-listings', label: 'How to spot scams' }, { href: '/guidelines', label: 'Guidelines' }],
  },
  classifieds: {
    path: '/classifieds',
    title: 'Free Local Classifieds: Services, Jobs, Rentals & More | BackpageNew',
    description: 'Free local classifieds on BackpageNew: services, jobs, rentals, buy and sell, pets and automotive, by city in the US, Canada, UK and Australia.',
    h1: 'Free Local Classifieds Near You',
    lead: 'Find what you need or sell what you do not, close to home. BackpageNew groups classifieds by country, state or region and city so every listing is local.',
    sections: [
      { heading: 'What you can find', list: ['Services: cleaners, movers, tutors, repairs, beauty and more.', 'Buy, sell and trade: furniture, electronics, clothes and tickets.', 'Jobs and employment: part-time, full-time and one-off work.', 'Rentals and housing: rooms, apartments and houses.', 'Pets and animals: adoptions, supplies and pet services.', 'Automotive and vehicles: cars, parts and repair.'] },
      { heading: 'Posting a classified ad', paragraphs: ['A good ad has a clear title, an honest description, a fair price or rate and a few sharp pictures. Post it in the city where the buyer or customer is, and update or pause it when things change.'] },
      { heading: 'Buy and sell safely', paragraphs: ['Meet in a public place, check items before you pay, and be careful with deposits, gift cards and anyone who will not meet in person. Report ads that look like scams.'] },
    ],
    faq: [
      { q: 'Are classifieds on BackpageNew free?', a: 'Browsing is free. Posting is currently free; any paid options will be clearly shown before you pay.' },
      { q: 'How do I post in several cities?', a: 'Choose Post an Ad and select the cities you want. Each ad appears in every city you choose.' },
    ],
    related: [{ href: '/backpage-alternative', label: 'The new Backpage alternative' }, { href: '/personals', label: 'Personal ads' }, { href: '/blog/write-an-ad-that-gets-replies', label: 'Write an ad that gets replies' }],
  },
  about: {
    path: '/about',
    title: 'About BackpageNew – Local Classifieds & Personal Ads',
    description: 'About BackpageNew: a free local classifieds and personal ads site for the US, Canada, UK and Australia, with clear rules, member verification and moderation.',
    h1: 'About BackpageNew',
    lead: 'BackpageNew is a local classifieds and personal ads website. We help people find what they are looking for in their own city, with clear rules and tools that make the site safer to use.',
    sections: [
      { heading: 'What we do', paragraphs: ['We organise classifieds by country, state or region and city, with the same categories everywhere so the site is easy to learn. Members can post ads with pictures, and visitors can browse without an account.'] },
      { heading: 'How we keep it safer', list: ['Adults only: you must be 18 or older.', 'Email verification for every member.', 'A Verified badge for members who pass a photo check.', 'Reports, moderation and removal of ads that break our Guidelines.', 'Security protections against spam, bots and abuse.'] },
      { heading: 'Independent site', paragraphs: [independent] },
      { heading: 'Contact us', paragraphs: ['Questions, feedback or a problem with an ad? Use the contact page and we will reply by email.'] },
    ],
    faq: [],
    related: [{ href: '/contact', label: 'Contact us' }, { href: '/guidelines', label: 'Guidelines' }, { href: '/terms', label: 'Terms of Service' }, { href: '/privacy', label: 'Privacy Policy' }],
  },
};
