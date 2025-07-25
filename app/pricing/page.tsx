"use client";
import React from "react";
import { Icon } from "@iconify/react";
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Chip,
  Divider,
  Link,
  Spacer,
  Tab,
  Tabs,
} from "@heroui/react";
import { cn } from "@heroui/react";
import { FrequencyEnum } from "@/types/pricing-types";
import { frequencies, tiers } from "@/types/pricing-tiers";
import Header from "../components/header";
import Footer from "../components/footer";
import FAQ from "../components/faq";
import MobileNavRest from "@/app/components/MobileNavRest";

export default function Pricing() {
  const [selectedFrequency, setSelectedFrequency] = React.useState(
    frequencies[0],
  );
  const onFrequencyChange = (selectedKey: React.Key) => {
    const frequencyIndex = frequencies.findIndex((f) => f.key === selectedKey);
    setSelectedFrequency(frequencies[frequencyIndex]);
  };

  return (
    <>
      <Header></Header>
      <MobileNavRest />
      <div className="w-full flex justify-center align-middle min-h-full bg-white dark:bg-black p-4">
        <div className="flex max-w-5xl flex-col items-center py-24">
          <div className="flex max-w-xl flex-col text-center">
            <h2 className="font-medium text-blue-500">Pricing</h2>
            <h1 className="text-4xl font-medium tracking-tight">
              Get unlimited access.
            </h1>
            <Spacer y={4} />
            <h2 className="text-large text-default-500">
              Discover the ideal plan, beginning at under $2 per week.
            </h2>
          </div>
          <Spacer y={8} />
          <Tabs
            classNames={{
              tab: "data-[hover-unselected=true]:opacity-90",
            }}
            radius="full"
            size="lg"
            onSelectionChange={onFrequencyChange}
          >
            <Tab
              key={FrequencyEnum.Yearly}
              aria-label="Pay Yearly"
              className="pr-1.5"
              title={
                <div className="flex items-center gap-2">
                  <p>Pay Yearly</p>
                  <Chip color="primary">Save 25%</Chip>
                </div>
              }
            />
            <Tab key={FrequencyEnum.Quarterly} title="Pay Quarterly" />
          </Tabs>
          <Spacer y={12} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tiers.map((tier) => (
              <Card key={tier.key} className="relative p-3" shadow="md">
                {tier.mostPopular ? (
                  <Chip
                    classNames={{
                      base: "absolute top-4 right-4",
                      content:
                        "font-medium text-primary-500 dark:text-primary-600",
                    }}
                    color="primary"
                    variant="flat"
                  >
                    Most Popular
                  </Chip>
                ) : null}
                <CardHeader className="flex flex-col items-start gap-2 pb-6">
                  <h2 className="text-large font-medium">{tier.title}</h2>
                  <p className="text-medium text-default-500">
                    {tier.description}
                  </p>
                </CardHeader>
                <Divider />
                <CardBody className="gap-8">
                  <p className="flex items-baseline gap-1 pt-2">
                    <span className="inline bg-gradient-to-br from-foreground to-foreground-600 bg-clip-text text-4xl font-semibold leading-7 tracking-tight text-transparent">
                      {typeof tier.price === "string"
                        ? tier.price
                        : tier.price[selectedFrequency.key]}
                    </span>
                    {typeof tier.price !== "string" ? (
                      <span className="text-small font-medium text-default-400">
                        {tier.priceSuffix
                          ? `/${tier.priceSuffix}/${selectedFrequency.priceSuffix}`
                          : `/${selectedFrequency.priceSuffix}`}
                      </span>
                    ) : null}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {tier.features?.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Icon
                          className="text-primary"
                          icon="ci:check"
                          width={24}
                        />
                        <p className="text-default-500">{feature}</p>
                      </li>
                    ))}
                  </ul>
                </CardBody>
                <CardFooter>
                  <Button
                    fullWidth
                    as={Link}
                    color={tier.buttonColor}
                    href={tier.href}
                    variant={tier.buttonVariant}
                  >
                    {tier.buttonText}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
          <Spacer y={12} />
          <div className="flex py-2">
            <FAQ></FAQ>
          </div>
        </div>
      </div>

      <Footer></Footer>
    </>
  );
}
