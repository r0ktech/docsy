import 'server-only';
import { prisma } from '@/server/db';
import { getConfig } from '@/server/config';
import { Errors } from '@/server/errors';
import { formatBytes } from '@/lib/files';

const MB = 1024 * 1024;

/**
 * Plan limits. Only the free plan exists today; the structure lets a billing
 * provider later set `user.plan` (e.g. from a Stripe webhook) to unlock a
 * different row without touching enforcement code.
 */
export function planLimits(plan = 'free', config = getConfig()) {
  const free = {
    plan: 'free',
    maxDocuments: config.FREE_MAX_DOCUMENTS,
    maxStorageBytes: config.FREE_MAX_STORAGE_MB * MB,
    maxQuestionsPerMonth: config.FREE_MAX_QUESTIONS_PER_MONTH,
    maxUploadBytes: config.MAX_UPLOAD_MB * MB,
    maxPagesPerDocument: config.MAX_PAGES_PER_DOCUMENT,
  };
  const plans = { free };
  return plans[plan] || free;
}

export function startOfMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getUsage(userId, plan = 'free') {
  const since = startOfMonth();
  const [docAgg, questions, tokens] = await Promise.all([
    prisma.document.aggregate({
      where: { userId, status: { not: 'UPLOADING' } },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    prisma.usageRecord.aggregate({
      where: { userId, kind: 'QUESTION', createdAt: { gte: since } },
      _sum: { quantity: true },
    }),
    prisma.usageRecord.aggregate({
      where: { userId, kind: { in: ['EMBEDDING', 'COMPLETION'] }, createdAt: { gte: since } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
  ]);
  return {
    documents: docAgg._count._all,
    storageBytes: docAgg._sum.sizeBytes ?? 0,
    questionsThisMonth: questions._sum.quantity ?? 0,
    tokensThisMonth: (tokens._sum.inputTokens ?? 0) + (tokens._sum.outputTokens ?? 0),
    periodStart: since,
    limits: planLimits(plan),
  };
}

export async function assertCanUpload(userId, plan, sizeBytes, client = prisma) {
  const limits = planLimits(plan);
  if (sizeBytes > limits.maxUploadBytes) {
    throw Errors.validation(`Files can be up to ${formatBytes(limits.maxUploadBytes)}. This one is ${formatBytes(sizeBytes)}.`);
  }
  const agg = await client.document.aggregate({
    where: { userId },
    _count: { _all: true },
    _sum: { sizeBytes: true },
  });
  if (agg._count._all >= limits.maxDocuments) {
    throw Errors.limit(
      'DOCUMENT_LIMIT_REACHED',
      `You've reached the ${limits.maxDocuments}-document limit on the free plan. Delete documents you no longer need to upload more.`,
    );
  }
  if ((agg._sum.sizeBytes ?? 0) + sizeBytes > limits.maxStorageBytes) {
    throw Errors.limit(
      'STORAGE_LIMIT_REACHED',
      `This upload would exceed your ${formatBytes(limits.maxStorageBytes)} storage limit. Delete documents to free up space.`,
    );
  }
}

export async function assertCanAsk(userId, plan) {
  const limits = planLimits(plan);
  const used = await prisma.usageRecord.aggregate({
    where: { userId, kind: 'QUESTION', createdAt: { gte: startOfMonth() } },
    _sum: { quantity: true },
  });
  if ((used._sum.quantity ?? 0) >= limits.maxQuestionsPerMonth) {
    throw Errors.limit(
      'QUESTION_LIMIT_REACHED',
      `You've used all ${limits.maxQuestionsPerMonth} questions for this month. Your allowance resets on the 1st (UTC).`,
    );
  }
}

export function recordUsage(data, client = prisma) {
  return client.usageRecord.create({ data });
}
