"use client";
import { useState } from "react";
import { CountryDropdown } from "../components/country-dropdown";
import Header from "../components/header";
import Footer from "../components/footer";

export default function Phone() {
  const [selectedAlpha3, setSelectedAlpha3] = useState("USA");
  return (
    <>
    <Header></Header>
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
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
    </div>
    <Footer></Footer>
    </>
  );
}
