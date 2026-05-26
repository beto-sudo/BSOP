/**
 * Public re-exports — usar `import { ... } from '@/lib/notifications'`.
 */

export {
  getDefinitionBySlug,
  renderSubject,
  splitRecipientsExtra,
  type NotificationDefinition,
  type RecipientExtra,
  type RecipientExtraType,
  type TriggerType,
} from './registry';

export {
  writeNotificationLog,
  type LogStatus,
  type LogRecipients,
  type WriteLogInput,
} from './log';
