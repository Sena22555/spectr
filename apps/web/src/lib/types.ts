export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface User {
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  telegramLinked: boolean;
  vkLinked: boolean;
  emailVerified: boolean;
  teacherId: string | null;
  teacherSlug: string | null;
  createdAt: string;
}

export interface TeacherCard {
  id: string;
  slug: string;
  subject: string;
  headline: string;
  experience: number;
  photoUrl: string | null;
  hue: number;
  user: { name: string };
  _count?: { groups: number };
}

export interface Subject {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  source: 'SCHOOL' | 'UNIVERSITY';
  audience: 'SCHOOL' | 'STUDENTS' | 'ALL';
  university: string | null;
  level: string;
  format: string;
  hue: number;
  teacher: TeacherCard | null;
}

export interface GroupPhoto {
  id: string;
  url: string;
  caption: string | null;
  createdAt: string;
}

export interface GroupCard {
  id: string;
  slug: string;
  name: string;
  description: string;
  coverUrl: string | null;
  hue: number;
  schedule: string;
  capacity: number;
  teacher: TeacherCard | null;
  course: { slug: string; title: string } | null;
  photos: GroupPhoto[];
  _count: { members: number; photos?: number };
}

export interface Lesson {
  id: string;
  title: string;
  startsAt: string;
  durationMin: number;
  link: string | null;
  notes: string | null;
  status: 'SCHEDULED' | 'DONE' | 'CANCELLED';
  teacher?: { slug: string; subject: string; hue: number; photoUrl: string | null; user: { name: string } };
  group?: { id?: string; slug: string; name: string; hue: number; _count?: { members: number } } | null;
  student?: { id: string; name: string; avatarUrl: string | null } | null;
  reschedules?: { id: string; status?: string; proposedAt?: string | null; createdAt?: string }[];
}

export interface RescheduleRequest {
  id: string;
  reason: string;
  proposedAt: string | null;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  reply: string | null;
  createdAt: string;
  lesson: Lesson;
  user?: { id: string; name: string; avatarUrl?: string | null };
}

export interface TicketMessage {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; role: Role; avatarUrl?: string | null };
}

export interface Ticket {
  id: string;
  subject: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
  user?: { id: string; name: string; email: string | null };
  _count?: { messages: number };
}

export interface Booking {
  id: string;
  name: string;
  contact: string;
  preferredTime: string | null;
  format: 'INDIVIDUAL' | 'GROUP' | null;
  comment: string | null;
  status: 'NEW' | 'CONTACTED' | 'SCHEDULED' | 'CLOSED';
  createdAt: string;
  teacherSlug: string | null;
  course: { title: string } | null;
  user: { id: string; name: string; email: string | null } | null;
}
