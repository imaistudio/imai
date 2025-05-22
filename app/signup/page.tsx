"use client";

import React from "react";
import {Button, Input, Link, Divider, User, Checkbox} from "@heroui/react";
import {Icon} from "@iconify/react";
import {IMAIIcon} from "@/app/components/imai";

export default function Signup() {
  const [isVisible, setIsVisible] = React.useState(false);
  const toggleVisibility = () => setIsVisible(!isVisible);

  return (
    <div className="relative flex h-full min-h-screen w-full">
  

      {/* Sign Up Form */}
      <div className="flex w-full items-center justify-center bg-background lg:w-1/2">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 p-4">
          <div className="w-full text-center flex flex-col items-center justify-center">
              <div className="flex items-center">
                <IMAIIcon size={32} />
              </div>
            <p className="pb-2 text-xl font-medium">Create Account</p>
      
          </div>
         
        
        <form className="flex w-full flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
            <Input
              isRequired
              label="Email Address"
              name="email"
              placeholder="Enter your email"
              type="email"
              variant="underlined"
            />
            <Input
              isRequired
              endContent={
                <button type="button" onClick={toggleVisibility}>
                  {isVisible ? (
                    <Icon
                      className="pointer-events-none text-2xl text-default-400"
                      icon="solar:eye-closed-linear"
                    />
                  ) : (
                    <Icon
                      className="pointer-events-none text-2xl text-default-400"
                      icon="solar:eye-bold"
                    />
                  )}
                </button>
              }
              label="Password"
              name="password"
              placeholder="Create a password"
              type={isVisible ? "text" : "password"}
              variant="underlined"
            />
            <Checkbox isRequired className="py-4" size="sm">
              I agree with the&nbsp;
              <Link className="relative z-[1] dark:text-purple-600 text-blue-500" href="/terms" size="sm">
                Terms
              </Link>
              &nbsp; and&nbsp;
              <Link className="relative z-[1] dark:text-purple-600 text-blue-500" href="/privacy" size="sm">
                Privacy Policy
              </Link>
            </Checkbox>
            <Button color="primary" type="submit">
              Sign Up
            </Button>
          </form>

          <div className="flex w-full items-center gap-4 py-2">
            <Divider className="flex-1" />
            <p className="shrink-0 text-tiny text-default-500">OR</p>
            <Divider className="flex-1" />
          </div>

            <div className="flex w-full flex-col gap-2">
            <Button
              startContent={<Icon className="text-default-500" icon="solar:phone-bold" width={22}  />}
              variant="bordered"
            >
              Sign Up with Phone
            </Button>
    
            <Button
              startContent={<Icon icon="logos:google-icon" width={18} />}
              variant="bordered"
            >
              Sign Up with Google
            </Button>
            <Button
              startContent={<Icon className="text-default-500 dark:invert" icon="logos:apple" width={18}  />}
              variant="bordered"
            >
              Sign Up with Apple
            </Button>
          </div>

      

          <p className="text-center text-small">
            Already have an account?&nbsp;
            <Link className="text-blue-500 dark:text-purple-600" href="/login" size="sm">
              Log In
            </Link>
          </p>
        </div>
      </div>

    

      <div className="relative hidden w-1/2 flex-col-reverse rounded-medium p-10 shadow-small lg:flex overflow-hidden">
        {/* Background video */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover z-0"
        >
          <source src="/videos/Signup_Intro.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>

        {/* Overlay content */}
        <div className="relative z-10 flex flex-col items-end gap-4">
          <User
            avatarProps={{
              src: "https://ca.slack-edge.com/T08P88BGAU9-U08NUGVDXQD-efea55cbd792-512",
            }}
            classNames={{
              base: "flex flex-row-reverse",
              name: "w-full text-right text-white",
              description: "text-white/60",
            }}
            description="Founder & CEO at IMAI"
            name="Viola Schritter"
          />
          <p className="w-full text-right text-2xl text-white/60">
            <span className="font-medium">“</span>
            <span className="font-normal italic">
              Dream beyond reality — where imagination paints the impossible.
            </span>
            <span className="font-medium">”</span>
          </p>
        </div>
      </div>
    </div>
  );
}
