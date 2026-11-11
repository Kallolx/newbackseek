export function getSamplePosts(cityName: string, serviceName: string) {
  return [
    { id: 'post-1001', breadcrumb: '📍 Near You', title: `${serviceName} in ${cityName}`, description: 'A friendly local member is looking to connect and meet someone nearby.', postedAt: '2026-11-10T15:30:00Z', age: 28 },
    { id: 'post-1002', breadcrumb: '🟢 Available', title: `A new ${serviceName} post`, description: 'Open to meeting someone genuine for conversation, good company, and a relaxed first date.', postedAt: '2026-11-10T12:15:00Z', age: 32 },
    { id: 'post-1003', breadcrumb: '📍 Room 13, The Touch Room', title: `Around ${cityName}`, description: 'Hoping to meet someone nearby who shares similar interests and enjoys getting out around town.', postedAt: '2026-11-09T18:45:00Z', age: 25 },
    { id: 'post-1004', breadcrumb: 'Downtown', title: 'Coffee and good conversation', description: 'Looking to meet someone over coffee this weekend.', postedAt: '2026-11-09T16:00:00Z', age: 29 },
    { id: 'post-1005', breadcrumb: 'Free this weekend', title: 'Anyone up for a walk in the park?', description: 'I enjoy quiet walks and would love some company.', postedAt: '2026-11-09T14:30:00Z', age: 34 },
    { id: 'post-1006', breadcrumb: 'Evenings', title: 'Looking for a movie companion', description: 'Let’s pick a film and talk about it afterward.', postedAt: '2026-11-09T12:15:00Z', age: 27 },
    { id: 'post-1007', breadcrumb: 'Local', title: 'Let’s try a new restaurant', description: 'I have a few places in mind and would love to hear your favorites.', postedAt: '2026-11-08T19:20:00Z', age: 31 },
    { id: 'post-1008', breadcrumb: 'Saturday afternoon', title: 'Meet me at the weekend market', description: 'I’m planning to browse the stalls and grab a bite.', postedAt: '2026-11-08T16:45:00Z', age: 26 },
    { id: 'post-1009', breadcrumb: 'Around town', title: 'Live music and a relaxed evening', description: 'I’m looking for someone to join me at a local show.', postedAt: '2026-11-08T13:00:00Z', age: 33 },
  ];
}
