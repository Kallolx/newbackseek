'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { getSamplePosts } from '../directory/sample-posts';

export type MemberPost = {
  id: string;
  title: string;
  description: string;
  descriptionHtml?: string;
  age: number;
  location: string;
  phone: string;
  cityName: string;
  cityHref: string;
  category: string;
  service: string;
  images: string[];
  status: 'Published' | 'Paused';
  sample: boolean;
  createdAt: string;
};
export type MemberSession = {
  email: string;
  username: string;
  gender: string;
  posts: MemberPost[];
  verificationRequested?: boolean;
};

const key = 'backpagenew-member-preview-v1';
const eventName = 'backpagenew-member-change';
const emptySubscribe = () => () => {};
const serverSnapshot = () => null;

function read() {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(eventName, callback);
    window.removeEventListener('storage', callback);
  };
}

export function useMember() {
  const ready = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const raw = useSyncExternalStore(subscribe, read, serverSnapshot);
  const member = useMemo((): MemberSession | null => {
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return typeof data.email === 'string' && typeof data.username === 'string' && Array.isArray(data.posts) ? data : null;
    } catch { return null; }
  }, [raw]);
  return { member, ready };
}

export function saveMember(member: MemberSession) {
  sessionStorage.setItem(key, JSON.stringify(member));
  window.dispatchEvent(new Event(eventName));
}

export function logOut() {
  sessionStorage.removeItem(key);
  window.dispatchEvent(new Event(eventName));
}

export function startPreview(email: string, username: string, gender: string) {
  const samples = getSamplePosts('Auburn', 'Women Seeking Men');
  const images = ['/admin/coffee.webp', '/admin/sofa.webp', '/admin/camera.webp', '/admin/room.webp'];
  const posts: MemberPost[] = Array.from({ length: 12 }, (_, index) => {
    const sample = samples[index % samples.length];
    return {
      id: 'sample-' + (1001 + index),
      title: index < samples.length ? sample.title : ['A relaxed weekend meetup', 'Good conversation over coffee', 'Exploring the neighborhood'][index - samples.length],
      description: sample.description,
      age: sample.age,
      location: 'Near downtown',
      phone: '+1 (202) 555-0142',
      cityName: 'Auburn',
      cityHref: '/browse/us/alabama/auburn',
      category: 'Dating',
      service: 'Women Seeking Men',
      images: [images[index % images.length]],
      status: 'Published',
      sample: true,
      createdAt: sample.postedAt,
    };
  });
  saveMember({ email, username, gender, posts });
}
