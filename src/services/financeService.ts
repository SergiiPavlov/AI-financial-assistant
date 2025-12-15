import { Decimal } from "@prisma/client/runtime/library";
import { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type TransactionFilter = {
  userId: string;
  from?: Date;
  to?: Date;
  category?: string;
  type?: TransactionType;
  page?: number;
  limit?: number;
};

export type TransactionExportFilter = {
  userId: string;
  from: Date;
  to: Date;
  category?: string;
  type?: TransactionType;
  maxRows?: number;
};

export type TransactionForExport = {
  id: string;
  userId: string;
  date: Date;
  amount: number;
  currency: string;
  category: string;
  description: string;
  source: string;
  type: TransactionType;
};

export type TransactionInput = {
  userId: string;
  date: Date;
  amount: number;
  currency?: string;
  category: string;
  description: string;
  source?: string;
  type?: TransactionType;
};

export type TransactionUpdateInput = {
  date?: string;
  amount?: number;
  currency?: string;
  category?: string;
  description?: string;
  type?: TransactionType;
};

export type GroupByOption = "category" | "date" | "both";

export type SummaryRequest = {
  userId: string;
  from: Date;
  to: Date;
  type?: TransactionType | "all";
  groupBy?: GroupByOption;
};

const parseDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
};

const isTransactionTypeValue = (value: any): value is TransactionType => {
  return value === "expense" || value === "income";
};

const toNumber = (value: Decimal | Prisma.Decimal): number => {
  if (typeof (value as any).toNumber === "function") {
    return (value as any).toNumber();
  }
  return Number(value);
};

export const listTransactions = async (filter: TransactionFilter) => {
  const page = filter.page && filter.page > 0 ? filter.page : 1;
  const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 200) : 50;
  const skip = (page - 1) * limit;

  const where: Prisma.FinanceTransactionWhereInput = {
    userId: filter.userId,
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.from || filter.to
      ? {
          date: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {})
          }
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.financeTransaction.findMany({
      where,
      orderBy: { date: "desc" },
      skip,
      take: limit
    }),
    prisma.financeTransaction.count({ where })
  ]);

  return {
    items: items.map((item) => ({
      ...item,
      amount: toNumber(item.amount)
    })),
    page,
    limit,
    total
  };
};

export const getTransactionsForExport = async (filter: TransactionExportFilter) => {
  const maxRows = filter.maxRows && filter.maxRows > 0 ? Math.min(filter.maxRows, 20000) : 20000;

  const where: Prisma.FinanceTransactionWhereInput = {
    userId: filter.userId,
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    date: {
      gte: filter.from,
      lte: filter.to
    }
  };

  const items = await prisma.financeTransaction.findMany({
    where,
    orderBy: { date: "asc" },
    take: maxRows + 1
  });

  const normalized = items.map<TransactionForExport>((item) => ({
    ...item,
    amount: toNumber(item.amount)
  }));

  const exceedsLimit = normalized.length > maxRows;

  return {
    items: exceedsLimit ? normalized.slice(0, maxRows) : normalized,
    exceedsLimit
  };
};

export const createTransactions = async (inputs: TransactionInput[]) => {
  const created = await prisma.$transaction(
    inputs.map((data) =>
      prisma.financeTransaction.create({
        data: {
          userId: data.userId,
          date: data.date,
          amount: new Prisma.Decimal(data.amount),
          currency: data.currency || "UAH",
          category: data.category,
          description: data.description,
          source: data.source || "manual",
          type: data.type || "expense"
        }
      })
    )
  );

  return created.map((item) => ({
    ...item,
    amount: toNumber(item.amount)
  }));
};

export const deleteTransaction = async (id: string, userId: string) => {
  const deleted = await prisma.financeTransaction.deleteMany({ where: { id, userId } });
  if (deleted.count === 0) {
    throw new Error("Transaction not found");
  }
};

const validateTransactionUpdateInput = (input: TransactionUpdateInput) => {
  const data: Prisma.FinanceTransactionUpdateInput = {};
  if (input.date !== undefined) {
    const date = parseDate(input.date);
    if (!date) {
      throw new Error("Invalid date");
    }
    data.date = date;
  }
  if (input.amount !== undefined) {
    if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error("Amount must be a positive number");
    }
    data.amount = new Prisma.Decimal(input.amount);
  }
  if (input.currency !== undefined) {
    if (typeof input.currency !== "string" || !input.currency.trim()) {
      throw new Error("Currency must be a non-empty string");
    }
    data.currency = input.currency.trim().toUpperCase();
  }
  if (input.category !== undefined) {
    if (typeof input.category !== "string" || !input.category.trim()) {
      throw new Error("Category must be a non-empty string");
    }
    data.category = input.category.trim();
  }
  if (input.description !== undefined) {
    if (typeof input.description !== "string") {
      throw new Error("Description must be a string");
    }
    data.description = input.description.trim();
  }
  if (input.type !== undefined) {
    if (!isTransactionTypeValue(input.type)) {
      throw new Error("type must be either expense or income");
    }
    data.type = input.type;
  }
  return data;
};

export const updateTransaction = async (id: string, userId: string, input: TransactionUpdateInput) => {
  if (!id) {
    throw new Error("id is required");
  }
  const data = validateTransactionUpdateInput(input);
  const existing = await prisma.financeTransaction.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    throw new Error("Transaction not found");
  }

  const updated = await prisma.financeTransaction.update({
    where: { id },
    data
  });

  return {
    ...updated,
    amount: toNumber(updated.amount)
  };
};

export const getSummary = async (params: SummaryRequest) => {
  const from = params.from;
  const to = params.to;
  const baseWhere: Prisma.FinanceTransactionWhereInput = {
    userId: params.userId,
    date: {
      gte: from,
      lte: to
    }
  };

  const filteredWhere: Prisma.FinanceTransactionWhereInput = {
    ...baseWhere,
    ...(params.type && params.type !== "all" ? { type: params.type } : {})
  };

  const incomeTotalPromise =
    params.type === "expense"
      ? Promise.resolve({ _sum: { amount: new Prisma.Decimal(0) } })
      : prisma.financeTransaction.aggregate({
          where: { ...baseWhere, type: "income" },
          _sum: { amount: true }
        });

  const expenseTotalPromise =
    params.type === "income"
      ? Promise.resolve({ _sum: { amount: new Prisma.Decimal(0) } })
      : prisma.financeTransaction.aggregate({
          where: { ...baseWhere, type: "expense" },
          _sum: { amount: true }
        });

  const groupByCategoryPromise = prisma.financeTransaction.groupBy({
    where: filteredWhere,
    by: ["category"],
    _sum: { amount: true }
  });

  const groupByDatePromise = prisma.financeTransaction.groupBy({
    where: filteredWhere,
    by: ["date"],
    _sum: { amount: true }
  });

  const [incomeTotalResult, expenseTotalResult, byCategory, byDate] = await Promise.all([
    incomeTotalPromise,
    expenseTotalPromise,
    params.groupBy === "date" ? Promise.resolve([]) : groupByCategoryPromise,
    params.groupBy === "category" ? Promise.resolve([]) : groupByDatePromise
  ]);

  const incomeTotal = toNumber(incomeTotalResult._sum.amount || new Prisma.Decimal(0));
  const expenseTotal = toNumber(expenseTotalResult._sum.amount || new Prisma.Decimal(0));

  return {
    period: {
      from: from.toISOString().split("T")[0],
      to: to.toISOString().split("T")[0]
    },
    incomeTotal,
    expenseTotal,
    balance: incomeTotal - expenseTotal,
    byCategory:
      params.groupBy === "date"
        ? []
        : byCategory.map((item) => ({
            category: item.category,
            amount: toNumber(item._sum.amount || new Prisma.Decimal(0))
          })),
    byDate:
      params.groupBy === "category"
        ? []
        : byDate.map((item) => ({
            date: item.date.toISOString().split("T")[0],
            amount: toNumber(item._sum.amount || new Prisma.Decimal(0))
          }))
  };
};
