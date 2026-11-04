import {
  BeerBottleIcon,
  BreadIcon,
  CarrotIcon,
  CookieIcon,
  EggIcon,
  FishSimpleIcon,
  HandSoapIcon,
  JarIcon,
  SnowflakeIcon,
  SprayBottleIcon,
  TagIcon,
  type Icon,
} from "@phosphor-icons/react";

import type { Category } from "./categories.ts";

/** The small icon beside each category heading in a list, so aisles are easy to spot */
export const CATEGORY_ICONS: Record<Category, Icon> = {
  Produce: CarrotIcon,
  Bakery: BreadIcon,
  "Meat & Fish": FishSimpleIcon,
  "Dairy & Eggs": EggIcon,
  Pantry: JarIcon,
  Frozen: SnowflakeIcon,
  "Snacks & Sweets": CookieIcon,
  Drinks: BeerBottleIcon,
  Household: SprayBottleIcon,
  "Personal care": HandSoapIcon,
  Other: TagIcon,
};
