export const CATEGORY_IDS = [
  "food",
  "transport",
  "bills",
  "rent",
  "health",
  "fun",
  "shopping",
  "other"
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export type Lang = "en" | "ru" | "uk";

export const CATEGORY_LABELS: Record<CategoryId, Record<Lang, string>> = {
  food: {
    en: "Food & groceries",
    ru: "Еда и продукты",
    uk: "Їжа та продукти"
  },
  transport: {
    en: "Transport",
    ru: "Транспорт",
    uk: "Транспорт"
  },
  bills: {
    en: "Bills & utilities",
    ru: "Коммунальные услуги",
    uk: "Комунальні послуги"
  },
  rent: {
    en: "Rent",
    ru: "Аренда жилья",
    uk: "Оренда житла"
  },
  health: {
    en: "Health",
    ru: "Здоровье",
    uk: "Здоров'я"
  },
  fun: {
    en: "Entertainment",
    ru: "Развлечения",
    uk: "Розваги"
  },
  shopping: {
    en: "Shopping",
    ru: "Покупки и шопинг",
    uk: "Покупки та шопінг"
  },
  other: {
    en: "Other",
    ru: "Другое",
    uk: "Інше"
  }
};

const CATEGORY_KEYWORDS: Record<CategoryId, string[]> = {
  food: [
    "food",
    "grocery",
    "groceries",
    "еда",
    "продукт",
    "продукты",
    "магазин",
    "супермаркет",
    "їжа",
    "продукти",
    "супермаркет"
  ],
  transport: [
    "transport",
    "bus",
    "metro",
    "taxi",
    "uber",
    "bolt",
    "транспорт",
    "проезд",
    "проїзд",
    "маршрутка",
    "маршрутки",
    "трамвай",
    "троллейбус",
    "трамвай",
    "такси",
    "таксі",
    "поездка",
    "поездка на такси",
    "поїздка"
  ],
  bills: [
    "bill",
    "bills",
    "utility",
    "utilities",
    "коммунал",
    "комунал",
    "жкх",
    "электрич",
    "електри",
    "газ",
    "вода",
    "water",
    "electricity"
  ],
  rent: [
    "rent",
    "аренда",
    "оренда",
    "квартира",
    "кварплата",
    "оренда квартири",
    "съём",
    "съем"
  ],
  health: [
    "health",
    "medicine",
    "аптека",
    "аптек",
    "лекарств",
    "ліки",
    "медицина",
    "doctor",
    "dentist",
    "стоматолог",
    "врач",
    "лікар"
  ],
  fun: [
    "fun",
    "entertainment",
    "развлеч",
    "розваг",
    "кино",
    "кіно",
    "театр",
    "concert",
    "концерт",
    "игры",
    "игра",
    "games",
    "game",
    "netflix",
    "spotify",
    "подписка",
    "підписка"
  ],
  shopping: [
    "shopping",
    "shop",
    "магазин",
    "покупка",
    "покупки",
    "шопинг",
    "одежда",
    "одяг",
    "обувь",
    "взуття",
    "техника",
    "техніка",
    "electronics",
    "marketplace",
    "rozetka",
    "amazon",
    "aliexpress",
    "аліекспрес"
  ],
  other: []
};

export const isCategoryId = (value: string): value is CategoryId => {
  return (CATEGORY_IDS as readonly string[]).includes(value);
};

export const normalizeCategoryId = (raw: unknown): CategoryId => {
  if (typeof raw !== "string") return "other";
  const value = raw.trim().toLowerCase();
  if (!value) return "other";

  // already canonical id
  if (isCategoryId(value)) {
    return value;
  }

  for (const id of CATEGORY_IDS) {
    const keywords = CATEGORY_KEYWORDS[id];
    if (!keywords || keywords.length === 0) continue;
    if (keywords.some((kw) => value.includes(kw))) {
      return id;
    }
  }

  return "other";
};

export const getCategoryLabel = (id: string | null | undefined, lang: Lang = "ru"): string => {
  if (!id || !isCategoryId(id)) {
    return "";
  }
  return CATEGORY_LABELS[id][lang] || id;
};

export const getCategoriesMeta = (lang: Lang = "ru") => {
  return CATEGORY_IDS.map((id) => ({
    id,
    label: getCategoryLabel(id, lang)
  }));
};
