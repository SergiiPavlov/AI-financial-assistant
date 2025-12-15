import { DraftStatus, Prisma, TransactionType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/httpError";
import { createTransactionsBulkIdempotent, TransactionInput } from "./financeService";
import { validateTransactionInput } from "../lib/validation/financeTransaction";

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

const normalizeDraftItemsLenient = (rawItems: any, allowEmpty = false): DraftItem[] => {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const trimmedItems = rawItems.slice(0, MAX_DRAFT_ITEMS);
  if (!allowEmpty && trimmedItems.length === 0) {
    return [];
  }

  return trimmedItems.map((item) => {
    const data = item && typeof item === "object" ? item : {};

    const dateValue =
      data.date instanceof Date
        ? data.date
        : typeof data.date === "string"
          ? new Date(data.date)
          : undefined;
    const date = dateValue && !isNaN(dateValue.getTime())
      ? dateValue.toISOString().split("T")[0]
      : typeof data.date === "string"
        ? data.date.trim()
        : "";

    const amount = Number(data.amount);
    const currency =
      typeof data.currency === "string" && data.currency.trim()
        ? data.currency.trim().toUpperCase()
        : "UAH";
    const category = typeof data.category === "string" ? data.category.trim() : "";
    const description =
      data.description === undefined || data.description === null
        ? ""
        : String(data.description).trim();
    const source =
      typeof data.source === "string" && data.source.trim() ? data.source.trim() : "manual";
    const type: TransactionType = data.type === "income" ? "income" : "expense";

    return {
      date,
      amount: Number.isFinite(amount) ? amount : 0,
      currency,
      category,
      description,
      source,
      type
    };
  });
};

const validateDraftItemsStrict = (rawItems: any, allowEmpty = false): DraftItem[] => {
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
    const normalized = validateTransactionInput(item, {
      partial: false,
      pathPrefix: `items[${index}].`
    });

    return {
      date: normalized.date!.toISOString().split("T")[0],
      amount: normalized.amount!,
      currency: normalized.currency!,
      category: normalized.category!,
      description: normalized.description!,
      source: normalized.source!,
      type: normalized.type as TransactionType
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
  const items = validateDraftItemsStrict(params.items);

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
    toDraftDetails(draft, normalizeDraftItemsLenient(draft.items, true))
  );

  return { items: details.map((item) => buildDraftSummary(item)) };
};

export const getDraftDetails = async (id: string, userId: string): Promise<{ draft: DraftDetails }> => {
  const draft = await ensureOwnDraft(id, userId);
  const items = normalizeDraftItemsLenient(draft.items, true);
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
    data.items = validateDraftItemsStrict(params.items);
  }

  if (Object.keys(data).length === 0) {
    return getDraftDetails(params.id, params.userId);
  }

  const updated = await prisma.financeDraftBatch.update({ where: { id: params.id }, data });
  const items = normalizeDraftItemsLenient(updated.items, true);
  return { draft: toDraftDetails(updated, items) };
};

const mapDraftItemToTransactionInput = (item: DraftItem, userId: string, index: number): TransactionInput => {
  const normalized = validateTransactionInput(
    { ...item, date: item.date },
    { userId, pathPrefix: `items[${index}].` }
  );
  return {
    userId,
    date: normalized.date!,
    amount: normalized.amount!,
    currency: normalized.currency!,
    category: normalized.category!,
    description: normalized.description!,
    source: normalized.source!,
    type: normalized.type as TransactionType
  };
};

export const applyDraft = async (id: string, userId: string) => {
  const draft = await ensureOwnDraft(id, userId);
  if (draft.status === DraftStatus.discarded) {
    throw new HttpError(400, "Draft already discarded");
  }

  const items = validateDraftItemsStrict(draft.items);
  if (items.length === 0) {
    throw new HttpError(400, "Draft has no items");
  }

  const batchId = draft.appliedBatchId?.trim() || `draft:${draft.id}`;
  const transactions = items.map((item, index) => mapDraftItemToTransactionInput(item, userId, index));
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
