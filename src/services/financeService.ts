import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type TransactionFilter = {
  userId?: string;
  from?: Date;
  to?: Date;
  category?: string;
  page?: number;
  limit?: number;
};

export type TransactionInput = {
  userId: string;
  date: Date;
  amount: number;
  currency?: string;
  category: string;
  description: string;
  source?: string;
};

export type GroupByOption = "category" | "date" | "both";

export type SummaryRequest = {
  userId: string;
  from: Date;
  to: Date;
  groupBy?: GroupByOption;
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
    ...(filter.userId ? { userId: filter.userId } : {}),
    ...(filter.category ? { category: filter.category } : {}),
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
          source: data.source || "manual"
        }
      })
    )
  );

  return created.map((item) => ({
    ...item,
    amount: toNumber(item.amount)
  }));
};

export const deleteTransaction = async (id: string) => {
  await prisma.financeTransaction.delete({ where: { id } });
};

export const getSummary = async (params: SummaryRequest) => {
  const from = params.from;
  const to = params.to;
  const where: Prisma.FinanceTransactionWhereInput = {
    userId: params.userId,
    date: {
      gte: from,
      lte: to
    }
  };

  const totalPromise = prisma.financeTransaction.aggregate({
    where,
    _sum: { amount: true }
  });

  const groupByCategoryPromise = prisma.financeTransaction.groupBy({
    where,
    by: ["category"],
    _sum: { amount: true }
  });

  const groupByDatePromise = prisma.financeTransaction.groupBy({
    where,
    by: ["date"],
    _sum: { amount: true }
  });

  const [totalResult, byCategory, byDate] = await Promise.all([
    totalPromise,
    params.groupBy === "date"
      ? Promise.resolve([])
      : groupByCategoryPromise,
    params.groupBy === "category" ? Promise.resolve([]) : groupByDatePromise
  ]);

  return {
    period: {
      from: from.toISOString().split("T")[0],
      to: to.toISOString().split("T")[0]
    },
    total: toNumber(totalResult._sum.amount || new Prisma.Decimal(0)),
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
