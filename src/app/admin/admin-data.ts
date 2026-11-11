export type LocationCountry = {
  code: string;
  name: string;
  regions: { name: string; id: string; cities: { name: string; id: string }[] }[];
};

export type CategoryGroup = { name: string; services: { name: string; slug: string }[] };
export type AdStatus = 'Published' | 'Pending' | 'Paused' | 'Archived';
export type Ad = {
  id: number;
  title: string;
  description: string;
  category: string;
  owner: string;
  targets: string[];
  status: AdStatus;
  updated: string;
  bumped?: boolean;
};

export const initialAds: Ad[] = [
  { id: 1001, title: 'Looking to meet someone nearby', description: 'Open to a coffee and conversation.', category: 'women-seeking-men', owner: 'alex', targets: ['/browse/us/alabama/auburn'], status: 'Published', updated: 'Nov 10, 2026' },
  { id: 1002, title: 'Weekend furniture pickup', description: 'Pickup available on Saturday afternoon.', category: 'furniture', owner: 'jamie', targets: ['/browse/us/arizona/flagstaff'], status: 'Pending', updated: 'Nov 10, 2026' },
  { id: 1003, title: 'Local photography sessions', description: 'Outdoor portraits and event photography.', category: 'photography-video', owner: 'morgan', targets: ['/browse/us/california/bakersfield'], status: 'Published', updated: 'Nov 9, 2026' },
  { id: 1004, title: 'Room available near downtown', description: 'Furnished room available next month.', category: 'rooms-for-rent', owner: 'jamie', targets: ['/browse/us/idaho/boise'], status: 'Paused', updated: 'Nov 8, 2026' },
];

export const initialUsers = [
  { id: 'alex', name: 'Alex Carter', email: 'alex@example.com', status: 'Active', role: 'Member' },
  { id: 'jamie', name: 'Jamie Rivera', email: 'jamie@example.com', status: 'Active', role: 'Member' },
  { id: 'morgan', name: 'Morgan Lee', email: 'morgan@example.com', status: 'Suspended', role: 'Member' },
];

export const initialMedia = [
  { id: 'IMG-401', name: 'Coffee meetup', src: '/admin/coffee.webp', adId: 1001 },
  { id: 'IMG-402', name: 'Furniture listing', src: '/admin/sofa.webp', adId: 1002 },
  { id: 'IMG-403', name: 'Photography listing', src: '/admin/camera.webp', adId: 1003 },
  { id: 'IMG-404', name: 'Room listing', src: '/admin/room.webp', adId: 1004 },
];

export const initialReports = [
  { id: 'R-101', adId: 1002, reason: 'Possible duplicate listing', status: 'Open' },
  { id: 'R-102', adId: 1001, reason: 'Review requested by a member', status: 'Open' },
];

export const adStatuses: AdStatus[] = ['Published', 'Pending', 'Paused', 'Archived'];
