import type {Frequency, Tier} from "./pricing-types";

import {FrequencyEnum, TiersEnum} from "./pricing-types";

export const frequencies: Array<Frequency> = [
  {key: FrequencyEnum.Yearly, label: "Pay Yearly", priceSuffix: "per year"},
  {key: FrequencyEnum.Quarterly, label: "Pay Quarterly", priceSuffix: "per quarter"},
];

export const tiers: Array<Tier> = [
  {
    key: TiersEnum.Pro,
    title: "Pro",
    description: "For individual creators generating regularly.",
    href: "#",
    mostPopular: true,
    featured: false,
    price: {
      yearly: "$96",
      quarterly: "$30",
    },
    features: [
      "Up to 1,200 generations per year",
      "Standard image resolution",
      "Basic prompt enhancements",
      "Access to community gallery",
      "Email support",
    ],
    buttonText: "Get Pro",
    buttonColor: "primary",
    buttonVariant: "solid",
  },
  {
    key: TiersEnum.Team,
    title: "Team",
    description: "For small studios and businesses using IMAI collaboratively.",
    href: "#",
    featured: true,
    mostPopular: false,
    price: {
      yearly: "$240",
      quarterly: "$75",
    },
    features: [
      "Up to 3,000 generations per year",
      "HD image resolution",
      "Advanced prompt tuning",
      "Team workspace (up to 5 members)",
      "Priority email support",
    ],
    buttonText: "Get Team",
    buttonColor: "default",
    buttonVariant: "flat",
  },
  {
    key: TiersEnum.Enterprise,
    title: "Enterprise",
    description: "For agencies, brands, or high-volume creative teams.",
    href: "#",
    featured: true,
    mostPopular: false,
    price: {
      yearly: "Custom",
      quarterly: "Custom",
    },
    priceSuffix: "",
    features: [
      "Unlimited generations",
      "Ultra HD + custom resolutions",
      "Private model tuning",
      "Custom integrations",
      "Dedicated account manager",
    ],
    buttonText: "Contact Sales",
    buttonColor: "default",
    buttonVariant: "flat",
  },
];
