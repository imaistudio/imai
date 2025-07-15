"use client";

import React from "react";
import { Accordion, AccordionItem } from "@heroui/react";
import { Icon } from "@iconify/react";
import faqs from "@/types/faq";

export default function FAQ() {
  return (
    <section className="mx-auto w-full max-w-6xl  sm:px-6  lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 lg:flex-row lg:items-start lg:gap-12">
        <>
          <h2 className="inline-block lg:hidden text-2xl ">FAQs</h2>
          <h2 className="hidden text-black dark:text-white pt-4 text-5xl font-semibold tracking-tight lg:inline-block">
            Frequently
            <br />
            asked
            <br />
            questions
          </h2>
        </>
        <Accordion
          fullWidth
          keepContentMounted
          className="gap-3"
          itemClasses={{
            base: "px-0 sm:px-6",
            title: "font-medium",
            trigger: "py-6 flex-row-reverse",
            content: "pt-0 pb-6 text-base text-default-500",
          }}
          items={faqs}
          selectionMode="multiple"
        >
          {faqs.map((item, i) => (
            <AccordionItem
              key={i}
              indicator={
                <Icon icon="lucide:plus" className="text-blue-500" width={24} />
              }
              title={item.title}
            >
              {item.content}
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
