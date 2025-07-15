import Footer from "../components/footer";
import Header from "../components/header";
import MobileNavRest from "@/app/components/MobileNavRest";

export default function Dashboard() {
  return (
    <>
      <Header></Header>
      <MobileNavRest />
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-black">
        <h1 className="text-black dark:text-white">Dashboard Page</h1>
      </div>
      <Footer></Footer>
    </>
  );
}
