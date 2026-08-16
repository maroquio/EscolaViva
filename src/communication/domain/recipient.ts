export type BoardItem = {
  announcementId: string;
  title: string;
  publishedAt: string;
  readAt: string | null;
};

export type ReadCount = {
  announcementId: string;
  title: string;
  publishedAt: string | null;
  recipients: number;
  reads: number;
};

export type ReadStatistic = ReadCount & { rate: number };

export function readRate(recipients: number, reads: number): number {
  if (recipients <= 0) return 0;
  return Math.min(1, Math.max(0, reads / recipients));
}
