import Footer from "../components/footer";
import Header from "../components/header";
import MobileNavRest from "@/app/components/MobileNavRest";

export default function Billing() {
  return (
    <>
      <Header></Header>
      <MobileNavRest />
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <h1>Billing Page</h1>
      </div>
      <Footer></Footer>
    </>
  );
}
