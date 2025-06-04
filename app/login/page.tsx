"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {Spinner} from "@heroui/react";
import {Button, Input, Link, Divider, User, Checkbox, Form} from "@heroui/react";
import {Icon} from "@iconify/react";
import {IMAIIcon} from "@/app/components/imai";
import { auth } from "@/lib/firebase";
import {
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
} from "firebase/auth";

export default function Login() {
  const [isVisible, setIsVisible] = React.useState(false);
  const toggleVisibility = () => setIsVisible(!isVisible);
  const [isLoading, setIsLoading] = useState(false); 
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(false);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/");
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const handlePhoneRedirect = () => {
  router.push("/phone");
  };

  const handleGoogleSignIn = async () => {
  setIsLoading(false);
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
    router.push("/"); // redirect if needed
  } catch (err: any) {
    setError(err.message);
    setIsLoading(false);
  }
};

const handleAppleSignIn = async () => {
  setIsLoading(true);
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");

  try {
    await signInWithPopup(auth, provider);
    router.push("/");
  } catch (err: any) {
    setError(err.message);
    setIsLoading(false);
  }
};

  return (
    <div className="relative flex h-full min-h-screen w-full">
      {/* Background Image */}
      {/* Login Form */}
      <div className="flex w-full items-center justify-center bg-background lg:w-1/2">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 p-4">
          {/* Brand Logo */}
          <div className="w-full text-center flex flex-col items-center justify-center">
            <div className="flex items-center">
              <IMAIIcon size={32} />
            </div>
            <p className="pb-2 text-xl font-medium">Welcome Back</p>
          </div>
            <Form
            className="flex w-full flex-col gap-3"
            validationBehavior="native"
            onSubmit={handleLogin}
          >
            <Input
              isRequired
              label="Email Address"
              name="email"
              placeholder="Enter your email"
              type="email"
              variant="underlined"
              isDisabled={isLoading}
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
              placeholder="Enter your password"
              type={isVisible ? "text" : "password"}
              variant="underlined"
              isDisabled={isLoading}
            />
            <div className="flex w-full items-center justify-between px-1 py-2">
              <Checkbox defaultSelected name="remember" size="sm">
                Remember me
              </Checkbox>
              <Link className="text-blue-500" href="#" size="sm">
                Forgot password?
              </Link>
            </div>
            <Button className="w-full" color="primary" type="submit" isDisabled={isLoading}>
                {isLoading ? <Spinner size="sm" color="white" /> : " Log In"}
            </Button>
          </Form>

          <div className="flex w-full items-center gap-4 py-2">
            <Divider className="flex-1" />
            <p className="shrink-0 text-tiny text-default-500">OR</p>
            <Divider className="flex-1" />
          </div>


            <div className="flex w-full flex-col gap-2">
            {/* <Button
              startContent={<Icon icon="solar:phone-bold" width={22} />}
              variant="bordered"
              onPress={handlePhoneRedirect}
            >
              Continue with Phone
            </Button> */}
            <Button
              startContent={<Icon className="text-default-500" icon="logos:google-icon" width={18} />}
              variant="bordered"
              onPress={handleGoogleSignIn}
            >
              Continue with Google
            </Button>
            <Button
              startContent={<Icon className="text-default-500 dark:invert" icon="logos:apple" width={18} />}
              variant="bordered"
              onPress={handleAppleSignIn}
            >
              Continue with Apple
            </Button>
          </div>
          <p className="text-center text-small">
            Need to create an account?&nbsp;
            <Link className="text-blue-500" href="/signup" size="sm">
              Sign Up
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden w-1/2 flex-col-reverse rounded-tl-medium rounded-bl-medium rounded-tr-none rounded-br-none p-10 shadow-small lg:flex overflow-hidden">
              {/* Background video */}
              <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover z-0"
              >
                <source src="/videos/Login_Intro.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
      
              {/* Overlay content */}
              <div className="relative z-10 flex flex-col items-end gap-4">
                <User
                  avatarProps={{
                    src: "https://ca.slack-edge.com/T08P88BGAU9-U08P88BGZMF-284e46963f86-512",
                  }}
                  classNames={{
                    base: "flex flex-row-reverse",
                    name: "w-full text-right text-white",
                    description: "text-white/60",
                  }}
                  description="Founder & CEO at IMAI"
                  name="Mayank Garg"
                />
                <p className="w-full text-right text-2xl text-white/60">
                  <span className="font-medium">“</span>
                  <span className="font-normal italic">
                   Where thoughts become pixels, and visions come to life.
                  </span>
                  <span className="font-medium">”</span>
                </p>
              </div>
      </div>
    </div>
  );
}
