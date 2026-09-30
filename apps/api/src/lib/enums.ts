export const ROLES = ['STUDENT', 'TEACHER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const LESSON_STATUS = ['SCHEDULED', 'DONE', 'CANCELLED'] as const;
export const BOOKING_STATUS = ['NEW', 'CONTACTED', 'SCHEDULED', 'CLOSED'] as const;
export const REQUEST_STATUS = ['PENDING', 'APPROVED', 'DECLINED'] as const;
export const TICKET_STATUS = ['OPEN', 'ANSWERED', 'CLOSED'] as const;
export const ENROLLMENT_STATUS = ['PENDING', 'ACTIVE', 'DECLINED'] as const;
export const COURSE_SOURCE = ['SCHOOL', 'UNIVERSITY'] as const;
