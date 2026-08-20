import type { Page } from './page';

export type Audience = 'unidade' | 'selecionados';

export type AnnouncementInList = {
  readonly id: string;
  readonly title: string;
  readonly publishedAt: string | null;
  readonly recipients: number;
  readonly reads: number;
  readonly rate: number;
};

export type ReadSummary = {
  readonly recipients: number;
  readonly reads: number;
  readonly rate: number;
};

export type AnnouncementBoard = {
  readonly announcements: Page<AnnouncementInList>;
  readonly summary: ReadSummary;
  readonly currentSchool: string;
  readonly seesWholeNetwork: boolean;
};

export type PublishedAnnouncement = {
  readonly id: string;
};
