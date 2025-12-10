import { prisma } from "../lib/prisma";

export async function listTransactions() {
  // TODO: добавить фильтры по дате/категориям
  return prisma.financeTransaction.findMany({
    orderBy: { date: "desc" },
    take: 100
  });
}

// Заглушка для будущего summary
export async function getSummary() {
  // TODO: заменить на агрегацию через Prisma
  return {
    total: 0,
    byCategory: [],
    byDate: []
  };
}
