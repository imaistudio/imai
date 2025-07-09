"use client";

import { useState } from "react";
import {
  Button,
  Input,
  User,
  Badge,
  Checkbox,
  Link as HeroLink,
  Form,
  Spinner,
} from "@heroui/react";
import { CheckCircle, Loader2, Sparkles } from "lucide-react";
import { IMAIIcon } from "@/app/components/imai";
import { useRouter } from "next/navigation";

export default function InvitePage() {
  const router = useRouter();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      await fetch("/api/invite", {
        method: "POST",
        body: formData,
      });
      setIsSubmitted(true);
    } catch (err: any) {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-screen w-full">
      {/* Invite Form */}
      <div className="flex w-full items-center justify-center bg-background lg:w-1/2">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 p-4">
          {/* Brand Logo */}
          <div className="w-full text-center flex flex-col items-center justify-center">
            <div className="flex items-center">
              <IMAIIcon size={32} />
            </div>
            <p className="pb-2 text-xl font-medium">Join the Future</p>
            <p className="text-sm text-default-500">
              Get early access to our AI platform
            </p>
          </div>

          {isSubmitted ? (
            <div className="flex w-full flex-col items-center text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
                <CheckCircle className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                Application Submitted!
              </h3>
              <p className="text-default-500 mb-4 text-sm">
                We'll review your application and email your login credentials
                soon.
              </p>
              <Badge variant="flat" color="primary">
                <Sparkles className="w-3 h-3 mr-1" />
                You're in the queue!
              </Badge>
            </div>
          ) : (
            <Form
              className="flex w-full flex-col gap-3"
              validationBehavior="native"
              onSubmit={handleSubmit}
            >
              {error && (
                <div className="text-red-500 text-sm text-center">{error}</div>
              )}

              <Input
                isRequired
                label="First Name"
                name="firstName"
                placeholder="Enter your first name"
                type="text"
                variant="underlined"
                isDisabled={isLoading}
              />

              <Input
                isRequired
                label="Last Name"
                name="lastName"
                placeholder="Enter your last name"
                type="text"
                variant="underlined"
                isDisabled={isLoading}
              />

              <Input
                isRequired
                label="Email Address"
                name="email"
                placeholder="Enter your email"
                type="email"
                variant="underlined"
                isDisabled={isLoading}
              />

              <div className="flex w-full items-center justify-start px-1 py-2">
                <Checkbox
                  isRequired
                  name="terms"
                  size="sm"
                  isDisabled={isLoading}
                >
                  I agree to the{" "}
                  <HeroLink href="/terms" size="sm" className="text-blue-500">
                    Terms
                  </HeroLink>{" "}
                  and{" "}
                  <HeroLink href="/privacy" size="sm" className="text-blue-500">
                    Privacy Policy
                  </HeroLink>
                </Checkbox>
              </div>

              <Button
                className="w-full"
                color="primary"
                type="submit"
                isDisabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Spinner size="sm" color="white" />
                    <span className="ml-2">Submitting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Submit Application
                  </>
                )}
              </Button>
            </Form>
          )}

          <div className="flex w-full flex-col gap-2">
            <p className="text-center text-small">
              Already have an account?{" "}
              <HeroLink className="text-blue-500" href="/login" size="sm">
                Log In
              </HeroLink>
            </p>
          </div>
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
              Where thoughts become pixels, and visions come to life.
            </span>
            <span className="font-medium">”</span>
          </p>
        </div>
      </div>
    </div>
  );
}
