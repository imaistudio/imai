"use client"



import { Button, Card, CardBody, CardFooter, CardHeader, Input } from "@heroui/react";
import Footer from "../components/footer";
import Header from "../components/header";
import {DatePicker} from "@heroui/react";
import MinimalRowSteps from "../components/minimal-row-steps";
import React from "react";
const STEPS_COUNT = 2;

export default function Profile() {
  const [currentStep, setCurrentStep] = React.useState(1);
  return (
    <>
    <Header></Header>
    <main className="flex min-h-screen bg-black flex-col items-center justify-center p-4 md:p-24">
      <div className="w-full max-w-md">
        <Card className="w-full bg-black">
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
            <DatePicker  variant="underlined" className="mt-4" label="Birth Date" />
        </CardBody>
        <CardFooter className="flex justify-center flex-col text-center text-sm text-muted-foreground">
          <MinimalRowSteps
            currentStep={currentStep}
            label={`Step ${currentStep} of ${STEPS_COUNT}`}
            stepsCount={STEPS_COUNT}
            onStepChange={setCurrentStep}
          />
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