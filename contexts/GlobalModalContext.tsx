"use client";
import { createContext, useContext, useState, ReactNode } from "react";

type GlobalModalContextType = {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
};

const GlobalModalContext = createContext<GlobalModalContextType | undefined>(
  undefined,
);

export const GlobalModalProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <GlobalModalContext.Provider
      value={{
        isOpen,
        openModal: () => setIsOpen(true),
        closeModal: () => setIsOpen(false),
      }}
    >
      {children}
    </GlobalModalContext.Provider>
  );
};

export const useGlobalModal = () => {
  const context = useContext(GlobalModalContext);
  if (!context) throw new Error("Must be used within GlobalModalProvider");
  return context;
};
