"use client"



import { Button, Card, CardBody, CardFooter, CardHeader, Input } from "@heroui/react";
import Footer from "../components/footer";
import Header from "../components/header";
import {DatePicker} from "@heroui/react";
import React from "react";

export default function Profile() {
  return (
    <>
    <Header></Header>
    <main className="flex min-h-screen bg-white dark:bg-black flex-col items-center justify-center p-4 md:p-24">
      <div className="w-full max-w-md">
        <Card shadow="none" className="w-full dark:bg-black bg-white">
        <CardHeader className="flex flex-col items-center">
           <h1 className="text-3xl font-bold text-center my-4">Tell Us About You</h1>
        </CardHeader>
        <CardBody>
          <Input
              isRequired
              label="Full Name"
              name="fullName"
              placeholder="Enter your full name"
              type="text"
              variant="underlined"
            />
            <DatePicker isRequired variant="underlined" className="mt-4" label="Birth Date" />
        </CardBody>
        <CardFooter className="flex justify-center flex-col text-center text-sm text-muted-foreground">
          <Button className="w-full my-2" color="primary" type="submit">
              Continue
            </Button>
          <p className="mb-2">IMAI Creating Newness.</p>
        </CardFooter>
    </Card>
      </div>
    </main>
    <Footer></Footer>
    </>
  );
}









