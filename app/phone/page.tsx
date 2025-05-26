"use client";
import { useState } from "react";
import { CountryDropdown } from "../components/country-dropdown";
import Header from "../components/header";
import Footer from "../components/footer";
import { Button, Form, Input, Link } from "@heroui/react";

export default function Phone() {
  const [selectedAlpha3, setSelectedAlpha3] = useState("USA");
  return (
    <>
    <Header></Header>
    {/* <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div className="w-1/4 bg-white dark:bg-black">
        <CountryDropdown
          placeholder="Select country"
          defaultValue={selectedAlpha3}
          onChange={(country) => {
            console.log("Selected country:", country);
            setSelectedAlpha3(country.alpha3);
          }}
        />
      </div>
    </div> */}
      <div className="flex items-center justify-center w-full min-h-screen">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 p-4">
          {/* Brand Logo */}
          <div className="w-full text-center flex flex-col items-center justify-center">
            <p className="pb-2 text-xl font-medium">Welcome Back</p>
          </div>
            <Form
            className="flex w-full flex-col gap-3"
            validationBehavior="native"
            
          >
            <Input
              isRequired
              label="Email Address"
              name="email"
              placeholder="Enter your email"
              type="email"
              variant="underlined"
            />

            
            <Button className="w-full" color="primary" type="submit">
              Send OTP
            </Button>
          </Form>
          
          <p className="text-center text-small">
            Already Have An Account?&nbsp;
            <Link className="text-blue-500" href="/Login" size="sm">
              Login In
            </Link>
          </p>
        </div>
      </div>
    <Footer></Footer>
    </>
  );
}
