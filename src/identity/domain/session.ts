import { TIME } from '../../shared/constants';

export type Session = {
  id: string;
  networkId: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  ip: string | null;
};

export function sessionExpiration(now: Date, durationHours: number): Date {
  return new Date(now.getTime() + durationHours * TIME.msPerHour);
}

export function hasSessionExpired(session: Session, now: Date): boolean {
  return session.expiresAt.getTime() <= now.getTime();
}
