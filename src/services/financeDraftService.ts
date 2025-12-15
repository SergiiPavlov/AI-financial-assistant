import { DraftStatus, Prisma, TransactionType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/httpError";
import { createTransactionsBulkIdempotent, TransactionInput } from "./financeService";

const MAX_DRAFT_ITEMS = 200;
const SUPPORTED_LANGS = new Set(["ru", "uk", "en"]);
const SUPPORTED_SOURCES = new Set(["ai-text", "ai-voice", "manual"]);

type DraftItem = {
  date: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  source: string;
  type: TransactionType;
};

type DraftEntity = Prisma.FinanceDraftBatchGetPayload<{}>;

type DraftDetails = {
  id: string;
  userId: string;
  source: string;
  lang?: string | null;
  title?: string | null;
  status: DraftStatus;
  items: DraftItem[];
  createdAt: Date;
  updatedAt: Date;
  appliedBatchId?: string | null;
};

type DraftSummary = Omit<DraftDetails, "items"> & { itemsCount: number };

type CreateDraftParams = {
  userId: string;
  source: string;
  lang?: string;
  title?: string;
  items: any[];
};

type UpdateDraftParams = {
  id: string;
  userId: string;
  title?: string;
  items?: any[];
};

const normalizeLang = (lang?: string) => {
  if (!lang) return undefined;
  const normalized = lang.trim();
  if (!SUPPORTED_LANGS.has(normalized)) {
    throw new HttpError(400, "Unsupported lang value");
  }
  return normalized;
};

const normalizeSource = (source: string | undefined) => {
  if (!source || typeof source !== "string" || !source.trim()) {
    throw new HttpError(400, "source is required");
  }
  const normalized = source.trim();
  if (!SUPPORTED_SOURCES.has(normalized)) {
    throw new HttpError(400, "Unsupported source");
  }
  return normalized;
};

const normalizeTitle = (title?: string) => {
  if (title === undefined) return undefined;
  if (title === null) return null;
  if (typeof title !== "string") {
    throw new HttpError(400, "title must be a string");
  }
  const trimmed = title.trim();
  return trimmed || null;
};

const normalizeDateString = (value: any, index: number) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `items[${index}].date is required`);
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new HttpError(400, `items[${index}].date must be a valid date`);
  }
  return date.toISOString().split("T")[0];
};

const normalizeDraftItems = (rawItems: any, allowEmpty = false): DraftItem[] => {
  if (!Array.isArray(rawItems)) {
    throw new HttpError(400, "items must be an array");
  }
  if (!allowEmpty && rawItems.length === 0) {
    throw new HttpError(400, "items must not be empty");
  }
  if (rawItems.length > MAX_DRAFT_ITEMS) {
    throw new HttpError(400, `Too many draft items. Max ${MAX_DRAFT_ITEMS} allowed`);
  }

  return rawItems.map((item, index) => {
    const date = normalizeDateString((item as any)?.date, index);
    const amount = Number((item as any)?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(400, `items[${index}].amount must be a positive number`);
    }

    const category = typeof (item as any)?.category === "string" ? (item as any).category.trim() : "";
    if (!category) {
      throw new HttpError(400, `items[${index}].category is required`);
    }

    const description = typeof (item as any)?.description === "string" ? (item as any).description.trim() : "";
    if (!description) {
      throw new HttpError(400, `items[${index}].description is required`);
    }

    const currency =
      typeof (item as any)?.currency === "string" && (item as any).currency.trim()
        ? (item as any).currency.trim().toUpperCase()
        : "UAH";

    const source =
      typeof (item as any)?.source === "string" && (item as any).source.trim()
        ? (item as any).source.trim()
        : "manual";

    const typeValue = (item as any)?.type;
    const type: TransactionType = typeValue === "income" || typeValue === "expense" ? typeValue : "expense";

    return {
      date,
      amount,
      currency,
      category,
      description,
      source,
      type
    };
  });
};

const toDraftDetails = (draft: DraftEntity, items: DraftItem[]): DraftDetails => ({
  id: draft.id,
  userId: draft.userId,
  source: draft.source,
  lang: draft.lang,
  title: draft.title,
  status: draft.status,
  items,
  createdAt: draft.createdAt,
  updatedAt: draft.updatedAt,
  appliedBatchId: draft.appliedBatchId
});

const buildDraftSummary = (draft: DraftDetails): DraftSummary => ({
  id: draft.id,
  userId: draft.userId,
  source: draft.source,
  lang: draft.lang,
  title: draft.title,
  status: draft.status,
  createdAt: draft.createdAt,
  updatedAt: draft.updatedAt,
  appliedBatchId: draft.appliedBatchId,
  itemsCount: draft.items.length
});

const ensureOwnDraft = async (id: string, userId: string) => {
  const draft = await prisma.financeDraftBatch.findUnique({ where: { id } });
  if (!draft || draft.userId !== userId) {
    throw new HttpError(404, "Draft not found");
  }
  return draft;
};

export const createDraft = async (params: CreateDraftParams) => {
  const source = normalizeSource(params.source);
  const lang = normalizeLang(params.lang);
  const title = normalizeTitle(params.title);
  const items = normalizeDraftItems(params.items);

  const created = await prisma.financeDraftBatch.create({
    data: {
      userId: params.userId,
      source,
      lang,
      title,
      items
    }
  });

  return { draftId: created.id };
};

export const listDrafts = async (userId: string, limit = 20): Promise<{ items: DraftSummary[] }> => {
  const drafts = await prisma.financeDraftBatch.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  const details: DraftDetails[] = drafts.map((draft) =>
    toDraftDetails(draft, normalizeDraftItems(draft.items, true))
  );

  return { items: details.map((item) => buildDraftSummary(item)) };
};

export const getDraftDetails = async (id: string, userId: string): Promise<{ draft: DraftDetails }> => {
  const draft = await ensureOwnDraft(id, userId);
  const items = normalizeDraftItems(draft.items, true);
  return { draft: toDraftDetails(draft, items) };
};

export const updateDraft = async (params: UpdateDraftParams): Promise<{ draft: DraftDetails }> => {
  const draft = await ensureOwnDraft(params.id, params.userId);
  if (draft.status !== DraftStatus.draft) {
    throw new HttpError(400, "Only draft items can be edited");
  }

  const data: Prisma.FinanceDraftBatchUpdateInput = {};
  if (params.title !== undefined) {
    data.title = normalizeTitle(params.title);
  }
  if (params.items !== undefined) {
    data.items = normalizeDraftItems(params.items);
  }

  if (Object.keys(data).length === 0) {
    return getDraftDetails(params.id, params.userId);
  }

  const updated = await prisma.financeDraftBatch.update({ where: { id: params.id }, data });
  const items = normalizeDraftItems(updated.items, true);
  return { draft: toDraftDetails(updated, items) };
};

const mapDraftItemToTransactionInput = (item: DraftItem, userId: string): TransactionInput => {
  const date = new Date(item.date);
  if (isNaN(date.getTime())) {
    throw new HttpError(400, "Draft item has invalid date");
  }
  return {
    userId,
    date,
    amount: item.amount,
    currency: item.currency,
    category: item.category,
    description: item.description,
    source: item.source,
    type: item.type
  };
};

export const applyDraft = async (id: string, userId: string) => {
  const draft = await ensureOwnDraft(id, userId);
  if (draft.status === DraftStatus.discarded) {
    throw new HttpError(400, "Draft already discarded");
  }

  const items = normalizeDraftItems(draft.items);
  if (items.length === 0) {
    throw new HttpError(400, "Draft has no items");
  }

  const batchId = draft.appliedBatchId?.trim() || `draft:${draft.id}`;
  const transactions = items.map((item) => mapDraftItemToTransactionInput(item, userId));
  const result = await createTransactionsBulkIdempotent({
    userId,
    batchId,
    transactions,
    maxItems: MAX_DRAFT_ITEMS
  });

  if (draft.status !== DraftStatus.applied || draft.appliedBatchId !== batchId) {
    await prisma.financeDraftBatch.update({
      where: { id: draft.id },
      data: { status: DraftStatus.applied, appliedBatchId: batchId }
    });
  }

  return {
    duplicate: result.duplicate,
    transactionIds: result.transactionIds,
    items: result.items || []
  };
};

export const discardDraft = async (id: string, userId: string) => {
  await ensureOwnDraft(id, userId);
  await prisma.financeDraftBatch.update({ where: { id }, data: { status: DraftStatus.discarded } });
};
