"use client";
import React, { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Input,
} from "@heroui/react";
import { DatePicker } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { firestore } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import Footer from "../components/footer";
import Header from "../components/header";
import { CalendarDate } from "@internationalized/date";
import { Spinner } from "@heroui/react";

export default function Profile() {
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [dob, setDob] = useState<CalendarDate | null>(null);
  const [error, setError] = useState("");
  const [isUpdate, setIsUpdate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch profile data without authentication check
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        if (currentUser) {
          const userRef = doc(firestore, "profiles", currentUser.uid);
          const snapshot = await getDoc(userRef);

          if (snapshot.exists()) {
            const data = snapshot.data();
            setName(data.name || "");
            // Convert ISO string back to CalendarDate
            if (data.dob) {
              const date = new Date(data.dob);
              setDob(
                new CalendarDate(
                  date.getFullYear(),
                  date.getMonth() + 1,
                  date.getDate(),
                ),
              );
            }
            setIsUpdate(true);
          }
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        // Don't show error for non-existent documents on first visit
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [currentUser]);

  const handleSubmit = async () => {
    if (!currentUser) {
      router.push("/signup");
      return;
    }

    if (!name || !dob) {
      setError("All fields are required.");
      return;
    }

    const dobDate = new Date(dob.year, dob.month - 1, dob.day);
    const today = new Date();
    const age = today.getFullYear() - dobDate.getFullYear();
    const monthDiff = today.getMonth() - dobDate.getMonth();
    const dayDiff = today.getDate() - dobDate.getDate();
    const isUnder18 =
      age < 18 ||
      (age === 18 && (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)));

    if (isUnder18) {
      setError("You must be at least 18 years old.");
      return;
    }

    setIsLoading(true); // Start loading

    try {
      const userRef = doc(firestore, "profiles", currentUser.uid);
      await setDoc(userRef, {
        name,
        dob: dobDate.toISOString(),
      });

      setError("");
      if (!isUpdate) {
        router.push("/");
      } else {
        router.push("/");
      }
    } catch (err) {
      console.error("Error saving profile:", err);
      setError("Failed to save profile.");
    } finally {
      setIsLoading(false); // Stop loading
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
          <video
            className="w-50 h-50"
            src="spinners/profile_loading.webm"
            autoPlay
            loop
            muted
            playsInline
          />
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="flex min-h-screen bg-white dark:bg-black flex-col items-center justify-center p-4 md:p-24">
        <div className="w-full max-w-md">
          <Card shadow="none" className="w-full dark:bg-black bg-white">
            <CardHeader className="flex flex-col items-center">
              <h1 className="text-3xl font-bold text-center my-4">
                Tell Us About You
              </h1>
            </CardHeader>
            <CardBody>
              <Input
                isRequired
                label="Full Name"
                name="name"
                placeholder="Enter your full name"
                type="text"
                variant="underlined"
                value={name}
                isDisabled={isLoading}
                onChange={(e) => setName(e.target.value)}
              />
              <DatePicker
                isRequired
                variant="underlined"
                className="mt-4"
                label="Birth Date"
                value={dob}
                isDisabled={isLoading}
                onChange={(date) => setDob(date)}
              />
              {error && <p className="text-red-500 mt-2">{error}</p>}
            </CardBody>
            <CardFooter className="flex justify-center flex-col text-center text-sm text-muted-foreground">
              <Button
                className="w-full my-2"
                color="primary"
                onPress={handleSubmit}
                isDisabled={isLoading}
              >
                {isLoading ? (
                  <Spinner size="sm" color="white" />
                ) : isUpdate ? (
                  "Update Profile"
                ) : (
                  "Continue"
                )}
              </Button>
              <p className="mb-2">IMAI Creating Newness.</p>
            </CardFooter>
          </Card>
        </div>
      </main>
      <Footer />
    </>
  );
}
