import { Router } from "express";
import { getCategoriesMeta, Lang } from "../lib/categories";

export const financeMetaRouter = Router();

const isSupportedLang = (value: string): value is Lang => {
  return value === "ru" || value === "uk" || value === "en";
};

financeMetaRouter.get("/categories", (req, res) => {
  const { lang } = req.query;
  const selectedLang: Lang = typeof lang === "string" && isSupportedLang(lang) ? lang : "ru";
  const categories = getCategoriesMeta(selectedLang);
  res.json(categories);
});
