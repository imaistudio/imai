"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {Badge} from "@heroui/react";
import { CheckCircle, Loader2, Sparkles } from "lucide-react"
import {Textarea} from "@heroui/input";
import {Select, SelectItem} from "@heroui/select";
import Footer from "../components/footer";
import Header from "../components/header";

async function submitInviteRequest(formData: FormData) {
  // Debug: Log form data being sent
  console.log('Sending form data:', {
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    company: formData.get('company'),
    role: formData.get('role'),
    website: formData.get('website'),
    useCase: formData.get('useCase'),
    experience: formData.get('experience'),
    referral: formData.get('referral'),
  });

  const response = await fetch('/api/invite', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to submit invite request');
  }

  return await response.json();
}

export default function InvitePage() {
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setError(null)
    try {
      await submitInviteRequest(formData)
      setIsSubmitted(true)
    } catch (error) {
      console.error("Error submitting form:", error)
      setError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
    <Header></Header>
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-black dark:text-white mb-4">
              Join the Future of AI Image Generation
            </h1>
            <p className="text-xl text-black dark:text-white mb-2">
              Get early access to our revolutionary AI platform
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              We're carefully selecting our first users. Tell us about yourself and we'll review your application.
            </p>
          </div>

          {/* Form or Success State */}
          {isSubmitted ? (
            <Card className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
              <CardContent className="pt-12 pb-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-full mb-6">
                  <CheckCircle className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-2xl font-semibold text-black dark:text-white mb-4">Application Submitted!</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                  Thank you for your interest! We'll review your application and get back to you within 2-3 business
                  days with your login details.
                </p>
                <Badge
                  variant="flat"
                  className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 text-blue-600"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  You're in the queue!
                </Badge>
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
              <CardHeader className="pb-6">
                <CardTitle className="text-2xl text-black dark:text-white">Request Early Access</CardTitle>
                <CardDescription className="text-gray-600 dark:text-gray-400">
                  Fill out the form below to join our exclusive beta program
                </CardDescription>
              </CardHeader>
              <CardContent>
                {error && (
                  <div className="mb-6 p-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}
                <form action={handleSubmit} className="space-y-6">
                  {/* Personal Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-black dark:text-white">First Name *</Label>
                      <Input
                        id="firstName"
                        name="firstName"
                        placeholder="John"
                        required
                        className="bg-white dark:bg-black border-gray-200 dark:border-gray-800 text-black dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-black dark:text-white">Last Name *</Label>
                      <Input
                        id="lastName"
                        name="lastName"
                        placeholder="Doe"
                        required
                        className="bg-white dark:bg-black border-gray-200 dark:border-gray-800 text-black dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-black dark:text-white">Email Address *</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="john@example.com"
                      required
                      className="bg-white dark:bg-black border-gray-200 dark:border-gray-800 text-black dark:text-white"
                    />
                  </div>

                  {/* Professional Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="company" className="text-black dark:text-white">Company/Organization</Label>
                      <Input
                        id="company"
                        name="company"
                        placeholder="Acme Inc."
                        className="bg-white dark:bg-black border-gray-200 dark:border-gray-800 text-black dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role" className="text-black dark:text-white">Your Role</Label>
                      <Select 
                        name="role"
                        placeholder="Select your role"
                        className="bg-white dark:bg-black border-gray-200 dark:border-gray-800 text-black dark:text-white"
                      >
                        <SelectItem key="designer">Designer</SelectItem>
                        <SelectItem key="developer">Developer</SelectItem>
                        <SelectItem key="marketer">Marketer</SelectItem>
                        <SelectItem key="content-creator">Content Creator</SelectItem>
                        <SelectItem key="entrepreneur">Entrepreneur</SelectItem>
                        <SelectItem key="student">Student</SelectItem>
                        <SelectItem key="other">Other</SelectItem>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website" className="text-black dark:text-white">Website/Portfolio (Optional)</Label>
                    <Input
                      id="website"
                      name="website"
                      type="url"
                      placeholder="https://yourwebsite.com"
                      className="bg-white dark:bg-black border-gray-200 dark:border-gray-800 text-black dark:text-white"
                    />
                  </div>

                  {/* Use Case */}
                  <div className="space-y-2">
                    <Label htmlFor="useCase" className="text-black dark:text-white">How do you plan to use our AI image generation platform? *</Label>
                    <Textarea
                      id="useCase"
                      name="useCase"
                      placeholder="Tell us about your specific use case, projects, or goals..."
                      required
                      className="min-h-[100px] bg-white dark:bg-black border-gray-200 dark:border-gray-800 text-black dark:text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="experience" className="text-black dark:text-white">Experience with AI Tools</Label>
                    <Select 
                      name="experience"
                      placeholder="Select your experience level"
                      className="bg-white dark:bg-black border-gray-200 dark:border-gray-800 text-black dark:text-white"
                    >
                      <SelectItem key="beginner">Beginner - New to AI tools</SelectItem>
                      <SelectItem key="intermediate">Intermediate - Some experience</SelectItem>
                      <SelectItem key="advanced">Advanced - Extensive experience</SelectItem>
                      <SelectItem key="expert">Expert - Professional AI user</SelectItem>
                    </Select>
                  </div>

                  {/* Additional Information */}
                  <div className="space-y-2">
                    <Label htmlFor="referral" className="text-black dark:text-white">How did you hear about us?</Label>
                    <Select 
                      name="referral"
                      placeholder="Select source"
                      className="bg-white dark:bg-black border-gray-200 dark:border-gray-800 text-black dark:text-white"
                    >
                      <SelectItem key="social-media">Social Media</SelectItem>
                      <SelectItem key="search-engine">Search Engine</SelectItem>
                      <SelectItem key="friend-referral">Friend/Colleague</SelectItem>
                      <SelectItem key="blog-article">Blog/Article</SelectItem>
                      <SelectItem key="newsletter">Newsletter</SelectItem>
                      <SelectItem key="other">Other</SelectItem>
                    </Select>
                  </div>



                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 border-0 font-medium py-3 h-auto"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting Application...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Submit Application
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="text-center mt-12 pt-8  ">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Questions? Contact us at{" "}
              <a href="mailto:contact@imai.studio" className="text-blue-600 hover:underline">
                contact@imai.studio
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
    <Footer></Footer>
    </>
  )
}
