import { communication, type ReadStatistic } from '../../communication';
import type { AnnouncementInList, ReadSummary } from '@escolaviva/contracts/announcements';
import type { SimpleOption } from '@escolaviva/contracts/shared';

export type ReadTotals = Awaited<ReturnType<typeof communication.announcementsSummary>>;

export type Recipient = { id: string; name: string };

export const announcementAsJson = (statistic: ReadStatistic): AnnouncementInList => ({
  id: statistic.announcementId,
  title: statistic.title,
  publishedAt: statistic.publishedAt,
  recipients: statistic.recipients,
  reads: statistic.reads,
  rate: statistic.rate,
});

export const readSummaryAsJson = (totals: ReadTotals): ReadSummary => ({
  recipients: totals.recipients,
  reads: totals.reads,
  rate: totals.rate,
});

export const recipientAsJson = (guardian: Recipient): SimpleOption => ({
  id: guardian.id,
  name: guardian.name,
});
